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
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AdminGuard, CurrentUser } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import {
  adminProductListSchema,
  bulkProductsSchema,
  createGroupSchema,
  createProductSchema,
  updateGroupSchema,
  updateProductSchema,
  type AdminProductListQuery,
  type BulkProductsInput,
  type CreateGroupInput,
  type CreateProductInput,
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
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Get()
  list(@Query({ schema: adminProductListSchema }) query: AdminProductListQuery) {
    return this.products.list(query);
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
