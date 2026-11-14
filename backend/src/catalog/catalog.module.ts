import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminProductImportController } from './admin-product-import.controller.js';
import { AdminProductGroupsController, AdminProductsController } from './admin-catalog.controllers.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
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
  ],
  providers: [ProductGroupsService, ProductsService, ProductImportService, CatalogService],
})
export class CatalogModule {}
