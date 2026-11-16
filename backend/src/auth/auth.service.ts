// Bayi ve Admin kimlik doğrulaması. Gereksinimler: GR-BAYI-006, GR-BAYI-007, GR-YON-001; kararlar K-07, K-08, K-29, K-39, K-42.
import {
  Inject,
  Injectable,
  Logger,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { LoginAttemptLimiter, passwordChangeKey } from './login-attempt-limiter.js';
import { ConfigService } from '@nestjs/config';
import { and, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../database/database.module.js';
import { adminUsers, consents, dealers } from '../database/schema.js';
import { CONSENT_DOCUMENT_VERSION } from '../common/consents.js';
import { currentConsentVersions } from '../site/consent-versions.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  EMAIL_VERIFICATION_TTL_MS,
  INVITATION_TTL_MS,
  ACCOUNT_PASSIVE_MESSAGE,
  LOGIN_FAILED_MESSAGE,
  PASSWORD_RESET_COOLDOWN_MS,
  PASSWORD_RESET_TTL_MS,
} from './auth.constants.js';
import {
  AuthTokensService,
  type DbExecutor,
  type SubjectType,
} from './auth-tokens.service.js';
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
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(LoginAttemptLimiter) private readonly limiter: LoginAttemptLimiter,
  ) {}

  /** Arka plan işleri (şifre sıfırlama, başarısız giriş audit'i). Testler ve kapanış `whenIdle` ile bekler. */
  private readonly inFlight = new Set<Promise<void>>();

  /** Arka plan işleri bitince ve bunların başlattığı bildirim gönderimleri tamamlanınca çözülür. */
  async whenIdle(): Promise<void> {
    do {
      await Promise.all(this.inFlight);
      await this.notifications.whenIdle();
    } while (this.inFlight.size > 0);
  }

  runInBackground(label: string, work: () => Promise<void>): void {
    const task: Promise<void> = work()
      .catch((error: unknown) => {
        this.logger.error(label, error instanceof Error ? error.stack : error);
      })
      .finally(() => {
        this.inFlight.delete(task);
      });
    this.inFlight.add(task);
  }

  /**
   * Bayi girişi. Yalnızca status='active' bayi girebilir (GR-BAYI-006, K-08).
   * Pasif bayi, şifresi DOĞRUYSA açık mesaj alır (K-54, 403 ACCOUNT_PASSIVE); böylece hesap durumu
   * yalnızca şifreyi bilene görünür. Yanlış şifre, pending ve rejected aynı genel hatayı alır.
   */
  async loginDealer(email: string, password: string): Promise<LoginResult> {
    const normalized = normalizeEmail(email);
    this.limiter.assertAllowed('dealer', normalized);
    // Reddedilen eski kayıt (K-51: aynı e-postayla yeniden başvuru mümkün) girişe hiç katılmaz;
    // tekillik indeksi nedeniyle geriye en çok bir kayıt kalır.
    const rows = await this.db
      .select()
      .from(dealers)
      .where(
        and(
          sql`lower(${dealers.email}) = ${normalized}`,
          sql`${dealers.status} <> 'rejected'`,
        ),
      );
    const dealer = rows[0];

    const passwordOk = await this.passwords.verify(
      dealer?.passwordHash,
      password,
    );
    if (dealer && passwordOk && dealer.status === 'passive') {
      this.limiter.reset('dealer', normalized);
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_PASSIVE',
        message: ACCOUNT_PASSIVE_MESSAGE,
      });
    }
    if (!dealer || !passwordOk || dealer.status !== 'active') {
      this.limiter.recordFailure('dealer', normalized);
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }

    this.limiter.reset('dealer', normalized);
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
    this.limiter.assertAllowed('admin', normalized);
    const [admin] = await this.db
      .select()
      .from(adminUsers)
      .where(sql`lower(${adminUsers.email}) = ${normalized}`);

    const passwordOk = await this.passwords.verify(
      admin?.passwordHash,
      password,
    );
    if (!admin || !passwordOk || !admin.isActive) {
      this.limiter.recordFailure('admin', normalized);
      if (admin) {
        // Yanıtı geciktirmez. Hesap sahibi değil giriş denemesi yapan bilinmiyor: aktör 'system',
        // hedef entityId'de.
        this.runInBackground('Başarısız giriş audit kaydı yazılamadı', () =>
          this.audit.record({
            actorType: 'system',
            action: 'auth.login_failed',
            entityType: 'admin_users',
            entityId: admin.id,
            data: { reason: !admin.isActive ? 'inactive' : 'bad_password' },
          }),
        );
      }
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }

    this.limiter.reset('admin', normalized);
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
   * K-67, K-75: oturum açmış kullanıcının şifre değişikliği. Mevcut şifre yanlışsa 400 WRONG_PASSWORD;
   * başarıda bu oturum dışındaki tüm oturumlar kapanır. Yeni şifre kuralı (K-53) şema katmanında.
   */
  async changePassword(
    type: SubjectType,
    id: string,
    currentToken: string | undefined,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    // Mevcut şifre tahminini sınırla (giriştekiyle aynı eşik): kilitliyse 429.
    const limitKey = passwordChangeKey(id);
    this.limiter.assertAllowed(type, limitKey);
    const [row] =
      type === 'admin'
        ? await this.db
            .select({ hash: adminUsers.passwordHash })
            .from(adminUsers)
            .where(eq(adminUsers.id, id))
        : await this.db
            .select({ hash: dealers.passwordHash })
            .from(dealers)
            .where(eq(dealers.id, id));
    const ok = await this.passwords.verify(row?.hash, currentPassword);
    if (!ok) {
      this.limiter.recordFailure(type, limitKey);
      throw new BadRequestException({
        statusCode: 400,
        code: 'WRONG_PASSWORD',
        message: 'Mevcut şifre hatalı.',
      });
    }
    this.limiter.reset(type, limitKey);
    const passwordHash = await this.passwords.hash(newPassword);
    await this.db.transaction(async (tx) => {
      if (type === 'admin') {
        await tx.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, id));
      } else {
        await tx.update(dealers).set({ passwordHash }).where(eq(dealers.id, id));
      }
      // Bekleyen şifre sıfırlama bağlantıları, eski şifreyi bilmeyen biri tarafından kullanılamasın.
      await this.tokens.invalidateAll(type, id, ['password_reset'], tx);
      if (currentToken) await this.sessions.destroyOthers(type, id, currentToken, tx);
      await this.audit.record(
        {
          actorType: type,
          actorId: id,
          action: type === 'admin' ? 'admin.password_changed' : 'dealer.password_changed',
          entityType: type === 'admin' ? 'admin_users' : 'dealers',
          entityId: id,
        },
        tx,
      );
    });
  }

  /** K-67: diğer cihazlardan çıkış. */
  async revokeOtherSessions(type: SubjectType, id: string, currentToken: string | undefined): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (currentToken) await this.sessions.destroyOthers(type, id, currentToken, tx);
      await this.audit.record(
        {
          actorType: type,
          actorId: id,
          action: 'dealer.sessions_revoked',
          entityType: 'dealers',
          entityId: id,
        },
        tx,
      );
    });
  }

  /**
   * Şifre sıfırlama isteği. Yanıt süresi hesabın varlığını sızdırmasın diye iş arka planda yapılır
   * ve çağıran hemen döner (controller 202). E-posta yalnızca giriş yapabilecek durumdaki hesaba
   * gider (GR-BAYI-007). Hata olursa yalnızca log'a yazılır.
   */
  requestPasswordReset(email: string, type: SubjectType): void {
    this.runInBackground('Şifre sıfırlama isteği işlenemedi', () =>
      this.processPasswordReset(email, type),
    );
  }

  private async processPasswordReset(
    email: string,
    type: SubjectType,
  ): Promise<void> {
    const normalized = normalizeEmail(email);
    const subject = await this.findResettable(normalized, type);
    if (!subject) return;

    // Soğuma: aynı hesaba 2 dakikada en fazla 1 e-posta; bu durumda eski token da iptal edilmez.
    const last = await this.tokens.lastIssuedAt(
      type,
      subject.id,
      'password_reset',
    );
    if (
      last &&
      this.clock.now().getTime() - last.getTime() < PASSWORD_RESET_COOLDOWN_MS
    )
      return;

    // Token, audit ve outbox satırı aynı transaction'da; e-posta commit sonrası gider (GR-BLD-001).
    const tur = type === 'admin' ? 'admin' : 'bayi';
    const outboxId = await this.db.transaction(async (tx) => {
      const token = await this.tokens.issue(
        type,
        subject.id,
        'password_reset',
        PASSWORD_RESET_TTL_MS,
        tx,
      );
      await this.audit.record(
        {
          actorType: type,
          actorId: subject.id,
          action: 'auth.password_reset_requested',
          entityType: type === 'admin' ? 'admin_users' : 'dealers',
          entityId: subject.id,
        },
        tx,
      );
      // Tek arayüz sayfası; `tur` sıfırlamadan sonra doğru giriş sayfasına dönmek için.
      return this.notifications.enqueue(
        'password_reset',
        subject.email,
        { link: `${this.appUrl()}/#/sifre-sifirla?tur=${tur}&token=${token}` },
        tx,
      );
    });
    this.notifications.dispatchSoon([outboxId]);
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

  /**
   * E-posta doğrulama (K-03): pending_email -> pending_approval (K-04). Durum geçişi gerçekleştiyse
   * aktif Admin'lere yeni başvuru bildirimi gider (GR-BAYI-001'den bilinçli sapma: bildirim
   * doğrulamada; doğrulanmamış başvurular ekibe gitmez).
   */
  async verifyEmail(token: string): Promise<void> {
    const result = await this.db.transaction(async (tx) => {
      const subject = await this.tokens.consume(
        token,
        'email_verification',
        tx,
      );
      if (!subject || subject.subjectType !== 'dealer') return null;
      const now = this.clock.now();
      await tx
        .update(dealers)
        .set({
          emailVerifiedAt: sql`coalesce(${dealers.emailVerifiedAt}, ${now.toISOString()}::timestamptz)`,
        })
        .where(eq(dealers.id, subject.subjectId));
      const [moved] = await tx
        .update(dealers)
        .set({ status: 'pending_approval' })
        .where(
          and(
            eq(dealers.id, subject.subjectId),
            eq(dealers.status, 'pending_email'),
          ),
        )
        .returning({ companyTitle: dealers.companyTitle });
      // Ekip bildirimi aynı transaction'da kuyruğa yazılır (GR-BAYI-001, GR-BLD-001).
      const outboxIds = moved
        ? await this.enqueueApplicationNotices(tx, moved.companyTitle)
        : [];
      return { companyTitle: moved?.companyTitle ?? null, outboxIds };
    });
    if (result) {
      this.notifications.dispatchSoon(result.outboxIds);
      return;
    }
    // İdempotent: bağlantı daha önce kullanılmış ve e-posta zaten doğrulanmışsa (çift tıklama,
    // e-posta tarayıcısının ön getirmesi) başarılı sayılır.
    const used = await this.tokens.findUsed(token, 'email_verification');
    if (used?.subjectType === 'dealer') {
      const [dealer] = await this.db
        .select({ verifiedAt: dealers.emailVerifiedAt })
        .from(dealers)
        .where(eq(dealers.id, used.subjectId));
      if (dealer?.verifiedAt) return;
    }
    throw new BadRequestException('Bağlantı geçersiz veya süresi dolmuş.');
  }

  /** Başvuru adımı için: doğrulama token'ı üretir ve bağlantıyı e-postayla gönderir. */
  async sendEmailVerification(dealerId: string): Promise<void> {
    const [dealer] = await this.db
      .select()
      .from(dealers)
      .where(eq(dealers.id, dealerId));
    if (!dealer) return;
    const outboxId = await this.db.transaction(async (tx) => {
      const token = await this.tokens.issue(
        'dealer',
        dealer.id,
        'email_verification',
        EMAIL_VERIFICATION_TTL_MS,
        tx,
      );
      return this.notifications.enqueue(
        'email_verification',
        dealer.email,
        { link: `${this.appUrl()}/#/eposta-dogrula?token=${token}` },
        tx,
      );
    });
    this.notifications.dispatchSoon([outboxId]);
  }

  /** Başvuru yanıtını bekletmeden doğrulama e-postası gönderir (hata yalnızca log'a yazılır). */
  queueEmailVerification(dealerId: string): void {
    this.runInBackground('Doğrulama e-postası gönderilemedi', () =>
      this.sendEmailVerification(dealerId),
    );
  }

  private async enqueueApplicationNotices(
    tx: DbExecutor,
    companyTitle: string,
  ): Promise<string[]> {
    const admins = await tx
      .select({ email: adminUsers.email })
      .from(adminUsers)
      .where(eq(adminUsers.isActive, true));
    const ids: string[] = [];
    for (const admin of admins) {
      ids.push(
        await this.notifications.enqueue('new_application', admin.email, { companyTitle }, tx),
      );
    }
    return ids;
  }

  /**
   * K-04: davet token'ı (72 saat) üretir; önceki davet geçersiz olur. Çağıranın transaction'ında
   * (bayi satırı kilitliyken) çalıştırılır; bağlantıyı döner. E-posta commit sonrası
   * `queueInvitationEmail` ile gönderilir.
   */
  async issueInvitationLink(
    dealerId: string,
    executor: DbExecutor,
  ): Promise<string> {
    const token = await this.tokens.issue(
      'dealer',
      dealerId,
      'invitation',
      INVITATION_TTL_MS,
      executor,
    );
    return `${this.appUrl()}/#/davet?token=${token}`;
  }

  /** K-75: bayi e-postası değişince kullanılmamış tüm bağlantıları geçersiz kılar. */
  invalidateDealerTokens(dealerId: string, tx: DbExecutor): Promise<void> {
    return this.tokens.invalidateAll('dealer', dealerId, ['invitation', 'password_reset', 'email_verification'], tx);
  }

  /** Davet e-postasını çağıranın transaction'ında kuyruğa yazar; commit sonrası `dispatchSoon` ile gönderilir. */
  enqueueInvitation(to: string, link: string, tx: DbExecutor): Promise<string> {
    return this.notifications.enqueue('invitation', to, { link }, tx);
  }

  /**
   * K-04, K-57: davet token'ı tek kullanımlık; yalnızca aktif ve şifresi olmayan bayi için geçerli.
   * Şifreyle birlikte KVKK/koşul (zorunlu) ve pazarlama onayları aynı transaction'da kaydedilir; o tür
   * için zaten onay kaydı varsa (başvurudan gelen) tekrar yazılmaz.
   * Aksi halde token harcanmaz (işlem geri alınır) ve 400 döner.
   */
  async acceptInvitation(
    token: string,
    newPassword: string,
    consentInput: { kvkk: true; terms: true; marketing: boolean },
  ): Promise<void> {
    const passwordHash = await this.passwords.hash(newPassword);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      const subject = await this.tokens.consume(token, 'invitation', tx);
      if (subject?.subjectType === 'dealer') {
        const [dealer] = await tx
          .update(dealers)
          // Davet bağlantısını açabilmek e-postaya erişimi kanıtlar: doğrulanmamışsa doğrulanmış sayılır.
          .set({
            passwordHash,
            emailVerifiedAt: sql`coalesce(${dealers.emailVerifiedAt}, ${now.toISOString()}::timestamptz)`,
          })
          .where(
            and(
              eq(dealers.id, subject.subjectId),
              eq(dealers.status, 'active'),
              sql`${dealers.passwordHash} is null`,
            ),
          )
          .returning({ id: dealers.id });
        if (dealer) {
          await this.recordInvitationConsents(tx, dealer.id, consentInput);
          await this.audit.record(
            {
              actorType: 'dealer',
              actorId: dealer.id,
              action: 'dealer.invitation_accepted',
              entityType: 'dealers',
              entityId: dealer.id,
            },
            tx,
          );
          return;
        }
      }
      throw new BadRequestException('Bağlantı geçersiz veya süresi dolmuş.');
    });
  }

  private async recordInvitationConsents(
    tx: DbExecutor,
    dealerId: string,
    input: { kvkk: true; terms: true; marketing: boolean },
  ): Promise<void> {
    const existing = await tx
      .select({ type: consents.type, granted: consents.granted })
      .from(consents)
      .where(eq(consents.dealerId, dealerId));
    const versions = await currentConsentVersions(tx);
    const rows = (['kvkk', 'terms', 'marketing'] as const).flatMap((type) => {
      const records = existing.filter((c) => c.type === type);
      const granted = input[type];
      // Zaten onaylı kayıt varsa tekrar yazma; onay yoksa ve hiç kayıt da yoksa (ret) kaydet.
      if (records.some((c) => c.granted)) return [];
      if (!granted && records.length > 0) return [];
      return [
        {
          dealerId,
          type,
          // KVKK/koşul: onay anındaki sayfa sürümü; pazarlama metni için sabit sürüm.
          documentVersion: type === 'marketing' ? CONSENT_DOCUMENT_VERSION : versions[type],
          granted,
        },
      ];
    });
    if (rows.length) await tx.insert(consents).values(rows);
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
