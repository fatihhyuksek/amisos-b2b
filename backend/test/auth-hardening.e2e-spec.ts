// Ortama bağlı davranışlar: config import anında okunduğundan her senaryo kendi modülünü yükler.
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { hash } from '@node-rs/argon2';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);

async function buildApp(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { AppModule } = await import('../src/app.module.js');
  const { applyHttpSettings } = await import('../src/app.setup.js');
  const { parseTrustProxy } = await import('../src/config/env.js');
  const { DB } = await import('../src/database/database.module.js');
  const schema = await import('../src/database/schema.js');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  applyHttpSettings(app, parseTrustProxy(env.TRUST_PROXY));
  await app.init();
  return {
    app,
    db: app.get(DB) as import('../src/database/database.module.js').Database,
    schema,
  };
}

describe('Ortam ve ters vekil (e2e)', () => {
  const apps: INestApplication[] = [];
  const cleanup: (() => Promise<void>)[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    for (const c of cleanup.splice(0)) await c();
    for (const a of apps.splice(0)) await a.close();
  });

  it('K-29: production da Set-Cookie Secure içerir', async () => {
    const { app, db, schema } = await buildApp({
      NODE_ENV: 'production',
      APP_URL: 'https://b2b.example.com',
      AUTH_RATE_LIMIT_PER_MINUTE: '1000',
    });
    apps.push(app);
    const email = `prod-${run}@test.example`;
    const [d] = await db
      .insert(schema.dealers)
      .values({
        companyTitle: `Prod ${run}`,
        companyTitleKey: `prod ${run}`,
        contactName: 'Y',
        email,
        phone: '1',
        city: 'c',
        district: 'd',
        address: 'a',
        status: 'active',
        source: 'application',
        passwordHash: await hash(PASSWORD),
      })
      .returning();
    cleanup.push(async () => {
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.subjectId, d.id));
      await db.delete(schema.dealers).where(eq(schema.dealers.id, d.id));
    });
    const res = await request(app.getHttpServer())
      .post('/api/auth/dealer/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    expect(String(res.headers['set-cookie'])).toMatch(/;\s*Secure/i);
  });

  it('K-29: trust proxy kapalıyken X-Forwarded-For hız sınırını aşmaz (IP sınırı)', async () => {
    const { app } = await buildApp({
      NODE_ENV: 'test',
      AUTH_RATE_LIMIT_PER_MINUTE: '3',
    });
    apps.push(app);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      // Her denemede farklı e-posta: e-posta sınırı değil IP sınırı ölçülür.
      const res = await request(app.getHttpServer())
        .post('/api/auth/dealer/login')
        .set('X-Forwarded-For', `10.0.0.${i + 1}`)
        .send({
          email: `xff${i}-${run}@test.example`,
          password: 'yanlis-sifre-1',
        });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it('K-29: TRUST_PROXY=1 iken X-Forwarded-For istemci IP si olarak kullanılır', async () => {
    const { app } = await buildApp({
      NODE_ENV: 'test',
      AUTH_RATE_LIMIT_PER_MINUTE: '3',
      TRUST_PROXY: '1',
    });
    apps.push(app);
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/dealer/login')
        .set('X-Forwarded-For', `10.0.1.${i + 1}`)
        .send({
          email: `xff${i}-${run}@test.example`,
          password: 'yanlis-sifre-1',
        })
        .expect(401);
    }
  });

  it('GR-BAYI-007: aynı e-postaya IP değişse de dakikada 3 başarısız denemeden sonra 429 (e-posta sınırı)', async () => {
    const { app } = await buildApp({
      NODE_ENV: 'test',
      AUTH_RATE_LIMIT_PER_MINUTE: '3',
      TRUST_PROXY: '1',
    });
    apps.push(app);
    const body = {
      email: `mail-${run}@test.example`,
      password: 'yanlis-sifre-1',
    };
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/dealer/login')
        .set('X-Forwarded-For', `10.0.2.${i + 1}`)
        .send(body)
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/dealer/login')
      .set('X-Forwarded-For', '10.0.2.99')
      .send(body)
      .expect(429);
    // Başka e-posta etkilenmez
    await request(app.getHttpServer())
      .post('/api/auth/dealer/login')
      .set('X-Forwarded-For', '10.0.2.99')
      .send({ ...body, email: `baska-${run}@test.example` })
      .expect(401);
  });
});
