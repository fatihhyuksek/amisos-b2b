// Banner uçları. Yetki sunucuda: Admin yönetir (AdminGuard), bayi yalnızca yayındakileri okur (DealerGuard).
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { AdminGuard, CurrentUser, DealerGuard } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import {
  createBannerSchema,
  reorderBannersSchema,
  updateBannerSchema,
  type CreateBannerInput,
  type ReorderBannersInput,
  type UpdateBannerInput,
} from './banners.schemas.js';
import { BannersService } from './banners.service.js';

@Controller('admin/banners')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminBannersController {
  constructor(@Inject(BannersService) private readonly banners: BannersService) {}

  @Get()
  list() {
    return this.banners.list();
  }

  @Post()
  create(@Body({ schema: createBannerSchema }) body: CreateBannerInput, @CurrentUser() admin: AuthIdentity) {
    return this.banners.create(body, admin.id);
  }

  @Put('order')
  reorder(@Body({ schema: reorderBannersSchema }) body: ReorderBannersInput, @CurrentUser() admin: AuthIdentity) {
    return this.banners.reorder(body, admin.id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: updateBannerSchema }) body: UpdateBannerInput,
    @CurrentUser() admin: AuthIdentity,
  ) {
    return this.banners.update(id, body, admin.id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() admin: AuthIdentity): Promise<void> {
    await this.banners.remove(id, admin.id);
  }
}

@Controller('catalog/banners')
@UseGuards(DealerGuard)
export class CatalogBannersController {
  constructor(@Inject(BannersService) private readonly banners: BannersService) {}

  @Get()
  list() {
    return this.banners.listPublic();
  }
}
