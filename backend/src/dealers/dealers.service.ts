// Bayi başvurusu ve Admin bayi yönetimi.
// GR-BAYI-001…008, GR-KVK-001, GR-YON-001; K-02 – K-08, K-12, K-35, K-43, K-45, K-51.
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, ilike, or, sql, type SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import { isBusinessDaysOverdue } from '../common/business-days.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { DB, type Database } from '../database/database.module.js';
import { adminUsers, auditLog, consents, dealers } from '../database/schema.js';
import type {
  ApplicationInput,
  DealerFieldsInput,
  ListQuery,
} from './dealers.schemas.js';

/** GR-KVK-001: KVKK ve koşul metinleri iş sahibinden gelene kadar taslak sürüm. */
export const CONSENT_DOCUMENT_VERSION = 'taslak-1';

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

/** LIKE joker karakterlerini (% _ \) kaçırır; kullanıcı girdisi desen olarak yorumlanmaz. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** PostgreSQL benzersizlik ihlali (drizzle hatayı `cause` içine sarar). */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

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
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
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
        const [dealer] = await tx
          .insert(dealers)
          .values({
            companyTitle: input.companyTitle,
            contactName: input.contactName,
            email: input.email,
            phone: input.phone,
            city: input.city,
            district: input.district,
            address: input.address,
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
    let row: DealerRow;
    try {
      row = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(dealers)
          .values({
            ...input,
            status: 'active',
            source: 'invitation',
            reviewedAt: this.clock.now(),
            reviewedBy: adminId,
          })
          .returning();
        await this.audit.record(
          {
            actorType: 'admin',
            actorId: adminId,
            action: 'dealer.created_by_invitation',
            entityType: 'dealers',
            entityId: created.id,
          },
          tx,
        );
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate();
      throw error;
    }
    this.auth.queueInvitation(row.id);
    return this.toSummary(row);
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

  /** K-04: 2 iş gününü aşmış onay bekleyen başvuru sayısı. */
  async countOverdue(now: Date): Promise<number> {
    const rows = await this.db
      .select({ verifiedAt: dealers.emailVerifiedAt })
      .from(dealers)
      .where(eq(dealers.status, 'pending_approval'));
    return rows.filter(
      (r) => r.verifiedAt && isBusinessDaysOverdue(r.verifiedAt, now),
    ).length;
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

  /** pending_approval -> active; davet e-postası gider. */
  async approve(id: string, adminId: string): Promise<void> {
    await this.transition(id, adminId, {
      from: ['pending_approval'],
      to: 'active',
      action: 'dealer.approved',
      set: { reviewedAt: this.clock.now(), reviewedBy: adminId },
    });
    this.auth.queueInvitation(id);
  }

  /** pending_email | pending_approval -> rejected; gerekçe zorunlu (K-51: yeniden başvuru serbest). */
  async reject(id: string, adminId: string, reason: string): Promise<void> {
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
    });
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

  /** Aktif ve şifresi olmayan bayiye yeni davet; önceki davet geçersiz olur. */
  async resendInvitation(id: string, adminId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [dealer] = await tx
        .select()
        .from(dealers)
        .where(eq(dealers.id, id))
        .for('update');
      if (!dealer) throw new NotFoundException('Bayi bulunamadı.');
      if (dealer.status !== 'active' || dealer.passwordHash)
        throw invalidState();
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
    });
    await this.auth.sendInvitation(id);
  }

  /** K-12, K-43: genel iskonto oranı; önceki ve yeni değer audit_log'a yazılır. */
  async setGeneralDiscount(
    id: string,
    adminId: string,
    percent: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [dealer] = await tx
        .select({ previous: dealers.generalDiscountPercent })
        .from(dealers)
        .where(eq(dealers.id, id))
        .for('update');
      if (!dealer) throw new NotFoundException('Bayi bulunamadı.');
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
      afterUpdate?: (
        tx: Parameters<Parameters<Database['transaction']>[0]>[0],
      ) => Promise<void>;
    },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [dealer] = await tx
        .select({ status: dealers.status })
        .from(dealers)
        .where(eq(dealers.id, id))
        .for('update');
      if (!dealer) throw new NotFoundException('Bayi bulunamadı.');
      if (!opts.from.includes(dealer.status)) throw invalidState();
      await tx
        .update(dealers)
        .set({ ...opts.set, status: opts.to })
        .where(and(eq(dealers.id, id), inArray(dealers.status, opts.from)));
      await opts.afterUpdate?.(tx);
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
    });
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
