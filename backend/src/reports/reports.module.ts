import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DealersModule } from '../dealers/dealers.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [AuthModule, DealersModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
