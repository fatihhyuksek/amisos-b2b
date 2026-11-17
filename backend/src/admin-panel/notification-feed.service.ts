// Bildirim merkezi akışı (K-78): GET /api/admin/notifications/feed, POST .../feed/read.
// Olaylar mevcut tablolardan türetilir (yeni olay tablosu yok): yeni sipariş, doğrulanmış başvuru, başarısız
// e-posta ve başka birinin yaptığı sipariş durumu değişikliği. Okunmamış = `admin_users.notifications_read_at`
// sonrası olaylar (Admin başına).
import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { DB, type Database } from '../database/database.module.js';
import { adminUsers } from '../database/schema.js';
import { ORDER_STATUS_LABELS, type OrderStatus } from '../orders/order-status.js';

export const FEED_DAYS = 30;
export const FEED_LIMIT = 30;

export type FeedType = 'order_submitted' | 'application_verified' | 'notification_failed' | 'order_status_changed';

interface EventRow {
  type: FeedType;
  ref_id: string;
  link_id: string | null;
  n: number | null;
  a: string | null;
  b: string | null;
  c: string | null;
  created_at: string;
}

const statusLabel = (s: string | null): string => ORDER_STATUS_LABELS[s as OrderStatus] ?? s ?? '';

@Injectable()
export class NotificationFeedService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Son 30 günün olayları (tek yerde tanımlı; liste ve okunmamış sayısı aynı kümeyi kullanır). */
  private events(adminId: string, since: Date) {
    return sql`
      select 'order_submitted'::text as type, o.id::text as ref_id, o.id::text as link_id, o.order_no as n,
             d.company_title as a, o.grand_total::text as b, null::text as c, o.submitted_at as created_at
      from orders o join dealers d on d.id = o.dealer_id
      where o.submitted_at >= ${since.toISOString()}::timestamptz
      union all
      select 'application_verified', d.id::text, d.id::text, null, d.company_title, null, null, d.email_verified_at
      from dealers d
      where d.source = 'application' and d.email_verified_at >= ${since.toISOString()}::timestamptz
      union all
      select 'notification_failed', n.id::text, null, null, n.kind, n.recipient, null, n.created_at
      from notification_outbox n
      where n.status = 'failed' and n.created_at >= ${since.toISOString()}::timestamptz
      union all
      select 'order_status_changed', h.id::text, o.id::text, o.order_no, d.company_title, h.from_status::text, h.to_status::text, h.created_at
      from order_status_history h
        join orders o on o.id = h.order_id join dealers d on d.id = o.dealer_id
      where h.from_status is not null and h.created_at >= ${since.toISOString()}::timestamptz
        and (h.source <> 'admin' or h.changed_by is distinct from ${adminId}::uuid)`;
  }

  async feed(adminId: string) {
    const since = new Date(this.clock.now().getTime() - FEED_DAYS * 86_400_000);
    const events = this.events(adminId, since);
    const items = (
      await this.db.execute<EventRow & Record<string, unknown>>(sql`
        with ev as (${events})
        select type, ref_id, link_id, n, a, b, c, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
        from ev order by ev.created_at desc, ref_id desc limit ${FEED_LIMIT}`)
    ).rows as EventRow[];
    const [{ readAt }] = await this.db
      .select({ readAt: adminUsers.notificationsReadAt })
      .from(adminUsers)
      .where(eq(adminUsers.id, adminId));
    // Milisaniyeye indirilir: öğe zamanı ISO (ms) döner, `until` onunla geldiğinde o öğe okunmuş sayılmalı.
    const unread = (
      await this.db.execute<{ n: number } & Record<string, unknown>>(sql`
        with ev as (${events})
        select count(*)::int as n from ev
        where ${readAt ? sql`date_trunc('milliseconds', ev.created_at) > ${readAt.toISOString()}::timestamptz` : sql`true`}`)
    ).rows[0].n;
    return { items: items.map((e) => this.toItem(e)), unread };
  }

  private toItem(e: EventRow) {
    const base = { id: `${e.type}:${e.ref_id}`, type: e.type, createdAt: e.created_at };
    const orderLink = `/yonetim/siparisler/${e.link_id}`;
    switch (e.type) {
      case 'order_submitted':
        return { ...base, title: `Yeni sipariş #${e.n}`, body: `${e.a} · ${e.b} TL`, link: orderLink };
      case 'application_verified':
        return {
          ...base,
          title: 'Yeni bayi başvurusu',
          body: `${e.a} e-postasını doğruladı; onayınızı bekliyor.`,
          link: `/yonetim/bayiler/${e.link_id}`,
        };
      case 'notification_failed':
        return {
          ...base,
          title: 'E-posta gönderilemedi',
          body: `${e.b} adresine (${e.a}) gönderilemedi.`,
          link: '/yonetim/bildirimler',
        };
      case 'order_status_changed':
        return {
          ...base,
          title: `Sipariş #${e.n} durumu değişti`,
          body: `${e.a}: ${statusLabel(e.b)} → ${statusLabel(e.c)}`,
          link: orderLink,
        };
    }
  }

  /**
   * `until` ve şu an arasındaki küçüğüne kadar okundu sayılır; işaret geriye gitmez. Gelecek tarih verilirse
   * şimdiye kıstırılır (henüz oluşmamış olaylar okunmuş sayılmasın). Kişisel okuma işareti olduğundan audit'e
   * yazılmaz (her açılışta işlem geçmişini doldurmasın).
   */
  async markRead(adminId: string, until: Date): Promise<void> {
    const effective = new Date(Math.min(until.getTime(), this.clock.now().getTime()));
    await this.db
      .update(adminUsers)
      .set({
        notificationsReadAt: sql`greatest(coalesce(${adminUsers.notificationsReadAt}, '-infinity'::timestamptz), ${effective.toISOString()}::timestamptz)`,
      })
      .where(eq(adminUsers.id, adminId));
  }
}
