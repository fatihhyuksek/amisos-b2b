// Multipart uçlar form kodlu istekle çapraz siteden tetiklenebilir (JsonOnlyGuard bunlara uygulanmaz).
// Savunma derinliği: tarayıcı başlıkları varsa aynı kaynaktan gelmelidir. Başlık yoksa (CLI, test) izin.
import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.js';

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

@Injectable()
export class SameOriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.allowed = new Set(
      [config.get('APP_URL', { infer: true }), config.get('CORS_ORIGIN', { infer: true })]
        .map((u) => originOf(u))
        .filter((o): o is string => o !== null),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const site = req.headers['sec-fetch-site'];
    const origin = req.headers.origin;
    const deny = () => new ForbiddenException('İstek bu kaynaktan kabul edilmiyor.');
    if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') throw deny();
    if (typeof origin === 'string' && !this.allowed.has(origin)) throw deny();
    return true;
  }
}
