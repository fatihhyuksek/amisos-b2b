// K-86: veriye dayalı öne çıkarma. En çok satanlar (son 90 gün, iptal hariç), en çok incelenenler ve yükselenler.
// Sonuçlar 10 dakika önbelleklenir (tek SQL); yalnızca aktif ürün ve aktif grup, satışı olmayan ürün asla.
import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { SOLD_ORDERS } from '../common/day-sql.js';
import { DB, type Database } from '../database/database.module.js';

export const BEST_SELLER_DAYS = 90;
/** `isBestSeller` rozeti: en çok satan ilk N ürün. */
export const BEST_SELLER_BADGE_COUNT = 20;
export const HIGHLIGHT_MAX = 24;
const CACHE_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const MIN_TREND_VIEWS = 5;

export interface Highlights {
  bestSellers: string[];
  mostViewed: string[];
  trending: string[];
}

/** `order by` için: son 90 günde (iptal hariç) satılan adet; `products` tablosuna göre ilişkili alt sorgu. */
export const soldQuantity90dSql = (productIdCol: SQL, now: Date): SQL =>
  sql`coalesce((select sum(ol.quantity) from order_lines ol join orders o on o.id = ol.order_id
    where ol.product_id = ${productIdCol} and ${SOLD_ORDERS}
      and o.submitted_at >= ${new Date(now.getTime() - BEST_SELLER_DAYS * DAY_MS).toISOString()}::timestamptz), 0)`;

@Injectable()
export class PopularityService {
  private cache: { at: number; value: Highlights } | null = null;
  private pending: Promise<Highlights> | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Testler ve yönetim işlemleri için önbelleği düşürür. */
  clearCache(): void {
    this.cache = null;
    this.pending = null;
  }

  async bestSellerBadgeIds(): Promise<Set<string>> {
    return new Set((await this.highlights(HIGHLIGHT_MAX)).bestSellers.slice(0, BEST_SELLER_BADGE_COUNT));
  }

  async highlights(limit: number): Promise<Highlights> {
    const now = this.clock.now().getTime();
    if (!this.cache || now - this.cache.at >= CACHE_MS) {
      this.pending ??= this.compute().finally(() => {
        this.pending = null;
      });
      const value = await this.pending;
      this.cache = { at: now, value };
    }
    const v = this.cache.value;
    return {
      bestSellers: v.bestSellers.slice(0, limit),
      mostViewed: v.mostViewed.slice(0, limit),
      trending: v.trending.slice(0, limit),
    };
  }

  private async ids(query: SQL): Promise<string[]> {
    return (await this.db.execute<{ id: string }>(query)).rows.map((r) => r.id);
  }

  private async compute(): Promise<Highlights> {
    const now = this.clock.now();
    const iso = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
    const activeProduct = sql`p.is_active and g.is_active`;
    const [bestSellers, mostViewed, trending] = await Promise.all([
      this.ids(sql`
        select ol.product_id as id
        from order_lines ol
        join orders o on o.id = ol.order_id
        join products p on p.id = ol.product_id
        join product_groups g on g.id = p.group_id
        where ${SOLD_ORDERS} and o.submitted_at >= ${iso(BEST_SELLER_DAYS)}::timestamptz and ${activeProduct}
        group by ol.product_id, p.name
        having sum(ol.quantity) > 0
        order by sum(ol.quantity) desc, lower(p.name), ol.product_id
        limit ${HIGHLIGHT_MAX}`),
      this.ids(sql`
        select e.product_id as id
        from analytics_events e
        join products p on p.id = e.product_id
        join product_groups g on g.id = p.group_id
        where e.type = 'product_view' and e.occurred_at >= ${iso(30)}::timestamptz and ${activeProduct}
        group by e.product_id, p.name
        order by count(*) desc, lower(p.name), e.product_id
        limit ${HIGHLIGHT_MAX}`),
      this.ids(sql`
        select t.product_id as id from (
          select e.product_id,
                 count(*) filter (where e.occurred_at >= ${iso(7)}::timestamptz) as cur,
                 count(*) filter (where e.occurred_at < ${iso(7)}::timestamptz) as prev
          from analytics_events e
          where e.type = 'product_view' and e.product_id is not null and e.occurred_at >= ${iso(14)}::timestamptz
          group by e.product_id) t
        join products p on p.id = t.product_id
        join product_groups g on g.id = p.group_id
        where t.cur >= ${MIN_TREND_VIEWS} and ${activeProduct}
        order by t.cur::float8 / greatest(t.prev, 1) desc, t.cur desc, lower(p.name), t.product_id
        limit ${HIGHLIGHT_MAX}`),
    ]);
    return { bestSellers, mostViewed, trending };
  }
}
