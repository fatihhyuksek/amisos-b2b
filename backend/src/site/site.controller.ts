// Site uçları (K-73). `GET /api/site*` herkese açık; yönetim uçları AdminGuard arkasında (sunucuda).
import { Body, Controller, Get, Inject, Param, Put, UseGuards, UsePipes } from '@nestjs/common';
import { AdminGuard, CurrentUser } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import { updateSiteSchema, type UpdateSiteInput } from './site.schemas.js';
import { SiteService } from './site.service.js';

@Controller('site')
export class SiteController {
  constructor(@Inject(SiteService) private readonly site: SiteService) {}

  @Get()
  get() {
    return this.site.publicSite();
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
}
