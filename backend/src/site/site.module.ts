import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { AdminSiteController, SiteController } from './site.controller.js';
import { SiteService } from './site.service.js';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [SiteController, AdminSiteController],
  providers: [SiteService],
  exports: [SiteService],
})
export class SiteModule {}
