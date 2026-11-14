import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

describe('Hız sınırı (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Config import anında okunur: değer, AppModule yüklenmeden önce konmalı.
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = '5';
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = '1000';
  });

  it('GR-BAYI-007: giriş dakikada 5 denemeyle sınırlıdır, 6. istek 429 alır', async () => {
    const body = {
      email: `hiz-${randomUUID().slice(0, 8)}@test.example`,
      password: 'yanlis-sifre-1',
    };
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/dealer/login')
        .send(body)
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/dealer/login')
      .send(body)
      .expect(429);
  });

  it('GR-BAYI-007: şifre sıfırlama isteği dakikada 5 ile sınırlıdır', async () => {
    const body = { email: 'hiz-reset@test.example', type: 'dealer' };
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send(body)
        .expect(202);
    }
    await request(app.getHttpServer())
      .post('/api/auth/password-reset/request')
      .send(body)
      .expect(429);
  });
});
