// Katalog, görsel kütüphanesi, Excel içe aktarma, grup iskontoları ve bayi kataloğu (e2e).
// API: docs/api/katalog-api.md. Gereksinimler: GR-URN-001…003, GR-FIY-001…003, K-10 – K-18, K-30 – K-32, K-40, K-59 – K-62.
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray, like, or } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module.js';
import { DB, type Database } from '../src/database/database.module.js';
import {
  adminUsers,
  auditLog,
  dealerGroupDiscounts,
  dealers,
  media,
  productGroups,
  productImages,
  products,
  sessions,
} from '../src/database/schema.js';
import { AuditService } from '../src/audit/audit.service.js';
import { companyTitleKey } from '../src/dealers/company-title.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);
const bc = (n: number | string) => `T${run}-${n}`;
const gname = (n: string) => `${n} ${run}`;

describe('Katalog (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  const adminIds: string[] = [];
  const dealerIds: string[] = [];
  const server = () => app.getHttpServer();

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

  async function newDealer(
    name: string,
    over: Partial<typeof dealers.$inferInsert> = {},
  ) {
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

  let admin: Awaited<ReturnType<typeof adminAgent>>;

  const createGroup = async (name: string, sortOrder?: number) =>
    (await admin.agent.post('/api/admin/product-groups').send({ name: gname(name), sortOrder }).expect(201)).body as {
      id: string;
      name: string;
    };

  const productBody = (groupId: string, n: number | string, over: Record<string, unknown> = {}) => ({
    groupId,
    barcode: bc(n),
    name: `Ürün ${n} ${run}`,
    caseQuantity: 6,
    listPrice: '48.90',
    ...over,
  });
  const createProduct = async (groupId: string, n: number | string, over: Record<string, unknown> = {}) =>
    (await admin.agent.post('/api/admin/products').send(productBody(groupId, n, over)).expect(201)).body as {
      id: string;
      barcode: string;
      images: { mediaId: string }[];
    };

  const png = (w = 50, h = 30) =>
    sharp({ create: { width: w, height: h, channels: 3, background: '#cc3333' } }).png().toBuffer();

  async function workbook(
    rows: (string | number | null)[][],
    headers?: string[],
    tweak?: (ws: ExcelJS.Worksheet) => void,
  ) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ürünler');
    ws.addRow(
      headers ?? [
        'Barkod',
        'Ürün kodu',
        'Ürün adı',
        'Ürün grubu',
        'Koli içi adet',
        'Liste fiyatı (KDV hariç)',
        'KDV oranı',
        'Açıklama',
        'Stok',
        'Aktif',
      ],
    );
    for (const r of rows) ws.addRow(r);
    tweak?.(ws);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const importFile = (buf: Buffer, dryRun: boolean) =>
    admin.agent
      .post(`/api/admin/products/import?dryRun=${dryRun}`)
      .attach('file', buf, 'urunler.xlsx');

  const productByBarcode = async (barcode: string) =>
    (await db.select().from(products).where(eq(products.barcode, barcode)))[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_SERVICE)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get<Database>(DB);
    admin = await adminAgent();
  });

  afterAll(async () => {
    if (db) {
      const prodRows = await db
        .select({ id: products.id })
        .from(products)
        .where(like(products.barcode, `%${run}%`));
      const prodIds = prodRows.map((p) => p.id);
      const groupRows = await db
        .select({ id: productGroups.id })
        .from(productGroups)
        .where(like(productGroups.name, `%${run}%`));
      const allIds = [...adminIds, ...dealerIds, ...prodIds, ...groupRows.map((g) => g.id)];
      await db.delete(auditLog).where(or(inArray(auditLog.actorId, adminIds), inArray(auditLog.entityId, allIds)));
      await db.delete(sessions).where(inArray(sessions.subjectId, [...adminIds, ...dealerIds]));
      if (dealerIds.length) {
        await db.delete(dealerGroupDiscounts).where(inArray(dealerGroupDiscounts.dealerId, dealerIds));
      }
      if (prodIds.length) {
        await db.delete(productImages).where(inArray(productImages.productId, prodIds));
        await db.delete(products).where(inArray(products.id, prodIds));
      }
      if (groupRows.length) {
        await db.delete(productGroups).where(
          inArray(
            productGroups.id,
            groupRows.map((g) => g.id),
          ),
        );
      }
      await db.delete(media).where(inArray(media.uploadedBy, adminIds));
      if (dealerIds.length) await db.delete(dealers).where(inArray(dealers.id, dealerIds));
      await db.delete(adminUsers).where(inArray(adminUsers.id, adminIds));
    }
    await app?.close();
    await rm(process.env.MEDIA_DIR!, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  describe('Yetki', () => {
    it('GR-YON-001, GR-FIY-001: anonim 401, bayi Admin uçlarında 403, Admin katalogda 403', async () => {
      const { agent: dealer } = await dealerAgent('yetki');
      const anon = request(server());
      const adminPaths = [
        '/api/admin/product-groups',
        '/api/admin/products',
        '/api/admin/products/import-template',
        '/api/admin/media',
      ];
      for (const p of adminPaths) {
        await anon.get(p).expect(401);
        await dealer.get(p).expect(403);
      }
      // K-66: katalog oturumsuz ve Admin oturumunda da açık (fiyatsız); fiyat listesi yalnızca bayiye.
      for (const p of ['/api/catalog/groups', '/api/catalog/products']) {
        await anon.get(p).expect(200);
        await admin.agent.get(p).expect(200);
      }
      await anon.get(`/api/catalog/products/${randomUUID()}`).expect(404);
      await anon.get('/api/catalog/price-list.xlsx').expect(401);
      await admin.agent.get('/api/catalog/price-list.xlsx').expect(403);
      await anon.post('/api/admin/media').expect(401);
      await dealer.post('/api/admin/products/import').expect(403);
    });

    it('GR-YON-001: Admin JSON uçları form kodlu gövdeyi reddeder (JsonOnlyGuard sürüyor)', async () => {
      await admin.agent
        .post('/api/admin/product-groups')
        .type('form')
        .send({ name: 'x' })
        .expect(415);
    });
  });

  // -------------------------------------------------------------------------
  describe('Ürün grupları', () => {
    it('K-40: grup oluşturma, listeleme (sıra + productCount), güncelleme', async () => {
      const a = await createGroup('Sıralı B', 20);
      const b = await createGroup('Sıralı A', 10);
      const list = (await admin.agent.get('/api/admin/product-groups').expect(200)).body as {
        id: string;
        name: string;
        sortOrder: number;
        isActive: boolean;
        productCount: number;
      }[];
      await createProduct(a.id, 'cnt1');
      await createProduct(a.id, 'cnt2');
      const list2 = (await admin.agent.get('/api/admin/product-groups').expect(200)).body as typeof list;
      expect(list2.find((g) => g.id === a.id)?.productCount).toBe(2);
      const mine = list.filter((g) => [a.id, b.id].includes(g.id));
      expect(mine.map((g) => g.id)).toEqual([b.id, a.id]);
      expect(mine[0]).toEqual({ id: b.id, name: gname('Sıralı A'), sortOrder: 10, isActive: true, productCount: 0 });

      const patched = await admin.agent
        .patch(`/api/admin/product-groups/${a.id}`)
        .send({ sortOrder: 5, isActive: false })
        .expect(200);
      expect(patched.body).toMatchObject({ id: a.id, sortOrder: 5, isActive: false });
    });

    it('K-40: aynı ad Türkçe büyük/küçük harf ve boşluk duyarsız 409 DUPLICATE_GROUP', async () => {
      const g = await createGroup('Çanak İçi');
      const dup = await admin.agent
        .post('/api/admin/product-groups')
        .send({ name: `  ÇANAK   İÇİ   ${run}` })
        .expect(409);
      expect(dup.body.code).toBe('DUPLICATE_GROUP');
      const other = await createGroup('Başka Grup');
      const clash = await admin.agent
        .patch(`/api/admin/product-groups/${other.id}`)
        .send({ name: `çanak içi ${run}` })
        .expect(409);
      expect(clash.body.code).toBe('DUPLICATE_GROUP');
      expect(g.id).toBeTruthy();
    });

    it('K-40: ürünü olan grup silinemez (409 GROUP_NOT_EMPTY), boş grup silinir (204); audit yazılır', async () => {
      const g = await createGroup('Silinecek');
      await createProduct(g.id, 'sil');
      const res = await admin.agent.delete(`/api/admin/product-groups/${g.id}`).expect(409);
      expect(res.body.code).toBe('GROUP_NOT_EMPTY');
      const empty = await createGroup('Boş');
      await admin.agent.delete(`/api/admin/product-groups/${empty.id}`).expect(204);
      await admin.agent.delete(`/api/admin/product-groups/${empty.id}`).expect(404);
      const log = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityId, empty.id), eq(auditLog.action, 'product_group.deleted')));
      expect(log).toHaveLength(1);
    });

    it('K-40: grup adı boşsa 400 VALIDATION', async () => {
      const res = await admin.agent.post('/api/admin/product-groups').send({ name: '   ' }).expect(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(res.body.fields.name).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  describe('Ürünler (Admin)', () => {
    let groupId: string;
    beforeAll(async () => {
      groupId = (await createGroup('Ürün Grubu')).id;
    });

    it('GR-URN-001, K-60: oluşturma varsayılanları (KDV 20, stokta, aktif), tutarlar metin', async () => {
      const res = await admin.agent
        .post('/api/admin/products')
        .send({ groupId, barcode: ` ${bc('p1')} `, name: 'Çay Bardağı', caseQuantity: 12, listPrice: '19,99', code: bc('kod1') })
        .expect(201);
      expect(res.body).toMatchObject({
        groupId,
        barcode: bc('p1'),
        code: bc('kod1'),
        caseQuantity: 12,
        listPrice: '19.99',
        vatRate: '20.00',
        stockStatus: 'in_stock',
        isActive: true,
        description: null,
        images: [],
      });
      const got = await admin.agent.get(`/api/admin/products/${res.body.id}`).expect(200);
      expect(got.body.groupName).toBe(gname('Ürün Grubu'));
    });

    it('K-16, K-30: barkod boşsa 400, aynı barkod 409 DUPLICATE_BARCODE; K-15 aynı kod 409 DUPLICATE_CODE', async () => {
      const blank = await admin.agent.post('/api/admin/products').send(productBody(groupId, 'x', { barcode: '   ' })).expect(400);
      expect(blank.body.code).toBe('VALIDATION');
      expect(blank.body.fields.barcode).toBeTruthy();

      await createProduct(groupId, 'dup', { code: bc('dupkod') });
      const dupBarcode = await admin.agent.post('/api/admin/products').send(productBody(groupId, 'dup')).expect(409);
      expect(dupBarcode.body.code).toBe('DUPLICATE_BARCODE');
      const dupCode = await admin.agent
        .post('/api/admin/products')
        .send(productBody(groupId, 'dup2', { code: bc('dupkod') }))
        .expect(409);
      expect(dupCode.body.code).toBe('DUPLICATE_CODE');

      // Boş kod birden çok üründe serbest.
      await createProduct(groupId, 'nokod1', { code: '' });
      await createProduct(groupId, 'nokod2', { code: null });
    });

    it('K-32: koli içi adet 0 veya negatif, fiyat negatif, geçersiz KDV reddedilir', async () => {
      for (const over of [{ caseQuantity: 0 }, { caseQuantity: -1 }, { listPrice: '-1' }, { listPrice: '1.999' }, { vatRate: '100' }]) {
        const res = await admin.agent.post('/api/admin/products').send(productBody(groupId, 'bad', over)).expect(400);
        expect(res.body.code).toBe('VALIDATION');
      }
      const noGroup = await admin.agent
        .post('/api/admin/products')
        .send(productBody(randomUUID(), 'bad'))
        .expect(400);
      expect(noGroup.body.fields.groupId).toBeTruthy();
    });

    it('GR-URN-001, K-19: fiyat ve stok değişikliği audit_log\'a önceki/yeni değerle yazılır', async () => {
      const p = await createProduct(groupId, 'audit');
      const res = await admin.agent
        .patch(`/api/admin/products/${p.id}`)
        .send({ listPrice: '55,5', stockStatus: 'out_of_stock', isActive: false })
        .expect(200);
      expect(res.body).toMatchObject({ listPrice: '55.50', stockStatus: 'out_of_stock', isActive: false });
      const [log] = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityId, p.id), eq(auditLog.action, 'product.updated')));
      const changes = (log.data as { changes: Record<string, { previous: unknown; next: unknown }> }).changes;
      expect(changes.listPrice).toEqual({ previous: '48.90', next: '55.50' });
      expect(changes.stockStatus).toEqual({ previous: 'in_stock', next: 'out_of_stock' });
      expect(log.actorId).toBe(admin.admin.id);
      const created = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityId, p.id), eq(auditLog.action, 'product.created')));
      expect(created).toHaveLength(1);
      await admin.agent.get(`/api/admin/products/${randomUUID()}`).expect(404);
    });

    it('GR-URN-001: PATCH barkod/kod çakışmasında 409', async () => {
      const a = await createProduct(groupId, 'c1', { code: bc('c1k') });
      const b = await createProduct(groupId, 'c2');
      const r1 = await admin.agent.patch(`/api/admin/products/${b.id}`).send({ barcode: a.barcode }).expect(409);
      expect(r1.body.code).toBe('DUPLICATE_BARCODE');
      const r2 = await admin.agent.patch(`/api/admin/products/${b.id}`).send({ code: bc('c1k') }).expect(409);
      expect(r2.body.code).toBe('DUPLICATE_CODE');
    });

    it('K-40: liste filtreleri, arama (ad Türkçe duyarsız, barkod, kod), tam barkod en üstte, sayfalama', async () => {
      const g = await createGroup('Liste');
      const target = await createProduct(g.id, 'zzz', { name: `Zebra ${run}` });
      // Adında hedef barkod geçen, ada göre önce gelen ürün.
      await createProduct(g.id, 'aaa', { name: `Aaa ${target.barcode}` });
      await createProduct(g.id, 'cay', { name: `ÇAY takımı ${run}`, stockStatus: 'out_of_stock', isActive: false });

      const byBarcode = (
        await admin.agent.get('/api/admin/products').query({ q: target.barcode, groupId: g.id }).expect(200)
      ).body;
      expect(byBarcode.total).toBe(2);
      expect(byBarcode.items[0].id).toBe(target.id);

      const turkish = (await admin.agent.get('/api/admin/products').query({ q: 'çay TAKIMI', groupId: g.id }).expect(200)).body;
      expect(turkish.total).toBe(1);
      const ascii = (await admin.agent.get('/api/admin/products').query({ q: 'cay takimi', groupId: g.id }).expect(200)).body;
      expect(ascii.total).toBe(1);

      const filtered = (
        await admin.agent.get('/api/admin/products').query({ groupId: g.id, stock: 'out_of_stock', active: 'false' }).expect(200)
      ).body;
      expect(filtered.total).toBe(1);
      const paged = (await admin.agent.get('/api/admin/products').query({ groupId: g.id, pageSize: 2, page: 2 }).expect(200)).body;
      expect(paged).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(paged.items).toHaveLength(1);
      // LIKE joker karakterleri desen olarak yorumlanmaz.
      const wild = (await admin.agent.get('/api/admin/products').query({ q: '%', groupId: g.id }).expect(200)).body;
      expect(wild.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('Görsel kütüphanesi', () => {
    it('K-61, K-62: yükleme thumb/large webp üretir; sunum ucu webp, önbellek başlığı, 404', async () => {
      const big = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#3366cc' } })
        .png()
        .toBuffer();
      const res = await admin.agent
        .post('/api/admin/media')
        .attach('files', big, 'Büyük Görsel.png')
        .attach('files', await png(), 'küçük.png')
        .expect(201);
      expect(res.body.errors).toEqual([]);
      expect(res.body.items).toHaveLength(2);
      const [first, second] = res.body.items;
      expect(first).toMatchObject({ filename: 'Büyük Görsel.png', width: 1200, height: 600, usedBy: 0 });
      expect(first.url).toBe(`/api/media/${first.id}/large.webp`);
      expect(first.thumbUrl).toBe(`/api/media/${first.id}/thumb.webp`);
      expect(second.width).toBe(50); // büyütülmez

      // Herkese açık: oturumsuz erişilir.
      const large = await request(server()).get(first.url).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(large.status).toBe(200);
      expect(large.headers['content-type']).toBe('image/webp');
      expect(large.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      const meta = await sharp(large.body as Buffer).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(1200);
      expect(meta.exif).toBeUndefined();

      const thumb = await request(server()).get(first.thumbUrl).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect((await sharp(thumb.body as Buffer).metadata()).width).toBe(400);

      await request(server()).get(`/api/media/${randomUUID()}/large.webp`).expect(404);
      await request(server()).get('/api/media/not-a-uuid/large.webp').expect(404);
      await request(server()).get('/api/media/..%2f..%2fetc/large.webp').expect(404);
    });

    it('K-62: EXIF yönlendirmesi uygulanır ve metadata atılır', async () => {
      const rotated = await sharp({ create: { width: 60, height: 20, channels: 3, background: '#00aa00' } })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();
      const res = await admin.agent.post('/api/admin/media').attach('files', rotated, 'donuk.jpg').expect(201);
      expect(res.body.items[0]).toMatchObject({ width: 20, height: 60 });
    });

    it('K-62: geçersiz dosya (metin dosyası .jpg adıyla) errors\'a düşer, diğerleri yüklenir', async () => {
      const res = await admin.agent
        .post('/api/admin/media')
        .attach('files', Buffer.from('bu bir görsel değil'), 'sahte.jpg')
        .attach('files', await png(), 'gercek.png')
        .attach('files', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'cizim.png')
        .expect(201);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].filename).toBe('gercek.png');
      expect(res.body.errors.map((e: { filename: string }) => e.filename).sort()).toEqual(['cizim.png', 'sahte.jpg']);
      expect(res.body.errors[0].message).toBeTruthy();
    });

    it('K-62: dosya yoksa 400; 8 MB üstü dosya 413', async () => {
      await admin.agent.post('/api/admin/media').expect(400);
      const huge = Buffer.alloc(8 * 1024 * 1024 + 1024);
      await admin.agent.post('/api/admin/media').attach('files', huge, 'dev.png').expect(413);
    });

    it('K-62: liste (q, unused, sayfalama), kullanımdaki görsel silinemez (409 MEDIA_IN_USE), serbest bırakınca silinir', async () => {
      const up = await admin.agent
        .post('/api/admin/media')
        .attach('files', await png(), `ara-${run}-a.png`)
        .attach('files', await png(40, 40), `ara-${run}-b.png`)
        .expect(201);
      const [a, b] = up.body.items as { id: string; url: string }[];
      const g = await createGroup('Görselli');
      const p = await createProduct(g.id, 'img', { mediaIds: [b.id, a.id] });
      // Ürüne görsel sırası verildiği gibi.
      expect(p.images.map((i) => i.mediaId)).toEqual([b.id, a.id]);
      const got = (await admin.agent.get(`/api/admin/products/${p.id}`).expect(200)).body;
      expect(got.images.map((i: { sortOrder: number }) => i.sortOrder)).toEqual([0, 1]);
      expect(got.images[0].thumbUrl).toBe(`/api/media/${b.id}/thumb.webp`);

      const all = (await admin.agent.get('/api/admin/media').query({ q: `ara-${run}` }).expect(200)).body;
      expect(all.total).toBe(2);
      expect(all.items.every((m: { usedBy: number }) => m.usedBy === 1)).toBe(true);
      const unused = (await admin.agent.get('/api/admin/media').query({ q: `ara-${run}`, unused: 'true' }).expect(200)).body;
      expect(unused.total).toBe(0);
      const paged = (await admin.agent.get('/api/admin/media').query({ q: `ara-${run}`, pageSize: 1, page: 2 }).expect(200)).body;
      expect(paged).toMatchObject({ total: 2, page: 2, pageSize: 1 });

      const inUse = await admin.agent.delete(`/api/admin/media/${a.id}`).expect(409);
      expect(inUse.body.code).toBe('MEDIA_IN_USE');

      // Sırayı değiştir: yalnızca a kalsın.
      const reordered = await admin.agent.patch(`/api/admin/products/${p.id}`).send({ mediaIds: [a.id] }).expect(200);
      expect(reordered.body.images.map((i: { mediaId: string }) => i.mediaId)).toEqual([a.id]);
      await admin.agent.delete(`/api/admin/media/${b.id}`).expect(204);
      await request(server()).get(`/api/media/${b.id}/large.webp`).expect(404);
      await admin.agent.delete(`/api/admin/media/${b.id}`).expect(404);
      const log = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityId, b.id), eq(auditLog.action, 'media.deleted')));
      expect(log).toHaveLength(1);

      // Var olmayan görsel kimliğiyle ürün güncellenemez.
      const bad = await admin.agent.patch(`/api/admin/products/${p.id}`).send({ mediaIds: [randomUUID()] }).expect(400);
      expect(bad.body.fields.mediaIds).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  describe('Excel ile toplu yükleme', () => {
    it('K-59: şablon indirilir, başlıklar sabit ve geri yüklendiğinde (dryRun) geçerlidir', async () => {
      const res = await admin.agent
        .get('/api/admin/products/import-template')
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('.xlsx');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as Buffer);
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Ürünler', 'Açıklama']);
      const header = (wb.getWorksheet('Ürünler')!.getRow(1).values as string[]).slice(1);
      expect(header).toEqual([
        'Barkod',
        'Ürün kodu',
        'Ürün adı',
        'Ürün grubu',
        'Koli içi adet',
        'Liste fiyatı (KDV hariç)',
        'KDV oranı',
        'Açıklama',
        'Stok',
        'Aktif',
      ]);
      // Örnek satırlar silinmeden yüklenemez.
      const raw = await importFile(res.body as Buffer, true).expect(200);
      expect(raw.body.errors).toEqual([
        { row: 2, column: 'Barkod', message: 'Şablondaki örnek satırı silin.' },
        { row: 3, column: 'Barkod', message: 'Şablondaki örnek satırı silin.' },
      ]);
      const sheet = wb.getWorksheet('Ürünler')!;
      sheet.getCell('A2').value = bc('sablon1');
      sheet.getCell('A3').value = bc('sablon2');
      const edited = Buffer.from(await wb.xlsx.writeBuffer());
      const back = await importFile(edited, true).expect(200);
      expect(back.body.errors).toEqual([]);
      expect(back.body.total).toBe(2);
      expect(back.body.created + back.body.updated).toBe(2);
    });

    it('K-59: dryRun rapor verir, hiçbir şey yazmaz; eksik grup yalnızca listelenir', async () => {
      const existing = await createGroup('Excel Var');
      const buf = await workbook([
        [bc('x1'), null, 'Yeni Ürün', gname('Excel Yeni'), 12, '19,99', null, null, null, null],
        [bc('x2'), bc('x2k'), 'Başka', existing.name, 6, 10.5, 8, 'açıklama', 'Yok', 'Hayır'],
      ]);
      const res = await importFile(buf, true).expect(200);
      expect(res.body).toEqual({
        total: 2,
        created: 2,
        updated: 0,
        unchanged: 0,
        groupsCreated: [gname('Excel Yeni')],
        errors: [],
        warnings: [],
      });
      expect(await productByBarcode(bc('x1'))).toBeUndefined();
      const groups = await db.select().from(productGroups).where(eq(productGroups.name, gname('Excel Yeni')));
      expect(groups).toHaveLength(0);
    });

    it('K-59, K-60: ekleme, KDV boş -> 20, grup otomatik oluşturma, "19,99" ve sayı, varsayılan stok/aktif', async () => {
      const existing = await createGroup('Excel Mevcut');
      const buf = await workbook([
        [bc('e1'), null, 'Birinci', gname('Excel Otomatik'), 12, '19,99', null, null, null, null],
        [bc('e2'), bc('e2k'), 'İkinci', existing.name, 6, 10.5, 8, 'Açıklama metni', 'Yok', 'Hayır'],
        [bc('e3'), null, 'Üçüncü', gname('excel otomatik'), 1, '1.234,50', '%18', null, 'Var', 'Evet'],
      ]);
      const res = await importFile(buf, false).expect(200);
      expect(res.body).toMatchObject({ total: 3, created: 3, updated: 0, groupsCreated: [gname('Excel Otomatik')], errors: [] });

      const p1 = await productByBarcode(bc('e1'));
      expect(p1).toMatchObject({ listPrice: '19.99', vatRate: '20.00', stockStatus: 'in_stock', isActive: true, caseQuantity: 12, code: null });
      const p2 = await productByBarcode(bc('e2'));
      expect(p2).toMatchObject({ listPrice: '10.50', vatRate: '8.00', stockStatus: 'out_of_stock', isActive: false, description: 'Açıklama metni', code: bc('e2k'), groupId: existing.id });
      const p3 = await productByBarcode(bc('e3'));
      expect(p3).toMatchObject({ listPrice: '1234.50', vatRate: '18.00' });
      expect(p3.groupId).toBe(p1.groupId); // büyük/küçük harf duyarsız aynı grup
      const created = await db.select().from(productGroups).where(eq(productGroups.name, gname('Excel Otomatik')));
      expect(created).toHaveLength(1);

      const [log] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'product.imported'), eq(auditLog.actorId, admin.admin.id)));
      expect(log.data).toMatchObject({ filename: 'urunler.xlsx', created: 3, updated: 0 });
    });

    it('K-59: barkod varsa güncellenir, yoksa eklenir; boş Stok/Aktif mevcutta değişmez; fiyat audit\'e düşer', async () => {
      const g = await createGroup('Excel Güncelle');
      const p = await createProduct(g.id, 'u1', { stockStatus: 'out_of_stock', isActive: false, code: bc('u1k'), description: 'eski' });
      const buf = await workbook([
        [bc('u1'), null, 'Güncel Ad', g.name, 3, '25,50', null, null, null, null],
        [bc('u2'), null, 'Yeni', g.name, 2, 5, null, null, null, null],
      ]);
      const res = await importFile(buf, false).expect(200);
      expect(res.body).toMatchObject({ total: 2, created: 1, updated: 1, groupsCreated: [] });
      const after = await productByBarcode(bc('u1'));
      expect(after).toMatchObject({
        id: p.id,
        name: 'Güncel Ad',
        listPrice: '25.50',
        caseQuantity: 3,
        stockStatus: 'out_of_stock',
        isActive: false,
        code: bc('u1k'),
        description: 'eski',
      });
      const logs = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityId, p.id), eq(auditLog.action, 'product.updated')))
        .orderBy(auditLog.id);
      const changes = (logs[0].data as { changes: Record<string, { previous: unknown; next: unknown }> }).changes;
      expect(changes.listPrice).toEqual({ previous: '48.90', next: '25.50' });
    });

    it('K-60: boş KDV yeni üründe %20, mevcut üründe değişmez; ORNEK barkodlu satır hata', async () => {
      const g = await createGroup('Excel KDV');
      await createProduct(g.id, 'v1', { vatRate: '10' });
      const buf = await workbook([
        [bc('v1'), null, 'Mevcut', g.name, 1, '5', null, null, null, null],
        [bc('v2'), null, 'Yeni', g.name, 1, '5', null, null, null, null],
      ]);
      await importFile(buf, false).expect(200);
      expect((await productByBarcode(bc('v1'))).vatRate).toBe('10.00');
      expect((await productByBarcode(bc('v2'))).vatRate).toBe('20.00');
      const ex = await importFile(await workbook([['ornek-1', null, 'x', g.name, 1, '5', null, null, null, null]]), false).expect(422);
      expect(ex.body.errors[0]).toMatchObject({ row: 2, column: 'Barkod', message: 'Şablondaki örnek satırı silin.' });
    });

    it('K-59: başlıklar Türkçe/boşluk/büyük-küçük harf duyarsız eşlenir, sütun sırası serbest', async () => {
      const buf = await workbook(
        [['Başlık Testi', gname('Başlık Grubu'), bc('h1'), '7,25', 4]],
        ['  ÜRÜN   ADI ', 'urun grubu', 'BARKOD', 'liste fiyati', 'Koli Ici Adet'],
      );
      const res = await importFile(buf, false).expect(200);
      expect(res.body).toMatchObject({ created: 1, errors: [] });
      expect(await productByBarcode(bc('h1'))).toMatchObject({ listPrice: '7.25', caseQuantity: 4, vatRate: '20.00' });
    });

    it('K-59: hatalı dosya 422 döner, Excel satır numarasıyla; hiçbir satır ve grup yazılmaz (hep-ya-hiç)', async () => {
      const buf = await workbook([
        [bc('r1'), null, 'Geçerli', gname('Hatalı Dosya Grubu'), 12, '10,00', null, null, null, null],
        [bc('r2'), null, 'Koli sıfır', gname('Hatalı Dosya Grubu'), 0, '10,00', null, null, null, null],
        [null, null, 'Barkodsuz', gname('Hatalı Dosya Grubu'), 1, 'abc', null, null, 'Belki', null],
        [bc('r1'), null, 'Aynı barkod', gname('Hatalı Dosya Grubu'), 1, '1', null, null, null, null],
      ]);
      const res = await importFile(buf, false).expect(422);
      const errors = res.body.errors as { row: number; column: string; message: string }[];
      expect(errors.find((e) => e.row === 3 && e.column === 'Koli içi adet')).toBeTruthy();
      expect(errors.find((e) => e.row === 4 && e.column === 'Barkod')).toBeTruthy();
      expect(errors.find((e) => e.row === 4 && e.column === 'Liste fiyatı (KDV hariç)')).toBeTruthy();
      expect(errors.find((e) => e.row === 4 && e.column === 'Stok')).toBeTruthy();
      expect(errors.find((e) => e.row === 5 && e.column === 'Barkod')?.message).toContain('2.');
      expect(res.body.statusCode).toBe(422);
      expect(await productByBarcode(bc('r1'))).toBeUndefined();
      const groups = await db.select().from(productGroups).where(eq(productGroups.name, gname('Hatalı Dosya Grubu')));
      expect(groups).toHaveLength(0);
      // dryRun aynı hataları 200 ile raporlar.
      const dry = await importFile(buf, true).expect(200);
      expect(dry.body.errors).toEqual(errors);
    });

    it('K-59: başka üründe kullanılan kod ve eksik zorunlu sütun hata verir; geçersiz dosya 400', async () => {
      const g = await createGroup('Excel Kod');
      await createProduct(g.id, 'k1', { code: bc('k1k') });
      const clash = await importFile(
        await workbook([[bc('k2'), bc('k1k'), 'Kod çakışması', g.name, 1, '1', null, null, null, null]]),
        false,
      ).expect(422);
      expect(clash.body.errors[0]).toMatchObject({ row: 2, column: 'Ürün kodu' });
      expect(await productByBarcode(bc('k2'))).toBeUndefined();

      const missing = await importFile(await workbook([['a']], ['Barkod']), true).expect(200);
      expect(missing.body.errors.map((e: { column: string }) => e.column)).toEqual(
        expect.arrayContaining(['Ürün adı', 'Ürün grubu', 'Koli içi adet', 'Liste fiyatı (KDV hariç)']),
      );

      const notXlsx = await admin.agent
        .post('/api/admin/products/import')
        .attach('file', Buffer.from('barkod;ad\n1;2'), 'urunler.xlsx')
        .expect(400);
      expect(notXlsx.body.fields.file).toBeTruthy();
      await admin.agent.post('/api/admin/products/import').expect(400);
    });

    it('K-59: 5000 satır sınırı aşılırsa hata (satır 1), 5000 satır dosyası makul sürede doğrulanır', async () => {
      const rows = Array.from({ length: 5001 }, (_, i) => [bc(`b${i}`), null, `N${i}`, gname('Toplu'), 1, '1', null, null, null, null]);
      const over = await importFile(await workbook(rows), true).expect(200);
      expect(over.body.errors[0]).toMatchObject({ row: 1, column: 'Dosya' });
      const started = Date.now();
      const ok = await importFile(await workbook(rows.slice(0, 5000)), true).expect(200);
      expect(ok.body).toMatchObject({ total: 5000, created: 5000, errors: [] });
      expect(Date.now() - started).toBeLessThan(15_000);
    }, 60_000);
  });

  // -------------------------------------------------------------------------
  describe('Bayi grup iskontoları', () => {
    it('K-12, K-13: PUT listeyi tamamen değiştirir, GET grup adıyla döner, audit önceki/yeni', async () => {
      const g1 = await createGroup('İskonto 1', 1);
      const g2 = await createGroup('İskonto 2', 2);
      const dealer = await newDealer('iskonto');
      const url = `/api/admin/dealers/${dealer.id}/group-discounts`;
      expect((await admin.agent.get(url).expect(200)).body).toEqual([]);

      await admin.agent.put(url).send({ items: [{ groupId: g1.id, discountPercent: '15' }, { groupId: g2.id, discountPercent: '7,5' }] }).expect(204);
      expect((await admin.agent.get(url).expect(200)).body).toEqual([
        { groupId: g1.id, groupName: gname('İskonto 1'), discountPercent: '15.00' },
        { groupId: g2.id, groupName: gname('İskonto 2'), discountPercent: '7.50' },
      ]);
      await admin.agent.put(url).send({ items: [{ groupId: g2.id, discountPercent: '20' }] }).expect(204);
      expect((await admin.agent.get(url).expect(200)).body).toEqual([
        { groupId: g2.id, groupName: gname('İskonto 2'), discountPercent: '20.00' },
      ]);
      const logs = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityId, dealer.id), eq(auditLog.action, 'dealer.group_discounts_changed')))
        .orderBy(auditLog.id);
      expect(logs).toHaveLength(2);
      expect(logs[1].data).toMatchObject({
        previous: expect.arrayContaining([{ groupId: g1.id, discountPercent: '15.00' }]),
        next: [{ groupId: g2.id, discountPercent: '20.00' }],
      });
      await admin.agent.put(url).send({ items: [] }).expect(204);
      expect((await admin.agent.get(url).expect(200)).body).toEqual([]);
      await admin.agent.get(`/api/admin/dealers/${randomUUID()}/group-discounts`).expect(404);
    });

    it('K-12: oran aralığı, yinelenen grup, bilinmeyen grup 400; reddedilen/doğrulanmamış bayide 409 INVALID_STATE', async () => {
      const g = await createGroup('İskonto Doğrulama');
      const dealer = await newDealer('iskonto2');
      const url = `/api/admin/dealers/${dealer.id}/group-discounts`;
      for (const pct of ['0', '100', '-5', '10.999', 'abc']) {
        await admin.agent.put(url).send({ items: [{ groupId: g.id, discountPercent: pct }] }).expect(400);
      }
      await admin.agent
        .put(url)
        .send({ items: [{ groupId: g.id, discountPercent: '5' }, { groupId: g.id, discountPercent: '6' }] })
        .expect(400);
      await admin.agent.put(url).send({ items: [{ groupId: randomUUID(), discountPercent: '5' }] }).expect(400);

      for (const status of ['rejected', 'pending_email'] as const) {
        const d = await newDealer(`iskonto-${status}`, {
          status,
          passwordHash: null,
          rejectionReason: status === 'rejected' ? 'gerekçe' : null,
        });
        const res = await admin.agent
          .put(`/api/admin/dealers/${d.id}/group-discounts`)
          .send({ items: [{ groupId: g.id, discountPercent: '5' }] })
          .expect(409);
        expect(res.body.code).toBe('INVALID_STATE');
      }
      for (const status of ['pending_approval', 'passive'] as const) {
        const d = await newDealer(`iskonto-${status}`, { status, passwordHash: null });
        await admin.agent
          .put(`/api/admin/dealers/${d.id}/group-discounts`)
          .send({ items: [{ groupId: g.id, discountPercent: '5' }] })
          .expect(204);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('Bayi kataloğu', () => {
    let mutfak: string;
    let tabak: string;
    let pMutfak: string;
    let pTabak: string;

    beforeAll(async () => {
      mutfak = (await createGroup('Katalog Mutfak', 1)).id;
      tabak = (await createGroup('Katalog Tabak', 2)).id;
      pMutfak = (await createProduct(mutfak, 'cm', { name: `Mutfak Ürünü ${run}`, code: bc('cmk') })).id;
      pTabak = (await createProduct(tabak, 'ct', { name: `Tabak Ürünü ${run}`, stockStatus: 'out_of_stock' })).id;
    });

    const search = (agent: ReturnType<typeof request.agent>, query: Record<string, unknown> = {}) =>
      agent.get('/api/catalog/products').query({ q: run, ...query });

    it('GR-FIY-002, K-13, K-39: genel 10 + mutfak grubu 15 -> mutfakta 15 (41.57), diğer grupta 10 (44.01)', async () => {
      const d = await dealerAgent('kat-iskonto', { generalDiscountPercent: '10.00' });
      await admin.agent
        .put(`/api/admin/dealers/${d.dealer.id}/group-discounts`)
        .send({ items: [{ groupId: mutfak, discountPercent: '15' }] })
        .expect(204);
      const res = (await search(d.agent).expect(200)).body;
      const m = res.items.find((i: { id: string }) => i.id === pMutfak);
      const t = res.items.find((i: { id: string }) => i.id === pTabak);
      expect(m).toMatchObject({ listPrice: '48.90', price: '41.57', discountPercent: '15.00', vatRate: '20.00', groupId: mutfak, groupName: gname('Katalog Mutfak') });
      expect(t).toMatchObject({ listPrice: '48.90', price: '44.01', discountPercent: '10.00' });
      const detail = (await d.agent.get(`/api/catalog/products/${pMutfak}`).expect(200)).body;
      expect(detail).toEqual({ ...m, priceVisible: true });
    });

    it('K-13: grup oranı genelden düşükse genel oran uygulanır', async () => {
      const d = await dealerAgent('kat-dusuk', { generalDiscountPercent: '20.00' });
      await admin.agent
        .put(`/api/admin/dealers/${d.dealer.id}/group-discounts`)
        .send({ items: [{ groupId: mutfak, discountPercent: '5' }] })
        .expect(204);
      const m = (await d.agent.get(`/api/catalog/products/${pMutfak}`).expect(200)).body;
      expect(m).toMatchObject({ discountPercent: '20.00', price: '39.12' });
    });

    it('K-10: iskonto yoksa liste fiyatı ve discountPercent null; yalnızca grup iskontosu varsa o grupta uygulanır', async () => {
      const plain = await dealerAgent('kat-yok');
      const m = (await plain.agent.get(`/api/catalog/products/${pMutfak}`).expect(200)).body;
      expect(m).toMatchObject({ price: '48.90', listPrice: '48.90', discountPercent: null });

      const onlyGroup = await dealerAgent('kat-grup');
      await admin.agent
        .put(`/api/admin/dealers/${onlyGroup.dealer.id}/group-discounts`)
        .send({ items: [{ groupId: tabak, discountPercent: '50' }] })
        .expect(204);
      const t = (await onlyGroup.agent.get(`/api/catalog/products/${pTabak}`).expect(200)).body;
      expect(t).toMatchObject({ price: '24.45', discountPercent: '50.00' });
      const mm = (await onlyGroup.agent.get(`/api/catalog/products/${pMutfak}`).expect(200)).body;
      expect(mm).toMatchObject({ price: '48.90', discountPercent: null });
    });

    it('K-18: stok adedi dönmez, yalnızca stock alanı; yanıt alanları sözleşmeyle birebir', async () => {
      const d = await dealerAgent('kat-stok');
      const t = (await d.agent.get(`/api/catalog/products/${pTabak}`).expect(200)).body;
      expect(t.stock).toBe('out_of_stock');
      expect(Object.keys(t).sort()).toEqual(
        [
          'id', 'name', 'barcode', 'code', 'description', 'groupId', 'groupName', 'caseQuantity',
          'stock', 'listPrice', 'price', 'discountPercent', 'vatRate', 'images',
          'isFeatured', 'isNew', 'isFavorite', 'priceVisible',
        ].sort(),
      );
    });

    it('GR-URN-003: pasif ürün ve pasif grup listede görünmez, detayı 404; admin aktifleştirince döner', async () => {
      const d = await dealerAgent('kat-pasif');
      const g = await createGroup('Katalog Pasif');
      const hidden = await createProduct(g.id, 'hid', { isActive: false, name: `Gizli ${run}` });
      const visible = await createProduct(g.id, 'vis', { name: `Görünür ${run}` });
      const ids = () => search(d.agent, { groupId: g.id }).then((r) => r.body.items.map((i: { id: string }) => i.id));
      expect(await ids()).toEqual([visible.id]);
      await d.agent.get(`/api/catalog/products/${hidden.id}`).expect(404);

      await admin.agent.patch(`/api/admin/product-groups/${g.id}`).send({ isActive: false }).expect(200);
      expect(await ids()).toEqual([]);
      await d.agent.get(`/api/catalog/products/${visible.id}`).expect(404);
      await admin.agent.patch(`/api/admin/product-groups/${g.id}`).send({ isActive: true }).expect(200);
      await admin.agent.patch(`/api/admin/products/${hidden.id}`).send({ isActive: true }).expect(200);
      expect((await ids()).sort()).toEqual([hidden.id, visible.id].sort());
    });

    it('GR-URN-003: gruplar yalnızca aktif grup ve aktif ürünü olanlar, productCount ile', async () => {
      const d = await dealerAgent('kat-gruplar');
      const empty = await createGroup('Katalog Boş');
      const onlyInactive = await createGroup('Katalog Sadece Pasif');
      await createProduct(onlyInactive.id, 'oi', { isActive: false });
      await createProduct(mutfak, 'cm2');
      const groups = (await d.agent.get('/api/catalog/groups').expect(200)).body as { id: string; name: string; productCount: number }[];
      const ids = groups.map((g) => g.id);
      expect(ids).not.toContain(empty.id);
      expect(ids).not.toContain(onlyInactive.id);
      expect(groups.find((g) => g.id === mutfak)).toEqual({ id: mutfak, name: gname('Katalog Mutfak'), productCount: 2, thumbUrl: null });
      expect(ids.indexOf(mutfak)).toBeLessThan(ids.indexOf(tabak));
    });

    it('GR-URN-003: arama ad (Türkçe duyarsız), barkod ve kodda; tam barkod eşleşmesinde yalnızca o ürün; sayfalama', async () => {
      const d = await dealerAgent('kat-arama');
      const g = await createGroup('Katalog Arama');
      const exact = await createProduct(g.id, 'qz9', { name: `Zzz ${run}` });
      await createProduct(g.id, 'aa', { name: `Aaa ${exact.barcode}` });
      const res = (await d.agent.get('/api/catalog/products').query({ q: exact.barcode }).expect(200)).body;
      // GR-URN-003: birebir barkod eşleşmesinde yalnızca o ürün döner.
      expect(res.total).toBe(1);
      expect(res.items[0].id).toBe(exact.id);

      const byCode = (await search(d.agent, { q: bc('cmk') }).expect(200)).body;
      expect(byCode.items.map((i: { id: string }) => i.id)).toEqual([pMutfak]);
      const folded = (await d.agent.get('/api/catalog/products').query({ q: 'TABAK ÜRÜNÜ' }).expect(200)).body;
      expect(folded.items.map((i: { id: string }) => i.id)).toContain(pTabak);

      const page1 = (await search(d.agent, { groupId: g.id, pageSize: 1 }).expect(200)).body;
      expect(page1).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(page1.items).toHaveLength(1);
    });

    it('GR-URN-003, K-40: görseller sırayla döner (url + thumbUrl)', async () => {
      const d = await dealerAgent('kat-gorsel');
      const up = await admin.agent
        .post('/api/admin/media')
        .attach('files', await png(), 'k1.png')
        .attach('files', await png(), 'k2.png')
        .expect(201);
      const [m1, m2] = up.body.items as { id: string }[];
      const g = await createGroup('Katalog Görsel');
      const p = await createProduct(g.id, 'gs', { mediaIds: [m2.id, m1.id] });
      const detail = (await d.agent.get(`/api/catalog/products/${p.id}`).expect(200)).body;
      expect(detail.images).toEqual([
        { url: `/api/media/${m2.id}/large.webp`, thumbUrl: `/api/media/${m2.id}/thumb.webp` },
        { url: `/api/media/${m1.id}/large.webp`, thumbUrl: `/api/media/${m1.id}/thumb.webp` },
      ]);
    });

    it('GR-URN-003: sort=newest yeni eklenen önce; varsayılan ad sırası; geçersiz sort 400; tam barkod yine en üstte', async () => {
      const d = await dealerAgent('kat-sort');
      const g = await createGroup('Katalog Sıra');
      const b = await createProduct(g.id, 'so1', { name: `Bbb ${run}` });
      const a = await createProduct(g.id, 'so2', { name: `Aaa ${run}` });
      const c = await createProduct(g.id, 'so3', { name: `Ccc ${run}` });
      const idsOf = (res: { body: { items: { id: string }[] } }) => res.body.items.map((i) => i.id);
      const q = { groupId: g.id };
      expect(idsOf(await d.agent.get('/api/catalog/products').query(q).expect(200))).toEqual([a.id, b.id, c.id]);
      expect(idsOf(await d.agent.get('/api/catalog/products').query({ ...q, sort: 'name' }).expect(200))).toEqual([a.id, b.id, c.id]);
      expect(idsOf(await d.agent.get('/api/catalog/products').query({ ...q, sort: 'newest' }).expect(200))).toEqual([c.id, a.id, b.id]);
      await d.agent.get('/api/catalog/products').query({ ...q, sort: 'oldest' }).expect(400);
      const exact = await d.agent.get('/api/catalog/products').query({ q: b.barcode, sort: 'newest' }).expect(200);
      expect(idsOf(exact)).toEqual([b.id]);
    });

    it('GR-URN-003: groups thumbUrl görselli ilk aktif ürünün ilk görseli; görselsiz veya pasif ürünün görseli sayılmaz (null)', async () => {
      const d = await dealerAgent('kat-grupthumb');
      const up = await admin.agent
        .post('/api/admin/media')
        .attach('files', await png(), 'g1.png')
        .attach('files', await png(), 'g2.png')
        .attach('files', await png(), 'g3.png')
        .expect(201);
      const [m1, m2, m3] = up.body.items as { id: string }[];
      const withImg = await createGroup('Katalog Thumb Dolu');
      const noImg = await createGroup('Katalog Thumb Boş');
      const inactiveOnly = await createGroup('Katalog Thumb Pasif');
      await createProduct(withImg.id, 'th0', { name: `Aaa görselsiz ${run}` });
      await createProduct(withImg.id, 'th1', { name: `Bbb ${run}`, mediaIds: [m2.id, m1.id] });
      await createProduct(withImg.id, 'th2', { name: `Ccc ${run}`, mediaIds: [m3.id] });
      await createProduct(noImg.id, 'th3');
      await createProduct(inactiveOnly.id, 'th4', { mediaIds: [m3.id], isActive: false });
      await createProduct(inactiveOnly.id, 'th5');
      const groups = (await d.agent.get('/api/catalog/groups').expect(200)).body as { id: string; thumbUrl: string | null }[];
      const thumb = (id: string) => groups.find((g) => g.id === id)?.thumbUrl;
      expect(thumb(withImg.id)).toBe(`/api/media/${m2.id}/thumb.webp`);
      expect(thumb(noImg.id)).toBeNull();
      expect(thumb(inactiveOnly.id)).toBeNull();
    });

    it('GR-URN-002: stock=in_stock yalnızca stokta olanları getirir; parametre yoksa hepsi; grup productCount değişmez; geçersiz değer 400', async () => {
      const d = await dealerAgent('kat-stokfiltre');
      const g = await createGroup('Katalog Stok Filtre');
      const inS = await createProduct(g.id, 'sf1');
      const outS = await createProduct(g.id, 'sf2', { stockStatus: 'out_of_stock' });
      const idsOf = (res: { body: { items: { id: string }[] } }) => res.body.items.map((i) => i.id).sort();
      const all = await d.agent.get('/api/catalog/products').query({ groupId: g.id }).expect(200);
      expect(idsOf(all)).toEqual([inS.id, outS.id].sort());
      const only = await d.agent.get('/api/catalog/products').query({ groupId: g.id, stock: 'in_stock' }).expect(200);
      expect(idsOf(only)).toEqual([inS.id]);
      expect(only.body.total).toBe(1);
      const searched = await d.agent.get('/api/catalog/products').query({ q: outS.barcode, stock: 'in_stock' }).expect(200);
      expect(searched.body.total).toBe(0);
      await d.agent.get('/api/catalog/products').query({ stock: 'out_of_stock' }).expect(400);
      const groups = (await d.agent.get('/api/catalog/groups').expect(200)).body as { id: string; productCount: number }[];
      expect(groups.find((x) => x.id === g.id)?.productCount).toBe(2);
    });

    it('GR-FIY-001: pasife alınan bayi katalogdan çıkar (oturum geçersiz)', async () => {
      const d = await dealerAgent('kat-pasifbayi');
      await d.agent.get('/api/catalog/groups').expect(200);
      await admin.agent.post(`/api/admin/dealers/${d.dealer.id}/deactivate`).send({ reason: 'test nedeni' }).expect(204);
      // Oturum geçersiz: korumalı uç 401; açık vitrin ise fiyatsız (anonim) döner (K-66).
      await d.agent.get('/api/cart').expect(401);
      const after = (await d.agent.get('/api/catalog/products').expect(200)).body;
      expect(after.priceVisible).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('Güvenlik ve dayanıklılık düzeltmeleri', () => {
    const num = (v: number) => v;

    it('K-16: sayı hücreli barkod yalnızca EAN-8/EAN-13 uzunluğunda kabul edilir; ürün kodu güvenli tam sayı olmalı', async () => {
      const g = gname('Sayı Hücre');
      const buf = await workbook([
        [num(8691234567890), num(12345), 'a', g, 1, '1', null, null, null, null],
        [num(12345678), null, 'b', g, 1, '1', null, null, null, null],
        [num(123456789012), null, 'c', g, 1, '1', null, null, null, null],
        [num(1.5), null, 'd', g, 1, '1', null, null, null, null],
        [num(1.5e20), null, 'e', g, 1, '1', null, null, null, null],
        [bc('sayi-kod'), num(1.5), 'f', g, 1, '1', null, null, null, null],
      ]);
      const res = await importFile(buf, true).expect(200);
      const errs = res.body.errors as { row: number; column: string; message: string }[];
      expect(errs.map((e) => [e.row, e.column])).toEqual([
        [4, 'Barkod'],
        [5, 'Barkod'],
        [6, 'Barkod'],
        [7, 'Ürün kodu'],
      ]);
      expect(errs[0].message).toContain('Metin biçimine');
      expect(res.body.created + res.body.updated + res.body.unchanged).toBe(2);
    });

    it('K-60: yüzde biçimli KDV hücresi (0,2) %20 olur; biçimsiz 0<değer<1 hata', async () => {
      const g = gname('KDV Biçim');
      const pct = await workbook([[bc('pct'), null, 'p', g, 1, '1', 0.2, null, null, null]], undefined, (ws) => {
        ws.getCell('G2').numFmt = '0%';
      });
      await importFile(pct, false).expect(200);
      expect((await productByBarcode(bc('pct'))).vatRate).toBe('20.00');
      const bare = await workbook([[bc('bare'), null, 'p', g, 1, '1', 0.2, null, null, null]]);
      const res = await importFile(bare, true).expect(200);
      expect(res.body.errors).toEqual([
        { row: 2, column: 'KDV oranı', message: 'KDV oranını yüzde olarak yazın, ör. 20.' },
      ]);
    });

    it('K-59: açılınca çok büyük (zip bombası) dosya 400 VALIDATION fields.file', async () => {
      const zip = new JSZip();
      zip.file('xl/sharedStrings.xml', 'a'.repeat(60 * 1024 * 1024));
      zip.file('[Content_Types].xml', '<Types/>');
      const bomb = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      expect(bomb.length).toBeLessThan(1024 * 1024);
      const res = await importFile(bomb, true).expect(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(res.body.fields.file).toContain('50 MB');
    });

    it('K-59: biçimli boş satırlar satır sınırına sayılmaz', async () => {
      const buf = await workbook([[bc('bos'), null, 'b', gname('Boş Satır'), 1, '1', null, null, null, null]], undefined, (ws) => {
        ws.getCell('A200000').numFmt = '@';
        ws.getRow(150000).height = 20;
      });
      const res = await importFile(buf, true).expect(200);
      expect(res.body).toMatchObject({ total: 1, errors: [] });
    });

    it('K-62: 40 megapikselden büyük görsel errors\'a düşer', async () => {
      const huge = await sharp({ create: { width: 7000, height: 7000, channels: 3, background: '#ffffff' } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      expect(huge.length).toBeLessThan(8 * 1024 * 1024);
      const res = await admin.agent
        .post('/api/admin/media')
        .attach('files', huge, 'dev.png')
        .attach('files', await png(), 'normal.png')
        .expect(201);
      expect(res.body.items.map((i: { filename: string }) => i.filename)).toEqual(['normal.png']);
      expect(res.body.errors[0]).toMatchObject({ filename: 'dev.png' });
      expect(res.body.errors[0].message).toContain('40 megapiksel');
    }, 30_000);

    it('K-62: istek başına 20 dosya sınırı aşılırsa 413 TOO_MANY_FILES', async () => {
      const tiny = Buffer.from('x');
      let req = admin.agent.post('/api/admin/media');
      for (let i = 0; i < 21; i++) req = req.attach('files', tiny, `f${i}.png`);
      const res = await req.expect(413);
      expect(res.body.code).toBe('TOO_MANY_FILES');
      const big = Buffer.alloc(8 * 1024 * 1024 + 10);
      const tooBig = await admin.agent.post('/api/admin/media').attach('files', big, 'b.png').expect(413);
      expect(tooBig.body.code).toBe('FILE_TOO_LARGE');
    });

    it('K-62: DB hatası veren dosya errors\'a düşer, diğerleri kalır ve diske yazılan dosya silinir', async () => {
      const { readdir } = await import('node:fs/promises');
      const before = (await readdir(process.env.MEDIA_DIR!)).length;
      const audit = app.get(AuditService);
      const spy = vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('db düştü'));
      try {
        const res = await admin.agent
          .post('/api/admin/media')
          .attach('files', await png(), 'birinci.png')
          .attach('files', await png(), 'ikinci.png')
          .expect(201);
        expect(res.body.items.map((i: { filename: string }) => i.filename)).toEqual(['ikinci.png']);
        expect(res.body.errors).toEqual([{ filename: 'birinci.png', message: 'Dosya kaydedilemedi, tekrar deneyin.' }]);
      } finally {
        spy.mockRestore();
      }
      expect((await readdir(process.env.MEDIA_DIR!)).length).toBe(before + 1);
    });

    it('GR-YON-001: multipart uçlarda çapraz kaynak istekleri 403 (SameOriginGuard); başlıksız ve aynı kaynak serbest', async () => {
      const file = await png();
      await admin.agent.post('/api/admin/media').set('Origin', 'http://evil.example').attach('files', file, 'a.png').expect(403);
      await admin.agent.post('/api/admin/media').set('Sec-Fetch-Site', 'cross-site').attach('files', file, 'a.png').expect(403);
      await admin.agent.post('/api/admin/media').set('Sec-Fetch-Site', 'same-site').attach('files', file, 'a.png').expect(403);
      await admin.agent
        .post('/api/admin/products/import?dryRun=true')
        .set('Origin', 'http://evil.example')
        .attach('file', await workbook([]), 'u.xlsx')
        .expect(403);
      await admin.agent
        .post('/api/admin/media')
        .set('Origin', 'http://localhost:5180')
        .set('Sec-Fetch-Site', 'same-origin')
        .attach('files', file, 'ok.png')
        .expect(201);
      await admin.agent.post('/api/admin/media').set('Sec-Fetch-Site', 'none').attach('files', file, 'ok2.png').expect(201);
    });

    it('K-59: değişmeyen satırlar unchanged sayılır; pasif gruba düşen satır warnings verir', async () => {
      const g = await createGroup('Excel Rapor');
      const rows = [[bc('rp1'), null, 'Rapor', g.name, 2, '9,90', null, null, null, null]];
      await importFile(await workbook(rows), false).expect(200);
      const again = await importFile(await workbook(rows), false).expect(200);
      expect(again.body).toMatchObject({ total: 1, created: 0, updated: 0, unchanged: 1, warnings: [] });
      const changed = await importFile(await workbook([[bc('rp1'), null, 'Rapor', g.name, 2, '10,00', null, null, null, null]]), false).expect(200);
      expect(changed.body).toMatchObject({ created: 0, updated: 1, unchanged: 0 });

      await admin.agent.patch(`/api/admin/product-groups/${g.id}`).send({ isActive: false }).expect(200);
      const warned = await importFile(await workbook(rows), true).expect(200);
      expect(warned.body.warnings).toEqual([{ row: 2, message: 'Ürün grubu pasif; ürün katalogda görünmez.' }]);
    });
  });
});
