// Raporlar. GR-RAP-001…003, K-46 – K-50. API: docs/api/rapor-api.md.
// Tüm toplamlar SQL'de (numeric) alınır ve metin olarak döner; karşılaştırma farkları Decimal ile hesaplanır.
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql, type SQL } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import type { Env } from '../config/env.js';
import { Money, type MoneyValue } from '../common/money.js';
import { DB, type Database } from '../database/database.module.js';
import { allocateShares } from './shares.js';
import { DealersService } from '../dealers/dealers.service.js';
import { ORDER_STATUS_LABELS, type OrderStatus } from '../orders/order-status.js';
import {
  defaultPeriod,
  istanbulToday,
  lastYearPeriod,
  monthStart,
  previousPeriod,
  shiftYears,
  validatePeriod,
  type DayPeriod,
} from './periods.js';
import type {
  DealerProductsQuery,
  InactiveQuery,
  PeriodQuery,
  ProductsReportQuery,
  ReportOrdersQuery,
  TrendQuery,
} from './reports.schemas.js';

export const TZ = 'Europe/Istanbul';
const DAY_MS = 86_400_000;

export const startOf = (d: string): SQL => sql`((${d}::date)::timestamp at time zone ${TZ})`;
export const endOf = (d: string): SQL => sql`(((${d}::date + 1))::timestamp at time zone ${TZ})`;
/** `col` bu dönemde mi (Istanbul günleri, iki uç dahil). */
export const inPeriod = (col: SQL, p: DayPeriod): SQL => sql`(${col} >= ${startOf(p.from)} and ${col} < ${endOf(p.to)})`;

