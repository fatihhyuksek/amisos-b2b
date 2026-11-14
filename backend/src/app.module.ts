import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit/audit.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ClockModule } from './common/clock.js';
import { MailModule } from './mail/mail.service.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    ClockModule,
    AuditModule,
    MailModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
