// Ana sayfa kampanya görselleri (banner) (e2e). API: docs/api/banner-api.md. Gereksinim: K-65, K-62, GR-YON-001.
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import { DB, type Database } from '../src/database/database.module.js';
import { adminUsers, auditLog, banners, dealers, media, sessions } from '../src/database/schema.js';
import { companyTitleKey } from '../src/dealers/company-title.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);
const HOUR = 3_600_000;

describe('Banner (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let adminId: string;
  let dealerId: string;
  let admin: ReturnType<typeof request.agent>;
  let dealer: ReturnType<typeof request.agent>;
  let clockOffset = 0;
  const bannerIds: string[] = [];
  const mediaIds: string[] = [];

  const upload = async (name: string) => {
    const png = await sharp({ create: { width: 1200, height: 400, channels: 3, background: '#336699' } }).png().toBuffer();
    const res = await admin.post('/api/admin/media').attach('files', png, `${name}-${run}.png`).expect(201);
    const id = res.body.items[0].id as string;
    mediaIds.push(id);
    return id;
  };
  const create = async (mediaId: string, over: Record<string, unknown> = {}) => {
    const res = await admin.post('/api/admin/banners').send({ mediaId, title: `Kampanya ${run}`, ...over });
    if (res.status === 201) bannerIds.push(res.body.id);
    return res;
  };
  const visible = async () => (await dealer.get('/api/catalog/banners').expect(200)).body as { id: string }[];
  const ids = (list: { id: string }[]) => list.map((b) => b.id).filter((i) => bannerIds.includes(i));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(Date.now() + clockOffset) })
      .overrideProvider(MAIL_SERVICE)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get<Database>(DB);
    const [a] = await db
      .insert(adminUsers)
      .values({ email: `admin-${run}@test.example`, fullName: 'Admin', passwordHash: await hash(PASSWORD) })
      .returning();
    adminId = a.id;
    admin = request.agent(app.getHttpServer());
    await admin.post('/api/auth/admin/login').send({ email: a.email, password: PASSWORD }).expect(200);
    const title = `Bayi banner ${run}`;
    const [d] = await db
      .insert(dealers)
      .values({
        companyTitle: title, companyTitleKey: companyTitleKey(title), contactName: 'A', email: `b-${run}@test.example`,
        phone: '0532', city: 'K', district: 'M', address: 'A', source: 'invitation', status: 'active',
        passwordHash: await hash(PASSWORD), emailVerifiedAt: new Date(),
      })
      .returning();
    dealerId = d.id;
    dealer = request.agent(app.getHttpServer());
    await dealer.post('/api/auth/dealer/login').send({ email: d.email, password: PASSWORD }).expect(200);
  });

  afterAll(async () => {
    if (db) {
      if (bannerIds.length) await db.delete(banners).where(inArray(banners.id, bannerIds));
      await db.delete(auditLog).where(inArray(auditLog.entityId, [...bannerIds, ...mediaIds, adminId, dealerId, 'all']));
      await db.delete(sessions).where(inArray(sessions.subjectId, [adminId, dealerId]));
      if (mediaIds.length) await db.delete(media).where(inArray(media.id, mediaIds));
      await db.delete(dealers).where(eq(dealers.id, dealerId));
      await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
    }
    await app?.close();
    await rm(process.env.MEDIA_DIR!, { recursive: true, force: true });
  });

  it('K-65, GR-YON-001: anonim 401; bayi Admin uçlarında 403; Admin bayi ucunda 403', async () => {
    const anon = request(app.getHttpServer());
    await anon.get('/api/catalog/banners').expect(401);
    await anon.get('/api/admin/banners').expect(401);
    await admin.get('/api/catalog/banners').expect(403);
    await dealer.get('/api/admin/banners').expect(403);
    await dealer.post('/api/admin/banners').send({}).expect(403);
    await dealer.put('/api/admin/banners/order').send({ ids: [] }).expect(403);
    await dealer.patch(`/api/admin/banners/${randomUUID()}`).send({}).expect(403);
    await dealer.delete(`/api/admin/banners/${randomUUID()}`).expect(403);
  });

  it('K-65: oluştur/listele/güncelle/sil; yeni banner sona eklenir, varsayılan aktif; audit kaydı', async () => {
    const m = await upload('a');
    const res = await create(m, { subtitle: ' Alt başlık ', linkPath: '/katalog?grup=bardak:x' }).then((r) => r.body);
    expect(res).toMatchObject({
      mediaId: m, title: `Kampanya ${run}`, subtitle: 'Alt başlık', linkPath: '/katalog?grup=bardak:x',
      imageUrl: `/api/media/${m}/large.webp`, thumbUrl: `/api/media/${m}/thumb.webp`,
      isActive: true, startsAt: null, endsAt: null,
    });
    const second = (await create(m, { title: 'İkinci', linkPath: '/' })).body;
    expect(second.sortOrder).toBe(res.sortOrder + 1);

    const upd = await admin.patch(`/api/admin/banners/${res.id}`).send({ title: 'Yeni', subtitle: null, linkPath: null, isActive: false }).expect(200);
    expect(upd.body).toMatchObject({ title: 'Yeni', subtitle: null, linkPath: null, isActive: false });
    const list = (await admin.get('/api/admin/banners').expect(200)).body as { id: string }[];
    expect(ids(list)).toEqual([res.id, second.id]);

    await admin.delete(`/api/admin/banners/${second.id}`).expect(204);
    await admin.delete(`/api/admin/banners/${second.id}`).expect(404);
    await admin.patch(`/api/admin/banners/${second.id}`).send({ title: 'x' }).expect(404);

    const audit = await db.select().from(auditLog).where(inArray(auditLog.entityId, [res.id, second.id]));
    expect(audit.map((a) => a.action).sort()).toEqual(['banner.created', 'banner.created', 'banner.deleted', 'banner.updated']);
    expect(audit.every((a) => a.actorType === 'admin' && a.actorId === adminId)).toBe(true);
  });

  it('K-65: zorunlu alanlar ve bulunamayan görsel 400 VALIDATION', async () => {
    const m = await upload('v');
    for (const body of [{ mediaId: m }, { mediaId: m, title: '   ' }, { title: 'x' }, { mediaId: 'abc', title: 'x' }]) {
      const res = await admin.post('/api/admin/banners').send(body).expect(400);
      expect(res.body.code).toBe('VALIDATION');
    }
    const res = await admin.post('/api/admin/banners').send({ mediaId: randomUUID(), title: 'x' }).expect(400);
    expect(res.body.fields).toHaveProperty('mediaId');
  });

  it('K-65: linkPath yalnızca uygulama içi yol; https://, //, javascript:, ters eğik çizgi reddedilir', async () => {
    const m = await upload('l');
    for (const bad of ['https://kotu.com', '//kotu.com', 'javascript:alert(1)', 'katalog', '/\\kotu.com', '/a b', 'http://kotu.com/x', '/\tx']) {
      const res = await admin.post('/api/admin/banners').send({ mediaId: m, title: 'x', linkPath: bad }).expect(400);
      expect([bad, Object.keys(res.body.fields)]).toEqual([bad, ['linkPath']]);
    }
    const ok = await create(m, { linkPath: '/katalog/urun/12?x=1#a' });
    expect(ok.status).toBe(201);
    const bad = await admin.patch(`/api/admin/banners/${ok.body.id}`).send({ linkPath: '//kotu.com' }).expect(400);
    expect(bad.body.fields).toHaveProperty('linkPath');
    // Veritabanı da reddeder (uygulama kodu atlansa bile).
    await expect(db.update(banners).set({ linkPath: '//kotu.com' }).where(eq(banners.id, ok.body.id))).rejects.toThrow();
  });

  it('K-65: sıralama (PUT /order) hem admin hem bayi listesini değiştirir; eksik/tekrarlı/yabancı id 400', async () => {
    const m = await upload('o');
    const [a, b, c] = [await create(m, { title: 'A' }), await create(m, { title: 'B' }), await create(m, { title: 'C' })].map((r) => r.body.id as string);
    const all = ((await admin.get('/api/admin/banners')).body as { id: string }[]).map((x) => x.id);
    const reorder = (list: string[]) => admin.put('/api/admin/banners/order').send({ ids: list });

    const others = all.filter((i) => ![a, b, c].includes(i));
    const res = await reorder([...others, c, a, b]).expect(200);
    const only = (list: { id: string }[]) => list.map((x) => x.id).filter((i) => [a, b, c].includes(i));
    expect(only(res.body)).toEqual([c, a, b]);
    expect(only(await visible())).toEqual([c, a, b]);

    expect((await reorder([a, b]).expect(400)).body.fields).toHaveProperty('ids');
    await reorder([...all, a]).expect(400);
    await reorder([...all.slice(1), randomUUID()]).expect(400);
    expect(only((await admin.get('/api/admin/banners')).body)).toEqual([c, a, b]);
  });

  it('K-65: pasif banner bayiden gizlenir; bayi alanları yalnızca id, title, subtitle, linkPath, imageUrl, thumbUrl', async () => {
    const m = await upload('p');
    const shown = (await create(m, { title: 'Görünür' })).body;
    const hidden = (await create(m, { title: 'Pasif', isActive: false })).body;
    const list = await visible();
    expect(ids(list)).toContain(shown.id);
    expect(ids(list)).not.toContain(hidden.id);
    expect(list.find((b) => b.id === shown.id)).toEqual({
      id: shown.id, title: 'Görünür', subtitle: null, linkPath: null,
      imageUrl: `/api/media/${m}/large.webp`, thumbUrl: `/api/media/${m}/thumb.webp`,
    });
    await admin.patch(`/api/admin/banners/${hidden.id}`).send({ isActive: true }).expect(200);
    expect(ids(await visible())).toContain(hidden.id);
  });

  it('K-65: tarih aralığı (sahte saat): başlamamış ve bitmiş gizlenir, aralıktaki görünür; bitiş > başlangıç', async () => {
    const m = await upload('t');
    const now = Date.now();
    const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
    const future = (await create(m, { title: 'Gelecek', startsAt: iso(2 * HOUR), endsAt: iso(5 * HOUR) })).body.id as string;
    const open = (await create(m, { title: 'Açık', startsAt: iso(-HOUR) })).body.id as string;
    const ending = (await create(m, { title: 'Bitiyor', endsAt: iso(HOUR) })).body.id as string;
    try {
      let seen = ids(await visible());
      expect(seen).toContain(open);
      expect(seen).toContain(ending);
      expect(seen).not.toContain(future);

      clockOffset = 3 * HOUR; // gelecek banner yayında, bitiyor bitmiş
      seen = ids(await visible());
      expect(seen).toContain(future);
      expect(seen).not.toContain(ending);

      clockOffset = 6 * HOUR; // hepsinden sonra
      seen = ids(await visible());
      expect(seen).not.toContain(future);
      expect(seen).toContain(open);
    } finally {
      clockOffset = 0;
    }
    const bad = await admin
      .post('/api/admin/banners')
      .send({ mediaId: m, title: 'x', startsAt: iso(HOUR), endsAt: iso(HOUR) })
      .expect(400);
    expect(bad.body.fields).toHaveProperty('endsAt');
    await admin.post('/api/admin/banners').send({ mediaId: m, title: 'x', startsAt: '2026-11-20' }).expect(400);
    // Yalnızca bitişi güncellerken mevcut başlangıçla çelişirse 400.
    await admin.patch(`/api/admin/banners/${future}`).send({ endsAt: iso(HOUR) }).expect(400);
    const istanbul = await admin.patch(`/api/admin/banners/${open}`).send({ startsAt: '2026-11-20T00:00:00+03:00' }).expect(200);
    expect(istanbul.body.startsAt).toBe('2026-11-19T21:00:00.000Z');
  });

  it('K-62, K-65: banner da kullanılan görsel silinemez (409 MEDIA_IN_USE), usedBy sayar; banner silinince silinebilir', async () => {
    const m = await upload('u');
    const b = (await create(m)).body.id as string;
    const used = (await admin.get('/api/admin/media').query({ q: `u-${run}` }).expect(200)).body.items[0];
    expect(used.usedBy).toBe(1);
    expect((await admin.get('/api/admin/media').query({ q: `u-${run}`, unused: 'true' })).body.items).toHaveLength(0);
    const res = await admin.delete(`/api/admin/media/${m}`).expect(409);
    expect(res.body.code).toBe('MEDIA_IN_USE');
    await admin.delete(`/api/admin/banners/${b}`).expect(204);
    await admin.delete(`/api/admin/media/${m}`).expect(204);
  });
});
