import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CartService } from './cart.service.js';
import { AdminOrdersController, CartController, OrdersController } from './orders.controllers.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CartController, OrdersController, AdminOrdersController],
  providers: [CartService, OrdersService],
})
export class OrdersModule {}
