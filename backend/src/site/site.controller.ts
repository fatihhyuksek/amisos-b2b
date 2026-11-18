// Site uçları (K-73). `GET /api/site*` herkese açık; yönetim uçları AdminGuard arkasında (sunucuda).
import { Body, Controller, Get, Inject, Param, Put, UseGuards, UsePipes } from '@nestjs/common';
import { AdminGuard, CurrentUser } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import { updateSiteSchema, type UpdateSiteInput } from './site.schemas.js';
import {
  announcementsSchema,
  homeSchema,
  navigationSchema,
  type AnnouncementsSettings,
  type HomeSettings,
  type NavigationSettings,
} from './layout.schemas.js';
import { SiteService } from './site.service.js';

@Controller('site')
export class SiteController {
  constructor(@Inject(SiteService) private readonly site: SiteService) {}

  @Get()
  get() {
    return this.site.publicSite();
  }

  // K-87: açık bölümler + sunucunun çözdüğü productIds / groupIds.
  @Get('home')
  home() {
    return this.site.publicHome();
  }

  @Get('pages/:slug')
  page(@Param('slug') slug: string) {
    return this.site.publicPage(slug);
  }
}

@Controller('admin/site')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminSiteController {
  constructor(@Inject(SiteService) private readonly site: SiteService) {}

  @Get()
  get() {
    return this.site.adminGet();
  }

  @Put()
  update(@Body({ schema: updateSiteSchema }) body: UpdateSiteInput, @CurrentUser() admin: AuthIdentity) {
    return this.site.adminUpdate(body, admin.id);
  }

  @Get('home/default')
  defaultHome() {
    return this.site.adminDefaultHome();
  }

  @Get('home')
  getHome() {
    return this.site.adminGetHome();
  }

  @Put('home')
  putHome(@Body({ schema: homeSchema }) body: HomeSettings, @CurrentUser() admin: AuthIdentity) {
    return this.site.adminUpdateHome(body, admin.id);
  }

  @Get('navigation')
  getNavigation() {
    return this.site.adminGetNavigation();
  }

  @Put('navigation')
  putNavigation(@Body({ schema: navigationSchema }) body: NavigationSettings, @CurrentUser() admin: AuthIdentity) {
    return this.site.adminUpdateNavigation(body, admin.id);
  }

  @Get('announcements')
  getAnnouncements() {
    return this.site.adminGetAnnouncements();
  }

  @Put('announcements')
  putAnnouncements(@Body({ schema: announcementsSchema }) body: AnnouncementsSettings, @CurrentUser() admin: AuthIdentity) {
    return this.site.adminUpdateAnnouncements(body, admin.id);
  }
}
