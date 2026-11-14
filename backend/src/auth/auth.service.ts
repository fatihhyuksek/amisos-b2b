// Bayi ve Admin kimlik doğrulaması. Gereksinimler: GR-BAYI-006, GR-BAYI-007, GR-YON-001; kararlar K-07, K-08, K-29, K-39, K-42.
import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../database/database.module.js';
import { adminUsers, dealers } from '../database/schema.js';
import { MAIL_SERVICE, type MailService } from '../mail/mail.service.js';
import {
  EMAIL_VERIFICATION_TTL_MS,
  LOGIN_FAILED_MESSAGE,
  PASSWORD_RESET_TTL_MS,
} from './auth.constants.js';
import { AuthTokensService, type SubjectType } from './auth-tokens.service.js';
import { normalizeEmail } from './email.js';
import { PasswordService } from './password.service.js';
import { SessionsService, type AuthIdentity } from './sessions.service.js';

export interface LoginResult {
  identity: AuthIdentity;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(AuthTokensService) private readonly tokens: AuthTokensService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
  ) {}

  /**
   * Bayi girişi. Yalnızca status='active' bayi girebilir (GR-BAYI-006, K-08); pending/rejected/passive
   * ve yanlış şifre aynı genel hatayı alır.
   */
  async loginDealer(email: string, password: string): Promise<LoginResult> {
    const normalized = normalizeEmail(email);
    // Reddedilen eski başvuru ile yeniden başvuru aynı e-postayı taşıyabilir (K-51): aktif olan seçilir.
    const rows = await this.db
      .select()
      .from(dealers)
      .where(sql`lower(${dealers.email}) = ${normalized}`);
    const dealer = rows.find((d) => d.status === 'active') ?? rows[0];

    const passwordOk = await this.passwords.verify(
      dealer?.passwordHash,
      password,
    );
    if (!dealer || !passwordOk || dealer.status !== 'active') {
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }

    await this.db
      .update(dealers)
      .set({ lastLoginAt: this.clock.now() })
      .where(eq(dealers.id, dealer.id));
    const session = await this.sessions.create('dealer', dealer.id);
    return {
      identity: {
        type: 'dealer',
        id: dealer.id,
        email: dealer.email,
        name: dealer.companyTitle,
      },
      ...session,
    };
  }

  /** Admin girişi (GR-YON-001). `is_active=false` ise giriş yok. Girişler audit_log'a yazılır. */
  async loginAdmin(email: string, password: string): Promise<LoginResult> {
    const normalized = normalizeEmail(email);
    const [admin] = await this.db
      .select()
      .from(adminUsers)
      .where(sql`lower(${adminUsers.email}) = ${normalized}`);

    const passwordOk = await this.passwords.verify(
      admin?.passwordHash,
      password,
    );
    if (!admin || !passwordOk || !admin.isActive) {
      if (admin) {
        await this.audit.record({
          actorType: 'admin',
          actorId: admin.id,
          action: 'auth.login_failed',
          entityType: 'admin_users',
          entityId: admin.id,
          data: { reason: !admin.isActive ? 'inactive' : 'bad_password' },
        });
      }
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }

    await this.db
      .update(adminUsers)
      .set({ lastLoginAt: this.clock.now() })
      .where(eq(adminUsers.id, admin.id));
    const session = await this.sessions.create('admin', admin.id);
    await this.audit.record({
      actorType: 'admin',
      actorId: admin.id,
      action: 'auth.login',
      entityType: 'admin_users',
      entityId: admin.id,
    });
    return {
      identity: {
        type: 'admin',
        id: admin.id,
        email: admin.email,
        name: admin.fullName,
      },
      ...session,
    };
  }

  /**
   * Şifre sıfırlama isteği. Hesap var olsun ya da olmasın çağıran aynı sonucu görür (e-postanın
   * varlığı sızdırılmaz); e-posta yalnızca giriş yapabilecek durumdaki hesaba gider (GR-BAYI-007).
   */
  async requestPasswordReset(email: string, type: SubjectType): Promise<void> {
    try {
      const normalized = normalizeEmail(email);
      const subject = await this.findResettable(normalized, type);
      if (!subject) return;

      const token = await this.tokens.issue(
        type,
        subject.id,
        'password_reset',
        PASSWORD_RESET_TTL_MS,
      );
      await this.audit.record({
        actorType: type,
        actorId: subject.id,
        action: 'auth.password_reset_requested',
        entityType: type === 'admin' ? 'admin_users' : 'dealers',
        entityId: subject.id,
      });
      // Tek arayüz sayfası; `tur` sıfırlamadan sonra doğru giriş sayfasına dönmek için.
      const tur = type === 'admin' ? 'admin' : 'bayi';
      await this.mail.sendPasswordReset(
        subject.email,
        `${this.appUrl()}/#/sifre-sifirla?tur=${tur}&token=${token}`,
      );
    } catch (error) {
      // İstemci hata ile hesabın varlığını çıkaramasın.
      this.logger.error(
        'Şifre sıfırlama isteği işlenemedi',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /** Token tek kullanımlıdır; başarıda kullanıcının tüm oturumları silinir (GR-BAYI-007, K-39). */
  async confirmPasswordReset(
    token: string,
    newPassword: string,
  ): Promise<void> {
    const passwordHash = await this.passwords.hash(newPassword);
    const ok = await this.db.transaction(async (tx) => {
      const subject = await this.tokens.consume(token, 'password_reset', tx);
      if (!subject) return false;

      if (subject.subjectType === 'admin') {
        await tx
          .update(adminUsers)
          .set({ passwordHash })
          .where(
            and(
              eq(adminUsers.id, subject.subjectId),
              eq(adminUsers.isActive, true),
            ),
          );
      } else {
        await tx
          .update(dealers)
          .set({ passwordHash })
          .where(
            and(
              eq(dealers.id, subject.subjectId),
              sql`${dealers.passwordHash} is not null`,
            ),
          );
      }
      await this.sessions.destroyAllFor(
        subject.subjectType,
        subject.subjectId,
        tx,
      );
      await this.audit.record(
        {
          actorType: subject.subjectType,
          actorId: subject.subjectId,
          action: 'auth.password_reset_completed',
          entityType:
            subject.subjectType === 'admin' ? 'admin_users' : 'dealers',
          entityId: subject.subjectId,
        },
        tx,
      );
      return true;
    });
    if (!ok)
      throw new BadRequestException('Bağlantı geçersiz veya süresi dolmuş.');
  }

  /** E-posta doğrulama (K-03): pending_email -> pending_approval (K-04). */
  async verifyEmail(token: string): Promise<void> {
    const ok = await this.db.transaction(async (tx) => {
      const subject = await this.tokens.consume(
        token,
        'email_verification',
        tx,
      );
      if (!subject || subject.subjectType !== 'dealer') return false;
      const now = this.clock.now();
      await tx
        .update(dealers)
        .set({
          emailVerifiedAt: sql`coalesce(${dealers.emailVerifiedAt}, ${now.toISOString()}::timestamptz)`,
        })
        .where(eq(dealers.id, subject.subjectId));
      await tx
        .update(dealers)
        .set({ status: 'pending_approval' })
        .where(
          and(
            eq(dealers.id, subject.subjectId),
            eq(dealers.status, 'pending_email'),
          ),
        );
      return true;
    });
    if (!ok)
      throw new BadRequestException('Bağlantı geçersiz veya süresi dolmuş.');
  }

  /** Başvuru adımı için: doğrulama token'ı üretir ve bağlantıyı e-postayla gönderir. */
  async sendEmailVerification(dealerId: string): Promise<void> {
    const [dealer] = await this.db
      .select()
      .from(dealers)
      .where(eq(dealers.id, dealerId));
    if (!dealer) return;
    const token = await this.tokens.issue(
      'dealer',
      dealer.id,
      'email_verification',
      EMAIL_VERIFICATION_TTL_MS,
    );
    await this.mail.sendEmailVerification(
      dealer.email,
      `${this.appUrl()}/#/eposta-dogrula?token=${token}`,
    );
  }

  private appUrl(): string {
    return this.config.get('APP_URL', { infer: true });
  }

  private async findResettable(
    normalizedEmail: string,
    type: SubjectType,
  ): Promise<{ id: string; email: string } | null> {
    if (type === 'admin') {
      const [admin] = await this.db
        .select({ id: adminUsers.id, email: adminUsers.email })
        .from(adminUsers)
        .where(
          and(
            sql`lower(${adminUsers.email}) = ${normalizedEmail}`,
            eq(adminUsers.isActive, true),
          ),
        );
      return admin ?? null;
    }
    const [dealer] = await this.db
      .select({ id: dealers.id, email: dealers.email })
      .from(dealers)
      .where(
        and(
          sql`lower(${dealers.email}) = ${normalizedEmail}`,
          eq(dealers.status, 'active'),
        ),
      );
    return dealer ?? null;
  }
}
