// K-84: olay yazma çekirdeği. Auth'a bağımlı değildir (AuthService/OrdersService burayı kullanır).
// IP ve ham User-Agent saklanmaz: yalnızca günlük tuzlu özet (visitor_key) ve türetilmiş cihaz sınıfı.
import { randomBytes } from 'node:crypto';
import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { and, eq, gte, inArray, desc, sql } from 'drizzle-orm';
import type { Request } from 'express';
import { LOCK_ANALYTICS_RETENTION, runExclusive } from '../common/advisory-lock.js';
import { CLOCK, type Clock } from '../common/clock.js';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../database/database.module.js';
import { analyticsDailySalts, analyticsEvents } from '../database/schema.js';
import { istanbulToday } from '../reports/periods.js';
import { CLIENT_EVENT_TYPES, RETENTION_DAYS, SESSION_KEY_PATTERN, type EventType } from './analytics.constants.js';
import { deviceOf, isBotUserAgent, referrerHostOf, visitorKeyOf, type Device } from './client-info.js';

export interface NewEvent {
  type: EventType;
  path: string;
  productId?: string | null;
  groupId?: string | null;
  query?: string | null;
  resultCount?: number | null;
  quantity?: number | null;
  orderId?: string | null;
  referrerHost?: string | null;
  utmSource?: string | null;
}

export interface ClientContext {
  visitorKey: string;
  device: Device;
}

const DAY_MS = 86_400_000;

@Injectable()
export class AnalyticsRecorder {
  private readonly logger = new Logger(AnalyticsRecorder.name);
  private readonly salts = new Map<string, string>();
  private readonly ownHosts: ReadonlySet<string>;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    const hosts = new Set<string>();
    for (const url of [config.get('APP_URL', { infer: true }), config.get('CORS_ORIGIN', { infer: true })]) {
      try {
        hosts.add(new URL(url).hostname.toLowerCase().replace(/^www\./, ''));
      } catch {
        // geçersiz yapılandırma yok sayılır
      }
    }
    this.ownHosts = hosts;
  }

  /** İsteğin kendi `Host` başlığı da "kendi alan adı"dır. */
  referrerHost(req: Request, referrer: string | null | undefined): string | null {
    const own = new Set(this.ownHosts);
    own.add(req.hostname.toLowerCase().replace(/^www\./, ''));
    return referrerHostOf(referrer, own);
  }

  /** Günün (İstanbul) gizli tuzu: DB'de tek satır, bellekte önbellek; yalnızca bugün/dün saklanır. */
  async saltFor(day: string): Promise<string> {
    const cached = this.salts.get(day);
    if (cached) return cached;
    await this.db
      .insert(analyticsDailySalts)
      .values({ day, salt: randomBytes(32).toString('hex') })
      .onConflictDoNothing();
    const [row] = await this.db.select().from(analyticsDailySalts).where(eq(analyticsDailySalts.day, day));
    this.salts.set(day, row.salt);
    if (this.salts.size > 3) {
      for (const k of [...this.salts.keys()].sort().slice(0, this.salts.size - 3)) this.salts.delete(k);
    }
    return row.salt;
  }

  async clientContext(req: Request): Promise<ClientContext> {
    const ua = req.headers['user-agent'] ?? '';
    const salt = await this.saltFor(istanbulToday(this.clock.now()));
    return { visitorKey: visitorKeyOf(req.ip ?? '', ua, salt), device: deviceOf(ua) };
  }

  isBot(req: Request): boolean {
    return isBotUserAgent(req.headers['user-agent']);
  }

  async insert(
    ctx: ClientContext,
    base: { sessionKey: string; dealerId: string | null },
    events: NewEvent[],
  ): Promise<void> {
    if (events.length === 0) return;
    const at = this.clock.now();
    await this.db.insert(analyticsEvents).values(
      events.map((e) => ({
        occurredAt: at,
        type: e.type,
        sessionKey: base.sessionKey,
        visitorKey: ctx.visitorKey,
        dealerId: base.dealerId,
        path: e.path,
        productId: e.productId ?? null,
        groupId: e.groupId ?? null,
        query: e.query ?? null,
        resultCount: e.resultCount ?? null,
        quantity: e.quantity ?? null,
        orderId: e.orderId ?? null,
        referrerHost: e.referrerHost ?? null,
        device: ctx.device,
        utmSource: e.utmSource ?? null,
      })),
    );
  }

  /**
   * Sunucu tarafı olay (`login`, `order_submitted`). Hata iş akışını bozmaz. Yalnızca kimliği doğrulanmış bayi eylemleri için çağrılır (UA bot süzgeci uygulanmaz).
   * Oturum anahtarı: isteğin `X-Analytics-Session` başlığı geçerliyse o; sipariş için bayinin son 12 saatteki
   * istemci oturumu; aksi halde `srv-` ile başlayan tek kullanımlık anahtar (oturum sayımına girmez).
   */
  async recordServer(req: Request, dealerId: string, event: NewEvent): Promise<void> {
    try {
      const header = req.headers['x-analytics-session'];
      let sessionKey = typeof header === 'string' && SESSION_KEY_PATTERN.test(header) ? header : null;
      if (!sessionKey && event.type === 'order_submitted') sessionKey = await this.latestDealerSession(dealerId);
      sessionKey ??= `srv-${randomBytes(8).toString('hex')}`;
      await this.insert(await this.clientContext(req), { sessionKey, dealerId }, [event]);
    } catch (error) {
      this.logger.warn(`Analitik olayı yazılamadı: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async latestDealerSession(dealerId: string): Promise<string | null> {
    const since = new Date(this.clock.now().getTime() - 12 * 3_600_000);
    const [row] = await this.db
      .select({ sessionKey: analyticsEvents.sessionKey })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.dealerId, dealerId),
          inArray(analyticsEvents.type, [...CLIENT_EVENT_TYPES]),
          gte(analyticsEvents.occurredAt, since),
        ),
      )
      .orderBy(desc(analyticsEvents.occurredAt))
      .limit(1);
    return row?.sessionKey ?? null;
  }

  // --- Saklama süresi ---------------------------------------------------------

  /** Her gün 03:30 (İstanbul). Çok örnekli çalışmada advisory lock ile tek örnek. Test ortamında zamanlayıcı yok. */
  @Cron('30 3 * * *', { timeZone: 'Europe/Istanbul' })
  async scheduledCleanup(): Promise<void> {
    try {
      await runExclusive(this.db, LOCK_ANALYTICS_RETENTION, () => this.cleanup());
    } catch (error) {
      this.logger.error('Analitik temizliği başarısız', error instanceof Error ? error.stack : error);
    }
  }

  /** 400 günden eski olayları ve 2 günden eski tuzları siler; silinen olay sayısını döner. */
  async cleanup(): Promise<number> {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
    const deleted = await this.db.execute(sql`delete from analytics_events where occurred_at < ${cutoff.toISOString()}::timestamptz`);
    // Eski tuzların silinmesi günler arası eşleştirmeyi geri dönülmez kılar.
    const keepFrom = istanbulToday(new Date(now.getTime() - DAY_MS));
    await this.db.delete(analyticsDailySalts).where(sql`${analyticsDailySalts.day} < ${keepFrom}::date`);
    return deleted.rowCount ?? 0;
  }
}

@Global()
@Module({ providers: [AnalyticsRecorder], exports: [AnalyticsRecorder] })
export class AnalyticsCoreModule {}
