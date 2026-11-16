// Yetki kontrolü sunucuda (GR-YON-001: bayi yönetim paneline hiçbir yoldan erişemez).
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  createParamDecorator,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { isProductionLike, type Env } from '../config/env.js';
import { SESSION_COOKIE } from './auth.constants.js';
import { SessionsService, type AuthIdentity } from './sessions.service.js';

export function cookieOptions(secure: boolean, expires?: Date) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    expires,
  };
}

export type AuthenticatedRequest = Request & { auth?: AuthIdentity };

export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === SESSION_COOKIE) {
      const value = part.slice(index + 1).trim();
      return value || undefined;
    }
  }
  return undefined;
}

abstract class SessionGuard implements CanActivate {
  protected abstract readonly allowed?: AuthIdentity['type'];

  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionToken(req);
    const resolved = token ? await this.sessions.resolve(token) : null;
    if (!resolved) throw new UnauthorizedException('Oturum açmanız gerekiyor.');
    if (this.allowed && resolved.identity.type !== this.allowed) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok.');
    }
    req.auth = resolved.identity;
    // Kayan süre: çerezin bitişi de sunucudaki oturumla birlikte uzar.
    const secure = isProductionLike(
      this.config.get('NODE_ENV', { infer: true }),
    );
    context
      .switchToHttp()
      .getResponse<Response>()
      .cookie(SESSION_COOKIE, token, cookieOptions(secure, resolved.expiresAt));
    return true;
  }
}

/**
 * K-66: açık vitrin. Geçerli oturum varsa `req.auth` doldurulur; yoksa (veya oturum geçersizse)
 * istek anonim olarak geçer, hata atılmaz. Fiyat görünürlüğüne servis katmanı karar verir.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionToken(req);
    const resolved = token ? await this.sessions.resolve(token) : null;
    if (token && resolved) {
      req.auth = resolved.identity;
      const secure = isProductionLike(this.config.get('NODE_ENV', { infer: true }));
      context
        .switchToHttp()
        .getResponse<Response>()
        .cookie(SESSION_COOKIE, token, cookieOptions(secure, resolved.expiresAt));
    }
    // Yanıt oturuma göre değişir: ortak önbellekler kullanıcılar arasında paylaşmasın.
    context.switchToHttp().getResponse<Response>().vary('Cookie');
    return true;
  }
}

/** Giriş yapmış herhangi bir kullanıcı (bayi veya Admin). */
@Injectable()
export class AuthenticatedGuard extends SessionGuard {
  protected readonly allowed = undefined;
}

@Injectable()
export class AdminGuard extends SessionGuard {
  protected readonly allowed = 'admin' as const;
}

@Injectable()
export class DealerGuard extends SessionGuard {
  protected readonly allowed = 'dealer' as const;
}

/** Guard'dan geçmiş isteğin kullanıcısı: `@CurrentUser() user: AuthIdentity`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth;
  },
);
