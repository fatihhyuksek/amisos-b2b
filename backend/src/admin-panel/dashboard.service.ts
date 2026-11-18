// Yönetim paneli ana sayfası (K-78): GET /api/admin/dashboard. Gün hesapları ve "iptal hariç" kuralı rapor
// servisiyle ortaktır (reports.service.ts: inPeriod, SOLD_ORDERS, change); BizimHesap/bayi/e-posta sayıları
// mevcut servis ve koşullardan gelir, tekrar yazılmaz.
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { AuditQueryService } from '../audit/admin-audit.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { Money } from '../common/money.js';
import { DB, type Database } from '../database/database.module.js';
import { DealersService } from '../dealers/dealers.service.js';
import { notTransferredCondition } from '../orders/admin-orders.service.js';
import { istanbulToday, monthStart } from '../reports/periods.js';
import { change, inPeriod, isoSql, money, ReportsService, SOLD_ORDERS, TZ } from '../reports/reports.service.js';

const DAY_MS = 86_400_000;
const OPEN_STATUSES = ['submitted', 'negotiating', 'approved', 'shipped'] as const;
/** Son işlemler listesinde gürültü olan eylemler (girişler). */
const NOISY_ACTIONS = ['auth.login', 'auth.login_failed'];

const addDays = (day: string, n: number): string =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);

/** Geçen ayın aynı gününe kadar (ay daha kısaysa son güne kıstırılır) dönem. */
export function previousMonthToDate(today: string): { from: string; to: string } {
  const lastOfPrevious = addDays(monthStart(today), -1);
  const day = Math.min(Number(today.slice(8, 10)), Number(lastOfPrevious.slice(8, 10)));
  return { from: monthStart(lastOfPrevious), to: `${lastOfPrevious.slice(0, 8)}${String(day).padStart(2, '0')}` };
}