/** timestamptz -> ISO-8601 metni (sürücü ham sorgularda tarihi metin döndürür). */
export const isoSql = (col: SQL): SQL => sql`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const money = (v: string | null | undefined): string => new Money(v ?? 0).toFixed(2);

/** Satış metriklerinde iptal edilen siparişler sayılmaz (K-46); `orders o` takma adıyla. */
export const SOLD_ORDERS: SQL = sql`o.status <> 'cancelled'`;

export interface Change {
  amount: string | number;
  percent: number | null;
}
export interface Comparative<T extends string | number> {
  current: T;
  previous: T;
  lastYear: T;
  changePrev: Change;
  changeYear: Change;
}

export function change(current: MoneyValue, base: MoneyValue, asMoney: boolean): Change {
  const diff = current.minus(base);
  return {
    amount: asMoney ? diff.toFixed(2) : diff.toNumber(),
    percent: base.isZero() ? null : diff.div(base).times(100).toDecimalPlaces(1, Money.ROUND_HALF_UP).toNumber(),
  };
}

/** Tutar (metin) için karşılaştırma. */
export function compareMoney(current: string, previous: string, lastYear: string): Comparative<string> {
  const [c, p, l] = [new Money(current), new Money(previous), new Money(lastYear)];
  return {
    current: c.toFixed(2),
    previous: p.toFixed(2),
    lastYear: l.toFixed(2),
    changePrev: change(c, p, true),
    changeYear: change(c, l, true),
  };
}

/** Sayı (adet) için karşılaştırma. */
export function compareCount(current: number, previous: number, lastYear: number): Comparative<number> {
  const [c, p, l] = [new Money(current), new Money(previous), new Money(lastYear)];
  return { current, previous, lastYear, changePrev: change(c, p, false), changeYear: change(c, l, false) };
}

export interface ResolvedPeriods {
  period: DayPeriod;
  previous: DayPeriod;
  lastYear: DayPeriod;
}

type Row = Record<string, string | number | null>;

export interface DealerProductRow { productId: string; barcode: string; name: string; groupName: string; quantity: number; netTotal: string }
export interface ProductRow extends DealerProductRow { code: string | null; orderCount: number; dealerCount: number }
export interface OutOfStockRow { productId: string; barcode: string; name: string; groupName: string; quantity: number; orderCount: number; dealerCount: number; lastOrderedAt: string }

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DealersService) private readonly dealers: DealersService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  private async rows<T = Row>(query: SQL): Promise<T[]> {
    return (await this.db.execute<T & Record<string, unknown>>(query)).rows as T[];
  }

  /** Dönemi çözer ve doğrular (from > to veya 3 yıldan uzun → 400). */
  resolve(query: PeriodQuery): ResolvedPeriods {
    const fallback = defaultPeriod(this.clock.now());
    // Yalnızca `from` verilirse bitiş bugündür; yalnızca `to` verilirse başlangıç o ayın 1'idir.
    const to = query.to ?? fallback.to;
    const period = { from: query.from ?? (query.to ? monthStart(query.to) : fallback.from), to };
    const error = validatePeriod(period);
    if (error) {
      throw new BadRequestException({ statusCode: 400, code: 'VALIDATION', message: error, fields: { from: error } });
    }
    return { period, previous: previousPeriod(period), lastYear: lastYearPeriod(period) };
  }

  /** Sipariş metrikleri için ortak koşul: iptal edilmeyenler. */
  private readonly sold = SOLD_ORDERS;

  // --- Genel bakış ----------------------------------------------------------

  async overview(query: PeriodQuery) {
    const r = this.resolve(query);
    const ps = { cur: r.period, prev: r.previous, ly: r.lastYear };
    const cols: SQL[] = [];
    for (const [key, p] of Object.entries(ps)) {
      const c = inPeriod(sql`o.submitted_at`, p);
      cols.push(
        sql`count(*) filter (where ${c})::int as ${sql.raw(`${key}_count`)}`,
        sql`coalesce(sum(o.net_total) filter (where ${c}), 0)::text as ${sql.raw(`${key}_net`)}`,
        sql`coalesce(sum(o.vat_total) filter (where ${c}), 0)::text as ${sql.raw(`${key}_vat`)}`,
        sql`coalesce(sum(o.grand_total) filter (where ${c}), 0)::text as ${sql.raw(`${key}_grand`)}`,
        sql`count(distinct o.dealer_id) filter (where ${c})::int as ${sql.raw(`${key}_dealers`)}`,
      );
    }
    const [row] = await this.rows(sql`
      select ${sql.join(cols, sql`, `)} from orders o
      where ${this.sold} and (${inPeriod(sql`o.submitted_at`, r.period)} or ${inPeriod(sql`o.submitted_at`, r.previous)} or ${inPeriod(sql`o.submitted_at`, r.lastYear)})`);
    const str = (k: string) => String(row[k]);
    const num = (k: string) => Number(row[k]);
    const avg = (k: string) => (num(`${k}_count`) === 0 ? '0.00' : new Money(str(`${k}_net`)).div(num(`${k}_count`)).toDecimalPlaces(2, Money.ROUND_HALF_UP).toFixed(2));
    return {
      period: r.period,
      previous: r.previous,
      lastYear: r.lastYear,
      metrics: {
        orderCount: compareCount(num('cur_count'), num('prev_count'), num('ly_count')),
        netTotal: compareMoney(str('cur_net'), str('prev_net'), str('ly_net')),
        vatTotal: compareMoney(str('cur_vat'), str('prev_vat'), str('ly_vat')),
        grandTotal: compareMoney(str('cur_grand'), str('prev_grand'), str('ly_grand')),
        orderingDealerCount: compareCount(num('cur_dealers'), num('prev_dealers'), num('ly_dealers')),
        averageOrderNet: compareMoney(avg('cur'), avg('prev'), avg('ly')),
      },
    };
  }

  // --- Aylık seri -----------------------------------------------------------

  async trend(query: TrendQuery) {
    const today = istanbulToday(this.clock.now());
    const months: string[] = [];
    let cursor = monthStart(today);
    for (let i = 0; i < query.months; i++) {
      months.unshift(cursor.slice(0, 7));
      cursor = monthStart(new Date(new Date(`${cursor}T00:00:00Z`).getTime() - DAY_MS).toISOString().slice(0, 10));
    }
    const first = shiftYears(`${months[0]}-01`, -1);
    const rows = await this.rows<{ month: string; order_count: number; net: string }>(sql`
      select to_char(date_trunc('month', o.submitted_at at time zone ${TZ}), 'YYYY-MM') as month,
             count(*)::int as order_count, sum(o.net_total)::text as net
      from orders o
      where ${this.sold} and o.submitted_at >= ${startOf(first)} and o.submitted_at < ${endOf(today)}
      group by 1`);
    const byMonth = new Map(rows.map((r) => [r.month, r]));
    return months.map((m) => {
      const cur = byMonth.get(m);
      const ly = byMonth.get(shiftYears(`${m}-01`, -1).slice(0, 7));
      return {
        month: m,
        orderCount: cur?.order_count ?? 0,
        netTotal: money(cur?.net),
        lastYearNetTotal: money(ly?.net),
      };
    });
  }

  // --- Sipariş listesi (GR-RAP-001) -----------------------------------------

  private orderListParts(query: ReportOrdersQuery) {
    const { period } = this.resolve(query);
    const where = sql`${inPeriod(sql`o.submitted_at`, period)}${query.status ? sql` and o.status = ${query.status}` : sql``}`;
    const column = { date: sql`o.submitted_at`, net: sql`o.net_total`, grand: sql`o.grand_total` }[query.sort];
    const dir = query.dir === 'asc' ? sql`asc` : sql`desc`;
    // Eşitlikte sipariş numarası aynı yönde (kararlı sıra).
    const orderBy = sql`${column} ${dir}, o.order_no ${dir}`;
    return { period, where, orderBy };
  }

  private orderRowsSql(where: SQL, orderBy: SQL, paging: SQL) {
    return sql`
      select o.id, o.order_no as "orderNo", ${isoSql(sql`o.submitted_at`)} as "submittedAt", o.status, d.id as "dealerId",
             d.company_title as "companyTitle",
             (select count(*)::int from order_lines l where l.order_id = o.id) as "lineCount",
             o.net_total::text as "netTotal", o.grand_total::text as "grandTotal"
      from orders o join dealers d on d.id = o.dealer_id
      where ${where}
      order by ${orderBy} ${paging}`;
  }

  private mapOrderRow(r: Row) {
    return {
      id: r.id,
      orderNo: r.orderNo,
      submittedAt: r.submittedAt,
      dealer: { id: r.dealerId, companyTitle: r.companyTitle },
      status: r.status,
      lineCount: r.lineCount,
      netTotal: money(String(r.netTotal)),
      grandTotal: money(String(r.grandTotal)),
    };
  }

  private async orderTotals(where: SQL) {
    const [t] = await this.rows(sql`
      select count(*)::int as c, coalesce(sum(o.net_total), 0)::text as net, coalesce(sum(o.grand_total), 0)::text as grand
      from orders o where ${where} and ${this.sold}`);
    return { orderCount: Number(t.c), netTotal: money(String(t.net)), grandTotal: money(String(t.grand)) };
  }

  async orders(query: ReportOrdersQuery) {
    const { period, where, orderBy } = this.orderListParts(query);
    const [{ total }] = await this.rows<{ total: number }>(sql`select count(*)::int as total from orders o where ${where}`);
    const items = await this.rows(
      this.orderRowsSql(where, orderBy, sql`limit ${query.pageSize} offset ${(query.page - 1) * query.pageSize}`),
    );
    return {
      period,
      items: items.map((r) => this.mapOrderRow(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totals: await this.orderTotals(where),
    };
  }

  /** Excel için: sayfalamasız, tek sorgu; `EXPORT_MAX_ORDERS` aşılırsa 400 EXPORT_TOO_LARGE. */
  async ordersForExport(query: ReportOrdersQuery) {
    const { period, where, orderBy } = this.orderListParts(query);
    const max = this.config.get('EXPORT_MAX_ORDERS', { infer: true });
    const [{ total }] = await this.rows<{ total: number }>(sql`select count(*)::int as total from orders o where ${where}`);
    if (total > max) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'EXPORT_TOO_LARGE',
        message: `En fazla ${max} sipariş dışa aktarılabilir; dönemi veya filtreleri daraltın.`,
      });
    }
    const items = await this.rows(this.orderRowsSql(where, orderBy, sql`limit ${max}`));
    return { period, items: items.map((r) => this.mapOrderRow(r)), total, totals: await this.orderTotals(where) };
  }

  // --- Bayi bazında (GR-RAP-001, GR-RAP-002) --------------------------------

  async dealerSales(query: PeriodQuery) {
    const r = this.resolve(query);
    const cur = inPeriod(sql`o.submitted_at`, r.period);
    const prev = inPeriod(sql`o.submitted_at`, r.previous);
    const ly = inPeriod(sql`o.submitted_at`, r.lastYear);
    const rows = await this.rows(sql`
      select d.id as "dealerId", d.company_title as "companyTitle", d.city,
        count(*) filter (where ${cur})::int as "orderCount",
        coalesce(sum(o.net_total) filter (where ${cur}), 0)::text as "curNet",
        coalesce(sum(o.net_total) filter (where ${prev}), 0)::text as "prevNet",
        coalesce(sum(o.net_total) filter (where ${ly}), 0)::text as "lyNet",
        coalesce(sum(o.grand_total) filter (where ${cur}), 0)::text as "grandTotal",
        ${isoSql(sql`(select max(x.submitted_at) from orders x where x.dealer_id = d.id and x.status <> 'cancelled')`)} as "lastOrderAt"
      from orders o join dealers d on d.id = o.dealer_id
      where ${this.sold} and (${cur} or ${prev} or ${ly})
      group by d.id
      having count(*) filter (where ${cur}) > 0
      order by sum(o.net_total) filter (where ${cur}) desc, d.company_title`);
    return {
      period: r.period,
      previous: r.previous,
      lastYear: r.lastYear,
      items: rows.map((x) => ({
        dealerId: x.dealerId,
        companyTitle: x.companyTitle,
        city: x.city,
        orderCount: x.orderCount,
        netTotal: compareMoney(String(x.curNet), String(x.prevNet), String(x.lyNet)),
        grandTotal: money(String(x.grandTotal)),
        lastOrderAt: x.lastOrderAt,
      })),
    };
  }

  async dealerProducts(dealerId: string, query: DealerProductsQuery) {
    const { period } = this.resolve(query);
    const [dealer] = await this.rows(sql`select id, company_title as "companyTitle" from dealers where id = ${dealerId}`);
    if (!dealer) throw new NotFoundException('Bayi bulunamadı.');
    const rows = await this.rows<DealerProductRow>(sql`
      select l.product_id as "productId", max(l.barcode) as barcode, max(l.product_name) as name,
             pg.name as "groupName", sum(l.quantity)::int as quantity, sum(l.net_amount)::text as "netTotal"
      from order_lines l
        join orders o on o.id = l.order_id
        join products p on p.id = l.product_id
        join product_groups pg on pg.id = p.group_id
      where o.dealer_id = ${dealerId} and ${this.sold} and ${inPeriod(sql`o.submitted_at`, period)}
      group by l.product_id, pg.name
      order by quantity desc, sum(l.net_amount) desc, name
      limit ${query.limit}`);
    return {
      period,
      dealer: { id: dealer.id, companyTitle: dealer.companyTitle },
      items: rows.map((x) => ({ ...x, netTotal: money(x.netTotal) })),
    };
  }

  // --- Uzun süredir sipariş vermeyenler (K-50) ------------------------------

  /**
   * Son siparişi `days` günden ESKİ (kesin) olan veya hiç sipariş vermemiş aktif bayiler. Europe/Istanbul takvim
   * günüyle: son sipariş günü < bugün − days. Gün sayısı takvim farkıdır (60 gün + 1 saat önceki sipariş = 60).
   */
  async inactiveDealers(query: InactiveQuery) {
    const nowIso = this.clock.now().toISOString();
    const today = sql`((${nowIso}::timestamptz) at time zone ${TZ})::date`;
    const rows = await this.rows<{
      dealerId: string; companyTitle: string; contactName: string; phone: string; city: string;
      lastOrderAt: string | null; approvedAt: string | null; daysSinceLastOrder: number | null;
    }>(sql`
      select d.id as "dealerId", d.company_title as "companyTitle", d.contact_name as "contactName", d.phone, d.city,
             ${isoSql(sql`l.last_order_at`)} as "lastOrderAt", ${isoSql(sql`d.reviewed_at`)} as "approvedAt",
             (${today} - (l.last_order_at at time zone ${TZ})::date)::int as "daysSinceLastOrder"
      from dealers d
        left join lateral (select max(o.submitted_at) as last_order_at from orders o
                           where o.dealer_id = d.id and o.status <> 'cancelled') l on true
      where d.status = 'active'
        and (l.last_order_at is null or (l.last_order_at at time zone ${TZ})::date < ${today} - ${query.days}::int)
      order by l.last_order_at asc nulls first, d.company_title`);
    return { days: query.days, items: rows };
  }

  // --- Ürün raporları (GR-RAP-001, GR-RAP-002) ------------------------------

  async products(query: ProductsReportQuery) {
    const { period } = this.resolve(query);
    const order = query.sort === 'net' ? sql`sum(l.net_amount) desc, quantity desc` : sql`quantity desc, sum(l.net_amount) desc`;
    const rows = await this.rows<ProductRow>(sql`
      select l.product_id as "productId", max(l.barcode) as barcode, max(l.product_code) as code, max(l.product_name) as name,
             pg.name as "groupName", sum(l.quantity)::int as quantity, count(distinct o.id)::int as "orderCount",
             count(distinct o.dealer_id)::int as "dealerCount", sum(l.net_amount)::text as "netTotal"
      from order_lines l
        join orders o on o.id = l.order_id
        join products p on p.id = l.product_id
        join product_groups pg on pg.id = p.group_id
      where ${this.sold} and ${inPeriod(sql`o.submitted_at`, period)}
      group by l.product_id, pg.name
      order by ${order}, name
      limit ${query.limit}`);
    return { period, items: rows.map((x) => ({ ...x, netTotal: money(x.netTotal) })) };
  }

  async groups(query: PeriodQuery) {
    const r = this.resolve(query);
    const cur = inPeriod(sql`o.submitted_at`, r.period);
    const prev = inPeriod(sql`o.submitted_at`, r.previous);
    const ly = inPeriod(sql`o.submitted_at`, r.lastYear);
    const rows = await this.rows(sql`
      select pg.id as "groupId", pg.name,
             coalesce(sum(l.quantity) filter (where ${cur}), 0)::int as quantity,
             coalesce(sum(l.net_amount) filter (where ${cur}), 0)::text as "curNet",
             coalesce(sum(l.net_amount) filter (where ${prev}), 0)::text as "prevNet",
             coalesce(sum(l.net_amount) filter (where ${ly}), 0)::text as "lyNet"
      from order_lines l
        join orders o on o.id = l.order_id
        join products p on p.id = l.product_id
        join product_groups pg on pg.id = p.group_id
      where ${this.sold} and (${cur} or ${prev} or ${ly})
      group by pg.id
      having count(*) filter (where ${cur}) > 0
      order by sum(l.net_amount) filter (where ${cur}) desc, pg.name`);
    const shares = allocateShares(rows.map((x) => String(x.curNet)));
    return {
      period: r.period,
      previous: r.previous,
      lastYear: r.lastYear,
      items: rows.map((x, i) => ({
        groupId: x.groupId,
        name: x.name,
        quantity: x.quantity,
        netTotal: compareMoney(String(x.curNet), String(x.prevNet), String(x.lyNet)),
        sharePercent: shares[i],
      })),
    };
  }

  // --- Durum dağılımı ve bekleme (K-47) -------------------------------------

  /**
   * Dönemde gönderilen siparişlerin (iptal dahil) güncel duruma göre dağılımı ve durumda ortalama bekleme.
   * Bekleme: order_status_history'de LEAD ile bir sonraki geçişe kadar; hâlâ o durumdaysa şimdiye kadar.
   * Terminal durumlar (delivered, cancelled) için bekleme anlamsızdır: null.
   */
  async statusDistribution(query: PeriodQuery) {
    const { period } = this.resolve(query);
    const now = this.clock.now().toISOString();
    const counts = await this.rows<{ status: OrderStatus; count: number }>(sql`
      select o.status, count(*)::int as count from orders o
      where ${inPeriod(sql`o.submitted_at`, period)} group by o.status`);
    const waits = await this.rows<{ status: OrderStatus; hours: string }>(sql`
      with h as (
        select s.order_id, s.to_status, s.created_at,
               lead(s.created_at) over (partition by s.order_id order by s.created_at, s.id) as next_at
        from order_status_history s join orders o on o.id = s.order_id
        where ${inPeriod(sql`o.submitted_at`, period)}
      ),
      per_order as (
        -- Sipariş başına o durumda toplam süre (durum tekrar girilmişse toplanır); ortalama siparişler arasında.
        select order_id, to_status,
               sum(extract(epoch from (coalesce(next_at, ${now}::timestamptz) - created_at))) / 3600 as hours
        from h group by order_id, to_status
      )
      select to_status as status, round(avg(hours)::numeric, 1)::text as hours
      from per_order group by to_status`);
    const countBy = new Map(counts.map((c) => [c.status, c.count]));
    const waitBy = new Map(waits.map((w) => [w.status, Number(w.hours)]));
    const flow: OrderStatus[] = ['submitted', 'negotiating', 'approved', 'shipped', 'delivered', 'cancelled'];
    return {
      period,
      items: flow.map((status) => ({
        status,
        label: ORDER_STATUS_LABELS[status],
        count: countBy.get(status) ?? 0,
        averageHoursInStatus: status === 'delivered' || status === 'cancelled' ? null : (waitBy.get(status) ?? null),
      })),
    };
  }

  async outOfStock(query: PeriodQuery) {
    const { period } = this.resolve(query);
    const rows = await this.rows<OutOfStockRow>(sql`
      select l.product_id as "productId", max(l.barcode) as barcode, max(l.product_name) as name, pg.name as "groupName",
             sum(l.quantity)::int as quantity, count(distinct o.id)::int as "orderCount",
             count(distinct o.dealer_id)::int as "dealerCount", ${isoSql(sql`max(o.submitted_at)`)} as "lastOrderedAt"
      from order_lines l
        join orders o on o.id = l.order_id
        join products p on p.id = l.product_id
        join product_groups pg on pg.id = p.group_id
      where l.out_of_stock_at_order and ${this.sold} and ${inPeriod(sql`o.submitted_at`, period)}
      group by l.product_id, pg.name
      order by quantity desc, name`);
    return { period, items: rows };
  }

  // --- Özet ana sayfa (K-48, GR-RAP-003) ------------------------------------

  async today() {
    const now = this.clock.now();
    const today = istanbulToday(now);
    const month = { from: monthStart(today), to: today };
    const [o] = await this.rows(sql`
      select count(*) filter (where ${inPeriod(sql`o.submitted_at`, { from: today, to: today })})::int as "todayCount",
             coalesce(sum(o.net_total) filter (where ${inPeriod(sql`o.submitted_at`, { from: today, to: today })}), 0)::text as "todayNet",
             count(*) filter (where ${inPeriod(sql`o.submitted_at`, month)})::int as "monthCount",
             coalesce(sum(o.net_total) filter (where ${inPeriod(sql`o.submitted_at`, month)}), 0)::text as "monthNet"
      from orders o where ${this.sold} and ${inPeriod(sql`o.submitted_at`, month)}`);
    const [c] = await this.rows(sql`
      select (select count(*)::int from dealers where status = 'pending_approval') as pending,
             (select count(*)::int from orders where status = 'submitted') as new_orders,
             (select count(*)::int from notification_outbox where status = 'failed') as failed`);
    return {
      today: { orderCount: Number(o.todayCount), netTotal: money(String(o.todayNet)) },
      month: { orderCount: Number(o.monthCount), netTotal: money(String(o.monthNet)) },
      pendingApplications: Number(c.pending),
      overdueApplications: await this.dealers.countOverdue(now),
      newOrders: Number(c.new_orders),
      failedNotifications: Number(c.failed),
    };
  }
}
