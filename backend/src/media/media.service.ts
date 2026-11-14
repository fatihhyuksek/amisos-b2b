// Görsel kütüphanesi. K-61, K-62; API: docs/api/katalog-api.md.
// Dosya yolu yalnızca veritabanının ürettiği uuid'den türetilir (path traversal yok).
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { escapeLike } from '../common/like.js';
import { isForeignKeyViolation } from '../common/pg-errors.js';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../database/database.module.js';
import { media } from '../database/schema.js';
import { InvalidImageError, processImage } from './image-processing.js';
import type { MediaListQuery } from './media.schemas.js';
import { mediaThumbUrl, mediaUrl } from './media.urls.js';

export interface MediaDto {
  id: string;
  filename: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  size: number;
  usedBy: number;
  createdAt: string;
}

export interface UploadFile {
  originalname: string;
  buffer: Buffer;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** multer dosya adını latin1 okur; UTF-8 olarak yeniden yorumlar (Türkçe karakterler). */
export function fixFilename(raw: string): string {
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  const name = decoded.includes('�') ? raw : decoded;
  // eslint-disable-next-line no-control-regex
  const base = name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^.*[\\/]/, '').trim();
  return (base || 'gorsel').slice(0, 255);
}

@Injectable()
export class MediaService {
  private readonly root: string;
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.root = path.resolve(config.get('MEDIA_DIR', { infer: true }));
  }

  /** Yalnızca uuid biçimli kimlikten yol üretilir; aksi halde null. */
  private dirFor(id: string): string | null {
    return UUID_RE.test(id) ? path.join(this.root, id.toLowerCase()) : null;
  }

  async upload(files: UploadFile[], adminId: string) {
    if (files.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION',
        message: 'Dosya seçilmedi.',
        fields: { files: 'En az bir dosya gerekli.' },
      });
    }
    const items: MediaDto[] = [];
    const errors: { filename: string; message: string }[] = [];
    for (const file of files) {
      const filename = fixFilename(file.originalname);
      try {
        items.push(await this.store(file.buffer, filename, adminId));
      } catch (error) {
        if (error instanceof InvalidImageError) {
          errors.push({ filename, message: error.message });
        } else {
          // Dosya başına izolasyon: disk/DB hatası diğer dosyaları durdurmaz (store() diske yazılanı siler).
          this.logger.error(`Görsel kaydedilemedi: ${filename}`, error instanceof Error ? error.stack : error);
          errors.push({ filename, message: 'Dosya kaydedilemedi, tekrar deneyin.' });
        }
      }
    }
    return { items, errors };
  }

  private async store(buffer: Buffer, filename: string, adminId: string): Promise<MediaDto> {
    const processed = await processImage(buffer);
    const id = randomUUID();
    const dir = this.dirFor(id)!;
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(path.join(dir, 'thumb.webp'), processed.thumb);
      await writeFile(path.join(dir, 'large.webp'), processed.large);
      const row = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(media)
          .values({
            id,
            storageKey: id,
            originalName: filename,
            mime: processed.mime,
            size: processed.large.length,
            width: processed.width,
            height: processed.height,
            uploadedBy: adminId,
          })
          .returning();
        await this.audit.record(
          {
            actorType: 'admin',
            actorId: adminId,
            action: 'media.uploaded',
            entityType: 'media',
            entityId: id,
            data: { filename },
          },
          tx,
        );
        return created;
      });
      return this.toDto(row, 0);
    } catch (error) {
      await rm(dir, { recursive: true, force: true });
      throw error;
    }
  }

  async list(query: MediaListQuery) {
    const used = sql<number>`(select count(*)::int from product_images pi where pi.media_id = media.id)`;
    const filters = [];
    if (query.q) filters.push(ilike(media.originalName, `%${escapeLike(query.q)}%`));
    if (query.unused) {
      filters.push(sql`not exists (select 1 from product_images pi where pi.media_id = media.id)`);
    }
    const where = filters.length ? and(...filters) : undefined;
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(media)
      .where(where);
    const rows = await this.db
      .select({ row: media, usedBy: used })
      .from(media)
      .where(where)
      .orderBy(desc(media.createdAt), desc(media.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: rows.map((r) => this.toDto(r.row, r.usedBy)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** K-62: bir ürüne bağlı görsel silinemez (409 MEDIA_IN_USE). */
  async remove(id: string, adminId: string): Promise<void> {
    const inUse = () =>
      new ConflictException({
        statusCode: 409,
        code: 'MEDIA_IN_USE',
        message: 'Görsel bir ürüne bağlı, silinemez.',
      });
    await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(media).where(eq(media.id, id)).for('update');
      if (!row) throw new NotFoundException('Görsel bulunamadı.');
      try {
        await tx.delete(media).where(eq(media.id, id));
      } catch (error) {
        if (isForeignKeyViolation(error)) throw inUse();
        throw error;
      }
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'media.deleted',
          entityType: 'media',
          entityId: id,
          data: { filename: row.originalName },
        },
        tx,
      );
    });
    const dir = this.dirFor(id);
    if (dir) await rm(dir, { recursive: true, force: true });
  }

  /** Sunum ucu için dosya içeriği; yoksa 404. */
  async readVariant(id: string, variant: 'thumb' | 'large'): Promise<Buffer> {
    const dir = this.dirFor(id);
    if (!dir) throw new NotFoundException('Görsel bulunamadı.');
    try {
      return await readFile(path.join(dir, `${variant}.webp`));
    } catch {
      throw new NotFoundException('Görsel bulunamadı.');
    }
  }

  private toDto(row: typeof media.$inferSelect, usedBy: number): MediaDto {
    return {
      id: row.id,
      filename: row.originalName,
      url: mediaUrl(row.id),
      thumbUrl: mediaThumbUrl(row.id),
      width: row.width,
      height: row.height,
      size: row.size,
      usedBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
