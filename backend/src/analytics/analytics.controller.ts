// K-85: analitik uçları (yalnızca Admin, sunucuda AdminGuard).
import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, UseGuards, UsePipes } from '@nestjs/common';
import { AdminGuard } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import { createValidationPipe } from '../common/validation.js';
import {
  analyticsPeriodSchema,
  analyticsProductsSchema,
  dealerActivitySchema,
  type AnalyticsPeriodQuery,
  type AnalyticsProductsQuery,
  type DealerActivityQuery,
} from './analytics.schemas.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('admin/analytics')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminAnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(@Query({ schema: analyticsPeriodSchema }) query: AnalyticsPeriodQuery) {
    return this.analytics.overview(query);
  }

  @Get('live')
  live() {
    return this.analytics.live();
  }

  @Get('products')
  products(@Query({ schema: analyticsProductsSchema }) query: AnalyticsProductsQuery) {
    return this.analytics.products(query);
  }

  @Get('searches')
  searches(@Query({ schema: analyticsPeriodSchema }) query: AnalyticsPeriodQuery) {
    return this.analytics.searches(query);
  }

  @Get('dealers')
  dealers(@Query({ schema: analyticsPeriodSchema }) query: AnalyticsPeriodQuery) {
    return this.analytics.dealers(query);
  }
}

@Controller('admin/dealers')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminDealerActivityController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}

  @Get(':id/activity')
  activity(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query({ schema: dealerActivitySchema }) query: DealerActivityQuery,
  ) {
    return this.analytics.dealerActivity(id, query);
  }
}
