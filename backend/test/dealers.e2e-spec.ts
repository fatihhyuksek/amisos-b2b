import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq, inArray, like } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { CLOCK } from '../src/common/clock.js';
import { DB, type Database } from '../src/database/database.module.js';
import {
  adminUsers,
  auditLog,
  authTokens,
  consents,
  dealers,
  sessions,
} from '../src/database/schema.js';
import { ApprovalReminderService } from '../src/dealers/approval-reminder.service.js';
import { DealersService } from '../src/dealers/dealers.service.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);
const email = (name: string) => `${name}-${run}@test.example`;

describe('Bayi başvurusu ve Admin yönetimi (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let fixedNow: Date | null = null;
  const mails: { kind: string; to: string; link: string; count?: number }[] =
    [];
  const adminIds: string[] = [];

  const server = () => app.getHttpServer();
  const idle = () => app.get(AuthService).whenIdle();
  const tokenFrom = (kind: string, to: string) => {
    const mail = [...mails]
      .reverse()
      .find((m) => m.kind === kind && m.to === to);
    const url = new URL(mail!.link);
    return new URLSearchParams(url.hash.split('?')[1]).get('token')!;
  };
  const mailCount = (kind: string, to: string) =>
    mails.filter((m) => m.kind === kind && m.to === to).length;

  const body = (name: string, extra: Record<string, unknown> = {}) => ({
    companyTitle: `  Firma ${name} ${run} `,
    contactName: 'Ayşe Yılmaz',
    email: email(name).toUpperCase().replace('@TEST.EXAMPLE', '@test.example'),
    phone: '0532 123 45 67',
    city: 'Kayseri',
    district: 'Melikgazi',
    address: 'Atatürk Cad. No:12',
    consents: { kvkk: true, terms: true, marketing: false },
    ...extra,
  });

  const apply = (name: string, extra: Record<string, unknown> = {}) =>
    request(server()).post('/api/applications').send(body(name, extra));

  const dealerByName = async (name: string) => {
    const rows = await db
      .select()
      .from(dealers)
      .where(eq(dealers.email, email(name)));
    return rows[rows.length - 1];
  };

  async function newAdmin(name: string) {
    const [a] = await db
      .insert(adminUsers)
      .values({
        email: email(name),
        fullName: `Admin ${name}`,
        passwordHash: await hash(PASSWORD),
      })
      .returning();
    adminIds.push(a.id);
    return a;
  }

  async function adminAgent(name = `admin${adminIds.length}`) {
    const admin = await newAdmin(name);
    const agent = request.agent(server());
    await agent
      .post('/api/auth/admin/login')
      .send({ email: admin.email, password: PASSWORD })
      .expect(200);
    return { agent, admin };
  }

  /** Başvur + e-posta doğrula -> pending_approval */
  async function pendingApproval(name: string) {
    await apply(name).expect(202);
    await idle();
    await request(server())
      .post('/api/auth/email/verify')
      .send({ token: tokenFrom('verify', email(name)) })
      .expect(204);
    return dealerByName(name);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => fixedNow ?? new Date() })
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
        sendInvitation: (to: string, link: string) => {
          mails.push({ kind: 'invite', to, link });
          return Promise.resolve();
        },
        sendApprovalReminder: (to: string, count: number) => {
          mails.push({ kind: 'reminder', to, link: '', count });
          return Promise.resolve();
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get<Database>(DB);
  });

  afterAll(async () => {
    if (db) {
      const rows = await db
        .select({ id: dealers.id })
        .from(dealers)
        .where(like(dealers.email, `%-${run}@test.example`));
      const ids = [...rows.map((r) => r.id), ...adminIds];
      if (ids.length) {
        await db.delete(sessions).where(inArray(sessions.subjectId, ids));
        await db.delete(authTokens).where(inArray(authTokens.subjectId, ids));
        await db.delete(auditLog).where(inArray(auditLog.entityId, ids));
        await db.delete(auditLog).where(inArray(auditLog.actorId, adminIds));
        await db.delete(consents).where(
          inArray(
            consents.dealerId,
            rows.map((r) => r.id),
          ),
        );
        await db.delete(dealers).where(
          inArray(
            dealers.id,
            rows.map((r) => r.id),
          ),
        );
        await db.delete(adminUsers).where(inArray(adminUsers.id, adminIds));
      }
    }
    await app?.close();
  });

  afterEach(() => {
    fixedNow = null;
  });

  describe('Başvuru', () => {
    it('GR-BAYI-001, K-35, GR-KVK-001: başvuru 202 {} döner; kayıt, consents ve doğrulama e-postası oluşur', async () => {
      const res = await apply('basvuru').expect(202);
      expect(res.body).toEqual({});
      await idle();
      const d = await dealerByName('basvuru');
      expect(d.status).toBe('pending_email');
      expect(d.source).toBe('application');
      expect(d.companyTitle).toBe(`Firma basvuru ${run}`); // trim
      expect(d.phone).toBe('05321234567'); // normalize
      expect(d.passwordHash).toBeNull();
      const rows = await db
        .select()
        .from(consents)
        .where(eq(consents.dealerId, d.id));
      expect(
        rows
          .map((r) => [r.type, r.granted, r.documentVersion])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ).toEqual([
        ['kvkk', true, 'taslak-1'],
        ['marketing', false, 'taslak-1'],
        ['terms', true, 'taslak-1'],
      ]);
      expect(mailCount('verify', email('basvuru'))).toBe(1);
    });

    it('GR-KVK-001: kvkk veya terms false ise 400 VALIDATION ve kayıt oluşmaz', async () => {
      const a = await apply('kvkkyok', {
        consents: { kvkk: false, terms: true },
      }).expect(400);
      expect(a.body.code).toBe('VALIDATION');
      expect(a.body.fields['consents.kvkk']).toBeDefined();
      await apply('termsyok', {
        consents: { kvkk: true, terms: false },
      }).expect(400);
      await apply('consentsyok', { consents: undefined }).expect(400);
      expect(await dealerByName('kvkkyok')).toBeUndefined();
    });

    it('GR-BAYI-001: geçersiz telefon ve e-posta 400 VALIDATION', async () => {
      const res = await apply('tel', {
        phone: '123',
        email: 'gecersiz',
      }).expect(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(Object.keys(res.body.fields)).toEqual(
        expect.arrayContaining(['phone', 'email']),
      );
    });

    it('GR-BAYI-004, GR-BAYI-005: aynı e-posta (büyük/küçük harf farkıyla) veya aynı firma unvanıyla 409', async () => {
      await apply('dup').expect(202);
      const r1 = await apply('dup').expect(409);
      expect(r1.body.code).toBe('DUPLICATE_APPLICATION');
      await apply('dup', { email: email('baska') }).expect(409); // aynı unvan
      await apply('dup2', { email: email('dup').toUpperCase() }).expect(409); // aynı e-posta
    });

    it('GR-BAYI-004: eşzamanlı aynı başvurulardan yalnızca biri kabul edilir', async () => {
      const results = await Promise.all(
        [1, 2, 3, 4].map(() => apply('yaris').then((r) => r.status)),
      );
      expect(results.filter((s) => s === 202)).toHaveLength(1);
      expect(results.filter((s) => s === 409)).toHaveLength(3);
    });

    it('K-51: reddedilen bayi aynı bilgilerle yeniden başvurabilir (202)', async () => {
      const d = await pendingApproval('yenidenbasvuru');
      const { agent } = await adminAgent();
      await agent
        .post(`/api/admin/dealers/${d.id}/reject`)
        .send({ reason: 'Eksik bilgi' })
        .expect(204);
      await apply('yenidenbasvuru').expect(202);
      const rows = await db
        .select()
        .from(dealers)
        .where(eq(dealers.email, email('yenidenbasvuru')));
      expect(rows.map((r) => r.status).sort()).toEqual([
        'pending_email',
        'rejected',
      ]);
    });

    it('K-03, K-04: e-posta doğrulanınca pending_approval olur ve emailVerifiedAt yazılır', async () => {
      const d = await pendingApproval('dogrula');
      expect(d.status).toBe('pending_approval');
      expect(d.emailVerifiedAt).not.toBeNull();
    });
  });

  describe('Yetki (GR-YON-001)', () => {
    it('GR-YON-001: anonim 401, bayi oturumu 403 döner (tüm admin uçları)', async () => {
      const d = await pendingApproval('yetki');
      await request(server()).get('/api/admin/dealers').expect(401);
      await request(server()).get('/api/admin/dealers/summary').expect(401);
      await request(server()).get(`/api/admin/dealers/${d.id}`).expect(401);
      await request(server())
        .post(`/api/admin/dealers/${d.id}/approve`)
        .expect(401);
      await request(server()).post('/api/admin/dealers').send({}).expect(401);
      await request(server())
        .patch(`/api/admin/dealers/${d.id}/terms`)
        .send({ generalDiscountPercent: '5' })
        .expect(401);

      // Aktif bayi oturumu
      await db
        .update(dealers)
        .set({ status: 'active', passwordHash: await hash(PASSWORD) })
        .where(eq(dealers.id, d.id));
      const dealerAgent = request.agent(server());
      await dealerAgent
        .post('/api/auth/dealer/login')
        .send({ email: email('yetki'), password: PASSWORD })
        .expect(200);
      await dealerAgent.get('/api/admin/dealers').expect(403);
      await dealerAgent.get('/api/admin/dealers/summary').expect(403);
      await dealerAgent
        .post(`/api/admin/dealers/${d.id}/deactivate`)
        .send({ reason: 'xxx' })
        .expect(403);
      await dealerAgent
        .patch(`/api/admin/dealers/${d.id}/terms`)
        .send({ generalDiscountPercent: '5' })
        .expect(403);
      expect((await dealerByName('yetki')).status).toBe('active');
    });
  });

  describe('Liste, özet, ayrıntı', () => {
    it('GR-BAYI-002: liste durum filtresi, arama ve sayfalama; pending_approval önce', async () => {
      const { agent } = await adminAgent();
      const a = await pendingApproval('liste-a');
      await apply('liste-b').expect(202);
      const c = await pendingApproval('liste-c');
      await db
        .update(dealers)
        .set({ status: 'active' })
        .where(eq(dealers.id, c.id));

      const all = await agent
        .get('/api/admin/dealers')
        .query({ q: `-${run}` })
        .expect(200);
      expect(all.body.page).toBe(1);
      expect(all.body.pageSize).toBe(20);
      const titles = all.body.items.map((i: { id: string }) => i.id);
      expect(titles).toContain(a.id);
      // pending_approval kayıtları diğerlerinden önce gelir
      const statuses: string[] = all.body.items.map(
        (i: { status: string }) => i.status,
      );
      const lastPending = statuses.lastIndexOf('pending_approval');
      const firstOther = statuses.findIndex((s) => s !== 'pending_approval');
      if (firstOther !== -1) expect(lastPending).toBeLessThan(firstOther);

      const filtered = await agent
        .get('/api/admin/dealers')
        .query({
          status: 'active',
          q: `liste-c ${run}`.toUpperCase().slice(0, 0) + `FIRMA LISTE-C`,
        })
        .expect(200);
      expect(filtered.body.items.map((i: { id: string }) => i.id)).toEqual([
        c.id,
      ]);

      const page1 = await agent
        .get('/api/admin/dealers')
        .query({ q: `liste-`, pageSize: 1, page: 1 })
        .expect(200);
      const page2 = await agent
        .get('/api/admin/dealers')
        .query({ q: `liste-`, pageSize: 1, page: 2 })
        .expect(200);
      expect(page1.body.items).toHaveLength(1);
      expect(page2.body.items).toHaveLength(1);
      expect(page1.body.items[0].id).not.toBe(page2.body.items[0].id);
      expect(page1.body.total).toBeGreaterThanOrEqual(3);
      const bayi = page1.body.items[0];
      expect(bayi).not.toHaveProperty('passwordHash');
      expect(typeof bayi.hasPassword).toBe('boolean');
    });

    it('GR-BAYI-002: arama LIKE joker karakterlerini ve SQL enjeksiyonunu etkisiz kılar; geçersiz sorgu 400', async () => {
      const { agent } = await adminAgent();
      await apply('joker').expect(202);
      const pct = await agent
        .get('/api/admin/dealers')
        .query({ q: '%' })
        .expect(200);
      const under = await agent
        .get('/api/admin/dealers')
        .query({ q: '_' })
        .expect(200);
      const inj = await agent
        .get('/api/admin/dealers')
        .query({ q: "'; drop table dealers; --" })
        .expect(200);
      expect(pct.body.total).toBe(0);
      expect(under.body.total).toBe(0);
      expect(inj.body.total).toBe(0);
      await agent
        .get('/api/admin/dealers')
        .query({ status: 'yok' })
        .expect(400);
      await agent
        .get('/api/admin/dealers')
        .query({ pageSize: 1000 })
        .expect(400);
      await agent.get('/api/admin/dealers/not-a-uuid').expect(400);
      await agent.get(`/api/admin/dealers/${randomUUID()}`).expect(404);
    });

    it('K-04: summary sayıları durumlarla tutarlı', async () => {
      const { agent } = await adminAgent();
      const before = (await agent.get('/api/admin/dealers/summary').expect(200))
        .body;
      await pendingApproval('sum-a');
      await apply('sum-b').expect(202);
      const after = (await agent.get('/api/admin/dealers/summary').expect(200))
        .body;
      expect(after.pendingApproval).toBe(before.pendingApproval + 1);
      expect(after.pendingEmail).toBe(before.pendingEmail + 1);
      expect(Object.keys(after).sort()).toEqual([
        'active',
        'overdue',
        'passive',
        'pendingApproval',
        'pendingEmail',
      ]);
    });

    it('K-04: approvalOverdue 2 iş günü sonra true olur (sahte saat); summary.overdue ve hatırlatma sayısı tutarlı', async () => {
      const { agent } = await adminAgent();
      const d = await pendingApproval('gecikme');
      // Pazartesi 2026-11-09 10:00 yerel saatte doğrulandı.
      await db
        .update(dealers)
        .set({ emailVerifiedAt: new Date(2026, 10, 9, 10, 0) })
        .where(eq(dealers.id, d.id));
      const overdueOf = async () =>
        (await agent.get(`/api/admin/dealers/${d.id}`).expect(200)).body
          .approvalOverdue;

      fixedNow = new Date(2026, 10, 10, 10, 0); // Salı
      expect(await overdueOf()).toBe(false);
      fixedNow = new Date(2026, 10, 11, 10, 0); // Çarşamba 10:00: tam 2 iş günü
      expect(await overdueOf()).toBe(false);
      fixedNow = new Date(2026, 10, 11, 10, 1);
      expect(await overdueOf()).toBe(true);
      const sum = (await agent.get('/api/admin/dealers/summary').expect(200))
        .body;
      expect(sum.overdue).toBeGreaterThanOrEqual(1);

      // Cuma doğrulanan Salı'ya kadar gecikmez
      await db
        .update(dealers)
        .set({ emailVerifiedAt: new Date(2026, 10, 13, 10, 0) })
        .where(eq(dealers.id, d.id));
      fixedNow = new Date(2026, 10, 17, 10, 0);
      expect(await overdueOf()).toBe(false);
      fixedNow = new Date(2026, 10, 17, 10, 1);
      expect(await overdueOf()).toBe(true);
    });

    it('GR-BAYI-002, GR-KVK-001: ayrıntı onayları, adresi ve geçmişi (en yeni önce) döner', async () => {
      const { agent, admin } = await adminAgent();
      const d = await pendingApproval('ayrinti');
      await agent
        .post(`/api/admin/dealers/${d.id}/reject`)
        .send({ reason: 'Uygun değil' })
        .expect(204);
      const res = await agent.get(`/api/admin/dealers/${d.id}`).expect(200);
      expect(res.body.address).toBe('Atatürk Cad. No:12');
      expect(res.body.rejectionReason).toBe('Uygun değil');
      expect(res.body.emailVerifiedAt).not.toBeNull();
      expect(res.body.consents).toHaveLength(3);
      expect(res.body.history[0]).toMatchObject({
        action: 'dealer.rejected',
        reason: 'Uygun değil',
        actor: admin.fullName,
      });
      expect(res.body.history.at(-1).action).toBe('dealer.applied');
    });
  });

  describe('Onay, davet, şifre belirleme', () => {
    it('K-04: onay -> active + davet e-postası; davetle şifre belirlenir ve giriş yapılır; token tekrar kullanılamaz', async () => {
      const { agent, admin } = await adminAgent();
      const d = await pendingApproval('onay');
      await agent.post(`/api/admin/dealers/${d.id}/approve`).expect(204);
      await idle();
      const after = await dealerByName('onay');
      expect(after.status).toBe('active');
      expect(after.reviewedBy).toBe(admin.id);
      expect(after.reviewedAt).not.toBeNull();
      expect(after.passwordHash).toBeNull();
      expect(mailCount('invite', email('onay'))).toBe(1);

      // Şifresiz aktif bayi giriş yapamaz (genel 401)
      await request(server())
        .post('/api/auth/dealer/login')
        .send({ email: email('onay'), password: PASSWORD })
        .expect(401);

      const token = tokenFrom('invite', email('onay'));
      await request(server())
        .post('/api/auth/invitation/accept')
        .send({ token, password: 'zayif' })
        .expect(400);
      await request(server())
        .post('/api/auth/invitation/accept')
        .send({ token, password: PASSWORD })
        .expect(204);
      await request(server())
        .post('/api/auth/dealer/login')
        .send({ email: email('onay'), password: PASSWORD })
        .expect(200);
      await request(server())
        .post('/api/auth/invitation/accept')
        .send({ token, password: 'Baska-Sifre-9' })
        .expect(400);
      const detail = await agent.get(`/api/admin/dealers/${d.id}`).expect(200);
      expect(detail.body.hasPassword).toBe(true);
    });

    it('K-04: süresi dolmuş (72 saat) veya bilinmeyen davet token ı 400', async () => {
      const { agent } = await adminAgent();
      const d = await pendingApproval('sureli');
      await agent.post(`/api/admin/dealers/${d.id}/approve`).expect(204);
      await idle();
      const token = tokenFrom('invite', email('sureli'));
      fixedNow = new Date(Date.now() + 73 * 3600_000);
      await request(server())
        .post('/api/auth/invitation/accept')
        .send({ token, password: PASSWORD })
        .expect(400);
      fixedNow = null;
      await request(server())
        .post('/api/auth/invitation/accept')
        .send({ token: 'x'.repeat(43), password: PASSWORD })
        .expect(400);
      // Süresi dolan token şifre belirlemez
      expect((await dealerByName('sureli')).passwordHash).toBeNull();
    });

    it('K-04: onay yalnızca pending_approval durumunda; aksi halde 409 INVALID_STATE', async () => {
      const { agent } = await adminAgent();
      await apply('onayyanlis').expect(202);
      const d = await dealerByName('onayyanlis'); // pending_email
      const res = await agent
        .post(`/api/admin/dealers/${d.id}/approve`)
        .expect(409);
      expect(res.body.code).toBe('INVALID_STATE');
      await agent
        .post(`/api/admin/dealers/${randomUUID()}/approve`)
        .expect(404);
    });

    it('K-04: yeni davet eskisini geçersiz kılar (resend-invitation); şifresi olana 409', async () => {
      const { agent } = await adminAgent();
      const d = await pendingApproval('tekrardavet');
      await agent.post(`/api/admin/dealers/${d.id}/approve`).expect(204);
      await idle();
      const first = tokenFrom('invite', email('tekrardavet'));
      await agent
        .post(`/api/admin/dealers/${d.id}/resend-invitation`)
        .expect(204);
      await idle();
      expect(mailCount('invite', email('tekrardavet'))).toBe(2);
      const second = tokenFrom('invite', email('tekrardavet'));
      expect(second).not.toBe(first);
      await request(server())
        .post('/api/auth/invitation/accept')
        .send({ token: first, password: PASSWORD })
        .expect(400);
      await request(server())
        .post('/api/auth/invitation/accept')
        .send({ token: second, password: PASSWORD })
        .expect(204);
      const res = await agent
        .post(`/api/admin/dealers/${d.id}/resend-invitation`)
        .expect(409);
      expect(res.body.code).toBe('INVALID_STATE');
    });

    it('K-02: Admin davetle bayi oluşturur: 201 active/invitation/hasPassword=false + davet e-postası; tekrar 409', async () => {
      const { agent } = await adminAgent();
      const { consents: _c, ...fields } = body('davetli');
      const res = await agent
        .post('/api/admin/dealers')
        .send(fields)
        .expect(201);
      expect(res.body).toMatchObject({
        status: 'active',
        source: 'invitation',
        hasPassword: false,
        approvalOverdue: false,
        generalDiscountPercent: null,
        email: email('davetli'),
      });
      await idle();
      expect(mailCount('invite', email('davetli'))).toBe(1);
      expect((await dealerByName('davetli')).emailVerifiedAt).toBeNull();
      // Davet kabulü e-posta erişimini kanıtlar: e-posta doğrulanmış sayılır.
      await request(server())
        .post('/api/auth/invitation/accept')
        .send({ token: tokenFrom('invite', email('davetli')), password: PASSWORD })
        .expect(204);
      expect((await dealerByName('davetli')).emailVerifiedAt).not.toBeNull();
      const dup = await agent
        .post('/api/admin/dealers')
        .send(fields)
        .expect(409);
      expect(dup.body.code).toBe('DUPLICATE_APPLICATION');
      await agent
        .post('/api/admin/dealers')
        .send({ ...fields, email: 'x' })
        .expect(400);
    });
  });

  describe('Red, pasife alma, aktif etme', () => {
    it('K-51: gerekçesiz red 400; gerekçeli red 204; yanlış durumda 409', async () => {
      const { agent, admin } = await adminAgent();
      const d = await pendingApproval('red');
      await agent
        .post(`/api/admin/dealers/${d.id}/reject`)
        .send({})
        .expect(400);
      await agent
        .post(`/api/admin/dealers/${d.id}/reject`)
        .send({ reason: 'ab' })
        .expect(400);
      await agent
        .post(`/api/admin/dealers/${d.id}/reject`)
        .send({ reason: 'Uygun bulunmadı' })
        .expect(204);
      const after = await dealerByName('red');
      expect(after.status).toBe('rejected');
      expect(after.rejectionReason).toBe('Uygun bulunmadı');
      expect(after.reviewedBy).toBe(admin.id);
      expect(after.reviewedAt).not.toBeNull();
      const again = await agent
        .post(`/api/admin/dealers/${d.id}/reject`)
        .send({ reason: 'tekrar' })
        .expect(409);
      expect(again.body.code).toBe('INVALID_STATE');
      await agent.post(`/api/admin/dealers/${d.id}/approve`).expect(409);
    });

    it('K-08: pasife alma açık oturumu siler (401), gerekçe zorunlu; aktif etme tekrar giriş sağlar', async () => {
      const { agent } = await adminAgent();
      const d = await pendingApproval('pasif');
      await db
        .update(dealers)
        .set({ status: 'active', passwordHash: await hash(PASSWORD) })
        .where(eq(dealers.id, d.id));
      const dealerAgent = request.agent(server());
      await dealerAgent
        .post('/api/auth/dealer/login')
        .send({ email: email('pasif'), password: PASSWORD })
        .expect(200);
      await dealerAgent.get('/api/auth/me').expect(200);

      await agent
        .post(`/api/admin/dealers/${d.id}/deactivate`)
        .send({})
        .expect(400);
      await agent
        .post(`/api/admin/dealers/${d.id}/deactivate`)
        .send({ reason: 'Ödeme sorunu' })
        .expect(204);
      await dealerAgent.get('/api/auth/me').expect(401);
      expect((await dealerByName('pasif')).status).toBe('passive');
      await agent
        .post(`/api/admin/dealers/${d.id}/deactivate`)
        .send({ reason: 'tekrar' })
        .expect(409);

      await agent
        .post(`/api/admin/dealers/${d.id}/activate`)
        .send({})
        .expect(204);
      expect((await dealerByName('pasif')).status).toBe('active');
      await agent.post(`/api/admin/dealers/${d.id}/activate`).expect(409);
      await request(server())
        .post('/api/auth/dealer/login')
        .send({ email: email('pasif'), password: PASSWORD })
        .expect(200);
    });
  });

  describe('İskonto (K-12, K-43)', () => {
    it('K-12, K-43: genel iskonto belirlenir, geçersiz oran 400, null kaldırır; önceki/yeni değer audit e yazılır', async () => {
      const { agent } = await adminAgent();
      const d = await pendingApproval('iskonto');
      const url = `/api/admin/dealers/${d.id}/terms`;
      for (const bad of [
        '0',
        '100',
        '-5',
        '10.123',
        'abc',
        '',
        10,
        undefined,
      ]) {
        await agent
          .patch(url)
          .send({ generalDiscountPercent: bad })
          .expect(400);
      }
      await agent.patch(url).send({ generalDiscountPercent: '10' }).expect(204);
      let detail = (await agent.get(`/api/admin/dealers/${d.id}`)).body;
      expect(detail.generalDiscountPercent).toBe('10.00');
      await agent
        .patch(url)
        .send({ generalDiscountPercent: '12.5' })
        .expect(204);
      await agent.patch(url).send({ generalDiscountPercent: null }).expect(204);
      detail = (await agent.get(`/api/admin/dealers/${d.id}`)).body;
      expect(detail.generalDiscountPercent).toBeNull();

      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, d.id));
      const terms = rows
        .filter((r) => r.action === 'dealer.terms_changed')
        .map((r) => r.data);
      expect(terms).toEqual([
        { previous: null, next: '10.00' },
        { previous: '10.00', next: '12.50' },
        { previous: '12.50', next: null },
      ]);
      await agent
        .patch(`/api/admin/dealers/${randomUUID()}/terms`)
        .send({ generalDiscountPercent: '5' })
        .expect(404);
    });
  });

  describe('Audit (GR-YON-001)', () => {
    it('GR-YON-001: Admin işlemleri audit_log a aktör, gerekçe ve varlıkla yazılır', async () => {
      const { agent, admin } = await adminAgent();
      const d = await pendingApproval('audit');
      await agent.post(`/api/admin/dealers/${d.id}/approve`).expect(204);
      await idle();
      await agent
        .post(`/api/admin/dealers/${d.id}/deactivate`)
        .send({ reason: 'Denetim' })
        .expect(204);
      await agent
        .post(`/api/admin/dealers/${d.id}/activate`)
        .send({ reason: 'Çözüldü' })
        .expect(204);
      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, d.id));
      const adminRows = rows.filter((r) => r.actorType === 'admin');
      expect(adminRows.map((r) => r.action).sort()).toEqual([
        'dealer.activated',
        'dealer.approved',
        'dealer.deactivated',
      ]);
      for (const r of adminRows) {
        expect(r.actorId).toBe(admin.id);
        expect(r.entityType).toBe('dealers');
      }
      expect(
        adminRows.find((r) => r.action === 'dealer.deactivated')?.reason,
      ).toBe('Denetim');
      expect(
        adminRows.find((r) => r.action === 'dealer.activated')?.reason,
      ).toBe('Çözüldü');
    });
  });

  describe('Hatırlatma (K-04)', () => {
    it('K-04: gecikmiş başvuru sayısı kadar, her aktif Admin e hatırlatma gider; gecikme yoksa gönderilmez', async () => {
      const reminder = app.get(ApprovalReminderService);
      const active = await newAdmin('hatirlatma-aktif');
      const inactive = await newAdmin('hatirlatma-pasif');
      await db
        .update(adminUsers)
        .set({ isActive: false })
        .where(eq(adminUsers.id, inactive.id));

      // Mevcut gecikmişleri tek başına olmayan veritabanında dışarıda bırakmak için sayıyı hesapla.
      const d1 = await pendingApproval('hatirlatma-1');
      const d2 = await pendingApproval('hatirlatma-2');
      const old = new Date(2026, 10, 2, 10, 0); // Pazartesi
      await db
        .update(dealers)
        .set({ emailVerifiedAt: old })
        .where(inArray(dealers.id, [d1.id, d2.id]));
      fixedNow = new Date(2026, 10, 9, 9, 0);
      const expected = await app.get(DealersService).countOverdue(fixedNow);
      expect(expected).toBeGreaterThanOrEqual(2);

      mails.length = 0;
      await reminder.sendReminders();
      const toActive = mails.filter(
        (m) => m.kind === 'reminder' && m.to === active.email,
      );
      expect(toActive).toHaveLength(1);
      expect(toActive[0].count).toBe(expected);
      expect(
        mails.some((m) => m.kind === 'reminder' && m.to === inactive.email),
      ).toBe(false);
    });
  });
});
