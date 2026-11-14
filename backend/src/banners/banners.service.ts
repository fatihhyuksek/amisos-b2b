// Ana sayfa kampanya görselleri. K-65, K-62, GR-YON-001 (audit).
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, lte, gt, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { DB, type Database } from '../database/database.module.js';
import { banners, media } from '../database/schema.js';
import { mediaThumbUrl, mediaUrl } from '../media/media.urls.js';
import type { CreateBannerInput, ReorderBannersInput, UpdateBannerInput } from './banners.schemas.js';

type BannerRow = typeof banners.$inferSelect;

const validation = (fields: Record<string, string>) =>
  new BadRequestException({ statusCode: 400, code: 'VALIDATION', message: 'Girilen bilgiler geçersiz.', fields });

@Injectable()
export class BannersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.db.select().from(banners).orderBy(asc(banners.sortOrder), asc(banners.createdAt), asc(banners.id));
    return rows.map(adminDto);
  }

  async create(input: CreateBannerInput, adminId: string) {
    await this.assertMedia(input.mediaId);
    return this.db.transaction(async (tx) => {
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${banners.sortOrder}), -1) + 1` })
        .from(banners);
      const [row] = await tx
        .insert(banners)
        .values({
          mediaId: input.mediaId,
          title: input.title,
          subtitle: input.subtitle ?? null,
          linkPath: input.linkPath ?? null,
          isActive: input.isActive,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          sortOrder: Number(next),
        })
        .returning();
      await this.audit.record(
        { actorType: 'admin', actorId: adminId, action: 'banner.created', entityType: 'banners', entityId: row.id, data: { title: row.title } },
        tx,
      );
      return adminDto(row);
    });
  }

  async update(id: string, input: UpdateBannerInput, adminId: string) {
    if (input.mediaId) await this.assertMedia(input.mediaId);
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(banners).where(eq(banners.id, id)).for('update');
      if (!current) throw new NotFoundException('Banner bulunamadı.');
      const next = {
        startsAt: input.startsAt === undefined ? current.startsAt : input.startsAt,
        endsAt: input.endsAt === undefined ? current.endsAt : input.endsAt,
      };
      if (next.startsAt && next.endsAt && next.endsAt <= next.startsAt) {
        throw validation({ endsAt: 'Bitiş, başlangıçtan sonra olmalı.' });
      }
      const set: Partial<typeof banners.$inferInsert> = {};
      if (input.mediaId !== undefined) set.mediaId = input.mediaId;
      if (input.title !== undefined) set.title = input.title;
      if (input.subtitle !== undefined) set.subtitle = input.subtitle;
      if (input.linkPath !== undefined) set.linkPath = input.linkPath;
      if (input.isActive !== undefined) set.isActive = input.isActive;
      if (input.startsAt !== undefined) set.startsAt = input.startsAt;
      if (input.endsAt !== undefined) set.endsAt = input.endsAt;
      const [row] =
        Object.keys(set).length > 0
          ? await tx.update(banners).set(set).where(eq(banners.id, id)).returning()
          : [current];
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'banner.updated',
          entityType: 'banners',
          entityId: id,
          data: { fields: Object.keys(set) },
        },
        tx,
      );
      return adminDto(row);
    });
  }

  async remove(id: string, adminId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.delete(banners).where(eq(banners.id, id)).returning();
      if (!row) throw new NotFoundException('Banner bulunamadı.');
      await this.audit.record(
        { actorType: 'admin', actorId: adminId, action: 'banner.deleted', entityType: 'banners', entityId: id, data: { title: row.title } },
        tx,
      );
    });
  }

  /** Sıralama: `ids` tüm banner'ları tam olarak bir kez içermelidir. */
  async reorder(input: ReorderBannersInput, adminId: string) {
    await this.db.transaction(async (tx) => {
      const existing = await tx.select({ id: banners.id }).from(banners).for('update');
      const have = new Set(existing.map((e) => e.id));
      if (have.size !== input.ids.length || !input.ids.every((i) => have.has(i))) {
        throw validation({ ids: 'Liste tüm banner’ları tam olarak bir kez içermeli.' });
      }
      for (const [index, bannerId] of input.ids.entries()) {
        await tx.update(banners).set({ sortOrder: index }).where(eq(banners.id, bannerId));
      }
      await this.audit.record(
        { actorType: 'admin', actorId: adminId, action: 'banner.reordered', entityType: 'banners', entityId: 'all', data: { ids: input.ids } },
        tx,
      );
    });
    return this.list();
  }

  /** Bayi: yalnızca aktif ve şu an yayın aralığında olanlar, sıralı. */
  async listPublic() {
    const now = this.clock.now();
    const rows = await this.db
      .select()
      .from(banners)
      .where(
        and(
          eq(banners.isActive, true),
          or(isNull(banners.startsAt), lte(banners.startsAt, now)),
          or(isNull(banners.endsAt), gt(banners.endsAt, now)),
        ),
      )
      .orderBy(asc(banners.sortOrder), asc(banners.createdAt), asc(banners.id));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      linkPath: r.linkPath,
      imageUrl: mediaUrl(r.mediaId),
      thumbUrl: mediaThumbUrl(r.mediaId),
    }));
  }

  private async assertMedia(mediaId: string): Promise<void> {
    const [m] = await this.db.select({ id: media.id }).from(media).where(eq(media.id, mediaId));
    if (!m) throw validation({ mediaId: 'Görsel bulunamadı.' });
  }
}

function adminDto(r: BannerRow) {
  return {
    id: r.id,
    mediaId: r.mediaId,
    title: r.title,
    subtitle: r.subtitle,
    linkPath: r.linkPath,
    imageUrl: mediaUrl(r.mediaId),
    thumbUrl: mediaThumbUrl(r.mediaId),
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
