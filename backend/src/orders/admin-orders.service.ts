// Admin sipariş yönetimi. GR-SIP-006, GR-BLD-001, GR-YON-001; K-17, K-24, K-25, K-26.
// API: docs/api/admin-siparis-api.md. Durum kuralları: order-status.ts.
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { escapeLike, foldSql, foldTr } from '../common/like.js';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../database/database.module.js';
import {
  adminUsers,
  dealers,
  orderNotes,
  orders,
  orderStatusHistory,
} from '../database/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  allowedNextStatuses,
  canTransition,
  ORDER_STATUS_LABELS,
} from './order-status.js';
import { buildOrderExport } from './order-export.js';
import { OrdersService, type OrderRow } from './orders.service.js';
import type {
  AdminOrderListQuery,
  ChangeStatusInput,
  MarkTransferredInput,
} from './orders.schemas.js';

const BUSINESS_TZ = 'Europe/Istanbul';

const lineCountSql = sql<number>`(select count(*)::int from order_lines where order_lines.order_id = "orders"."id")`;
const hasOutOfStockSql = sql<boolean>`exists (select 1 from order_lines where order_lines.order_id = "orders"."id" and order_lines.out_of_stock_at_order)`;

const DELIVERY_LABELS = {
  carrier: 'Ambar ile',
  pickup: 'Bayi kendisi alır',
  truck: 'Tır yüklemesi',
} as const;
const DATE_FORMAT = 'dd.mm.yyyy hh:mm';
const ISTANBUL_OFFSET_MS = 3 * 3_600_000;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * "BizimHesap'a girilmemiş" tanımı (tek yer): iptal edilmemiş ve `transferred` olmayan siparişler.
 * `transfer=pending` filtresi ve `summary.notTransferred` aynı koşulu kullanır.
 */
export const notTransferredCondition = (): SQL =>
  sql`(${orders.status} <> 'cancelled' and ${orders.transferStatus} <> 'transferred')`;

const transferError = (code: string, message: string) =>
  new ConflictException({ statusCode: 409, code, message });

const invalidTransition = (from: string, to: string) =>
  new ConflictException({
    statusCode: 409,
    code: 'INVALID_TRANSITION',
    message: `Sipariş durumu ${from} iken ${to} olamaz.`,
  });

