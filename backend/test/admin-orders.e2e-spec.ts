// Admin sipariş yönetimi (e2e). API: docs/api/admin-siparis-api.md.
// Gereksinimler: GR-SIP-006, GR-BLD-001, GR-YON-001; K-17, K-24, K-25, K-26.
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq, gte, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module.js';
import { DB, type Database } from '../src/database/database.module.js';
import {
  adminUsers,
  auditLog,
  cartItems,
  dealers,
  notificationOutbox,
  orders,
  productGroups,
  products,
  sessions,
} from '../src/database/schema.js';
import { companyTitleKey } from '../src/dealers/company-title.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);

type Agent = ReturnType<typeof request.agent>;

describe('Admin sipariş yönetimi (e2e)', () => {
  const startedAt = new Date(Date.now() - 1000);
  let app: INestApplication<App>;
  let db: Database;
  const adminIds: string[] = [];
  const dealerIds: string[] = [];
  const mail = {
    sendOrderConfirmation: vi.fn().mockResolvedValue(undefined),
    sendNewOrderToTeam: vi.fn().mockResolvedValue(undefined),
    sendOrderStatusChanged: vi.fn().mockResolvedValue(undefined),
  };
  let admin: { agent: Agent; id: string; fullName: string };
  let groupId: string;
  let seq = 0;
  const server = () => app.getHttpServer();

  async function newAdmin(fullName: string) {
    const [a] = await db
      .insert(adminUsers)
      .values({ email: `adm${adminIds.length}-${run}@test.example`, fullName, passwordHash: await hash(PASSWORD) })
      .returning();
    adminIds.push(a.id);
    const agent = request.agent(server());
    await agent.post('/api/auth/admin/login').send({ email: a.email, password: PASSWORD }).expect(200);
    return { agent, id: a.id, fullName };
  }

  async function newDealer(name: string, title = `Bayi ${name} ${run}`) {
    const [d] = await db
      .insert(dealers)
      .values({
        companyTitle: title, companyTitleKey: companyTitleKey(title), contactName: 'Ayşe Yılmaz',
        email: `${name}-${run}@test.example`, phone: '05320000000', city: 'Kayseri', district: 'Melikgazi',
        address: 'Örnek Mah. 1. Sk. No:3', source: 'invitation', status: 'active',
        passwordHash: await hash(PASSWORD), emailVerifiedAt: new Date(),
      })
      .returning();
    dealerIds.push(d.id);
    const agent = request.agent(server());
    await agent.post('/api/auth/dealer/login').send({ email: d.email, password: PASSWORD }).expect(200);
    return { agent, dealer: d };
  }

  async function newProduct(over: Record<string, unknown> = {}) {
    seq += 1;
    const res = await admin.agent
      .post('/api/admin/products')
      .send({ groupId, barcode: `AO${run}-${seq}`, name: `Ürün ${seq} ${run}`, caseQuantity: 6, listPrice: '10.00', vatRate: '20', ...over })
      .expect(201);
    return res.body as { id: string; barcode: string; name: string };
  }

  /** Bayi adına sepet doldurup ön sipariş verir. */
  async function placeOrder(d: { agent: Agent }, items: [{ id: string }, number][], delivery: Record<string, unknown> = { deliveryMethod: 'pickup' }) {
    for (const [p, q] of items) await d.agent.put(`/api/cart/items/${p.id}`).send({ quantity: q }).expect(200);
    const cart = (await d.agent.get('/api/cart')).body;
    const res = await d.agent
      .post('/api/orders')
      .send({ ...delivery, expectedTotal: cart.summary.grandTotal, expectedVersion: cart.version })
      .expect(201);
    return res.body as { id: string; orderNo: number };
  }

  const setStatus = (id: string, status: string, note?: string, who: Agent = admin.agent) =>
    who.post(`/api/admin/orders/${id}/status`).send({ status, note });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_SERVICE)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get<Database>(DB);
    admin = await newAdmin('Ayşe Admin');
    const res = await admin.agent.post('/api/admin/product-groups').send({ name: `Admin Sipariş ${run}` }).expect(201);
    groupId = res.body.id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(notificationOutbox).where(gte(notificationOutbox.createdAt, startedAt));
      const orderIds = dealerIds.length
        ? (await db.select({ id: orders.id }).from(orders).where(inArray(orders.dealerId, dealerIds))).map((o) => o.id)
        : [];
      const prodIds = (await db.select({ id: products.id }).from(products).where(eq(products.groupId, groupId))).map((p) => p.id);
      await db.delete(auditLog).where(inArray(auditLog.entityId, [...orderIds, ...adminIds, ...dealerIds]));
      await db.delete(sessions).where(inArray(sessions.subjectId, [...adminIds, ...dealerIds]));
      if (dealerIds.length) {
        await db.delete(cartItems).where(inArray(cartItems.dealerId, dealerIds));
        await db.delete(orders).where(inArray(orders.dealerId, dealerIds));
      }
      if (prodIds.length) await db.delete(products).where(inArray(products.id, prodIds));
      await db.delete(productGroups).where(eq(productGroups.id, groupId));
      if (dealerIds.length) await db.delete(dealers).where(inArray(dealers.id, dealerIds));
      await db.delete(adminUsers).where(inArray(adminUsers.id, adminIds));
    }
    await app?.close();
  });

  it('GR-YON-001: anonim 401, bayi 403 (durum, transfer, özet, Excel uçları)', async () => {
    const d = await newDealer('yetki');
    const p = await newProduct();
    const o = await placeOrder(d, [[p, 6]]);
    const calls: [string, string][] = [
      ['get', '/api/admin/orders/summary'],
      ['get', '/api/admin/orders/export.xlsx'],
      ['get', `/api/admin/orders/${o.id}/export.xlsx`],
      ['post', `/api/admin/orders/${o.id}/status`],
      ['post', `/api/admin/orders/${o.id}/transfer`],
      ['delete', `/api/admin/orders/${o.id}/transfer`],
    ];
    for (const [method, path] of calls) {
      const send = (t: request.Test) => (method === 'post' ? t.send({ status: 'negotiating' }) : t);
      const anon = await send((request(server()) as unknown as Record<string, (p: string) => request.Test>)[method](path));
      const dealer = await send((d.agent as unknown as Record<string, (p: string) => request.Test>)[method](path));
      expect([method, path, anon.status, dealer.status]).toEqual([method, path, 401, 403]);
    }
    expect((await db.select().from(orders).where(eq(orders.id, o.id)))[0].status).toBe('submitted');
  });

  describe('Durum (K-25)', () => {
    it('GR-SIP-006, K-25: sırayla ilerler; allowedNextStatuses ve history (changedBy adı, not) doğru', async () => {
      const d = await newDealer('durum');
      const p = await newProduct();
      const o = await placeOrder(d, [[p, 6]]);
      const first = (await admin.agent.get(`/api/admin/orders/${o.id}`).expect(200)).body;
      expect(first.allowedNextStatuses).toEqual(['negotiating', 'cancelled']);

      const chain: [string, string[]][] = [
        ['negotiating', ['approved', 'cancelled']],
        ['approved', ['shipped', 'cancelled']],
        ['shipped', ['delivered', 'cancelled']],
        ['delivered', []],
      ];
      for (const [status, next] of chain) {
        const res = await setStatus(o.id, status, `not ${status}`).expect(200);
        expect(res.body).toMatchObject({ id: o.id, status, allowedNextStatuses: next });
      }
      const detail = (await admin.agent.get(`/api/admin/orders/${o.id}`).expect(200)).body;
      expect(detail.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['submitted', 'negotiating', 'approved', 'shipped', 'delivered']);
      expect(detail.history[0]).toMatchObject({ fromStatus: null, source: 'system', changedBy: null, note: null });
      expect(detail.history[2]).toMatchObject({
        fromStatus: 'negotiating', toStatus: 'approved', source: 'admin', note: 'not approved',
        changedBy: { id: admin.id, fullName: 'Ayşe Admin' },
      });
      expect(detail.dealer).toMatchObject({ city: 'Kayseri', district: 'Melikgazi', address: 'Örnek Mah. 1. Sk. No:3' });
    });

    it('GR-SIP-006, K-25: adım atlama, geri gitme, aynı duruma geçiş, delivered->cancelled 409 INVALID_TRANSITION; durum değişmez', async () => {
      const d = await newDealer('gecersiz');
      const p = await newProduct();
      const o = await placeOrder(d, [[p, 6]]);
      for (const bad of ['approved', 'shipped', 'delivered', 'submitted']) {
        const res = await setStatus(o.id, bad).expect(409);
        expect([bad, res.body.code]).toEqual([bad, 'INVALID_TRANSITION']);
      }
      await setStatus(o.id, 'negotiating').expect(200);
      await setStatus(o.id, 'submitted').expect(409);
      await setStatus(o.id, 'negotiating').expect(409);
      for (const s of ['approved', 'shipped', 'delivered']) await setStatus(o.id, s).expect(200);
      expect((await setStatus(o.id, 'cancelled', 'geç kaldı').expect(409)).body.code).toBe('INVALID_TRANSITION');
      expect((await db.select().from(orders).where(eq(orders.id, o.id)))[0].status).toBe('delivered');

      await setStatus(randomUUID(), 'negotiating').expect(404);
      await setStatus(o.id, 'bilinmeyen').expect(400);
    });

    it('K-25: iptal için not zorunlu (400); notla iptal edilir ve sonrası kilitlidir; Teslim edilmemiş her adımdan iptal', async () => {
      const d = await newDealer('iptal');
      const p = await newProduct();
      const o = await placeOrder(d, [[p, 6]]);
      for (const note of [undefined, '', '   ']) {
        const res = await setStatus(o.id, 'cancelled', note).expect(400);
        expect(res.body.code).toBe('VALIDATION');
        expect(Object.keys(res.body.fields)).toEqual(['note']);
      }
      await setStatus(o.id, 'negotiating').expect(200);
      await setStatus(o.id, 'approved').expect(200);
      const res = await setStatus(o.id, 'cancelled', 'Bayi vazgeçti').expect(200);
      expect(res.body).toMatchObject({ status: 'cancelled', allowedNextStatuses: [] });
      expect(res.body.history.at(-1)).toMatchObject({ toStatus: 'cancelled', note: 'Bayi vazgeçti' });
      await setStatus(o.id, 'negotiating').expect(409);
      await setStatus(o.id, 'cancelled', 'tekrar').expect(409);
      // Not 1000 karakteri aşamaz.
      const o2 = await placeOrder(d, [[p, 6]]);
      await setStatus(o2.id, 'negotiating', 'x'.repeat(1001)).expect(400);
    });

    it('GR-SIP-006: paralel iki durum değişikliğinden biri 409 (satır kilidi); tek history satırı', async () => {
      const d = await newDealer('paralel');
      const p = await newProduct();
      const o = await placeOrder(d, [[p, 6]]);
      const results = await Promise.all([setStatus(o.id, 'negotiating'), setStatus(o.id, 'negotiating')]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
      const detail = (await admin.agent.get(`/api/admin/orders/${o.id}`)).body;
      expect(detail.history.filter((h: { toStatus: string }) => h.toStatus === 'negotiating')).toHaveLength(1);
    });

    it('GR-YON-001: durum değişikliği audit_log a aktör, önceki/yeni durum ve gerekçeyle yazılır', async () => {
      const d = await newDealer('audit');
      const p = await newProduct();
      const o = await placeOrder(d, [[p, 6]]);
      await setStatus(o.id, 'cancelled', 'Stok yok').expect(200);
      const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, o.id));
      const row = rows.find((r) => r.action === 'order.status_changed')!;
      expect(row).toMatchObject({ actorType: 'admin', actorId: admin.id, entityType: 'orders', reason: 'Stok yok' });
      expect(row.data).toMatchObject({ from: 'submitted', to: 'cancelled', orderNo: o.orderNo });
    });
  });

  describe('Bayi bildirimi ve görünürlüğü (K-26)', () => {
    it('K-26, GR-BLD-001: durum değişince bayiye outbox e-postası (sipariş no, durum, not, bağlantı) yazılır ve gönderilir', async () => {
      const d = await newDealer('eposta');
      const p = await newProduct();
      const o = await placeOrder(d, [[p, 6]]);
      mail.sendOrderStatusChanged.mockClear();
      await setStatus(o.id, 'negotiating', 'Fiyat\nkonusunda arayacağız').expect(200);
      await app.get(NotificationsService).whenIdle();

      const rows = await db.select().from(notificationOutbox).where(eq(notificationOutbox.recipient, d.dealer.email));
      const row = rows.find((r) => r.kind === 'order_status_changed')!;
      expect(row).toMatchObject({ status: 'sent', attempts: 1 });
      expect(row.payload).toMatchObject({
        orderNo: o.orderNo, status: 'negotiating', statusLabel: 'Görüşülüyor', note: 'Fiyat\nkonusunda arayacağız',
        link: expect.stringMatching(new RegExp(`/#/siparislerim/${o.id}$`)),
      });
      expect(mail.sendOrderStatusChanged).toHaveBeenCalledTimes(1);
      expect(mail.sendOrderStatusChanged).toHaveBeenCalledWith(d.dealer.email, {
        orderNo: o.orderNo, statusLabel: 'Görüşülüyor', note: 'Fiyat\nkonusunda arayacağız',
        link: expect.stringContaining(`/#/siparislerim/${o.id}`),
      });
    });

    it('K-26: geçersiz geçişte e-posta yazılmaz; notsuz değişimde note null', async () => {
      const d = await newDealer('eposta2');
      const p = await newProduct();
      const o = await placeOrder(d, [[p, 6]]);
      const count = async () =>
        (await db.select().from(notificationOutbox).where(eq(notificationOutbox.recipient, d.dealer.email))).filter(
          (r) => r.kind === 'order_status_changed',
        );
      await setStatus(o.id, 'shipped').expect(409);
      expect(await count()).toHaveLength(0);
      await setStatus(o.id, 'negotiating').expect(200);
      const rows = await count();
      expect(rows).toHaveLength(1);
      expect((rows[0].payload as { note: string | null }).note).toBeNull();
    });

    it('GR-SIP-006: bayi sipariş detayındaki history de Admin notunu görür; changedBy dönmez', async () => {
      const d = await newDealer('gorunur');
      const p = await newProduct();
      const o = await placeOrder(d, [[p, 6]]);
      await setStatus(o.id, 'negotiating', 'Bayiye görünür not').expect(200);
      const detail = (await d.agent.get(`/api/orders/${o.id}`).expect(200)).body;
      expect(detail.history).toHaveLength(2);
      expect(detail.history[1]).toEqual({
        fromStatus: 'submitted', toStatus: 'negotiating', source: 'admin', note: 'Bayiye görünür not',
        createdAt: expect.any(String),
      });
      expect(JSON.stringify(detail)).not.toContain('changedBy');
      expect(JSON.stringify(detail)).not.toContain(admin.id);
      expect(detail.status).toBe('negotiating');
    });
  });

  describe('BizimHesap elle giriş (K-17)', () => {
    it('K-17, GR-YON-001: işaretle (referans, kim, ne zaman), geri al; özet notTransferred ve transfer filtresi tutarlı; audit', async () => {
      const d = await newDealer('transfer');
      const p = await newProduct();
      const o = await placeOrder(d, [[p, 6]]);
      const before = (await admin.agent.get('/api/admin/orders/summary').expect(200)).body;

      const marked = await admin.agent.post(`/api/admin/orders/${o.id}/transfer`).send({ reference: 'BH-2026-77' }).expect(200);
      expect(marked.body.transfer).toEqual({
        status: 'transferred', reference: 'BH-2026-77', transferredAt: expect.any(String),
        transferredBy: { id: admin.id, fullName: 'Ayşe Admin' },
      });
      const after = (await admin.agent.get('/api/admin/orders/summary')).body;
      expect(after.notTransferred).toBe(before.notTransferred - 1);

      const filter = async (transfer: string) =>
        ((await admin.agent.get('/api/admin/orders').query({ dealerId: d.dealer.id, transfer }).expect(200)).body.items as { id: string; transferStatus: string }[]);
      expect((await filter('transferred')).map((i) => i.id)).toEqual([o.id]);
      expect(await filter('pending')).toEqual([]);

      const unmarked = await admin.agent.delete(`/api/admin/orders/${o.id}/transfer`).expect(200);
      expect(unmarked.body.transfer).toEqual({ status: 'pending', reference: null, transferredAt: null, transferredBy: null });
      expect((await admin.agent.get('/api/admin/orders/summary')).body.notTransferred).toBe(before.notTransferred);
      expect((await filter('pending')).map((i) => i.id)).toEqual([o.id]);

      // Referanssız işaretleme ve uzunluk sınırı.
      const noRef = await admin.agent.post(`/api/admin/orders/${o.id}/transfer`).send({}).expect(200);
      expect(noRef.body.transfer).toMatchObject({ status: 'transferred', reference: null });
      await admin.agent.post(`/api/admin/orders/${o.id}/transfer`).send({ reference: 'x'.repeat(101) }).expect(400);
      await admin.agent.post(`/api/admin/orders/${randomUUID()}/transfer`).send({}).expect(404);

      const audit = (await db.select().from(auditLog).where(eq(auditLog.entityId, o.id))).map((a) => a.action);
      expect(audit).toEqual(expect.arrayContaining(['order.transfer_marked', 'order.transfer_unmarked']));
    });

    it('K-17: iptal edilen sipariş notTransferred a sayılmaz', async () => {
      const d = await newDealer('transfer-iptal');
      const p = await newProduct();
      const before = (await admin.agent.get('/api/admin/orders/summary')).body;
      const o = await placeOrder(d, [[p, 6]]);
      expect((await admin.agent.get('/api/admin/orders/summary')).body.notTransferred).toBe(before.notTransferred + 1);
      await setStatus(o.id, 'cancelled', 'iptal').expect(200);
      expect((await admin.agent.get('/api/admin/orders/summary')).body.notTransferred).toBe(before.notTransferred);
    });
  });

  describe('Liste ve özet', () => {
    it('GR-SIP-006: summary durum sayıları değişikliklerle birlikte güncellenir', async () => {
      const d = await newDealer('ozet');
      const p = await newProduct();
      const before = (await admin.agent.get('/api/admin/orders/summary').expect(200)).body;
      expect(Object.keys(before).sort()).toEqual(['approved', 'negotiating', 'notTransferred', 'shipped', 'submitted']);
      const a = await placeOrder(d, [[p, 6]]);
      const b = await placeOrder(d, [[p, 6]]);
      await setStatus(b.id, 'negotiating').expect(200);
      void a;
      const after = (await admin.agent.get('/api/admin/orders/summary')).body;
      expect(after.submitted).toBe(before.submitted + 1);
      expect(after.negotiating).toBe(before.negotiating + 1);
      expect(after.approved).toBe(before.approved);
      expect(after.notTransferred).toBe(before.notTransferred + 2);
    });

    it('GR-SIP-006: q sipariş no (tam eşleşme) ve firma/yetkili adında Türkçe harf duyarsız arar; öğe alanları', async () => {
      const turkish = await newDealer('q1', `Şükrü Züccaciye ${run}`);
      const other = await newDealer('q2');
      const p = await newProduct();
      const out = await newProduct({ stockStatus: 'out_of_stock' });
      const o1 = await placeOrder(turkish, [[p, 6], [out, 6]], {
        deliveryMethod: 'carrier', deliveryAddress: 'Adres 1', carrierName: 'Ambar', carrierBranch: 'Şube',
      });
      const o2 = await placeOrder(other, [[p, 6]]);
      const find = async (q: string) =>
        ((await admin.agent.get('/api/admin/orders').query({ q }).expect(200)).body.items as { id: string }[]).map((i) => i.id);

      expect(await find(String(o1.orderNo))).toEqual([o1.id]);
      expect(await find(`SUKRU zuccaciye ${run}`)).toEqual([o1.id]);
      expect(await find(`ŞÜKRÜ`)).toContain(o1.id);
      expect(await find(`bayi q2 ${run}`)).toEqual([o2.id]);
      expect(await find('Ayşe Yılmaz')).toEqual(expect.arrayContaining([o1.id, o2.id]));
      expect(await find(`nokta%${run}`)).toEqual([]);
      // Sipariş no yalnızca tam eşleşir: kısmi numara firma adında geçmedikçe bulunmaz.
      expect(await find(String(o1.orderNo).slice(0, -1) + 'x')).toEqual([]);

      const list = (await admin.agent.get('/api/admin/orders').query({ dealerId: turkish.dealer.id }).expect(200)).body;
      expect(list.items[0]).toEqual({
        id: o1.id, orderNo: o1.orderNo, submittedAt: expect.any(String), status: 'submitted',
        dealer: { id: turkish.dealer.id, companyTitle: turkish.dealer.companyTitle },
        deliveryMethod: 'carrier', transferStatus: 'pending', hasOutOfStock: true,
        lineCount: 2, netTotal: '120.00', grandTotal: '144.00',
      });
      const second = (await admin.agent.get('/api/admin/orders').query({ dealerId: other.dealer.id })).body;
      expect(second.items[0]).toMatchObject({ hasOutOfStock: false, lineCount: 1 });
    });
  });

  describe('Excel dışa aktarma', () => {
    const load = async (buffer: Buffer) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      return wb.worksheets[0];
    };
    const download = async (path: string, query: Record<string, string> = {}) => {
      const res = await admin.agent
        .get(path)
        .query(query)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      return res;
    };

    it('GR-SIP-006: tek sipariş Excel i açılır; barkod/kod metin hücresi, para sütunları 2 basamak sayı, toplamlar ekrandakiyle aynı', async () => {
      const d = await newDealer('excel', `Excel Bayi ${run}`);
      const zero = `00${Math.floor(Math.random() * 1e11).toString().padStart(11, '0')}`;
      const p = await newProduct({ barcode: zero, code: `00${run}`, name: 'Çay Bardağı', listPrice: '48.90' });
      const out = await newProduct({ stockStatus: 'out_of_stock', listPrice: '10.05', vatRate: '10' });
      await db.update(dealers).set({ generalDiscountPercent: '15.00' }).where(eq(dealers.id, d.dealer.id));
      const o = await placeOrder(d, [[p, 12], [out, 6]], {
        deliveryMethod: 'carrier', deliveryAddress: 'Teslimat 5', carrierName: 'Yurtiçi', carrierBranch: 'Kayseri',
      });
      const detail = (await admin.agent.get(`/api/admin/orders/${o.id}`)).body;

      const res = await download(`/api/admin/orders/${o.id}/export.xlsx`);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toBe(`attachment; filename="siparis-${o.orderNo}.xlsx"`);
      const sheet = await load(res.body as Buffer);

      const rows: ExcelJS.CellValue[][] = [];
      const rowNumbers: number[] = [];
      sheet.eachRow((row, n) => {
        rows.push((row.values as ExcelJS.CellValue[]).slice(1));
        rowNumbers.push(n);
      });
      const flat = rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : c)));
      expect(flat.find((r) => r[0] === 'Sipariş no')?.[1]).toBe(o.orderNo);
      expect(flat.find((r) => r[0] === 'Bayi')?.[1]).toBe(`Excel Bayi ${run}`);
      expect(flat.find((r) => r[0] === 'Teslimat')?.[1] as string).toContain('Teslimat 5');

      const headerIdx = flat.findIndex((r) => r[0] === 'Barkod');
      expect(flat[headerIdx]).toEqual([
        'Barkod', 'Ürün kodu', 'Ürün adı', 'Adet', 'Koli içi', 'Liste fiyatı', 'İskonto %',
        'Birim fiyat (KDV hariç)', 'Net tutar', 'KDV %', 'KDV', 'Toplam', 'Stokta yoktu',
      ]);
      const headerRowNo = rowNumbers[headerIdx];
      const first = sheet.getRow(headerRowNo + 1);
      // Barkod ve kod metin: baştaki sıfırlar korunur, tür string, biçim '@'.
      expect(first.getCell(1).value).toBe(zero);
      expect(typeof first.getCell(1).value).toBe('string');
      expect(first.getCell(1).numFmt).toBe('@');
      expect(first.getCell(2).value).toBe(`00${run}`);
      expect(first.getCell(2).numFmt).toBe('@');
      expect(first.getCell(3).value).toBe('Çay Bardağı');
      expect(first.getCell(4).value).toBe(12);
      expect(first.getCell(5).value).toBe(6);
      expect(first.getCell(6).value).toBe(48.9);
      expect(first.getCell(7).value).toBe(15);
      expect(first.getCell(8).value).toBe(41.57);
      expect(first.getCell(9).value).toBe(498.84);
      expect(first.getCell(11).value).toBe(99.77);
      expect(first.getCell(12).value).toBe(598.61);
      for (const c of [6, 8, 9, 11, 12]) expect(first.getCell(c).numFmt).toBe('#,##0.00');
      const second = sheet.getRow(headerRowNo + 2);
      expect(second.getCell(13).value).toBe('Evet'); // stokta yoktu

      const total = (label: string) => flat.find((r) => r[7] === label)?.[8];
      expect(total('Brüt toplam')).toBe(Number(detail.summary.grossTotal));
      expect(total('İskonto')).toBe(Number(detail.summary.discountTotal));
      expect(total('KDV hariç toplam')).toBe(Number(detail.summary.netTotal));
      expect(total('KDV')).toBe(Number(detail.summary.vatTotal));
      expect(total('Genel toplam')).toBe(Number(detail.summary.grandTotal));
      await admin.agent.get(`/api/admin/orders/${randomUUID()}/export.xlsx`).expect(404);
    });

    it('GR-SIP-006: liste Excel i filtrelere uyar, sipariş başına bir satır, dosya adı tarihli; toplamlar listeyle aynı', async () => {
      const d = await newDealer('excel-liste');
      const p = await newProduct();
      const o1 = await placeOrder(d, [[p, 6]]);
      const o2 = await placeOrder(d, [[p, 12]]);
      await setStatus(o2.id, 'negotiating').expect(200);

      const res = await download('/api/admin/orders/export.xlsx', { dealerId: d.dealer.id });
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="siparisler-\d{4}-\d{2}-\d{2}\.xlsx"$/);
      const sheet = await load(res.body as Buffer);
      expect(sheet.rowCount).toBe(3);
      expect(sheet.getRow(1).values).toEqual([
        undefined, 'Sipariş no', 'Tarih', 'Bayi', 'Durum', 'Teslimat', 'Kalem', 'KDV hariç toplam', 'KDV',
        'Genel toplam', 'BizimHesap', 'Stokta yok var',
      ]);
      const byNo = new Map<number, ExcelJS.Row>();
      sheet.eachRow((row, i) => i > 1 && byNo.set(row.getCell(1).value as number, row));
      expect(byNo.get(o2.orderNo)!.getCell(4).value).toBe('Görüşülüyor');
      expect(byNo.get(o2.orderNo)!.getCell(7).value).toBe(120);
      expect(byNo.get(o2.orderNo)!.getCell(9).value).toBe(144);
      expect(byNo.get(o2.orderNo)!.getCell(9).numFmt).toBe('#,##0.00');
      expect(byNo.get(o1.orderNo)!.getCell(10).value).toBe('Bekliyor');

      const filtered = await load(
        (await download('/api/admin/orders/export.xlsx', { dealerId: d.dealer.id, status: 'negotiating' })).body as Buffer,
      );
      expect(filtered.rowCount).toBe(2);
      const bad = await admin.agent.get('/api/admin/orders/export.xlsx').query({ status: 'x' }).expect(400);
      expect(bad.body.code).toBe('VALIDATION');
    });
  });
});
