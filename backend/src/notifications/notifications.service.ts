// E-posta outbox'ı. GR-BLD-001, K-17, K-26. Tüm e-postalar önce iş transaction'ında `notification_outbox`'a
// yazılır (transaction geri alınırsa e-posta da yoktur); commit sonrası hemen bir kez denenir, başarısızsa
// dakikada bir çalışan iş üstel geri çekilmeyle yeniden dener. 8. başarısız denemeden sonra `failed`.
// Token içeren e-postalarda (`payload.link`) bağlantı gönderilince veya 24 saat sonra temizlenir.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, asc, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import { LOCK_NOTIFICATION_OUTBOX, runExclusive } from '../common/advisory-lock.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { DB, type Database } from '../database/database.module.js';
import { notificationOutbox } from '../database/schema.js';
import { MAIL_SERVICE, type MailService, type OrderMail } from '../mail/mail.service.js';

export type NotificationKind =
  | 'password_reset'
  | 'email_verification'
  | 'invitation'
  | 'approval_reminder'
  | 'new_application'
  | 'rejection'
  | 'order_confirmation'
  | 'new_order_team'
  | 'order_status_changed';

/** Payload'ında token'lı `link` bulunan türler. */
const LINK_KINDS: NotificationKind[] = ['password_reset', 'email_verification', 'invitation'];

