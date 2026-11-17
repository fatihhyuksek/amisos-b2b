// Admin bayi yönetimi. GR-BAYI-002, 003, 006, 008, GR-YON-001; K-04, K-08, K-12, K-43, K-51.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard, CurrentUser } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import {
  groupDiscountsSchema,
  type GroupDiscountsInput,
} from '../catalog/catalog.schemas.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { sendXlsx } from '../common/xlsx-response.js';
import { createValidationPipe } from '../common/validation.js';
import { istanbulToday } from '../reports/periods.js';
import { buildTable } from '../reports/reports.excel.js';
import {
  createDealerSchema,
  createNoteSchema,
  updateDealerSchema,
  type CreateNoteInput,
  type UpdateDealerInput,
  listQuerySchema,
  reasonOptionalSchema,
  reasonRequiredSchema,
  termsSchema,
  type DealerFieldsInput,
  type ListQuery,
} from './dealers.schemas.js';
import { DealersService } from './dealers.service.js';

const DEALER_STATUS_LABELS = {
  pending_email: 'E-posta bekleniyor',
  pending_approval: 'Onay bekliyor',
  active: 'Aktif',
  rejected: 'Reddedildi',
  passive: 'Pasif',
} as const;

// Yetki sunucuda: tüm uçlar AdminGuard arkasında (GR-YON-001).
@Controller('admin/dealers')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminDealersController {
  constructor(
    @Inject(DealersService) private readonly dealers: DealersService,
    @Inject(CLOCK) private readonly clock: Clock,
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

  /** K-78: bayi listesi Excel'i (aynı filtreler). `:id` rotasından önce tanımlı olmalı. */
  @Get('export.xlsx')
  async exportXlsx(@Query({ schema: listQuerySchema }) query: ListQuery, @Res() res: Response) {
    const rows = await this.dealers.rowsForExport(query);
    const file = await buildTable(
      'Bayiler',
      `bayiler-${istanbulToday(this.clock.now())}.xlsx`,
      [
        { header: 'Unvan', width: 36, value: (r) => r.dealer.companyTitle },
        { header: 'Yetkili', width: 24, value: (r) => r.dealer.contactName },
        { header: 'E-posta', width: 30, value: (r) => r.dealer.email },
        { header: 'Telefon', width: 16, value: (r) => r.dealer.phone },
        { header: 'İl', value: (r) => r.dealer.city },
        { header: 'İlçe', value: (r) => r.dealer.district },
        { header: 'Adres', width: 44, value: (r) => r.dealer.address },
        { header: 'Vergi dairesi', width: 18, value: (r) => r.dealer.taxOffice },
        { header: 'Vergi no', width: 14, value: (r) => r.dealer.taxNumber },
        { header: 'Durum', width: 18, value: (r) => DEALER_STATUS_LABELS[r.dealer.status] },
        { header: 'Genel iskonto', kind: 'percent', value: (r) => r.dealer.generalDiscountPercent },
        { header: 'Kayıt tarihi', kind: 'date', width: 18, value: (r) => r.dealer.createdAt },
        { header: 'Son giriş', kind: 'date', width: 18, value: (r) => r.dealer.lastLoginAt },
        { header: 'Sipariş sayısı', kind: 'count', value: (r) => r.orderCount },
        { header: 'Son sipariş', kind: 'date', width: 18, value: (r) => r.lastOrderAt },
      ],
      rows,
    );
    sendXlsx(res, file);
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

  // K-75: bayi bilgilerini düzenleme.
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: updateDealerSchema }) body: UpdateDealerInput,
    @CurrentUser() admin: AuthIdentity,
  ) {
    return this.dealers.update(id, body, admin.id);
  }

  // K-75: iç notlar (yalnızca Admin).
  @Get(':id/notes')
  notes(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.dealers.listNotes(id);
  }

  @Post(':id/notes')
  addNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: createNoteSchema }) body: CreateNoteInput,
    @CurrentUser() admin: AuthIdentity,
  ) {
    return this.dealers.addNote(id, body.body, admin.id);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(204)
  async deleteNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('noteId', new ParseUUIDPipe()) noteId: string,
    @CurrentUser() admin: AuthIdentity,
  ): Promise<void> {
    await this.dealers.deleteNote(id, noteId, admin.id);
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
