// Kalıcı sepet. GR-SIP-003, GR-SIP-004, GR-SIP-008, GR-FIY-001, GR-FIY-003; K-20, K-21, K-38, K-41, K-44.
// Fiyat sepette saklanmaz: her görünümde güncel iskontoyla hesaplanır. Pasif ürünler sepetten düşer,
// koli içi adedi değişen satırlar yeni koli katına yukarı yuvarlanır (ikisi de yanıtta bildirilir).
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { catalogImageDto, loadImages } from '../catalog/product-images.js';
import { lockDealerCart, type Tx } from '../common/advisory-lock.js';
import { DB, type Database } from '../database/database.module.js';
import { cartItems, dealers, orders, productGroups, products } from '../database/schema.js';
import { loadDealerRates } from '../pricing/dealer-rates.js';
import { priceLine, roundUpToCase, summarize, type LinePricing, type OrderSummary } from './order-math.js';

type ProductRow = typeof products.$inferSelect;

export interface CartLine extends LinePricing {
  productId: string;
  barcode: string;
  code: string | null;
  name: string;
  thumbUrl: string | null;
  quantity: number;
  caseQuantity: number;
  stock: 'in_stock' | 'out_of_stock';
}

export interface CartView {
  lines: CartLine[];
  summary: OrderSummary;
  warnings: { code: 'OUT_OF_STOCK'; productId: string; name: string }[];
  removed: { productId: string; name: string }[];
  adjusted: { productId: string; name: string; from: number; to: number; caseQuantity: number }[];
}

/** Sipariş oluşturmak için görünümle birlikte ham ürün satırları. */
export interface CartSnapshot {
  view: CartView;
  items: { product: ProductRow; line: CartLine }[];
}

@Injectable()
export class CartService {
  constructor(@Inject(DB) private readonly db: Database) {}

  get(dealerId: string): Promise<CartView> {
    return this.db.transaction(async (tx) => {
      await lockDealerCart(tx, dealerId);
      return (await this.snapshot(tx, dealerId)).view;
    });
  }

  /** K-20: stokta olmayan ürün de eklenebilir. 0 = satırı kaldırır. */
  setQuantity(dealerId: string, productId: string, quantity: number): Promise<CartView> {
    return this.db.transaction(async (tx) => {
      await lockDealerCart(tx, dealerId);
      if (quantity === 0) {
        await this.removeRow(tx, dealerId, productId);
        return (await this.snapshot(tx, dealerId)).view;
      }
      const [row] = await tx
        .select({ caseQuantity: products.caseQuantity })
        .from(products)
        .innerJoin(productGroups, eq(productGroups.id, products.groupId))
        .where(and(eq(products.id, productId), eq(products.isActive, true), eq(productGroups.isActive, true)));
      if (!row) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
          message: 'Ürün bulunamadı.',
        });
      }
      // GR-SIP-004: koli katı değilse sepet kaydedilmez.
      if (quantity % row.caseQuantity !== 0) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'CASE_MULTIPLE',
          message: 'Miktar koli içi adedinin katı olmalı.',
          caseQuantity: row.caseQuantity,
        });
      }
      await tx
        .insert(cartItems)
        .values({ dealerId, productId, quantity })
        .onConflictDoUpdate({
          target: [cartItems.dealerId, cartItems.productId],
          set: { quantity, updatedAt: new Date() },
        });
      return (await this.snapshot(tx, dealerId)).view;
    });
  }

  removeItem(dealerId: string, productId: string): Promise<CartView> {
    return this.setQuantity(dealerId, productId, 0);
  }

  async clear(dealerId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockDealerCart(tx, dealerId);
      await tx.delete(cartItems).where(eq(cartItems.dealerId, dealerId));
    });
  }

  /** K-38: başvurudaki adres ve son ambar siparişindeki ambar bilgisi. */
  async checkoutDefaults(dealerId: string) {
    const [dealer] = await this.db
      .select({ address: dealers.address, district: dealers.district, city: dealers.city })
      .from(dealers)
      .where(eq(dealers.id, dealerId));
    const [last] = await this.db
      .select({ name: orders.carrierName, branch: orders.carrierBranch })
      .from(orders)
      .where(and(eq(orders.dealerId, dealerId), eq(orders.deliveryMethod, 'carrier')))
      .orderBy(desc(orders.submittedAt), desc(orders.orderNo))
      .limit(1);
    return {
      address: dealer ? `${dealer.address}, ${dealer.district} / ${dealer.city}` : '',
      lastCarrier: last?.name && last.branch ? { name: last.name, branch: last.branch } : null,
    };
  }

  /**
   * Sepeti güncel fiyatla hesaplar. Yan etki: pasif/kaldırılmış ürünler sepetten silinir (`removed`),
   * koli katı bozulan satırlar yukarı yuvarlanıp kaydedilir (`adjusted`). Çağıran bayi kilidini
   * (lockDealerCart) tutmalıdır.
   */
  async snapshot(tx: Tx, dealerId: string): Promise<CartSnapshot> {
    const rows = await tx
      .select({
        quantity: cartItems.quantity,
        product: products,
        groupActive: productGroups.isActive,
      })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(eq(cartItems.dealerId, dealerId))
      .orderBy(asc(cartItems.createdAt), asc(products.id));

    const removed: CartView['removed'] = [];
    const adjusted: CartView['adjusted'] = [];
    const kept: { product: ProductRow; quantity: number }[] = [];
    for (const r of rows) {
      if (!r.product.isActive || !r.groupActive) {
        removed.push({ productId: r.product.id, name: r.product.name });
        continue;
      }
      let quantity = r.quantity;
      if (quantity % r.product.caseQuantity !== 0) {
        quantity = roundUpToCase(quantity, r.product.caseQuantity);
        adjusted.push({
          productId: r.product.id,
          name: r.product.name,
          from: r.quantity,
          to: quantity,
          caseQuantity: r.product.caseQuantity,
        });
        await tx
          .update(cartItems)
          .set({ quantity })
          .where(and(eq(cartItems.dealerId, dealerId), eq(cartItems.productId, r.product.id)));
      }
      kept.push({ product: r.product, quantity });
    }
    if (removed.length > 0) {
      await tx.delete(cartItems).where(
        and(
          eq(cartItems.dealerId, dealerId),
          inArray(
            cartItems.productId,
            removed.map((r) => r.productId),
          ),
        ),
      );
    }

    const rates = await loadDealerRates(tx, dealerId);
    const images = await loadImages(
      tx,
      kept.map((k) => k.product.id),
    );
    const items = kept.map(({ product, quantity }) => {
      const first = images.get(product.id)?.[0];
      const line: CartLine = {
        productId: product.id,
        barcode: product.barcode,
        code: product.code,
        name: product.name,
        thumbUrl: first ? catalogImageDto(first).thumbUrl : null,
        quantity,
        caseQuantity: product.caseQuantity,
        stock: product.stockStatus,
        ...priceLine(quantity, product.listPrice, product.vatRate, rates.general, rates.byGroup.get(product.groupId)),
      };
      return { product, line };
    });
    const lines = items.map((i) => i.line);
    return {
      view: {
        lines,
        summary: summarize(lines),
        warnings: lines
          .filter((l) => l.stock === 'out_of_stock')
          .map((l) => ({ code: 'OUT_OF_STOCK' as const, productId: l.productId, name: l.name })),
        removed,
        adjusted,
      },
      items,
    };
  }

  private async removeRow(tx: Tx, dealerId: string, productId: string): Promise<void> {
    await tx.delete(cartItems).where(and(eq(cartItems.dealerId, dealerId), eq(cartItems.productId, productId)));
  }
}
