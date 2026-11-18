// Site ayarları ve bilgi sayfaları (K-73). Depolama: site_settings (anahtar -> jsonb).
// Anahtarlar: `announcement`, `contact`, `page:<slug>`. Kayıt yoksa site-defaults.ts döner.
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { eq, inArray, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { normalizePhone } from '../common/phone.js';
import { DB, type Database } from '../database/database.module.js';
import { media, siteSettings } from '../database/schema.js';
import { mediaUrl } from '../media/media.urls.js';
import { pageVersionOf } from './consent-versions.js';
import {
  DEFAULT_ANNOUNCEMENT,
  DEFAULT_CONTACT,
  DEFAULT_PAGES,
  DEFAULT_SEO,
  DEFAULT_SOCIAL,
  SOCIAL_KEYS,
  DEFAULTS_UPDATED_AT,
  PAGE_SLUGS,
  type PageSlug,
  type SiteContact,
  type SiteSeo,
  type SiteSocial,
  type SitePage,
} from './site-defaults.js';
import type { UpdateSiteInput } from './site.schemas.js';

interface Loaded {
  announcement: string | null;
  contact: SiteContact;
  social: SiteSocial;
  seo: SiteSeo;
  pages: (SitePage & { updatedAt: string; version: number })[];
}

const ALL_KEYS = ['announcement', 'contact', 'social', 'seo', ...PAGE_SLUGS.map((s) => `page:${s}`)];

/** JSON null değeri SQL NULL'a dönüşmesin diye açıkça jsonb metni olarak yazılır. */
const json = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;

/** "0552 492 50 58" -> "+905524925058"; geçersizse null. */
const toE164 = (phone: string): string | null => {
  const n = normalizePhone(phone);
  return n ? `+90${n.slice(1)}` : null;
};

@Injectable()
export class SiteService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async load(): Promise<Loaded> {
    const rows = await this.db.select().from(siteSettings).where(inArray(siteSettings.key, ALL_KEYS));
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const announcement = byKey.has('announcement')
      ? ((byKey.get('announcement')?.value as string | null) ?? null)
      : DEFAULT_ANNOUNCEMENT;
    const contact = byKey.has('contact')
      ? ({ ...DEFAULT_CONTACT, ...(byKey.get('contact')?.value as Partial<SiteContact>) } as SiteContact)
      : DEFAULT_CONTACT;
    const social = byKey.has('social')
      ? ({ ...DEFAULT_SOCIAL, ...(byKey.get('social')?.value as Partial<SiteSocial>) } as SiteSocial)
      : DEFAULT_SOCIAL;
    const seo = byKey.has('seo')
      ? ({ ...DEFAULT_SEO, ...(byKey.get('seo')?.value as Partial<SiteSeo>) } as SiteSeo)
      : DEFAULT_SEO;
    const pages = PAGE_SLUGS.map((slug) => {
      const row = byKey.get(`page:${slug}`);
      if (!row) return { ...DEFAULT_PAGES[slug], updatedAt: DEFAULTS_UPDATED_AT, version: 1 };
      const v = row.value as Pick<SitePage, 'title' | 'body' | 'published'>;
      return {
        slug,
        title: v.title,
        body: v.body,
        published: v.published,
        updatedAt: row.updatedAt.toISOString(),
        version: pageVersionOf(row.value),
      };
    });
    return { announcement, contact, social, seo, pages };
  }

  /** K-82: sunucu tarafı SEO (meta enjeksiyonu, sitemap, robots) için yüklenmiş ayarlar. */
  loadForSeo(): Promise<Loaded> {
    return this.load();
  }

  private seoDto(seo: SiteSeo) {
    return { ...seo, ogImageUrl: seo.ogImageMediaId ? mediaUrl(seo.ogImageMediaId) : null };
  }

  /** Herkese açık: yalnızca yayımlanmış sayfaların slug ve başlığı. */
  async publicSite() {
    const s = await this.load();
    return {
      announcement: s.announcement,
      contact: s.contact,
      social: s.social,
      seo: this.seoDto(s.seo),
      pages: s.pages.filter((p) => p.published).map((p) => ({ slug: p.slug, title: p.title })),
    };
  }

  async publicPage(slug: string) {
    const page = (await this.load()).pages.find((p) => p.slug === slug);
    if (!page || !page.published) throw new NotFoundException('Sayfa bulunamadı.');
    return { slug: page.slug, title: page.title, body: page.body, version: page.version, updatedAt: page.updatedAt };
  }

  async adminGet() {
    const s = await this.load();
    return {
      announcement: s.announcement,
      contact: s.contact,
      social: s.social,
      seo: this.seoDto(s.seo),
      pages: s.pages.map(({ slug, title, body, published, updatedAt, version }) => ({
        slug,
        title,
        body,
        published,
        version,
        updatedAt,
      })),
    };
  }

  /** Gövdede verilen sayfalar güncellenir; verilmeyenler olduğu gibi kalır. Tek transaction, tek audit kaydı. */
  async adminUpdate(input: UpdateSiteInput, adminId: string) {
    const contact: SiteContact = {
      phone: input.contact.phone,
      // Verilmezse (undefined) telefondan türetilir; açıkça null verilirse buton gizlenir.
      phoneE164: input.contact.phoneE164 === undefined ? toE164(input.contact.phone) : input.contact.phoneE164,
      whatsappE164:
        input.contact.whatsappE164 === undefined
          ? input.contact.phoneE164 === undefined
            ? toE164(input.contact.phone)
            : input.contact.phoneE164
          : input.contact.whatsappE164,
      email: input.contact.email,
      address: input.contact.address,
      city: input.contact.city,
      workingHours: input.contact.workingHours,
      mapUrl: input.contact.mapUrl,
    };
    const before = await this.load();
    // Yalnızca değişen anahtarlar yazılır ve audit'e önceki/sonraki değerleriyle girer (K-73).
    const changed: { key: string; previous: unknown; next: unknown; value: unknown }[] = [];
    if (!isDeepStrictEqual(before.announcement, input.announcement)) {
      changed.push({ key: 'announcement', previous: before.announcement, next: input.announcement, value: input.announcement });
    }
    if (!isDeepStrictEqual(before.contact, contact)) {
      changed.push({ key: 'contact', previous: before.contact, next: contact, value: contact });
    }
    // K-77: kısmi güncelleme; verilmeyen ağ mevcut değerini korur, null kaldırır.
    const social = { ...before.social } as SiteSocial;
    for (const key of SOCIAL_KEYS) {
      const next = input.social?.[key];
      if (next !== undefined) social[key] = next;
    }
    if (!isDeepStrictEqual(before.social, social)) {
      changed.push({ key: 'social', previous: before.social, next: social, value: social });
    }
    // K-82: kısmi güncelleme; verilmeyen alan korunur.
    const seo: SiteSeo = { ...before.seo };
    for (const [key, value] of Object.entries(input.seo ?? {})) {
      if (value !== undefined) (seo as unknown as Record<string, unknown>)[key] = value;
    }
    if (seo.ogImageMediaId && seo.ogImageMediaId !== before.seo.ogImageMediaId) {
      const [m] = await this.db.select({ id: media.id }).from(media).where(eq(media.id, seo.ogImageMediaId));
      if (!m) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'VALIDATION',
          message: 'Girilen bilgiler geçersiz.',
          fields: { 'seo.ogImageMediaId': 'Seçilen görsel bulunamadı.' },
        });
      }
    }
    if (!isDeepStrictEqual(before.seo, seo)) {
      changed.push({ key: 'seo', previous: before.seo, next: seo, value: seo });
    }
    for (const p of input.pages) {
      const prev = before.pages.find((x) => x.slug === p.slug);
      if (!prev) continue;
      const previous = { title: prev.title, body: prev.body, published: prev.published, version: prev.version };
      const bodyChanged = prev.body !== p.body;
      // Metin her değiştiğinde sürüm artar; onaylar o anki sürümle kaydedilir (GR-KVK-001).
      const next = { title: p.title, body: p.body, published: p.published, version: prev.version + (bodyChanged ? 1 : 0) };
      if (!isDeepStrictEqual(previous, next)) changed.push({ key: `page:${p.slug}`, previous, next, value: next });
    }
    if (changed.length > 0) {
      await this.db.transaction(async (tx) => {
        for (const e of changed) {
          await tx
            .insert(siteSettings)
            .values({ key: e.key, value: json(e.value), updatedBy: adminId })
            .onConflictDoUpdate({
              target: siteSettings.key,
              set: { value: json(e.value), updatedAt: new Date(), updatedBy: adminId },
            });
        }
        await this.audit.record(
          {
            actorType: 'admin',
            actorId: adminId,
            action: 'site.updated',
            entityType: 'site_settings',
            entityId: 'site',
            data: { changes: Object.fromEntries(changed.map((e) => [e.key, { previous: e.previous, next: e.next }])) },
          },
          tx,
        );
      });
    }
    return this.adminGet();
  }
}

export type { PageSlug };
