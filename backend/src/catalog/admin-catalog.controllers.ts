// Admin: ürün grupları ve ürünler. Yetki sunucuda (AdminGuard); JSON uçları JsonOnlyGuard arkasında.
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
  Query,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard, CurrentUser } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { sendXlsx } from '../common/xlsx-response.js';
import { createValidationPipe } from '../common/validation.js';
import { buildTable } from '../reports/reports.excel.js';
import { istanbulToday } from '../reports/periods.js';
import {
  adminProductListSchema,
  bulkProductsSchema,
  createGroupSchema,
  createProductSchema,
  duplicateProductSchema,
  updateGroupSchema,
  updateProductSchema,
  type AdminProductListQuery,
  type BulkProductsInput,
  type CreateGroupInput,
  type CreateProductInput,
  type DuplicateProductInput,
  type UpdateGroupInput,
  type UpdateProductInput,
} from './catalog.schemas.js';
import { ProductGroupsService } from './product-groups.service.js';
import { ProductsService } from './products.service.js';

@Controller('admin/product-groups')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminProductGroupsController {
  constructor(@Inject(ProductGroupsService) private readonly groups: ProductGroupsService) {}

  @Get()
  list() {
    return this.groups.list();
  }

  @Post()
  create(@Body({ schema: createGroupSchema }) body: CreateGroupInput, @CurrentUser() admin: AuthIdentity) {
    return this.groups.create(body, admin.id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: updateGroupSchema }) body: UpdateGroupInput,
    @CurrentUser() admin: AuthIdentity,
  ) {
    return this.groups.update(id, body, admin.id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() admin: AuthIdentity): Promise<void> {
    await this.groups.remove(id, admin.id);
  }
}

// `import-template` ve `import` rotaları AdminProductImportController'da (önce kayıtlı) tanımlıdır.
@Controller('admin/products')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminProductsController {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  list(@Query({ schema: adminProductListSchema }) query: AdminProductListQuery) {
    return this.products.list(query);
  }

  /**
   * K-78: ürün listesi Excel'i (aynı filtreler). İlk 7 sütun içe aktarma şablonuyla aynı sırada ve başlık
   * eşleşmesindedir; düzenlenip yeniden içe aktarılabilir. `:id` rotasından önce tanımlı olmalı.
   */
  @Get('export.xlsx')
  async exportXlsx(@Query({ schema: adminProductListSchema }) query: AdminProductListQuery, @Res() res: Response) {
    const rows = await this.products.rowsForExport(query);
    const yesNo = (v: boolean) => (v ? 'Evet' : 'Hayır');
    const file = await buildTable(
      'Ürünler',
      `urunler-${istanbulToday(this.clock.now())}.xlsx`,
      [
        { header: 'Barkod', kind: 'text', width: 20, value: (r) => r.product.barcode },
        { header: 'Kod', kind: 'text', width: 18, value: (r) => r.product.code },
        { header: 'Ad', kind: 'text', width: 44, value: (r) => r.product.name },
        { header: 'Grup', kind: 'text', width: 24, value: (r) => r.groupName },
        { header: 'Koli içi', kind: 'int', value: (r) => r.product.caseQuantity },
        { header: 'Liste fiyatı', kind: 'money', width: 16, value: (r) => r.product.listPrice },
        { header: 'KDV %', kind: 'percent', value: (r) => r.product.vatRate },
        { header: 'Stok', kind: 'text', value: (r) => (r.product.stockStatus === 'in_stock' ? 'Var' : 'Yok') },
        { header: 'Durum', kind: 'text', value: (r) => (r.product.isActive ? 'Aktif' : 'Pasif') },
        { header: 'Öne çıkan', kind: 'text', value: (r) => yesNo(r.product.isFeatured) },
        { header: 'Görsel sayısı', kind: 'int', value: (r) => r.imageCount },
        // K-80: ilk 7 sütun şablonla aynı sırada kalır; ID içe aktarmada da başlıkla eşleşir.
        { header: 'BizimHesap ID', kind: 'text', width: 22, value: (r) => r.product.bizimhesapId },
      ],
      rows,
    );
    sendXlsx(res, file);
  }

  // K-78: kopyalama (`:id` ile çakışmaz: ek segment).
  @Post(':id/duplicate')
  duplicate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: duplicateProductSchema }) body: DuplicateProductInput,
    @CurrentUser() admin: AuthIdentity,
  ) {
    return this.products.duplicate(id, body, admin.id);
  }

  // K-75: `bulk`, `:id` rotalarından önce/ayrı bir POST yoludur.
  @Post('bulk')
  @HttpCode(200)
  bulk(@Body({ schema: bulkProductsSchema }) body: BulkProductsInput, @CurrentUser() admin: AuthIdentity) {
    return this.products.bulk(body, admin.id);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.get(id);
  }

  @Post()
  create(@Body({ schema: createProductSchema }) body: CreateProductInput, @CurrentUser() admin: AuthIdentity) {
    return this.products.create(body, admin.id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: updateProductSchema }) body: UpdateProductInput,
    @CurrentUser() admin: AuthIdentity,
  ) {
    return this.products.update(id, body, admin.id);
  }
}
