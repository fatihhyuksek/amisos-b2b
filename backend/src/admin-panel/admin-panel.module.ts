import { Module } from '@nestjs/common';
import { AdminAuditModule } from '../audit/admin-audit.js';
import { AuthModule } from '../auth/auth.module.js';
import { DealersModule } from '../dealers/dealers.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import {
  AdminDashboardController,
  AdminNotificationFeedController,
  AdminSearchController,
} from './admin-panel.controllers.js';
import { DashboardService } from './dashboard.service.js';
import { NotificationFeedService } from './notification-feed.service.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [AuthModule, DealersModule, ReportsModule, AdminAuditModule],
  controllers: [AdminSearchController, AdminDashboardController, AdminNotificationFeedController],
  providers: [DashboardService, SearchService, NotificationFeedService],
})
export class AdminPanelModule {}
