// E-posta outbox (e2e). Gereksinimler: GR-BLD-001, K-17, K-26. API: docs/api/siparis-api.md.
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq, inArray, like } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import { DB, type Database } from '../src/database/database.module.js';
import { adminUsers, auditLog, dealers, notificationOutbox, sessions } from '../src/database/schema.js';
import { companyTitleKey } from '../src/dealers/company-title.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';
import { MAX_ATTEMPTS, NotificationsService } from '../src/notifications/notifications.service.js';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);
const MIN = 60_000;

describe('Bildirim outbox (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let svc: NotificationsService;
  let admin: ReturnType<typeof request.agent>;
  let adminId: string;
  let dealerId: string;
  let dealer: ReturnType<typeof request.agent>;
  let clockOffset = 0;
  const mail = {
    sendNewApplication: vi.fn(),
    sendPasswordReset: vi.fn(),
    sendRejection: vi.fn(),
  };
  const to = (n: string) => `${n}-${run}@test.example`;
  const row = async (id: string) => (await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, id)))[0];
  const now = () => Date.now() + clockOffset;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(now()) })
      .overrideProvider(MAIL_SERVICE)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get<Database>(DB);
    svc = app.get(NotificationsService);
    const [a] = await db
      .insert(adminUsers)
      .values({ email: to('admin'), fullName: 'Admin', passwordHash: await hash(PASSWORD) })
      .returning();
    adminId = a.id;
    admin = request.agent(app.getHttpServer());
    await admin.post('/api/auth/admin/login').send({ email: a.email, password: PASSWORD }).expect(200);
    const title = `Bayi bildirim ${run}`;
    const [d] = await db
      .insert(dealers)
      .values({
        companyTitle: title, companyTitleKey: companyTitleKey(title), contactName: 'A', email: to('dealer'),
        phone: '0532', city: 'K', district: 'M', address: 'A', source: 'invitation', status: 'active',
        passwordHash: await hash(PASSWORD), emailVerifiedAt: new Date(),
      })
      .returning();
    dealerId = d.id;
    dealer = request.agent(app.getHttpServer());
    await dealer.post('/api/auth/dealer/login').send({ email: d.email, password: PASSWORD }).expect(200);
  });

  beforeEach(() => {
    clockOffset = 0;
    for (const fn of Object.values(mail)) fn.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (db) {
      await db.delete(notificationOutbox).where(like(notificationOutbox.recipient, `%-${run}@test.example`));
      await db.delete(auditLog).where(inArray(auditLog.actorId, [adminId]));
      await db.delete(sessions).where(inArray(sessions.subjectId, [adminId, dealerId]));
      await db.delete(dealers).where(eq(dealers.id, dealerId));
      await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
    }
    await app?.close();
  });

  it('GR-BLD-001: başarısız gönderim pending kalır (deneme 1, hata kaydı, +1 dk); zamanı gelince yeniden denenir ve gönderilir', async () => {
    mail.sendNewApplication.mockRejectedValueOnce(new Error('smtp down'));
    const id = await svc.enqueue('new_application', to('r1'), { companyTitle: 'Firma' });
    await svc.dispatchNow([id]);
    let r = await row(id);
    expect(r).toMatchObject({ status: 'pending', attempts: 1, lastError: 'smtp down', sentAt: null });
    const wait = r.nextAttemptAt.getTime() - now();
    expect(wait).toBeGreaterThan(MIN - 5_000);
    expect(wait).toBeLessThanOrEqual(MIN);

    // Zamanı gelmeden iş dokunmaz.
    await svc.processDue();
    expect(mail.sendNewApplication).toHaveBeenCalledTimes(1);

    clockOffset = 2 * MIN;
    await svc.processDue();
    expect(mail.sendNewApplication).toHaveBeenCalledTimes(2);
    expect(mail.sendNewApplication).toHaveBeenLastCalledWith(to('r1'), 'Firma');
    r = await row(id);
    expect(r).toMatchObject({ status: 'sent', attempts: 2, lastError: null });
    expect(r.sentAt).toBeInstanceOf(Date);
    // Gönderilen satır bir daha gönderilmez.
    clockOffset = 10 * MIN;
    await svc.processDue();
    expect(mail.sendNewApplication).toHaveBeenCalledTimes(2);
  });

  it('GR-BLD-001: geri çekilme 1, 5, 15, 60 dk; 8. başarısız denemeden sonra failed ve deneme sayısı 8', async () => {
    mail.sendNewApplication.mockRejectedValue(new Error('smtp down'));
    const id = await svc.enqueue('new_application', to('r2'), { companyTitle: 'Firma' });
    const delays: number[] = [];
    await svc.dispatchNow([id]);
    for (let n = 1; n < MAX_ATTEMPTS; n++) {
      const r = await row(id);
      expect(r).toMatchObject({ status: 'pending', attempts: n });
      delays.push(Math.round((r.nextAttemptAt.getTime() - now()) / MIN));
      clockOffset += 61 * MIN;
      await svc.processDue();
    }
    expect(delays).toEqual([1, 5, 15, 60, 60, 60, 60]);
    const r = await row(id);
    expect(r).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS, lastError: 'smtp down' });
    expect(mail.sendNewApplication).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    // failed satır iş tarafından bir daha denenmez.
    clockOffset += 600 * MIN;
    await svc.processDue();
    expect(mail.sendNewApplication).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('GR-BLD-001: aynı satıra eşzamanlı iki deneme tek e-posta gönderir', async () => {
    const id = await svc.enqueue('new_application', to('r3'), { companyTitle: 'Firma' });
    await Promise.all([svc.attempt(id, true), svc.attempt(id, true), svc.attempt(id)]);
    expect(mail.sendNewApplication).toHaveBeenCalledTimes(1);
  });

  it('GR-BLD-001: iş transaction ı geri alınırsa outbox satırı da yoktur; commit olursa vardır', async () => {
    await expect(
      db.transaction(async (tx) => {
        await svc.enqueue('rejection', to('rb'), {}, tx);
        throw new Error('iş hatası');
      }),
    ).rejects.toThrow('iş hatası');
    expect(await db.select().from(notificationOutbox).where(eq(notificationOutbox.recipient, to('rb')))).toHaveLength(0);

    await db.transaction(async (tx) => {
      await svc.enqueue('rejection', to('rb'), {}, tx);
    });
    expect(await db.select().from(notificationOutbox).where(eq(notificationOutbox.recipient, to('rb')))).toHaveLength(1);
  });

  it('K-39: token içeren e-postada bağlantı gönderilince payload tan silinir', async () => {
    const id = await svc.enqueue('password_reset', to('tk1'), { link: 'http://x/#/sifre-sifirla?token=GIZLI-TOKEN' });
    await svc.dispatchNow([id]);
    expect(mail.sendPasswordReset).toHaveBeenCalledWith(to('tk1'), 'http://x/#/sifre-sifirla?token=GIZLI-TOKEN');
    const r = await row(id);
    expect(r.status).toBe('sent');
    expect(r.payload).toEqual({ link: null });
    expect(JSON.stringify(r)).not.toContain('GIZLI-TOKEN');
  });

  it('K-39: gönderilemeyen token e-postasında bağlantı 24 saat sonra temizlenir; admin retry 409 PAYLOAD_EXPIRED', async () => {
    mail.sendPasswordReset.mockRejectedValue(new Error('smtp down'));
    const id = await svc.enqueue('password_reset', to('tk2'), { link: 'http://x/#/t?token=GIZLI-2' });
    await svc.dispatchNow([id]);
    for (let n = 1; n < MAX_ATTEMPTS; n++) {
      clockOffset += 61 * MIN;
      await svc.processDue();
    }
    let r = await row(id);
    expect(r.status).toBe('failed');
    expect((r.payload as { link: string | null }).link).toBe('http://x/#/t?token=GIZLI-2');

    // Satır gerçekte yeni oluştu: 24 saat geçmişse temizlik tetiklenir.
    await db.update(notificationOutbox).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(notificationOutbox.id, id));
    await svc.processDue();
    r = await row(id);
    expect(r.payload).toEqual({ link: null });

    const res = await admin.post(`/api/admin/notifications/${id}/retry`).expect(409);
    expect(res.body.code).toBe('PAYLOAD_EXPIRED');
  });

  it('GR-BLD-001: Admin failed listesini görür (payload dönmez) ve retry ile yeniden dener; yetki', async () => {
    mail.sendRejection.mockRejectedValue(new Error('smtp down'));
    const id = await svc.enqueue('rejection', to('ad1'), {});
    await svc.dispatchNow([id]);
    for (let n = 1; n < MAX_ATTEMPTS; n++) {
      clockOffset += 61 * MIN;
      await svc.processDue();
    }
    const list = await admin.get('/api/admin/notifications').query({ status: 'failed', pageSize: 100 }).expect(200);
    const item = list.body.items.find((i: { id: string }) => i.id === id);
    expect(item).toMatchObject({ id, kind: 'rejection', recipient: to('ad1'), status: 'failed', attempts: MAX_ATTEMPTS, lastError: 'smtp down' });
    expect(item).not.toHaveProperty('payload');
    expect(list.body.items.every((i: { status: string }) => i.status === 'failed')).toBe(true);

    mail.sendRejection.mockResolvedValue(undefined);
    const retried = await admin.post(`/api/admin/notifications/${id}/retry`).expect(200);
    expect(retried.body).toMatchObject({ id, status: 'sent', attempts: 1 });
    await admin.post(`/api/admin/notifications/${id}/retry`).expect(409).expect((r) => expect(r.body.code).toBe('ALREADY_SENT'));
    await admin.post(`/api/admin/notifications/${randomUUID()}/retry`).expect(404);
    await admin.get('/api/admin/notifications').query({ status: 'bilinmeyen' }).expect(400);

    await dealer.get('/api/admin/notifications').expect(403);
    await dealer.post(`/api/admin/notifications/${id}/retry`).expect(403);
    await request(app.getHttpServer()).get('/api/admin/notifications').expect(401);
  });
});
