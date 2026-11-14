// Admin bayi yönetimi. GR-BAYI-002, 003, 006, 008, GR-YON-001; K-04, K-08, K-12, K-43, K-51.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AdminGuard, CurrentUser } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import {
  groupDiscountsSchema,
  type GroupDiscountsInput,
} from '../catalog/catalog.schemas.js';
import { createValidationPipe } from '../common/validation.js';
import {
  createDealerSchema,
  listQuerySchema,
  reasonOptionalSchema,
  reasonRequiredSchema,
  termsSchema,
  type DealerFieldsInput,
  type ListQuery,
} from './dealers.schemas.js';
import { DealersService } from './dealers.service.js';

// Yetki sunucuda: tüm uçlar AdminGuard arkasında (GR-YON-001).
@Controller('admin/dealers')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminDealersController {
  constructor(
    @Inject(DealersService) private readonly dealers: DealersService,
  ) {}

  @Get()
  list(@Query({ schema: listQuerySchema }) query: ListQuery) {
    return this.dealers.list(query);
  }

  // `summary`, `:id` rotasından önce tanımlı olmalı.
  @Get('summary')
  summary() {
    return this.dealers.summary();
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.dealers.detail(id);
  }

  @Post()
  create(
    @Body({ schema: createDealerSchema }) body: DealerFieldsInput,
    @CurrentUser() admin: AuthIdentity,
  ) {
    return this.dealers.createWithInvitation(body, admin.id);
  }

  @Post(':id/approve')
  @HttpCode(204)
  async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: AuthIdentity,
  ): Promise<void> {
    await this.dealers.approve(id, admin.id);
  }

  @Post(':id/reject')
  @HttpCode(204)
  async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: reasonRequiredSchema }) body: { reason: string },
    @CurrentUser() admin: AuthIdentity,
  ): Promise<void> {
    await this.dealers.reject(id, admin.id, body.reason);
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  async deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: reasonRequiredSchema }) body: { reason: string },
    @CurrentUser() admin: AuthIdentity,
  ): Promise<void> {
    await this.dealers.deactivate(id, admin.id, body.reason);
  }

  @Post(':id/activate')
  @HttpCode(204)
  async activate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: reasonOptionalSchema }) body: { reason?: string },
    @CurrentUser() admin: AuthIdentity,
  ): Promise<void> {
    await this.dealers.activate(id, admin.id, body?.reason);
  }

  @Post(':id/resend-invitation')
  @HttpCode(204)
  async resendInvitation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: AuthIdentity,
  ): Promise<void> {
    await this.dealers.resendInvitation(id, admin.id);
  }

  @Patch(':id/terms')
  @HttpCode(204)
  async terms(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: termsSchema })
    body: { generalDiscountPercent: string | null },
    @CurrentUser() admin: AuthIdentity,
  ): Promise<void> {
    await this.dealers.setGeneralDiscount(
      id,
      admin.id,
      body.generalDiscountPercent,
    );
  }

  // K-12, K-13: bayiye ürün grubu bazında iskonto.
  @Get(':id/group-discounts')
  groupDiscounts(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.dealers.getGroupDiscounts(id);
  }

  @Put(':id/group-discounts')
  @HttpCode(204)
  async setGroupDiscounts(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: groupDiscountsSchema }) body: GroupDiscountsInput,
    @CurrentUser() admin: AuthIdentity,
  ): Promise<void> {
    await this.dealers.setGroupDiscounts(id, admin.id, body.items);
  }
}