export const MAX_ATTEMPTS = 8;
/** Başarısız deneme sayısına göre bekleme (dakika): 1., 2., 3., sonraki denemeler. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 60, 60, 60];
const LEASE_MS = 5 * 60_000;
const LINK_RETENTION_MS = 24 * 3_600_000;
const BATCH = 50;

type Executor = Pick<Database, 'insert'>;
type OutboxRow = typeof notificationOutbox.$inferSelect;

export const serializeOrderMail = (order: OrderMail) => ({ ...order, submittedAt: order.submittedAt.toISOString() });

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
  ) {}

  /** Testler ve kapanış için: sürmekte olan gönderimleri bekler. */
  whenIdle(): Promise<void> {
    return Promise.all(this.inFlight).then(() => undefined);
  }

  /** İş transaction'ının içinde çağrılır (`executor` = tx); satır commit ile birlikte kalıcı olur. */
  async enqueue(
    kind: NotificationKind,
    recipient: string,
    payload: Record<string, unknown>,
    executor: Executor = this.db,
  ): Promise<string> {
    const [row] = await executor
      .insert(notificationOutbox)
      .values({ kind, recipient, payload, nextAttemptAt: this.clock.now() })
      .returning({ id: notificationOutbox.id });
    return row.id;
  }

  /** Commit sonrası: ilk deneme arka planda yapılır (yanıtı bekletmez). */
  dispatchSoon(ids: string[]): void {
    if (ids.length === 0) return;
    const task: Promise<void> = this.dispatchNow(ids)
      .catch((error: unknown) => {
        this.logger.error('Bildirim ilk denemesi başarısız', error instanceof Error ? error.stack : error);
      })
      .finally(() => {
        this.inFlight.delete(task);
      });
    this.inFlight.add(task);
  }

  async dispatchNow(ids: string[]): Promise<void> {
    for (const id of ids) await this.attempt(id, true);
  }

  /**
   * Bir satırı tek seferlik kiralayıp gönderir. Kiralama (`attempts + 1`, `next_attempt_at` ileri) atomiktir;
   * aynı satırı iki işlem birden göndermez. `immediate`: yalnızca hiç denenmemiş satır.
   */
  async attempt(id: string, immediate = false): Promise<'sent' | 'retry' | 'failed' | 'skipped'> {
    const now = this.clock.now();
    const [row] = await this.db
      .update(notificationOutbox)
      .set({
        attempts: sql`${notificationOutbox.attempts} + 1`,
        nextAttemptAt: new Date(now.getTime() + LEASE_MS),
      })
      .where(
        and(
          eq(notificationOutbox.id, id),
          eq(notificationOutbox.status, 'pending'),
          immediate ? eq(notificationOutbox.attempts, 0) : lte(notificationOutbox.nextAttemptAt, now),
        ),
      )
      .returning();
    if (!row) return 'skipped';
    try {
      await this.send(row);
    } catch (error) {
      return this.recordFailure(row, error);
    }
    const payload = row.payload as Record<string, unknown>;
    // Yalnızca token'lı bağlantılar temizlenir (sıradan detay bağlantıları kalır).
    if (LINK_KINDS.includes(row.kind as NotificationKind)) payload.link = null;
    await this.db
      .update(notificationOutbox)
      .set({ status: 'sent', sentAt: this.clock.now(), lastError: null, payload })
      .where(eq(notificationOutbox.id, id));
    return 'sent';
  }

  private async recordFailure(row: OutboxRow, error: unknown): Promise<'retry' | 'failed'> {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    if (row.attempts >= MAX_ATTEMPTS) {
      this.logger.error(
        `Bildirim gönderilemedi, vazgeçildi (${row.kind}, ${row.id}, ${row.attempts} deneme): ${message}`,
      );
      await this.db
        .update(notificationOutbox)
        .set({ status: 'failed', lastError: message })
        .where(eq(notificationOutbox.id, row.id));
      return 'failed';
    }
    const delayMin = BACKOFF_MINUTES[Math.min(row.attempts, BACKOFF_MINUTES.length) - 1];
    this.logger.warn(`Bildirim gönderilemedi (${row.kind}, ${row.id}, deneme ${row.attempts}): ${message}`);
    await this.db
      .update(notificationOutbox)
      .set({ lastError: message, nextAttemptAt: new Date(this.clock.now().getTime() + delayMin * 60_000) })
      .where(eq(notificationOutbox.id, row.id));
    return 'retry';
  }

  private async send(row: OutboxRow): Promise<void> {
    const p = row.payload as Record<string, unknown>;
    switch (row.kind as NotificationKind) {
      case 'password_reset':
        return this.mail.sendPasswordReset(row.recipient, requireLink(p));
      case 'email_verification':
        return this.mail.sendEmailVerification(row.recipient, requireLink(p));
      case 'invitation':
        return this.mail.sendInvitation(row.recipient, requireLink(p));
      case 'approval_reminder':
        return this.mail.sendApprovalReminder(row.recipient, p.counts as { dueSoon: number; overdue: number });
      case 'new_application':
        return this.mail.sendNewApplication(row.recipient, String(p.companyTitle));
      case 'rejection':
        return this.mail.sendRejection(row.recipient);
      case 'order_confirmation':
        return this.mail.sendOrderConfirmation(row.recipient, reviveOrder(p));
      case 'new_order_team':
        return this.mail.sendNewOrderToTeam(row.recipient, reviveOrder(p));
      case 'order_status_changed':
        return this.mail.sendOrderStatusChanged(row.recipient, {
          orderNo: Number(p.orderNo),
          statusLabel: String(p.statusLabel),
          note: typeof p.note === 'string' ? p.note : null,
          link: String(p.link),
        });
      default:
        throw new Error(`Bilinmeyen bildirim türü: ${row.kind}`);
    }
  }

  /** Dakikada bir (test ortamında ScheduleModule yok; testler `processDue` çağırır). */
  @Cron('* * * * *')
  async scheduled(): Promise<void> {
    try {
      await runExclusive(this.db, LOCK_NOTIFICATION_OUTBOX, () => this.processDue());
    } catch (error) {
      this.logger.error('Bildirim yeniden deneme işi çalışmadı', error instanceof Error ? error.stack : error);
    }
  }

  /** Zamanı gelen bekleyenleri yeniden dener; süresi dolan `failed` satırların bağlantısını temizler. */
  async processDue(): Promise<number> {
    const now = this.clock.now();
    const due = await this.db
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.status, 'pending'), lte(notificationOutbox.nextAttemptAt, now)))
      .orderBy(asc(notificationOutbox.nextAttemptAt))
      .limit(BATCH);
    let handled = 0;
    for (const { id } of due) {
      if ((await this.attempt(id)) !== 'skipped') handled += 1;
    }
    await this.clearExpiredLinks();
    return handled;
  }

  /** Token içeren, gönderilemeyen satırların bağlantısını 24 saat sonra siler (güvenlik). */
  async clearExpiredLinks(): Promise<void> {
    const cutoff = new Date(this.clock.now().getTime() - LINK_RETENTION_MS);
    await this.db
      .update(notificationOutbox)
      .set({ payload: sql`${notificationOutbox.payload} || '{"link":null}'::jsonb` })
      .where(
        and(
          eq(notificationOutbox.status, 'failed'),
          inArray(notificationOutbox.kind, LINK_KINDS),
          lt(notificationOutbox.createdAt, cutoff),
          sql`${notificationOutbox.payload}->>'link' is not null`,
        ),
      );
  }
}

function requireLink(payload: Record<string, unknown>): string {
  if (typeof payload.link !== 'string' || !payload.link) throw new Error('Bağlantı süresi doldu (payload temizlenmiş).');
  return payload.link;
}

function reviveOrder(payload: Record<string, unknown>): OrderMail {
  const order = payload.order as Omit<OrderMail, 'submittedAt'> & { submittedAt: string };
  return { ...order, submittedAt: new Date(order.submittedAt) };
}
