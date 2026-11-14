// Tek kullanımlık token'lar: e-posta doğrulama, şifre sıfırlama (K-03, K-39, GR-BAYI-007).
// Token'ın kendisi saklanmaz, yalnızca SHA-256 özeti.
import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { DB, type Database } from '../database/database.module.js';
import { authTokens } from '../database/schema.js';

export type SubjectType = 'admin' | 'dealer';
export type TokenPurpose =
  'email_verification' | 'password_reset' | 'invitation';
export type DbExecutor = Pick<
  Database,
  'select' | 'insert' | 'update' | 'delete'
>;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class AuthTokensService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Yeni token üretir; aynı konu ve amaç için kullanılmamış eski token'lar geçersiz kılınır. */
  async issue(
    subjectType: SubjectType,
    subjectId: string,
    purpose: TokenPurpose,
    ttlMs: number,
    executor: DbExecutor = this.db,
  ): Promise<string> {
    const now = this.clock.now();
    await executor
      .update(authTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(authTokens.subjectType, subjectType),
          eq(authTokens.subjectId, subjectId),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
        ),
      );
    const token = generateToken();
    await executor.insert(authTokens).values({
      subjectType,
      subjectId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + ttlMs),
      createdAt: now,
    });
    return token;
  }

  /**
   * Token'ı atomik olarak tüketir: geçerli (süresi dolmamış, kullanılmamış) ise kullanıldı
   * işaretler ve sahibini döner, değilse null. İki eşzamanlı istekten yalnızca biri başarılı olur.
   */
  async consume(
    token: string,
    purpose: TokenPurpose,
    executor: DbExecutor = this.db,
  ): Promise<{ subjectType: SubjectType; subjectId: string } | null> {
    const now = this.clock.now();
    const [row] = await executor
      .update(authTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(authTokens.tokenHash, hashToken(token)),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, now),
        ),
      )
      .returning({
        subjectType: authTokens.subjectType,
        subjectId: authTokens.subjectId,
      });
    return row ?? null;
  }
}
