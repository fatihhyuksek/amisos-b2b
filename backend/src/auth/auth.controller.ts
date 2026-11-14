// Kimlik doğrulama uçları. GR-BAYI-006, GR-BAYI-007, GR-YON-001; K-29, K-39.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createValidationPipe } from '../common/validation.js';
import { isProductionLike, type Env } from '../config/env.js';
import { SESSION_COOKIE } from './auth.constants.js';
import {
  AuthenticatedGuard,
  CurrentUser,
  cookieOptions,
  readSessionToken,
} from './auth.guards.js';
import {
  emailVerifySchema,
  invitationAcceptSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from './auth.schemas.js';
import { JsonOnlyGuard } from './json-only.guard.js';
import { AuthService, type LoginResult } from './auth.service.js';
import { SessionsService, type AuthIdentity } from './sessions.service.js';

@Controller('auth')
@UseGuards(JsonOnlyGuard)
@UsePipes(createValidationPipe())
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('dealer/login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async dealerLogin(
    @Body({ schema: loginSchema }) body: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthIdentity> {
    const result = await this.auth.loginDealer(body.email, body.password);
    await this.dropPreviousSession(req); // oturum sabitlemeyi önler: her girişte yeni token
    return this.startSession(res, result);
  }

  @Post('admin/login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async adminLogin(
    @Body({ schema: loginSchema }) body: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthIdentity> {
    const result = await this.auth.loginAdmin(body.email, body.password);
    await this.dropPreviousSession(req); // oturum sabitlemeyi önler: her girişte yeni token
    return this.startSession(res, result);
  }

  /** Oturum yoksa da başarılıdır (idempotent). */
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.dropPreviousSession(req);
    res.clearCookie(SESSION_COOKIE, cookieOptions(this.secure()));
  }

  @Get('me')
  @UseGuards(AuthenticatedGuard)
  me(@CurrentUser() user: AuthIdentity): AuthIdentity {
    return user;
  }

  /** Her zaman 202: e-postanın kayıtlı olup olmadığı sızdırılmaz. */
  @Post('password-reset/request')
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  passwordResetRequest(
    @Body({ schema: passwordResetRequestSchema })
    body: {
      email: string;
      type: 'admin' | 'dealer';
    },
  ): void {
    // İş arka planda; yanıt süresi hesabın varlığına bağlı değildir.
    this.auth.requestPasswordReset(body.email, body.type);
  }

  @Post('password-reset/confirm')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  async passwordResetConfirm(
    @Body({ schema: passwordResetConfirmSchema })
    body: {
      token: string;
      password: string;
    },
  ): Promise<void> {
    await this.auth.confirmPasswordReset(body.token, body.password);
  }

  @Post('email/verify')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  async emailVerify(
    @Body({ schema: emailVerifySchema }) body: { token: string },
  ): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  /** K-04: davetle şifre belirleme. Otomatik giriş yapılmaz. */
  @Post('invitation/accept')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  async invitationAccept(
    @Body({ schema: invitationAcceptSchema })
    body: {
      token: string;
      password: string;
      consents: { kvkk: true; terms: true; marketing: boolean };
    },
  ): Promise<void> {
    await this.auth.acceptInvitation(body.token, body.password, body.consents);
  }

  private startSession(res: Response, result: LoginResult): AuthIdentity {
    res.cookie(
      SESSION_COOKIE,
      result.token,
      cookieOptions(this.secure(), result.expiresAt),
    );
    return result.identity;
  }

  private async dropPreviousSession(req: Request): Promise<void> {
    const token = readSessionToken(req);
    if (token) await this.sessions.destroy(token);
  }

  private secure(): boolean {
    return isProductionLike(this.config.get('NODE_ENV', { infer: true }));
  }
}
