// K-84 – K-87: olay toplama, analitik, öne çıkarma ve yönetilebilir vitrin (e2e). API: docs/api/analitik-vitrin-api.md
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module.js';
import { AnalyticsRecorder } from '../src/analytics/analytics-recorder.service.js';
import { PopularityService } from '../src/catalog/popularity.service.js';
import { DB, type Database } from '../src/database/database.module.js';
import {
  adminUsers,
  analyticsDailySalts,
  analyticsEvents,
  auditLog,
  cartItems,
  consents,
  dealerFavorites,
  dealers,
  notificationOutbox,
  orders,
  productGroups,
  products,
  sessions,
  siteSettings,
} from '../src/database/schema.js';
import { companyTitleKey } from '../src/dealers/company-title.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const sk = (n: string) => `evt-${run}-${n}`.padEnd(20, '0');
const bc = (n: string) => `A${run}-${n}`;

async function boot(limit?: number) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MAIL_SERVICE).useValue({}).compile();
  // ConfigModule ortamı içe aktarma anında okur; sınır çalışma zamanında ayarlanır (guard her istekte okur).
  if (limit) moduleRef.get(ConfigService).set('EVENTS_RATE_LIMIT_PER_MINUTE', limit);
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('Analitik ve vitrin (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let recorder: AnalyticsRecorder;
  let popularity: PopularityService;
  const adminIds: string[] = [];
  const dealerIds: string[] = [];
  const server = () => app.getHttpServer();

  async function adminAgent() {
    const [a] = await db
      .insert(adminUsers)
      .values({ email: `an${adminIds.length}-${run}@test.example`, fullName: 'Admin Test', passwordHash: await hash(PASSWORD) })
      .returning();
    adminIds.push(a.id);
    const agent = request.agent(server());
    await agent.post('/api/auth/admin/login').send({ email: a.email, password: PASSWORD }).expect(200);
    return agent;
  }
  async function dealerAgent(name: string, withLogin = true) {
    const title = `Bayi ${name} ${run}`;
    const [d] = await db
      .insert(dealers)
      .values({
        companyTitle: title,
        companyTitleKey: companyTitleKey(title),
        contactName: 'Ayşe',
        email: `${name}-${run}@test.example`,
        phone: '05320000000',
        city: 'Kayseri',
        district: 'Melikgazi',
        address: 'Adres 1',
        source: 'invitation',
        status: 'active',
        passwordHash: await hash(PASSWORD),
        emailVerifiedAt: new Date(),
      })
      .returning();
    dealerIds.push(d.id);
    const agent = request.agent(server());
    if (withLogin) await agent.post('/api/auth/dealer/login').set('User-Agent', UA).send({ email: d.email, password: PASSWORD }).expect(200);
    return { agent, dealer: d };
  }
  const place = async (agent: ReturnType<typeof request.agent>, barcode: string, quantity = 6) => {
    await agent.post('/api/cart/quick-add').send({ lines: [{ query: barcode, quantity }] }).expect(200);
    const cart = (await agent.get('/api/cart').expect(200)).body;
    return (
      await agent
        .post('/api/orders')
        .set('User-Agent', UA)
        .send({ deliveryMethod: 'pickup', expectedVersion: cart.version, expectedTotal: cart.summary.grandTotal })
        .expect(201)
    ).body as { id: string; orderNo: number };
  };
  const post = (body: unknown, ua: string | null = UA, agent: { post(url: string): request.Test } = request(server())) => {
    const r = agent.post('/api/events');
    return (ua === null ? r : r.set('User-Agent', ua)).send(body as object);
  };
  const eventsOf = (key: string) => db.select().from(analyticsEvents).where(eq(analyticsEvents.sessionKey, key));

  let admin: Awaited<ReturnType<typeof adminAgent>>;
  let groupA: string;
  let groupB: string;
  let p1: { id: string; barcode: string };
  let p2: { id: string; barcode: string };
  let p3: { id: string; barcode: string };
  const createProduct = async (groupId: string, n: string, over: Record<string, unknown> = {}) =>
    (
      await admin
        .post('/api/admin/products')
        .send({ groupId, barcode: bc(n), name: `Ürün ${n} ${run}`, caseQuantity: 6, listPrice: '100.00', ...over })
        .expect(201)
    ).body as { id: string; barcode: string };

  beforeAll(async () => {
    app = await boot();
    db = app.get<Database>(DB);
    recorder = app.get(AnalyticsRecorder);
    popularity = app.get(PopularityService);
    await db.delete(siteSettings);
    admin = await adminAgent();
    groupA = (await admin.post('/api/admin/product-groups').send({ name: `Analitik A ${run}` }).expect(201)).body.id;
    groupB = (await admin.post('/api/admin/product-groups').send({ name: `Analitik B ${run}` }).expect(201)).body.id;
    p1 = await createProduct(groupA, 'p1');
    p2 = await createProduct(groupA, 'p2');
    p3 = await createProduct(groupB, 'p3');
  });

  afterAll(async () => {
    if (db) {
      const prodIds = (await db.select({ id: products.id }).from(products).where(like(products.barcode, `%${run}%`))).map((p) => p.id);
      const groupIds = (await db.select({ id: productGroups.id }).from(productGroups).where(like(productGroups.name, `%${run}%`))).map((g) => g.id);
      await db.delete(analyticsEvents).where(or(like(analyticsEvents.sessionKey, `%${run}%`), inArray(analyticsEvents.productId, prodIds.length ? prodIds : [randomUUID()])));
      await db.delete(auditLog).where(or(inArray(auditLog.actorId, [...adminIds, ...dealerIds]), inArray(auditLog.entityId, [...adminIds, ...dealerIds, ...prodIds, ...groupIds, 'site'])));
      await db.delete(sessions).where(inArray(sessions.subjectId, [...adminIds, ...dealerIds]));
      await db.delete(siteSettings);
      await db.delete(notificationOutbox).where(like(notificationOutbox.recipient, `%${run}%`));
      if (dealerIds.length) {
        await db.delete(orders).where(inArray(orders.dealerId, dealerIds));
        await db.delete(consents).where(inArray(consents.dealerId, dealerIds));
        await db.delete(dealerFavorites).where(inArray(dealerFavorites.dealerId, dealerIds));
        await db.delete(cartItems).where(inArray(cartItems.dealerId, dealerIds));
      }
      if (prodIds.length) {
        await db.delete(cartItems).where(inArray(cartItems.productId, prodIds));
        await db.delete(products).where(inArray(products.id, prodIds));
      }
      if (groupIds.length) await db.delete(productGroups).where(inArray(productGroups.id, groupIds));
      if (dealerIds.length) await db.delete(dealers).where(inArray(dealers.id, dealerIds));
      await db.delete(adminUsers).where(inArray(adminUsers.id, adminIds));
    }
    await app?.close();
  });

  // -------------------------------------------------------------------------
  describe('K-84 olay kabulü ve reddi', () => {
    it('application/json ve text/plain (sendBeacon) 204; alanlar sunucuda türetilir, sorgu dizesi atılır', async () => {
      const key = sk('kabul');
      await post({
        sessionKey: key,
        events: [
          { type: 'page_view', path: '/katalog?utm_source=Instagram&token=gizli#x', referrer: 'https://www.google.com/search?q=x', at: '2001-01-01T00:00:00Z' },
          { type: 'product_view', path: `/urun/x`, productId: p1.id },
          { type: 'search', path: '/katalog', query: '  ÇAY   Bardağı ', resultCount: 3 },
          { type: 'page_view', path: '/', referrer: 'http://localhost:5180/katalog' },
        ],
      }).expect(204);
      await request(server())
        .post('/api/events')
        .set('User-Agent', MOBILE_UA)
        .set('Content-Type', 'text/plain;charset=UTF-8')
        .send(JSON.stringify({ sessionKey: key, events: [{ type: 'add_to_cart', path: '/urun/x', productId: p1.id, quantity: 12 }] }))
        .expect(204);
      const rows = (await eventsOf(key)).sort((a, b) => a.id - b.id);
      expect(rows).toHaveLength(5);
      expect(rows[0]).toMatchObject({ type: 'page_view', path: '/katalog', utmSource: 'instagram', referrerHost: 'google.com', device: 'desktop', dealerId: null });
      expect(rows[0].occurredAt.getFullYear()).toBeGreaterThan(2020); // istemci zamanı yok sayıldı
      expect(rows[2]).toMatchObject({ query: 'çay bardağı', resultCount: 3 });
      expect(rows[3].referrerHost).toBeNull(); // kendi alan adı
      expect(rows[4]).toMatchObject({ type: 'add_to_cart', quantity: 12, device: 'mobile', productId: p1.id });
      expect(JSON.stringify(rows)).not.toContain('gizli');
    });

    it('bayi oturumunda dealerId eklenir; Admin oturumu, bot ve UA\'sız istek kaydedilmez (yine 204)', async () => {
      const { agent, dealer } = await dealerAgent('olay');
      const k1 = sk('bayi');
      await post({ sessionKey: k1, events: [{ type: 'page_view', path: '/' }] }, UA, agent).expect(204);
      expect((await eventsOf(k1))[0].dealerId).toBe(dealer.id);

      const k2 = sk('admin');
      await post({ sessionKey: k2, events: [{ type: 'page_view', path: '/' }] }, UA, admin).expect(204);
      const k3 = sk('bot');
      for (const bot of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 HeadlessChrome/120', 'Slackbot-LinkExpanding 1.0 (link preview)', null]) {
        await post({ sessionKey: k3, events: [{ type: 'page_view', path: '/' }] }, bot).expect(204);
      }
      expect(await eventsOf(k2)).toHaveLength(0);
      expect(await eventsOf(k3)).toHaveLength(0);
    });

    it('geçersiz istekler: tip, yol, boyut, içerik türü, oturum anahtarı, olay sayısı, eksik alan, köken', async () => {
      const ok = { type: 'page_view', path: '/' };
      const key = sk('red');
      await post({ sessionKey: key, events: [{ ...ok, type: 'login' }] }).expect(400); // sunucu olayı istemciden gelmez
      await post({ sessionKey: key, events: [{ ...ok, type: 'bilinmeyen' }] }).expect(400);
      for (const path of ['katalog', '//evil.example', 'https://evil.example/', '/' + 'a'.repeat(300), '/a\nb']) {
        await post({ sessionKey: key, events: [{ ...ok, path }] }).expect(400);
      }
      await post({ sessionKey: 'kisa', events: [ok] }).expect(400);
      await post({ sessionKey: key, events: [] }).expect(400);
      await post({ sessionKey: key, events: Array.from({ length: 21 }, () => ok) }).expect(400);
      await post({ sessionKey: key, events: [{ type: 'product_view', path: '/urun/x' }] }).expect(400);
      await post({ sessionKey: key, events: [{ type: 'search', path: '/katalog' }] }).expect(400);
      await post({ sessionKey: key, events: [{ ...ok, productId: 'degil' }] }).expect(400);
      // Boyut: 16 KB üstü (hem json hem text/plain)
      const big = { sessionKey: key, events: [{ ...ok, referrer: 'https://x.example/' + 'a'.repeat(480) }, ...Array.from({ length: 19 }, () => ({ ...ok, referrer: 'https://x.example/' + 'b'.repeat(480) }))], pad: 'x'.repeat(7000) };
      await post(big).expect(413);
      await request(server()).post('/api/events').set('User-Agent', UA).set('Content-Type', 'text/plain').send(JSON.stringify(big)).expect(413);
      await request(server()).post('/api/events').set('User-Agent', UA).set('Content-Type', 'text/plain').send('{bozuk').expect(400);
      // İçerik türü
      await request(server()).post('/api/events').set('User-Agent', UA).type('form').send('a=b').expect(415);
      // Köken
      await request(server()).post('/api/events').set('User-Agent', UA).set('Origin', 'https://evil.example').send({ sessionKey: key, events: [ok] }).expect(403);
      await request(server()).post('/api/events').set('User-Agent', UA).set('Origin', 'http://localhost:5180').send({ sessionKey: key, events: [ok] }).expect(204);
      expect(await eventsOf(key)).toHaveLength(1); // yalnızca son geçerli istek
    });

    it('IP ve ham User-Agent hiçbir sütunda yok; visitor_key günlük tuzlu özet', async () => {
      const cols = await db.execute<{ table_name: string; column_name: string }>(
        sql`select table_name, column_name from information_schema.columns where table_name in ('analytics_events', 'analytics_daily_salts')`,
      );
      for (const c of cols.rows) expect(c.column_name, `${c.table_name}.${c.column_name}`).not.toMatch(/(^|_)(ip|ua|address|agent|host_ip)(_|$)|user_agent/);
      const key = sk('ip');
      await post({ sessionKey: key, events: [{ type: 'page_view', path: '/a' }] }).expect(204);
      await post({ sessionKey: key, events: [{ type: 'page_view', path: '/b' }] }).expect(204);
      await post({ sessionKey: key, events: [{ type: 'page_view', path: '/c' }] }, MOBILE_UA).expect(204);
      const rows = await eventsOf(key);
      const text = JSON.stringify(rows);
      for (const needle of ['127.0.0.1', '::1', '::ffff', 'Mozilla', 'Chrome']) expect(text).not.toContain(needle);
      const a = rows.filter((r) => r.path !== '/c');
      expect(a[0].visitorKey).toMatch(/^[0-9a-f]{32}$/);
      expect(a[0].visitorKey).toBe(a[1].visitorKey); // aynı IP + UA, aynı gün
      expect(rows.find((r) => r.path === '/c')?.visitorKey).not.toBe(a[0].visitorKey);
      // Tuz günlüktür ve eskisi silinir.
      expect(await recorder.saltFor('2020-01-01')).not.toBe(await recorder.saltFor('2020-01-02'));
      await recorder.cleanup();
      expect(await db.select().from(analyticsDailySalts).where(eq(analyticsDailySalts.day, '2020-01-01'))).toHaveLength(0);
    });

    it('400 günden eski olaylar temizlenir', async () => {
      const key = sk('eski');
      const day = 86_400_000;
      const base = { type: 'page_view', sessionKey: key, visitorKey: 'v'.repeat(32), path: '/', device: 'desktop' };
      await db.insert(analyticsEvents).values([
        { ...base, occurredAt: new Date(Date.now() - 401 * day) },
        { ...base, occurredAt: new Date(Date.now() - 399 * day) },
      ]);
      await recorder.cleanup();
      expect(await eventsOf(key)).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('K-85 sayımlar, aramalar, bayi zaman çizelgesi', () => {
    const q = { from: '2025-03-10', to: '2025-03-11' };
    let dealerA: Awaited<ReturnType<typeof dealerAgent>>;
    let dealerB: Awaited<ReturnType<typeof dealerAgent>>;
    let o1: { id: string };

    beforeAll(async () => {
      dealerA = await dealerAgent('sayim-a');
      dealerB = await dealerAgent('sayim-b');
      o1 = await place(dealerA.agent, p1.barcode, 6);
      const o2 = await place(dealerA.agent, p1.barcode, 6);
      await admin.post(`/api/admin/orders/${o2.id}/status`).send({ status: 'cancelled', note: 'test' }).expect((r) => expect([200, 201]).toContain(r.status));
      const t = (d: string) => new Date(`2025-03-${d}:00Z`); // 09:00Z = 12:00 İstanbul
      await db.update(orders).set({ submittedAt: t('10T10:00') }).where(inArray(orders.id, [o1.id, o2.id]));
      const A = 'a'.repeat(32);
      const B = 'b'.repeat(32);
      const E = 'e'.repeat(32);
      const A2 = 'c'.repeat(32);
      const ev = (sessionKey: string, visitorKey: string, at: Date, type: string, extra: Record<string, unknown> = {}, device = 'desktop') => ({
        type, sessionKey, visitorKey, occurredAt: at, path: '/', device, ...extra,
      });
      const d1 = t('10T09:00');
      const d2 = t('11T09:00');
      await db.insert(analyticsEvents).values([
        ev(sk('s1'), A, d1, 'page_view', { dealerId: dealerA.dealer.id }, 'mobile'),
        ev(sk('s1'), A, d1, 'product_view', { dealerId: dealerA.dealer.id, productId: p1.id, path: '/urun/p1' }, 'mobile'),
        ev(sk('s1'), A, d1, 'add_to_cart', { dealerId: dealerA.dealer.id, productId: p1.id, quantity: 6 }, 'mobile'),
        ev(sk('s1'), A, t('10T10:00'), 'order_submitted', { dealerId: dealerA.dealer.id, orderId: o1.id, path: '/sepet' }, 'mobile'),
        ev(sk('s2'), B, d1, 'page_view', { path: '/katalog', referrerHost: 'google.com' }, 'mobile'),
        ev(sk('s2'), B, d1, 'search', { path: '/katalog', query: 'termos', resultCount: 0 }, 'mobile'),
        ev(sk('s2'), B, d1, 'search', { path: '/katalog', query: 'termos', resultCount: 0 }, 'mobile'),
        ev(sk('s2'), B, d1, 'search', { path: '/katalog', query: 'çay', resultCount: 5 }, 'mobile'),
        ev(sk('s3'), A, d1, 'page_view'),
        ev(sk('s3'), A, d1, 'order_submitted', { dealerId: dealerA.dealer.id, orderId: o2.id, path: '/sepet' }),
        ev(sk('s4'), A2, d2, 'page_view'),
        ev(sk('s4'), A2, d2, 'product_view', { productId: p1.id, path: '/urun/p1' }),
        ev(sk('s4'), A2, d2, 'product_view', { productId: p2.id, path: '/urun/p2' }),
        ev(sk('s5'), E, d1, 'product_view', { dealerId: dealerB.dealer.id, productId: p1.id }),
        ev(sk('s5'), E, d1, 'product_view', { dealerId: dealerB.dealer.id, productId: p2.id }),
        ev(sk('s5'), E, d1, 'product_view', { dealerId: dealerB.dealer.id, productId: p3.id }),
        // Sunucu tarafı oturum (istemci olayı yok): ziyaretçi/oturum sayımına girmez
        ev(`srv-${run}-1`, A, d1, 'login', { dealerId: dealerA.dealer.id, path: '/giris' }),
      ]);
    });

    it('yetki: anonim 401, bayi 403, Admin 200', async () => {
      for (const path of ['/overview', '/live', '/products', '/searches', '/dealers']) {
        await request(server()).get(`/api/admin/analytics${path}`).expect(401);
        await dealerA.agent.get(`/api/admin/analytics${path}`).expect(403);
        await admin.get(`/api/admin/analytics${path}`).expect(200);
      }
    });

    it('overview: ziyaretçi/oturum/sayfa/huni/cihaz/kaynak sayımları ve karşılaştırma', async () => {
      const r = (await admin.get('/api/admin/analytics/overview').query(q).expect(200)).body;
      expect(r.period).toEqual(q);
      expect(r.previous).toEqual({ from: '2025-03-08', to: '2025-03-09' });
      const t = r.totals;
      expect(t.visitors).toEqual({ current: 4, previous: 0, percent: null }); // gün1: A,B,E; gün2: A2
      expect(t.sessions.current).toBe(5);
      expect(t.pageViews.current).toBe(4);
      expect(t.dealerVisitors.current).toBe(2);
      expect(t.productViews.current).toBe(6);
      expect(t.searches.current).toBe(3);
      expect(t.addToCarts.current).toBe(1);
      expect(t.orders.current).toBe(1); // iptal edilen sipariş sayılmaz
      expect(t.conversionRate.current).toBe(20); // 1 sipariş veren oturum / 5 oturum
      expect(r.funnel).toEqual([
        { step: 'sessions', sessions: 5 },
        { step: 'productView', sessions: 3 },
        { step: 'addToCart', sessions: 1 },
        { step: 'order', sessions: 1 },
      ]);
      expect(r.daily).toHaveLength(2);
      expect(r.daily[0]).toMatchObject({ date: '2025-03-10', visitors: 3, sessions: 4, pageViews: 3, dealerVisitors: 2, orders: 1 });
      expect(r.daily[1]).toMatchObject({ date: '2025-03-11', visitors: 1, sessions: 1, pageViews: 1, orders: 0 });
      expect(r.devices).toEqual([
        { device: 'desktop', sessions: 3, share: 60 },
        { device: 'mobile', sessions: 2, share: 40 },
      ]);
      expect(r.referrers).toEqual([{ host: 'Doğrudan', sessions: 4 }, { host: 'google.com', sessions: 1 }]);
      expect(r.topPages[0]).toEqual({ path: '/', pageViews: 3, visitors: 2 });
      expect(r.hours).toHaveLength(24);
      expect(r.hours[12].pageViews).toBe(4);
    });

    it('overview: önceki dönem karşılaştırması ve dönem sınırları (en fazla 400 gün, from > to)', async () => {
      const r = (await admin.get('/api/admin/analytics/overview').query({ from: '2025-03-12', to: '2025-03-13' }).expect(200)).body;
      expect(r.totals.visitors).toEqual({ current: 0, previous: 4, percent: -100 });
      await admin.get('/api/admin/analytics/overview').query({ from: '2024-01-01', to: '2025-03-01' }).expect(400);
      await admin.get('/api/admin/analytics/overview').query({ from: '2025-03-11', to: '2025-03-10' }).expect(400);
      await admin.get('/api/admin/analytics/overview').query({ from: '2025-02-30' }).expect(400);
      const def = (await admin.get('/api/admin/analytics/overview').expect(200)).body;
      expect(def.daily).toHaveLength(30);
    });

    it('sonuçsuz ve en çok aranan sorgular', async () => {
      const r = (await admin.get('/api/admin/analytics/searches').query(q).expect(200)).body;
      expect(r.zeroResults).toEqual([{ query: 'termos', count: 2, lastAt: '2025-03-10T09:00:00.000Z' }]);
      expect(r.top).toEqual([
        { query: 'termos', count: 2, avgResults: 0 },
        { query: 'çay', count: 1, avgResults: 5 },
      ]);
    });

    it('ürün analitiği: görüntüleme, tekil ziyaretçi, sepet, sipariş adedi (iptal hariç)', async () => {
      const r = (await admin.get('/api/admin/analytics/products').query(q).expect(200)).body;
      const byId = new Map(r.items.map((i: { productId: string }) => [i.productId, i]));
      expect(byId.get(p1.id)).toMatchObject({ views: 3, uniqueViewers: 3, addToCarts: 1, orderedQuantity: 6, orderCount: 1, barcode: p1.barcode });
      expect(byId.get(p1.id)).toMatchObject({ viewToCartRate: 33.3 });
      expect(byId.get(p2.id)).toMatchObject({ views: 2, orderedQuantity: 0 });
      expect(r.items[0].productId).toBe(p1.id);
      const ordered = (await admin.get('/api/admin/analytics/products').query({ ...q, sort: 'ordered' }).expect(200)).body;
      expect(ordered.items[0].productId).toBe(p1.id);
      await admin.get('/api/admin/analytics/products').query({ ...q, sort: 'x' }).expect(400);
    });

    it('bayi analitiği: oturum, sipariş, ilgilenip sipariş vermeyenler', async () => {
      const r = (await admin.get('/api/admin/analytics/dealers').query(q).expect(200)).body;
      const a = r.items.find((i: { dealerId: string }) => i.dealerId === dealerA.dealer.id);
      const b = r.items.find((i: { dealerId: string }) => i.dealerId === dealerB.dealer.id);
      expect(a).toMatchObject({ sessions: 1, productViews: 1, addToCarts: 1, orders: 1 });
      expect(a.phone).toBe('05320000000');
      expect(r.interestedNoOrder[0].phone).toBe('05320000000');
      expect(a.netTotal).toMatch(/^\d+\.\d{2}$/);
      expect(b).toMatchObject({ sessions: 1, productViews: 3, orders: 0, netTotal: '0.00' });
      expect(r.interestedNoOrder.map((i: { dealerId: string }) => i.dealerId)).toEqual([dealerB.dealer.id]);
    });

    it('bayi zaman çizelgesi: yalnızca Admin; en yeni önce, imleçli sayfalama, ürün adı/sipariş no', async () => {
      const url = `/api/admin/dealers/${dealerA.dealer.id}/activity`;
      await request(server()).get(url).expect(401);
      await dealerA.agent.get(url).expect(403);
      await dealerB.agent.get(url).expect(403);
      await admin.get(`/api/admin/dealers/${randomUUID()}/activity`).expect(404);
      await admin.get('/api/admin/dealers/degil/activity').expect(400);
      const first = (await admin.get(url).query({ limit: 3 }).expect(200)).body;
      expect(first.items).toHaveLength(3);
      expect(first.nextBefore).toBe(first.items[2].id);
      expect(first.items[0].id).toBeGreaterThan(first.items[1].id);
      const second = (await admin.get(url).query({ limit: 200, before: first.nextBefore }).expect(200)).body;
      expect(second.nextBefore).toBeNull();
      const all = [...first.items, ...second.items];
      expect(all.every((i: { id: number }) => typeof i.id === 'number')).toBe(true);
      const order = all.find((i: { type: string; orderId: string | null }) => i.type === 'order_submitted' && i.orderId === o1.id);
      expect(order.orderNo).toBeGreaterThan(0);
      const view = all.find((i: { type: string }) => i.type === 'product_view');
      expect(view.productName).toBe(`Ürün p1 ${run}`);
      // Başka bayinin olayı karışmaz
      expect(all.some((i: { productId: string | null; type: string }) => i.type === 'product_view' && i.productId === p3.id)).toBe(false);
    });

    it('canlı görünüm ve dashboard traffic', async () => {
      const key = sk('canli');
      await post({ sessionKey: key, events: [{ type: 'page_view', path: '/canli' }] }, UA, dealerA.agent).expect(204);
      const live = (await admin.get('/api/admin/analytics/live').expect(200)).body;
      expect(live.activeVisitors).toBeGreaterThanOrEqual(1);
      expect(live.activeDealers.some((d: { dealerId: string; path: string }) => d.dealerId === dealerA.dealer.id && d.path === '/canli')).toBe(true);
      expect(live.recent.length).toBeLessThanOrEqual(20);
      expect(live.recent[0]).toMatchObject({ type: 'page_view', path: '/canli' });
      const dash = (await admin.get('/api/admin/dashboard').expect(200)).body;
      expect(dash.traffic).toEqual({
        todayVisitors: expect.any(Number),
        todayPageViews: expect.any(Number),
        activeNow: expect.any(Number),
        yesterdayVisitors: expect.any(Number),
      });
      expect(dash.traffic.todayVisitors).toBeGreaterThanOrEqual(1);
    });

    it('sunucu tarafı olaylar: bayi girişi ve sipariş gönderimi kaydedilir', async () => {
      const logins = await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.dealerId, dealerA.dealer.id), eq(analyticsEvents.type, 'login')));
      expect(logins.length).toBeGreaterThanOrEqual(1);
      const submitted = await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.dealerId, dealerA.dealer.id), eq(analyticsEvents.type, 'order_submitted'), eq(analyticsEvents.orderId, o1.id)));
      // Test verisi yerine sunucunun yazdığı gerçek olay: sipariş sonrası UA'lı istekle yazılan kayıt
      const fresh = await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.dealerId, dealerA.dealer.id), eq(analyticsEvents.type, 'order_submitted')));
      expect(fresh.length).toBeGreaterThanOrEqual(submitted.length + 2);
      expect(fresh.every((e) => e.orderId !== null)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('K-86 çok satanlar, popüler sıralama, ids, highlights', () => {
    let X: { id: string; barcode: string };
    let Y: { id: string; barcode: string };
    let Z: { id: string; barcode: string };
    let off: { id: string; barcode: string };

    beforeAll(async () => {
      const g = (await admin.post('/api/admin/product-groups').send({ name: `Cok Satan ${run}` }).expect(201)).body.id;
      Z = await createProduct(g, 'zz-satissiz', { name: `Aaa Satışsız ${run}` });
      Y = await createProduct(g, 'yy-iptal', { name: `Bbb İptalli ${run}` });
      X = await createProduct(g, 'xx-satan', { name: `Zzz Satan ${run}` });
      off = await createProduct(g, 'off-pasif', { name: `Ccc Pasif ${run}` });
      const { agent } = await dealerAgent('satis');
      await place(agent, X.barcode, 12);
      const cancelled = await place(agent, Y.barcode, 24);
      await admin.post(`/api/admin/orders/${cancelled.id}/status`).send({ status: 'cancelled', note: 'test' }).expect((r) => expect([200, 201]).toContain(r.status));
      await admin.patch(`/api/admin/products/${off.id}`).send({ isActive: false }).expect(200);
      popularity.clearCache();
    });

    it('isBestSeller: satışı olan true; yalnızca iptal edilmiş ve satışsız ürün asla', async () => {
      const list = (await request(server()).get('/api/catalog/products').query({ q: run }).expect(200)).body.items as { id: string; isBestSeller: boolean }[];
      const flag = (id: string) => list.find((i) => i.id === id)?.isBestSeller;
      expect(flag(X.id)).toBe(true);
      expect(flag(Y.id)).toBe(false);
      expect(flag(Z.id)).toBe(false);
      const detail = (await request(server()).get(`/api/catalog/products/${X.id}`).expect(200)).body;
      expect(detail.isBestSeller).toBe(true);
    });

    it('sort=popular satış adedine göre; ids= verilen sırayla, pasif atlanır, en fazla 24', async () => {
      const g = (await admin.get(`/api/admin/products/${X.id}`).expect(200)).body.groupId as string;
      const pop = (await request(server()).get('/api/catalog/products').query({ groupId: g, sort: 'popular' }).expect(200)).body.items as { id: string }[];
      expect(pop[0].id).toBe(X.id);
      const byName = (await request(server()).get('/api/catalog/products').query({ groupId: g }).expect(200)).body.items as { id: string }[];
      expect(byName[0].id).toBe(Z.id);
      const ids = (await request(server()).get('/api/catalog/products').query({ ids: [Z.id, off.id, X.id].join(',') }).expect(200)).body;
      expect(ids.items.map((i: { id: string }) => i.id)).toEqual([Z.id, X.id]);
      expect(ids.total).toBe(2);
      await request(server()).get('/api/catalog/products').query({ ids: Array.from({ length: 25 }, () => randomUUID()).join(',') }).expect(400);
      await request(server()).get('/api/catalog/products').query({ ids: 'degil' }).expect(400);
      // fiyat yine yalnızca bayiye
      expect(ids.items[0].price).toBeNull();
    });

    it('highlights herkese açık ve yalnızca kimlik döner', async () => {
      const now = new Date();
      await db.insert(analyticsEvents).values([
        ...Array.from({ length: 6 }, () => ({ type: 'product_view', sessionKey: sk('hl'), visitorKey: 'h'.repeat(32), path: '/urun/z', productId: Z.id, device: 'desktop', occurredAt: now })),
        ...Array.from({ length: 2 }, () => ({ type: 'product_view', sessionKey: sk('hl'), visitorKey: 'h'.repeat(32), path: '/urun/y', productId: Y.id, device: 'desktop', occurredAt: now })),
      ]);
      popularity.clearCache();
      const r = (await request(server()).get('/api/catalog/highlights').query({ limit: 24 }).expect(200)).body;
      expect(Object.keys(r).sort()).toEqual(['bestSellers', 'mostViewed', 'trending']);
      expect(r.bestSellers).toContain(X.id);
      expect(r.bestSellers).not.toContain(Y.id);
      expect(r.mostViewed.indexOf(Z.id)).toBeGreaterThanOrEqual(0);
      expect(r.mostViewed.indexOf(Z.id)).toBeLessThan(r.mostViewed.indexOf(Y.id));
      expect(r.trending).toContain(Z.id); // en az 5 inceleme
      expect(r.trending).not.toContain(Y.id); // 2 inceleme
      expect(JSON.stringify(r)).not.toMatch(/price|listPrice/);
      await request(server()).get('/api/catalog/highlights').query({ limit: 25 }).expect(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('K-87 yönetilebilir vitrin', () => {
    const section = (over: Record<string, unknown>) => ({ id: randomUUID().slice(0, 12), enabled: true, ...over });
    const putHome = (sections: unknown[], agent: { put(url: string): request.Test } = admin) => agent.put('/api/admin/site/home').send({ sections });

    it('varsayılan home mevcut sırayı ve "En çok satanlar" rafını üretir; /api/site yanıtında home/navigation/announcements', async () => {
      const home = (await admin.get('/api/admin/site/home').expect(200)).body;
      expect(home.sections.map((s: { type: string }) => s.type)).toEqual([
        'hero', 'categoryStrip', 'campaignStrip', 'collections', 'productShelf', 'productShelf', 'iconTiles', 'promoPanel', 'howItWorks', 'trustStrip',
      ]);
      expect(home.sections.some((s: { title?: string }) => s.title === 'En çok satanlar')).toBe(true);
      const site = (await request(server()).get('/api/site').expect(200)).body;
      expect(site.home.sections.length).toBe(home.sections.length);
      expect(site.navigation.isDefault).toBe(true);
      expect(site.announcements.items).toEqual([{ text: 'Toptan satış portalı · Fiyatlar KDV hariçtir' }]);
      expect(site.announcement).toBe('Toptan satış portalı · Fiyatlar KDV hariçtir');
    });

    it('GET /admin/site/home/default sunucunun varsayılan düzenini verir (yalnızca Admin)', async () => {
      await request(server()).get('/api/admin/site/home/default').expect(401);
      const def = (await admin.get('/api/admin/site/home/default').expect(200)).body;
      expect(def.sections).toHaveLength(10);
      await putHome([section({ id: 'tek', type: 'hero', config: {} })]).expect(200);
      expect((await admin.get('/api/admin/site/home/default').expect(200)).body).toEqual(def);
      await putHome(def.sections).expect(200);
    });

    it('PUT /admin/site: announcement verilmezse duyuruya dokunulmaz', async () => {
      await admin.put('/api/admin/site/announcements').send({ items: [{ text: 'Sabit duyuru', link: '/katalog' }] }).expect(200);
      const current = (await admin.get('/api/admin/site').expect(200)).body;
      await admin.put('/api/admin/site').send({ contact: current.contact, pages: [] }).expect(200);
      expect((await admin.get('/api/admin/site/announcements').expect(200)).body.items).toEqual([{ text: 'Sabit duyuru', link: '/katalog' }]);
      expect((await request(server()).get('/api/site').expect(200)).body.announcement).toBe('Sabit duyuru');
      await admin.put('/api/admin/site/announcements').send({ items: [] }).expect(200);
    });

    it('yetki: anonim 401, bayi 403', async () => {
      const { agent } = await dealerAgent('vitrin-yetki');
      for (const key of ['home', 'navigation', 'announcements']) {
        await request(server()).get(`/api/admin/site/${key}`).expect(401);
        await request(server()).put(`/api/admin/site/${key}`).send({}).expect(401);
        await agent.get(`/api/admin/site/${key}`).expect(403);
        await agent.put(`/api/admin/site/${key}`).send({ sections: [], items: [] }).expect(403);
      }
    });

    it('home doğrulama: bilinmeyen tip, eksik grup/ürün, sınırlar, bağlantı, yinelenen kimlik', async () => {
      const shelf = { type: 'productShelf', config: { source: 'new', limit: 8, layout: 'grid' } };
      await putHome([section({ type: 'bilinmeyen', config: {} })]).expect(400);
      await putHome([section({ ...shelf, config: { source: 'group', limit: 8 } })]).expect(400);
      await putHome([section({ ...shelf, config: { source: 'manual', limit: 8, productIds: [] } })]).expect(400);
      await putHome([section({ ...shelf, config: { source: 'kaynak', limit: 8 } })]).expect(400);
      await putHome([section({ ...shelf, config: { source: 'new', limit: 3 } })]).expect(400);
      await putHome([section({ ...shelf, config: { source: 'new', limit: 25 } })]).expect(400);
      await putHome([section({ ...shelf, config: { source: 'manual', limit: 8, productIds: Array.from({ length: 25 }, () => randomUUID()) } })]).expect(400);
      await putHome([section({ type: 'campaignStrip', config: { audience: 'x', title: 'a', text: 'b' } })]).expect(400);
      await putHome([section({ type: 'campaignStrip', config: { audience: 'all', title: 'a', text: 'b', buttonLabel: 'Git', buttonLink: 'javascript:alert(1)' } })]).expect(400);
      await putHome([section({ type: 'campaignStrip', config: { audience: 'all', title: 'a', text: 'b', buttonLabel: 'Git', buttonLink: '//evil.example' } })]).expect(400);
      await putHome([section({ type: 'collections', config: { groupIds: Array.from({ length: 5 }, () => randomUUID()) } })]).expect(400);
      await putHome(Array.from({ length: 21 }, () => section({ type: 'hero', config: {} }))).expect(400);
      const dup = section({ type: 'hero', config: {} });
      await putHome([dup, dup]).expect(400);
      const res = await putHome([section({ type: 'bilinmeyen', config: {} })]).expect(400);
      expect(res.body.code).toBe('VALIDATION');
      // Hiçbir geçersiz istek kaydedilmedi
      expect((await admin.get('/api/admin/site/home').expect(200)).body.sections).toHaveLength(10);
    });

    it('home kaydı ve GET /api/site/home: çözülmüş productIds (kaynaklara göre), pasif/bilinmeyen elenir', async () => {
      const off = await createProduct(groupB, 'home-pasif');
      await admin.patch(`/api/admin/products/${off.id}`).send({ isActive: false }).expect(200);
      const feat = await createProduct(groupB, 'home-feat', { isFeatured: true });
      const sections = [
        section({ id: 'h-manual', type: 'productShelf', title: 'Seçme', config: { source: 'manual', limit: 8, layout: 'carousel', productIds: [p3.id, off.id, randomUUID(), p1.id] } }),
        section({ id: 'h-group', type: 'productShelf', config: { source: 'group', groupId: groupA, limit: 4, layout: 'grid' } }),
        section({ id: 'h-feat', type: 'promoPanel', config: { source: 'featured', limit: 8, panelTitle: 'Öne çıkan', buttonLabel: 'Tümü', buttonLink: '/katalog' } }),
        section({ id: 'h-best', type: 'productShelf', config: { source: 'bestSellers', limit: 4 } }),
        section({ id: 'h-off', type: 'productShelf', enabled: false, config: { source: 'new', limit: 8 } }),
        section({ id: 'h-col', type: 'collections', config: { groupIds: [] } }),
        section({ id: 'h-col2', type: 'collections', config: { groupIds: [groupA, randomUUID()] } }),
        section({ id: 'h-camp', type: 'campaignStrip', config: { audience: 'dealer', title: 'Kampanya', text: 'Metin' } }),
      ];
      const saved = (await putHome(sections).expect(200)).body;
      expect(saved.sections).toHaveLength(8);
      const pub = (await request(server()).get('/api/site/home').expect(200)).body;
      const by = (id: string) => pub.sections.find((s: { id: string }) => s.id === id);
      expect(by('h-off')).toBeUndefined(); // kapalı bölüm herkese açık yanıtta yok
      expect(by('h-manual').productIds).toEqual([p3.id, p1.id]); // sıra korunur, pasif ve bilinmeyen elenir
      expect(by('h-group').productIds.sort()).toEqual([p1.id, p2.id].sort());
      expect(by('h-feat').productIds).toContain(feat.id);
      expect(by('h-feat').productIds).not.toContain(off.id);
      expect(Array.isArray(by('h-best').productIds)).toBe(true);
      expect(by('h-col').config.groupIds.length).toBeGreaterThan(0);
      expect(by('h-col').config.groupIds.length).toBeLessThanOrEqual(4);
      expect(by('h-col2').config.groupIds).toEqual([groupA]);
      expect(by('h-camp').config).toMatchObject({ audience: 'dealer', title: 'Kampanya' });
      expect(by('h-camp').productIds).toBeUndefined();
      // Fiyat sızıntısı yok
      expect(JSON.stringify(pub)).not.toMatch(/listPrice|"price"/);
      // Admin okuması kaydedileni (çözülmemiş) döndürür
      const adminHome = (await admin.get('/api/admin/site/home').expect(200)).body;
      expect(adminHome.sections.find((s: { id: string }) => s.id === 'h-off').enabled).toBe(false);
      expect(adminHome.sections.find((s: { id: string }) => s.id === 'h-manual').productIds).toBeUndefined();
      // Audit
      const audit = await db.select().from(auditLog).where(and(eq(auditLog.action, 'site.updated'), eq(auditLog.entityId, 'site')));
      expect(audit.length).toBeGreaterThan(0);
    });

    it('navigation: varsayılan (aktif gruplar + Öne Çıkanlar + Yeni Ürünler), doğrulama ve kayıt', async () => {
      const def = (await admin.get('/api/admin/site/navigation').expect(200)).body;
      expect(def.isDefault).toBe(true);
      expect(def.items.some((i: { type: string; groupId?: string }) => i.type === 'group' && i.groupId === groupA)).toBe(true);
      expect(def.items.slice(-2).map((i: { type: string }) => i.type)).toEqual(['featured', 'new']);
      const put = (items: unknown[]) => admin.put('/api/admin/site/navigation').send({ items });
      await put([{ type: 'group' }]).expect(400);
      await put([{ type: 'link', label: 'x' }]).expect(400);
      await put([{ type: 'link', label: 'x', href: 'javascript:alert(1)' }]).expect(400);
      await put([{ type: 'bilinmeyen' }]).expect(400);
      await put(Array.from({ length: 13 }, () => ({ type: 'new' }))).expect(400);
      const saved = (await put([{ type: 'group', groupId: groupB }, { type: 'bestSellers', label: 'Çok Satanlar' }, { type: 'link', label: 'Biz', href: '/hakkimizda' }]).expect(200)).body;
      expect(saved.isDefault).toBe(false);
      expect(saved.items).toHaveLength(3);
      const site = (await request(server()).get('/api/site').expect(200)).body;
      expect(site.navigation.items[0]).toMatchObject({ type: 'group', groupId: groupB, label: `Analitik B ${run}` });
      // Pasif grup herkese açık menüden düşer
      await admin.patch(`/api/admin/product-groups/${groupB}`).send({ isActive: false }).expect(200);
      const after = (await request(server()).get('/api/site').expect(200)).body;
      expect(after.navigation.items.some((i: { groupId?: string }) => i.groupId === groupB)).toBe(false);
      await admin.patch(`/api/admin/product-groups/${groupB}`).send({ isActive: true }).expect(200);
    });

    it('announcements: eski tek alan ilk öğe olarak taşınır; ikisi senkron kalır', async () => {
      await db.delete(siteSettings).where(inArray(siteSettings.key, ['announcement', 'announcements']));
      await db.insert(siteSettings).values({ key: 'announcement', value: sql`${JSON.stringify('Eski duyuru')}::jsonb` });
      const first = (await admin.get('/api/admin/site/announcements').expect(200)).body;
      expect(first).toEqual({ items: [{ text: 'Eski duyuru' }] });
      const put = (items: unknown[]) => admin.put('/api/admin/site/announcements').send({ items });
      await put([{ text: '' }]).expect(400);
      await put([{ text: 'a'.repeat(121) }]).expect(400);
      await put(Array.from({ length: 6 }, () => ({ text: 'x' }))).expect(400);
      await put([{ text: 'x', link: 'javascript:1' }]).expect(400);
      const saved = (await put([{ text: 'Birinci', link: '/katalog' }, { text: 'İkinci' }]).expect(200)).body;
      expect(saved.items).toEqual([{ text: 'Birinci', link: '/katalog' }, { text: 'İkinci' }]);
      const site = (await request(server()).get('/api/site').expect(200)).body;
      expect(site.announcements.items).toHaveLength(2);
      expect(site.announcement).toBe('Birinci');
      // Eski uçtan duyuru değişince ilk öğe güncellenir, diğerleri korunur
      const current = (await admin.get('/api/admin/site').expect(200)).body;
      await admin.put('/api/admin/site').send({ announcement: 'Eski yoldan', contact: current.contact, pages: [] }).expect(200);
      expect((await admin.get('/api/admin/site/announcements').expect(200)).body.items).toEqual([{ text: 'Eski yoldan', link: '/katalog' }, { text: 'İkinci' }]);
      await put([]).expect(200);
      expect((await request(server()).get('/api/site').expect(200)).body.announcement).toBeNull();
    });

    it('varsayılan KVKK metni çerezsiz ziyaret istatistiğini anlatır ve TASLAK notu korunur', async () => {
      const kvkk = (await request(server()).get('/api/site/pages/kvkk').expect(200)).body;
      expect(kvkk.body).toContain('TASLAK — hukuk onayı bekliyor');
      expect(kvkk.body).toContain('çerez kullanmadan');
      expect(kvkk.body).toContain('IP adresiniz saklanmaz');
    });
  });
});

describe('K-84 hız sınırı (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await boot(3);
  });
  afterAll(async () => {
    await app?.close();
  });
  it('IP başına dakikada sınır aşılınca 429', async () => {
    const body = { sessionKey: `rate-${run}-0000000`, events: [{ type: 'page_view', path: '/' }] };
    const codes: number[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await request(app.getHttpServer()).post('/api/events').set('User-Agent', 'Mozilla/5.0 Chrome').send(body)).status);
    expect(codes).toEqual([204, 204, 204, 429, 429]);
  });
  it('(temizlik) hız sınırı testinin olayları silinir', async () => {
    const db = app.get<Database>(DB);
    await db.delete(analyticsEvents).where(like(analyticsEvents.sessionKey, `rate-${run}%`));
  });
});
