import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAnalyticsController, AdminDealerActivityController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { EventsController, EventsRateLimitGuard } from './events.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [EventsController, AdminAnalyticsController, AdminDealerActivityController],
  providers: [AnalyticsService, EventsRateLimitGuard],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
