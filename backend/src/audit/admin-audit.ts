// İşlem geçmişi (K-75): GET /api/admin/audit. Yetki sunucuda (AdminGuard).
import { Controller, Get, Inject, Injectable, Module, Query, UseGuards, UsePipes } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { AdminGuard } from '../auth/auth.guards.js';
import { AuthModule } from '../auth/auth.module.js';
import { ISTANBUL_OFFSET_MS } from '../common/business-days.js';
import { escapeLike } from '../common/like.js';
import { createValidationPipe } from '../common/validation.js';
import { DB, type Database } from '../database/database.module.js';
import {
  adminUsers,
  auditLog,
  banners,
  dealers,
  orders,
  productGroups,
  products,
} from '../database/schema.js';
import { actionLabel } from './audit-labels.js';

const isRealDay = (v: string): boolean => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDay, { message: 'Geçerli bir tarih girin (YYYY-AA-GG).' });

export const auditListSchema = z.object({
  entityType: z.string().trim().min(1).max(60).optional(),
  actorType: z.enum(['admin', 'dealer', 'system']).optional(),
  q: z.string().trim().max(100).optional(),
  from: day.optional(),
  to: day.optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditListQuery = z.infer<typeof auditListSchema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Europe/Istanbul gün başlangıcı (sabit UTC+3). */
const istanbulDayStart = (v: string): Date => new Date(new Date(`${v}T00:00:00Z`).getTime() - ISTANBUL_OFFSET_MS);

@Injectable()
export class AuditQueryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: AuditListQuery) {
    const filters: (SQL | undefined)[] = [];
    if (query.entityType) filters.push(eq(auditLog.entityType, query.entityType));
    if (query.actorType) filters.push(eq(auditLog.actorType, query.actorType));
    if (query.q) {
      const pattern = `%${escapeLike(query.q)}%`;
      filters.push(or(sql`${auditLog.entityId} ilike ${pattern}`, sql`${auditLog.action} ilike ${pattern}`));
    }
    if (query.from) filters.push(gte(auditLog.createdAt, istanbulDayStart(query.from)));
    if (query.to) {
      const end = new Date(istanbulDayStart(query.to).getTime() + 24 * 3_600_000);
      filters.push(lt(auditLog.createdAt, end));
    }
    const where = and(...filters);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where);
    const rows = await this.db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const idsOf = (type: string, extra?: (r: (typeof rows)[number]) => string | null) =>
      [
        ...new Set(
          rows.flatMap((r) => {
            const v = extra ? extra(r) : r.entityType === type ? r.entityId : null;
            return v && UUID.test(v) ? [v] : [];
          }),
        ),
      ];
    const entityLabels = new Map<string, string>(); // "<entityType>:<id>" -> etiket
    const fill = async (
      type: string,
      ids: string[],
      load: (ids: string[]) => Promise<{ id: string; label: string }[]>,
    ) => {
      if (ids.length === 0) return;
      for (const r of await load(ids)) entityLabels.set(`${type}:${r.id}`, r.label);
    };
    await fill('dealers', idsOf('dealers'), async (ids) =>
      (await this.db.select({ id: dealers.id, l: dealers.companyTitle }).from(dealers).where(inArray(dealers.id, ids))).map(
        (r) => ({ id: r.id, label: r.l }),
      ),
    );
    await fill('orders', idsOf('orders'), async (ids) =>
      (await this.db.select({ id: orders.id, no: orders.orderNo }).from(orders).where(inArray(orders.id, ids))).map(
        (r) => ({ id: r.id, label: `#${r.no}` }),
      ),
    );
    await fill('products', idsOf('products'), async (ids) =>
      (await this.db.select({ id: products.id, l: products.name }).from(products).where(inArray(products.id, ids))).map(
        (r) => ({ id: r.id, label: r.l }),
      ),
    );
    await fill('banners', idsOf('banners'), async (ids) =>
      (await this.db.select({ id: banners.id, l: banners.title }).from(banners).where(inArray(banners.id, ids))).map(
        (r) => ({ id: r.id, label: r.l }),
      ),
    );
    await fill('product_groups', idsOf('product_groups'), async (ids) =>
      (
        await this.db.select({ id: productGroups.id, l: productGroups.name }).from(productGroups).where(inArray(productGroups.id, ids))
      ).map((r) => ({ id: r.id, label: r.l })),
    );
    await fill('admin_users', idsOf('admin_users'), async (ids) =>
      (await this.db.select({ id: adminUsers.id, l: adminUsers.fullName }).from(adminUsers).where(inArray(adminUsers.id, ids))).map(
        (r) => ({ id: r.id, label: r.l }),
      ),
    );

    // Aktör adları: Admin -> ad soyad, bayi -> firma unvanı, sistem -> null.
    const adminNames = new Map<string, string>();
    const adminIds = idsOf('', (r) => (r.actorType === 'admin' ? r.actorId : null));
    if (adminIds.length > 0) {
      for (const a of await this.db
        .select({ id: adminUsers.id, n: adminUsers.fullName })
        .from(adminUsers)
        .where(inArray(adminUsers.id, adminIds)))
        adminNames.set(a.id, a.n);
    }
    const dealerNames = new Map<string, string>();
    const dealerIds = idsOf('', (r) => (r.actorType === 'dealer' ? r.actorId : null));
    if (dealerIds.length > 0) {
      for (const d of await this.db
        .select({ id: dealers.id, n: dealers.companyTitle })
        .from(dealers)
        .where(inArray(dealers.id, dealerIds)))
        dealerNames.set(d.id, d.n);
    }

    return {
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actor: {
          type: r.actorType,
          id: r.actorId,
          name:
            r.actorType === 'admin'
              ? (adminNames.get(r.actorId ?? '') ?? null)
              : r.actorType === 'dealer'
                ? (dealerNames.get(r.actorId ?? '') ?? null)
                : null,
        },
        action: r.action,
        actionLabel: actionLabel(r.action),
        entityType: r.entityType,
        entityId: r.entityId,
        entityLabel: entityLabels.get(`${r.entityType}:${r.entityId}`) ?? null,
        reason: r.reason,
        data: r.data,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}

@Controller('admin/audit')
@UseGuards(AdminGuard)
@UsePipes(createValidationPipe())
export class AdminAuditController {
  constructor(@Inject(AuditQueryService) private readonly audit: AuditQueryService) {}

  @Get()
  list(@Query({ schema: auditListSchema }) query: AuditListQuery) {
    return this.audit.list(query);
  }
}

// AuditModule (global) ile AuthModule arasında dosya döngüsü olmasın diye ayrı modül.
@Module({ imports: [AuthModule], controllers: [AdminAuditController], providers: [AuditQueryService] })
export class AdminAuditModule {}
