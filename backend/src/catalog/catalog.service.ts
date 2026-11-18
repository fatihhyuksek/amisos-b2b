// Bayi kataloğu. GR-URN-003, GR-FIY-001, GR-FIY-002; K-10, K-13, K-18, K-40.
// Fiyat yalnızca bayi oturumunda (K-66), sunucuda hesaplanır; oturumsuz/Admin görünümünde alanlar null. Stok adedi hiçbir yerde dönmez (K-18).
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { DB, type Database } from '../database/database.module.js';
import {
  dealerFavorites,
  dealerGroupDiscounts,
  dealers,
  productGroups,
  productSlugRedirects,
  products,
} from '../database/schema.js';
import { Money } from '../common/money.js';
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
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

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
        slug: productGroups.slug,
        description: productGroups.description,
        seoTitle: productGroups.seoTitle,
        seoDescription: productGroups.seoDescription,
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

  /** K-82: grup sayfası; yalnızca aktif grup (içinde ürün olmasa da). Bilinmeyen/pasif 404. */
  async groupBySlug(slug: string) {
    const [g] = await this.db
      .select({
        id: productGroups.id,
        name: productGroups.name,
        slug: productGroups.slug,
        description: productGroups.description,
        seoTitle: productGroups.seoTitle,
        seoDescription: productGroups.seoDescription,
        productCount: sql<number>`(select count(*)::int from products p where p.group_id = product_groups.id and p.is_active)`,
        thumbMediaId: sql<string | null>`(
          select pi.media_id from product_images pi
          join products tp on tp.id = pi.product_id
          where tp.group_id = product_groups.id and tp.is_active
          order by lower(tp.name), tp.id, pi.sort_order, pi.created_at, pi.id
          limit 1)`,
      })
      .from(productGroups)
      .where(and(eq(productGroups.slug, slug), eq(productGroups.isActive, true)));
    if (!g) throw new NotFoundException('Ürün grubu bulunamadı.');
    const { thumbMediaId, ...rest } = g;
    return { ...rest, thumbUrl: thumbMediaId ? mediaThumbUrl(thumbMediaId) : null };
  }

  /**
   * K-82: ürün sayfası. Eski (değiştirilmiş) slug ise `{ redirectTo }` ile 200; bilinmeyen veya pasif ürün 404.
   * Fiyat kuralı `get` ile aynıdır (yalnızca bayi oturumunda).
   */
  async productBySlug(dealerId: string | null, slug: string) {
    const [row] = await this.db
      .select({ id: products.id })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(and(eq(products.slug, slug), eq(products.isActive, true), eq(productGroups.isActive, true)));
    if (row) return this.get(dealerId, row.id);
    const [old] = await this.db
      .select({ slug: products.slug })
      .from(productSlugRedirects)
      .innerJoin(products, eq(products.id, productSlugRedirects.productId))
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(and(eq(productSlugRedirects.slug, slug), eq(products.isActive, true), eq(productGroups.isActive, true)));
    if (old) return { redirectTo: old.slug };
    throw new NotFoundException('Ürün bulunamadı.');
  }

  /**
   * K-66: `dealerId` null ise (oturumsuz veya Admin oturumu) fiyat, iskonto, stok ve KDV alanları null döner
   * ve stok/fiyat sıralaması ile `stock` filtresi uygulanmaz; hiçbir yan kanaldan fiyat/stok bilgisi sızmaz.
   */
  async list(dealerId: string | null, query: CatalogListQuery) {
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
    if (dealerId && query.stock === 'in_stock') filters.push(eq(products.stockStatus, 'in_stock'));
    if (query.featured) filters.push(eq(products.isFeatured, true));
    if (query.new) filters.push(gte(products.createdAt, this.newCutoff()));
    const where = and(...filters);

    // Bayinin genel ve grup oranları tek sorguda (ürün başına sorgu yok).
    const rates = dealerId ? await this.ratesFor(dealerId) : null;

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(where);
    const order: SQL[] = [];
    if (query.q) order.push(sql`case when ${products.barcode} = ${query.q} then 0 else 1 end`);
    const byName = [asc(sql`lower(${products.name})`), asc(products.id)];
    let sortBy: SQL[];
    if (query.sort === 'newest') {
      sortBy = [desc(products.createdAt), desc(products.id)];
    } else if ((query.sort === 'price_asc' || query.sort === 'price_desc') && dealerId && rates) {
      // Sıralama yalnızca bayinin kendi fiyatına göre (iskontolu birim fiyat); oturumsuzda isme göre.
      const price = dealerPriceSql(dealerId, rates.general);
      // K-79: fiyatı girilmemiş ürünler her iki yönde de sona düşer.
      sortBy = [asc(sql`case when ${products.listPrice} = 0 then 1 else 0 end`), query.sort === 'price_asc' ? asc(price) : desc(price), ...byName];
    } else {
      sortBy = byName;
    }
    const rows = await this.db
      .select({ product: products, groupName: productGroups.name, groupSlug: productGroups.slug })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(where)
      .orderBy(...order, ...sortBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return {
      items: await this.toItems(rows, dealerId, rates),
      total,
      page: query.page,
      pageSize: query.pageSize,
      priceVisible: dealerId !== null,
    };
  }

  async get(dealerId: string | null, id: string) {
    const [row] = await this.db
      .select({ product: products, groupName: productGroups.name, groupSlug: productGroups.slug })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(and(eq(products.id, id), eq(products.isActive, true), eq(productGroups.isActive, true)));
    if (!row) throw new NotFoundException('Ürün bulunamadı.');
    const [item] = await this.toItems([row], dealerId, dealerId ? await this.ratesFor(dealerId) : null);
    return { ...item, priceVisible: dealerId !== null };
  }

  /** K-70: bayinin favorileri (en son eklenen önce); pasif ürün/grup listelenmez. */
  async favorites(dealerId: string) {
    const rows = await this.db
      .select({ product: products, groupName: productGroups.name, groupSlug: productGroups.slug })
      .from(dealerFavorites)
      .innerJoin(products, eq(products.id, dealerFavorites.productId))
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(and(eq(dealerFavorites.dealerId, dealerId), eq(products.isActive, true), eq(productGroups.isActive, true)))
      .orderBy(desc(dealerFavorites.createdAt), desc(products.id));
    return { items: await this.toItems(rows, dealerId, await this.ratesFor(dealerId)) };
  }

  /** K-70: favori ekle (idempotent); pasif/bilinmeyen ürün 404. */
  async addFavorite(dealerId: string, productId: string): Promise<void> {
    const [p] = await this.db
      .select({ id: products.id })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(and(eq(products.id, productId), eq(products.isActive, true), eq(productGroups.isActive, true)));
    if (!p) throw new NotFoundException('Ürün bulunamadı.');
    await this.db.insert(dealerFavorites).values({ dealerId, productId }).onConflictDoNothing();
  }

  async removeFavorite(dealerId: string, productId: string): Promise<void> {
    await this.db
      .delete(dealerFavorites)
      .where(and(eq(dealerFavorites.dealerId, dealerId), eq(dealerFavorites.productId, productId)));
  }

  /** K-74: "Yeni" rozeti ve `new=true` süzgeci için eşik (son 30 gün, sunucu saati). */
  private newCutoff(): Date {
    return new Date(this.clock.now().getTime() - NEW_PRODUCT_DAYS * 24 * 3_600_000);
  }

  private async toItems(
    rows: { product: ProductRow; groupName: string; groupSlug: string }[],
    dealerId: string | null,
    rates: DealerRates | null,
  ) {
    const ids = rows.map((r) => r.product.id);
    const images = await loadImages(this.db, ids);
    const favorites = new Set<string>();
    if (dealerId && ids.length > 0) {
      const fav = await this.db
        .select({ productId: dealerFavorites.productId })
        .from(dealerFavorites)
        .where(and(eq(dealerFavorites.dealerId, dealerId), inArray(dealerFavorites.productId, ids)));
      for (const f of fav) favorites.add(f.productId);
    }
    const cutoff = this.newCutoff();
    return rows.map((r) =>
      this.toDto(r.product, r.groupName, r.groupSlug, rates, images.get(r.product.id) ?? [], {
        isFavorite: favorites.has(r.product.id),
        isNew: r.product.createdAt >= cutoff,
      }),
    );
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
    groupSlug: string,
    rates: DealerRates | null,
    images: { mediaId: string; sortOrder: number }[],
    flags: { isFavorite: boolean; isNew: boolean },
  ) {
    // K-66: oturumsuz/Admin görünümünde fiyat, iskonto, stok ve KDV alanları null (alan adları korunur).
    const priced = rates
      ? calculateDealerPrice(row.listPrice, rates.general, rates.byGroup.get(row.groupId))
      : null;
    return {
      id: row.id,
      name: row.name,
      barcode: row.barcode,
      code: row.code,
      description: row.description,
      groupId: row.groupId,
      groupName,
      groupSlug,
      slug: row.slug,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      // K-79: liste fiyatı 0 = "fiyat sorunuz"; oturumsuzda da döner (fiyat gizli olsa bile).
      priceOnRequest: isPriceOnRequest(row.listPrice),
      caseQuantity: row.caseQuantity,
      stock: rates ? row.stockStatus : null,
      listPrice: rates ? row.listPrice : null,
      price: priced ? priced.price : null,
      discountPercent: priced ? priced.discountPercent : null,
      vatRate: rates ? row.vatRate : null,
      isFeatured: row.isFeatured,
      isNew: flags.isNew,
      isFavorite: flags.isFavorite,
      images: images.map(catalogImageDto),
    };
  }
}

/** K-79: liste fiyatı 0 olan ürün "fiyat sorunuz" ürünüdür. */
export const isPriceOnRequest = (listPrice: string): boolean => new Money(listPrice).isZero();

/** K-74: son 30 gün içinde eklenen ürünler "Yeni". */
export const NEW_PRODUCT_DAYS = 30;

/**
 * Sıralama için bayinin iskontolu birim fiyatı (SQL). Gösterilen fiyatla (calculateDealerPrice) aynı kural:
 * genel ve grup oranından yüksek olan, 2 basamağa yuvarlanmış. Yalnızca ORDER BY'da kullanılır.
 */
function dealerPriceSql(dealerId: string, general: string | null): SQL {
  const pct = sql`greatest(coalesce(${general}::numeric, 0), coalesce((select ddg.discount_percent from dealer_group_discounts ddg where ddg.dealer_id = ${dealerId}::uuid and ddg.group_id = ${products.groupId}), 0))`;
  return sql`round(${products.listPrice} * (100 - ${pct}) / 100, 2)`;
}
