// Katalog uçları. K-66: oturumsuz da çalışır (OptionalAuthGuard); fiyat/iskonto/stok/KDV yalnızca bayi
// oturumunda döner (servis katmanında, sunucuda karar verilir). Fiyat listesi Excel'i yalnızca bayiye (K-72).
// Favoriler yalnızca bayiye (K-70).
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, DealerGuard, OptionalAuthGuard } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import { catalogListSchema, type CatalogListQuery } from './catalog.schemas.js';
import { CatalogService } from './catalog.service.js';
import { PriceListService } from './price-list.service.js';

/** Yalnızca bayi oturumu fiyat görür; oturumsuz ve Admin oturumu görmez (K-66). */
const dealerIdOf = (user: AuthIdentity | undefined): string | null => (user?.type === 'dealer' ? user.id : null);

@Controller('catalog')
@UseGuards(OptionalAuthGuard)
@UsePipes(createValidationPipe())
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(PriceListService) private readonly priceList: PriceListService,
  ) {}

  @Get('groups')
  groups() {
    return this.catalog.groups();
  }

  @Get('products')
  list(@Query({ schema: catalogListSchema }) query: CatalogListQuery, @CurrentUser() user: AuthIdentity | undefined) {
    return this.catalog.list(dealerIdOf(user), query);
  }

  // `price-list.xlsx`, `products/:id` ile çakışmaz (farklı yol); yine de açık: yalnızca DealerGuard.
  @Get('price-list.xlsx')
  @UseGuards(DealerGuard)
  async priceListXlsx(@CurrentUser() dealer: AuthIdentity, @Res() res: Response) {
    const file = await this.priceList.build(dealer.id);
    res
      .status(200)
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Content-Length': String(file.data.length),
        'Cache-Control': 'no-store',
      })
      .end(file.data);
  }

  // K-82: oturumsuz açık; `products/:id` ile çakışmaz (ek segment).
  @Get('products/by-slug/:slug')
  productBySlug(@Param('slug') slug: string, @CurrentUser() user: AuthIdentity | undefined) {
    return this.catalog.productBySlug(dealerIdOf(user), slug);
  }

  @Get('groups/by-slug/:slug')
  groupBySlug(@Param('slug') slug: string) {
    return this.catalog.groupBySlug(slug);
  }

  @Get('products/:id')
  get(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthIdentity | undefined) {
    return this.catalog.get(dealerIdOf(user), id);
  }
}

@Controller('favorites')
@UseGuards(JsonOnlyGuard, DealerGuard)
@UsePipes(createValidationPipe())
export class FavoritesController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  list(@CurrentUser() dealer: AuthIdentity) {
    return this.catalog.favorites(dealer.id);
  }

  @Put(':productId')
  @HttpCode(204)
  async add(@Param('productId', new ParseUUIDPipe()) productId: string, @CurrentUser() dealer: AuthIdentity): Promise<void> {
    await this.catalog.addFavorite(dealer.id, productId);
  }

  @Delete(':productId')
  @HttpCode(204)
  async remove(@Param('productId', new ParseUUIDPipe()) productId: string, @CurrentUser() dealer: AuthIdentity): Promise<void> {
    await this.catalog.removeFavorite(dealer.id, productId);
  }
}
