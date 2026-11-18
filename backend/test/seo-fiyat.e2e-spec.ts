// K-79 – K-82 (e2e): fiyatı girilmemiş ürün, BizimHesap ID, slug/yönlendirme, site SEO, sitemap/robots, meta enjeksiyonu.
// API: docs/api/seo-fiyat-api.md
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq, gte, inArray, like, or } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module.js';
import { applyPublicSeo } from '../src/seo/frontend.js';
import { DB, type Database } from '../src/database/database.module.js';
import {
  adminUsers,
  auditLog,
  cartItems,
  dealers,
  media,
  notificationOutbox,
  orders,
  productGroups,
  productImages,
  productSlugRedirects,
  products,
  sessions,
  siteSettings,
} from '../src/database/schema.js';
import { companyTitleKey } from '../src/dealers/company-title.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);
const bc = (n: number | string) => `S${run}-${n}`;
const INDEX_HTML = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="eski varsayılan" />
    <title>ESKI BASLIK</title>
  </head>
  <body><div id="root"></div></body>
</html>
`;

describe('SEO, fiyat sorunuz ve BizimHesap ID (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let frontendDir: string;
  const adminIds: string[] = [];
  const dealerIds: string[] = [];
  const mediaIds: string[] = [];
  const server = () => app.getHttpServer();
  const mail = {
    sendOrderConfirmation: vi.fn().mockResolvedValue(undefined),
    sendNewOrderToTeam: vi.fn().mockResolvedValue(undefined),
  };
  const startedAt = new Date(Date.now() - 1000);
  let admin: ReturnType<typeof request.agent>;
  let groupId: string;
  let seq = 0;

  async function adminAgent() {
    const [a] = await db
      .insert(adminUsers)
      .values({ email: `admin${adminIds.length}-${run}@test.example`, fullName: 'Admin Test', passwordHash: await hash(PASSWORD) })
      .returning();
    adminIds.push(a.id);
    const agent = request.agent(server());
    await agent.post('/api/auth/admin/login').send({ email: a.email, password: PASSWORD }).expect(200);
    return agent;
  }

  async function dealerAgent(name: string) {
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
        address: 'Adres',
        source: 'invitation',
        status: 'active',
        passwordHash: await hash(PASSWORD),
        emailVerifiedAt: new Date(),
      })
      .returning();
    dealerIds.push(d.id);
    const agent = request.agent(server());
    await agent.post('/api/auth/dealer/login').send({ email: d.email, password: PASSWORD }).expect(200);
    return { agent, dealer: d };
  }

  const createGroup = async (name: string, extra: Record<string, unknown> = {}) =>
    (await admin.post('/api/admin/product-groups').send({ name: `${name} ${run}`, ...extra }).expect(201)).body as {
      id: string;
      slug: string;
    };

  const createProduct = async (over: Record<string, unknown> = {}) => {
    seq += 1;
    return (
      await admin
        .post('/api/admin/products')
        .send({ groupId, barcode: bc(seq), name: `Ürün ${seq} ${run}`, caseQuantity: 6, listPrice: '48.90', vatRate: '20', ...over })
        .expect(201)
    ).body as Record<string, any>;
  };

  const putSeo = async (seo: Record<string, unknown>) => {
    const current = (await admin.get('/api/admin/site').expect(200)).body;
    return admin.put('/api/admin/site').send({
      announcement: current.announcement,
      contact: current.contact,
      pages: current.pages.map(({ slug, title, body, published }: any) => ({ slug, title, body, published })),
      seo,
    });
  };

  beforeAll(async () => {
    frontendDir = await mkdtemp(join(tmpdir(), 'amisos-fe-'));
    await writeFile(join(frontendDir, 'index.html'), INDEX_HTML);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MAIL_SERVICE).useValue(mail).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    applyPublicSeo(app, frontendDir);
    await app.init();
    db = app.get<Database>(DB);
    await db.delete(siteSettings).where(eq(siteSettings.key, 'seo'));
    admin = await adminAgent();
    groupId = (await createGroup('Seo Mutfak')).id;
  });

  afterAll(async () => {
    // Sipariş sonrası arka plan e-posta gönderimi (dispatchSoon) bitsin; sonraki test dosyalarını etkilemesin.
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (db) {
      await db.delete(siteSettings).where(eq(siteSettings.key, 'seo'));
      const prodIds = (await db.select({ id: products.id }).from(products).where(like(products.barcode, `%${run}%`))).map((p) => p.id);
      const groupIds = (await db.select({ id: productGroups.id }).from(productGroups).where(like(productGroups.name, `%${run}%`))).map((g) => g.id);
      const entityIds = [...adminIds, ...dealerIds, ...prodIds, ...groupIds];
      if (entityIds.length) await db.delete(auditLog).where(or(inArray(auditLog.actorId, entityIds), inArray(auditLog.entityId, entityIds)));
      await db.delete(sessions).where(inArray(sessions.subjectId, [...adminIds, ...dealerIds]));
      if (dealerIds.length) {
        await db.delete(notificationOutbox).where(gte(notificationOutbox.createdAt, startedAt));
        await db.delete(cartItems).where(inArray(cartItems.dealerId, dealerIds));
        await db.delete(orders).where(inArray(orders.dealerId, dealerIds));
      }
      if (prodIds.length) {
        await db.delete(productImages).where(inArray(productImages.productId, prodIds));
        await db.delete(products).where(inArray(products.id, prodIds)); // yönlendirmeler cascade
      }
      if (groupIds.length) await db.delete(productGroups).where(inArray(productGroups.id, groupIds));
      if (mediaIds.length) await db.delete(media).where(inArray(media.id, mediaIds));
      if (dealerIds.length) await db.delete(dealers).where(inArray(dealers.id, dealerIds));
      await db.delete(adminUsers).where(inArray(adminUsers.id, adminIds));
    }
    await app?.close();
    if (frontendDir) await rm(frontendDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  describe('K-79: fiyatı girilmemiş ürün (PRICE_NOT_SET)', () => {
    it('katalogda priceOnRequest oturumsuzda da döner; bayide fiyat "0.00"', async () => {
      const free = await createProduct({ listPrice: '0' });
      const paid = await createProduct();
      const anon = (await request(server()).get(`/api/catalog/products/${free.id}`).expect(200)).body;
      expect(anon).toMatchObject({ priceOnRequest: true, price: null, listPrice: null });
      expect((await request(server()).get(`/api/catalog/products/${paid.id}`).expect(200)).body.priceOnRequest).toBe(false);
      const { agent } = await dealerAgent('pn-katalog');
      const d = (await agent.get(`/api/catalog/products/${free.id}`).expect(200)).body;
      expect(d).toMatchObject({ priceOnRequest: true, price: '0.00', listPrice: '0.00' });
      const list = (await agent.get(`/api/catalog/products?groupId=${groupId}&sort=price_asc&pageSize=100`).expect(200)).body;
      const ids = list.items.map((i: any) => i.id);
      expect(ids.indexOf(free.id)).toBeGreaterThan(ids.indexOf(paid.id)); // fiyatsızlar sona
    });

    it('sepete ekleme 409 PRICE_NOT_SET; miktar 0 (kaldırma) serbest', async () => {
      const free = await createProduct({ listPrice: '0.00' });
      const { agent } = await dealerAgent('pn-sepet');
      const res = await agent.put(`/api/cart/items/${free.id}`).send({ quantity: 6 }).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, code: 'PRICE_NOT_SET', productId: free.id });
      await agent.put(`/api/cart/items/${free.id}`).send({ quantity: 0 }).expect(200);
    });

    it('hızlı sipariş: satır hatası PRICE_NOT_SET, diğer satırlar eklenir', async () => {
      const free = await createProduct({ listPrice: '0' });
      const paid = await createProduct();
      const { agent } = await dealerAgent('pn-hizli');
      const res = await agent
        .post('/api/cart/quick-add')
        .send({ lines: [{ query: free.barcode, quantity: 6 }, { query: paid.barcode, quantity: 6 }] })
        .expect(200);
      expect(res.body.errors).toEqual([{ index: 0, query: free.barcode, code: 'PRICE_NOT_SET' }]);
      expect(res.body.added.map((a: any) => a.productId)).toEqual([paid.id]);
    });

    it('fiyat sonradan 0 yapılırsa sepet satırı priceOnRequest ve gönderim 409 PRICE_NOT_SET; sipariş oluşmaz', async () => {
      const p = await createProduct();
      const { agent, dealer } = await dealerAgent('pn-gonder');
      await agent.put(`/api/cart/items/${p.id}`).send({ quantity: 6 }).expect(200);
      const seen = (await agent.get('/api/cart')).body;
      expect(seen.lines[0].priceOnRequest).toBe(false);
      await admin.patch(`/api/admin/products/${p.id}`).send({ listPrice: '0' }).expect(200);
      const cart = (await agent.get('/api/cart').expect(200)).body;
      expect(cart.lines[0]).toMatchObject({ productId: p.id, priceOnRequest: true });
      const res = await agent
        .post('/api/orders')
        .send({
          deliveryMethod: 'carrier',
          deliveryAddress: 'Teslimat Adresi 5, Talas / Kayseri',
          carrierName: 'Yurtiçi Kargo',
          carrierBranch: 'Kayseri Şube',
          expectedTotal: seen.summary.grandTotal,
          expectedVersion: seen.version,
        })
        .expect(409);
      expect(res.body.code).toBe('PRICE_NOT_SET');
      expect(res.body.products).toEqual([{ productId: p.id, name: p.name }]);
      expect(res.body.cart.lines[0].priceOnRequest).toBe(true);
      const orders = (await agent.get('/api/orders').expect(200)).body;
      expect(orders.total).toBe(0);
      expect(dealer.id).toBeTruthy();
    });

    it('fiyat listesi Excel: fiyat hücreleri boş, Stok yerinde "Fiyat sorunuz"', async () => {
      const free = await createProduct({ listPrice: '0' });
      const { agent } = await dealerAgent('pn-liste');
      const res = await agent
        .get('/api/catalog/price-list.xlsx')
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as Buffer);
      const sheet = wb.worksheets[0];
      let found = false;
      sheet.eachRow((row) => {
        if (row.getCell(1).text === free.barcode) {
          found = true;
          expect(row.getCell(6).value).toBeNull();
          expect(row.getCell(7).value).toBeNull();
          expect(row.getCell(8).value).toBeNull();
          expect(row.getCell(10).text).toBe('Fiyat sorunuz');
        }
      });
      expect(found).toBe(true);
    });

    it('tekrar sipariş fiyatı 0 olan ürünü atlar (PRICE_NOT_SET)', async () => {
      const p = await createProduct();
      const { agent } = await dealerAgent('pn-tekrar');
      await agent.put(`/api/cart/items/${p.id}`).send({ quantity: 6 }).expect(200);
      const cart = (await agent.get('/api/cart')).body;
      const order = (
        await agent
          .post('/api/orders')
          .send({
            deliveryMethod: 'carrier',
            deliveryAddress: 'Teslimat Adresi 5, Talas / Kayseri',
            carrierName: 'Yurtiçi Kargo',
            carrierBranch: 'Kayseri Şube',
            expectedTotal: cart.summary.grandTotal,
            expectedVersion: cart.version,
          })
          .expect(201)
      ).body;
      await admin.patch(`/api/admin/products/${p.id}`).send({ listPrice: '0' }).expect(200);
      const res = await agent.post(`/api/orders/${order.id}/reorder`).expect(200);
      expect(res.body.skipped).toEqual([expect.objectContaining({ productId: p.id, reason: 'PRICE_NOT_SET' })]);
      expect(res.body.added).toEqual([]);
    });

    it('admin priceMissing filtresi ve dashboard attention.priceMissing (yalnızca aktif)', async () => {
      const before = (await admin.get('/api/admin/dashboard').expect(200)).body.attention.priceMissing as number;
      const a = await createProduct({ listPrice: '0' });
      const inactive = await createProduct({ listPrice: '0', isActive: false });
      await createProduct();
      const list = (await admin.get(`/api/admin/products?groupId=${groupId}&priceMissing=true&pageSize=100`).expect(200)).body;
      expect(list.items.map((i: any) => i.id)).toContain(a.id);
      expect(list.items.map((i: any) => i.id)).not.toContain(inactive.id);
      expect(list.items.every((i: any) => i.listPrice === '0.00')).toBe(true);
      const after = (await admin.get('/api/admin/dashboard').expect(200)).body.attention.priceMissing as number;
      expect(after - before).toBe(1);
      expect((await admin.get('/api/admin/products?priceMissing=x').expect(400)).body.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('K-80: BizimHesap ürün ID', () => {
    it('yazılır, tekildir (409), null hariç; dışa aktarma sütunu ve içe aktarma güncellemesi', async () => {
      const a = await createProduct({ bizimhesapId: `BH-${run}-1` });
      expect(a.bizimhesapId).toBe(`BH-${run}-1`);
      const b = await createProduct();
      expect(b.bizimhesapId).toBeNull();
      await createProduct(); // ikinci null serbest
      const dup = await admin.patch(`/api/admin/products/${b.id}`).send({ bizimhesapId: `BH-${run}-1` }).expect(409);
      expect(dup.body.code).toBe('DUPLICATE_BIZIMHESAP_ID');
      const upd = await admin.patch(`/api/admin/products/${b.id}`).send({ bizimhesapId: `BH-${run}-2` }).expect(200);
      expect(upd.body.bizimhesapId).toBe(`BH-${run}-2`);

      // Dışa aktarma sütunu
      const exp = await admin
        .get(`/api/admin/products/export.xlsx?groupId=${groupId}`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(exp.body as Buffer);
      const sheet = wb.worksheets[0];
      const headers = (sheet.getRow(1).values as string[]).slice(1);
      expect(headers.slice(0, 7)).toEqual(['Barkod', 'Kod', 'Ad', 'Grup', 'Koli içi', 'Liste fiyatı', 'KDV %']);
      const col = headers.indexOf('BizimHesap ID') + 1;
      expect(col).toBeGreaterThan(0);
      const values = new Map<string, string>();
      sheet.eachRow((row, n) => {
        if (n > 1) values.set(row.getCell(1).text, row.getCell(col).text);
      });
      expect(values.get(a.barcode)).toBe(`BH-${run}-1`);

      // İçe aktarma: eşleşme barkodla, ID yalnızca yazılır; yeni ürün slug alır.
      const imp = new ExcelJS.Workbook();
      const s = imp.addWorksheet('Ürünler');
      s.addRow(['Barkod', 'Ürün adı', 'Ürün grubu', 'Koli içi adet', 'Liste fiyatı (KDV hariç)', 'BizimHesap ID']);
      s.getColumn(1).numFmt = '@';
      s.addRow([a.barcode, a.name, `Seo Mutfak ${run}`, 6, '48,90', `BH-${run}-9`]);
      s.addRow([bc('yeni-imp'), 'İçe Aktarılan Çay Bardağı', `Seo Mutfak ${run}`, 6, '0', `BH-${run}-10`]);
      const buf = Buffer.from(await imp.xlsx.writeBuffer());
      const r = await admin.post('/api/admin/products/import').attach('file', buf, 'u.xlsx').expect(200);
      expect(r.body).toMatchObject({ created: 1, updated: 1, errors: [] });
      const [updated] = await db.select().from(products).where(eq(products.id, a.id));
      expect(updated.bizimhesapId).toBe(`BH-${run}-9`);
      const [created] = await db.select().from(products).where(eq(products.barcode, bc('yeni-imp')));
      expect(created).toMatchObject({ bizimhesapId: `BH-${run}-10`, slug: expect.stringMatching(/^ice-aktarilan-cay-bardagi/) });

      // Dosyada/DB'de çakışan ID satır hatası
      const bad = new ExcelJS.Workbook();
      const bs = bad.addWorksheet('Ürünler');
      bs.addRow(['Barkod', 'Ürün adı', 'Ürün grubu', 'Koli içi adet', 'Liste fiyatı (KDV hariç)', 'BizimHesap ID']);
      bs.addRow([b.barcode, b.name, `Seo Mutfak ${run}`, 6, '48,90', `BH-${run}-9`]);
      const rb = await admin.post('/api/admin/products/import?dryRun=true').attach('file', Buffer.from(await bad.xlsx.writeBuffer()), 'u.xlsx').expect(200);
      expect(rb.body.errors[0]).toMatchObject({ column: 'BizimHesap ID' });
    });
  });

  // -------------------------------------------------------------------------
  describe('K-82: slug, yönlendirme, by-slug', () => {
    it('slug addan üretilir (Türkçe sadeleşir), çakışmada -2/-3; grup slug da', async () => {
      const a = await createProduct({ name: `Çay Bardağı Şık İnci ${run}` });
      expect(a.slug).toBe(`cay-bardagi-sik-inci-${run}`);
      const b = await createProduct({ name: `ÇAY BARDAĞI ŞIK İNCİ ${run}` });
      expect(b.slug).toBe(`cay-bardagi-sik-inci-${run}-2`);
      const c = await createProduct({ name: `Çay Bardağı Şık İnci ${run}` });
      expect(c.slug).toBe(`cay-bardagi-sik-inci-${run}-3`);
      const g1 = await createGroup('Çanak Çömlek Ğ');
      const g2 = await createGroup('Canak Comlek G');
      expect(g1.slug).toBe(`canak-comlek-g-${run}`);
      expect(g2.slug).toBe(`canak-comlek-g-${run}-2`);
    });

    it('elle verilen slug: biçim doğrulanır, çakışma 409 DUPLICATE_SLUG', async () => {
      const a = await createProduct({ slug: `elle-${run}` });
      expect(a.slug).toBe(`elle-${run}`);
      await admin.post('/api/admin/products').send({ groupId, barcode: bc('x1'), name: 'X', caseQuantity: 1, listPrice: '1', slug: 'Büyük Harf' }).expect(400);
      const dup = await admin.post('/api/admin/products').send({ groupId, barcode: bc('x2'), name: 'X', caseQuantity: 1, listPrice: '1', slug: `elle-${run}` }).expect(409);
      expect(dup.body.code).toBe('DUPLICATE_SLUG');
      const g = await createGroup('Grup Elle');
      const gd = await admin.patch(`/api/admin/product-groups/${g.id}`).send({ slug: g.slug === 'x' ? 'y' : `elle-grup-${run}` }).expect(200);
      expect(gd.body.slug).toBe(`elle-grup-${run}`);
      const g2 = await createGroup('Grup Elle Iki');
      await admin.patch(`/api/admin/product-groups/${g2.id}`).send({ slug: `elle-grup-${run}` }).expect(409);
    });

    it('slug değişince eski adres yönlendirilir; geri alınca yönlendirme silinir; bilinmeyen/pasif 404', async () => {
      const p = await createProduct({ name: `Yönlendirme ${run}` });
      const oldSlug = p.slug as string;
      const upd = await admin.patch(`/api/admin/products/${p.id}`).send({ slug: `yeni-adres-${run}`, seoTitle: 'Başlık', seoDescription: 'Açıklama' }).expect(200);
      expect(upd.body).toMatchObject({ slug: `yeni-adres-${run}`, seoTitle: 'Başlık', seoDescription: 'Açıklama' });
      const old = await request(server()).get(`/api/catalog/products/by-slug/${oldSlug}`).expect(200);
      expect(old.body).toEqual({ redirectTo: `yeni-adres-${run}` });
      const cur = await request(server()).get(`/api/catalog/products/by-slug/yeni-adres-${run}`).expect(200);
      expect(cur.body).toMatchObject({ id: p.id, slug: `yeni-adres-${run}`, priceOnRequest: false, price: null });
      await request(server()).get('/api/catalog/products/by-slug/yok-boyle-bir-urun').expect(404);
      // Eski adres yeni ürün tarafından otomatik alınmaz.
      const q = await createProduct({ name: `Yönlendirme ${run}` });
      expect(q.slug).not.toBe(oldSlug);
      // Geri alma: canlı slug kazanır.
      await admin.patch(`/api/admin/products/${p.id}`).send({ slug: oldSlug }).expect(200);
      expect((await request(server()).get(`/api/catalog/products/by-slug/${oldSlug}`).expect(200)).body.id).toBe(p.id);
      expect((await request(server()).get(`/api/catalog/products/by-slug/yeni-adres-${run}`).expect(200)).body).toEqual({ redirectTo: oldSlug });
      expect(await db.select().from(productSlugRedirects).where(eq(productSlugRedirects.slug, oldSlug))).toHaveLength(0);
      await admin.patch(`/api/admin/products/${p.id}`).send({ isActive: false }).expect(200);
      await request(server()).get(`/api/catalog/products/by-slug/${oldSlug}`).expect(404);
    });

    it('grup by-slug: açıklama ve seo alanları; pasif grup 404', async () => {
      const g = await createGroup('Grup Sayfa', { description: 'Tanıtım metni', seoTitle: 'GT', seoDescription: 'GD' });
      const res = await request(server()).get(`/api/catalog/groups/by-slug/${g.slug}`).expect(200);
      expect(res.body).toMatchObject({ id: g.id, slug: g.slug, description: 'Tanıtım metni', seoTitle: 'GT', seoDescription: 'GD', productCount: 0 });
      expect((await admin.patch(`/api/admin/product-groups/${g.id}`).send({ description: 'x'.repeat(1001) }).expect(400)).body.statusCode).toBe(400);
      await admin.patch(`/api/admin/product-groups/${g.id}`).send({ isActive: false }).expect(200);
      await request(server()).get(`/api/catalog/groups/by-slug/${g.slug}`).expect(404);
    });

    it('migration: tüm mevcut kayıtların slug\'ı dolu ve tekil', async () => {
      const rows = await db.select({ slug: products.slug }).from(products);
      expect(rows.every((r) => r.slug.length > 0)).toBe(true);
      expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
    });

    it('slug verilmeden doğrudan eklenen kayda tetikleyici slug üretir', async () => {
      const [r] = await db
        .insert(products)
        .values({ groupId, barcode: bc('trg'), name: `Tetik Şişe ${run}`, caseQuantity: 1, listPrice: '1', vatRate: '20' })
        .returning();
      expect(r.slug).toBe(`tetik-sise-${run}`);
    });
  });

  // -------------------------------------------------------------------------
  describe('K-82: site SEO ayarları', () => {
    it('varsayılanlar, doğrulamalar ve kısmi güncelleme; GET /api/site seo + ogImageUrl', async () => {
      const def = (await request(server()).get('/api/site').expect(200)).body.seo;
      expect(def).toMatchObject({ indexable: true, titleTemplate: '%s | AMİSOS B2B', googleAnalyticsId: null, ogImageMediaId: null, ogImageUrl: null });
      expect((await putSeo({ titleTemplate: 'şablon' })).status).toBe(400);
      expect((await putSeo({ siteTitle: 'x'.repeat(71) })).status).toBe(400);
      expect((await putSeo({ description: 'x'.repeat(171) })).status).toBe(400);
      expect((await putSeo({ googleAnalyticsId: 'UA-123' })).status).toBe(400);
      expect((await putSeo({ googleSiteVerification: 'x"><script>' })).status).toBe(400);
      expect((await putSeo({ canonicalBaseUrl: 'http://b2b.amisos.com' })).status).toBe(400);
      expect((await putSeo({ canonicalBaseUrl: 'https://b2b.amisos.com/yol' })).status).toBe(400);
      expect((await putSeo({ ogImageMediaId: randomUUID() })).status).toBe(400);
      const [m] = await db.insert(media).values({ storageKey: `seo-${run}`, originalName: 'og.png', mime: 'image/png', size: 1, width: 1, height: 1, uploadedBy: adminIds[0] }).returning();
      mediaIds.push(m.id);
      const ok = await putSeo({ siteTitle: 'Test Site', googleAnalyticsId: 'G-ABCD1234', googleSiteVerification: 'abc_DEF-123', canonicalBaseUrl: 'https://b2b.example.com/', ogImageMediaId: m.id, keywords: 'züccaciye, toptan' }).then((r) => r);
      expect(ok.status).toBe(200);
      expect(ok.body.seo).toMatchObject({ siteTitle: 'Test Site', canonicalBaseUrl: 'https://b2b.example.com', ogImageUrl: `/api/media/${m.id}/large.webp`, indexable: true });
      // Kısmi: verilmeyen alan korunur; null kaldırır.
      const part = await putSeo({ indexable: true, googleAnalyticsId: null });
      expect(part.body.seo).toMatchObject({ siteTitle: 'Test Site', googleAnalyticsId: null, googleSiteVerification: 'abc_DEF-123' });
      expect((await request(server()).get('/api/site').expect(200)).body.seo.ogImageUrl).toBe(`/api/media/${m.id}/large.webp`);
      // Yetki: yalnızca Admin yazar.
      await request(server()).put('/api/admin/site').send({}).expect(401);
    });
  });

  // -------------------------------------------------------------------------
  describe('K-82: sitemap.xml ve robots.txt', () => {
    it('indexable açık: ana sayfa, katalog, aktif grup/ürün, yayımlı sayfalar; pasifler yok; robots Sitemap satırı', async () => {
      await putSeo({ indexable: true, canonicalBaseUrl: 'https://b2b.example.com' }).then((r) => expect(r.status).toBe(200));
      const g = await createGroup('Sitemap Grup');
      const gOff = await createGroup('Sitemap Pasif Grup');
      await admin.patch(`/api/admin/product-groups/${gOff.id}`).send({ isActive: false }).expect(200);
      const p = await createProduct({ name: `Sitemap Ürün ${run}`, groupId: g.id });
      const off = await createProduct({ name: `Sitemap Pasif ${run}`, isActive: false });
      const inOffGroup = await createProduct({ name: `Sitemap Pasif Grupta ${run}`, groupId: gOff.id });
      const res = await request(server()).get('/sitemap.xml').expect(200);
      expect(res.headers['content-type']).toContain('application/xml');
      const xml = res.text;
      for (const loc of ['https://b2b.example.com/', 'https://b2b.example.com/katalog', `https://b2b.example.com/katalog/${g.slug}`, `https://b2b.example.com/urun/${p.slug}`, 'https://b2b.example.com/hakkimizda']) {
        expect(xml).toContain(`<loc>${loc}</loc>`);
      }
      expect(xml).toMatch(new RegExp(`urun/${p.slug}</loc><lastmod>\\d{4}-\\d\\d-\\d\\dT`));
      expect(xml).not.toContain(`/urun/${off.slug}`);
      expect(xml).not.toContain(`/urun/${inOffGroup.slug}`);
      expect(xml).not.toContain(`/katalog/${gOff.slug}`);
      expect(xml).not.toContain('/yonetim');
      const robots = (await request(server()).get('/robots.txt').expect(200)).text;
      expect(robots).toContain('Disallow: /yonetim');
      expect(robots).toContain('Disallow: /api');
      expect(robots).toContain('Sitemap: https://b2b.example.com/sitemap.xml');
      expect(robots).not.toMatch(/^Disallow: \/$/m);
    });

    it('indexable kapalı: boş urlset ve Disallow: /', async () => {
      await putSeo({ indexable: false }).then((r) => expect(r.status).toBe(200));
      const xml = (await request(server()).get('/sitemap.xml').expect(200)).text;
      expect(xml).toContain('<urlset');
      expect(xml).not.toContain('<url>');
      const robots = (await request(server()).get('/robots.txt').expect(200)).text;
      expect(robots).toBe('User-agent: *\nDisallow: /\n');
      await putSeo({ indexable: true });
    });
  });

  // -------------------------------------------------------------------------
  describe('K-82: sunucu tarafı meta/JSON-LD enjeksiyonu (SERVE_FRONTEND_DIR)', () => {
    const head = (html: string) => html.slice(html.indexOf('<head>'), html.indexOf('</head>'));

    it('ana sayfa: title, description, canonical, OG, Organization + WebSite JSON-LD, GA ve doğrulama etiketleri', async () => {
      await putSeo({ indexable: true, siteTitle: 'Amisos Ana', googleAnalyticsId: 'G-ABCD1234', googleSiteVerification: 'ver_123', canonicalBaseUrl: 'https://b2b.example.com' }).then((r) => expect(r.status).toBe(200));
      const res = await request(server()).get('/').expect(200);
      expect(res.headers['content-type']).toContain('text/html');
      const h = head(res.text);
      expect(h).toContain('<title>Amisos Ana</title>');
      expect(h).not.toContain('ESKI BASLIK');
      expect(h).not.toContain('eski varsayılan');
      expect(h).toContain('<link rel="canonical" href="https://b2b.example.com/" />');
      expect(h).toContain('<meta property="og:title" content="Amisos Ana" />');
      expect(h).toContain('<meta name="google-site-verification" content="ver_123" />');
      expect(h).toContain('googletagmanager.com/gtag/js?id=G-ABCD1234');
      expect(h).not.toContain('name="robots"');
      expect(h).toContain('"@type":"Organization"');
      expect(h).toContain('"@type":"WebSite"');
      expect(h).toContain('SearchAction');
      expect(res.text).toContain('<div id="root">');
    });

    it('ürün sayfası: kaçışlar (XSS yok), JSON-LD </script> kaçışı, görsel/sku/marka, FİYAT HİÇ YOK', async () => {
      await putSeo({ indexable: true, siteTitle: 'Amisos Ana', canonicalBaseUrl: 'https://b2b.example.com', googleAnalyticsId: null }).then((r) => expect(r.status).toBe(200));
      const evil = `"><script>alert(1)</script> & '</script><!--`;
      const p = await createProduct({
        name: `Zararlı ${evil} ${run}`,
        description: `Açıklama ${evil} $& $1 $\``,
        listPrice: '7777.77',
        seoTitle: `T ${evil}`,
        seoDescription: `D ${evil} $& $1 $\``,
      });
      const [m] = await db.insert(media).values({ storageKey: `seoimg-${run}`, originalName: 'u.png', mime: 'image/png', size: 1, width: 1, height: 1, uploadedBy: adminIds[0] }).returning();
      mediaIds.push(m.id);
      await db.insert(productImages).values({ productId: p.id, mediaId: m.id, sortOrder: 0 });
      const res = await request(server()).get(`/urun/${p.slug}`).expect(200);
      const h = head(res.text);
      // Ham tehlikeli diziler hiçbir yerde yok.
      expect(res.text).not.toContain('<script>alert(1)</script>');
      expect(h).not.toContain('"><script');
      expect(h).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &#39;&lt;/script&gt;&lt;!--');
      // <script> sayısı: yalnızca JSON-LD (1) — GA kapalı.
      expect(h.match(/<script/g)).toHaveLength(1);
      const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)![1];
      expect(ld).not.toContain('<');
      expect(ld).not.toContain('>');
      const data = JSON.parse(ld);
      expect(data).toMatchObject({
        '@type': 'Product',
        name: p.name,
        sku: p.barcode,
        brand: { '@type': 'Brand', name: 'Amisos' },
        image: [`https://b2b.example.com/api/media/${m.id}/large.webp`],
        url: `https://b2b.example.com/urun/${p.slug}`,
      });
      expect(data.offers).toBeUndefined();
      expect(h).toContain(`<link rel="canonical" href="https://b2b.example.com/urun/${p.slug}" />`);
      expect(h).toContain(`<meta property="og:image" content="https://b2b.example.com/api/media/${m.id}/large.webp" />`);
      // Fiyat/KDV/stok bilgisi sayfanın hiçbir yerinde yok.
      expect(res.text).not.toMatch(/7777|7\.777|offers|"price"|priceCurrency/);
      // `$&` gibi özel değiştirme dizileri olduğu gibi yazılır (replace yorumlamaz).
      expect(h).toContain('$&amp; $1 $&#96;');
    });

    it('title şablonu uygulanır; seoTitle/seoDescription öncelikli; grup sayfası ve bilgi sayfası', async () => {
      const g = await createGroup('Meta Grup', { description: 'Grup tanıtım', seoTitle: 'Özel Grup Başlığı' });
      const gres = await request(server()).get(`/katalog/${g.slug}`).expect(200);
      expect(head(gres.text)).toContain('<title>Özel Grup Başlığı | AMİSOS B2B</title>');
      expect(head(gres.text)).toContain('<meta name="description" content="Grup tanıtım" />');
      expect(head(gres.text)).toContain(`href="https://b2b.example.com/katalog/${g.slug}"`);
      const cat = await request(server()).get('/katalog').expect(200);
      expect(head(cat.text)).toContain('<title>Ürün Kataloğu | AMİSOS B2B</title>');
      const page = await request(server()).get('/hakkimizda').expect(200);
      expect(head(page.text)).toMatch(/<title>.* \| AMİSOS B2B<\/title>/);
    });

    it('eski ürün slug\'ı 301; bilinmeyen ürün/grup 404 (noindex); pasif ürün 404', async () => {
      const p = await createProduct({ name: `Eski Adres ${run}` });
      await admin.patch(`/api/admin/products/${p.id}`).send({ slug: `tasindi-${run}` }).expect(200);
      const r = await request(server()).get(`/urun/${p.slug}`).redirects(0).expect(301);
      expect(r.headers.location).toBe(`/urun/tasindi-${run}`);
      const nf = await request(server()).get('/urun/yok-boyle-urun').expect(404);
      expect(head(nf.text)).toContain('<meta name="robots" content="noindex,nofollow" />');
      expect(head(nf.text)).not.toContain('rel="canonical"');
      await request(server()).get('/katalog/yok-boyle-grup').expect(404);
      await request(server()).get('/urun/%E0%A4%A').expect(404); // bozuk kodlama
      await request(server()).get('/urun/..%2F..%2Fetc%2Fpasswd').expect(404);
      await admin.patch(`/api/admin/products/${p.id}`).send({ isActive: false }).expect(200);
      await request(server()).get(`/urun/tasindi-${run}`).expect(404);
    });

    it('indexable kapalı: her sayfada noindex; yönetim/sepet gibi yollar 200 + noindex; /api ve /media dokunulmaz', async () => {
      await putSeo({ indexable: false }).then((r) => expect(r.status).toBe(200));
      const home = await request(server()).get('/').expect(200);
      expect(head(home.text)).toContain('<meta name="robots" content="noindex,nofollow" />');
      await putSeo({ indexable: true }).then((r) => expect(r.status).toBe(200));
      const sepet = await request(server()).get('/sepet').expect(200);
      expect(head(sepet.text)).toContain('<meta name="robots" content="noindex,nofollow" />');
      const yon = await request(server()).get('/yonetim/urunler').expect(200);
      expect(head(yon.text)).toContain('noindex');
      const api = await request(server()).get('/api/catalog/yok').expect(404);
      expect(api.headers['content-type']).toContain('json');
      await request(server()).post('/sepet').expect(404);
    });

    it('sorgu dizesi canonical\'a girmez; HEAD çalışır', async () => {
      const res = await request(server()).get('/katalog?q=%22%3E%3Cscript%3E').expect(200);
      expect(head(res.text)).toContain('href="https://b2b.example.com/katalog"');
      expect(res.text).not.toContain('<script>');
      await request(server()).head('/katalog').expect(200);
    });
  });

  it('SERVE_FRONTEND_DIR olmadan vitrin sunulmaz (yalnızca sitemap/robots)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MAIL_SERVICE).useValue(mail).compile();
    const bare = moduleRef.createNestApplication();
    bare.setGlobalPrefix('api');
    applyPublicSeo(bare, undefined);
    await bare.init();
    try {
      await request(bare.getHttpServer()).get('/').expect(404);
      await request(bare.getHttpServer()).get('/robots.txt').expect(200);
    } finally {
      await bare.close();
    }
  });

  it('statik dosya (assets) uzun önbellekle sunulur', async () => {
    await mkdirAssets();
    const res = await request(server()).get('/assets/app-abc123.js').expect(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  async function mkdirAssets() {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(frontendDir, 'assets'), { recursive: true });
    await writeFile(join(frontendDir, 'assets', 'app-abc123.js'), 'console.log(1)');
  }

  it('hesap/yetki: fiyat alanı anonim ürün yanıtında null (K-66 korunur)', async () => {
    const p = await createProduct({ listPrice: '12.34' });
    const res = await request(server()).get(`/api/catalog/products/by-slug/${p.slug}`).expect(200);
    expect(res.body).toMatchObject({ listPrice: null, price: null, vatRate: null, stock: null });
  });
});
