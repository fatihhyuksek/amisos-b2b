import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminDealersController } from './admin-dealers.controller.js';
import { ApplicationsController } from './applications.controller.js';
import { ApprovalReminderService } from './approval-reminder.service.js';
import { DealersService } from './dealers.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ApplicationsController, AdminDealersController],
  providers: [DealersService, ApprovalReminderService],
  exports: [DealersService, ApprovalReminderService],
})
export class DealersModule {}
