import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminProductImportController } from './admin-product-import.controller.js';
import { AdminProductGroupsController, AdminProductsController } from './admin-catalog.controllers.js';
import { CatalogController, FavoritesController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { PopularityService } from './popularity.service.js';
import { PriceListService } from './price-list.service.js';
import { ProductGroupsService } from './product-groups.service.js';
import { ProductImportService } from './product-import.service.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [AuthModule],
  // Sıra önemli: import-template/import rotaları `admin/products/:id` rotasından önce kaydedilmeli.
  controllers: [
    AdminProductImportController,
    AdminProductGroupsController,
    AdminProductsController,
    CatalogController,
    FavoritesController,
  ],
  providers: [ProductGroupsService, ProductsService, ProductImportService, CatalogService, PriceListService, PopularityService],
  exports: [PopularityService],
})
export class CatalogModule {}
