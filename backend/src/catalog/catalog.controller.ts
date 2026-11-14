// Bayi kataloğu uçları. GR-URN-003, GR-FIY-001. Yetki sunucuda: anonim 401, Admin oturumu 403.
import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, UseGuards, UsePipes } from '@nestjs/common';
import { CurrentUser, DealerGuard } from '../auth/auth.guards.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import { catalogListSchema, type CatalogListQuery } from './catalog.schemas.js';
import { CatalogService } from './catalog.service.js';

@Controller('catalog')
@UseGuards(DealerGuard)
@UsePipes(createValidationPipe())
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get('groups')
  groups() {
    return this.catalog.groups();
  }

  @Get('products')
  list(@Query({ schema: catalogListSchema }) query: CatalogListQuery, @CurrentUser() dealer: AuthIdentity) {
    return this.catalog.list(dealer.id, query);
  }

  @Get('products/:id')
  get(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() dealer: AuthIdentity) {
    return this.catalog.get(dealer.id, id);
  }
}
