import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import { DB, type Database } from '../src/database/database.module.js';
import {
  adminUsers,
  auditLog,
  authTokens,
  dealers,
  sessions,
} from '../src/database/schema.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthTokensService } from '../src/auth/auth-tokens.service.js';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);
const email = (name: string) => `${name}-${run}@test.example`;

describe('Kimlik doğrulama (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let tokens: AuthTokensService;
  let offsetMs = 0;
  const mails: { kind: string; to: string; link: string }[] = [];
  const created = { dealers: [] as string[], admins: [] as string[] };

  const lastToken = (to: string) => {
    const mail = [...mails].reverse().find((m) => m.to === to);
    // Arayüz hash yönlendirmesi kullanır: https://.../#/sifre-sifirla?tur=bayi&token=...
    const url = new URL(mail!.link);
    expect(url.hash.startsWith('#/')).toBe(true);
    return new URLSearchParams(url.hash.split('?')[1]).get('token')!;
  };

  const resetRequest = async (body: {
    email: string;
    type: 'admin' | 'dealer';
  }) => {
    await request(app.getHttpServer())
      .post('/api/auth/password-reset/request')
      .send(body)
      .expect(202);
    await app.get(AuthService).whenIdle(); // arka plan işi bitsin
  };

  async function makeDealer(
    name: string,
    status: (typeof dealers.$inferInsert)['status'] = 'active',
  ) {
    const [d] = await db
      .insert(dealers)
      .values({
        companyTitle: `Firma ${name} ${run}`,
        contactName: 'Yetkili',
        email: email(name),
        phone: '5550000000',
        city: 'İstanbul',
        district: 'Fatih',
        address: 'Adres',
        status,
        source: 'application',
        passwordHash: await hash(PASSWORD),
      })
      .returning();
    created.dealers.push(d.id);
    return d;
  }

  async function makeAdmin(name: string, isActive = true) {
    const [a] = await db
      .insert(adminUsers)
      .values({
        email: email(name),
        fullName: `Admin ${name}`,
        passwordHash: await hash(PASSWORD),
        isActive,
      })
      .returning();
    created.admins.push(a.id);
    return a;
  }

  const dealerLogin = (
    agent: ReturnType<typeof request.agent> | typeof request,
    e: string,
    p = PASSWORD,
  ) =>
    (agent === request
      ? request(app.getHttpServer())
      : (agent as ReturnType<typeof request.agent>)
    )
      .post('/api/auth/dealer/login')
      .send({ email: e, password: p });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(Date.now() + offsetMs) })
      .overrideProvider(MAIL_SERVICE)
      .useValue({
        sendPasswordReset: (to: string, link: string) => {
          mails.push({ kind: 'reset', to, link });
          return Promise.resolve();
        },
        sendEmailVerification: (to: string, link: string) => {
          mails.push({ kind: 'verify', to, link });
          return Promise.resolve();
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get<Database>(DB);
    tokens = app.get(AuthTokensService);
  });

  afterAll(async () => {
    if (db) {
      await db
        .delete(sessions)
        .where(
          inArray(sessions.subjectId, [...created.dealers, ...created.admins]),
        );
      await db
        .delete(authTokens)
        .where(
          inArray(authTokens.subjectId, [
            ...created.dealers,
            ...created.admins,
          ]),
        );
      await db
        .delete(auditLog)
        .where(
          inArray(auditLog.entityId, [...created.dealers, ...created.admins]),
        );
      if (created.dealers.length)
        await db.delete(dealers).where(inArray(dealers.id, created.dealers));
      if (created.admins.length)
        await db
          .delete(adminUsers)
          .where(inArray(adminUsers.id, created.admins));
    }
    await app?.close();
  });

  afterEach(() => {
    offsetMs = 0;
  });

  describe('bayi girişi', () => {
    it('GR-BAYI-007: doğru şifreyle giriş yapar, httpOnly + SameSite=Lax çerez verir, /me döner', async () => {
      const d = await makeDealer('giris');
      const agent = request.agent(app.getHttpServer());
      const res = await dealerLogin(agent, email('giris')).expect(200);
      expect(res.body).toEqual({
        type: 'dealer',
        id: d.id,
        email: d.email,
        name: d.companyTitle,
      });
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(/amisos_session=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      await agent.get('/api/auth/me').expect(200).expect(res.body);
    });

    it('GR-BAYI-007: e-posta büyük/küçük harf duyarsız', async () => {
      await makeDealer('buyuk');
      await dealerLogin(request, email('buyuk').toUpperCase()).expect(200);
    });

    it('GR-BAYI-007: yanlış şifre ve bilinmeyen e-posta aynı genel yanıtı alır', async () => {
      await makeDealer('yanlis');
      const wrong = await dealerLogin(
        request,
        email('yanlis'),
        'yanlis-sifre-1',
      ).expect(401);
      const unknown = await dealerLogin(request, email('yok')).expect(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.headers['set-cookie']).toBeUndefined();
    });

    it.each(['pending_email', 'pending_approval', 'rejected'] as const)(
      'GR-BAYI-006: %s bayi giriş yapamaz, yanıt genel hata ile aynı',
      async (status) => {
        const name = `st-${status}`;
        await makeDealer(name, status === 'rejected' ? 'active' : status).then(
          async (d) => {
            if (status === 'rejected') {
              await db
                .update(dealers)
                .set({ status: 'rejected', rejectionReason: 'test' })
                .where(eq(dealers.id, d.id));
            }
          },
        );
        const res = await dealerLogin(request, email(name)).expect(401);
        const unknown = await dealerLogin(request, email('yok2')).expect(401);
        expect(res.body).toEqual(unknown.body);
      },
    );

    it('K-54: şifresi doğru pasif bayi açık mesaj (403 ACCOUNT_PASSIVE) alır; yanlış şifrede genel hata', async () => {
      await makeDealer('pasif-mesaj', 'passive');
      const res = await dealerLogin(request, email('pasif-mesaj')).expect(403);
      expect(res.body.code).toBe('ACCOUNT_PASSIVE');
      expect(res.headers['set-cookie']).toBeUndefined();
      const wrong = await dealerLogin(
        request,
        email('pasif-mesaj'),
        'Yanlis-Sifre-1',
      ).expect(401);
      const unknown = await dealerLogin(request, email('yok3')).expect(401);
      expect(wrong.body).toEqual(unknown.body);
    });

    it('GR-BAYI-006: pasife alınan bayinin açık oturumu sonraki istekte reddedilir; yeniden aktif edilince yeni girişle döner', async () => {
      const d = await makeDealer('pasife');
      const agent = request.agent(app.getHttpServer());
      await dealerLogin(agent, email('pasife')).expect(200);
      await agent.get('/api/auth/me').expect(200);

      await db
        .update(dealers)
        .set({ status: 'passive' })
        .where(eq(dealers.id, d.id));
      await agent.get('/api/auth/me').expect(401);

      await db
        .update(dealers)
        .set({ status: 'active' })
        .where(eq(dealers.id, d.id));
      await dealerLogin(request, email('pasife')).expect(200);
    });

    it('GR-YON-001: bayi bilgileriyle admin girişi yapılamaz', async () => {
      await makeDealer('capraz');
      await request(app.getHttpServer())
        .post('/api/auth/admin/login')
        .send({ email: email('capraz'), password: PASSWORD })
        .expect(401);
    });
  });

  describe('admin girişi', () => {
    it('GR-YON-001: doğru şifreyle giriş yapar ve giriş audit_log a yazılır', async () => {
      const a = await makeAdmin('adm');
      const agent = request.agent(app.getHttpServer());
      const res = await agent
        .post('/api/auth/admin/login')
        .send({ email: email('adm'), password: PASSWORD })
        .expect(200);
      expect(res.body).toEqual({
        type: 'admin',
        id: a.id,
        email: a.email,
        name: a.fullName,
      });
      await agent.get('/api/auth/me').expect(200);
      const logs = await db
        .select()
        .from(auditLog)
        .where(
          and(eq(auditLog.entityId, a.id), eq(auditLog.action, 'auth.login')),
        );
      expect(logs).toHaveLength(1);
    });

    it('GR-YON-001: yanlış şifre reddedilir ve audit_log a yazılır', async () => {
      const a = await makeAdmin('admyanlis');
      await request(app.getHttpServer())
        .post('/api/auth/admin/login')
        .send({ email: email('admyanlis'), password: 'yanlis-sifre-1' })
        .expect(401);
      await app.get(AuthService).whenIdle(); // audit yanıtı bekletmeden yazılır
      const logs = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entityId, a.id),
            eq(auditLog.action, 'auth.login_failed'),
          ),
        );
      expect(logs).toHaveLength(1);
      expect(logs[0].actorType).toBe('system');
    });

    it('GR-YON-001: is_active=false admin giriş yapamaz; açık oturumu da reddedilir', async () => {
      const a = await makeAdmin('admpasif');
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/auth/admin/login')
        .send({ email: email('admpasif'), password: PASSWORD })
        .expect(200);
      await db
        .update(adminUsers)
        .set({ isActive: false })
        .where(eq(adminUsers.id, a.id));
      await agent.get('/api/auth/me').expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/admin/login')
        .send({ email: email('admpasif'), password: PASSWORD })
        .expect(401);
    });
  });

  describe('oturum', () => {
    it('GR-BAYI-007: giriş yoksa /me 401 döner', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('GR-BAYI-007: çıkıştan sonra /me 401 döner ve oturum satırı silinir', async () => {
      const d = await makeDealer('cikis');
      const agent = request.agent(app.getHttpServer());
      await dealerLogin(agent, email('cikis')).expect(200);
      await agent.post('/api/auth/logout').expect(204);
      await agent.get('/api/auth/me').expect(401);
      expect(
        await db.select().from(sessions).where(eq(sessions.subjectId, d.id)),
      ).toHaveLength(0);
    });

    it('GR-BAYI-007: çıkış oturumsuz da 204 döner', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(204);
    });

    it('GR-BAYI-007: oturum 7 gün hareketsizlikten sonra düşer, kullanımla kayar', async () => {
      await makeDealer('kayan');
      const agent = request.agent(app.getHttpServer());
      await dealerLogin(agent, email('kayan')).expect(200);
      offsetMs = 6 * 24 * 3600_000;
      await agent.get('/api/auth/me').expect(200); // süre uzar
      offsetMs = 12 * 24 * 3600_000;
      await agent.get('/api/auth/me').expect(200);
      offsetMs = 20 * 24 * 3600_000;
      await agent.get('/api/auth/me').expect(401);
    });

    it('GR-YON-001: bayi AdminGuard korumalı yola giremez (403), anonim 401', async () => {
      const { Controller, Get, UseGuards } = await import('@nestjs/common');
      const { AdminGuard, DealerGuard } =
        await import('../src/auth/auth.guards.js');
      @Controller('guard-test')
      class GuardTestController {
        @Get('admin') @UseGuards(AdminGuard) admin() {
          return { ok: true };
        }
        @Get('dealer') @UseGuards(DealerGuard) dealer() {
          return { ok: true };
        }
      }
      const { AuthModule } = await import('../src/auth/auth.module.js');
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule, AuthModule],
        controllers: [GuardTestController],
      })
        .overrideProvider(MAIL_SERVICE)
        .useValue({})
        .compile();
      const app2 = moduleRef.createNestApplication();
      await app2.init();
      try {
        await makeDealer('guard');
        await makeAdmin('guardadm');
        const dealer = request.agent(app2.getHttpServer());
        // Bu uygulamada global prefix yok.
        await dealer
          .post('/auth/dealer/login')
          .send({ email: email('guard'), password: PASSWORD })
          .expect(200);
        await dealer.get('/guard-test/admin').expect(403);
        await dealer.get('/guard-test/dealer').expect(200);
        const admin = request.agent(app2.getHttpServer());
        await admin
          .post('/auth/admin/login')
          .send({ email: email('guardadm'), password: PASSWORD })
          .expect(200);
        await admin.get('/guard-test/admin').expect(200);
        await admin.get('/guard-test/dealer').expect(403);
        await request(app2.getHttpServer())
          .get('/guard-test/admin')
          .expect(401);
      } finally {
        await app2.close();
      }
    });
  });

  describe('şifre sıfırlama', () => {
    it('K-29: var olmayan e-postada da 202 döner ve e-posta gitmez', async () => {
      const before = mails.length;
      await resetRequest({ email: email('hayalet'), type: 'dealer' });
      expect(mails.length).toBe(before);
    });

    it('K-29: kayıtlı e-postada 202 döner, token yalnızca özet olarak saklanır', async () => {
      const d = await makeDealer('sifirla1');
      await resetRequest({
        email: email('sifirla1').toUpperCase(),
        type: 'dealer',
      });
      const token = lastToken(email('sifirla1'));
      const rows = await db
        .select()
        .from(authTokens)
        .where(
          and(
            eq(authTokens.subjectId, d.id),
            eq(authTokens.purpose, 'password_reset'),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).not.toBe(token);
      expect(rows[0].expiresAt.getTime() - rows[0].createdAt.getTime()).toBe(
        3600_000,
      );
    });

    it('K-39, GR-BAYI-007: token tek kullanımlıktır; şifre değişir ve tüm oturumlar silinir', async () => {
      const d = await makeDealer('sifirla2');
      const agent = request.agent(app.getHttpServer());
      await dealerLogin(agent, email('sifirla2')).expect(200);

      await resetRequest({ email: email('sifirla2'), type: 'dealer' });
      const token = lastToken(email('sifirla2'));
      const newPassword = 'Yeni-Sifre-9876';
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: newPassword })
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: 'Baska-Sifre-1111' })
        .expect(400);
      await agent.get('/api/auth/me').expect(401);
      expect(
        await db.select().from(sessions).where(eq(sessions.subjectId, d.id)),
      ).toHaveLength(0);
      await dealerLogin(request, email('sifirla2'), PASSWORD).expect(401);
      await dealerLogin(request, email('sifirla2'), newPassword).expect(200);
      const logs = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entityId, d.id),
            eq(auditLog.action, 'auth.password_reset_completed'),
          ),
        );
      expect(logs).toHaveLength(1);
    });

    it('K-39: token 1 saat sonra geçersiz olur (zaman enjekte edilerek)', async () => {
      await makeDealer('sifirla3');
      await resetRequest({ email: email('sifirla3'), type: 'dealer' });
      const token = lastToken(email('sifirla3'));
      offsetMs = 3600_000 + 1000;
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: 'Yeni-Sifre-9876' })
        .expect(400);
      await dealerLogin(request, email('sifirla3'), PASSWORD).expect(200);
    });

    it('K-39: 59 dakika sonra token hâlâ geçerlidir', async () => {
      await makeDealer('sifirla4');
      await resetRequest({ email: email('sifirla4'), type: 'dealer' });
      const token = lastToken(email('sifirla4'));
      offsetMs = 59 * 60_000;
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: 'Yeni-Sifre-9876' })
        .expect(204);
    });

    it('GR-BAYI-007: soğuma süresinden sonraki yeni istek öncekini geçersiz kılar', async () => {
      await makeDealer('sifirla5');
      const body = { email: email('sifirla5'), type: 'dealer' as const };
      await resetRequest(body);
      const first = lastToken(email('sifirla5'));
      offsetMs = 3 * 60_000;
      await resetRequest(body);
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token: first, password: 'Yeni-Sifre-9876' })
        .expect(400);
    });

    it('GR-BAYI-007: aynı hesaba 2 dakikada en fazla 1 e-posta gider; eski token iptal olmaz', async () => {
      await makeDealer('sogu');
      const body = { email: email('sogu'), type: 'dealer' as const };
      const before = mails.length;
      await resetRequest(body);
      const first = lastToken(email('sogu'));
      offsetMs = 60_000;
      await resetRequest(body);
      expect(mails.length).toBe(before + 1);
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token: first, password: 'Yeni-Sifre-9876' })
        .expect(204);
    });

    it('GR-BAYI-007: reset isteği hesap aranmadan hemen 202 döner (iş arka planda)', async () => {
      await makeDealer('arka');
      const before = mails.length;
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email: email('arka'), type: 'dealer' })
        .expect(202);
      await app.get(AuthService).whenIdle();
      expect(mails.length).toBe(before + 1);
    });

    it('GR-YON-001: is_active=false Admin e sıfırlama e-postası gitmez', async () => {
      await makeAdmin('admpasifreset', false);
      const before = mails.length;
      await resetRequest({ email: email('admpasifreset'), type: 'admin' });
      expect(mails.length).toBe(before);
    });

    it('K-39: aynı token ile iki paralel confirm den yalnızca biri başarılı olur', async () => {
      await makeDealer('paralel');
      await resetRequest({ email: email('paralel'), type: 'dealer' });
      const token = lastToken(email('paralel'));
      const send = (password: string) =>
        request(app.getHttpServer())
          .post('/api/auth/password-reset/confirm')
          .send({ token, password });
      const results = await Promise.all([
        send('Yeni-Sifre-1111'),
        send('Yeni-Sifre-2222'),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        204, 400,
      ]);
    });

    it('GR-BAYI-007: pasif bayiye sıfırlama e-postası gönderilmez; 202 döner', async () => {
      await makeDealer('sifirla6', 'passive');
      const before = mails.length;
      await resetRequest({ email: email('sifirla6'), type: 'dealer' });
      expect(mails.length).toBe(before);
    });

    it('GR-YON-001: admin sıfırlama isteği ve tamamlanması audit_log a yazılır', async () => {
      const a = await makeAdmin('admsifirla');
      await resetRequest({ email: email('admsifirla'), type: 'admin' });
      const token = lastToken(email('admsifirla'));
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: 'Yeni-Sifre-9876' })
        .expect(204);
      const actions = (
        await db.select().from(auditLog).where(eq(auditLog.entityId, a.id))
      ).map((l) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'auth.password_reset_requested',
          'auth.password_reset_completed',
        ]),
      );
    });

    it('K-53: kurala uymayan yeni şifre 400 döner ve token harcanmaz', async () => {
      await makeDealer('sifirla7');
      await resetRequest({ email: email('sifirla7'), type: 'dealer' });
      const token = lastToken(email('sifirla7'));
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: 'kisa' })
        .expect(400);
      for (const weak of ['kucukharf123', 'BUYUKHARF123', 'SadeceHarf']) {
        await request(app.getHttpServer())
          .post('/api/auth/password-reset/confirm')
          .send({ token, password: weak })
          .expect(400);
      }
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: 'Yeni-Sifre-9876' })
        .expect(204);
    });
  });

  describe('e-posta doğrulama', () => {
    it('K-03, K-04: doğrulama pending_email bayiyi pending_approval yapar ve email_verified_at yazar', async () => {
      const d = await makeDealer('dogrula1', 'pending_email');
      const token = await tokens.issue(
        'dealer',
        d.id,
        'email_verification',
        3600_000,
      );
      await request(app.getHttpServer())
        .post('/api/auth/email/verify')
        .send({ token })
        .expect(204);
      const [after] = await db
        .select()
        .from(dealers)
        .where(eq(dealers.id, d.id));
      expect(after.status).toBe('pending_approval');
      expect(after.emailVerifiedAt).not.toBeNull();
      // Tekrar çağrı idempotent (204) ve durumu değiştirmez; bkz. aşağıdaki idempotent testi.
      await request(app.getHttpServer())
        .post('/api/auth/email/verify')
        .send({ token })
        .expect(204);
    });

    it('K-03: süresi dolmuş veya geçersiz token reddedilir, durum değişmez', async () => {
      const d = await makeDealer('dogrula2', 'pending_email');
      const token = await tokens.issue(
        'dealer',
        d.id,
        'email_verification',
        1000,
      );
      offsetMs = 5000;
      await request(app.getHttpServer())
        .post('/api/auth/email/verify')
        .send({ token })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/auth/email/verify')
        .send({ token: 'x'.repeat(43) })
        .expect(400);
      const [after] = await db
        .select()
        .from(dealers)
        .where(eq(dealers.id, d.id));
      expect(after.status).toBe('pending_email');
    });

    it('K-03: şifre sıfırlama token ı e-posta doğrulamada kullanılamaz', async () => {
      const d = await makeDealer('dogrula3', 'pending_email');
      const token = await tokens.issue(
        'dealer',
        d.id,
        'password_reset',
        3600_000,
      );
      await request(app.getHttpServer())
        .post('/api/auth/email/verify')
        .send({ token })
        .expect(400);
    });

    it('K-03: doğrulama bağlantısı gönderilir ve token ile doğrulanır', async () => {
      const d = await makeDealer('dogrula4', 'pending_email');
      await app
        .get((await import('../src/auth/auth.service.js')).AuthService)
        .sendEmailVerification(d.id);
      const token = lastToken(email('dogrula4'));
      await request(app.getHttpServer())
        .post('/api/auth/email/verify')
        .send({ token })
        .expect(204);
    });
  });

  describe('oturum güvenliği', () => {
    const cookieOf = (res: request.Response) =>
      /amisos_session=([^;]+)/.exec(String(res.headers['set-cookie']))![1];

    it('GR-BAYI-007: mevcut çerezle girişte token değişir ve eski oturum satırı silinir (oturum sabitleme)', async () => {
      const d = await makeDealer('sabit');
      const agent = request.agent(app.getHttpServer());
      const first = cookieOf(
        await dealerLogin(agent, email('sabit')).expect(200),
      );
      const second = cookieOf(
        await dealerLogin(agent, email('sabit')).expect(200),
      );
      expect(second).not.toBe(first);
      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.subjectId, d.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).not.toBe(second);
    });

    it('K-29: sessions tablosunda ham token yok, yalnızca özet', async () => {
      const d = await makeDealer('ozet');
      const token = cookieOf(
        await dealerLogin(request, email('ozet')).expect(200),
      );
      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.subjectId, d.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).not.toBe(token);
      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it('GR-BAYI-007: oturum 30 günlük mutlak süreyi kayan süreyle aşamaz', async () => {
      await makeDealer('mutlak');
      const agent = request.agent(app.getHttpServer());
      await dealerLogin(agent, email('mutlak')).expect(200);
      for (const day of [6, 12, 18, 24, 29]) {
        offsetMs = day * 24 * 3600_000;
        await agent.get('/api/auth/me').expect(200);
      }
      offsetMs = 31 * 24 * 3600_000; // son kullanımdan 2 gün sonra: kayan süre dolmadı, mutlak süre doldu
      await agent.get('/api/auth/me').expect(401);
    });

    it('GR-BAYI-007: urlencoded gövdeli giriş reddedilir (4xx), çerez verilmez', async () => {
      await makeDealer('form');
      const res = await request(app.getHttpServer())
        .post('/api/auth/dealer/login')
        .type('form')
        .send({ email: email('form'), password: PASSWORD });
      expect(res.status).toBe(415);
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('e-posta doğrulama (idempotent)', () => {
    it('K-03: kullanılmış bağlantı, e-posta zaten doğrulanmışsa tekrar 204 döner', async () => {
      const d = await makeDealer('idem', 'pending_email');
      const token = await tokens.issue(
        'dealer',
        d.id,
        'email_verification',
        3600_000,
      );
      await request(app.getHttpServer())
        .post('/api/auth/email/verify')
        .send({ token })
        .expect(204);
      await request(app.getHttpServer())
        .post('/api/auth/email/verify')
        .send({ token })
        .expect(204);
      const [after] = await db
        .select()
        .from(dealers)
        .where(eq(dealers.id, d.id));
      expect(after.status).toBe('pending_approval');
    });
  });
});
