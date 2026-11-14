// Ön sipariş. GR-SIP-003…008, GR-FIY-001, GR-BLD-001; K-20 – K-22, K-25, K-26, K-33, K-36 – K-38, K-41, K-44.
// Gönderilen sipariş değiştirilemez ve iptal edilemez (K-22): bu serviste sipariş için yazma yoktur
// (durum güncelleme Admin adımında, order-status.ts kurallarıyla eklenecek).
import { ConflictException, BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { lockDealerCart } from '../common/advisory-lock.js';
import { DB, type Database } from '../database/database.module.js';
import {
  adminUsers,
  cartItems,
  dealers,
  orderLines,
  orders,
  orderStatusHistory,
  productGroups,
  products,
} from '../database/schema.js';
import { MAIL_SERVICE, type MailService, type OrderMail } from '../mail/mail.service.js';
import { calculateDealerPrice } from '../pricing/pricing.service.js';
import { CartService, type CartView } from './cart.service.js';
import { roundUpToCase } from './order-math.js';
import type { AdminOrderListQuery, OrderListQuery, SubmitOrderInput } from './orders.schemas.js';

type OrderRow = typeof orders.$inferSelect;
type LineRow = typeof orderLines.$inferSelect;

const BUSINESS_TZ = 'Europe/Istanbul';

// Tablo adı açıkça yazılır: tek tablolu sorguda drizzle sütunları öneksiz üretir ve alt sorguda yanlış sütuna bağlanır.
const lineCountSql = sql<number>`(select count(*)::int from order_lines where order_lines.order_id = "orders"."id")`;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CartService) private readonly cart: CartService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
  ) {}

  // --- Gönderim -------------------------------------------------------------

  /**
   * Sepeti sunucuda yeniden hesaplar; bayinin gördüğü genel toplamla (`expectedTotal`) uyuşmazsa
   * 409 PRICE_CHANGED (GR-FIY-001). Tek transaction ve bayi kilidi (çift gönderim: bkz. lockDealerCart).
   */
  async submit(dealerId: string, input: SubmitOrderInput): Promise<{ id: string; orderNo: number }> {
    const result = await this.db.transaction(async (tx) => {
      await lockDealerCart(tx, dealerId);
      const { view, items } = await this.cart.snapshot(tx, dealerId);
      if (items.length === 0 && view.removed.length === 0) return { kind: 'empty' as const };
      // Pasif ürün düştüyse veya koli katı düzeltildiyse bayi ekranda gördüğünden farklı bir sepete
      // sipariş vermesin: toplam tesadüfen aynı olsa da yeniden onay istenir.
      if (
        items.length === 0 ||
        view.removed.length > 0 ||
        view.adjusted.length > 0 ||
        view.summary.grandTotal !== input.expectedTotal
      ) {
        return { kind: 'changed' as const, cart: view };
      }

      const [order] = await tx
        .insert(orders)
        .values({
          dealerId,
          deliveryMethod: input.deliveryMethod,
          deliveryAddress: input.deliveryAddress,
          carrierName: input.carrierName,
          carrierBranch: input.carrierBranch,
          note: input.note,
          grossTotal: view.summary.grossTotal,
          discountTotal: view.summary.discountTotal,
          netTotal: view.summary.netTotal,
          vatTotal: view.summary.vatTotal,
          grandTotal: view.summary.grandTotal,
          transferStatus: 'pending',
        })
        .returning();
      await tx.insert(orderLines).values(
        items.map(({ product, line }, i) => ({
          orderId: order.id,
          productId: product.id,
          lineNo: i + 1,
          barcode: product.barcode,
          productCode: product.code,
          productName: product.name,
          caseQuantity: product.caseQuantity,
          quantity: line.quantity,
          unitListPrice: line.listPrice,
          discountPercent: line.discountPercent ?? '0.00',
          grossAmount: line.lineGross,
          discountAmount: line.lineDiscount,
          netAmount: line.lineNet,
          vatRate: line.vatRate,
          vatAmount: line.lineVat,
          outOfStockAtOrder: line.stock === 'out_of_stock',
        })),
      );
      await tx
        .insert(orderStatusHistory)
        .values({ orderId: order.id, fromStatus: null, toStatus: 'submitted', source: 'system' });
      await tx.delete(cartItems).where(eq(cartItems.dealerId, dealerId));
      await this.audit.record(
        {
          actorType: 'dealer',
          actorId: dealerId,
          action: 'order.submit',
          entityType: 'orders',
          entityId: order.id,
          data: {
            orderNo: order.orderNo,
            deliveryMethod: order.deliveryMethod,
            lineCount: items.length,
            grandTotal: order.grandTotal,
          },
        },
        tx,
      );
      const [dealer] = await tx.select().from(dealers).where(eq(dealers.id, dealerId));
      const mail: OrderMail = {
        orderNo: order.orderNo,
        submittedAt: order.submittedAt,
        dealerCompany: dealer.companyTitle,
        dealerContact: dealer.contactName,
        dealerEmail: dealer.email,
        dealerPhone: dealer.phone,
        deliveryMethod: order.deliveryMethod,
        deliveryAddress: order.deliveryAddress,
        carrierName: order.carrierName,
        carrierBranch: order.carrierBranch,
        note: order.note,
        lines: items.map(({ product, line }) => ({
          barcode: product.barcode,
          code: product.code,
          name: product.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          outOfStock: line.stock === 'out_of_stock',
        })),
        netTotal: order.netTotal,
        vatTotal: order.vatTotal,
        grandTotal: order.grandTotal,
      };
      return { kind: 'ok' as const, id: order.id, orderNo: order.orderNo, mail };
    });

    if (result.kind === 'empty') {
      throw new BadRequestException({ statusCode: 400, code: 'EMPTY_CART', message: 'Sepet boş.' });
    }
    if (result.kind === 'changed') {
      throw new ConflictException({
        statusCode: 409,
        code: 'PRICE_CHANGED',
        message: 'Sepet veya fiyatlar değişti, lütfen güncel sepeti kontrol edin.',
        cart: result.cart,
      });
    }
    // GR-BLD-001: e-postalar yanıtı bekletmeden arka planda gider; hata siparişi etkilemez.
    void this.notify(result.mail);
    return { id: result.id, orderNo: result.orderNo };
  }

  private async notify(mail: OrderMail): Promise<void> {
    try {
      await this.mail.sendOrderConfirmation(mail.dealerEmail, mail);
    } catch (error) {
      this.logger.error(`Sipariş #${mail.orderNo} bayi e-postası gönderilemedi`, error instanceof Error ? error.stack : error);
    }
    try {
      const admins = await this.db
        .select({ email: adminUsers.email })
        .from(adminUsers)
        .where(eq(adminUsers.isActive, true));
      for (const admin of admins) {
        try {
          await this.mail.sendNewOrderToTeam(admin.email, mail);
        } catch (error) {
          this.logger.error(`Sipariş #${mail.orderNo} ekip e-postası gönderilemedi`, error instanceof Error ? error.stack : error);
        }
      }
    } catch (error) {
      this.logger.error(`Sipariş #${mail.orderNo} ekip bildirimi hazırlanamadı`, error instanceof Error ? error.stack : error);
    }
  }

  // --- Bayi: geçmiş ---------------------------------------------------------

  async listForDealer(dealerId: string, query: OrderListQuery) {
    const where = eq(orders.dealerId, dealerId);
    const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` }).from(orders).where(where);
    const rows = await this.db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        submittedAt: orders.submittedAt,
        status: orders.status,
        netTotal: orders.netTotal,
        grandTotal: orders.grandTotal,
        lineCount: lineCountSql,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.submittedAt), desc(orders.orderNo))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return { items: rows, total, page: query.page, pageSize: query.pageSize };
  }

  /** GR-SIP-006: yalnızca kendi siparişi; başkasınınki 404. */
  async getForDealer(dealerId: string, id: string) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.dealerId, dealerId)));
    if (!order) throw new NotFoundException('Sipariş bulunamadı.');
    const detail = await this.detail(order);
    return {
      ...detail,
      history: detail.history.map(({ fromStatus, toStatus, source, createdAt }) => ({
        fromStatus,
        toStatus,
        source,
        createdAt,
      })),
    };
  }

  // --- Admin: okuma ---------------------------------------------------------

  async listForAdmin(query: AdminOrderListQuery) {
    const filters: (SQL | undefined)[] = [];
    if (query.status) filters.push(eq(orders.status, query.status));
    if (query.dealerId) filters.push(eq(orders.dealerId, query.dealerId));
    // Gün sınırları Europe/Istanbul'a göre, from/to dahil.
    if (query.from) {
      filters.push(gte(orders.submittedAt, sql`(${query.from}::date)::timestamp at time zone ${BUSINESS_TZ}`));
    }
    if (query.to) {
      filters.push(lt(orders.submittedAt, sql`((${query.to}::date + 1)::timestamp) at time zone ${BUSINESS_TZ}`));
    }
    const where = and(...filters);
    const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` }).from(orders).where(where);
    const rows = await this.db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        submittedAt: orders.submittedAt,
        status: orders.status,
        dealerId: dealers.id,
        companyTitle: dealers.companyTitle,
        deliveryMethod: orders.deliveryMethod,
        transferStatus: orders.transferStatus,
        netTotal: orders.netTotal,
        grandTotal: orders.grandTotal,
        lineCount: lineCountSql,
      })
      .from(orders)
      .innerJoin(dealers, eq(dealers.id, orders.dealerId))
      .where(where)
      .orderBy(desc(orders.submittedAt), desc(orders.orderNo))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: rows.map(({ dealerId, companyTitle, ...rest }) => ({
        ...rest,
        dealer: { id: dealerId, companyTitle },
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getForAdmin(id: string) {
    const [row] = await this.db
      .select({
        order: orders,
        dealerId: dealers.id,
        companyTitle: dealers.companyTitle,
        contactName: dealers.contactName,
        email: dealers.email,
        phone: dealers.phone,
      })
      .from(orders)
      .innerJoin(dealers, eq(dealers.id, orders.dealerId))
      .where(eq(orders.id, id));
    if (!row) throw new NotFoundException('Sipariş bulunamadı.');
    const detail = await this.detail(row.order);
    return {
      ...detail,
      dealer: {
        id: row.dealerId,
        companyTitle: row.companyTitle,
        contactName: row.contactName,
        email: row.email,
        phone: row.phone,
      },
      transferStatus: row.order.transferStatus,
      transferError: row.order.transferError,
      bizimhesapGuid: row.order.bizimhesapGuid,
      transferredAt: row.order.transferredAt,
    };
  }

  private async detail(order: OrderRow) {
    const lines = await this.db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, order.id))
      .orderBy(asc(orderLines.lineNo));
    const history = await this.db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id));
    return {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      submittedAt: order.submittedAt,
      deliveryMethod: order.deliveryMethod,
      deliveryAddress: order.deliveryAddress,
      carrierName: order.carrierName,
      carrierBranch: order.carrierBranch,
      note: order.note,
      lines: lines.map(lineDto),
      summary: {
        grossTotal: order.grossTotal,
        discountTotal: order.discountTotal,
        netTotal: order.netTotal,
        vatTotal: order.vatTotal,
        grandTotal: order.grandTotal,
      },
      history: history.map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        source: h.source,
        createdAt: h.createdAt,
        changedBy: h.changedBy,
        note: h.note,
      })),
    };
  }

  // --- Tekrar sipariş (K-41, K-44, GR-SIP-008) ------------------------------

  async reorder(dealerId: string, orderId: string) {
    const [order] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.dealerId, dealerId)));
    if (!order) throw new NotFoundException('Sipariş bulunamadı.');

    return this.db.transaction(async (tx) => {
      await lockDealerCart(tx, dealerId);
      const lines = await tx
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, orderId))
        .orderBy(asc(orderLines.lineNo));
      const current = await tx
        .select({ product: products, groupActive: productGroups.isActive })
        .from(products)
        .innerJoin(productGroups, eq(productGroups.id, products.groupId))
        .where(
          inArray(
            products.id,
            lines.map((l) => l.productId),
          ),
        );
      const byId = new Map(current.map((c) => [c.product.id, c]));
      const existing = new Map(
        (await tx.select().from(cartItems).where(eq(cartItems.dealerId, dealerId))).map((c) => [c.productId, c.quantity]),
      );

      const added: { productId: string; name: string; quantity: number }[] = [];
      const skipped: { productId: string; name: string; barcode: string; reason: 'INACTIVE' }[] = [];
      const adjusted: { productId: string; name: string; from: number; to: number; caseQuantity: number }[] = [];
      for (const line of lines) {
        const c = byId.get(line.productId);
        if (!c || !c.product.isActive || !c.groupActive) {
          skipped.push({
            productId: line.productId,
            name: line.productName,
            barcode: line.barcode,
            reason: 'INACTIVE',
          });
          continue;
        }
        const requested = (existing.get(line.productId) ?? 0) + line.quantity;
        const quantity =
          requested % c.product.caseQuantity === 0 ? requested : roundUpToCase(requested, c.product.caseQuantity);
        if (quantity !== requested) {
          adjusted.push({
            productId: line.productId,
            name: c.product.name,
            from: requested,
            to: quantity,
            caseQuantity: c.product.caseQuantity,
          });
        }
        await tx
          .insert(cartItems)
          .values({ dealerId, productId: line.productId, quantity })
          .onConflictDoUpdate({
            target: [cartItems.dealerId, cartItems.productId],
            set: { quantity, updatedAt: new Date() },
          });
        existing.set(line.productId, quantity);
        added.push({ productId: line.productId, name: c.product.name, quantity: line.quantity });
      }
      const cart: CartView = (await this.cart.snapshot(tx, dealerId)).view;
      return { cart, added, skipped, adjusted };
    });
  }
}

function lineDto(l: LineRow) {
  return {
    lineNo: l.lineNo,
    productId: l.productId,
    barcode: l.barcode,
    code: l.productCode,
    name: l.productName,
    quantity: l.quantity,
    caseQuantity: l.caseQuantity,
    listPrice: l.unitListPrice,
    discountPercent: l.discountPercent,
    // Sipariş anındaki iskontolu birim fiyat: aynı formülle, kopyalanan liste fiyatı ve orandan.
    unitPrice: calculateDealerPrice(l.unitListPrice, l.discountPercent, null).price,
    lineGross: l.grossAmount,
    lineDiscount: l.discountAmount,
    lineNet: l.netAmount,
    vatRate: l.vatRate,
    lineVat: l.vatAmount,
    outOfStock: l.outOfStockAtOrder,
  };
}
