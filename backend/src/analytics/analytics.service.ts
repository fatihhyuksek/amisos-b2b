// K-85: analitik okuma sorguları. Her uç birkaç tek-SQL toplama ile çalışır (N+1 yok); gün sınırları ve
// "iptal hariç" koşulu rapor servisiyle ortaktır (common/day-sql.ts). Tüm sayımlar `analytics_events` üstünde,
// indeks: (occurred_at), (type, occurred_at), (dealer_id, occurred_at), (product_id, occurred_at).
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { endOf, inPeriod, isoSql, SOLD_ORDERS, startOf, TZ } from '../common/day-sql.js';
import { Money } from '../common/money.js';
import { DB, type Database } from '../database/database.module.js';
import { mediaThumbUrl } from '../media/media.urls.js';
import { istanbulToday, periodLengthDays, previousPeriod, type DayPeriod } from '../reports/periods.js';
import { ACTIVE_WINDOW_MINUTES, CLIENT_EVENT_TYPES } from './analytics.constants.js';
import { MAX_PERIOD_DAYS, type AnalyticsPeriodQuery, type AnalyticsProductsQuery, type DealerActivityQuery } from './analytics.schemas.js';

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number): string =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);

/** `e` takma adlı olay satırı istemci kaynaklı mı (sunucu olayları ziyaretçi/oturum sayımına girmez). */
const CLIENT: SQL = sql`e.type in (${sql.join(CLIENT_EVENT_TYPES.map((t) => sql`${t}`), sql`, `)})`;

export interface Comparative {
  current: number;
  previous: number;
  percent: number | null;
}

export function compare(current: number, previous: number): Comparative {
  return {
    current,
    previous,
    percent: previous === 0 ? null : new Money(current).minus(previous).div(previous).times(100).toDecimalPlaces(1, Money.ROUND_HALF_UP).toNumber(),
  };
}

/** Yüzde, 1 ondalık; payda 0 ise 0. */
export function ratePercent(part: number, whole: number): number {
  return whole === 0 ? 0 : new Money(part).div(whole).times(100).toDecimalPlaces(1, Money.ROUND_HALF_UP).toNumber();
}

