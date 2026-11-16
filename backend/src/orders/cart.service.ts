// Kalıcı sepet. GR-SIP-003, GR-SIP-004, GR-SIP-008, GR-FIY-001, GR-FIY-003; K-20, K-21, K-38, K-41, K-44.
// Fiyat sepette saklanmaz: her görünümde güncel iskontoyla hesaplanır. Pasif ürünler sepetten düşer,
// koli içi adedi değişen satırlar yeni koli katına yukarı yuvarlanır (ikisi de yanıtta bildirilir).
import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { catalogImageDto, loadImages } from '../catalog/product-images.js';
import { lockDealerCart, type Tx } from '../common/advisory-lock.js';
import { DB, type Database } from '../database/database.module.js';
import { cartItems, dealers, orders, productGroups, products } from '../database/schema.js';
import { loadDealerRates } from '../pricing/dealer-rates.js';
import { MAX_QUANTITY, type QuickAddInput } from './orders.schemas.js';
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
  /** Satırların (productId, quantity, unitPrice) özeti; sipariş gönderiminde `expectedVersion` ile doğrulanır. */
  version: string;
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

  /**
   * K-71: barkod veya ürün koduyla çok satırlı ekleme. Her satır ayrı değerlendirilir (kısmi başarı);
   * aynı ürün birden çok satırda gelirse adetler toplanır, toplam koli katına yukarı yuvarlanır ve sepetteki
   * adede eklenir (GR-SIP-004). Eşleşme: önce barkod, sonra kod (büyük/küçük harf duyarsız). Tek transaction.
   */
  quickAdd(dealerId: string, input: QuickAddInput) {
    return this.db.transaction(async (tx) => {
      await lockDealerCart(tx, dealerId);
      const queries = [...new Set(input.lines.map((l) => l.query).filter((q) => q.length > 0))];
      const found =
        queries.length === 0
          ? []
          : await tx
              .select({ product: products, groupActive: productGroups.isActive })
              .from(products)
              .innerJoin(productGroups, eq(productGroups.id, products.groupId))
              .where(
                or(
                  inArray(
                    sql`lower(${products.barcode})`,
                    queries.map((q) => q.toLowerCase()),
                  ),
                  inArray(
                    sql`lower(${products.code})`,
                    queries.map((q) => q.toLowerCase()),
                  ),
                ),
              );
      type Found = (typeof found)[number];
      const byBarcode = new Map<string, Found[]>();
      const byCode = new Map<string, Found[]>();
      const push = (m: Map<string, Found[]>, key: string, f: Found) => m.set(key, [...(m.get(key) ?? []), f]);
      for (const f of found) {
        push(byBarcode, f.product.barcode.toLowerCase(), f);
        if (f.product.code) push(byCode, f.product.code.toLowerCase(), f);
      }
      const isActive = (f: Found) => f.product.isActive && f.groupActive;
      /** Önce barkod (aktif), sonra kod (aktif); biri birden çok aktif ürüne uyarsa AMBIGUOUS. */
      const resolve = (query: string): { match: Found } | { error: 'NOT_FOUND' | 'INACTIVE' | 'AMBIGUOUS' } => {
        const key = query.toLowerCase();
        const barcodes = byBarcode.get(key) ?? [];
        const codes = byCode.get(key) ?? [];
        for (const group of [barcodes, codes]) {
          const active = group.filter(isActive);
          if (active.length === 1) return { match: active[0] };
          if (active.length > 1) return { error: 'AMBIGUOUS' };
        }
        return { error: barcodes.length + codes.length > 0 ? 'INACTIVE' : 'NOT_FOUND' };
      };

      const errors: { index: number; query: string; code: 'NOT_FOUND' | 'INACTIVE' | 'INVALID_QUANTITY' | 'AMBIGUOUS' }[] = [];
      const grouped = new Map<string, { product: ProductRow; firstIndex: number; requested: number }>();
      for (const [index, line] of input.lines.entries()) {
        const resolved = line.query ? resolve(line.query) : ({ error: 'NOT_FOUND' } as const);
        if ('error' in resolved) {
          errors.push({ index, query: line.query, code: resolved.error });
          continue;
        }
        const match = resolved.match;
        if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
          errors.push({ index, query: line.query, code: 'INVALID_QUANTITY' });
          continue;
        }
        const entry = grouped.get(match.product.id);
        if (entry) entry.requested += line.quantity;
        else grouped.set(match.product.id, { product: match.product, firstIndex: index, requested: line.quantity });
      }

      const existing = new Map(
        (await tx.select().from(cartItems).where(eq(cartItems.dealerId, dealerId))).map((c) => [c.productId, c.quantity]),
      );
      const added: {
        index: number;
        productId: string;
        name: string;
        barcode: string;
        requested: number;
        quantity: number;
        caseQuantity: number;
        outOfStock: boolean;
      }[] = [];
      for (const { product, firstIndex, requested } of grouped.values()) {
        const quantity = roundUpToCase(requested, product.caseQuantity);
        const total = (existing.get(product.id) ?? 0) + quantity;
        if (total > MAX_QUANTITY) {
          // Sepet üst sınırı aşılıyor: satır eklenmez (sepet değişmez).
          errors.push({ index: firstIndex, query: product.barcode, code: 'INVALID_QUANTITY' });
          continue;
        }
        await tx
          .insert(cartItems)
          .values({ dealerId, productId: product.id, quantity: total })
          .onConflictDoUpdate({
            target: [cartItems.dealerId, cartItems.productId],
            set: { quantity: total, updatedAt: new Date() },
          });
        added.push({
          index: firstIndex,
          productId: product.id,
          name: product.name,
          barcode: product.barcode,
          requested,
          quantity,
          caseQuantity: product.caseQuantity,
          outOfStock: product.stockStatus === 'out_of_stock',
        });
      }
      added.sort((a, b) => a.index - b.index);
      errors.sort((a, b) => a.index - b.index);
      return { added, errors, cart: (await this.snapshot(tx, dealerId)).view };
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
        version: cartVersion(lines),
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

/** Deterministik sepet sürümü: productId sıralı (productId, quantity, unitPrice) listesinin sha256'sı (ilk 16 hex). */
export function cartVersion(lines: Pick<CartLine, 'productId' | 'quantity' | 'unitPrice'>[]): string {
  const canonical = lines
    .map((l) => [l.productId, l.quantity, l.unitPrice] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}
