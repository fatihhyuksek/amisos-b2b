// Genel arama (K-78): GET /api/admin/search?q=. Sipariş, bayi ve ürün; her türden en fazla 6, Türkçe harf duyarsız.
import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq, or, sql } from 'drizzle-orm';
import { loadImages } from '../catalog/product-images.js';
import { productSearch } from '../catalog/products.service.js';
import { escapeLike, foldSql, foldTr } from '../common/like.js';
import { DB, type Database } from '../database/database.module.js';
import { dealers, orders, products } from '../database/schema.js';
import { mediaThumbUrl } from '../media/media.urls.js';

export const SEARCH_LIMIT = 6;

@Injectable()
export class SearchService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async search(q: string) {
    const [orderRows, dealerRows, productRows] = await Promise.all([this.orders(q), this.dealers(q), this.products(q)]);
    const images = await loadImages(
      this.db,
      productRows.map((p) => p.id),
    );
    return {
      orders: orderRows,
      dealers: dealerRows,
      products: productRows.map(({ ...p }) => {
        const first = images.get(p.id)?.[0];
        return { ...p, thumbUrl: first ? mediaThumbUrl(first.mediaId) : null };
      }),
    };
  }

  /** Numara tam/önek eşleşmesi (`#1234` da olur) veya bayi unvanı/yetkilisi. */
  private async orders(q: string) {
    const folded = `%${escapeLike(foldTr(q))}%`;
    const digits = q.replace(/^#/, '');
    const byDealer = or(sql`${foldSql(dealers.companyTitle)} like ${folded}`, sql`${foldSql(dealers.contactName)} like ${folded}`);
    const where = /^\d+$/.test(digits)
      ? or(sql`${orders.orderNo}::text like ${`${digits}%`}`, byDealer)
      : byDealer;
    const rows = await this.db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        dealerName: dealers.companyTitle,
        status: orders.status,
        grandTotal: orders.grandTotal,
        submittedAt: orders.submittedAt,
      })
      .from(orders)
      .innerJoin(dealers, eq(dealers.id, orders.dealerId))
      .where(where)
      .orderBy(desc(orders.submittedAt), desc(orders.orderNo))
      .limit(SEARCH_LIMIT);
    return rows.map((r) => ({ ...r, submittedAt: r.submittedAt.toISOString() }));
  }

  /** Unvan, yetkili, e-posta, telefon (rakamlar: boşluk ve işaretten bağımsız). */
  private dealers(q: string) {
    const folded = `%${escapeLike(foldTr(q))}%`;
    const phoneDigits = q.replace(/\D/g, '');
    const where = or(
      sql`${foldSql(dealers.companyTitle)} like ${folded}`,
      sql`${foldSql(dealers.contactName)} like ${folded}`,
      sql`${foldSql(dealers.email)} like ${folded}`,
      sql`${dealers.phone} like ${`%${escapeLike(q)}%`}`,
      phoneDigits.length >= 3
        ? sql`regexp_replace(${dealers.phone}, '\\D', '', 'g') like ${`%${phoneDigits}%`}`
        : undefined,
    );
    return this.db
      .select({
        id: dealers.id,
        companyTitle: dealers.companyTitle,
        contactName: dealers.contactName,
        city: dealers.city,
        status: dealers.status,
      })
      .from(dealers)
      .where(where)
      .orderBy(asc(sql`lower(${dealers.companyTitle})`), asc(dealers.id))
      .limit(SEARCH_LIMIT);
  }

  private products(q: string) {
    return this.db
      .select({
        id: products.id,
        name: products.name,
        barcode: products.barcode,
        code: products.code,
        isActive: products.isActive,
      })
      .from(products)
      .where(productSearch(q))
      .orderBy(sql`case when ${products.barcode} = ${q} then 0 else 1 end`, asc(sql`lower(${products.name})`), asc(products.id))
      .limit(SEARCH_LIMIT);
  }
}
