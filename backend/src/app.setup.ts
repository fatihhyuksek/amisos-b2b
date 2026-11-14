// main.ts ve testlerin paylaştığı HTTP ayarları.
import type { INestApplication } from '@nestjs/common';
import type { Env } from './config/env.js';

/**
 * Hız sınırı IP'ye göre çalışır; ters vekil arkasında doğru IP için `trust proxy` gerekir.
 * Kapalıyken (varsayılan) istemci X-Forwarded-For ile sınırı aşamaz.
 */
export function applyHttpSettings(
  app: INestApplication,
  trustProxy: Env['TRUST_PROXY'],
): void {
  const express = app.getHttpAdapter().getInstance() as {
    set(key: string, value: unknown): void;
  };
  express.set('trust proxy', trustProxy);
  app.setGlobalPrefix('api');
}
