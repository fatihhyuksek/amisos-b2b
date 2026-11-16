// Bayi başvurusu ve Admin bayi yönetimi.
// GR-BAYI-001…008, GR-KVK-001, GR-YON-001; K-02 – K-08, K-12, K-35, K-43, K-45, K-51.
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  ilike,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { Cron } from '@nestjs/schedule';
import { CONSENT_DOCUMENT_VERSION } from '../common/consents.js';
import {
  runExclusive,
  LOCK_STALE_APPLICATIONS,
  type Tx,
} from '../common/advisory-lock.js';
import {
  BUSINESS_TIME_ZONE,
  countApprovalUrgency,
} from '../common/business-days.js';
import { EMAIL_VERIFICATION_TTL_MS } from '../auth/auth.constants.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { companyTitleKey } from './company-title.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import { isBusinessDaysOverdue } from '../common/business-days.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { escapeLike } from '../common/like.js';
import { isUniqueViolation, violatedConstraint } from '../common/pg-errors.js';
import { DB, type Database } from '../database/database.module.js';
import {
  adminUsers,
  auditLog,
  authTokens,
  consents,
  dealerGroupDiscounts,
  dealerNotes,
  dealers,
  productGroups,
} from '../database/schema.js';
import type {
  ApplicationInput,
  DealerFieldsInput,
  ListQuery,
  UpdateDealerInput,
} from './dealers.schemas.js';

type DealerRow = typeof dealers.$inferSelect;
type DealerStatus = DealerRow['status'];

