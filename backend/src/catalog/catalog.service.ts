// Bayi kataloğu. GR-URN-003, GR-FIY-001, GR-FIY-002; K-10, K-13, K-18, K-40.
// Fiyat yalnızca DealerGuard arkasında, sunucuda hesaplanır. Stok adedi hiçbir yerde dönmez (K-18).
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module.js';
import { dealerGroupDiscounts, dealers, productGroups, products } from '../database/schema.js';
import { calculateDealerPrice } from '../pricing/pricing.service.js';
import type { CatalogListQuery } from './catalog.schemas.js';
import { catalogImageDto, loadImages } from './product-images.js';
import { mediaThumbUrl } from '../media/media.urls.js';
import { productSearch } from './products.service.js';

type ProductRow = typeof products.$inferSelect;

interface DealerRates {
  general: string | null;
  byGroup: Map<string, string>;
}

@Injectable()
export class CatalogService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async groups() {
    // thumbUrl: grubun aktif ürünleri içinde (ad sırasıyla) ilk görselli ürünün ilk görseli; tek sorgu.
    const thumbMediaId = sql<string | null>`(
      select pi.media_id from product_images pi
      join products tp on tp.id = pi.product_id
      where tp.group_id = ${productGroups.id} and tp.is_active
      order by lower(tp.name), tp.id, pi.sort_order, pi.created_at, pi.id
      limit 1)`;
    const rows = await this.db
      .select({
        id: productGroups.id,
        name: productGroups.name,
        productCount: sql<number>`count(${products.id})::int`,
        thumbMediaId,
      })
      .from(productGroups)
      .innerJoin(products, and(eq(products.groupId, productGroups.id), eq(products.isActive, true)))
      .where(eq(productGroups.isActive, true))
      .groupBy(productGroups.id)
      .orderBy(asc(productGroups.sortOrder), asc(productGroups.name), asc(productGroups.id));
    return rows.map(({ thumbMediaId, ...g }) => ({
      ...g,
      thumbUrl: thumbMediaId ? mediaThumbUrl(thumbMediaId) : null,
    }));
  }

  async list(dealerId: string, query: CatalogListQuery) {
    const filters: (SQL | undefined)[] = [eq(products.isActive, true), eq(productGroups.isActive, true)];
    if (query.q) {
      // GR-URN-003: q aktif bir ürünün barkoduyla birebir eşleşiyorsa yalnızca o ürün döner.
      const [exact] = await this.db
        .select({ id: products.id })
        .from(products)
        .innerJoin(productGroups, eq(productGroups.id, products.groupId))
        .where(and(eq(products.barcode, query.q), eq(products.isActive, true), eq(productGroups.isActive, true)));
      filters.push(exact ? eq(products.barcode, query.q) : productSearch(query.q));
    }
    if (query.groupId) filters.push(eq(products.groupId, query.groupId));
    const where = and(...filters);

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(where);
    const order: SQL[] = [];
    if (query.q) order.push(sql`case when ${products.barcode} = ${query.q} then 0 else 1 end`);
    const rows = await this.db
      .select({ product: products, groupName: productGroups.name })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(where)
      .orderBy(
        ...order,
        ...(query.sort === 'newest'
          ? [desc(products.createdAt), desc(products.id)]
          : [asc(sql`lower(${products.name})`), asc(products.id)]),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    // Bayinin genel ve grup oranları tek sorguda (ürün başına sorgu yok).
    const rates = await this.ratesFor(dealerId);
    const images = await loadImages(
      this.db,
      rows.map((r) => r.product.id),
    );
    return {
      items: rows.map((r) => this.toDto(r.product, r.groupName, rates, images.get(r.product.id) ?? [])),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(dealerId: string, id: string) {
    const [row] = await this.db
      .select({ product: products, groupName: productGroups.name })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(and(eq(products.id, id), eq(products.isActive, true), eq(productGroups.isActive, true)));
    if (!row) throw new NotFoundException('Ürün bulunamadı.');
    const rates = await this.ratesFor(dealerId);
    const images = await loadImages(this.db, [id]);
    return this.toDto(row.product, row.groupName, rates, images.get(id) ?? []);
  }

  private async ratesFor(dealerId: string): Promise<DealerRates> {
    const rows = await this.db
      .select({
        general: dealers.generalDiscountPercent,
        groupId: dealerGroupDiscounts.groupId,
        percent: dealerGroupDiscounts.discountPercent,
      })
      .from(dealers)
      .leftJoin(dealerGroupDiscounts, eq(dealerGroupDiscounts.dealerId, dealers.id))
      .where(eq(dealers.id, dealerId));
    const byGroup = new Map<string, string>();
    for (const r of rows) if (r.groupId && r.percent) byGroup.set(r.groupId, r.percent);
    return { general: rows[0]?.general ?? null, byGroup };
  }

  private toDto(
    row: ProductRow,
    groupName: string,
    rates: DealerRates,
    images: { mediaId: string; sortOrder: number }[],
  ) {
    const { price, discountPercent } = calculateDealerPrice(
      row.listPrice,
      rates.general,
      rates.byGroup.get(row.groupId),
    );
    return {
      id: row.id,
      name: row.name,
      barcode: row.barcode,
      code: row.code,
      description: row.description,
      groupId: row.groupId,
      groupName,
      caseQuantity: row.caseQuantity,
      stock: row.stockStatus,
      listPrice: row.listPrice,
      price,
      discountPercent,
      vatRate: row.vatRate,
      images: images.map(catalogImageDto),
    };
  }
}