type Row = Record<string, string | number | null>;

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async rows<T = Row>(query: SQL): Promise<T[]> {
    return (await this.db.execute<T & Record<string, unknown>>(query)).rows as T[];
  }

  /** Varsayılan son 30 gün (bugün dahil); en fazla 400 gün. */
  resolvePeriod(query: AnalyticsPeriodQuery): { period: DayPeriod; previous: DayPeriod } {
    const today = istanbulToday(this.clock.now());
    const to = query.to ?? today;
    const from = query.from ?? addDays(to, -29);
    const fail = (message: string) =>
      new BadRequestException({ statusCode: 400, code: 'VALIDATION', message, fields: { from: message } });
    if (from > to) throw fail('Başlangıç tarihi bitişten sonra olamaz.');
    if (periodLengthDays({ from, to }) > MAX_PERIOD_DAYS) throw fail(`Dönem en fazla ${MAX_PERIOD_DAYS} gün olabilir.`);
    return { period: { from, to }, previous: previousPeriod({ from, to }) };
  }

  // --- Genel bakış ------------------------------------------------------------

  async overview(query: AnalyticsPeriodQuery) {
    const { period, previous } = this.resolvePeriod(query);
    const all: DayPeriod = { from: previous.from, to: period.to };
    const e = sql`e.occurred_at`;
    const inCur = inPeriod(e, period);
    const inPrev = inPeriod(e, previous);

    const [daily, sessionRows, dealerRows, orderDays, deviceRows, referrerRows, pageRows, hourRows] = await Promise.all([
      // Gün bazında: tek tarama, önceki + mevcut dönem bitişiktir.
      this.rows<{ day: string; visitors: number; sessions: number; page_views: number; dealer_visitors: number; product_views: number; searches: number; add_to_carts: number }>(sql`
        select to_char((e.occurred_at at time zone ${TZ})::date, 'YYYY-MM-DD') as day,
               count(distinct e.visitor_key) filter (where ${CLIENT})::int as visitors,
               count(distinct e.session_key) filter (where ${CLIENT})::int as sessions,
               count(*) filter (where e.type = 'page_view')::int as page_views,
               count(distinct e.dealer_id) filter (where ${CLIENT} and e.dealer_id is not null)::int as dealer_visitors,
               count(*) filter (where e.type = 'product_view')::int as product_views,
               count(*) filter (where e.type = 'search')::int as searches,
               count(*) filter (where e.type = 'add_to_cart')::int as add_to_carts
        from analytics_events e
        where ${inPeriod(e, all)}
        group by 1`),
      // Oturum bazında bayraklar (huni + dönem toplam oturum + sipariş veren oturum); iptal edilen sipariş sayılmaz.
      this.rows<Record<string, number>>(sql`
        with s as (
          select e.session_key,
                 bool_or(${CLIENT} and ${inCur}) as cur_in,
                 bool_or(e.type = 'product_view' and ${inCur}) as cur_pv,
                 bool_or(e.type = 'add_to_cart' and ${inCur}) as cur_ac,
                 bool_or(e.type = 'order_submitted' and ${SOLD_ORDERS} and ${inCur}) as cur_or,
                 bool_or(${CLIENT} and ${inPrev}) as prev_in,
                 bool_or(e.type = 'order_submitted' and ${SOLD_ORDERS} and ${inPrev}) as prev_or
          from analytics_events e
          left join orders o on o.id = e.order_id
          where ${inPeriod(e, all)}
          group by e.session_key)
        select count(*) filter (where cur_in)::int as cur_sessions,
               count(*) filter (where cur_in and (cur_pv or cur_ac or cur_or))::int as cur_product_view,
               count(*) filter (where cur_in and (cur_ac or cur_or))::int as cur_add_to_cart,
               count(*) filter (where cur_in and cur_or)::int as cur_order,
               count(*) filter (where prev_in)::int as prev_sessions,
               count(*) filter (where prev_in and prev_or)::int as prev_order
        from s`),
      this.rows<{ cur: number; prev: number }>(sql`
        select count(distinct e.dealer_id) filter (where ${inCur})::int as cur,
               count(distinct e.dealer_id) filter (where ${inPrev})::int as prev
        from analytics_events e
        where e.dealer_id is not null and ${CLIENT} and ${inPeriod(e, all)}`),
      this.rows<{ day: string; n: number }>(sql`
        select to_char((o.submitted_at at time zone ${TZ})::date, 'YYYY-MM-DD') as day, count(*)::int as n
        from orders o
        where ${SOLD_ORDERS} and ${inPeriod(sql`o.submitted_at`, all)}
        group by 1`),
      this.rows<{ device: string; n: number }>(sql`
        select device, count(*)::int as n from (
          select (array_agg(e.device order by e.occurred_at))[1] as device
          from analytics_events e where ${CLIENT} and ${inCur} group by e.session_key) t
        group by device`),
      this.rows<{ host: string | null; n: number }>(sql`
        select host, count(*)::int as n from (
          select (array_agg(e.referrer_host order by e.occurred_at) filter (where e.referrer_host is not null))[1] as host
          from analytics_events e where ${CLIENT} and ${inCur} group by e.session_key) t
        group by host order by n desc, host nulls last`),
      this.rows<{ path: string; page_views: number; visitors: number }>(sql`
        select e.path, count(*)::int as page_views, count(distinct e.visitor_key)::int as visitors
        from analytics_events e where e.type = 'page_view' and ${inCur}
        group by e.path order by page_views desc, e.path limit 15`),
      this.rows<{ hour: number; n: number }>(sql`
        select extract(hour from e.occurred_at at time zone ${TZ})::int as hour, count(*)::int as n
        from analytics_events e where e.type = 'page_view' and ${inCur}
        group by 1`),
    ]);

    const byDay = new Map(daily.map((r) => [r.day, r]));
    const ordersByDay = new Map(orderDays.map((r) => [r.day, r.n]));
    const sum = (p: DayPeriod, pick: (day: string) => number): number => {
      let total = 0;
      for (let d = p.from; d <= p.to; d = addDays(d, 1)) total += pick(d);
      return total;
    };
    const metric = (key: 'visitors' | 'page_views' | 'product_views' | 'searches' | 'add_to_carts') =>
      compare(sum(period, (d) => byDay.get(d)?.[key] ?? 0), sum(previous, (d) => byDay.get(d)?.[key] ?? 0));
    const ordersOf = (p: DayPeriod) => sum(p, (d) => ordersByDay.get(d) ?? 0);

    const s = sessionRows[0];
    const sessions = compare(s.cur_sessions, s.prev_sessions);
    const dealers = dealerRows[0] ?? { cur: 0, prev: 0 };

    const dayList: string[] = [];
    for (let d = period.from; d <= period.to; d = addDays(d, 1)) dayList.push(d);

    const deviceTotal = deviceRows.reduce((a, r) => a + r.n, 0);
    const hours = new Map(hourRows.map((r) => [r.hour, r.n]));
    return {
      period,
      previous,
      totals: {
        visitors: metric('visitors'),
        sessions,
        pageViews: metric('page_views'),
        dealerVisitors: compare(dealers.cur, dealers.prev),
        productViews: metric('product_views'),
        searches: metric('searches'),
        addToCarts: metric('add_to_carts'),
        orders: compare(ordersOf(period), ordersOf(previous)),
        conversionRate: compare(ratePercent(s.cur_order, s.cur_sessions), ratePercent(s.prev_order, s.prev_sessions)),
      },
      daily: dayList.map((date) => {
        const r = byDay.get(date);
        return {
          date,
          visitors: r?.visitors ?? 0,
          sessions: r?.sessions ?? 0,
          pageViews: r?.page_views ?? 0,
          dealerVisitors: r?.dealer_visitors ?? 0,
          orders: ordersByDay.get(date) ?? 0,
        };
      }),
      funnel: [
        { step: 'sessions', sessions: s.cur_sessions },
        { step: 'productView', sessions: s.cur_product_view },
        { step: 'addToCart', sessions: s.cur_add_to_cart },
        { step: 'order', sessions: s.cur_order },
      ],
      devices: deviceRows
        .map((r) => ({ device: r.device, sessions: r.n, share: ratePercent(r.n, deviceTotal) }))
        .sort((a, b) => b.sessions - a.sessions || a.device.localeCompare(b.device)),
      referrers: referrerRows.slice(0, 10).map((r) => ({ host: r.host ?? 'Doğrudan', sessions: r.n })),
      topPages: pageRows.map((r) => ({ path: r.path, pageViews: r.page_views, visitors: r.visitors })),
      hours: Array.from({ length: 24 }, (_, hour) => ({ hour, pageViews: hours.get(hour) ?? 0 })),
    };
  }

  // --- Canlı ------------------------------------------------------------------

  async live() {
    const since = new Date(this.clock.now().getTime() - ACTIVE_WINDOW_MINUTES * 60_000).toISOString();
    const [[active], dealers, recent] = await Promise.all([
      this.rows<{ n: number }>(sql`
        select count(distinct e.session_key)::int as n from analytics_events e
        where ${CLIENT} and e.occurred_at >= ${since}::timestamptz`),
      this.rows<{ dealerId: string; companyTitle: string; path: string; lastSeenAt: string }>(sql`
        select * from (
          select distinct on (e.dealer_id) e.dealer_id as "dealerId", d.company_title as "companyTitle", e.path,
                 ${isoSql(sql`e.occurred_at`)} as "lastSeenAt", e.occurred_at as sort_at
          from analytics_events e join dealers d on d.id = e.dealer_id
          where e.dealer_id is not null and e.occurred_at >= ${since}::timestamptz
          order by e.dealer_id, e.occurred_at desc) t
        order by sort_at desc`),
      this.rows<{ type: string; path: string; productName: string | null; query: string | null; dealerName: string | null; at: string }>(sql`
        select e.type, e.path, p.name as "productName", e.query, d.company_title as "dealerName", ${isoSql(sql`e.occurred_at`)} as at
        from analytics_events e
        left join products p on p.id = e.product_id
        left join dealers d on d.id = e.dealer_id
        order by e.id desc limit 20`),
    ]);
    return {
      activeVisitors: active.n,
      activeDealers: dealers.map(({ dealerId, companyTitle, path, lastSeenAt }) => ({ dealerId, companyTitle, path, lastSeenAt })),
      recent: recent.map((r) => ({
        type: r.type,
        path: r.path,
        ...(r.productName ? { productName: r.productName } : {}),
        ...(r.query ? { query: r.query } : {}),
        ...(r.dealerName ? { dealerName: r.dealerName } : {}),
        at: r.at,
      })),
    };
  }

  /** Yönetim paneli ana sayfası için bugün/dün trafik özeti (K-85). */
  async traffic() {
    const now = this.clock.now();
    const today = istanbulToday(now);
    const yesterday = addDays(today, -1);
    const since = new Date(now.getTime() - ACTIVE_WINDOW_MINUTES * 60_000).toISOString();
    const e = sql`e.occurred_at`;
    const [r] = await this.rows<{ today_visitors: number; today_page_views: number; active_now: number; yesterday_visitors: number }>(sql`
      select count(distinct e.visitor_key) filter (where ${CLIENT} and ${inPeriod(e, { from: today, to: today })})::int as today_visitors,
             count(*) filter (where e.type = 'page_view' and ${inPeriod(e, { from: today, to: today })})::int as today_page_views,
             count(distinct e.session_key) filter (where ${CLIENT} and e.occurred_at >= ${since}::timestamptz)::int as active_now,
             count(distinct e.visitor_key) filter (where ${CLIENT} and ${inPeriod(e, { from: yesterday, to: yesterday })})::int as yesterday_visitors
      from analytics_events e
      where e.occurred_at >= ${startOf(yesterday)} and e.occurred_at < ${endOf(today)}`);
    return {
      todayVisitors: r.today_visitors,
      todayPageViews: r.today_page_views,
      activeNow: r.active_now,
      yesterdayVisitors: r.yesterday_visitors,
    };
  }

  // --- Ürünler ----------------------------------------------------------------

  async products(query: AnalyticsProductsQuery) {
    const { period } = this.resolvePeriod(query);
    const sortCol = { views: sql`views`, addToCart: sql`add_to_carts`, ordered: sql`ordered_quantity` }[query.sort];
    const rows = await this.rows<{
      productId: string;
      name: string;
      barcode: string;
      thumbMediaId: string | null;
      views: number;
      uniqueViewers: number;
      addToCarts: number;
      orderedQuantity: number;
      orderCount: number;
    }>(sql`
      with ev as (
        select e.product_id,
               count(*) filter (where e.type = 'product_view')::int as views,
               count(distinct e.visitor_key) filter (where e.type = 'product_view')::int as unique_viewers,
               count(*) filter (where e.type = 'add_to_cart')::int as add_to_carts
        from analytics_events e
        where e.product_id is not null and e.type in ('product_view', 'add_to_cart') and ${inPeriod(sql`e.occurred_at`, period)}
        group by e.product_id),
      ord as (
        select ol.product_id, sum(ol.quantity)::int as ordered_quantity, count(distinct o.id)::int as order_count
        from order_lines ol join orders o on o.id = ol.order_id
        where ${SOLD_ORDERS} and ${inPeriod(sql`o.submitted_at`, period)}
        group by ol.product_id)
      select p.id as "productId", p.name, p.barcode,
             (select pi.media_id from product_images pi where pi.product_id = p.id order by pi.sort_order, pi.created_at, pi.id limit 1) as "thumbMediaId",
             coalesce(ev.views, 0) as views, coalesce(ev.unique_viewers, 0) as "uniqueViewers",
             coalesce(ev.add_to_carts, 0) as add_to_carts, coalesce(ev.add_to_carts, 0) as "addToCarts",
             coalesce(ord.ordered_quantity, 0) as ordered_quantity, coalesce(ord.ordered_quantity, 0) as "orderedQuantity",
             coalesce(ord.order_count, 0) as "orderCount"
      from products p
      left join ev on ev.product_id = p.id
      left join ord on ord.product_id = p.id
      where ev.product_id is not null or ord.product_id is not null
      order by ${sortCol} desc, p.name, p.id
      limit ${query.limit}`);
    return {
      items: rows.map((r) => ({
        productId: r.productId,
        name: r.name,
        barcode: r.barcode,
        thumbUrl: r.thumbMediaId ? mediaThumbUrl(r.thumbMediaId) : null,
        views: r.views,
        uniqueViewers: r.uniqueViewers,
        addToCarts: r.addToCarts,
        orderedQuantity: r.orderedQuantity,
        orderCount: r.orderCount,
        viewToCartRate: ratePercent(r.addToCarts, r.views),
      })),
    };
  }

  // --- Aramalar ---------------------------------------------------------------

  async searches(query: AnalyticsPeriodQuery) {
    const { period } = this.resolvePeriod(query);
    const where = sql`e.type = 'search' and e.query is not null and ${inPeriod(sql`e.occurred_at`, period)}`;
    const [top, zero] = await Promise.all([
      this.rows<{ query: string; count: number; avgResults: number | null }>(sql`
        select lower(trim(e.query)) as query, count(*)::int as count, round(avg(e.result_count), 1)::float8 as "avgResults"
        from analytics_events e where ${where}
        group by 1 order by count desc, 1 limit 50`),
      this.rows<{ query: string; count: number; lastAt: string }>(sql`
        select lower(trim(e.query)) as query, count(*)::int as count, ${isoSql(sql`max(e.occurred_at)`)} as "lastAt"
        from analytics_events e where ${where} and e.result_count = 0
        group by 1 order by count desc, 1 limit 50`),
    ]);
    return {
      top: top.map((r) => ({ query: r.query, count: r.count, avgResults: r.avgResults ?? 0 })),
      zeroResults: zero,
    };
  }

  // --- Bayiler ----------------------------------------------------------------

  async dealers(query: AnalyticsPeriodQuery) {
    const { period } = this.resolvePeriod(query);
    const rows = await this.rows<{
      dealerId: string;
      companyTitle: string;
      city: string | null;
      phone: string | null;
      sessions: number;
      lastSeenAt: string | null;
      productViews: number;
      addToCarts: number;
      interestProducts: number;
      orders: number;
      netTotal: string;
    }>(sql`
      with ev as (
        select e.dealer_id,
               count(distinct e.session_key) filter (where ${CLIENT})::int as sessions,
               max(e.occurred_at) as last_seen,
               count(*) filter (where e.type = 'product_view')::int as product_views,
               count(*) filter (where e.type = 'add_to_cart')::int as add_to_carts,
               count(distinct e.product_id) filter (where e.type in ('product_view', 'add_to_cart'))::int as interest_products
        from analytics_events e
        where e.dealer_id is not null and ${inPeriod(sql`e.occurred_at`, period)}
        group by e.dealer_id),
      ord as (
        select o.dealer_id, count(*)::int as orders, sum(o.net_total)::text as net_total
        from orders o where ${SOLD_ORDERS} and ${inPeriod(sql`o.submitted_at`, period)}
        group by o.dealer_id)
      select d.id as "dealerId", d.company_title as "companyTitle", d.city, d.phone,
             coalesce(ev.sessions, 0) as sessions, ${isoSql(sql`ev.last_seen`)} as "lastSeenAt",
             coalesce(ev.product_views, 0) as "productViews", coalesce(ev.add_to_carts, 0) as "addToCarts",
             coalesce(ev.interest_products, 0) as "interestProducts",
             coalesce(ord.orders, 0) as orders, coalesce(ord.net_total, '0') as "netTotal"
      from dealers d
      left join ev on ev.dealer_id = d.id
      left join ord on ord.dealer_id = d.id
      where ev.dealer_id is not null or ord.dealer_id is not null
      order by sessions desc, ev.last_seen desc nulls last, d.company_title
      limit 500`);
    const items = rows.map((r) => ({
      dealerId: r.dealerId,
      companyTitle: r.companyTitle,
      city: r.city,
      phone: r.phone,
      sessions: r.sessions,
      lastSeenAt: r.lastSeenAt,
      productViews: r.productViews,
      addToCarts: r.addToCarts,
      orders: r.orders,
      netTotal: new Money(r.netTotal).toFixed(2),
    }));
    // Dönemde ≥3 farklı ürün inceleyip/sepete ekleyip sipariş vermeyenler.
    const interestedNoOrder = items.filter((_, i) => rows[i].interestProducts >= 3 && rows[i].orders === 0);
    return { items, interestedNoOrder };
  }

  // --- Bayi zaman çizelgesi ---------------------------------------------------

  async dealerActivity(dealerId: string, query: DealerActivityQuery) {
    const [dealer] = await this.rows(sql`select 1 as ok from dealers where id = ${dealerId}::uuid`);
    if (!dealer) throw new NotFoundException('Bayi bulunamadı.');
    const rows = await this.rows<{
      id: number;
      at: string;
      type: string;
      path: string;
      productId: string | null;
      productName: string | null;
      query: string | null;
      resultCount: number | null;
      quantity: number | null;
      orderId: string | null;
      orderNo: number | null;
    }>(sql`
      select e.id::int as id, ${isoSql(sql`e.occurred_at`)} as at, e.type, e.path, e.product_id as "productId",
             p.name as "productName", e.query, e.result_count as "resultCount", e.quantity, e.order_id as "orderId",
             o.order_no as "orderNo"
      from analytics_events e
      left join products p on p.id = e.product_id
      left join orders o on o.id = e.order_id
      where e.dealer_id = ${dealerId}::uuid ${query.before ? sql`and e.id < ${query.before}` : sql``}
      order by e.id desc
      limit ${query.limit + 1}`);
    const page = rows.slice(0, query.limit);
    return { items: page, nextBefore: rows.length > query.limit ? page[page.length - 1].id : null };
  }
}
