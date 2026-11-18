import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuditModule } from './audit/admin-audit.js';
import { AuditModule } from './audit/audit.service.js';
import { AccountModule } from './account/account.module.js';
import { SiteModule } from './site/site.module.js';
import { SeoModule } from './seo/seo.module.js';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module.js';
import { ClockModule } from './common/clock.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { MailModule } from './mail/mail.service.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { BannersModule } from './banners/banners.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { MediaModule } from './media/media.module.js';
import { DealersModule } from './dealers/dealers.module.js';
import { AdminPanelModule } from './admin-panel/admin-panel.module.js';
import { AnalyticsCoreModule } from './analytics/analytics-recorder.service.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    ClockModule,
    AnalyticsCoreModule,
    AuditModule,
    MailModule,
    NotificationsModule,
    AuthModule,
    DealersModule,
    MediaModule,
    CatalogModule,
    OrdersModule,
    BannersModule,
    ReportsModule,
    AccountModule,
    SiteModule,
    SeoModule,
    AdminAuditModule,
    AdminPanelModule,
    AnalyticsModule,
    // K-04 hatırlatma zamanlayıcısı; test ortamında çalışmaz (mantık servis metoduyla test edilir).
    ...(process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()]),
  ],
  controllers: [HealthController],
})
export class AppModule {}
