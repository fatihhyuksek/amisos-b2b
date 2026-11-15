import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminBannersController, CatalogBannersController } from './banners.controllers.js';
import { BannersService } from './banners.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminBannersController, CatalogBannersController],
  providers: [BannersService],
})
export class BannersModule {}
