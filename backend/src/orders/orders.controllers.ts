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
  Req,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AnalyticsRecorder } from '../analytics/analytics-recorder.service.js';
import { AdminGuard, CurrentUser, DealerGuard } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import { CartService } from './cart.service.js';
import type { Request, Response } from 'express';
import { AdminOrdersService } from './admin-orders.service.js';
import { createNoteSchema, type CreateNoteInput } from '../dealers/dealers.schemas.js';
import { OrdersService } from './orders.service.js';
import {
  adminOrderListSchema,
  cartItemSchema,
  quickAddSchema,
  type QuickAddInput,
  changeStatusSchema,
  markTransferredSchema,
  type ChangeStatusInput,
  type MarkTransferredInput,
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

  /** K-71: hızlı sipariş (barkod/kod listesi). */
  @Post('quick-add')
  @HttpCode(200)
  quickAdd(@Body({ schema: quickAddSchema }) body: QuickAddInput, @CurrentUser() dealer: AuthIdentity) {
    return this.cart.quickAdd(dealer.id, body);
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
  constructor(
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(AnalyticsRecorder) private readonly analytics: AnalyticsRecorder,
  ) {}

  @Post()
  async submit(@Body({ schema: submitOrderSchema }) body: SubmitOrderInput, @CurrentUser() dealer: AuthIdentity, @Req() req: Request) {
    const order = await this.orders.submit(dealer.id, body);
    // K-84: sunucu tarafı `order_submitted` olayı (net tutar siparişten okunur; hata siparişi bozmaz).
    await this.analytics.recordServer(req, dealer.id, { type: 'order_submitted', path: '/sepet', orderId: order.id });
    return order;
  }

  @Get()
  list(@Query({ schema: orderListSchema }) query: OrderListQuery, @CurrentUser() dealer: AuthIdentity) {
    return this.orders.listForDealer(dealer.id, query);
  }

  // K-72: `:id/export.xlsx`, `:id` ile çakışmaz (ek segment).
  @Get(':id/export.xlsx')
  async exportOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() dealer: AuthIdentity,
    @Res() res: Response,
  ) {
    send(res, await this.orders.exportForDealer(dealer.id, id));
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
  constructor(@Inject(AdminOrdersService) private readonly orders: AdminOrdersService) {}

  @Get()
  list(@Query({ schema: adminOrderListSchema }) query: AdminOrderListQuery) {
    return this.orders.list(query);
  }

  // `summary` ve `export.xlsx` rotaları `:id` rotalarından önce tanımlı olmalı.
  @Get('summary')
  summary() {
    return this.orders.summary();
  }

  @Get('export.xlsx')
  async exportList(@Query({ schema: adminOrderListSchema }) query: AdminOrderListQuery, @Res() res: Response) {
    send(res, await this.orders.exportList(query));
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.get(id);
  }

  @Get(':id/export.xlsx')
  async exportOne(@Param('id', new ParseUUIDPipe()) id: string, @Res() res: Response) {
    send(res, await this.orders.exportOrder(id));
  }

  // K-78: iç notlar (yalnızca Admin; bayi uçlarında hiçbir yerde dönmez).
  @Get(':id/notes')
  notes(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.listNotes(id);
  }

  @Post(':id/notes')
  addNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: createNoteSchema }) body: CreateNoteInput,
    @CurrentUser() admin: AuthIdentity,
  ) {
    return this.orders.addNote(id, body.body, admin.id);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(204)
  async deleteNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('noteId', new ParseUUIDPipe()) noteId: string,
    @CurrentUser() admin: AuthIdentity,
  ): Promise<void> {
    await this.orders.deleteNote(id, noteId, admin.id);
  }

  @Post(':id/status')
  @HttpCode(200)
  changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: changeStatusSchema }) body: ChangeStatusInput,
    @CurrentUser() admin: AuthIdentity,
  ) {
    return this.orders.changeStatus(id, admin.id, body);
  }

  @Post(':id/transfer')
  @HttpCode(200)
  markTransferred(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: markTransferredSchema }) body: MarkTransferredInput,
    @CurrentUser() admin: AuthIdentity,
  ) {
    return this.orders.markTransferred(id, admin.id, body);
  }

  @Delete(':id/transfer')
  unmarkTransferred(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() admin: AuthIdentity) {
    return this.orders.unmarkTransferred(id, admin.id);
  }
}

function send(res: Response, file: { filename: string; data: Buffer }): void {
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
