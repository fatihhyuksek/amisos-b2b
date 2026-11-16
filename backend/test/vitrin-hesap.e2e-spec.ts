// Açık vitrin, hesap, favoriler, hızlı sipariş, Excel, site ayarları ve admin araçları (e2e).
// API: docs/api/vitrin-hesap-api.md. Gereksinimler: K-66 – K-76.
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { and, desc, eq, inArray, like, or } from 'drizzle-orm';
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
  consents,
  dealerAddresses,
  dealerFavorites,
  dealerNotes,
  dealers,
  orders,
  productGroups,
  products,
  sessions,
  siteSettings,
} from '../src/database/schema.js';
import { companyTitleKey } from '../src/dealers/company-title.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';

const PASSWORD = 'Sifre-12345';
const NEW_PASSWORD = 'Yeni-Sifre-678';
const run = randomUUID().slice(0, 8);
const bc = (n: string) => `V${run}-${n}`;
type Agent = ReturnType<typeof request.agent>;

describe('Vitrin ve hesap (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  const adminIds: string[] = [];
  const dealerIds: string[] = [];
  const server = () => app.getHttpServer();

  async function adminAgent(name = 'a') {
    const [a] = await db
      .insert(adminUsers)
      .values({ email: `${name}${adminIds.length}-${run}@test.example`, fullName: 'Admin Test', passwordHash: await hash(PASSWORD) })
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
        address: 'Adres 1',
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
  async function dealerAgent(name: string, over: Partial<typeof dealers.$inferInsert> = {}) {
    const dealer = await newDealer(name, over);
    const agent = request.agent(server());
    await agent.post('/api/auth/dealer/login').send({ email: dealer.email, password: PASSWORD }).expect(200);
    return { agent, dealer };
  }
  const login = async (email: string, password = PASSWORD) => {
    const agent = request.agent(server());
    await agent.post('/api/auth/dealer/login').send({ email, password }).expect(200);
    return agent;
  };

  let admin: Awaited<ReturnType<typeof adminAgent>>;
  let groupA: string;
  let groupB: string;
  let pCheap: { id: string; barcode: string };
  let pPricey: { id: string; barcode: string };
  let pOut: { id: string; barcode: string };

  const createProduct = async (groupId: string, n: string, over: Record<string, unknown> = {}) =>
    (
      await admin.agent
        .post('/api/admin/products')
        .send({ groupId, barcode: bc(n), name: `Ürün ${n} ${run}`, caseQuantity: 6, listPrice: '100.00', ...over })
        .expect(201)
    ).body as { id: string; barcode: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MAIL_SERVICE).useValue({}).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get<Database>(DB);
    admin = await adminAgent();
    groupA = (await admin.agent.post('/api/admin/product-groups').send({ name: `Vitrin A ${run}` }).expect(201)).body.id;
    groupB = (await admin.agent.post('/api/admin/product-groups').send({ name: `Vitrin B ${run}` }).expect(201)).body.id;
    pCheap = await createProduct(groupA, 'ucuz', { listPrice: '1234.56', code: `KOD-${run}-U`, name: `Ucuz Ürün ${run}` });
    pPricey = await createProduct(groupB, 'pahali', { listPrice: '9876.54', isFeatured: true, name: `Pahalı Ürün ${run}` });
    pOut = await createProduct(groupA, 'yok', { listPrice: '55.55', stockStatus: 'out_of_stock', caseQuantity: 4, name: `Stoksuz Ürün ${run}` });
  });

  afterAll(async () => {
    if (db) {
      const prodRows = await db.select({ id: products.id }).from(products).where(like(products.barcode, `%${run}%`));
      const prodIds = prodRows.map((p) => p.id);
      const groupIds = (await db.select({ id: productGroups.id }).from(productGroups).where(like(productGroups.name, `%${run}%`))).map((g) => g.id);
      const all = [...adminIds, ...dealerIds, ...prodIds, ...groupIds, 'bulk', 'site'];
      await db.delete(auditLog).where(or(inArray(auditLog.actorId, [...adminIds, ...dealerIds]), inArray(auditLog.entityId, all)));
      await db.delete(sessions).where(inArray(sessions.subjectId, [...adminIds, ...dealerIds]));
      await db.delete(siteSettings);
      if (dealerIds.length) {
        await db.delete(orders).where(inArray(orders.dealerId, dealerIds));
        await db.delete(consents).where(inArray(consents.dealerId, dealerIds));
        await db.delete(dealerNotes).where(inArray(dealerNotes.dealerId, dealerIds));
        await db.delete(dealerAddresses).where(inArray(dealerAddresses.dealerId, dealerIds));
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
  describe('K-66 açık vitrin: fiyat sızmaması', () => {
    const PRICE_KEYS = ['listPrice', 'price', 'discountPercent', 'stock', 'vatRate'];

    it('oturumsuz liste/detay: fiyat, iskonto, stok, KDV null; yanıt metninde hiçbir fiyat değeri yok', async () => {
      const anon = request(server());
      const list = await anon.get('/api/catalog/products').query({ q: run }).expect(200);
      expect(list.body.priceVisible).toBe(false);
      expect(list.body.items).toHaveLength(3);
      for (const item of list.body.items) {
        for (const k of PRICE_KEYS) expect(item[k], k).toBeNull();
        expect(item.isFavorite).toBe(false);
      }
      const detail = await anon.get(`/api/catalog/products/${pCheap.id}`).expect(200);
      expect(detail.body.priceVisible).toBe(false);
      for (const k of PRICE_KEYS) expect(detail.body[k], k).toBeNull();
      const raw = JSON.stringify([list.body, detail.body]);
      for (const secret of ['1234.56', '9876.54', '55.55', 'in_stock', 'out_of_stock']) expect(raw).not.toContain(secret);
    });

    it('Admin oturumu da fiyat görmez', async () => {
      const res = await admin.agent.get('/api/catalog/products').query({ q: run }).expect(200);
      expect(res.body.priceVisible).toBe(false);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('1234.56');
      for (const item of res.body.items) for (const k of PRICE_KEYS) expect(item[k]).toBeNull();
    });

    it('oturumsuz: sort=price_* 400 değil, isme göre; stock=in_stock yok sayılır (stok sızmaz)', async () => {
      const anon = request(server());
      const byName = (await anon.get('/api/catalog/products').query({ q: run, sort: 'name' }).expect(200)).body.items.map((i: { id: string }) => i.id);
      const desc = (await anon.get('/api/catalog/products').query({ q: run, sort: 'price_desc' }).expect(200)).body.items.map((i: { id: string }) => i.id);
      expect(desc).toEqual(byName);
      const filtered = await anon.get('/api/catalog/products').query({ q: run, stock: 'in_stock' }).expect(200);
      expect(filtered.body.total).toBe(3); // stokta olmayan da listelenir: filtre stok bilgisi sızdırmaz
    });

    it('bayi: fiyat, stok ve KDV görünür; fiyata göre sıralama bayinin kendi fiyatıyla çalışır', async () => {
      const d = await dealerAgent('fiyat', { generalDiscountPercent: '10.00' });
      const res = await d.agent.get('/api/catalog/products').query({ q: run, sort: 'price_desc' }).expect(200);
      expect(res.body.priceVisible).toBe(true);
      expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([pPricey.id, pCheap.id, pOut.id]);
      expect(res.body.items[0]).toMatchObject({ listPrice: '9876.54', price: '8888.89', discountPercent: '10.00', stock: 'in_stock' });
      const asc = await d.agent.get('/api/catalog/products').query({ q: run, sort: 'price_asc' }).expect(200);
      expect(asc.body.items.map((i: { id: string }) => i.id)).toEqual([pOut.id, pCheap.id, pPricey.id]);
      const inStock = await d.agent.get('/api/catalog/products').query({ q: run, stock: 'in_stock' }).expect(200);
      expect(inStock.body.total).toBe(2);
    });

    it('banner ve grup uçları oturumsuz açık', async () => {
      await request(server()).get('/api/catalog/banners').expect(200);
      const groups = await request(server()).get('/api/catalog/groups').expect(200);
      expect(groups.body.some((g: { id: string }) => g.id === groupA)).toBe(true);
    });

    it('geçersiz oturum çerezi hata vermez, anonim sayılır', async () => {
      const res = await request(server()).get('/api/catalog/products').set('Cookie', 'amisos_session=gecersiz').query({ q: run }).expect(200);
      expect(res.body.priceVisible).toBe(false);
    });

    it('K-74: featured ve new süzgeçleri; isFeatured/isNew alanları', async () => {
      const anon = request(server());
      const featured = await anon.get('/api/catalog/products').query({ q: run, featured: 'true' }).expect(200);
      expect(featured.body.items.map((i: { id: string }) => i.id)).toEqual([pPricey.id]);
      expect(featured.body.items[0].isFeatured).toBe(true);
      const fresh = await anon.get('/api/catalog/products').query({ q: run, new: 'true' }).expect(200);
      expect(fresh.body.total).toBe(3);
      expect(fresh.body.items.every((i: { isNew: boolean }) => i.isNew)).toBe(true);
      await db.update(products).set({ createdAt: new Date(Date.now() - 31 * 86_400_000) }).where(eq(products.id, pOut.id));
      const after = await anon.get('/api/catalog/products').query({ q: run, new: 'true' }).expect(200);
      expect(after.body.items.map((i: { id: string }) => i.id)).not.toContain(pOut.id);
      const detail = await anon.get(`/api/catalog/products/${pOut.id}`).expect(200);
      expect(detail.body.isNew).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('K-70 favoriler', () => {
    it('yetki: anonim 401, Admin 403', async () => {
      await request(server()).get('/api/favorites').expect(401);
      await admin.agent.get('/api/favorites').expect(403);
      await request(server()).put(`/api/favorites/${pCheap.id}`).expect(401);
    });

    it('ekle (idempotent), listele (en son eklenen önce), isFavorite, sil (idempotent), 404', async () => {
      const d = await dealerAgent('fav');
      await d.agent.put(`/api/favorites/${pCheap.id}`).expect(204);
      await d.agent.put(`/api/favorites/${pCheap.id}`).expect(204);
      await d.agent.put(`/api/favorites/${pPricey.id}`).expect(204);
      const list = await d.agent.get('/api/favorites').expect(200);
      expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([pPricey.id, pCheap.id]);
      expect(list.body.items[0]).toMatchObject({ isFavorite: true, price: '9876.54' });
      const catalog = await d.agent.get('/api/catalog/products').query({ q: run }).expect(200);
      const flags = Object.fromEntries(catalog.body.items.map((i: { id: string; isFavorite: boolean }) => [i.id, i.isFavorite]));
      expect(flags).toEqual({ [pCheap.id]: true, [pPricey.id]: true, [pOut.id]: false });
      await d.agent.put(`/api/favorites/${randomUUID()}`).expect(404);
      // pasif ürün: listelenmez, eklenemez
      await admin.agent.patch(`/api/admin/products/${pPricey.id}`).send({ isActive: false }).expect(200);
      expect((await d.agent.get('/api/favorites').expect(200)).body.items.map((i: { id: string }) => i.id)).toEqual([pCheap.id]);
      await d.agent.put(`/api/favorites/${pPricey.id}`).expect(404);
      await admin.agent.patch(`/api/admin/products/${pPricey.id}`).send({ isActive: true }).expect(200);
      await d.agent.delete(`/api/favorites/${pCheap.id}`).expect(204);
      await d.agent.delete(`/api/favorites/${pCheap.id}`).expect(204);
      expect((await d.agent.get('/api/favorites').expect(200)).body.items.map((i: { id: string }) => i.id)).toEqual([pPricey.id]);
    });
  });

  // -------------------------------------------------------------------------
  describe('K-71 hızlı sipariş', () => {
    it('yetki', async () => {
      await request(server()).post('/api/cart/quick-add').send({ lines: [{ query: 'x', quantity: 1 }] }).expect(401);
      await admin.agent.post('/api/cart/quick-add').send({ lines: [{ query: 'x', quantity: 1 }] }).expect(403);
    });

    it('barkod/kod eşleşmesi, koli katına yukarı yuvarlama, aynı ürün toplanır, kısmi başarı, sepete eklenir', async () => {
      const d = await dealerAgent('hizli');
      await admin.agent.patch(`/api/admin/products/${pOut.id}`).send({ isActive: true }).expect(200);
      const inactive = await createProduct(groupA, 'pasif', { isActive: false });
      const res = await d.agent
        .post('/api/cart/quick-add')
        .send({
          lines: [
            { query: ` ${pCheap.barcode} `, quantity: 5 }, // 0: koli 6 -> 6
            { query: `kod-${run}-u`.toUpperCase(), quantity: 3 }, // 1: kod, büyük/küçük harf duyarsız; toplam 8 -> 12
            { query: 'yok-boyle-bir-sey', quantity: 1 }, // 2
            { query: inactive.barcode, quantity: 6 }, // 3
            { query: pOut.barcode, quantity: 0 }, // 4
            { query: pOut.barcode, quantity: 1.5 }, // 5
            { query: pOut.barcode, quantity: 4 }, // 6: stoksuz, eklenir
            { query: '', quantity: 1 }, // 7
          ],
        })
        .expect(200);
      expect(res.body.added).toEqual([
        { index: 0, productId: pCheap.id, name: `Ucuz Ürün ${run}`, barcode: pCheap.barcode, requested: 8, quantity: 12, caseQuantity: 6, outOfStock: false },
        { index: 6, productId: pOut.id, name: `Stoksuz Ürün ${run}`, barcode: pOut.barcode, requested: 4, quantity: 4, caseQuantity: 4, outOfStock: true },
      ]);
      expect(res.body.errors).toEqual([
        { index: 2, query: 'yok-boyle-bir-sey', code: 'NOT_FOUND' },
        { index: 3, query: inactive.barcode, code: 'INACTIVE' },
        { index: 4, query: pOut.barcode, code: 'INVALID_QUANTITY' },
        { index: 5, query: pOut.barcode, code: 'INVALID_QUANTITY' },
        { index: 7, query: '', code: 'NOT_FOUND' },
      ]);
      expect(res.body.cart.lines).toHaveLength(2);
      // Sepette varsa adet eklenir.
      const again = await d.agent.post('/api/cart/quick-add').send({ lines: [{ query: pCheap.barcode, quantity: 6 }] }).expect(200);
      expect(again.body.cart.lines.find((l: { productId: string }) => l.productId === pCheap.id).quantity).toBe(18);
      await d.agent.post('/api/cart/quick-add').send({ lines: [] }).expect(400);
      await d.agent.post('/api/cart/quick-add').send({ lines: Array.from({ length: 201 }, () => ({ query: 'a', quantity: 1 })) }).expect(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('K-72 Excel', () => {
    const binary = (res: request.Response, done: (b: Buffer) => void) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(Buffer.concat(chunks)));
    };
    const download = async (agent: Agent, url: string) => {
      const res = await agent.get(url).buffer(true).parse((r, cb) => binary(r as unknown as request.Response, (b) => cb(null, b)));
      return res;
    };

    it('fiyat listesi: yalnızca bayi; başlık satırları, iskontolu fiyat, Var/Yok', async () => {
      await request(server()).get('/api/catalog/price-list.xlsx').expect(401);
      const d = await dealerAgent('xlsx', { generalDiscountPercent: '10.00' });
      const res = await download(d.agent, '/api/catalog/price-list.xlsx');
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/filename="fiyat-listesi-\d{4}-\d{2}-\d{2}\.xlsx"/);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as Buffer);
      const ws = wb.worksheets[0];
      expect(ws.getRow(1).getCell(1).value).toBe('AMİSOS B2B Fiyat Listesi');
      expect(ws.getRow(2).getCell(1).value).toBe(`Bayi xlsx ${run}`);
      expect(JSON.stringify(ws.getRow(4).getCell(1).value)).toContain('KDV hariç');
      const header = (ws.getRow(6).values as unknown[]).slice(1);
      expect(header).toEqual(['Barkod', 'Ürün kodu', 'Ürün adı', 'Grup', 'Koli içi', 'Liste fiyatı', 'İskonto %', 'Size özel birim fiyat (KDV hariç)', 'KDV %', 'Stok']);
      let found: ExcelJS.Row | undefined;
      ws.eachRow((row) => {
        if (row.getCell(1).value === pPricey.barcode) found = row;
      });
      expect(found?.getCell(8).value).toBe(8888.89);
      expect(found?.getCell(10).value).toBe('Var');
      expect(found?.getCell(1).numFmt).toBe('@');
    });

    it('bayi sipariş Excel: kendi siparişi; başkasınınki 404; anonim 401', async () => {
      const d = await dealerAgent('siparis-x');
      const other = await dealerAgent('siparis-y');
      await d.agent.post('/api/cart/quick-add').send({ lines: [{ query: pCheap.barcode, quantity: 6 }] }).expect(200);
      const cart = (await d.agent.get('/api/cart').expect(200)).body;
      const order = await d.agent
        .post('/api/orders')
        .send({ deliveryMethod: 'pickup', expectedVersion: cart.version, expectedTotal: cart.summary.grandTotal })
        .expect(201);
      const res = await download(d.agent, `/api/orders/${order.body.id}/export.xlsx`);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain(`siparis-${order.body.orderNo}.xlsx`);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as Buffer);
      const text = JSON.stringify(wb.worksheets[0].getSheetValues());
      expect(text).toContain(pCheap.barcode);
      expect(text).not.toMatch(/BizimHesap|transfer/i);
      await other.agent.get(`/api/orders/${order.body.id}/export.xlsx`).expect(404);
      await request(server()).get(`/api/orders/${order.body.id}/export.xlsx`).expect(401);
      // Admin Excel'i bozulmadı.
      const adminRes = await download(admin.agent as Agent, `/api/admin/orders/${order.body.id}/export.xlsx`);
      expect(adminRes.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  describe('K-73 site ayarları', () => {
    it('varsayılanlar: duyuru, iletişim, 5 sayfa; SSS 8–10 soru; KVKK/koşullar taslak notlu', async () => {
      const site = (await request(server()).get('/api/site').expect(200)).body;
      expect(site.announcement).toBe('Toptan satış portalı · Fiyatlar KDV hariçtir');
      expect(site.contact).toMatchObject({ phone: '0552 492 50 58', phoneE164: '+905524925058', email: 'info@amisosb2b.com', city: 'İstanbul', mapUrl: null });
      expect(site.pages.map((p: { slug: string }) => p.slug)).toEqual(['hakkimizda', 'sss', 'teslimat', 'kvkk', 'kullanim-kosullari']);
      const sss = (await request(server()).get('/api/site/pages/sss').expect(200)).body;
      const questions = sss.body.split('\n').filter((l: string) => l.startsWith('## '));
      expect(questions.length).toBeGreaterThanOrEqual(8);
      expect(questions.length).toBeLessThanOrEqual(10);
      for (const slug of ['kvkk', 'kullanim-kosullari']) {
        const page = (await request(server()).get(`/api/site/pages/${slug}`).expect(200)).body;
        expect(page.body).toContain('TASLAK — hukuk onayı bekliyor');
      }
      expect(sss.body).not.toMatch(/<[a-z/][^>]*>/i);
      await request(server()).get('/api/site/pages/yok').expect(404);
    });

    it('admin: yetki, güncelleme, yayından kaldırma, doğrulama', async () => {
      const d = await dealerAgent('site');
      await request(server()).get('/api/admin/site').expect(401);
      await d.agent.get('/api/admin/site').expect(403);
      await d.agent.put('/api/admin/site').send({}).expect(403);
      const current = (await admin.agent.get('/api/admin/site').expect(200)).body;
      expect(current.pages).toHaveLength(5);

      const body = {
        announcement: 'Bayram tatili: 3 gün kapalıyız',
        contact: { ...current.contact, phone: '0532 111 22 33', mapUrl: 'https://maps.example/amisos' },
        pages: [{ slug: 'hakkimizda', title: 'Biz Kimiz', body: 'Yeni metin\n\n- madde', published: true }, { slug: 'sss', title: 'SSS', body: 'x', published: false }],
      };
      const saved = await admin.agent.put('/api/admin/site').send(body).expect(200);
      expect(saved.body.announcement).toBe(body.announcement);
      expect(saved.body.contact.phone).toBe('0532 111 22 33');
      // phoneE164 gövdede (eskisiyle) geldi: korunur; verilmeseydi telefondan türetilirdi.
      const pub = (await request(server()).get('/api/site').expect(200)).body;
      expect(pub.announcement).toBe(body.announcement);
      expect(pub.pages.map((p: { slug: string }) => p.slug)).toEqual(['hakkimizda', 'teslimat', 'kvkk', 'kullanim-kosullari']);
      expect(pub.pages[0].title).toBe('Biz Kimiz');
      await request(server()).get('/api/site/pages/sss').expect(404);
      const page = (await request(server()).get('/api/site/pages/hakkimizda').expect(200)).body;
      expect(page.body).toBe('Yeni metin\n\n- madde');
      expect(typeof page.updatedAt).toBe('string');

      // duyuru null: şerit gizlenir
      await admin.agent.put('/api/admin/site').send({ ...body, announcement: null, pages: [] }).expect(200);
      expect((await request(server()).get('/api/site').expect(200)).body.announcement).toBeNull();

      const bad = (over: Record<string, unknown>) => admin.agent.put('/api/admin/site').send({ ...body, ...over });
      await bad({ pages: [{ slug: 'bilinmeyen', title: 'x', body: 'y', published: true }] }).expect(400);
      await bad({ contact: { ...body.contact, mapUrl: 'http://maps.example' } }).expect(400);
      await bad({ contact: { ...body.contact, email: 'gecersiz' } }).expect(400);
      await bad({ announcement: 'x'.repeat(161) }).expect(400);
      await bad({ pages: [{ slug: 'sss', title: 'x'.repeat(81), body: 'y', published: true }] }).expect(400);
      const audit = await db.select().from(auditLog).where(and(eq(auditLog.action, 'site.updated'), eq(auditLog.actorId, admin.admin.id)));
      expect(audit.length).toBeGreaterThanOrEqual(2);
      await db.delete(siteSettings);
    });
  });

  // -------------------------------------------------------------------------
  describe('K-67 – K-69 bayi hesabı', () => {
    it('yetki', async () => {
      await request(server()).get('/api/account').expect(401);
      await admin.agent.get('/api/account').expect(403);
      await request(server()).get('/api/account/addresses').expect(401);
    });

    it('GET /account: bilgiler ve istatistikler (yıl net toplamı iptal hariç)', async () => {
      const d = await dealerAgent('hesap', { generalDiscountPercent: '10.00', taxOffice: 'Kayseri VD', taxNumber: '1234567890' });
      const empty = (await d.agent.get('/api/account').expect(200)).body;
      expect(empty).toMatchObject({
        companyTitle: `Bayi hesap ${run}`,
        taxOffice: 'Kayseri VD',
        taxNumber: '1234567890',
        generalDiscountPercent: '10.00',
        marketingConsent: false,
        stats: { orderCount: 0, openOrderCount: 0, yearNetTotal: '0.00', lastOrderAt: null },
      });
      expect(empty).not.toHaveProperty('passwordHash');
      const place = async (barcode: string) => {
        await d.agent.post('/api/cart/quick-add').send({ lines: [{ query: barcode, quantity: 6 }] }).expect(200);
        const cart = (await d.agent.get('/api/cart').expect(200)).body;
        return (
          await d.agent.post('/api/orders').send({ deliveryMethod: 'pickup', expectedVersion: cart.version, expectedTotal: cart.summary.grandTotal }).expect(201)
        ).body as { id: string };
      };
      const o1 = await place(pCheap.barcode); // 6 x 1111.10 = 6666.60
      const o2 = await place(pCheap.barcode);
      await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, o2.id));
      const [oldOrder] = await db.select().from(orders).where(eq(orders.id, o1.id));
      const stats = (await d.agent.get('/api/account').expect(200)).body.stats;
      expect(stats).toMatchObject({ orderCount: 2, openOrderCount: 1, yearNetTotal: oldOrder.netTotal });
      expect(stats.yearNetTotal).toBe('6666.60');
      expect(new Date(stats.lastOrderAt).getTime()).toBeGreaterThan(0);
      // Geçen yıla ait sipariş yıl toplamına girmez.
      await db.update(orders).set({ submittedAt: new Date('2020-06-01T10:00:00Z') }).where(eq(orders.id, o1.id));
      expect((await d.agent.get('/api/account').expect(200)).body.stats.yearNetTotal).toBe('0.00');
    });

    it('PATCH /account: kısmi güncelleme, audit eski→yeni; unvan/e-posta 400; doğrulamalar', async () => {
      const d = await dealerAgent('patch');
      const res = await d.agent
        .patch('/api/account')
        .send({ contactName: 'Mehmet Yılmaz', phone: '0 (532) 111 22 33', taxOffice: 'Melikgazi VD', taxNumber: '12345678901' })
        .expect(200);
      expect(res.body).toMatchObject({ contactName: 'Mehmet Yılmaz', phone: '05321112233', taxOffice: 'Melikgazi VD', taxNumber: '12345678901' });
      const [log] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'dealer.profile_updated'), eq(auditLog.entityId, d.dealer.id)));
      expect((log.data as { changes: Record<string, unknown> }).changes.contactName).toEqual({ previous: 'Ayşe', next: 'Mehmet Yılmaz' });
      await d.agent.patch('/api/account').send({ taxOffice: null, taxNumber: null }).expect(200);
      expect((await d.agent.get('/api/account').expect(200)).body.taxNumber).toBeNull();
      await d.agent.patch('/api/account').send({ companyTitle: 'Başka Ünvan' }).expect(400);
      await d.agent.patch('/api/account').send({ email: 'baska@test.example' }).expect(400);
      await d.agent.patch('/api/account').send({ taxNumber: '123' }).expect(400);
      await d.agent.patch('/api/account').send({ contactName: 'A' }).expect(400);
      await d.agent.patch('/api/account').send({ phone: '123' }).expect(400);
      await d.agent.patch('/api/account').send({ address: 'x'.repeat(501) }).expect(400);
      const [after] = await db.select().from(dealers).where(eq(dealers.id, d.dealer.id));
      expect(after.companyTitle).toBe(d.dealer.companyTitle);
    });

    it('şifre değiştirme: yanlış şifre 400 WRONG_PASSWORD; başarıda diğer oturumlar kapanır, bu oturum kalır', async () => {
      const d = await dealerAgent('sifre');
      const other = await login(d.dealer.email);
      const wrong = await d.agent.post('/api/account/password').send({ currentPassword: 'Yanlis-123', newPassword: NEW_PASSWORD }).expect(400);
      expect(wrong.body.code).toBe('WRONG_PASSWORD');
      await d.agent.post('/api/account/password').send({ currentPassword: PASSWORD, newPassword: 'zayif' }).expect(400);
      await d.agent.post('/api/account/password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(204);
      await other.get('/api/account').expect(401);
      await d.agent.get('/api/account').expect(200);
      await request(server()).post('/api/auth/dealer/login').send({ email: d.dealer.email, password: PASSWORD }).expect(401);
      await login(d.dealer.email, NEW_PASSWORD);
      const logs = await db.select().from(auditLog).where(and(eq(auditLog.action, 'dealer.password_changed'), eq(auditLog.entityId, d.dealer.id)));
      expect(logs).toHaveLength(1);
      expect(JSON.stringify(logs[0])).not.toContain(NEW_PASSWORD);
    });

    it('diğer oturumları kapat', async () => {
      const d = await dealerAgent('revoke');
      const other = await login(d.dealer.email);
      await d.agent.post('/api/account/sessions/revoke-others').expect(204);
      await other.get('/api/account').expect(401);
      await d.agent.get('/api/account').expect(200);
    });

    it('pazarlama onayı: yeni consents satırı, hesapta güncel değer', async () => {
      const d = await dealerAgent('pazarlama');
      await d.agent.put('/api/account/marketing-consent').send({ granted: true }).expect(204);
      expect((await d.agent.get('/api/account').expect(200)).body.marketingConsent).toBe(true);
      await d.agent.put('/api/account/marketing-consent').send({ granted: false }).expect(204);
      expect((await d.agent.get('/api/account').expect(200)).body.marketingConsent).toBe(false);
      const rows = await db.select().from(consents).where(and(eq(consents.dealerId, d.dealer.id), eq(consents.type, 'marketing'))).orderBy(desc(consents.createdAt));
      expect(rows.map((r) => r.granted)).toEqual([false, true]);
      await d.agent.put('/api/account/marketing-consent').send({ granted: 'evet' }).expect(400);
    });

    it('kayıtlı adresler: ilk otomatik varsayılan, tek varsayılan, sıralama, silince devir, 404, limit 409', async () => {
      const d = await dealerAgent('adres');
      const other = await dealerAgent('adres2');
      const body = (label: string, over: Record<string, unknown> = {}) => ({
        label, carrierName: 'Yurtiçi Ambar', carrierBranch: 'Kayseri', address: 'Sanayi Cd. 5', city: 'Kayseri', district: 'Melikgazi', ...over,
      });
      const a1 = (await d.agent.post('/api/account/addresses').send(body('Depo')).expect(201)).body;
      expect(a1).toMatchObject({ label: 'Depo', isDefault: true, carrierName: 'Yurtiçi Ambar' });
      const a2 = (await d.agent.post('/api/account/addresses').send(body('Mağaza')).expect(201)).body;
      expect(a2.isDefault).toBe(false);
      const a3 = (await d.agent.post('/api/account/addresses').send(body('Yeni', { isDefault: true })).expect(201)).body;
      let list = (await d.agent.get('/api/account/addresses').expect(200)).body;
      expect(list.map((a: { id: string }) => a.id)).toEqual([a3.id, a2.id, a1.id]);
      expect(list.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);
      const patched = (await d.agent.patch(`/api/account/addresses/${a1.id}`).send({ isDefault: true, address: 'Yeni adres' }).expect(200)).body;
      expect(patched).toMatchObject({ isDefault: true, address: 'Yeni adres' });
      list = (await d.agent.get('/api/account/addresses').expect(200)).body;
      expect(list[0].id).toBe(a1.id);
      expect(list.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);
      await other.agent.patch(`/api/account/addresses/${a1.id}`).send({ label: 'x' }).expect(404);
      await other.agent.delete(`/api/account/addresses/${a1.id}`).expect(404);
      await d.agent.delete(`/api/account/addresses/${a1.id}`).expect(204);
      list = (await d.agent.get('/api/account/addresses').expect(200)).body;
      expect(list).toHaveLength(2);
      expect(list.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);
      await d.agent.post('/api/account/addresses').send({ label: '' , address: 'x' }).expect(400);
      await d.agent.post('/api/account/addresses').send(body('x'.repeat(61))).expect(400);
      for (let i = list.length; i < 20; i++) await d.agent.post('/api/account/addresses').send(body(`A${i}`)).expect(201);
      const full = await d.agent.post('/api/account/addresses').send(body('Fazla')).expect(409);
      expect(full.body.code).toBe('ADDRESS_LIMIT');
    });
  });

  // -------------------------------------------------------------------------
  describe('K-75 admin araçları', () => {
    it('bayi düzenleme: yetki, güncelleme + tax alanları, tekillik 409, audit', async () => {
      const d = await dealerAgent('duzenle');
      const e = await newDealer('duzenle2');
      await d.agent.patch(`/api/admin/dealers/${d.dealer.id}`).send({ city: 'X' }).expect(403);
      await request(server()).patch(`/api/admin/dealers/${d.dealer.id}`).send({}).expect(401);
      const res = await admin.agent
        .patch(`/api/admin/dealers/${d.dealer.id}`)
        .send({ companyTitle: `Yeni Ünvan ${run}`, city: 'İstanbul', taxOffice: 'Kadıköy VD', taxNumber: '1234567890', email: `yeni-${run}@test.example` })
        .expect(200);
      expect(res.body).toMatchObject({ companyTitle: `Yeni Ünvan ${run}`, city: 'İstanbul', taxOffice: 'Kadıköy VD', taxNumber: '1234567890', email: `yeni-${run}@test.example` });
      expect((await admin.agent.get(`/api/admin/dealers/${d.dealer.id}`).expect(200)).body.taxNumber).toBe('1234567890');
      const dupEmail = await admin.agent.patch(`/api/admin/dealers/${d.dealer.id}`).send({ email: e.email.toUpperCase() }).expect(409);
      expect(dupEmail.body.code).toBe('DUPLICATE_EMAIL');
      const dupCo = await admin.agent.patch(`/api/admin/dealers/${d.dealer.id}`).send({ companyTitle: ` ${e.companyTitle.toLocaleUpperCase('tr')} ` }).expect(409);
      expect(dupCo.body.code).toBe('DUPLICATE_COMPANY');
      await admin.agent.patch(`/api/admin/dealers/${d.dealer.id}`).send({ taxNumber: 'abc' }).expect(400);
      await admin.agent.patch(`/api/admin/dealers/${randomUUID()}`).send({ city: 'X' }).expect(404);
      const logs = await db.select().from(auditLog).where(and(eq(auditLog.action, 'dealer.updated'), eq(auditLog.entityId, d.dealer.id)));
      expect(logs).toHaveLength(1);
    });

    it('bayi notları: yalnızca Admin; ekle, en yeni önce, sil, 404', async () => {
      const d = await dealerAgent('notlar');
      await d.agent.get(`/api/admin/dealers/${d.dealer.id}/notes`).expect(403);
      await request(server()).get(`/api/admin/dealers/${d.dealer.id}/notes`).expect(401);
      const n1 = (await admin.agent.post(`/api/admin/dealers/${d.dealer.id}/notes`).send({ body: 'İlk not' }).expect(201)).body;
      expect(n1).toMatchObject({ body: 'İlk not', createdBy: { id: admin.admin.id, fullName: 'Admin Test' } });
      const n2 = (await admin.agent.post(`/api/admin/dealers/${d.dealer.id}/notes`).send({ body: 'İkinci not' }).expect(201)).body;
      const list = (await admin.agent.get(`/api/admin/dealers/${d.dealer.id}/notes`).expect(200)).body;
      expect(list.map((n: { id: string }) => n.id)).toEqual([n2.id, n1.id]);
      await admin.agent.post(`/api/admin/dealers/${d.dealer.id}/notes`).send({ body: '   ' }).expect(400);
      await admin.agent.post(`/api/admin/dealers/${d.dealer.id}/notes`).send({ body: 'x'.repeat(2001) }).expect(400);
      // Notlar bayiye hiçbir yoldan dönmez.
      expect(JSON.stringify((await d.agent.get('/api/account').expect(200)).body)).not.toContain('İlk not');
      await admin.agent.delete(`/api/admin/dealers/${d.dealer.id}/notes/${randomUUID()}`).expect(404);
      await admin.agent.delete(`/api/admin/dealers/${d.dealer.id}/notes/${n1.id}`).expect(204);
      expect((await admin.agent.get(`/api/admin/dealers/${d.dealer.id}/notes`).expect(200)).body).toHaveLength(1);
      await admin.agent.get(`/api/admin/dealers/${randomUUID()}/notes`).expect(404);
    });

    it('ürün isFeatured + featured süzgeci + toplu işlem', async () => {
      const p1 = await createProduct(groupA, 'bulk1');
      const p2 = await createProduct(groupA, 'bulk2');
      expect((await admin.agent.get(`/api/admin/products/${p1.id}`).expect(200)).body.isFeatured).toBe(false);
      const patched = await admin.agent.patch(`/api/admin/products/${p1.id}`).send({ isFeatured: true }).expect(200);
      expect(patched.body.isFeatured).toBe(true);
      const featuredList = await admin.agent.get('/api/admin/products').query({ q: run, featured: 'true' }).expect(200);
      expect(featuredList.body.items.map((i: { id: string }) => i.id).sort()).toEqual([p1.id, pPricey.id].sort());

      const unknown = randomUUID();
      const call = (b: Record<string, unknown>) => admin.agent.post('/api/admin/products/bulk').send(b);
      expect((await call({ ids: [p1.id, p2.id, unknown], action: 'out_of_stock' }).expect(200)).body).toEqual({ updated: 2 });
      const [row] = await db.select().from(products).where(eq(products.id, p2.id));
      expect(row).toMatchObject({ stockStatus: 'out_of_stock', stockSource: 'manual' });
      expect(row.stockUpdatedAt).not.toBeNull();
      await call({ ids: [p1.id, p2.id], action: 'in_stock' }).expect(200);
      await call({ ids: [p1.id, p2.id], action: 'deactivate' }).expect(200);
      expect((await db.select().from(products).where(eq(products.id, p1.id)))[0].isActive).toBe(false);
      await call({ ids: [p1.id, p2.id], action: 'activate' }).expect(200);
      await call({ ids: [p1.id], action: 'unfeature' }).expect(200);
      await call({ ids: [p2.id], action: 'feature' }).expect(200);
      expect((await db.select().from(products).where(eq(products.id, p2.id)))[0].isFeatured).toBe(true);
      await call({ ids: [p1.id, p2.id], action: 'set_group', groupId: groupB }).expect(200);
      expect((await db.select().from(products).where(eq(products.id, p1.id)))[0].groupId).toBe(groupB);
      await call({ ids: [p1.id], action: 'set_group' }).expect(400);
      await call({ ids: [p1.id], action: 'set_group', groupId: randomUUID() }).expect(400);
      await admin.agent.patch(`/api/admin/product-groups/${groupB}`).send({ isActive: false }).expect(200);
      await call({ ids: [p1.id], action: 'set_group', groupId: groupB }).expect(400);
      await admin.agent.patch(`/api/admin/product-groups/${groupB}`).send({ isActive: true }).expect(200);
      await call({ ids: [], action: 'activate' }).expect(400);
      await call({ ids: Array.from({ length: 501 }, () => randomUUID()), action: 'activate' }).expect(400);
      await call({ ids: [p1.id], action: 'sil' }).expect(400);
      const d = await dealerAgent('bulk');
      await d.agent.post('/api/admin/products/bulk').send({ ids: [p1.id], action: 'activate' }).expect(403);
      const bulkLogs = await db.select().from(auditLog).where(and(eq(auditLog.action, 'product.bulk'), eq(auditLog.actorId, admin.admin.id)));
      expect(bulkLogs.length).toBeGreaterThanOrEqual(7);
      expect((bulkLogs[0].data as { ids: string[] }).ids).toBeDefined();
    });

    it('işlem geçmişi: yetki, etiketler, varlık etiketi, süzgeçler, sayfalama', async () => {
      const d = await dealerAgent('audit');
      await request(server()).get('/api/admin/audit').expect(401);
      await d.agent.get('/api/admin/audit').expect(403);
      await d.agent.patch('/api/account').send({ city: 'Ankara' }).expect(200);
      await admin.agent.post(`/api/admin/dealers/${d.dealer.id}/deactivate`).send({ reason: 'deneme' }).expect(204);
      await db.insert(auditLog).values({ actorType: 'system', action: 'baska.eylem', entityType: 'x', entityId: `ent-${run}` });

      const res = (await admin.agent.get('/api/admin/audit').query({ q: d.dealer.id }).expect(200)).body;
      expect(res.total).toBe(2);
      expect(res.items.map((i: { action: string }) => i.action)).toEqual(['dealer.deactivated', 'dealer.profile_updated']);
      expect(res.items[0]).toMatchObject({
        actionLabel: 'Bayi pasife alındı',
        entityType: 'dealers',
        entityLabel: d.dealer.companyTitle,
        reason: 'deneme',
        actor: { type: 'admin', id: admin.admin.id, name: 'Admin Test' },
      });
      expect(res.items[1].actor).toEqual({ type: 'dealer', id: d.dealer.id, name: d.dealer.companyTitle });
      const sys = (await admin.agent.get('/api/admin/audit').query({ q: `ent-${run}` }).expect(200)).body.items[0];
      expect(sys).toMatchObject({ actionLabel: 'baska.eylem', entityLabel: null, actor: { type: 'system', id: null, name: null } });

      const onlyDealer = await admin.agent.get('/api/admin/audit').query({ q: d.dealer.id, actorType: 'dealer' }).expect(200);
      expect(onlyDealer.body.total).toBe(1);
      const byType = await admin.agent.get('/api/admin/audit').query({ q: d.dealer.id, entityType: 'orders' }).expect(200);
      expect(byType.body.total).toBe(0);
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date());
      const inRange = await admin.agent.get('/api/admin/audit').query({ q: d.dealer.id, from: today, to: today }).expect(200);
      expect(inRange.body.total).toBe(2);
      const past = await admin.agent.get('/api/admin/audit').query({ q: d.dealer.id, to: '2020-01-01' }).expect(200);
      expect(past.body.total).toBe(0);
      const paged = await admin.agent.get('/api/admin/audit').query({ q: d.dealer.id, pageSize: 1, page: 2 }).expect(200);
      expect(paged.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
      expect(paged.body.items).toHaveLength(1);
      await admin.agent.get('/api/admin/audit').query({ pageSize: 101 }).expect(400);
      await admin.agent.get('/api/admin/audit').query({ from: '2020-13-45' }).expect(400);
    });

    it('admin hesabı: bilgi, ad güncelleme, şifre değiştirme (WRONG_PASSWORD, diğer oturumlar kapanır)', async () => {
      const a = await adminAgent('hesap');
      const second = request.agent(server());
      await second.post('/api/auth/admin/login').send({ email: a.admin.email, password: PASSWORD }).expect(200);
      await request(server()).get('/api/admin/account').expect(401);
      const dealer = await dealerAgent('adminhesap');
      await dealer.agent.get('/api/admin/account').expect(403);
      const info = (await a.agent.get('/api/admin/account').expect(200)).body;
      expect(info).toMatchObject({ id: a.admin.id, email: a.admin.email, fullName: 'Admin Test' });
      expect(info.lastLoginAt).not.toBeNull();
      expect(info).not.toHaveProperty('passwordHash');
      expect((await a.agent.patch('/api/admin/account').send({ fullName: 'Yeni Ad' }).expect(200)).body.fullName).toBe('Yeni Ad');
      await a.agent.patch('/api/admin/account').send({ fullName: 'A' }).expect(400);
      const wrong = await a.agent.post('/api/admin/account/password').send({ currentPassword: 'Yanlis-123', newPassword: NEW_PASSWORD }).expect(400);
      expect(wrong.body.code).toBe('WRONG_PASSWORD');
      await a.agent.post('/api/admin/account/password').send({ currentPassword: PASSWORD, newPassword: 'kisa' }).expect(400);
      await a.agent.post('/api/admin/account/password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(204);
      await second.get('/api/admin/account').expect(401);
      await a.agent.get('/api/admin/account').expect(200);
      await request(server()).post('/api/auth/admin/login').send({ email: a.admin.email, password: NEW_PASSWORD }).expect(200);
    });
  });
});