@Injectable()
export class AdminOrdersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  // --- Liste ve özet --------------------------------------------------------

  private listFilter(query: AdminOrderListQuery): SQL | undefined {
    const filters: (SQL | undefined)[] = [];
    if (query.status) filters.push(eq(orders.status, query.status));
    if (query.dealerId) filters.push(eq(orders.dealerId, query.dealerId));
    // Gün sınırları Europe/Istanbul'a göre, from/to dahil.
    if (query.from) {
      filters.push(
        gte(
          orders.submittedAt,
          sql`(${query.from}::date)::timestamp at time zone ${BUSINESS_TZ}`,
        ),
      );
    }
    if (query.to) {
      filters.push(
        lt(
          orders.submittedAt,
          sql`((${query.to}::date + 1)::timestamp) at time zone ${BUSINESS_TZ}`,
        ),
      );
    }
    if (query.transfer === 'transferred')
      filters.push(eq(orders.transferStatus, 'transferred'));
    if (query.transfer === 'pending') filters.push(notTransferredCondition());
    if (query.q) {
      const folded = `%${escapeLike(foldTr(query.q))}%`;
      const byText = or(
        sql`${foldSql(dealers.companyTitle)} like ${folded}`,
        sql`${foldSql(dealers.contactName)} like ${folded}`,
      );
      // Yalnızca rakamlardan oluşan girdi sipariş numarası olarak da eşleşir (tam eşleşme).
      filters.push(
        /^\d{1,9}$/.test(query.q)
          ? or(eq(orders.orderNo, Number(query.q)), byText)
          : byText,
      );
    }
    return and(...filters);
  }

  private listSelect() {
    return {
      id: orders.id,
      orderNo: orders.orderNo,
      submittedAt: orders.submittedAt,
      status: orders.status,
      dealerId: dealers.id,
      companyTitle: dealers.companyTitle,
      deliveryMethod: orders.deliveryMethod,
      transferStatus: orders.transferStatus,
      netTotal: orders.netTotal,
      vatTotal: orders.vatTotal,
      grandTotal: orders.grandTotal,
      lineCount: lineCountSql,
      hasOutOfStock: hasOutOfStockSql,
    };
  }

  async list(query: AdminOrderListQuery) {
    const where = this.listFilter(query);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .innerJoin(dealers, eq(dealers.id, orders.dealerId))
      .where(where);
    const rows = await this.db
      .select(this.listSelect())
      .from(orders)
      .innerJoin(dealers, eq(dealers.id, orders.dealerId))
      .where(where)
      .orderBy(desc(orders.submittedAt), desc(orders.orderNo))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: rows.map(
        ({ dealerId, companyTitle, vatTotal: _vat, ...rest }) => ({
          ...rest,
          dealer: { id: dealerId, companyTitle },
        }),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Panel ana sayfa kartları. `notTransferred`: iptal edilmemiş ve BizimHesap'a girilmemiş siparişler. */
  async summary() {
    const [row] = await this.db
      .select({
        submitted: sql<number>`count(*) filter (where ${orders.status} = 'submitted')::int`,
        negotiating: sql<number>`count(*) filter (where ${orders.status} = 'negotiating')::int`,
        approved: sql<number>`count(*) filter (where ${orders.status} = 'approved')::int`,
        shipped: sql<number>`count(*) filter (where ${orders.status} = 'shipped')::int`,
        notTransferred: sql<number>`count(*) filter (where ${notTransferredCondition()})::int`,
      })
      .from(orders);
    return row;
  }

  // --- Detay ----------------------------------------------------------------

  async get(id: string) {
    const [row] = await this.db
      .select({
        order: orders,
        dealerId: dealers.id,
        companyTitle: dealers.companyTitle,
        contactName: dealers.contactName,
        email: dealers.email,
        phone: dealers.phone,
        city: dealers.city,
        district: dealers.district,
        address: dealers.address,
      })
      .from(orders)
      .innerJoin(dealers, eq(dealers.id, orders.dealerId))
      .where(eq(orders.id, id));
    if (!row) throw new NotFoundException('Sipariş bulunamadı.');
    return this.toDetail(row.order, {
      id: row.dealerId,
      companyTitle: row.companyTitle,
      contactName: row.contactName,
      email: row.email,
      phone: row.phone,
      city: row.city,
      district: row.district,
      address: row.address,
    });
  }

  private async toDetail(order: OrderRow, dealer: Record<string, string>) {
    const detail = await this.orders.detail(order);
    const adminIds = [
      ...new Set(
        [...detail.history.map((h) => h.changedBy), order.transferredBy].filter(
          (v): v is string => !!v,
        ),
      ),
    ];
    const names = new Map<string, string>();
    if (adminIds.length > 0) {
      const rows = await this.db
        .select({ id: adminUsers.id, fullName: adminUsers.fullName })
        .from(adminUsers)
        .where(inArray(adminUsers.id, adminIds));
      for (const r of rows) names.set(r.id, r.fullName);
    }
    const who = (id: string | null) =>
      id ? { id, fullName: names.get(id) ?? '' } : null;
    const [{ internalNoteCount }] = await this.db
      .select({ internalNoteCount: sql<number>`count(*)::int` })
      .from(orderNotes)
      .where(eq(orderNotes.orderId, order.id));
    return {
      ...detail,
      // K-78: yalnızca Admin detayında; notların kendisi bayiye hiçbir uçta dönmez.
      internalNoteCount,
      allowedNextStatuses: allowedNextStatuses(order.status),
      history: detail.history.map((h) => ({
        ...h,
        changedBy: who(h.changedBy),
      })),
      dealer,
      transfer: {
        status: order.transferStatus,
        reference: order.transferReference,
        transferredAt: order.transferredAt,
        transferredBy: who(order.transferredBy),
      },
      transferError: order.transferError,
      bizimhesapGuid: order.bizimhesapGuid,
    };
  }

  // --- İç notlar (K-78): yalnızca Admin ---------------------------------------

  private async assertOrder(id: string): Promise<void> {
    const [row] = await this.db.select({ id: orders.id }).from(orders).where(eq(orders.id, id));
    if (!row) throw new NotFoundException('Sipariş bulunamadı.');
  }

  async listNotes(orderId: string) {
    await this.assertOrder(orderId);
    const rows = await this.db
      .select({
        id: orderNotes.id,
        body: orderNotes.body,
        createdAt: orderNotes.createdAt,
        adminId: orderNotes.createdBy,
        adminName: adminUsers.fullName,
      })
      .from(orderNotes)
      .innerJoin(adminUsers, eq(adminUsers.id, orderNotes.createdBy))
      .where(eq(orderNotes.orderId, orderId))
      .orderBy(desc(orderNotes.createdAt), desc(orderNotes.id));
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      createdBy: { id: r.adminId, fullName: r.adminName },
    }));
  }

  async addNote(orderId: string, body: string, adminId: string) {
    await this.assertOrder(orderId);
    const noteId = await this.db.transaction(async (tx) => {
      const [row] = await tx.insert(orderNotes).values({ orderId, body, createdBy: adminId }).returning();
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'order.note_added',
          entityType: 'orders',
          entityId: orderId,
          data: { noteId: row.id },
        },
        tx,
      );
      return row.id;
    });
    return (await this.listNotes(orderId)).find((n) => n.id === noteId);
  }

  async deleteNote(orderId: string, noteId: string, adminId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .delete(orderNotes)
        .where(and(eq(orderNotes.id, noteId), eq(orderNotes.orderId, orderId)))
        .returning({ id: orderNotes.id });
      if (!row) throw new NotFoundException('Not bulunamadı.');
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'order.note_deleted',
          entityType: 'orders',
          entityId: orderId,
          data: { noteId },
        },
        tx,
      );
    });
  }

  // --- Durum (K-25, K-26) ---------------------------------------------------

  /**
   * Geçiş kuralı order-status.ts'te. Satır kilidi (`for update`): aynı anda iki değişiklikten biri
   * güncel durumu görüp 409 INVALID_TRANSITION alır. Bayiye e-posta aynı transaction'da outbox'a yazılır.
   */
  async changeStatus(id: string, adminId: string, input: ChangeStatusInput) {
    const outboxId = await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .for('update');
      if (!order) throw new NotFoundException('Sipariş bulunamadı.');
      if (!canTransition(order.status, input.status))
        throw invalidTransition(order.status, input.status);
      await tx
        .update(orders)
        .set({ status: input.status })
        .where(eq(orders.id, id));
      await tx.insert(orderStatusHistory).values({
        orderId: id,
        fromStatus: order.status,
        toStatus: input.status,
        source: 'admin',
        changedBy: adminId,
        note: input.note,
      });
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'order.status_changed',
          entityType: 'orders',
          entityId: id,
          reason: input.note ?? undefined,
          data: {
            orderNo: order.orderNo,
            from: order.status,
            to: input.status,
          },
        },
        tx,
      );
      const [dealer] = await tx
        .select({ email: dealers.email })
        .from(dealers)
        .where(eq(dealers.id, order.dealerId));
      return this.notifications.enqueue(
        'order_status_changed',
        dealer.email,
        {
          orderNo: order.orderNo,
          status: input.status,
          statusLabel: ORDER_STATUS_LABELS[input.status],
          note: input.note,
          link: `${this.config.get('APP_URL', { infer: true })}/#/siparislerim/${id}`,
        },
        tx,
      );
    });
    this.notifications.dispatchSoon([outboxId]);
    return this.get(id);
  }

  // --- BizimHesap'a elle giriş (K-17 yedek yolu) ----------------------------

  async markTransferred(
    id: string,
    adminId: string,
    input: MarkTransferredInput,
  ) {
    await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .for('update');
      if (!order) throw new NotFoundException('Sipariş bulunamadı.');
      // Referans değişimi için önce işaret kaldırılır; çifte işaretleme/çakışma olmaz.
      if (order.transferStatus === 'transferred') {
        throw transferError(
          'ALREADY_TRANSFERRED',
          "Sipariş zaten BizimHesap'a girildi olarak işaretli.",
        );
      }
      await tx
        .update(orders)
        .set({
          transferStatus: 'transferred',
          transferredAt: this.clock.now(),
          transferredBy: adminId,
          transferReference: input.reference,
          transferError: null,
        })
        .where(eq(orders.id, id));
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'order.transfer_marked',
          entityType: 'orders',
          entityId: id,
          data: {
            orderNo: order.orderNo,
            reference: input.reference,
            previous: order.transferStatus,
          },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async unmarkTransferred(id: string, adminId: string) {
    await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .for('update');
      if (!order) throw new NotFoundException('Sipariş bulunamadı.');
      if (order.transferStatus !== 'transferred') {
        throw transferError('NOT_TRANSFERRED', "Sipariş BizimHesap'a girildi olarak işaretli değil.");
      }
      // Entegrasyonla aktarılmış (BizimHesap kaydı var) sipariş elle geri alınamaz.
      if (order.bizimhesapGuid) {
        throw transferError('TRANSFER_LOCKED', 'Sipariş BizimHesap entegrasyonuyla aktarıldı; işaret kaldırılamaz.');
      }
      // `manual`: elle girilecek durumda. Entegrasyon işçisi `pending` siparişleri alacağından,
      // pending'e dönmek mükerrer BizimHesap kaydına yol açabilir.
      await tx
        .update(orders)
        .set({
          transferStatus: 'manual',
          transferredAt: null,
          transferredBy: null,
          transferReference: null,
        })
        .where(eq(orders.id, id));
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'order.transfer_unmarked',
          entityType: 'orders',
          entityId: id,
          data: {
            orderNo: order.orderNo,
            previous: order.transferStatus,
            reference: order.transferReference,
          },
        },
        tx,
      );
    });
    return this.get(id);
  }

  // --- Excel dışa aktarma ---------------------------------------------------

  /** Tek sipariş: üstte başlık bilgisi, satır tablosu, altta toplamlar. Barkod/kod metin hücresidir. */
  async exportOrder(id: string): Promise<{ filename: string; data: Buffer }> {
    return buildOrderExport(await this.get(id));
  }

  /** Liste: filtrelere uyan siparişler, sipariş başına bir satır (en fazla 5000, aşarsa 400). */
  async exportList(
    query: AdminOrderListQuery,
  ): Promise<{ filename: string; data: Buffer }> {
    const where = this.listFilter(query);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .innerJoin(dealers, eq(dealers.id, orders.dealerId))
      .where(where);
    const maxExport = this.config.get('EXPORT_MAX_ORDERS', { infer: true });
    if (total > maxExport) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'EXPORT_TOO_LARGE',
        message: `En fazla ${maxExport} sipariş dışa aktarılabilir; filtreleri daraltın.`,
      });
    }
    const rows = await this.db
      .select(this.listSelect())
      .from(orders)
      .innerJoin(dealers, eq(dealers.id, orders.dealerId))
      .where(where)
      .orderBy(desc(orders.submittedAt), desc(orders.orderNo));
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Siparişler');
    const headerRow = sheet.addRow([
      'Sipariş no',
      'Tarih',
      'Bayi',
      'Durum',
      'Teslimat',
      'Kalem',
      'KDV hariç toplam',
      'KDV',
      'Genel toplam',
      'BizimHesap',
      'Stokta yok var',
    ]);
    headerRow.font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const money = '#,##0.00';
    for (const r of rows) {
      const row = sheet.addRow([
        r.orderNo,
        this.excelDate(r.submittedAt),
        r.companyTitle,
        ORDER_STATUS_LABELS[r.status],
        DELIVERY_LABELS[r.deliveryMethod],
        r.lineCount,
        Number(r.netTotal),
        Number(r.vatTotal),
        Number(r.grandTotal),
        r.transferStatus === 'transferred' ? 'Girildi' : 'Bekliyor',
        r.hasOutOfStock ? 'Evet' : '',
      ]);
      for (const c of [7, 8, 9]) row.getCell(c).numFmt = money;
      row.getCell(2).numFmt = DATE_FORMAT;
    }
    sheet.columns = [
      { width: 12 },
      { width: 18 },
      { width: 36 },
      { width: 14 },
      { width: 18 },
      { width: 8 },
      { width: 18 },
      { width: 12 },
      { width: 16 },
      { width: 12 },
      { width: 14 },
    ];
    const day = new Intl.DateTimeFormat('sv-SE', {
      timeZone: BUSINESS_TZ,
    }).format(this.clock.now());
    return {
      filename: `siparisler-${day}.xlsx`,
      data: Buffer.from(await wb.xlsx.writeBuffer()),
    };
  }

  /**
   * Gerçek tarih hücresi, Europe/Istanbul yerel saatiyle. Excel saat dilimi tutmaz; Türkiye kalıcı
   * UTC+3 olduğundan (business-days.ts) duvar saati UTC bileşenlerine yazılır.
   */
  private excelDate(value: Date): Date {
    return new Date(value.getTime() + ISTANBUL_OFFSET_MS);
  }

  static readonly mime = XLSX_MIME;
}
