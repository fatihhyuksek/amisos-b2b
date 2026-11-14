// K-04: 2 iş gününü aşan onay bekleyen başvurular için Admin'lere hatırlatma.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { DB, type Database } from '../database/database.module.js';
import { adminUsers } from '../database/schema.js';
import { MAIL_SERVICE, type MailService } from '../mail/mail.service.js';
import { DealersService } from './dealers.service.js';

@Injectable()
export class ApprovalReminderService {
  private readonly logger = new Logger(ApprovalReminderService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    @Inject(DealersService) private readonly dealers: DealersService,
  ) {}

  /** Hafta içi her gün 09:00 (sunucu saati). Test ortamında ScheduleModule yüklenmez. */
  @Cron('0 9 * * 1-5')
  async scheduled(): Promise<void> {
    try {
      await this.sendReminders();
    } catch (error) {
      this.logger.error(
        'Onay hatırlatması gönderilemedi',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /** Gecikmiş başvuru varsa aktif her Admin'e e-posta gönderir; gönderilen alıcı sayısını döner. */
  async sendReminders(): Promise<number> {
    const count = await this.dealers.countOverdue(this.clock.now());
    if (count === 0) return 0;
    const admins = await this.db
      .select({ email: adminUsers.email })
      .from(adminUsers)
      .where(eq(adminUsers.isActive, true));
    for (const admin of admins) {
      await this.mail.sendApprovalReminder(admin.email, count);
    }
    return admins.length;
  }
}