export interface DealerSummary {
  id: string;
  companyTitle: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  district: string;
  status: DealerStatus;
  source: DealerRow['source'];
  hasPassword: boolean;
  generalDiscountPercent: string | null;
  createdAt: string;
  reviewedAt: string | null;
  lastLoginAt: string | null;
  approvalOverdue: boolean;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export { escapeLike };

const TERMS_EDITABLE: DealerStatus[] = [
  'pending_approval',
  'active',
  'passive',
];

const duplicate = () =>
  new ConflictException({
    statusCode: 409,
    code: 'DUPLICATE_APPLICATION',
    message: 'Bu e-posta veya firma unvanıyla kayıt zaten var.',
  });
const invalidState = () =>
  new ConflictException({
    statusCode: 409,
    code: 'INVALID_STATE',
    message: 'Bu işlem bayinin mevcut durumunda yapılamaz.',
  });

@Injectable()
export class DealersService {
  private readonly logger = new Logger(DealersService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  // --- Başvuru (K-02, K-35) -------------------------------------------------

  /**
   * Başvuruyu pending_email olarak kaydeder, onayları aynı transaction'da yazar (GR-KVK-001) ve
   * doğrulama e-postasını arka planda gönderir. Tekrar kontrolü DB unique index'ine dayanır
   * (GR-BAYI-004/005; K-51: reddedilenler dışarıda) — eşzamanlı isteklerde de güvenlidir.
   */
  async apply(input: ApplicationInput): Promise<void> {
    let dealerId: string;
    try {
      dealerId = await this.db.transaction(async (tx) => {
        // 24 saatte doğrulanmamış eski başvurular e-posta/unvanı kilitlemesin (K-55).
        await this.purgeStalePending(tx, {
          email: input.email,
          titleKey: companyTitleKey(input.companyTitle),
        });
        const [dealer] = await tx
          .insert(dealers)
          .values({
            companyTitle: input.companyTitle,
            companyTitleKey: companyTitleKey(input.companyTitle),
            contactName: input.contactName,
            email: input.email,
            phone: input.phone,
            city: input.city,
            district: input.district,
            address: input.address,
            taxOffice: input.taxOffice ?? null,
            taxNumber: input.taxNumber ?? null,
            status: 'pending_email',
            source: 'application',
          })
          .returning({ id: dealers.id });
        await tx.insert(consents).values(
          (['kvkk', 'terms', 'marketing'] as const).map((type) => ({
            dealerId: dealer.id,
            type,
            documentVersion: CONSENT_DOCUMENT_VERSION,
            granted: input.consents[type] ?? false,
          })),
        );
        await this.audit.record(
          {
            actorType: 'system',
            action: 'dealer.applied',
            entityType: 'dealers',
            entityId: dealer.id,
          },
          tx,
        );
        return dealer.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate();
      throw error;
    }
    this.auth.queueEmailVerification(dealerId);
  }

  // --- Admin: oluşturma (K-02) ----------------------------------------------

  async createWithInvitation(
    input: DealerFieldsInput,
    adminId: string,
  ): Promise<DealerSummary> {
    let created: { row: DealerRow; outboxId: string };
    try {
      created = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(dealers)
          .values({
            ...input,
            companyTitleKey: companyTitleKey(input.companyTitle),
            status: 'active',
            source: 'invitation',
            reviewedAt: this.clock.now(),
            reviewedBy: adminId,
          })
          .returning();
        const link = await this.auth.issueInvitationLink(row.id, tx);
        await this.audit.record(
          {
            actorType: 'admin',
            actorId: adminId,
            action: 'dealer.created_by_invitation',
            entityType: 'dealers',
            entityId: row.id,
          },
          tx,
        );
        const outboxId = await this.auth.enqueueInvitation(row.email, link, tx);
        return { row, outboxId };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate();
      throw error;
    }
    this.notifications.dispatchSoon([created.outboxId]);
    return this.toSummary(created.row);
  }

  // --- Admin: bilgi düzenleme ve iç notlar (K-75) ---------------------------

  /** K-75: yalnızca değişen alanlar yazılır; tekillik ihlali DUPLICATE_EMAIL / DUPLICATE_COMPANY (409). */
  async update(id: string, input: UpdateDealerInput, adminId: string) {
    try {
      await this.db.transaction(async (tx) => {
        const [current] = await tx.select().from(dealers).where(eq(dealers.id, id)).for('update');
        if (!current) throw new NotFoundException('Bayi bulunamadı.');
        const set: Partial<typeof dealers.$inferInsert> = {};
        const changes: Record<string, { previous: unknown; next: unknown }> = {};
        for (const key of [
          'companyTitle',
          'contactName',
          'email',
          'phone',
          'city',
          'district',
          'address',
          'taxOffice',
          'taxNumber',
        ] as const) {
          const next = input[key];
          if (next === undefined || next === current[key]) continue;
          (set as Record<string, unknown>)[key] = next;
          changes[key] = { previous: current[key], next };
        }
        if (Object.keys(changes).length === 0) return;
        if (set.companyTitle) set.companyTitleKey = companyTitleKey(set.companyTitle);
        await tx.update(dealers).set(set).where(eq(dealers.id, id));
        await this.audit.record(
          {
            actorType: 'admin',
            actorId: adminId,
            action: 'dealer.updated',
            entityType: 'dealers',
            entityId: id,
            data: { changes },
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const duplicateEmail = violatedConstraint(error) === 'dealers_email_uq';
        throw new ConflictException({
          statusCode: 409,
          code: duplicateEmail ? 'DUPLICATE_EMAIL' : 'DUPLICATE_COMPANY',
          message: duplicateEmail
            ? 'Bu e-posta başka bir bayide kullanılıyor.'
            : 'Bu firma unvanı başka bir bayide kullanılıyor.',
        });
      }
      throw error;
    }
    return this.detail(id);
  }

  async listNotes(dealerId: string) {
    await this.getOrThrow(dealerId);
    const rows = await this.db
      .select({
        id: dealerNotes.id,
        body: dealerNotes.body,
        createdAt: dealerNotes.createdAt,
        adminId: dealerNotes.createdBy,
        adminName: adminUsers.fullName,
      })
      .from(dealerNotes)
      .innerJoin(adminUsers, eq(adminUsers.id, dealerNotes.createdBy))
      .where(eq(dealerNotes.dealerId, dealerId))
      .orderBy(desc(dealerNotes.createdAt), desc(dealerNotes.id));
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      createdBy: { id: r.adminId, fullName: r.adminName },
    }));
  }

  async addNote(dealerId: string, body: string, adminId: string) {
    await this.getOrThrow(dealerId);
    const noteId = await this.db.transaction(async (tx) => {
      const [row] = await tx.insert(dealerNotes).values({ dealerId, body, createdBy: adminId }).returning();
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'dealer.note_added',
          entityType: 'dealers',
          entityId: dealerId,
          data: { noteId: row.id },
        },
        tx,
      );
      return row.id;
    });
    return (await this.listNotes(dealerId)).find((n) => n.id === noteId);
  }

  async deleteNote(dealerId: string, noteId: string, adminId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .delete(dealerNotes)
        .where(and(eq(dealerNotes.id, noteId), eq(dealerNotes.dealerId, dealerId)))
        .returning({ id: dealerNotes.id });
      if (!row) throw new NotFoundException('Not bulunamadı.');
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'dealer.note_deleted',
          entityType: 'dealers',
          entityId: dealerId,
          data: { noteId },
        },
        tx,
      );
    });
  }

  // --- Admin: listeleme -----------------------------------------------------

  async list(query: ListQuery) {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(dealers.status, query.status));
    if (query.q) {
      const pattern = `%${escapeLike(query.q)}%`;
      const search = or(
        ilike(dealers.companyTitle, pattern),
        ilike(dealers.contactName, pattern),
        ilike(dealers.email, pattern),
      );
      if (search) filters.push(search);
    }
    const where = filters.length ? and(...filters) : undefined;

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(dealers)
      .where(where);
    const rows = await this.db
      .select()
      .from(dealers)
      .where(where)
      .orderBy(
        sql`case when ${dealers.status} = 'pending_approval' then 0 else 1 end`,
        desc(dealers.createdAt),
        desc(dealers.id),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: rows.map((r) => this.toSummary(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async summary() {
    const counts = await this.db
      .select({ status: dealers.status, n: sql<number>`count(*)::int` })
      .from(dealers)
      .groupBy(dealers.status);
    const of = (s: DealerStatus) => counts.find((c) => c.status === s)?.n ?? 0;
    return {
      pendingApproval: of('pending_approval'),
      overdue: await this.countOverdue(this.clock.now()),
      pendingEmail: of('pending_email'),
      active: of('active'),
      passive: of('passive'),
    };
  }

  /** K-04: onay bekleyen başvurularda yaklaşan (1 iş günü geçti) ve gecikmiş (2 iş günü aşıldı) sayıları. */
  async approvalUrgencyCounts(
    now: Date,
  ): Promise<{ dueSoon: number; overdue: number }> {
    const rows = await this.db
      .select({ verifiedAt: dealers.emailVerifiedAt })
      .from(dealers)
      .where(eq(dealers.status, 'pending_approval'));
    return countApprovalUrgency(
      rows.flatMap((r) => (r.verifiedAt ? [r.verifiedAt] : [])),
      now,
    );
  }

  async countOverdue(now: Date): Promise<number> {
    return (await this.approvalUrgencyCounts(now)).overdue;
  }

  async detail(id: string) {
    const dealer = await this.getOrThrow(id);
    const consentRows = await this.db
      .select()
      .from(consents)
      .where(eq(consents.dealerId, id))
      .orderBy(consents.createdAt, consents.id);
    const history = await this.db
      .select({
        action: auditLog.action,
        reason: auditLog.reason,
        actorType: auditLog.actorType,
        adminName: adminUsers.fullName,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(adminUsers, eq(adminUsers.id, auditLog.actorId))
      .where(and(eq(auditLog.entityType, 'dealers'), eq(auditLog.entityId, id)))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id));
    return {
      ...this.toSummary(dealer),
      address: dealer.address,
      taxOffice: dealer.taxOffice,
      taxNumber: dealer.taxNumber,
      emailVerifiedAt: iso(dealer.emailVerifiedAt),
      rejectionReason: dealer.rejectionReason,
      consents: consentRows.map((c) => ({
        type: c.type,
        granted: c.granted,
        documentVersion: c.documentVersion,
        createdAt: c.createdAt.toISOString(),
      })),
      history: history.map((h) => ({
        action: h.action,
        reason: h.reason,
        actor:
          h.actorType === 'admin'
            ? (h.adminName ?? 'Admin')
            : h.actorType === 'dealer'
              ? 'Bayi'
              : 'Sistem',
        createdAt: h.createdAt.toISOString(),
      })),
    };
  }

  // --- Admin: durum işlemleri (K-04, K-08, K-51) ----------------------------

  /** pending_approval -> active; davet token'ı aynı transaction'da üretilir, e-posta commit sonrası gider. */
  async approve(id: string, adminId: string): Promise<void> {
    let outboxId = '';
    await this.transition(id, adminId, {
      from: ['pending_approval'],
      to: 'active',
      action: 'dealer.approved',
      set: { reviewedAt: this.clock.now(), reviewedBy: adminId },
      afterUpdate: async (tx, dealer) => {
        const link = await this.auth.issueInvitationLink(id, tx);
        outboxId = await this.auth.enqueueInvitation(dealer.email, link, tx);
      },
    });
    this.notifications.dispatchSoon([outboxId]);
  }

  /**
   * pending_email | pending_approval -> rejected; gerekçe zorunlu ve iç nottur (K-51: yeniden başvuru
   * serbest). Adaya gerekçesiz bilgi e-postası gider.
   */
  async reject(id: string, adminId: string, reason: string): Promise<void> {
    let outboxId = '';
    await this.transition(id, adminId, {
      from: ['pending_email', 'pending_approval'],
      to: 'rejected',
      action: 'dealer.rejected',
      reason,
      set: {
        reviewedAt: this.clock.now(),
        reviewedBy: adminId,
        rejectionReason: reason,
      },
      // Gerekçe (iç not) e-postaya yazılmaz; payload boş.
      afterUpdate: async (tx, dealer) => {
        outboxId = await this.notifications.enqueue('rejection', dealer.email, {}, tx);
      },
    });
    this.notifications.dispatchSoon([outboxId]);
  }

  /** active -> passive; açık oturumlar silinir (K-08). */
  async deactivate(id: string, adminId: string, reason: string): Promise<void> {
    await this.transition(id, adminId, {
      from: ['active'],
      to: 'passive',
      action: 'dealer.deactivated',
      reason,
      afterUpdate: (tx) => this.sessions.destroyAllFor('dealer', id, tx),
    });
  }

  /** passive -> active (K-08). */
  async activate(id: string, adminId: string, reason?: string): Promise<void> {
    await this.transition(id, adminId, {
      from: ['passive'],
      to: 'active',
      action: 'dealer.activated',
      reason,
    });
  }

  /**
   * Aktif ve şifresi olmayan bayiye yeni davet; önceki davet geçersiz olur. Satır kilidi altında
   * token üretildiği için paralel isteklerde yalnızca en sonuncusu geçerli kalır.
   */
  async resendInvitation(id: string, adminId: string): Promise<void> {
    const outboxId = await this.db.transaction(async (tx) => {
      const [dealer] = await tx
        .select()
        .from(dealers)
        .where(eq(dealers.id, id))
        .for('update');
      if (!dealer) throw new NotFoundException('Bayi bulunamadı.');
      if (dealer.status !== 'active' || dealer.passwordHash)
        throw invalidState();
      const link = await this.auth.issueInvitationLink(id, tx);
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'dealer.invitation_resent',
          entityType: 'dealers',
          entityId: id,
        },
        tx,
      );
      return this.auth.enqueueInvitation(dealer.email, link, tx);
    });
    this.notifications.dispatchSoon([outboxId]);
  }

  /** K-12, K-43: genel iskonto oranı; önceki ve yeni değer audit_log'a yazılır. */
  async setGeneralDiscount(
    id: string,
    adminId: string,
    percent: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [dealer] = await tx
        .select({
          previous: dealers.generalDiscountPercent,
          status: dealers.status,
        })
        .from(dealers)
        .where(eq(dealers.id, id))
        .for('update');
      if (!dealer) throw new NotFoundException('Bayi bulunamadı.');
      // K-12: iskonto yalnızca incelenebilir/aktif/pasif bayide; reddedilen veya doğrulanmamışta yok.
      if (!TERMS_EDITABLE.includes(dealer.status)) throw invalidState();
      await tx
        .update(dealers)
        .set({ generalDiscountPercent: percent })
        .where(eq(dealers.id, id));
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'dealer.terms_changed',
          entityType: 'dealers',
          entityId: id,
          data: { previous: dealer.previous, next: percent },
        },
        tx,
      );
    });
  }

  /** K-12, K-13: bayinin grup iskontoları (grup adıyla). */
  async getGroupDiscounts(id: string) {
    await this.getOrThrow(id);
    return this.db
      .select({
        groupId: dealerGroupDiscounts.groupId,
        groupName: productGroups.name,
        discountPercent: dealerGroupDiscounts.discountPercent,
      })
      .from(dealerGroupDiscounts)
      .innerJoin(productGroups, eq(productGroups.id, dealerGroupDiscounts.groupId))
      .where(eq(dealerGroupDiscounts.dealerId, id))
      .orderBy(asc(productGroups.sortOrder), asc(productGroups.name));
  }

  /**
   * K-12, K-13: listeyi tamamen değiştirir (boş liste = hepsini kaldır). Yalnızca incelenebilir/aktif/pasif
   * bayide (K-12 genel iskontoyla aynı kısıt). Önceki ve yeni liste audit_log'a yazılır.
   */
  async setGroupDiscounts(
    id: string,
    adminId: string,
    items: { groupId: string; discountPercent: string }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [dealer] = await tx
        .select({ status: dealers.status })
        .from(dealers)
        .where(eq(dealers.id, id))
        .for('update');
      if (!dealer) throw new NotFoundException('Bayi bulunamadı.');
      if (!TERMS_EDITABLE.includes(dealer.status)) throw invalidState();
      if (items.length > 0) {
        const found = await tx
          .select({ id: productGroups.id })
          .from(productGroups)
          .where(inArray(productGroups.id, items.map((i) => i.groupId)));
        if (found.length !== items.length) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'VALIDATION',
            message: 'Girilen bilgiler geçersiz.',
            fields: { items: 'Ürün gruplarından biri bulunamadı.' },
          });
        }
      }
      const previous = await tx
        .select({
          groupId: dealerGroupDiscounts.groupId,
          discountPercent: dealerGroupDiscounts.discountPercent,
        })
        .from(dealerGroupDiscounts)
        .where(eq(dealerGroupDiscounts.dealerId, id));
      await tx.delete(dealerGroupDiscounts).where(eq(dealerGroupDiscounts.dealerId, id));
      if (items.length > 0) {
        await tx
          .insert(dealerGroupDiscounts)
          .values(items.map((i) => ({ dealerId: id, groupId: i.groupId, discountPercent: i.discountPercent })));
      }
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'dealer.group_discounts_changed',
          entityType: 'dealers',
          entityId: id,
          data: { previous, next: items },
        },
        tx,
      );
    });
  }

  // --- yardımcılar ----------------------------------------------------------

  private async transition(
    id: string,
    adminId: string,
    opts: {
      from: DealerStatus[];
      to: DealerStatus;
      action: string;
      reason?: string;
      set?: Partial<typeof dealers.$inferInsert>;
      afterUpdate?: (tx: Tx, dealer: { email: string; companyTitle: string }) => Promise<void>;
    },
  ): Promise<{ email: string; companyTitle: string }> {
    return this.db.transaction(async (tx) => {
      const [dealer] = await tx
        .select({
          status: dealers.status,
          email: dealers.email,
          companyTitle: dealers.companyTitle,
        })
        .from(dealers)
        .where(eq(dealers.id, id))
        .for('update');
      if (!dealer) throw new NotFoundException('Bayi bulunamadı.');
      if (!opts.from.includes(dealer.status)) throw invalidState();
      await tx
        .update(dealers)
        .set({ ...opts.set, status: opts.to })
        .where(and(eq(dealers.id, id), inArray(dealers.status, opts.from)));
      await opts.afterUpdate?.(tx, { email: dealer.email, companyTitle: dealer.companyTitle });
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: opts.action,
          entityType: 'dealers',
          entityId: id,
          reason: opts.reason,
          data: { from: dealer.status, to: opts.to },
        },
        tx,
      );
      return { email: dealer.email, companyTitle: dealer.companyTitle };
    });
  }

  /**
   * E-postasını 24 saat içinde doğrulamamış başvuruları (consents ve token'larıyla) siler (K-55).
   * `match` verilirse yalnızca aynı e-posta veya aynı unvan anahtarına sahip kayıtlar silinir.
   */
  async purgeStalePending(
    tx: Tx,
    match?: { email: string; titleKey: string },
  ): Promise<number> {
    const cutoff = new Date(
      this.clock.now().getTime() - EMAIL_VERIFICATION_TTL_MS,
    );
    const conditions: (SQL | undefined)[] = [
      eq(dealers.status, 'pending_email'),
      lt(dealers.createdAt, cutoff),
    ];
    if (match) {
      conditions.push(
        or(
          sql`lower(${dealers.email}) = ${match.email}`,
          eq(dealers.companyTitleKey, match.titleKey),
        ),
      );
    }
    const stale = await tx
      .select({ id: dealers.id })
      .from(dealers)
      .where(and(...conditions));
    if (stale.length === 0) return 0;
    const ids = stale.map((d) => d.id);
    await tx.delete(consents).where(inArray(consents.dealerId, ids));
    await tx
      .delete(authTokens)
      .where(
        and(
          eq(authTokens.subjectType, 'dealer'),
          inArray(authTokens.subjectId, ids),
        ),
      );
    await tx.delete(dealers).where(inArray(dealers.id, ids));
    return ids.length;
  }

  /** Günlük temizlik 03:00 (İstanbul); çok örnekli çalışmada advisory lock ile tek örnek. */
  @Cron('0 3 * * *', { timeZone: BUSINESS_TIME_ZONE })
  async scheduledCleanup(): Promise<void> {
    try {
      await runExclusive(this.db, LOCK_STALE_APPLICATIONS, (tx) =>
        this.purgeStalePending(tx),
      );
    } catch (error) {
      this.logger.error(
        'Süresi geçmiş başvurular temizlenemedi',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  private async getOrThrow(id: string): Promise<DealerRow> {
    const [dealer] = await this.db
      .select()
      .from(dealers)
      .where(eq(dealers.id, id));
    if (!dealer) throw new NotFoundException('Bayi bulunamadı.');
    return dealer;
  }

  private toSummary(d: DealerRow): DealerSummary {
    return {
      id: d.id,
      companyTitle: d.companyTitle,
      contactName: d.contactName,
      email: d.email,
      phone: d.phone,
      city: d.city,
      district: d.district,
      status: d.status,
      source: d.source,
      hasPassword: d.passwordHash !== null,
      generalDiscountPercent: d.generalDiscountPercent,
      createdAt: d.createdAt.toISOString(),
      reviewedAt: iso(d.reviewedAt),
      lastLoginAt: iso(d.lastLoginAt),
      approvalOverdue:
        d.status === 'pending_approval' &&
        d.emailVerifiedAt !== null &&
        isBusinessDaysOverdue(d.emailVerifiedAt, this.clock.now()),
    };
  }
}
