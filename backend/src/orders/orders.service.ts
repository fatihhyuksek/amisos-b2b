// Ön sipariş. GR-SIP-003…008, GR-FIY-001, GR-BLD-001; K-20 – K-22, K-25, K-26, K-33, K-36 – K-38, K-41, K-44.
// Gönderilen sipariş bayi tarafından değiştirilemez ve iptal edilemez (K-22): bu serviste sipariş için
// yazma yoktur. Admin durum yönetimi: admin-orders.service.ts.
import { ConflictException, BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
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
import type { OrderMail } from '../mail/mail.service.js';
import { NotificationsService, serializeOrderMail } from '../notifications/notifications.service.js';
import { calculateDealerPrice } from '../pricing/pricing.service.js';
import { CartService, type CartView } from './cart.service.js';
import { Money } from '../common/money.js';
import { roundUpToCase } from './order-math.js';
import { MAX_QUANTITY } from './orders.schemas.js';
import type { OrderListQuery, SubmitOrderInput } from './orders.schemas.js';

export type OrderRow = typeof orders.$inferSelect;
type LineRow = typeof orderLines.$inferSelect;

// Tablo adı açıkça yazılır: tek tablolu sorguda drizzle sütunları öneksiz üretir ve alt sorguda yanlış sütuna bağlanır.
const lineCountSql = sql<number>`(select count(*)::int from order_lines where order_lines.order_id = "orders"."id")`;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CartService) private readonly cart: CartService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
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
        view.summary.grandTotal !== input.expectedTotal ||
        view.version !== input.expectedVersion
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
      // GR-BLD-001: e-postalar aynı transaction'da outbox'a yazılır (geri alınırsa e-posta da yoktur).
      const outboxIds = [
        await this.notifications.enqueue('order_confirmation', mail.dealerEmail, { order: serializeOrderMail(mail) }, tx),
      ];
      const admins = await tx.select({ email: adminUsers.email }).from(adminUsers).where(eq(adminUsers.isActive, true));
      for (const admin of admins) {
        outboxIds.push(
          await this.notifications.enqueue('new_order_team', admin.email, { order: serializeOrderMail(mail) }, tx),
        );
      }
      return { kind: 'ok' as const, id: order.id, orderNo: order.orderNo, outboxIds };
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
    // İlk deneme yanıtı bekletmeden arka planda; başarısızsa outbox işi yeniden dener.
    this.notifications.dispatchSoon(result.outboxIds);
    return { id: result.id, orderNo: result.orderNo };
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
      // Admin notu bayiye görünür; changedBy (Admin kimliği) dönmez.
      history: detail.history.map(({ fromStatus, toStatus, source, note, createdAt }) => ({
        fromStatus,
        toStatus,
        source,
        note,
        createdAt,
      })),
    };
  }

  /** Bayi ve Admin detayının ortak gövdesi; history ham satırlardır (changedBy id, note). */
  async detail(order: OrderRow) {
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
      const skipped: { productId: string; name: string; barcode: string; reason: 'INACTIVE' | 'QUANTITY_LIMIT' }[] = [];
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
        // Koli katına yukarı yuvarla; sınırı aşarsa sınırı aşmayan en büyük koli katına kırp.
        const caseQty = c.product.caseQuantity;
        const maxMultiple = Math.floor(MAX_QUANTITY / caseQty) * caseQty;
        if (maxMultiple === 0) {
          skipped.push({ productId: line.productId, name: line.productName, barcode: line.barcode, reason: 'QUANTITY_LIMIT' });
          continue;
        }
        const rounded = requested % caseQty === 0 ? requested : roundUpToCase(requested, caseQty);
        const quantity = Math.min(rounded, maxMultiple);
        if (quantity !== requested) {
          adjusted.push({
            productId: line.productId,
            name: c.product.name,
            from: requested,
            to: quantity,
            caseQuantity: caseQty,
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
    // K-10: iskonto yoksa null (sepetle tutarlı).
    discountPercent: new Money(l.discountPercent).gt(0) ? l.discountPercent : null,
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
