import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.js';
import { AdminGuard, AuthenticatedGuard, DealerGuard } from './auth.guards.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthTokensService } from './auth-tokens.service.js';
import { LoginAttemptLimiter } from './login-attempt-limiter.js';
import { PasswordService } from './password.service.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [
    // Hız sınırı: yalnızca ThrottlerGuard kullanan uçlarda (giriş, şifre sıfırlama) geçerli.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            ttl: 60_000,
            limit: config.get('AUTH_RATE_LIMIT_PER_MINUTE', { infer: true }),
          },
        ],
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokensService,
    PasswordService,
    LoginAttemptLimiter,
    SessionsService,
    AuthenticatedGuard,
    AdminGuard,
    DealerGuard,
  ],
  exports: [
    SessionsService,
    AuthTokensService,
    PasswordService,
    AuthService,
    AuthenticatedGuard,
    AdminGuard,
    DealerGuard,
  ],
})
export class AuthModule {}
