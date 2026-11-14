import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { applyHttpSettings } from './app.setup.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  applyHttpSettings(app, config.get('TRUST_PROXY', { infer: true }));
  // Oturum çerezi aynı site (SameSite=Lax) varsayımıyla çalışır. API ileride ayrı bir kaynağa
  // (origin) taşınırsa `credentials: true` yalnızca sabit, tek bir origin ile açılmalıdır;
  // asla yansıtılan veya joker origin ile değil.
  app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }) });
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
