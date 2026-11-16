// E-posta bazlı giriş sınırı (GR-BAYI-007): IP sınırına ek olarak, dağıtık denemelerde de
// aynı hesaba dakikada en fazla N başarısız deneme. Bellekte tutulur.
// NOT: Çok örnekli (birden çok sunucu) kurulumda sayaçlar örnekler arasında paylaşılmaz;
// o durumda paylaşılan bir depo (Redis veya veritabanı) gerekir. Aynı not IP sınırı için
// de geçerlidir (ThrottlerModule varsayılan olarak bellek deposu kullanır).
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK, type Clock } from '../common/clock.js';
import type { Env } from '../config/env.js';
import type { SubjectType } from './auth-tokens.service.js';

const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;

@Injectable()
export class LoginAttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  /** Sınır aşıldıysa 429 fırlatır; şifre doğrulamasından ÖNCE çağrılır. */
  assertAllowed(type: SubjectType, normalizedEmail: string): void {
    if (this.recent(type, normalizedEmail).length >= this.limit()) {
      throw new HttpException(
        'Çok fazla deneme. Lütfen bir dakika sonra tekrar deneyin.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(type: SubjectType, normalizedEmail: string): void {
    const key = this.key(type, normalizedEmail);
    const list = this.recent(type, normalizedEmail);
    list.push(this.clock.now().getTime());
    this.failures.set(key, list);
    if (this.failures.size > MAX_KEYS) this.prune();
  }

  reset(type: SubjectType, normalizedEmail: string): void {
    this.failures.delete(this.key(type, normalizedEmail));
  }

  private recent(type: SubjectType, normalizedEmail: string): number[] {
    const since = this.clock.now().getTime() - WINDOW_MS;
    return (this.failures.get(this.key(type, normalizedEmail)) ?? []).filter(
      (t) => t > since,
    );
  }

  private prune(): void {
    const since = this.clock.now().getTime() - WINDOW_MS;
    for (const [key, list] of this.failures) {
      if (list.every((t) => t <= since)) this.failures.delete(key);
    }
  }

  private key(type: SubjectType, email: string): string {
    return `${type}:${email}`;
  }

  private limit(): number {
    return this.config.get('AUTH_RATE_LIMIT_PER_MINUTE', { infer: true });
  }
}

/** Şifre değiştirme denemeleri hesap (kimlik) bazında sayılır; giriş denemeleriyle ayrı anahtar. */
export const passwordChangeKey = (id: string): string => `pwchange:${id}`;
