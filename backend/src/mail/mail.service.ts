// E-posta gönderimi. Gönderen: MAIL_FROM (K-56, onay@amisosb2b.com). SMTP henüz kurulmadı;
// şimdilik yalnızca log'a yazan geliştirme uygulaması.
import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isProductionLike, type Env } from '../config/env.js';

export const MAIL_SERVICE = Symbol('MAIL_SERVICE');

export interface MailService {
  /** K-39: bağlantı 1 saat geçerli. */
  sendPasswordReset(to: string, link: string): Promise<void>;
  sendEmailVerification(to: string, link: string): Promise<void>;
  /** K-04: onaylanan/davet edilen bayiye şifre belirleme bağlantısı (72 saat). */
  sendInvitation(to: string, link: string): Promise<void>;
  /** K-04: 2 iş gününü aşan onay bekleyen başvuru sayısını Admin'e bildirir. */
  sendApprovalReminder(to: string, count: number): Promise<void>;
}

@Injectable()
export class DevMailService implements MailService {
  private readonly logger = new Logger('DevMail');

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  sendPasswordReset(to: string, link: string): Promise<void> {
    this.log('Şifre sıfırlama', to, link);
    return Promise.resolve();
  }

  sendEmailVerification(to: string, link: string): Promise<void> {
    this.log('E-posta doğrulama', to, link);
    return Promise.resolve();
  }

  sendInvitation(to: string, link: string): Promise<void> {
    this.log('Davet / şifre belirleme', to, link);
    return Promise.resolve();
  }

  sendApprovalReminder(to: string, count: number): Promise<void> {
    this.log('Onay hatırlatması', to, `${count} başvuru 2 iş gününü aştı`);
    return Promise.resolve();
  }

  private log(subject: string, to: string, link: string): void {
    // Token'lı bağlantı yalnızca development/test'te log'a yazılır.
    if (isProductionLike(this.config.get('NODE_ENV', { infer: true }))) {
      this.logger.warn(
        `${subject} e-postası gönderilemedi: e-posta sağlayıcısı yapılandırılmadı.`,
      );
      return;
    }
    const from = this.config.get('MAIL_FROM', { infer: true });
    this.logger.log(`${subject} (${from}) -> ${to}: ${link}`);
  }
}

@Global()
@Module({
  providers: [{ provide: MAIL_SERVICE, useClass: DevMailService }],
  exports: [MAIL_SERVICE],
})
export class MailModule {}
