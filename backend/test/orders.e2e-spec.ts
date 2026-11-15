// Sepet, ön sipariş, geçmiş, tekrar sipariş, bildirim ve Admin sipariş okuma (e2e).
// API: docs/api/siparis-api.md. Gereksinimler: GR-SIP-003…008, GR-FIY-001…003, GR-BLD-001;
// K-11, K-13, K-20 – K-22, K-26, K-27, K-33, K-36 – K-39, K-41, K-44.
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq, gte, inArray, like, or } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module.js';
import { DB, type Database } from '../src/database/database.module.js';
import {
  adminUsers,
  auditLog,
  cartItems,
  dealerGroupDiscounts,
  dealers,
  notificationOutbox,
  orderLines,
  orders,
  orderStatusHistory,
  productGroups,
  products,
  sessions,
} from '../src/database/schema.js';
import { companyTitleKey } from '../src/dealers/company-title.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);
const bc = (n: number | string) => `O${run}-${n}`;

describe('Sepet ve ön sipariş (e2e)', () => {
  const startedAt = new Date(Date.now() - 1000);
  let app: INestApplication<App>;
  let db: Database;
  const adminIds: string[] = [];
  const dealerIds: string[] = [];
  const server = () => app.getHttpServer();
  const mail = {
    sendOrderConfirmation: vi.fn().mockResolvedValue(undefined),
    sendNewOrderToTeam: vi.fn().mockResolvedValue(undefined),
  };

  async function adminAgent() {
    const [a] = await db
      .insert(adminUsers)
      .values({
        email: `admin${adminIds.length}-${run}@test.example`,
        fullName: 'Admin Test',
        passwordHash: await hash(PASSWORD),
      })
      .returning();
    adminIds.push(a.id);
    const agent = request.agent(server());
    await agent.post('/api/auth/admin/login').send({ email: a.email, password: PASSWORD }).expect(200);
    return { agent, admin: a };
  }

  async function newDealer(name: string, over: Partial<typeof dealers.$inferInsert> = {}) {
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
        address: 'Örnek Mah. 1. Sk. No:3',
        source: 'invitation',
        status: 'active',
        passwordHash: await hash(PASSWORD),
        emailVerifiedAt: new Date(),
        ...over,
      })
      .returning();
    dealerIds.push(d.id);
    return d;
  }

  async function loginAs(email: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/dealer/login').send({ email, password: PASSWORD }).expect(200);
    return agent;
  }

  async function dealerAgent(name: string, over: Partial<typeof dealers.$inferInsert> = {}) {
    const dealer = await newDealer(name, over);
    return { agent: await loginAs(dealer.email), dealer };
  }

  let admin: Awaited<ReturnType<typeof adminAgent>>;
  let groupA: string;
  let groupB: string;
  let seq = 0;

  const createGroup = async (name: string) =>
    (await admin.agent.post('/api/admin/product-groups').send({ name: `${name} ${run}` }).expect(201)).body.id as string;

  const createProduct = async (groupId: string, over: Record<string, unknown> = {}) => {
    seq += 1;
    const res = await admin.agent
      .post('/api/admin/products')
      .send({
        groupId,
        barcode: bc(seq),
        code: bc(`kod${seq}`),
        name: `Ürün ${seq} ${run}`,
        caseQuantity: 12,
        listPrice: '48.90',
        vatRate: '20',
        ...over,
      })
      .expect(201);
    return res.body as { id: string; barcode: string; name: string };
  };

  const put = (agent: ReturnType<typeof request.agent>, productId: string, quantity: number) =>
    agent.put(`/api/cart/items/${productId}`).send({ quantity });

  const carrierBody = (expectedTotal: string, over: Record<string, unknown> = {}) => ({
    deliveryMethod: 'carrier',
    deliveryAddress: 'Teslimat Adresi 5, Talas / Kayseri',
    carrierName: 'Yurtiçi Kargo',
    carrierBranch: 'Kayseri Şube',
    note: 'Sabah teslim',
    expectedTotal,
    ...over,
  });

  /** POST /api/orders; `expectedVersion` verilmediyse sepetin güncel sürümü eklenir. */
  const orderReq = async (agent: ReturnType<typeof request.agent>, body: Record<string, unknown>) => {
    const expectedVersion = body.expectedVersion ?? (await agent.get('/api/cart')).body.version;
    return { req: agent.post('/api/orders').send({ ...body, expectedVersion }) };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_SERVICE)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get<Database>(DB);
    admin = await adminAgent();
    groupA = await createGroup('Sepet Mutfak');
    groupB = await createGroup('Sepet Tabak');
  });

  afterAll(async () => {
    if (db) {
      const prodIds = (await db.select({ id: products.id }).from(products).where(like(products.barcode, `%${run}%`))).map(
        (p) => p.id,
      );
      const groupIds = (
        await db.select({ id: productGroups.id }).from(productGroups).where(like(productGroups.name, `%${run}%`))
      ).map((g) => g.id);
      const orderIds = dealerIds.length
        ? (await db.select({ id: orders.id }).from(orders).where(inArray(orders.dealerId, dealerIds))).map((o) => o.id)
        : [];
      await db.delete(notificationOutbox).where(gte(notificationOutbox.createdAt, startedAt));
      const entityIds = [...adminIds, ...dealerIds, ...prodIds, ...groupIds, ...orderIds];
      await db.delete(auditLog).where(or(inArray(auditLog.actorId, entityIds), inArray(auditLog.entityId, entityIds)));
      await db.delete(sessions).where(inArray(sessions.subjectId, [...adminIds, ...dealerIds]));
      if (dealerIds.length) {
        await db.delete(cartItems).where(inArray(cartItems.dealerId, dealerIds));
        await db.delete(orders).where(inArray(orders.dealerId, dealerIds)); // satır ve geçmiş cascade
        await db.delete(dealerGroupDiscounts).where(inArray(dealerGroupDiscounts.dealerId, dealerIds));
      }
      if (prodIds.length) await db.delete(products).where(inArray(products.id, prodIds));
      if (groupIds.length) await db.delete(productGroups).where(inArray(productGroups.id, groupIds));
      if (dealerIds.length) await db.delete(dealers).where(inArray(dealers.id, dealerIds));
      await db.delete(adminUsers).where(inArray(adminUsers.id, adminIds));
    }
    await app?.close();
  });

  // -------------------------------------------------------------------------
  describe('Yetki', () => {
    it('GR-FIY-001, GR-YON-001: anonim 401; Admin bayi uçlarında 403; bayi Admin sipariş uçlarında 403', async () => {
      const anon = request(server());
      const { agent: dealer } = await dealerAgent('yetki');
      const dealerCalls: [string, string][] = [
        ['get', '/api/cart'],
        ['get', '/api/cart/checkout-defaults'],
        ['put', `/api/cart/items/${randomUUID()}`],
        ['delete', `/api/cart/items/${randomUUID()}`],
        ['delete', '/api/cart'],
        ['post', '/api/orders'],
        ['get', '/api/orders'],
        ['get', `/api/orders/${randomUUID()}`],
        ['post', `/api/orders/${randomUUID()}/reorder`],
      ];
      for (const [method, path] of dealerCalls) {
        const call = (a: unknown) => (a as Record<string, (p: string) => request.Test>)[method](path);
        const sent = (t: request.Test) => (method === 'put' || method === 'post' ? t.send({}) : t);
        const anonRes = await sent(call(anon));
        expect([method, path, anonRes.status]).toEqual([method, path, 401]);
        const adminRes = await sent(call(admin.agent));
        expect([method, path, adminRes.status]).toEqual([method, path, 403]);
      }
      await dealer.get('/api/admin/orders').expect(403);
      await dealer.get(`/api/admin/orders/${randomUUID()}`).expect(403);
      await request(server()).get('/api/admin/orders').expect(401);
    });
  });

  // -------------------------------------------------------------------------
  describe('Sepet', () => {
    it('GR-SIP-008, GR-FIY-002, K-39: ekle/güncelle/sil; 12 x 48.90 %15 -> 498.84; toplamlar', async () => {
      const { agent } = await dealerAgent('sepet-temel', { generalDiscountPercent: '15.00' });
      const p = await createProduct(groupA);
      const empty = await agent.get('/api/cart').expect(200);
      expect(empty.body).toEqual({
        version: expect.stringMatching(/^[0-9a-f]{16}$/),
        lines: [],
        summary: { grossTotal: '0.00', discountTotal: '0.00', netTotal: '0.00', vatTotal: '0.00', grandTotal: '0.00' },
        warnings: [],
        removed: [],
        adjusted: [],
      });

      const res = await put(agent, p.id, 12).expect(200);
      expect(res.body.lines).toHaveLength(1);
      expect(res.body.lines[0]).toMatchObject({
        productId: p.id,
        barcode: p.barcode,
        quantity: 12,
        caseQuantity: 12,
        stock: 'in_stock',
        listPrice: '48.90',
        discountPercent: '15.00',
        unitPrice: '41.57',
        lineGross: '586.80',
        lineDiscount: '87.96',
        lineNet: '498.84',
        vatRate: '20.00',
        lineVat: '99.77',
        thumbUrl: null,
      });
      expect(res.body.summary).toEqual({
        grossTotal: '586.80',
        discountTotal: '87.96',
        netTotal: '498.84',
        vatTotal: '99.77',
        grandTotal: '598.61',
      });

      // PUT miktarı değiştirir (artırmaz).
      const upd = await put(agent, p.id, 24).expect(200);
      expect(upd.body.lines[0].quantity).toBe(24);
      expect(upd.body.summary.netTotal).toBe('997.68');

      await agent.delete(`/api/cart/items/${p.id}`).expect(200).expect((r) => expect(r.body.lines).toEqual([]));
      await put(agent, p.id, 12).expect(200);
      await put(agent, p.id, 0).expect(200).expect((r) => expect(r.body.lines).toEqual([]));
      await put(agent, p.id, 12).expect(200);
      await agent.delete('/api/cart').expect(204);
      await agent.get('/api/cart').expect(200).expect((r) => expect(r.body.lines).toEqual([]));
    });

    it('GR-SIP-004, K-21: koli katı değilse 400 CASE_MULTIPLE ve sepet değişmez; 12/24/36 kabul', async () => {
      const { agent } = await dealerAgent('sepet-koli');
      const p = await createProduct(groupA);
      for (const q of [10, 13]) {
        const res = await put(agent, p.id, q).expect(400);
        expect(res.body).toMatchObject({ code: 'CASE_MULTIPLE', caseQuantity: 12 });
      }
      await agent.get('/api/cart').expect((r) => expect(r.body.lines).toEqual([]));
      for (const q of [12, 24, 36]) await put(agent, p.id, q).expect(200);
      await put(agent, p.id, 10).expect(400);
      await agent.get('/api/cart').expect((r) => expect(r.body.lines[0].quantity).toBe(36));
    });

    it('girdi doğrulama: negatif/ondalık/metin miktar 400 VALIDATION; olmayan ürün 404 PRODUCT_NOT_FOUND; geçersiz id 400', async () => {
      const { agent } = await dealerAgent('sepet-dogrula');
      const p = await createProduct(groupA);
      for (const q of [-1, 1.5, '12', 100_001]) {
        const res = await agent.put(`/api/cart/items/${p.id}`).send({ quantity: q }).expect(400);
        expect(res.body.code).toBe('VALIDATION');
      }
      const res = await put(agent, randomUUID(), 12).expect(404);
      expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
      await put(agent, 'x' as string, 12).expect(400);
    });

    it('GR-SIP-003, K-20: stokta olmayan ürün eklenir ve warnings OUT_OF_STOCK döner; stok adedi dönmez (K-18)', async () => {
      const { agent } = await dealerAgent('sepet-stok');
      const inStock = await createProduct(groupA);
      const out = await createProduct(groupA, { stockStatus: 'out_of_stock', caseQuantity: 6 });
      await put(agent, inStock.id, 12).expect(200);
      const res = await put(agent, out.id, 6).expect(200);
      expect(res.body.lines).toHaveLength(2);
      expect(res.body.warnings).toEqual([{ code: 'OUT_OF_STOCK', productId: out.id, name: out.name }]);
      expect(res.body.lines.find((l: { productId: string }) => l.productId === out.id).stock).toBe('out_of_stock');
      expect(JSON.stringify(res.body)).not.toMatch(/stockQuantity|stockCount/);
    });

    it('K-41, GR-SIP-008: sepet çıkış/giriş sonrası aynen korunur', async () => {
      const { agent, dealer } = await dealerAgent('sepet-kalici');
      const p = await createProduct(groupA);
      await put(agent, p.id, 24).expect(200);
      await agent.post('/api/auth/logout').expect((r) => expect([200, 204]).toContain(r.status));
      await agent.get('/api/cart').expect(401);
      const again = await loginAs(dealer.email);
      const res = await again.get('/api/cart').expect(200);
      expect(res.body.lines).toHaveLength(1);
      expect(res.body.lines[0]).toMatchObject({ productId: p.id, quantity: 24 });
    });

    it('GR-SIP-008: pasif ürün (veya pasif grup) sepetten düşer ve removed listesinde bildirilir', async () => {
      const { agent } = await dealerAgent('sepet-pasif');
      const g = await createGroup('Geçici Grup');
      const p1 = await createProduct(groupA);
      const p2 = await createProduct(groupA);
      const p3 = await createProduct(g);
      for (const p of [p1, p2, p3]) await put(agent, p.id, 12).expect(200);
      await admin.agent.patch(`/api/admin/products/${p1.id}`).send({ isActive: false }).expect(200);
      await admin.agent.patch(`/api/admin/product-groups/${g}`).send({ isActive: false }).expect(200);

      const res = await agent.get('/api/cart').expect(200);
      expect(res.body.lines.map((l: { productId: string }) => l.productId)).toEqual([p2.id]);
      expect(res.body.removed).toEqual(
        expect.arrayContaining([
          { productId: p1.id, name: p1.name },
          { productId: p3.id, name: p3.name },
        ]),
      );
      expect(res.body.removed).toHaveLength(2);
      // Gerçekten silinir: sonraki istekte tekrar bildirilmez.
      const second = await agent.get('/api/cart').expect(200);
      expect(second.body.removed).toEqual([]);
      expect(second.body.lines).toHaveLength(1);
      // Pasif ürün eklenemez.
      await put(agent, p1.id, 12).expect(404);
    });

    it('GR-FIY-001, K-13: fiyat sepette saklanmaz; iskonto değişince sepet fiyatı güncellenir (grup oranı yüksekse o)', async () => {
      const { agent, dealer } = await dealerAgent('sepet-fiyat');
      const p = await createProduct(groupA, { listPrice: '100.00', caseQuantity: 1 });
      const first = await put(agent, p.id, 2).expect(200);
      expect(first.body.lines[0]).toMatchObject({ unitPrice: '100.00', discountPercent: null, lineNet: '200.00' });

      await db.update(dealers).set({ generalDiscountPercent: '10.00' }).where(eq(dealers.id, dealer.id));
      const general = await agent.get('/api/cart').expect(200);
      expect(general.body.lines[0]).toMatchObject({ unitPrice: '90.00', discountPercent: '10.00', lineNet: '180.00' });

      await admin.agent
        .put(`/api/admin/dealers/${dealer.id}/group-discounts`)
        .send({ items: [{ groupId: groupA, discountPercent: '15' }] })
        .expect(204);
      const group = await agent.get('/api/cart').expect(200);
      expect(group.body.lines[0]).toMatchObject({ unitPrice: '85.00', discountPercent: '15.00', lineNet: '170.00' });

      // Liste fiyatı değişince de güncel.
      await admin.agent.patch(`/api/admin/products/${p.id}`).send({ listPrice: '200' }).expect(200);
      const listed = await agent.get('/api/cart').expect(200);
      expect(listed.body.lines[0]).toMatchObject({ listPrice: '200.00', unitPrice: '170.00', lineNet: '340.00' });
    });

    it('K-33, K-39: KDV satır bazında yuvarlanır, toplam satırların toplamıdır; farklı KDV oranları', async () => {
      const { agent } = await dealerAgent('sepet-kdv');
      const ps = [];
      for (let i = 0; i < 3; i++) ps.push(await createProduct(groupB, { listPrice: '3.33', caseQuantity: 1 }));
      const p10 = await createProduct(groupB, { listPrice: '10.05', caseQuantity: 1, vatRate: '10' });
      for (const p of ps) await put(agent, p.id, 1).expect(200);
      const res = await put(agent, p10.id, 1).expect(200);
      expect(res.body.lines.map((l: { lineVat: string }) => l.lineVat).sort()).toEqual(['0.67', '0.67', '0.67', '1.01']);
      // net 9.99 + 10.05 = 20.04; KDV 2.01 + 1.01 (1.005 -> 1.01) = 3.02
      expect(res.body.summary).toMatchObject({ netTotal: '20.04', vatTotal: '3.02', grandTotal: '23.06' });
    });

    it('K-21: koli içi adedi sepetteyken değişirse miktar yukarı yuvarlanır ve adjusted bildirir', async () => {
      const { agent } = await dealerAgent('sepet-koli-degisti');
      const p = await createProduct(groupA, { caseQuantity: 6 });
      await put(agent, p.id, 12).expect(200);
      await admin.agent.patch(`/api/admin/products/${p.id}`).send({ caseQuantity: 5 }).expect(200);
      const res = await agent.get('/api/cart').expect(200);
      expect(res.body.lines[0].quantity).toBe(15);
      expect(res.body.adjusted).toEqual([{ productId: p.id, name: p.name, from: 12, to: 15, caseQuantity: 5 }]);
    });

    it('K-38: checkout-defaults başvuru adresini (il/ilçe dahil) ve son ambar bilgisini verir', async () => {
      const { agent } = await dealerAgent('varsayilan');
      const first = await agent.get('/api/cart/checkout-defaults').expect(200);
      expect(first.body).toEqual({ address: 'Örnek Mah. 1. Sk. No:3, Melikgazi / Kayseri', lastCarrier: null });

      const p = await createProduct(groupA);
      await put(agent, p.id, 12).expect(200);
      const total = (await agent.get('/api/cart')).body.summary.grandTotal;
      await (await orderReq(agent, carrierBody(total, { carrierName: 'Eski Ambar', carrierBranch: 'Eski Şube' }))).req.expect(201);
      await put(agent, p.id, 12).expect(200);
      await (await orderReq(agent, carrierBody(total, { carrierName: 'Yeni Ambar', carrierBranch: 'Merkez' }))).req.expect(201);
      await put(agent, p.id, 12).expect(200);
      await (await orderReq(agent, { deliveryMethod: 'pickup', expectedTotal: total })).req.expect(201);
      const last = await agent.get('/api/cart/checkout-defaults').expect(200);
      expect(last.body.lastCarrier).toEqual({ name: 'Yeni Ambar', branch: 'Merkez' });
    });
  });

  // -------------------------------------------------------------------------
  describe('Ön sipariş gönderimi', () => {
    it('GR-FIY-001: expectedTotal farklıysa 409 PRICE_CHANGED + güncel sepet; sipariş oluşmaz, sepet durur', async () => {
      const { agent, dealer } = await dealerAgent('gonder-fiyat');
      const p = await createProduct(groupA);
      await put(agent, p.id, 12).expect(200);
      const seen = (await agent.get('/api/cart')).body.summary.grandTotal as string; // 586.80 + 117.36 = 704.16
      expect(seen).toBe('704.16');
      await admin.agent.patch(`/api/admin/products/${p.id}`).send({ listPrice: '50' }).expect(200);

      const res = await (await orderReq(agent, carrierBody(seen))).req.expect(409);
      expect(res.body.code).toBe('PRICE_CHANGED');
      expect(res.body.cart.summary.grandTotal).toBe('720.00');
      expect(res.body.cart.lines[0].unitPrice).toBe('50.00');
      expect(await db.select().from(orders).where(eq(orders.dealerId, dealer.id))).toHaveLength(0);
      expect((await agent.get('/api/cart')).body.lines).toHaveLength(1);

      // Bayi güncel toplamı onaylayınca gönderilir.
      await (await orderReq(agent, carrierBody('720'))).req.expect(201);
    });

    it('GR-FIY-001: pasif ürün sepetten düşmüşse toplam aynı olsa da 409 PRICE_CHANGED; hepsi düşerse removed ile 409', async () => {
      const { agent } = await dealerAgent('gonder-pasif');
      const p1 = await createProduct(groupA);
      const free = await createProduct(groupA, { listPrice: '0', caseQuantity: 1 });
      await put(agent, p1.id, 12).expect(200);
      await put(agent, free.id, 1).expect(200);
      const seenCart = (await agent.get('/api/cart')).body;
      const seen = seenCart.summary.grandTotal as string;
      const seenVersion = seenCart.version as string;
      await admin.agent.patch(`/api/admin/products/${free.id}`).send({ isActive: false }).expect(200);
      const res = await (await orderReq(agent, carrierBody(seen, { expectedVersion: seenVersion }))).req.expect(409);
      expect(res.body.cart.removed).toEqual([{ productId: free.id, name: free.name }]);

      await admin.agent.patch(`/api/admin/products/${p1.id}`).send({ isActive: false }).expect(200);
      const all = await (await orderReq(agent, carrierBody(seen, { expectedVersion: seenVersion }))).req.expect(409);
      expect(all.body.cart.lines).toEqual([]);
      expect(all.body.cart.removed).toHaveLength(1);
      await (await orderReq(agent, carrierBody(seen))).req.expect(400).expect((r) => expect(r.body.code).toBe('EMPTY_CART'));
    });

    it('GR-SIP-007: boş sepet 400 EMPTY_CART', async () => {
      const { agent } = await dealerAgent('gonder-bos');
      const res = await (await orderReq(agent, { deliveryMethod: 'pickup', expectedTotal: '0.00' })).req.expect(400);
      expect(res.body.code).toBe('EMPTY_CART');
    });

    it('GR-SIP-007, K-38: teslimat şekli zorunlu; ambar ise adres/ambar/şube zorunlu (boşluk sayılmaz)', async () => {
      const { agent } = await dealerAgent('gonder-dogrula');
      const p = await createProduct(groupA);
      await put(agent, p.id, 12).expect(200);
      const total = '704.16';
      const bad = async (body: Record<string, unknown>) => {
        const res = await (await orderReq(agent, body)).req.expect(400);
        expect(res.body.code).toBe('VALIDATION');
        return res.body.fields as Record<string, string>;
      };
      expect(Object.keys(await bad({ expectedTotal: total }))).toEqual(['deliveryMethod']);
      expect(Object.keys(await bad({ deliveryMethod: 'kargo', expectedTotal: total }))).toEqual(['deliveryMethod']);
      expect(Object.keys(await bad({ deliveryMethod: 'carrier', expectedTotal: total })).sort()).toEqual([
        'carrierBranch',
        'carrierName',
        'deliveryAddress',
      ]);
      expect(
        Object.keys(await bad(carrierBody(total, { carrierName: '   ', deliveryAddress: null }))).sort(),
      ).toEqual(['carrierName', 'deliveryAddress']);
      expect(Object.keys(await bad({ deliveryMethod: 'pickup' }))).toEqual(['expectedTotal']);
      expect(Object.keys(await bad({ deliveryMethod: 'pickup', expectedTotal: 'abc' }))).toEqual(['expectedTotal']);
    });

    it('K-37: pickup/truck adres alanlarını yok sayar, kaydetmez; GR-SIP-007 "adres görüşmede belirlenecek"', async () => {
      const { agent } = await dealerAgent('gonder-pickup');
      const p = await createProduct(groupA);
      for (const method of ['pickup', 'truck']) {
        await put(agent, p.id, 12).expect(200);
        const res = await (await orderReq(agent, carrierBody('704.16', { deliveryMethod: method }))).req.expect(201);
        const detail = await agent.get(`/api/orders/${res.body.id}`).expect(200);
        expect(detail.body).toMatchObject({
          deliveryMethod: method,
          deliveryAddress: null,
          carrierName: null,
          carrierBranch: null,
          note: 'Sabah teslim',
        });
      }
    });

    it('GR-SIP-005, GR-FIY-001, K-22, K-39: satır kopyaları, toplamlar, sepet boşalır, geçmiş + audit; sonradan fiyat değişse sipariş değişmez', async () => {
      const { agent, dealer } = await dealerAgent('gonder-tam', { generalDiscountPercent: '15.00' });
      const p = await createProduct(groupA);
      const out = await createProduct(groupA, { stockStatus: 'out_of_stock', caseQuantity: 6, listPrice: '10.00', vatRate: '10' });
      await put(agent, p.id, 12).expect(200);
      await put(agent, out.id, 6).expect(200);
      const cart = (await agent.get('/api/cart')).body;
      // p: net 498.84, KDV 99.77; out: 6 x 8.50 = 51.00, KDV 5.10
      expect(cart.summary).toEqual({
        grossTotal: '646.80',
        discountTotal: '96.96',
        netTotal: '549.84',
        vatTotal: '104.87',
        grandTotal: '654.71',
      });

      const res = await (await orderReq(agent, carrierBody(cart.summary.grandTotal))).req.expect(201);
      expect(res.body).toEqual({ id: expect.any(String), orderNo: expect.any(Number) });
      expect(res.body.orderNo).toBeGreaterThanOrEqual(1000);

      const [order] = await db.select().from(orders).where(eq(orders.id, res.body.id));
      expect(order).toMatchObject({
        dealerId: dealer.id,
        status: 'submitted',
        transferStatus: 'pending',
        deliveryMethod: 'carrier',
        deliveryAddress: 'Teslimat Adresi 5, Talas / Kayseri',
        carrierName: 'Yurtiçi Kargo',
        carrierBranch: 'Kayseri Şube',
        grossTotal: '646.80',
        discountTotal: '96.96',
        netTotal: '549.84',
        vatTotal: '104.87',
        grandTotal: '654.71',
      });
      const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
      expect(lines).toHaveLength(2);
      const l1 = lines.find((l) => l.productId === p.id)!;
      expect(l1).toMatchObject({
        barcode: p.barcode,
        productName: p.name,
        caseQuantity: 12,
        quantity: 12,
        unitListPrice: '48.90',
        discountPercent: '15.00',
        grossAmount: '586.80',
        discountAmount: '87.96',
        netAmount: '498.84',
        vatRate: '20.00',
        vatAmount: '99.77',
        outOfStockAtOrder: false,
      });
      expect(lines.find((l) => l.productId === out.id)).toMatchObject({ outOfStockAtOrder: true, netAmount: '51.00' });

      const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
      expect(history).toEqual([expect.objectContaining({ fromStatus: null, toStatus: 'submitted', source: 'system', changedBy: null })]);
      expect(await db.select().from(cartItems).where(eq(cartItems.dealerId, dealer.id))).toHaveLength(0);
      expect((await agent.get('/api/cart')).body.lines).toEqual([]);

      const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, order.id));
      expect(audit).toEqual([
        expect.objectContaining({ actorType: 'dealer', actorId: dealer.id, action: 'order.submit', entityType: 'orders' }),
      ]);

      // Sonradan ürün fiyatı, adı, iskonto ve koli değişir; eski sipariş değişmez (GR-URN-001, GR-BAYI-003).
      await admin.agent.patch(`/api/admin/products/${p.id}`).send({ listPrice: '99', name: `Yeni ad ${run}`, caseQuantity: 5 }).expect(200);
      await db.update(dealers).set({ generalDiscountPercent: '50.00' }).where(eq(dealers.id, dealer.id));
      const detail = (await agent.get(`/api/orders/${order.id}`).expect(200)).body;
      expect(detail.summary.grandTotal).toBe('654.71');
      const d1 = detail.lines.find((l: { productId: string }) => l.productId === p.id);
      expect(d1).toMatchObject({
        name: p.name,
        listPrice: '48.90',
        unitPrice: '41.57',
        discountPercent: '15.00',
        lineNet: '498.84',
        lineVat: '99.77',
        caseQuantity: 12,
        outOfStock: false,
      });
      expect(detail.lines.find((l: { productId: string }) => l.productId === out.id).outOfStock).toBe(true);
    });

    it('GR-FIY-001: sepet sürümü (version) deterministik; içerik veya miktar değişince değişir', async () => {
      const { agent } = await dealerAgent('surum');
      const p = await createProduct(groupA);
      const empty = (await agent.get('/api/cart')).body.version as string;
      expect(empty).toMatch(/^[0-9a-f]{16}$/);
      await put(agent, p.id, 12).expect(200);
      const v12 = (await agent.get('/api/cart')).body.version as string;
      expect((await agent.get('/api/cart')).body.version).toBe(v12);
      expect(v12).not.toBe(empty);
      await put(agent, p.id, 24).expect(200);
      const v24 = (await agent.get('/api/cart')).body.version as string;
      expect(v24).not.toBe(v12);
      await put(agent, p.id, 12).expect(200);
      expect((await agent.get('/api/cart')).body.version).toBe(v12);
    });

    it('GR-FIY-001: expectedVersion zorunlu (400 VALIDATION)', async () => {
      const { agent } = await dealerAgent('surum-zorunlu');
      const p = await createProduct(groupA);
      await put(agent, p.id, 12).expect(200);
      const res = await agent.post('/api/orders').send({ deliveryMethod: 'pickup', expectedTotal: '704.16' }).expect(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(Object.keys(res.body.fields)).toEqual(['expectedVersion']);
    });

    it('GR-FIY-001: toplam aynı ama sepet içeriği farklıysa 409 PRICE_CHANGED (sürüm uyuşmazlığı); doğru sürümle gönderilir', async () => {
      const { agent, dealer } = await dealerAgent('surum-icerik');
      const x = await createProduct(groupA, { listPrice: '10.00', caseQuantity: 1 });
      const y = await createProduct(groupA, { listPrice: '20.00', caseQuantity: 1 });
      await put(agent, x.id, 2).expect(200);
      const before = (await agent.get('/api/cart')).body;
      expect(before.summary.grandTotal).toBe('24.00');
      // Aynı genel toplam (24.00), farklı içerik.
      await agent.delete(`/api/cart/items/${x.id}`).expect(200);
      await put(agent, y.id, 1).expect(200);
      const after = (await agent.get('/api/cart')).body;
      expect(after.summary.grandTotal).toBe(before.summary.grandTotal);
      expect(after.version).not.toBe(before.version);

      const res = await (await orderReq(agent, carrierBody('24.00', { expectedVersion: before.version }))).req.expect(409);
      expect(res.body.code).toBe('PRICE_CHANGED');
      expect(res.body.cart.version).toBe(after.version);
      expect(await db.select().from(orders).where(eq(orders.dealerId, dealer.id))).toHaveLength(0);
      await (await orderReq(agent, carrierBody('24.00', { expectedVersion: after.version }))).req.expect(201);
    });

    it('K-21, GR-SIP-004: gönderim anında koli katı düzeltilmişse (adjusted) toplam aynı olsa da 409; sipariş oluşmaz', async () => {
      const { agent, dealer } = await dealerAgent('gonder-adjusted');
      const p = await createProduct(groupA, { caseQuantity: 6, listPrice: '0' });
      await put(agent, p.id, 12).expect(200);
      const seen = (await agent.get('/api/cart')).body;
      expect(seen.summary.grandTotal).toBe('0.00');
      await admin.agent.patch(`/api/admin/products/${p.id}`).send({ caseQuantity: 5 }).expect(200);
      const res = await (await orderReq(agent, carrierBody('0.00', { expectedVersion: seen.version }))).req.expect(409);
      expect(res.body.code).toBe('PRICE_CHANGED');
      expect(res.body.cart.adjusted).toEqual([{ productId: p.id, name: p.name, from: 12, to: 15, caseQuantity: 5 }]);
      expect(res.body.cart.lines[0].quantity).toBe(15);
      expect(await db.select().from(orders).where(eq(orders.dealerId, dealer.id))).toHaveLength(0);
      // Bayi güncel sepeti görüp onaylayınca gönderilir.
      await (await orderReq(agent, carrierBody('0.00'))).req.expect(201);
    });

    it('GR-SIP-006, K-10: sipariş detayında iskonto yoksa discountPercent null, varsa oran', async () => {
      const plain = await dealerAgent('iskonto-yok');
      const disc = await dealerAgent('iskonto-var', { generalDiscountPercent: '15.00' });
      const p = await createProduct(groupA);
      for (const [d, expected] of [[plain, null], [disc, '15.00']] as const) {
        await put(d.agent, p.id, 12).expect(200);
        const created = (await (await orderReq(d.agent, carrierBody((await d.agent.get('/api/cart')).body.summary.grandTotal))).req.expect(201)).body;
        const detail = (await d.agent.get(`/api/orders/${created.id}`).expect(200)).body;
        expect(detail.lines[0].discountPercent).toBe(expected);
        const adminDetail = (await admin.agent.get(`/api/admin/orders/${created.id}`).expect(200)).body;
        expect(adminDetail.lines[0].discountPercent).toBe(expected);
      }
    });

    it('K-41, GR-SIP-005: çift gönderim (paralel iki POST) tek sipariş oluşturur; diğeri 400 EMPTY_CART', async () => {
      const { agent, dealer } = await dealerAgent('gonder-cift');
      const p = await createProduct(groupA);
      await put(agent, p.id, 12).expect(200);
      const body = carrierBody('704.16');
      const results = await Promise.all([
        (await orderReq(agent, body)).req,
        (await orderReq(agent, body)).req,
        (await orderReq(agent, body)).req,
      ]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([201, 400, 400]);
      expect(results.filter((r) => r.status === 400).every((r) => r.body.code === 'EMPTY_CART')).toBe(true);
      expect(await db.select().from(orders).where(eq(orders.dealerId, dealer.id))).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('Bildirim (GR-BLD-001, K-26, K-17)', () => {
    it('gönderimden sonra bayiye onay, tüm aktif Admin lere "Yeni ön sipariş" e-postası gider; ekip e-postası satır özeti ve teslimat içerir', async () => {
      const second = await adminAgent();
      const { agent, dealer } = await dealerAgent('bildirim');
      const p = await createProduct(groupA);
      const out = await createProduct(groupA, { stockStatus: 'out_of_stock', caseQuantity: 6, listPrice: '10.00' });
      await put(agent, p.id, 12).expect(200);
      await put(agent, out.id, 6).expect(200);
      const total = (await agent.get('/api/cart')).body.summary.grandTotal as string;
      mail.sendOrderConfirmation.mockClear();
      mail.sendNewOrderToTeam.mockClear();
      const res = await (await orderReq(agent, carrierBody(total))).req.expect(201);

      await vi.waitFor(() => {
        expect(mail.sendOrderConfirmation).toHaveBeenCalledTimes(1);
        const teamTo = mail.sendNewOrderToTeam.mock.calls.map((c) => c[0] as string);
        expect(teamTo).toEqual(expect.arrayContaining([admin.admin.email, second.admin.email]));
      });
      const [to, confirmation] = mail.sendOrderConfirmation.mock.calls[0];
      expect(to).toBe(dealer.email);
      expect(confirmation.orderNo).toBe(res.body.orderNo);

      const teamCall = mail.sendNewOrderToTeam.mock.calls.find((c) => c[0] === admin.admin.email)!;
      expect(teamCall[1]).toMatchObject({
        orderNo: res.body.orderNo,
        dealerCompany: dealer.companyTitle,
        deliveryMethod: 'carrier',
        deliveryAddress: 'Teslimat Adresi 5, Talas / Kayseri',
        carrierName: 'Yurtiçi Kargo',
        carrierBranch: 'Kayseri Şube',
      });
      const lines = teamCall[1].lines as { barcode: string; name: string; quantity: number; unitPrice: string; outOfStock: boolean }[];
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ barcode: p.barcode, name: p.name, quantity: 12, unitPrice: '48.90', outOfStock: false }),
          expect.objectContaining({ barcode: out.barcode, quantity: 6, unitPrice: '10.00', outOfStock: true }),
        ]),
      );
    });

    it('GR-BLD-001: e-posta gönderimi başarısız olsa da sipariş oluşur (201); bildirim outbox te pending kalır', async () => {
      const { agent, dealer } = await dealerAgent('bildirim-hata');
      const p = await createProduct(groupA);
      await put(agent, p.id, 12).expect(200);
      mail.sendOrderConfirmation.mockRejectedValueOnce(new Error('smtp down'));
      mail.sendNewOrderToTeam.mockRejectedValue(new Error('smtp down'));
      try {
        const res = await (await orderReq(agent, carrierBody('704.16'))).req.expect(201);
        await app.get(NotificationsService).whenIdle();
        expect(await db.select().from(orders).where(eq(orders.id, res.body.id))).toHaveLength(1);
        const rows = await db.select().from(notificationOutbox).where(eq(notificationOutbox.recipient, dealer.email));
        expect(rows).toEqual([expect.objectContaining({ kind: 'order_confirmation', status: 'pending', attempts: 1, lastError: 'smtp down' })]);
        const team = await db.select().from(notificationOutbox).where(eq(notificationOutbox.recipient, admin.admin.email));
        expect(team.filter((r) => r.kind === 'new_order_team' && r.status === 'pending').length).toBeGreaterThanOrEqual(1);
      } finally {
        mail.sendNewOrderToTeam.mockReset().mockResolvedValue(undefined);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('Sipariş geçmişi (GR-SIP-006, K-23)', () => {
    async function placeOrder(agent: ReturnType<typeof request.agent>, productId: string, qty = 12) {
      await put(agent, productId, qty).expect(200);
      const total = (await agent.get('/api/cart')).body.summary.grandTotal as string;
      return (await (await orderReq(agent, carrierBody(total))).req.expect(201)).body as { id: string; orderNo: number };
    }

    it('liste sayfalı ve en yeni önce; detay satırlar/toplamlar/teslimat/durum geçmişi içerir', async () => {
      const { agent } = await dealerAgent('gecmis');
      const p = await createProduct(groupA);
      const o1 = await placeOrder(agent, p.id);
      const o2 = await placeOrder(agent, p.id, 24);
      const o3 = await placeOrder(agent, p.id);

      const list = await agent.get('/api/orders').expect(200);
      expect(list.body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
      expect(list.body.items.map((i: { orderNo: number }) => i.orderNo)).toEqual([o3.orderNo, o2.orderNo, o1.orderNo]);
      expect(list.body.items[1]).toEqual({
        id: o2.id,
        orderNo: o2.orderNo,
        submittedAt: expect.any(String),
        status: 'submitted',
        netTotal: '1173.60',
        grandTotal: '1408.32',
        lineCount: 1,
      });
      const page2 = await agent.get('/api/orders').query({ page: 2, pageSize: 2 }).expect(200);
      expect(page2.body.items.map((i: { orderNo: number }) => i.orderNo)).toEqual([o1.orderNo]);
      await agent.get('/api/orders').query({ pageSize: 101 }).expect(400);

      const detail = (await agent.get(`/api/orders/${o2.id}`).expect(200)).body;
      expect(detail).toMatchObject({
        id: o2.id,
        orderNo: o2.orderNo,
        status: 'submitted',
        deliveryMethod: 'carrier',
        carrierName: 'Yurtiçi Kargo',
        summary: { grossTotal: '1173.60', discountTotal: '0.00', netTotal: '1173.60', vatTotal: '234.72', grandTotal: '1408.32' },
      });
      expect(detail.lines).toHaveLength(1);
      expect(detail.lines[0]).toMatchObject({ lineNo: 1, quantity: 24, unitPrice: '48.90', lineNet: '1173.60' });
      expect(detail.history).toEqual([
        { fromStatus: null, toStatus: 'submitted', source: 'system', createdAt: expect.any(String) },
      ]);
    });

    it('GR-SIP-006: başka bayinin siparişi (detay ve tekrar sipariş) 404; yalnızca kendi siparişleri listelenir', async () => {
      const a = await dealerAgent('gecmis-a');
      const b = await dealerAgent('gecmis-b');
      const p = await createProduct(groupA);
      const order = await placeOrder(a.agent, p.id);
      await b.agent.get(`/api/orders/${order.id}`).expect(404);
      await b.agent.post(`/api/orders/${order.id}/reorder`).expect(404);
      await b.agent.get(`/api/orders/${randomUUID()}`).expect(404);
      await b.agent.get(`/api/orders/abc`).expect(400);
      expect((await b.agent.get('/api/orders').expect(200)).body).toMatchObject({ total: 0, items: [] });
      await a.agent.get(`/api/orders/${order.id}`).expect(200);
    });

    it('GR-SIP-005, K-22: gönderilen siparişte düzenleme/iptal ucu yoktur', async () => {
      const { agent } = await dealerAgent('kilit');
      const p = await createProduct(groupA);
      const order = await placeOrder(agent, p.id);
      for (const method of ['put', 'patch', 'delete'] as const) {
        const res = await agent[method](`/api/orders/${order.id}`).send({ status: 'cancelled' });
        expect([method, res.status]).toEqual([method, 404]);
      }
      await agent.post(`/api/orders/${order.id}/cancel`).send({}).expect(404);
      expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0].status).toBe('submitted');
    });
  });

  // -------------------------------------------------------------------------
  describe('Tekrar sipariş (GR-SIP-008, K-41, K-44)', () => {
    it('güncel fiyatla sepete ekler; sepetteki aynı ürünün miktarına ekler (birleştirir)', async () => {
      const { agent } = await dealerAgent('tekrar-birlestir');
      const p = await createProduct(groupA);
      const q = await createProduct(groupA, { caseQuantity: 6, listPrice: '10.00' });
      await put(agent, p.id, 12).expect(200);
      await put(agent, q.id, 6).expect(200);
      const total = (await agent.get('/api/cart')).body.summary.grandTotal as string;
      const order = (await (await orderReq(agent, carrierBody(total))).req.expect(201)).body;

      // Fiyat artar; sepette zaten 12 adet p var.
      await admin.agent.patch(`/api/admin/products/${p.id}`).send({ listPrice: '60' }).expect(200);
      await put(agent, p.id, 12).expect(200);
      const res = await agent.post(`/api/orders/${order.id}/reorder`).expect(200);
      expect(res.body.skipped).toEqual([]);
      expect(res.body.adjusted).toEqual([]);
      expect(res.body.added).toEqual(
        expect.arrayContaining([
          { productId: p.id, name: p.name, quantity: 12 },
          { productId: q.id, name: q.name, quantity: 6 },
        ]),
      );
      const lines = res.body.cart.lines as { productId: string; quantity: number; unitPrice: string }[];
      expect(lines.find((l) => l.productId === p.id)).toMatchObject({ quantity: 24, unitPrice: '60.00' });
      expect(lines.find((l) => l.productId === q.id)).toMatchObject({ quantity: 6, unitPrice: '10.00' });
      expect((await agent.get('/api/cart')).body.lines).toHaveLength(2);
    });

    it('pasif ürün atlanır ve skipped listesinde döner; koli içi adedi değiştiyse yeni koli katına yukarı yuvarlanır ve adjusted bildirir', async () => {
      const { agent } = await dealerAgent('tekrar-atla');
      const keep = await createProduct(groupA);
      const gone = await createProduct(groupA, { caseQuantity: 6 });
      const changed = await createProduct(groupA, { caseQuantity: 6 });
      const grp = await createGroup('Tekrar Grup');
      const groupGone = await createProduct(grp, { caseQuantity: 1 });
      for (const [p, q] of [[keep, 12], [gone, 6], [changed, 12], [groupGone, 3]] as const) await put(agent, p.id, q).expect(200);
      const total = (await agent.get('/api/cart')).body.summary.grandTotal as string;
      const order = (await (await orderReq(agent, carrierBody(total))).req.expect(201)).body;
      expect((await agent.get('/api/cart')).body.lines).toEqual([]);

      await admin.agent.patch(`/api/admin/products/${gone.id}`).send({ isActive: false }).expect(200);
      await admin.agent.patch(`/api/admin/product-groups/${grp}`).send({ isActive: false }).expect(200);
      await admin.agent.patch(`/api/admin/products/${changed.id}`).send({ caseQuantity: 5 }).expect(200);

      const res = await agent.post(`/api/orders/${order.id}/reorder`).expect(200);
      expect(res.body.skipped).toEqual(
        expect.arrayContaining([
          { productId: gone.id, name: gone.name, barcode: gone.barcode, reason: 'INACTIVE' },
          { productId: groupGone.id, name: groupGone.name, barcode: groupGone.barcode, reason: 'INACTIVE' },
        ]),
      );
      expect(res.body.skipped).toHaveLength(2);
      expect(res.body.adjusted).toEqual([{ productId: changed.id, name: changed.name, from: 12, to: 15, caseQuantity: 5 }]);
      const lines = res.body.cart.lines as { productId: string; quantity: number }[];
      expect(lines.map((l) => l.productId).sort()).toEqual([keep.id, changed.id].sort());
      expect(lines.find((l) => l.productId === changed.id)!.quantity).toBe(15);
      expect(res.body.cart.removed).toEqual([]);
      // Eski sipariş değişmedi.
      const old = (await agent.get(`/api/orders/${order.id}`)).body;
      expect(old.lines).toHaveLength(4);
    });

    it('GR-SIP-008: toplanan miktar sınırı (100000) aşarsa koli katına kırpılır ve adjusted bildirir', async () => {
      const { agent } = await dealerAgent('tekrar-sinir');
      const p = await createProduct(groupA, { listPrice: '1.00' });
      await put(agent, p.id, 99_996).expect(200); // 12 x 8333
      const total = (await agent.get('/api/cart')).body.summary.grandTotal as string;
      const order = (await (await orderReq(agent, carrierBody(total))).req.expect(201)).body;
      await put(agent, p.id, 99_996).expect(200);
      const res = await agent.post(`/api/orders/${order.id}/reorder`).expect(200);
      expect(res.body.adjusted).toEqual([{ productId: p.id, name: p.name, from: 199_992, to: 99_996, caseQuantity: 12 }]);
      expect(res.body.cart.lines[0].quantity).toBe(99_996);
      // Sınırı aşan satır sepete yazılabilir değerde kalır.
      await put(agent, p.id, 99_996).expect(200);
    });

    it('koli içi adedi değişse de miktar yeni koli katıysa yuvarlama yok', async () => {
      const { agent } = await dealerAgent('tekrar-ayni');
      const p = await createProduct(groupA, { caseQuantity: 6 });
      await put(agent, p.id, 12).expect(200);
      const total = (await agent.get('/api/cart')).body.summary.grandTotal as string;
      const order = (await (await orderReq(agent, carrierBody(total))).req.expect(201)).body;
      await admin.agent.patch(`/api/admin/products/${p.id}`).send({ caseQuantity: 4 }).expect(200);
      const res = await agent.post(`/api/orders/${order.id}/reorder`).expect(200);
      expect(res.body.adjusted).toEqual([]);
      expect(res.body.cart.lines[0].quantity).toBe(12);
    });
  });

  // -------------------------------------------------------------------------
  describe('Admin sipariş okuma (GR-SIP-006)', () => {
    it('liste: bayi bilgisi, filtre (status, dealerId, tarih), sayfalama; detay: bayi ve aktarım alanları', async () => {
      const a = await dealerAgent('admin-liste-a');
      const b = await dealerAgent('admin-liste-b');
      const p = await createProduct(groupA);
      const place = async (agent: ReturnType<typeof request.agent>) => {
        await put(agent, p.id, 12).expect(200);
        return (await (await orderReq(agent, carrierBody('704.16'))).req.expect(201)).body as { id: string; orderNo: number };
      };
      const a1 = await place(a.agent);
      const a2 = await place(a.agent);
      const b1 = await place(b.agent);
      await db.update(orders).set({ status: 'approved' }).where(eq(orders.id, a2.id));
      // a1'i geçmiş bir güne taşı (Europe/Istanbul 2020-03-10 23:30 = 20:30 UTC).
      await db.update(orders).set({ submittedAt: new Date('2020-03-10T20:30:00Z') }).where(eq(orders.id, a1.id));

      const list = await admin.agent.get('/api/admin/orders').query({ dealerId: a.dealer.id }).expect(200);
      expect(list.body.total).toBe(2);
      expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([a2.id, a1.id]);
      expect(list.body.items[0]).toMatchObject({
        orderNo: a2.orderNo,
        status: 'approved',
        dealer: { id: a.dealer.id, companyTitle: a.dealer.companyTitle },
        deliveryMethod: 'carrier',
        transferStatus: 'pending',
        netTotal: '586.80',
        grandTotal: '704.16',
        lineCount: 1,
      });

      const byStatus = await admin.agent.get('/api/admin/orders').query({ dealerId: a.dealer.id, status: 'approved' }).expect(200);
      expect(byStatus.body.items.map((i: { id: string }) => i.id)).toEqual([a2.id]);
      const submitted = await admin.agent.get('/api/admin/orders').query({ status: 'submitted', dealerId: b.dealer.id }).expect(200);
      expect(submitted.body.items.map((i: { id: string }) => i.id)).toEqual([b1.id]);

      // Gün sınırı Europe/Istanbul: 2020-03-10 20:30Z = 2020-03-10 23:30 (İstanbul) -> 10 Mart.
      const day = (from?: string, to?: string) =>
        admin.agent.get('/api/admin/orders').query({ dealerId: a.dealer.id, from, to });
      expect((await day('2020-03-10', '2020-03-10')).body.items.map((i: { id: string }) => i.id)).toEqual([a1.id]);
      expect((await day('2020-03-11', '2020-03-12')).body.total).toBe(0);
      expect((await day('2020-03-09', '2020-03-09')).body.total).toBe(0);
      expect((await day('2021-01-01')).body.items.map((i: { id: string }) => i.id)).toEqual([a2.id]);
      expect((await day(undefined, '2020-12-31')).body.items.map((i: { id: string }) => i.id)).toEqual([a1.id]);
      await day('2020-02-31').expect(400);
      await admin.agent.get('/api/admin/orders').query({ status: 'bilinmeyen' }).expect(400);

      const paged = await admin.agent.get('/api/admin/orders').query({ dealerId: a.dealer.id, pageSize: 1, page: 2 }).expect(200);
      expect(paged.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
      expect(paged.body.items.map((i: { id: string }) => i.id)).toEqual([a1.id]);

      const detail = (await admin.agent.get(`/api/admin/orders/${a2.id}`).expect(200)).body;
      expect(detail).toMatchObject({
        id: a2.id,
        orderNo: a2.orderNo,
        status: 'approved',
        dealer: { id: a.dealer.id, companyTitle: a.dealer.companyTitle, email: a.dealer.email, contactName: 'Ayşe', phone: '05320000000' },
        transferStatus: 'pending',
        transferError: null,
        bizimhesapGuid: null,
        transferredAt: null,
        summary: { netTotal: '586.80', grandTotal: '704.16' },
      });
      expect(detail.lines).toHaveLength(1);
      expect(detail.history[0]).toMatchObject({ toStatus: 'submitted', source: 'system', changedBy: null, note: null });
      await admin.agent.get(`/api/admin/orders/${randomUUID()}`).expect(404);
    });
  });
});
