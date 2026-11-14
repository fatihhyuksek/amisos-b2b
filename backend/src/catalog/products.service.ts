// Ürün yönetimi (Admin). GR-URN-001, GR-URN-002; K-14 – K-16, K-18, K-19, K-30 – K-32, K-40, K-59, K-60.
// Ürün silinmez; isActive=false ile satıştan kaldırılır (geçmiş siparişler korunur).
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import type { Tx } from '../common/advisory-lock.js';
import { escapeLike, foldSql, foldTr } from '../common/like.js';
import { isUniqueViolation, violatedConstraint } from '../common/pg-errors.js';
import { DB, type Database } from '../database/database.module.js';
import { media, productGroups, productImages, products } from '../database/schema.js';
import type {
  AdminProductListQuery,
  CreateProductInput,
  UpdateProductInput,
} from './catalog.schemas.js';
import { adminImageDto, loadImages } from './product-images.js';

type ProductRow = typeof products.$inferSelect;

export const validationError = (fields: Record<string, string>) =>
  new BadRequestException({
    statusCode: 400,
    code: 'VALIDATION',
    message: 'Girilen bilgiler geçersiz.',
    fields,
  });

/** Barkod/kod çakışmasını kısıt adına göre 409'a çevirir. */
export function mapProductConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    const constraint = violatedConstraint(error);
    if (constraint === 'products_code_uq') {
      throw new ConflictException({
        statusCode: 409,
        code: 'DUPLICATE_CODE',
        message: 'Bu ürün kodu başka bir üründe kullanılıyor.',
      });
    }
    if (constraint === 'products_barcode_uq') {
      throw new ConflictException({
        statusCode: 409,
        code: 'DUPLICATE_BARCODE',
        message: 'Bu barkod başka bir üründe kullanılıyor.',
      });
    }
  }
  throw error;
}

