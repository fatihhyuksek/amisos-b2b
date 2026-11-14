// Ürün grupları (Admin). K-12, K-40; API: docs/api/katalog-api.md.
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/pg-errors.js';
import { DB, type Database } from '../database/database.module.js';
import { dealerGroupDiscounts, productGroups, products } from '../database/schema.js';
import { companyTitleKey } from '../dealers/company-title.js';
import type { CreateGroupInput, UpdateGroupInput } from './catalog.schemas.js';

export interface ProductGroupDto {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

const duplicate = () =>
  new ConflictException({
    statusCode: 409,
    code: 'DUPLICATE_GROUP',
    message: 'Bu adla bir ürün grubu zaten var.',
  });

@Injectable()
export class ProductGroupsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<ProductGroupDto[]> {
    const rows = await this.db
      .select({
        id: productGroups.id,
        name: productGroups.name,
        sortOrder: productGroups.sortOrder,
        isActive: productGroups.isActive,
        productCount: sql<number>`(select count(*)::int from products p where p.group_id = product_groups.id)`,
      })
      .from(productGroups)
      .orderBy(asc(productGroups.sortOrder), asc(productGroups.name), asc(productGroups.id));
    return rows;
  }

  private async get(id: string): Promise<ProductGroupDto> {
    const [row] = (await this.list()).filter((g) => g.id === id);
    if (!row) throw new NotFoundException('Ürün grubu bulunamadı.');
    return row;
  }

  async create(input: CreateGroupInput, adminId: string): Promise<ProductGroupDto> {
    try {
      const id = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(productGroups)
          .values({ name: input.name, nameKey: companyTitleKey(input.name), sortOrder: input.sortOrder })
          .returning({ id: productGroups.id });
        await this.audit.record(
          {
            actorType: 'admin',
            actorId: adminId,
            action: 'product_group.created',
            entityType: 'product_groups',
            entityId: row.id,
            data: { name: input.name, sortOrder: input.sortOrder },
          },
          tx,
        );
        return row.id;
      });
      return await this.get(id);
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate();
      throw error;
    }
  }

  async update(id: string, input: UpdateGroupInput, adminId: string): Promise<ProductGroupDto> {
    try {
      await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(productGroups)
          .where(eq(productGroups.id, id))
          .for('update');
        if (!current) throw new NotFoundException('Ürün grubu bulunamadı.');
        const set: Partial<typeof productGroups.$inferInsert> = {};
        const changes: Record<string, { previous: unknown; next: unknown }> = {};
        if (input.name !== undefined && input.name !== current.name) {
          set.name = input.name;
          set.nameKey = companyTitleKey(input.name);
          changes.name = { previous: current.name, next: input.name };
        }
        if (input.sortOrder !== undefined && input.sortOrder !== current.sortOrder) {
          set.sortOrder = input.sortOrder;
          changes.sortOrder = { previous: current.sortOrder, next: input.sortOrder };
        }
        if (input.isActive !== undefined && input.isActive !== current.isActive) {
          set.isActive = input.isActive;
          changes.isActive = { previous: current.isActive, next: input.isActive };
        }
        if (Object.keys(changes).length === 0) return;
        await tx.update(productGroups).set(set).where(eq(productGroups.id, id));
        await this.audit.record(
          {
            actorType: 'admin',
            actorId: adminId,
            action: 'product_group.updated',
            entityType: 'product_groups',
            entityId: id,
            data: { changes },
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate();
      throw error;
    }
    return this.get(id);
  }

  /** Ürünü olan grup silinemez (409 GROUP_NOT_EMPTY). Bayilere tanımlı grup iskontoları grupla birlikte kalkar. */
  async remove(id: string, adminId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(productGroups)
        .where(eq(productGroups.id, id))
        .for('update');
      if (!current) throw new NotFoundException('Ürün grubu bulunamadı.');
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(products)
        .where(eq(products.groupId, id));
      if (n > 0) {
        throw new ConflictException({
          statusCode: 409,
          code: 'GROUP_NOT_EMPTY',
          message: 'Grupta ürün var, silinemez.',
        });
      }
      const [{ discounts }] = await tx
        .select({ discounts: sql<number>`count(*)::int` })
        .from(dealerGroupDiscounts)
        .where(eq(dealerGroupDiscounts.groupId, id));
      await tx.delete(productGroups).where(eq(productGroups.id, id));
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'product_group.deleted',
          entityType: 'product_groups',
          entityId: id,
          data: { name: current.name, removedDealerDiscounts: discounts },
        },
        tx,
      );
    });
  }
}
