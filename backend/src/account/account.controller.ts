// Bayi hesabı uçları (K-67 – K-69). Yetki sunucuda: DealerGuard (anonim 401, Admin 403).
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { changePasswordSchema, type ChangePasswordInput } from '../auth/account.schemas.js';
import { CurrentUser, DealerGuard, readSessionToken } from '../auth/auth.guards.js';
import { AuthService } from '../auth/auth.service.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import {
  createAddressSchema,
  marketingConsentSchema,
  updateAccountSchema,
  updateAddressSchema,
  type CreateAddressInput,
  type UpdateAccountInput,
  type UpdateAddressInput,
} from './account.schemas.js';
import { AccountService } from './account.service.js';

@Controller('account')
@UseGuards(JsonOnlyGuard, DealerGuard)
@UsePipes(createValidationPipe())
export class AccountController {
  constructor(
    @Inject(AccountService) private readonly account: AccountService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  get(@CurrentUser() dealer: AuthIdentity) {
    return this.account.get(dealer.id);
  }

  @Patch()
  update(@Body({ schema: updateAccountSchema }) body: UpdateAccountInput, @CurrentUser() dealer: AuthIdentity) {
    return this.account.update(dealer.id, body);
  }

  @Post('password')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  async password(
    @Body({ schema: changePasswordSchema }) body: ChangePasswordInput,
    @CurrentUser() dealer: AuthIdentity,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.changePassword('dealer', dealer.id, readSessionToken(req), body.currentPassword, body.newPassword);
  }

  @Post('sessions/revoke-others')
  @HttpCode(204)
  async revokeOthers(@CurrentUser() dealer: AuthIdentity, @Req() req: Request): Promise<void> {
    await this.auth.revokeOtherSessions('dealer', dealer.id, readSessionToken(req));
  }

  @Put('marketing-consent')
  @HttpCode(204)
  async marketing(
    @Body({ schema: marketingConsentSchema }) body: { granted: boolean },
    @CurrentUser() dealer: AuthIdentity,
  ): Promise<void> {
    await this.account.setMarketingConsent(dealer.id, body.granted);
  }

  @Get('addresses')
  addresses(@CurrentUser() dealer: AuthIdentity) {
    return this.account.listAddresses(dealer.id);
  }

  @Post('addresses')
  createAddress(@Body({ schema: createAddressSchema }) body: CreateAddressInput, @CurrentUser() dealer: AuthIdentity) {
    return this.account.createAddress(dealer.id, body);
  }

  @Patch('addresses/:id')
  updateAddress(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: updateAddressSchema }) body: UpdateAddressInput,
    @CurrentUser() dealer: AuthIdentity,
  ) {
    return this.account.updateAddress(dealer.id, id, body);
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  async deleteAddress(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() dealer: AuthIdentity): Promise<void> {
    await this.account.deleteAddress(dealer.id, id);
  }
}