/** Arama koşulu: ad (Türkçe harf duyarsız), barkod veya kod. */
export function productSearch(q: string): SQL | undefined {
  const folded = `%${escapeLike(foldTr(q))}%`;
  const raw = `%${escapeLike(q)}%`;
  return or(
    sql`${foldSql(products.name)} like ${folded}`,
    ilike(products.barcode, raw),
    ilike(products.code, raw),
  );
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(query: AdminProductListQuery) {
    const filters: (SQL | undefined)[] = [];
    if (query.q) filters.push(productSearch(query.q));
    if (query.groupId) filters.push(eq(products.groupId, query.groupId));
    if (query.stock) filters.push(eq(products.stockStatus, query.stock));
    if (query.active !== undefined) filters.push(eq(products.isActive, query.active));
    const where = and(...filters);

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(where);
    const order: SQL[] = [];
    if (query.q) order.push(sql`case when ${products.barcode} = ${query.q} then 0 else 1 end`);
    const rows = await this.db
      .select({ product: products, groupName: productGroups.name })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(where)
      .orderBy(...order, asc(sql`lower(${products.name})`), asc(products.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const images = await loadImages(
      this.db,
      rows.map((r) => r.product.id),
    );
    return {
      items: rows.map((r) => this.toDto(r.product, r.groupName, images.get(r.product.id) ?? [])),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string, executor: Pick<Database, 'select'> = this.db) {
    const [row] = await executor
      .select({ product: products, groupName: productGroups.name })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(eq(products.id, id));
    if (!row) throw new NotFoundException('Ürün bulunamadı.');
    const images = await loadImages(executor, [id]);
    return this.toDto(row.product, row.groupName, images.get(id) ?? []);
  }

  async create(input: CreateProductInput, adminId: string) {
    try {
      const id = await this.db.transaction(async (tx) => {
        await this.assertGroup(tx, input.groupId);
        await this.assertMedia(tx, input.mediaIds ?? []);
        const now = this.clock.now();
        const [row] = await tx
          .insert(products)
          .values({
            groupId: input.groupId,
            barcode: input.barcode,
            code: input.code ?? null,
            name: input.name,
            description: input.description ?? null,
            caseQuantity: input.caseQuantity,
            listPrice: input.listPrice,
            vatRate: input.vatRate,
            stockStatus: input.stockStatus,
            stockSource: 'manual',
            stockUpdatedAt: now,
            isActive: input.isActive,
          })
          .returning({ id: products.id });
        await this.setImages(tx, row.id, input.mediaIds ?? []);
        await this.audit.record(
          {
            actorType: 'admin',
            actorId: adminId,
            action: 'product.created',
            entityType: 'products',
            entityId: row.id,
            data: {
              barcode: input.barcode,
              name: input.name,
              listPrice: input.listPrice,
              vatRate: input.vatRate,
              stockStatus: input.stockStatus,
              isActive: input.isActive,
            },
          },
          tx,
        );
        return row.id;
      });
      return await this.get(id);
    } catch (error) {
      return mapProductConflict(error);
    }
  }

  /** Fiyat ve stok değişiminde (ve diğer alanlarda) önceki/yeni değer audit_log'a yazılır. */
  async update(id: string, input: UpdateProductInput, adminId: string) {
    try {
      await this.db.transaction(async (tx) => {
        const [current] = await tx.select().from(products).where(eq(products.id, id)).for('update');
        if (!current) throw new NotFoundException('Ürün bulunamadı.');
        if (input.groupId !== undefined) await this.assertGroup(tx, input.groupId);
        if (input.mediaIds !== undefined) await this.assertMedia(tx, input.mediaIds);

        const set: Partial<typeof products.$inferInsert> = {};
        const changes: Record<string, { previous: unknown; next: unknown }> = {};
        const track = <K extends keyof ProductRow>(key: K, next: ProductRow[K] | undefined) => {
          if (next === undefined || next === current[key]) return;
          (set as Record<string, unknown>)[key] = next;
          changes[key] = { previous: current[key], next };
        };
        track('groupId', input.groupId);
        track('barcode', input.barcode);
        track('code', input.code);
        track('name', input.name);
        track('description', input.description);
        track('caseQuantity', input.caseQuantity);
        track('listPrice', input.listPrice);
        track('vatRate', input.vatRate);
        track('stockStatus', input.stockStatus);
        track('isActive', input.isActive);
        if (changes.stockStatus) {
          set.stockSource = 'manual';
          set.stockUpdatedAt = this.clock.now();
        }

        if (input.mediaIds !== undefined) {
          const previous = (await loadImages(tx, [id])).get(id)?.map((i) => i.mediaId) ?? [];
          if (previous.join() !== input.mediaIds.join()) {
            await this.setImages(tx, id, input.mediaIds);
            changes.mediaIds = { previous, next: input.mediaIds };
          }
        }
        if (Object.keys(changes).length === 0) return;
        if (Object.keys(set).length > 0) {
          await tx.update(products).set(set).where(eq(products.id, id));
        } else {
          await tx.update(products).set({ updatedAt: this.clock.now() }).where(eq(products.id, id));
        }
        await this.audit.record(
          {
            actorType: 'admin',
            actorId: adminId,
            action: 'product.updated',
            entityType: 'products',
            entityId: id,
            data: { changes },
          },
          tx,
        );
      });
    } catch (error) {
      return mapProductConflict(error);
    }
    return this.get(id);
  }

  private async assertGroup(tx: Tx, groupId: string): Promise<void> {
    const [g] = await tx
      .select({ id: productGroups.id })
      .from(productGroups)
      .where(eq(productGroups.id, groupId));
    if (!g) throw validationError({ groupId: 'Ürün grubu bulunamadı.' });
  }

  private async assertMedia(tx: Tx, mediaIds: string[]): Promise<void> {
    if (mediaIds.length === 0) return;
    const found = await tx.select({ id: media.id }).from(media).where(inArray(media.id, mediaIds));
    if (found.length !== mediaIds.length) {
      throw validationError({ mediaIds: 'Seçilen görsellerden biri bulunamadı.' });
    }
  }

  /** Görselleri verilen sırayla değiştirir (K-40, K-62). */
  private async setImages(tx: Tx, productId: string, mediaIds: string[]): Promise<void> {
    await tx.delete(productImages).where(eq(productImages.productId, productId));
    if (mediaIds.length === 0) return;
    await tx
      .insert(productImages)
      .values(mediaIds.map((mediaId, index) => ({ productId, mediaId, sortOrder: index })));
  }

  private toDto(row: ProductRow, groupName: string, images: { mediaId: string; sortOrder: number }[]) {
    return {
      id: row.id,
      groupId: row.groupId,
      groupName,
      barcode: row.barcode,
      code: row.code,
      name: row.name,
      description: row.description,
      caseQuantity: row.caseQuantity,
      listPrice: row.listPrice,
      vatRate: row.vatRate,
      stockStatus: row.stockStatus,
      isActive: row.isActive,
      images: images.map(adminImageDto),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
