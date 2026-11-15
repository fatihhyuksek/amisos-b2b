// Sepet, ön sipariş ve Admin sipariş okuma uçları. Yetki sunucuda (DealerGuard/AdminGuard):
// anonim 401, yanlış rol 403. GR-FIY-001, GR-SIP-005, GR-SIP-006.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AdminGuard, CurrentUser, DealerGuard } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import { CartService } from './cart.service.js';
import { OrdersService } from './orders.service.js';
import {
  adminOrderListSchema,
  cartItemSchema,
  orderListSchema,
  submitOrderSchema,
  type AdminOrderListQuery,
  type CartItemInput,
  type OrderListQuery,
  type SubmitOrderInput,
} from './orders.schemas.js';

@Controller('cart')
@UseGuards(JsonOnlyGuard, DealerGuard)
@UsePipes(createValidationPipe())
export class CartController {
  constructor(@Inject(CartService) private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() dealer: AuthIdentity) {
    return this.cart.get(dealer.id);
  }

  @Get('checkout-defaults')
  checkoutDefaults(@CurrentUser() dealer: AuthIdentity) {
    return this.cart.checkoutDefaults(dealer.id);
  }

  @Put('items/:productId')
  setQuantity(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body({ schema: cartItemSchema }) body: CartItemInput,
    @CurrentUser() dealer: AuthIdentity,
  ) {
    return this.cart.setQuantity(dealer.id, productId, body.quantity);
  }

  @Delete('items/:productId')
  removeItem(@Param('productId', new ParseUUIDPipe()) productId: string, @CurrentUser() dealer: AuthIdentity) {
    return this.cart.removeItem(dealer.id, productId);
  }

  @Delete()
  @HttpCode(204)
  async clear(@CurrentUser() dealer: AuthIdentity): Promise<void> {
    await this.cart.clear(dealer.id);
  }
}

@Controller('orders')
@UseGuards(JsonOnlyGuard, DealerGuard)
@UsePipes(createValidationPipe())
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Post()
  submit(@Body({ schema: submitOrderSchema }) body: SubmitOrderInput, @CurrentUser() dealer: AuthIdentity) {
    return this.orders.submit(dealer.id, body);
  }

  @Get()
  list(@Query({ schema: orderListSchema }) query: OrderListQuery, @CurrentUser() dealer: AuthIdentity) {
    return this.orders.listForDealer(dealer.id, query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() dealer: AuthIdentity) {
    return this.orders.getForDealer(dealer.id, id);
  }

  @Post(':id/reorder')
  @HttpCode(200)
  reorder(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() dealer: AuthIdentity) {
    return this.orders.reorder(dealer.id, id);
  }
}

@Controller('admin/orders')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminOrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get()
  list(@Query({ schema: adminOrderListSchema }) query: AdminOrderListQuery) {
    return this.orders.listForAdmin(query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.getForAdmin(id);
  }
}
