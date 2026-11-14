// Admin: bildirim (e-posta) kuyruğu. GR-BLD-001. Payload (token'lı bağlantılar) hiçbir zaman dönmez.
import { Controller, ConflictException, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AdminGuard, CurrentUser } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import { DB, type Database } from '../database/database.module.js';
import { notificationOutbox } from '../database/schema.js';
import { NotificationsService } from './notifications.service.js';

const listSchema = z.object({
  status: z.enum(['pending', 'sent', 'failed']).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
type ListQuery = z.infer<typeof listSchema>;

const LINK_KINDS = ['password_reset', 'email_verification', 'invitation'];

const dto = (r: typeof notificationOutbox.$inferSelect) => ({
  id: r.id,
  kind: r.kind,
  recipient: r.recipient,
  status: r.status,
  attempts: r.attempts,
  lastError: r.lastError,
  nextAttemptAt: r.nextAttemptAt,
  createdAt: r.createdAt,
  sentAt: r.sentAt,
});

@Controller('admin/notifications')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminNotificationsController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query({ schema: listSchema }) query: ListQuery) {
    const where = query.status ? eq(notificationOutbox.status, query.status) : undefined;
    const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` }).from(notificationOutbox).where(where);
    const rows = await this.db
      .select()
      .from(notificationOutbox)
      .where(where)
      .orderBy(desc(notificationOutbox.createdAt), desc(notificationOutbox.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return { items: rows.map(dto), total, page: query.page, pageSize: query.pageSize };
  }

  /** `failed` (veya bekleyen) satırı sıfırlar ve hemen bir kez dener. */
  @Post(':id/retry')
  @HttpCode(200)
  async retry(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() admin: AuthIdentity) {
    const [row] = await this.db.select().from(notificationOutbox).where(eq(notificationOutbox.id, id));
    if (!row) throw new NotFoundException('Bildirim bulunamadı.');
    if (row.status === 'sent') {
      throw new ConflictException({ statusCode: 409, code: 'ALREADY_SENT', message: 'Bildirim zaten gönderildi.' });
    }
    const payload = row.payload as Record<string, unknown>;
    if (LINK_KINDS.includes(row.kind) && !payload.link) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PAYLOAD_EXPIRED',
        message: 'Bağlantı güvenlik nedeniyle silindi; işlem yeniden başlatılmalı.',
      });
    }
    await this.db
      .update(notificationOutbox)
      .set({ status: 'pending', attempts: 0, nextAttemptAt: new Date(0) })
      .where(eq(notificationOutbox.id, id));
    await this.audit.record({
      actorType: 'admin',
      actorId: admin.id,
      action: 'notification.retried',
      entityType: 'notification_outbox',
      entityId: id,
      data: { kind: row.kind },
    });
    await this.notifications.attempt(id, true);
    const [after] = await this.db.select().from(notificationOutbox).where(eq(notificationOutbox.id, id));
    return dto(after);
  }
}
