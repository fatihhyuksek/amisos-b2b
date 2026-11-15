// K-04: 2 iş gününü aşan onay bekleyen başvurular için Admin'lere hatırlatma.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq } from 'drizzle-orm';
import {
  LOCK_APPROVAL_REMINDER,
  runExclusive,
} from '../common/advisory-lock.js';
import { BUSINESS_TIME_ZONE } from '../common/business-days.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { DB, type Database } from '../database/database.module.js';
import { adminUsers } from '../database/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { DealersService } from './dealers.service.js';

@Injectable()
export class ApprovalReminderService {
  private readonly logger = new Logger(ApprovalReminderService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(DealersService) private readonly dealers: DealersService,
  ) {}

  /**
   * Hafta içi her gün 09:00 (Europe/Istanbul). Test ortamında ScheduleModule yüklenmez. Çok örnekli
   * çalışmada advisory lock ile yalnızca bir örnek gönderir.
   */
  @Cron('0 9 * * 1-5', { timeZone: BUSINESS_TIME_ZONE })
  async scheduled(): Promise<void> {
    try {
      await runExclusive(this.db, LOCK_APPROVAL_REMINDER, () =>
        this.sendReminders(),
      );
    } catch (error) {
      this.logger.error(
        'Onay hatırlatması gönderilemedi',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /**
   * Yaklaşan (1 iş günü geçti) veya gecikmiş (2 iş günü aşıldı) başvuru varsa aktif her Admin'e
   * e-posta gönderir; gönderilen alıcı sayısını döner.
   */
  async sendReminders(): Promise<number> {
    const counts = await this.dealers.approvalUrgencyCounts(this.clock.now());
    if (counts.dueSoon === 0 && counts.overdue === 0) return 0;
    const admins = await this.db
      .select({ email: adminUsers.email })
      .from(adminUsers)
      .where(eq(adminUsers.isActive, true));
    const ids: string[] = [];
    for (const admin of admins) {
      ids.push(await this.notifications.enqueue('approval_reminder', admin.email, { counts }));
    }
    await this.notifications.dispatchNow(ids);
    return admins.length;
  }
}
