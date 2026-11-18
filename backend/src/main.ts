import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { applyHttpSettings } from './app.setup.js';
import { applyPublicSeo } from './seo/frontend.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  applyHttpSettings(app, config.get('TRUST_PROXY', { infer: true }));
  // Oturum çerezi aynı site (SameSite=Lax) varsayımıyla çalışır. API ileride ayrı bir kaynağa
  // (origin) taşınırsa `credentials: true` yalnızca sabit, tek bir origin ile açılmalıdır;
  // asla yansıtılan veya joker origin ile değil.
  app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }) });
  // K-82: sitemap.xml, robots.txt ve (SERVE_FRONTEND_DIR varsa) sayfaya özel meta ile vitrin sunumu.
  applyPublicSeo(app, config.get('SERVE_FRONTEND_DIR', { infer: true }));
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
