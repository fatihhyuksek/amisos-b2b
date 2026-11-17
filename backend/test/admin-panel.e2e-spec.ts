// Yönetim paneli yenilemesi (e2e). API: docs/api/admin-panel-api.md. Kararlar: K-77, K-78.
// Sabit saat (2030-06-15 12:00 İstanbul): dashboard ve bildirim akışı sayıları birebir doğrulanır.
// Kalıcı sayaçlar (hat, dikkat kartları) veritabanındaki diğer verilerden etkilenmesin diye "önce/sonra" farkıyla ölçülür.
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq, inArray, like, or } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import { DB, type Database } from '../src/database/database.module.js';
import {
  adminUsers,
  auditLog,
  dealers,
  media,
  notificationOutbox,
  orderNotes,
  orders,
  orderStatusHistory,
  productGroups,
  productImages,
  products,
  sessions,
  siteSettings,
} from '../src/database/schema.js';
import { companyTitleKey } from '../src/dealers/company-title.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);
const NOW = new Date('2030-06-15T09:00:00Z');
type Agent = ReturnType<typeof request.agent>;
type Status = typeof orders.$inferInsert.status;

const binary = (r: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  r.on('data', (c: Buffer) => chunks.push(c));
  r.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Yönetim paneli yenilemesi (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let admin: Agent;
  let admin2: Agent;
  let dealerAgent: Agent;
  const adminIds: string[] = [];
  const dealerIds: string[] = [];
  const productIds: string[] = [];
  const mediaIds: string[] = [];
  const outboxIds: string[] = [];
  let groupId = '';
  let adminName = '';
  const server = () => app.getHttpServer();
  const bc = (n: string) => `0${n}${run}`;

  async function newAdmin(label: string, fullName: string) {
    const [a] = await db
      .insert(adminUsers)
      .values({ email: `${label}-${run}@test.example`, fullName, passwordHash: await hash(PASSWORD) })
      .returning();
    adminIds.push(a.id);
    const agent = request.agent(server());
    await agent.post('/api/auth/admin/login').send({ email: a.email, password: PASSWORD }).expect(200);
    return { agent, row: a };
  }

  async function newDealer(name: string, over: Partial<typeof dealers.$inferInsert> = {}) {
    const title = over.companyTitle ?? `Panel ${name} ${run}`;
    const [d] = await db
      .insert(dealers)
      .values({
        companyTitle: title,
        companyTitleKey: companyTitleKey(title),
        contactName: `Yetkili ${name}`,
        email: `${name}-${run}@test.example`,
        phone: '05321234567',
        city: 'Kayseri',
        district: 'Melikgazi',
        address: 'Adres 1',
        source: 'invitation',
        status: 'active',
        passwordHash: await hash(PASSWORD),
        emailVerifiedAt: new Date('2029-01-01T00:00:00Z'),
        ...over,
      })
      .returning();
    dealerIds.push(d.id);
    return d;
  }

  /** Doğrudan veritabanına tutarlı sipariş: KDV %20; net verilir. */
  async function makeOrder(dealerId: string, submittedAt: string, net: string, status: Status = 'submitted', transfer: 'pending' | 'transferred' = 'pending') {
    const vat = (Number(net) * 0.2).toFixed(2);
    const grand = (Number(net) + Number(vat)).toFixed(2);
    const [o] = await db
      .insert(orders)
      .values({
        dealerId,
        status,
        deliveryMethod: 'pickup',
        grossTotal: net,
        discountTotal: '0.00',
        netTotal: net,
        vatTotal: vat,
        grandTotal: grand,
        transferStatus: transfer,
        submittedAt: new Date(submittedAt),
      })
      .returning();
    return o;
  }

  async function newProduct(name: string, over: Partial<typeof products.$inferInsert> = {}) {
    const [p] = await db
      .insert(products)
      .values({ groupId, barcode: bc(name), code: `K-${name}-${run}`, name: `${name} ${run}`, caseQuantity: 6, listPrice: '10.00', vatRate: '20.00', ...over })
      .returning();
    productIds.push(p.id);
    return p;
  }

  const dashboard = async () => (await admin.get('/api/admin/dashboard').expect(200)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => NOW })
      .overrideProvider(MAIL_SERVICE)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get<Database>(DB);
    adminName = `Panel Admin ${run}`;
    admin = (await newAdmin('pa', adminName)).agent;
    admin2 = (await newAdmin('pb', 'İkinci Admin')).agent;
    const [g] = await db.insert(productGroups).values({ name: `Panel Grup ${run}`, nameKey: `panel grup ${run}` }).returning();
    groupId = g.id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(auditLog).where(or(inArray(auditLog.actorId, adminIds), like(auditLog.entityId, `%${run}%`)));
      await db.delete(sessions).where(inArray(sessions.subjectId, [...adminIds, ...dealerIds]));
      await db.delete(siteSettings);
      if (outboxIds.length) await db.delete(notificationOutbox).where(inArray(notificationOutbox.id, outboxIds));
      if (dealerIds.length) await db.delete(orders).where(inArray(orders.dealerId, dealerIds));
      await db.delete(auditLog).where(inArray(auditLog.entityType, ['orders', 'products']));
      if (productIds.length) await db.delete(productImages).where(inArray(productImages.productId, productIds));
      const dupes = await db.select({ id: products.id }).from(products).where(like(products.barcode, `%${run}%`));
      const allProducts = [...new Set([...productIds, ...dupes.map((d) => d.id)])];
      if (allProducts.length) {
        await db.delete(productImages).where(inArray(productImages.productId, allProducts));
        await db.delete(products).where(inArray(products.id, allProducts));
      }
      if (mediaIds.length) await db.delete(media).where(inArray(media.id, mediaIds));
      await db.delete(productGroups).where(eq(productGroups.id, groupId));
      if (dealerIds.length) await db.delete(dealers).where(inArray(dealers.id, dealerIds));
      await db.delete(adminUsers).where(inArray(adminUsers.id, adminIds));
    }
    await app?.close();
  });

  // -------------------------------------------------------------------------
  it('GR-YON-001: yeni uçlar anonim 401, bayi 403', async () => {
    const d = await newDealer('yetki');
    dealerAgent = request.agent(server());
    await dealerAgent.post('/api/auth/dealer/login').send({ email: d.email, password: PASSWORD }).expect(200);
    const o = await makeOrder(d.id, '2029-06-01T10:00:00Z', '10.00');
    const p = await newProduct('yetki');
    const uuid = '00000000-0000-4000-8000-000000000000';
    const calls: [string, string, object?][] = [
      ['get', '/api/admin/search?q=ab'],
      ['get', '/api/admin/dashboard'],
      ['get', '/api/admin/notifications/feed'],
      ['post', '/api/admin/notifications/feed/read', { until: NOW.toISOString() }],
      ['get', `/api/admin/orders/${o.id}/notes`],
      ['post', `/api/admin/orders/${o.id}/notes`, { body: 'x' }],
      ['delete', `/api/admin/orders/${o.id}/notes/${uuid}`],
      ['post', `/api/admin/products/${p.id}/duplicate`, { barcode: 'x' }],
      ['get', '/api/admin/products/export.xlsx'],
      ['get', '/api/admin/dealers/export.xlsx'],
      ['put', '/api/admin/site', {}],
    ];
    for (const [method, url, body] of calls) {
      const anon = await (request(server()) as unknown as Record<string, (u: string) => request.Test>)[method](url).send(body);
      expect(anon.status, `anon ${method} ${url}`).toBe(401);
      const dealer = await (dealerAgent as unknown as Record<string, (u: string) => request.Test>)[method](url).send(body);
      expect(dealer.status, `bayi ${method} ${url}`).toBe(403);
    }
  });

  // -------------------------------------------------------------------------
  describe('K-77 sosyal medya', () => {
    it('varsayılan: yalnız Instagram; yönetim ve herkese açık yanıt aynı', async () => {
      await db.delete(siteSettings);
      const pub = (await request(server()).get('/api/site').expect(200)).body;
      expect(pub.social).toEqual({
        instagram: 'https://www.instagram.com/amisoszuccaciye/',
        facebook: null,
        youtube: null,
        tiktok: null,
        linkedin: null,
      });
      expect((await admin.get('/api/admin/site').expect(200)).body.social).toEqual(pub.social);
    });

    it('kısmi güncelleme, null ile kaldırma, audit; doğrulama 400 fields', async () => {
      const current = (await admin.get('/api/admin/site').expect(200)).body;
      const base = { announcement: current.announcement, contact: current.contact, pages: [] };
      // `social` hiç verilmezse değişmez.
      await admin.put('/api/admin/site').send(base).expect(200);
      expect((await request(server()).get('/api/site')).body.social.instagram).toBe('https://www.instagram.com/amisoszuccaciye/');

      const saved = (
        await admin
          .put('/api/admin/site')
          .send({ ...base, social: { facebook: 'https://www.facebook.com/amisos', youtube: ' https://m.youtube.com/@amisos ', instagram: null } })
          .expect(200)
      ).body;
      expect(saved.social).toEqual({ instagram: null, facebook: 'https://www.facebook.com/amisos', youtube: 'https://m.youtube.com/@amisos', tiktok: null, linkedin: null });
      expect((await request(server()).get('/api/site').expect(200)).body.social.facebook).toBe('https://www.facebook.com/amisos');
      // Boş metin de kaldırır; verilmeyen alan korunur.
      const cleared = (await admin.put('/api/admin/site').send({ ...base, social: { facebook: '' } }).expect(200)).body;
      expect(cleared.social.facebook).toBeNull();
      expect(cleared.social.youtube).toBe('https://m.youtube.com/@amisos');
      const audit = await db.select().from(auditLog).where(eq(auditLog.action, 'site.updated'));
      expect(audit.some((a) => JSON.stringify(a.data).includes('"social"'))).toBe(true);

      const bad = {
        instagram: 'http://instagram.com/x',
        facebook: 'https://instagram.com/x',
        youtube: 'https://notyoutube.com/x',
        tiktok: 'javascript:alert(1)',
        linkedin: 'amisos',
      };
      const res = await admin.put('/api/admin/site').send({ ...base, social: bad }).expect(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(Object.keys(res.body.fields).sort()).toEqual(['social.facebook', 'social.instagram', 'social.linkedin', 'social.tiktok', 'social.youtube']);
      await db.delete(siteSettings);
    });
  });

  // -------------------------------------------------------------------------
  describe('Genel arama', () => {
    it('q 2–100 karakter', async () => {
      await admin.get('/api/admin/search').expect(400);
      await admin.get('/api/admin/search?q=a').expect(400);
      await admin.get(`/api/admin/search?q=${'a'.repeat(101)}`).expect(400);
      await admin.get(`/api/admin/search?q=${'a'.repeat(100)}`).expect(200);
    });

    it('sipariş (numara önek/bayi), bayi (Türkçe harf duyarsız), ürün; en fazla 6', async () => {
      const cicek = await newDealer('cicek', { companyTitle: `Çiçek Züccaciye ${run}`, contactName: 'Şükrü İnce', phone: '0532 765 43 21' });
      const o = await makeOrder(cicek.id, '2029-06-02T10:00:00Z', '50.00');
      const urun = await newProduct('Şekerlik', { name: `Şekerlik Çanağı ${run}` });
      for (let i = 0; i < 8; i++) await newProduct(`Toplu${i}`, { name: `Toplucay ${run} ${i}` });

      const byTitle = (await admin.get('/api/admin/search').query({ q: `cicek zuccaciye ${run}` }).expect(200)).body;
      expect(byTitle.dealers.map((d: { id: string }) => d.id)).toEqual([cicek.id]);
      expect(byTitle.dealers[0]).toEqual({ id: cicek.id, companyTitle: cicek.companyTitle, contactName: 'Şükrü İnce', city: 'Kayseri', status: 'active' });
      // Aynı sorgu bayinin siparişini de bulur (bayi adıyla).
      expect(byTitle.orders).toEqual([
        { id: o.id, orderNo: o.orderNo, dealerName: cicek.companyTitle, status: 'submitted', grandTotal: '60.00', submittedAt: '2029-06-02T10:00:00.000Z' },
      ]);
      expect(byTitle.products).toEqual([]);

      const byContact = (await admin.get('/api/admin/search').query({ q: 'SUKRU INCE' }).expect(200)).body;
      expect(byContact.dealers.map((d: { id: string }) => d.id)).toContain(cicek.id);
      // Telefon: boşluk ve biçimden bağımsız rakam eşleşmesi.
      expect((await admin.get('/api/admin/search').query({ q: '765 43' }).expect(200)).body.dealers.map((d: { id: string }) => d.id)).toContain(cicek.id);
      // E-posta.
      expect((await admin.get('/api/admin/search').query({ q: `cicek-${run}@` }).expect(200)).body.dealers).toHaveLength(1);

      // Sipariş numarası: tam ve önek (#'li de olur).
      const exact = (await admin.get('/api/admin/search').query({ q: String(o.orderNo) }).expect(200)).body;
      expect(exact.orders.map((x: { id: string }) => x.id)).toContain(o.id);
      const prefix = (await admin.get('/api/admin/search').query({ q: `#${String(o.orderNo).slice(0, -1)}` }).expect(200)).body;
      expect(prefix.orders.map((x: { id: string }) => x.id)).toContain(o.id);

      // Ürün: ad (Türkçe duyarsız), barkod, kod; küçük resim yoksa null.
      const byName = (await admin.get('/api/admin/search').query({ q: `sekerlik canagi ${run}` }).expect(200)).body;
      expect(byName.products).toEqual([{ id: urun.id, name: urun.name, barcode: urun.barcode, code: urun.code, isActive: true, thumbUrl: null }]);
      expect((await admin.get('/api/admin/search').query({ q: urun.barcode }).expect(200)).body.products).toHaveLength(1);
      expect((await admin.get('/api/admin/search').query({ q: urun.code! }).expect(200)).body.products).toHaveLength(1);

      const many = (await admin.get('/api/admin/search').query({ q: `toplucay ${run}` }).expect(200)).body;
      expect(many.products).toHaveLength(6);
    });

    it('ürün küçük resmi; pasif ürün isActive=false', async () => {
      const [m] = await db
        .insert(media)
        .values({ storageKey: `panel-${run}-t`, originalName: 'x.png', mime: 'image/png', size: 1, width: 1, height: 1, uploadedBy: adminIds[0] })
        .returning();
      mediaIds.push(m.id);
      const p = await newProduct('Resimli', { isActive: false });
      await db.insert(productImages).values({ productId: p.id, mediaId: m.id, sortOrder: 0 });
      const res = (await admin.get('/api/admin/search').query({ q: p.barcode }).expect(200)).body;
      expect(res.products).toEqual([{ id: p.id, name: p.name, barcode: p.barcode, code: p.code, isActive: false, thumbUrl: `/api/media/${m.id}/thumb.webp` }]);
    });
  });

  // -------------------------------------------------------------------------
  describe('Sipariş iç notları', () => {
    it('ekle/listele/sil, doğrulama, audit, internalNoteCount; bayiye hiç dönmez', async () => {
      const d = await newDealer('notlu');
      const dAgent = request.agent(server());
      await dAgent.post('/api/auth/dealer/login').send({ email: d.email, password: PASSWORD }).expect(200);
      const o = await makeOrder(d.id, '2029-06-03T10:00:00Z', '100.00');
      const other = await makeOrder(d.id, '2029-06-04T10:00:00Z', '100.00');
      const secret = `GİZLİ-İÇ-NOT-${run}`;

      expect((await admin.get(`/api/admin/orders/${o.id}`).expect(200)).body.internalNoteCount).toBe(0);
      expect((await admin.get(`/api/admin/orders/${o.id}/notes`).expect(200)).body).toEqual([]);

      await admin.post(`/api/admin/orders/${o.id}/notes`).send({ body: '   ' }).expect(400);
      await admin.post(`/api/admin/orders/${o.id}/notes`).send({ body: 'x'.repeat(2001) }).expect(400);
      await admin.post(`/api/admin/orders/${o.id}/notes`).send({}).expect(400);
      await admin.post(`/api/admin/orders/${randomUUID()}/notes`).send({ body: 'x' }).expect(404);
      await admin.get(`/api/admin/orders/${randomUUID()}/notes`).expect(404);

      const first = (await admin.post(`/api/admin/orders/${o.id}/notes`).send({ body: secret }).expect(201)).body;
      expect(first).toMatchObject({ body: secret, createdBy: { id: adminIds[0], fullName: adminName } });
      await new Promise((r) => setTimeout(r, 15));
      const second = (await admin2.post(`/api/admin/orders/${o.id}/notes`).send({ body: ` ikinci ${run} ` }).expect(201)).body;
      expect(second.body).toBe(`ikinci ${run}`);
      expect(second.createdBy.fullName).toBe('İkinci Admin');

      const list = (await admin.get(`/api/admin/orders/${o.id}/notes`).expect(200)).body;
      expect(list.map((n: { id: string }) => n.id)).toEqual([second.id, first.id]); // en yeni önce
      expect((await admin.get(`/api/admin/orders/${o.id}`).expect(200)).body.internalNoteCount).toBe(2);
      expect((await admin.get(`/api/admin/orders/${other.id}`).expect(200)).body.internalNoteCount).toBe(0);

      // Bayiye hiçbir uçta dönmez: liste, detay, Excel ve tüm gövde metinleri.
      const dealerBodies = [
        (await dAgent.get('/api/orders').expect(200)).body,
        (await dAgent.get(`/api/orders/${o.id}`).expect(200)).body,
      ];
      for (const b of dealerBodies) {
        const text = JSON.stringify(b);
        expect(text).not.toContain(secret);
        expect(text).not.toContain(`ikinci ${run}`);
        expect(text.toLowerCase()).not.toContain('internalnote');
        expect(text.toLowerCase()).not.toContain('notes');
      }
      const xl = await dAgent.get(`/api/orders/${o.id}/export.xlsx`).buffer(true).parse(binary).expect(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(xl.body as ExcelJS.Buffer);
      const cells: string[] = [];
      wb.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => cells.push(JSON.stringify(c.value)))));
      expect(cells.join('|')).not.toContain(secret);
      await dAgent.get(`/api/orders/${o.id}/notes`).expect(404);
      await dAgent.get(`/api/admin/orders/${o.id}/notes`).expect(403);

      // Silme: başka siparişin yolu 404; gerçek silme 204; sayı düşer; audit.
      await admin.delete(`/api/admin/orders/${other.id}/notes/${first.id}`).expect(404);
      await admin.delete(`/api/admin/orders/${o.id}/notes/${first.id}`).expect(204);
      await admin.delete(`/api/admin/orders/${o.id}/notes/${first.id}`).expect(404);
      expect((await admin.get(`/api/admin/orders/${o.id}`).expect(200)).body.internalNoteCount).toBe(1);
      const actions = (await db.select().from(auditLog).where(eq(auditLog.entityId, o.id))).map((a) => a.action).sort();
      expect(actions).toEqual(['order.note_added', 'order.note_added', 'order.note_deleted']);
      expect(await db.select().from(orderNotes).where(eq(orderNotes.orderId, o.id))).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('Dashboard', () => {
    it('sayılar iptal hariç; Istanbul günü sınırları; önce/sonra farkları', async () => {
      const before = await dashboard();
      expect(before.sales30d).toHaveLength(30);

      const d1 = await newDealer('dash1');
      const d2 = await newDealer('dash2');
      const d3 = await newDealer('dash3');
      const dIdle = await newDealer('dashidle'); // hiç siparişi yok
      const dOld = await newDealer('dashold'); // son sipariş 60 günden eski
      await newDealer('dashpend', { status: 'pending_approval', emailVerifiedAt: new Date('2030-06-10T09:00:00Z') });

      // Bu ay (1–15 Haziran, İstanbul günü)
      const o1 = await makeOrder(d1.id, '2030-06-14T10:00:00Z', '100.00', 'submitted'); // 14 Haz
      await makeOrder(d1.id, '2030-06-02T10:00:00Z', '50.00', 'approved', 'transferred');
      const o3 = await makeOrder(d2.id, '2030-06-15T05:00:00Z', '1000.00', 'cancelled'); // iptal: hiçbir sayıya girmez
      await makeOrder(d3.id, '2030-05-31T21:30:00Z', '30.00', 'negotiating'); // 1 Haziran 00:30 İstanbul
      await makeOrder(d3.id, '2030-06-15T20:59:00Z', '5.00', 'shipped'); // 15 Haz 23:59 İstanbul (gelecek ama bu gün)
      // Geçen ay: 1–15 Mayıs sayılır, 20 Mayıs sayılmaz
      await makeOrder(d2.id, '2030-05-10T10:00:00Z', '60.00', 'delivered', 'transferred');
      await makeOrder(d2.id, '2030-05-20T10:00:00Z', '777.00', 'delivered', 'transferred');
      await makeOrder(dOld.id, '2030-03-01T10:00:00Z', '10.00', 'delivered', 'transferred');
      // Geçen ayın aynı gününe kadar: 15 Mayıs 23:59 İstanbul DAHİL; 16 Mayıs 00:30 İstanbul dışında.
      // İkisi de 30 günlük serinin (17 Mayıs'tan başlar) dışındadır.
      await makeOrder(d2.id, '2030-05-15T20:59:00Z', '999.00', 'delivered', 'transferred');
      await makeOrder(d2.id, '2030-05-15T21:30:00Z', '111.00', 'delivered', 'transferred');

      const featured = await newProduct('ozel', { isFeatured: true, isActive: true, stockStatus: 'out_of_stock' });
      await newProduct('ozelvar', { isFeatured: true, isActive: true, stockStatus: 'in_stock' });
      await newProduct('ozelpasif', { isFeatured: true, isActive: false, stockStatus: 'out_of_stock' });
      expect(featured.id).toBeTruthy();
      const [failed] = await db.insert(notificationOutbox).values({ kind: 'order_confirmation', recipient: `x-${run}@test.example`, payload: {}, status: 'failed', createdAt: new Date('2030-06-10T10:00:00Z') }).returning();
      outboxIds.push(failed.id);

      await admin.post(`/api/admin/orders/${o1.id}/notes`).send({ body: 'dash' }).expect(201);
      const after = await dashboard();

      // Satış serisi: 17 Mayıs … 15 Haziran
      expect(after.sales30d[0].date).toBe('2030-05-17');
      expect(after.sales30d[29].date).toBe('2030-06-15');
      const day = (d: string) => after.sales30d.find((x: { date: string }) => x.date === d);
      expect(day('2030-06-14')).toEqual({ date: '2030-06-14', orderCount: 1, netTotal: '100.00' });
      expect(day('2030-06-02')).toEqual({ date: '2030-06-02', orderCount: 1, netTotal: '50.00' });
      expect(day('2030-06-01')).toEqual({ date: '2030-06-01', orderCount: 1, netTotal: '30.00' }); // İstanbul günü
      expect(day('2030-06-15')).toEqual({ date: '2030-06-15', orderCount: 1, netTotal: '5.00' }); // iptal 1000 yok
      expect(day('2030-05-20')).toEqual({ date: '2030-05-20', orderCount: 1, netTotal: '777.00' });
      expect(day('2030-06-10')).toEqual({ date: '2030-06-10', orderCount: 0, netTotal: '0.00' });
      expect(after.sales30d.filter((x: { orderCount: number }) => x.orderCount > 0)).toHaveLength(5);
      // Mayıs 15–16 serinin dışında
      expect(after.sales30d.find((x: { date: string }) => x.date === '2030-05-15')).toBeUndefined();

      // KPI: bu ay = 100 + 50 + 30 + 5 = 185.00 (4 sipariş); geçen ayın 1–15'i = 60 + 999 = 1059.00 (2 sipariş)
      expect(after.kpis.monthNet).toEqual({ current: '185.00', previous: '1059.00', percent: -82.5 });
      expect(after.kpis.monthOrders).toEqual({ current: 4, previous: 2, percent: 100 });
      expect(after.kpis.averageOrderNet).toEqual({ current: '46.25', previous: '529.50', percent: -91.3 });
      expect(after.kpis.activeDealers.orderingThisMonth).toBe(2); // d1, d3 (d2'nin bu ay tek siparişi iptal)
      expect(after.kpis.activeDealers.current - before.kpis.activeDealers.current).toBe(5); // d1,d2,d3,idle,old (pending hariç)

      // Boru hattı: yalnız 4 açık durum, iptal/teslim yok; farklar.
      expect(after.pipeline.map((x: { status: string }) => x.status)).toEqual(['submitted', 'negotiating', 'approved', 'shipped']);
      const delta = (k: string) => after.pipeline.find((x: { status: string }) => x.status === k).count - before.pipeline.find((x: { status: string }) => x.status === k).count;
      expect([delta('submitted'), delta('negotiating'), delta('approved'), delta('shipped')]).toEqual([1, 1, 1, 1]);

      // Dikkat kartları (farklar). notTransferred: iptal ve aktarılmışlar hariç = o1, negotiating, shipped.
      const a = (k: string) => after.attention[k] - before.attention[k];
      expect(a('newOrders')).toBe(1);
      expect(a('notTransferred')).toBe(3);
      expect(a('pendingApplications')).toBe(1);
      expect(a('failedNotifications')).toBe(1);
      expect(a('featuredOutOfStock')).toBe(1);
      expect(a('inactiveDealers60d')).toBe(2); // idle + old
      expect(typeof after.attention.overdueApplications).toBe('number');

      // Son siparişler: en yenisi (iptal dahil) önce, en fazla 8.
      expect(after.recentOrders.length).toBeLessThanOrEqual(8);
      expect(after.recentOrders[0]).toMatchObject({ dealer: { id: d3.id, companyTitle: d3.companyTitle }, status: 'shipped', grandTotal: '6.00' });
      expect(after.recentOrders.map((r: { id: string }) => r.id)).toContain(o3.id);
      expect(Object.keys(after.recentOrders[0]).sort()).toEqual(['dealer', 'grandTotal', 'id', 'orderNo', 'status', 'submittedAt']);

      // En çok sipariş veren bayiler (bu ay, iptal hariç): d1 150 (2), d3 35 (2); d2 yok (yalnız iptal).
      expect(after.topDealersMonth).toEqual([
        { dealerId: d1.id, companyTitle: d1.companyTitle, orderCount: 2, netTotal: '150.00' },
        { dealerId: d3.id, companyTitle: d3.companyTitle, orderCount: 2, netTotal: '35.00' },
      ]);
      void dIdle;

      // Son işlemler: en yeni önce, girişler (auth.login) hariç, etiketli.
      expect(after.recentActivity.length).toBeGreaterThan(0);
      expect(after.recentActivity.length).toBeLessThanOrEqual(8);
      expect(after.recentActivity[0]).toMatchObject({ actorName: adminName, actionLabel: 'Sipariş notu eklendi', entityType: 'orders', entityId: o1.id, entityLabel: `#${o1.orderNo}` });
      expect(Object.keys(after.recentActivity[0]).sort()).toEqual(['actionLabel', 'actorName', 'createdAt', 'entityId', 'entityLabel', 'entityType', 'id']);
      expect(after.recentActivity.some((x: { actionLabel: string }) => x.actionLabel === 'Admin girişi yapıldı')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('Bildirim akışı', () => {
    // Dashboard testinin siparişleri ve başarısız e-postası akış penceresine girmesin.
    beforeAll(async () => {
      await db.delete(orders).where(inArray(orders.dealerId, dealerIds));
      if (outboxIds.length) await db.delete(notificationOutbox).where(inArray(notificationOutbox.id, outboxIds));
    });

    it('olay türleri, okunmamış sayısı (Admin başına), okundu işareti, 30 üst sınır', async () => {
      const d = await newDealer('feed', { source: 'application', emailVerifiedAt: new Date('2030-06-12T08:00:00Z'), status: 'pending_approval' });
      const stale = await makeOrder(d.id, '2030-05-01T10:00:00Z', '1.00'); // 30 günden eski: akışta yok
      const oA = await makeOrder(d.id, '2030-06-13T10:00:00Z', '200.00');
      const oB = await makeOrder(d.id, '2030-06-14T10:00:00Z', '300.00');
      const [fail] = await db.insert(notificationOutbox).values({ kind: 'new_order_team', recipient: `feed-${run}@test.example`, payload: {}, status: 'failed', createdAt: new Date('2030-06-10T10:00:00Z') }).returning();
      outboxIds.push(fail.id);
      // Durum geçmişi: ilk giriş (from null) olay değil; sistem değişikliği herkese; admin A değişikliği yalnız B'ye.
      await db.insert(orderStatusHistory).values([
        { orderId: oA.id, fromStatus: null, toStatus: 'submitted', source: 'system', createdAt: new Date('2030-06-13T10:00:00Z') },
        { orderId: oA.id, fromStatus: 'submitted', toStatus: 'negotiating', source: 'system', createdAt: new Date('2030-06-13T12:00:00Z') },
        { orderId: oA.id, fromStatus: 'negotiating', toStatus: 'approved', source: 'admin', changedBy: adminIds[0], createdAt: new Date('2030-06-13T13:00:00Z') },
        { orderId: stale.id, fromStatus: 'submitted', toStatus: 'approved', source: 'system', createdAt: new Date('2030-05-02T10:00:00Z') },
      ]);

      const feedA = (await admin.get('/api/admin/notifications/feed').expect(200)).body;
      const feedB = (await admin2.get('/api/admin/notifications/feed').expect(200)).body;
      const types = (feed: { items: { type: string }[] }) => feed.items.map((i) => i.type);

      // A: sipariş A, sipariş B, başvuru, başarısız e-posta, sistem durum değişikliği (kendi değişikliği yok) = 5 olay.
      expect(feedA.items).toHaveLength(5);
      expect(feedA.unread).toBe(5);
      expect(types(feedA).sort()).toEqual(['application_verified', 'notification_failed', 'order_status_changed', 'order_submitted', 'order_submitted']);
      expect(feedB.items).toHaveLength(6); // B, A'nın yaptığı durum değişikliğini de görür
      expect(feedB.unread).toBe(6);
      // En yeni önce
      const times = feedA.items.map((i: { createdAt: string }) => i.createdAt);
      expect([...times].sort((x: string, y: string) => y.localeCompare(x))).toEqual(times);
      expect(feedA.items[0]).toEqual({
        id: `order_submitted:${oB.id}`,
        type: 'order_submitted',
        title: `Yeni sipariş #${oB.orderNo}`,
        body: `${d.companyTitle} · 360.00 TL`,
        link: `/yonetim/siparisler/${oB.id}`,
        createdAt: '2030-06-14T10:00:00.000Z',
      });
      const find = (type: string) => feedA.items.find((i: { type: string }) => i.type === type);
      expect(find('application_verified')).toMatchObject({ link: `/yonetim/bayiler/${d.id}`, title: 'Yeni bayi başvurusu', createdAt: '2030-06-12T08:00:00.000Z' });
      expect(find('notification_failed')).toMatchObject({ link: '/yonetim/bildirimler', createdAt: '2030-06-10T10:00:00.000Z' });
      expect(find('order_status_changed')).toMatchObject({
        link: `/yonetim/siparisler/${oA.id}`,
        title: `Sipariş #${oA.orderNo} durumu değişti`,
        body: `${d.companyTitle}: Gönderildi → Görüşülüyor`,
      });
      for (const i of feedA.items) expect(Object.keys(i).sort()).toEqual(['body', 'createdAt', 'id', 'link', 'title', 'type']);

      // Okundu: `until` dahil; sonrası okunmamış kalır. B etkilenmez.
      await admin.post('/api/admin/notifications/feed/read').send({ until: feedA.items[1].createdAt }).expect(204);
      expect((await admin.get('/api/admin/notifications/feed').expect(200)).body.unread).toBe(1);
      expect((await admin2.get('/api/admin/notifications/feed').expect(200)).body.unread).toBe(6);
      // İşaret geriye gitmez.
      await admin.post('/api/admin/notifications/feed/read').send({ until: '2030-06-01T00:00:00Z' }).expect(204);
      expect((await admin.get('/api/admin/notifications/feed').expect(200)).body.unread).toBe(1);
      const [row] = await db.select({ at: adminUsers.notificationsReadAt }).from(adminUsers).where(eq(adminUsers.id, adminIds[0]));
      expect(row.at?.toISOString()).toBe(feedA.items[1].createdAt);
      // Gelecek tarih şimdiye kıstırılır; sonradan gelen olay okunmamış olur.
      await admin.post('/api/admin/notifications/feed/read').send({ until: '2031-01-01T00:00:00Z' }).expect(204);
      const [clamped] = await db.select({ at: adminUsers.notificationsReadAt }).from(adminUsers).where(eq(adminUsers.id, adminIds[0]));
      expect(clamped.at?.toISOString()).toBe(NOW.toISOString());
      expect((await admin.get('/api/admin/notifications/feed').expect(200)).body.unread).toBe(0);
      await makeOrder(d.id, '2030-06-16T10:00:00Z', '10.00');
      expect((await admin.get('/api/admin/notifications/feed').expect(200)).body.unread).toBe(1);

      // Doğrulama
      await admin.post('/api/admin/notifications/feed/read').send({}).expect(400);
      await admin.post('/api/admin/notifications/feed/read').send({ until: 'dün' }).expect(400);

      // En fazla 30 öğe; okunmamış sayısı sınırdan bağımsız.
      for (let i = 0; i < 32; i++) await makeOrder(d.id, `2030-06-17T10:${String(i).padStart(2, '0')}:00Z`, '1.00');
      const big = (await admin2.get('/api/admin/notifications/feed').expect(200)).body;
      expect(big.items).toHaveLength(30);
      expect(big.unread).toBe(6 + 1 + 32);
    });
  });

  // -------------------------------------------------------------------------
  describe('Ürün kopyalama', () => {
    it('alanlar kopyalanır; pasif/öne çıkmaz/stoksuz; görseller aynı medya; çakışmalar 409', async () => {
      const [m1] = await db.insert(media).values({ storageKey: `panel-${run}-1`, originalName: 'a.png', mime: 'image/png', size: 1, width: 1, height: 1, uploadedBy: adminIds[0] }).returning();
      const [m2] = await db.insert(media).values({ storageKey: `panel-${run}-2`, originalName: 'b.png', mime: 'image/png', size: 1, width: 1, height: 1, uploadedBy: adminIds[0] }).returning();
      mediaIds.push(m1.id, m2.id);
      const src = await newProduct('kaynak', { description: 'Açıklama', caseQuantity: 12, listPrice: '48.90', vatRate: '10.00', isFeatured: true, stockStatus: 'in_stock' });
      await db.insert(productImages).values([
        { productId: src.id, mediaId: m2.id, sortOrder: 0 },
        { productId: src.id, mediaId: m1.id, sortOrder: 1 },
      ]);

      await admin.post(`/api/admin/products/${src.id}/duplicate`).send({}).expect(400);
      await admin.post(`/api/admin/products/${src.id}/duplicate`).send({ barcode: '  ' }).expect(400);
      await admin.post(`/api/admin/products/${randomUUID()}/duplicate`).send({ barcode: bc('yok404') }).expect(404);

      const res = await admin.post(`/api/admin/products/${src.id}/duplicate`).send({ barcode: bc('kopya'), code: `K-kopya-${run}` }).expect(201);
      const copy = res.body;
      expect(copy).toMatchObject({
        groupId,
        barcode: bc('kopya'),
        code: `K-kopya-${run}`,
        name: `${src.name} (kopya)`,
        description: 'Açıklama',
        caseQuantity: 12,
        listPrice: '48.90',
        vatRate: '10.00',
        stockStatus: 'out_of_stock',
        isActive: false,
        isFeatured: false,
      });
      expect(copy.id).not.toBe(src.id);
      expect(copy.images.map((i: { mediaId: string }) => i.mediaId)).toEqual([m2.id, m1.id]);
      // Kaynak değişmedi
      const original = (await admin.get(`/api/admin/products/${src.id}`).expect(200)).body;
      expect(original).toMatchObject({ isFeatured: true, stockStatus: 'in_stock', isActive: true });
      expect(original.images).toHaveLength(2);

      // Kodsuz kopya; çakışmalar
      const noCode = await admin.post(`/api/admin/products/${src.id}/duplicate`).send({ barcode: bc('kopya2') }).expect(201);
      expect(noCode.body.code).toBeNull();
      const dupBarcode = await admin.post(`/api/admin/products/${src.id}/duplicate`).send({ barcode: bc('kopya') }).expect(409);
      expect(dupBarcode.body.code).toBe('DUPLICATE_BARCODE');
      const dupCode = await admin.post(`/api/admin/products/${src.id}/duplicate`).send({ barcode: bc('kopya3'), code: `K-kopya-${run}` }).expect(409);
      expect(dupCode.body.code).toBe('DUPLICATE_CODE');
      // Başarısız kopya iz bırakmadı
      expect(await db.select({ id: products.id }).from(products).where(eq(products.barcode, bc('kopya3')))).toEqual([]);
      const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, copy.id));
      expect(audit.map((a) => a.action)).toEqual(['product.duplicated']);
      expect(audit[0].data).toMatchObject({ sourceId: src.id });
    });

    it('çok uzun adda kopya adı 300 karakteri aşmaz', async () => {
      const src = await newProduct('uzun', { name: 'U'.repeat(300) });
      const copy = (await admin.post(`/api/admin/products/${src.id}/duplicate`).send({ barcode: bc('uzunkopya') }).expect(201)).body;
      expect(copy.name).toHaveLength(300);
      expect(copy.name.endsWith(' (kopya)')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('Excel dışa aktarma', () => {
    const load = async (agent: Agent, url: string) => {
      const res = await agent.get(url).buffer(true).parse(binary).expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="[a-z]+-2030-06-15\.xlsx"/);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as ExcelJS.Buffer);
      return { sheet: wb.worksheets[0], buffer: res.body as Buffer };
    };
    const rowsOf = (sheet: ExcelJS.Worksheet) => {
      const out: Record<string, ExcelJS.CellValue>[] = [];
      const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1) as string[];
      sheet.eachRow((row, n) => {
        if (n === 1) return;
        out.push(Object.fromEntries(headers.map((h, i) => [h, row.getCell(i + 1).value])));
      });
      return out;
    };

    it('ürünler: sütunlar, metin barkod/kod, filtreler, yeniden içe aktarılabilir', async () => {
      const [g2] = await db.insert(productGroups).values({ name: `Excel Grup ${run}`, nameKey: `excel grup ${run}` }).returning();
      const a = await newProduct('xl1', { barcode: `00${run}1`, code: `00${run}c`, name: `Excel Ürün 1 ${run}`, listPrice: '48.90', vatRate: '10.00', isFeatured: true, groupId: g2.id });
      const b = await newProduct('xl2', { barcode: `00${run}2`, code: null, name: `Excel Ürün 2 ${run}`, listPrice: '19.99', stockStatus: 'in_stock', isActive: false, groupId: g2.id });
      const [m] = await db.insert(media).values({ storageKey: `panel-${run}-x`, originalName: 'x.png', mime: 'image/png', size: 1, width: 1, height: 1, uploadedBy: adminIds[0] }).returning();
      mediaIds.push(m.id);
      await db.insert(productImages).values({ productId: a.id, mediaId: m.id, sortOrder: 0 });

      const { sheet } = await load(admin, `/api/admin/products/export.xlsx?groupId=${g2.id}`);
      expect((sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1)).toEqual([
        'Barkod', 'Kod', 'Ad', 'Grup', 'Koli içi', 'Liste fiyatı', 'KDV %', 'Stok', 'Durum', 'Öne çıkan', 'Görsel sayısı',
      ]);
      const rows = rowsOf(sheet);
      expect(rows).toHaveLength(2);
      // Ad sırasıyla: Ürün 1, Ürün 2. Barkod/kod baştaki sıfırlarla METİN.
      expect(rows[0]).toEqual({ Barkod: a.barcode, Kod: a.code, Ad: a.name, Grup: `Excel Grup ${run}`, 'Koli içi': 6, 'Liste fiyatı': 48.9, 'KDV %': 10, Stok: 'Yok', Durum: 'Aktif', 'Öne çıkan': 'Evet', 'Görsel sayısı': 1 });
      expect(typeof rows[0].Barkod).toBe('string');
      expect((rows[0].Barkod as string).startsWith('00')).toBe(true);
      expect(rows[1]).toMatchObject({ Barkod: b.barcode, Kod: null, 'Liste fiyatı': 19.99, Stok: 'Var', Durum: 'Pasif', 'Öne çıkan': 'Hayır', 'Görsel sayısı': 0 });
      expect(sheet.getCell('A2').numFmt).toBe('@');

      // Aynı liste filtreleri
      const onlyPassive = rowsOf((await load(admin, `/api/admin/products/export.xlsx?groupId=${g2.id}&active=false`)).sheet);
      expect(onlyPassive.map((r) => r.Barkod)).toEqual([b.barcode]);
      expect(rowsOf((await load(admin, `/api/admin/products/export.xlsx?groupId=${g2.id}&featured=true`)).sheet).map((r) => r.Barkod)).toEqual([a.barcode]);
      expect(rowsOf((await load(admin, `/api/admin/products/export.xlsx?q=${encodeURIComponent(`excel ürün 2 ${run}`)}`)).sheet)).toHaveLength(1);
      expect(rowsOf((await load(admin, `/api/admin/products/export.xlsx?groupId=${g2.id}&stock=in_stock`)).sheet).map((r) => r.Barkod)).toEqual([b.barcode]);

      // Çıktı düzenlenmeden yeniden içe aktarılabilir: hata yok, her ürün değişmemiş.
      const { buffer } = await load(admin, `/api/admin/products/export.xlsx?groupId=${g2.id}`);
      const imp = await admin.post('/api/admin/products/import?dryRun=true').attach('file', buffer, 'urunler.xlsx').expect(200);
      expect(imp.body.errors).toEqual([]);
      expect(imp.body).toMatchObject({ total: 2, created: 0, updated: 0, unchanged: 2 });
      await db.delete(productImages).where(eq(productImages.productId, a.id));
      await db.delete(products).where(inArray(products.id, [a.id, b.id]));
      await db.delete(productGroups).where(eq(productGroups.id, g2.id));
    });

    it('bayiler: sütunlar, durum etiketi, sipariş sayısı iptal hariç, filtre', async () => {
      const x = await newDealer('xlbayi', { companyTitle: `Excel Bayi ${run}`, taxOffice: 'Melikgazi', taxNumber: '0012345678', generalDiscountPercent: '12.50', lastLoginAt: new Date('2030-06-10T09:00:00Z') });
      const y = await newDealer('xlpasif', { companyTitle: `Excel Pasif ${run}`, status: 'passive' });
      await makeOrder(x.id, '2030-06-01T10:00:00Z', '10.00');
      await makeOrder(x.id, '2030-06-05T10:00:00Z', '20.00', 'delivered');
      await makeOrder(x.id, '2030-06-09T10:00:00Z', '30.00', 'cancelled');
      const { sheet } = await load(admin, `/api/admin/dealers/export.xlsx?q=Excel`);
      expect((sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1)).toEqual([
        'Unvan', 'Yetkili', 'E-posta', 'Telefon', 'İl', 'İlçe', 'Adres', 'Vergi dairesi', 'Vergi no', 'Durum',
        'Genel iskonto', 'Kayıt tarihi', 'Son giriş', 'Sipariş sayısı', 'Son sipariş',
      ]);
      const rows = rowsOf(sheet).filter((r) => (r.Unvan as string).endsWith(run));
      expect(rows).toHaveLength(2);
      const rx = rows.find((r) => r.Unvan === x.companyTitle)!;
      expect(rx).toMatchObject({
        Yetkili: 'Yetkili xlbayi', 'E-posta': x.email, Telefon: '05321234567', İl: 'Kayseri', İlçe: 'Melikgazi', Adres: 'Adres 1',
        'Vergi dairesi': 'Melikgazi', 'Vergi no': '0012345678', Durum: 'Aktif', 'Genel iskonto': 12.5, 'Sipariş sayısı': 2,
      });
      // Tarihler İstanbul duvar saati: 10 Haziran 12:00; son sipariş 5 Haziran 13:00.
      expect((rx['Son giriş'] as Date).toISOString()).toBe('2030-06-10T12:00:00.000Z');
      expect((rx['Son sipariş'] as Date).toISOString()).toBe('2030-06-05T13:00:00.000Z');
      expect(rx['Kayıt tarihi']).toBeInstanceOf(Date);
      const ry = rows.find((r) => r.Unvan === y.companyTitle)!;
      expect(ry).toMatchObject({ Durum: 'Pasif', 'Sipariş sayısı': 0, 'Son sipariş': null, 'Genel iskonto': null, 'Son giriş': null });
      // Durum filtresi
      const passive = rowsOf((await load(admin, '/api/admin/dealers/export.xlsx?status=passive&q=Excel')).sheet).map((r) => r.Unvan);
      expect(passive).toContain(y.companyTitle);
      expect(passive).not.toContain(x.companyTitle);
      await admin.get('/api/admin/dealers/export.xlsx?status=bilinmeyen').expect(400);
    });
  });
});
