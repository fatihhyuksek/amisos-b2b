// K-78: yönetim paneli yenilemesi uçları. Yetki sunucuda (AdminGuard): anonim 401, bayi 403.
import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { AdminGuard, CurrentUser } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import { DashboardService } from './dashboard.service.js';
import { NotificationFeedService } from './notification-feed.service.js';
import { SearchService } from './search.service.js';

const searchSchema = z.object({ q: z.string().trim().min(2).max(100) });
type SearchQuery = z.infer<typeof searchSchema>;

const markReadSchema = z.object({ until: z.iso.datetime({ offset: true }).transform((v) => new Date(v)) });
type MarkReadInput = z.infer<typeof markReadSchema>;

@Controller('admin/search')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminSearchController {
  constructor(@Inject(SearchService) private readonly search: SearchService) {}

  @Get()
  get(@Query({ schema: searchSchema }) query: SearchQuery) {
    return this.search.search(query.q);
  }
}

@Controller('admin/dashboard')
@UseGuards(JsonOnlyGuard, AdminGuard)
export class AdminDashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get()
  get() {
    return this.dashboard.get();
  }
}

@Controller('admin/notifications/feed')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminNotificationFeedController {
  constructor(@Inject(NotificationFeedService) private readonly feed: NotificationFeedService) {}

  @Get()
  get(@CurrentUser() admin: AuthIdentity) {
    return this.feed.feed(admin.id);
  }

  @Post('read')
  @HttpCode(204)
  async read(@Body({ schema: markReadSchema }) body: MarkReadInput, @CurrentUser() admin: AuthIdentity): Promise<void> {
    await this.feed.markRead(admin.id, body.until);
  }
}
