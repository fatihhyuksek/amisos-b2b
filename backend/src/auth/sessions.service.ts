// Sunucu taraflı oturumlar (GR-BAYI-006, GR-BAYI-007). Çerezde rastgele token, veritabanında özeti.
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { DB, type Database } from '../database/database.module.js';
import { adminUsers, dealers, sessions } from '../database/schema.js';
import { SESSION_TOUCH_INTERVAL_MS, SESSION_TTL_MS } from './auth.constants.js';
import {
  generateToken,
  hashToken,
  type DbExecutor,
  type SubjectType,
} from './auth-tokens.service.js';

export interface AuthIdentity {
  type: SubjectType;
  id: string;
  email: string;
  name: string;
}

@Injectable()
export class SessionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    subjectType: SubjectType,
    subjectId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const now = this.clock.now();
    const token = generateToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.db.insert(sessions).values({
      tokenHash: hashToken(token),
      subjectType,
      subjectId,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
    });
    // Süresi dolmuş oturumları fırsat buldukça temizle.
    await this.db.delete(sessions).where(lt(sessions.expiresAt, now));
    return { token, expiresAt };
  }

  /**
   * Oturumu çözer ve kullanıcının durumunu HER İSTEKTE yeniden kontrol eder (GR-BAYI-006):
   * pasife alınan bayinin ya da devre dışı Admin'in oturumu silinir ve null döner.
   */
  async resolve(
    token: string,
  ): Promise<{ identity: AuthIdentity; expiresAt: Date } | null> {
    const now = this.clock.now();
    const tokenHash = hashToken(token);
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash));
    if (!session) return null;
    if (session.expiresAt <= now) {
      await this.db.delete(sessions).where(eq(sessions.id, session.id));
      return null;
    }

    const identity = await this.loadIdentity(
      session.subjectType,
      session.subjectId,
    );
    if (!identity) {
      await this.db.delete(sessions).where(eq(sessions.id, session.id));
      return null;
    }

    let expiresAt = session.expiresAt;
    if (
      now.getTime() - session.lastSeenAt.getTime() >=
      SESSION_TOUCH_INTERVAL_MS
    ) {
      expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
      await this.db
        .update(sessions)
        .set({ lastSeenAt: now, expiresAt })
        .where(eq(sessions.id, session.id));
    }
    return { identity, expiresAt };
  }

  async destroy(token: string): Promise<void> {
    await this.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)));
  }

  async destroyAllFor(
    subjectType: SubjectType,
    subjectId: string,
    executor: DbExecutor = this.db,
  ): Promise<void> {
    await executor
      .delete(sessions)
      .where(
        and(
          eq(sessions.subjectType, subjectType),
          eq(sessions.subjectId, subjectId),
        ),
      );
  }

  /** Yalnızca giriş yapabilecek durumdaki kullanıcı için kimlik döner. */
  private async loadIdentity(
    type: SubjectType,
    id: string,
  ): Promise<AuthIdentity | null> {
    if (type === 'admin') {
      const [admin] = await this.db
        .select({
          id: adminUsers.id,
          email: adminUsers.email,
          name: adminUsers.fullName,
        })
        .from(adminUsers)
        .where(and(eq(adminUsers.id, id), eq(adminUsers.isActive, true)));
      return admin ? { type, ...admin } : null;
    }
    const [dealer] = await this.db
      .select({
        id: dealers.id,
        email: dealers.email,
        name: dealers.companyTitle,
      })
      .from(dealers)
      .where(and(eq(dealers.id, id), eq(dealers.status, 'active')));
    return dealer ? { type, ...dealer } : null;
  }
}
