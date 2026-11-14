// İşlem kaydı (GR-YON-001, GR-BAYI-006). Tablo: audit_log.
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { DB, type Database } from '../database/database.module.js';
import { auditLog } from '../database/schema.js';

export interface AuditEntry {
  actorType: 'admin' | 'dealer' | 'system';
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(
    entry: AuditEntry,
    executor: Pick<Database, 'insert'> = this.db,
  ): Promise<void> {
    await executor.insert(auditLog).values({
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reason: entry.reason,
      data: entry.data,
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
