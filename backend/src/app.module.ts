import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit/audit.service.js';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module.js';
import { ClockModule } from './common/clock.js';
import { MailModule } from './mail/mail.service.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { BannersModule } from './banners/banners.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { MediaModule } from './media/media.module.js';
import { DealersModule } from './dealers/dealers.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    ClockModule,
    AuditModule,
    MailModule,
    AuthModule,
    DealersModule,
    MediaModule,
    CatalogModule,
    OrdersModule,
    BannersModule,
    // K-04 hatırlatma zamanlayıcısı; test ortamında çalışmaz (mantık servis metoduyla test edilir).
    ...(process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()]),
  ],
  controllers: [HealthController],
})
export class AppModule {}