type Row = Record<string, string | number | null>;

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(DealersService) private readonly dealers: DealersService,
    @Inject(AuditQueryService) private readonly audit: AuditQueryService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}

  private async rows<T = Row>(query: ReturnType<typeof sql>): Promise<T[]> {
    return (await this.db.execute<T & Record<string, unknown>>(query)).rows as T[];
  }

  async get() {
    const now = this.clock.now();
    const today = istanbulToday(now);
    const month = { from: monthStart(today), to: today };
    const prev = previousMonthToDate(today);
    const [salesSeries, kpis, pipeline, attention, recentOrders, topDealers, recentActivity, traffic] = await Promise.all([
      this.sales30d(today),
      this.kpis(month, prev),
      this.pipeline(),
      this.attention(now),
      this.recentOrders(),
      this.topDealers(month),
      this.recentActivity(),
      this.analytics.traffic(),
    ]);
    return {
      sales30d: salesSeries,
      kpis,
      pipeline,
      attention,
      recentOrders,
      topDealersMonth: topDealers,
      recentActivity,
      // K-85: bugünkü ziyaretçi/sayfa görüntüleme, şu an aktif ve dünkü ziyaretçi.
      traffic,
    };
  }

  /** Son 30 Istanbul günü (bugün dahil); siparişsiz günler 0. */
  private async sales30d(today: string) {
    const from = addDays(today, -29);
    const found = await this.rows<{ day: string; order_count: number; net: string }>(sql`
      select to_char((o.submitted_at at time zone ${TZ})::date, 'YYYY-MM-DD') as day,
             count(*)::int as order_count, sum(o.net_total)::text as net
      from orders o
      where ${SOLD_ORDERS} and ${inPeriod(sql`o.submitted_at`, { from, to: today })}
      group by 1`);
    const byDay = new Map(found.map((r) => [r.day, r]));
    return Array.from({ length: 30 }, (_, i) => {
      const date = addDays(from, i);
      const r = byDay.get(date);
      return { date, orderCount: r?.order_count ?? 0, netTotal: money(r?.net) };
    });
  }

  private async kpis(cur: { from: string; to: string }, prev: { from: string; to: string }) {
    const c = inPeriod(sql`o.submitted_at`, cur);
    const p = inPeriod(sql`o.submitted_at`, prev);
    const [o] = await this.rows(sql`
      select count(*) filter (where ${c})::int as cur_count, coalesce(sum(o.net_total) filter (where ${c}), 0)::text as cur_net,
             count(*) filter (where ${p})::int as prev_count, coalesce(sum(o.net_total) filter (where ${p}), 0)::text as prev_net,
             count(distinct o.dealer_id) filter (where ${c})::int as ordering
      from orders o where ${SOLD_ORDERS} and (${c} or ${p})`);
    const avg = (net: string, count: number) =>
      count === 0 ? new Money(0) : new Money(net).div(count).toDecimalPlaces(2, Money.ROUND_HALF_UP);
    const curCount = Number(o.cur_count);
    const prevCount = Number(o.prev_count);
    const curNet = new Money(String(o.cur_net));
    const prevNet = new Money(String(o.prev_net));
    const curAvg = avg(String(o.cur_net), curCount);
    const prevAvg = avg(String(o.prev_net), prevCount);
    const [{ active }] = await this.rows<{ active: number }>(
      sql`select count(*)::int as active from dealers where status = 'active'`,
    );
    return {
      monthNet: { current: curNet.toFixed(2), previous: prevNet.toFixed(2), percent: change(curNet, prevNet, true).percent },
      monthOrders: {
        current: curCount,
        previous: prevCount,
        percent: change(new Money(curCount), new Money(prevCount), false).percent,
      },
      averageOrderNet: { current: curAvg.toFixed(2), previous: prevAvg.toFixed(2), percent: change(curAvg, prevAvg, true).percent },
      activeDealers: { current: Number(active), orderingThisMonth: Number(o.ordering) },
    };
  }

  /** İptal ve teslim hariç dört açık durum, tüm zamanlar. */
  private async pipeline() {
    const counts = await this.rows<{ status: string; n: number }>(sql`
      select status::text as status, count(*)::int as n from orders
      where status in (${sql.join(OPEN_STATUSES.map((s) => sql`${s}`), sql`, `)}) group by status`);
    const by = new Map(counts.map((r) => [r.status, r.n]));
    return OPEN_STATUSES.map((status) => ({ status, count: by.get(status) ?? 0 }));
  }

  private async attention(now: Date) {
    const [c] = await this.rows(sql`
      select (select count(*)::int from orders where status = 'submitted') as new_orders,
             (select count(*)::int from dealers where status = 'pending_approval') as pending,
             (select count(*)::int from orders where ${notTransferredCondition()}) as not_transferred,
             (select count(*)::int from notification_outbox where status = 'failed') as failed,
             (select count(*)::int from products where is_featured and is_active and stock_status = 'out_of_stock') as featured_oos,
             (select count(*)::int from products where is_active and list_price = 0) as price_missing`);
    const inactive = await this.reports.inactiveDealers({ days: 60 });
    return {
      newOrders: Number(c.new_orders),
      pendingApplications: Number(c.pending),
      overdueApplications: await this.dealers.countOverdue(now),
      notTransferred: Number(c.not_transferred),
      failedNotifications: Number(c.failed),
      featuredOutOfStock: Number(c.featured_oos),
      // K-79: aktif ve liste fiyatı 0 olan ürün sayısı.
      priceMissing: Number(c.price_missing),
      inactiveDealers60d: inactive.items.length,
    };
  }

  private async recentOrders() {
    const rows = await this.rows(sql`
      select o.id, o.order_no as "orderNo", o.status::text as status, o.grand_total::text as "grandTotal",
             ${isoSql(sql`o.submitted_at`)} as "submittedAt", d.id as "dealerId", d.company_title as "companyTitle"
      from orders o join dealers d on d.id = o.dealer_id
      order by o.submitted_at desc, o.order_no desc limit 8`);
    return rows.map((r) => ({
      id: r.id,
      orderNo: r.orderNo,
      dealer: { id: r.dealerId, companyTitle: r.companyTitle },
      status: r.status,
      grandTotal: money(String(r.grandTotal)),
      submittedAt: r.submittedAt,
    }));
  }

  private async topDealers(month: { from: string; to: string }) {
    const rows = await this.rows(sql`
      select d.id as "dealerId", d.company_title as "companyTitle", count(*)::int as "orderCount",
             sum(o.net_total)::text as "netTotal"
      from orders o join dealers d on d.id = o.dealer_id
      where ${SOLD_ORDERS} and ${inPeriod(sql`o.submitted_at`, month)}
      group by d.id order by sum(o.net_total) desc, d.company_title limit 5`);
    return rows.map((r) => ({ ...r, netTotal: money(String(r.netTotal)) }));
  }

  private async recentActivity() {
    const { items } = await this.audit.list({ page: 1, pageSize: 8 }, { excludeActions: NOISY_ACTIONS });
    return items.map((i) => ({
      id: i.id,
      createdAt: i.createdAt,
      actorName: i.actor.name ?? (i.actor.type === 'system' ? 'Sistem' : i.actor.type === 'dealer' ? 'Bayi' : 'Admin'),
      actionLabel: i.actionLabel,
      entityLabel: i.entityLabel,
      entityType: i.entityType,
      entityId: i.entityId,
    }));
  }
}
