// Site ayarları ve bilgi sayfaları (K-73). Depolama: site_settings (anahtar -> jsonb).
// Anahtarlar: `announcement`, `contact`, `page:<slug>`. Kayıt yoksa site-defaults.ts döner.
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { inArray, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { normalizePhone } from '../common/phone.js';
import { DB, type Database } from '../database/database.module.js';
import { siteSettings } from '../database/schema.js';
import {
  DEFAULT_ANNOUNCEMENT,
  DEFAULT_CONTACT,
  DEFAULT_PAGES,
  DEFAULTS_UPDATED_AT,
  PAGE_SLUGS,
  type PageSlug,
  type SiteContact,
  type SitePage,
} from './site-defaults.js';
import type { UpdateSiteInput } from './site.schemas.js';

interface Loaded {
  announcement: string | null;
  contact: SiteContact;
  pages: (SitePage & { updatedAt: string })[];
}

const ALL_KEYS = ['announcement', 'contact', ...PAGE_SLUGS.map((s) => `page:${s}`)];

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
    const pages = PAGE_SLUGS.map((slug) => {
      const row = byKey.get(`page:${slug}`);
      if (!row) return { ...DEFAULT_PAGES[slug], updatedAt: DEFAULTS_UPDATED_AT };
      const v = row.value as Pick<SitePage, 'title' | 'body' | 'published'>;
      return { slug, title: v.title, body: v.body, published: v.published, updatedAt: row.updatedAt.toISOString() };
    });
    return { announcement, contact, pages };
  }

  /** Herkese açık: yalnızca yayımlanmış sayfaların slug ve başlığı. */
  async publicSite() {
    const s = await this.load();
    return {
      announcement: s.announcement,
      contact: s.contact,
      pages: s.pages.filter((p) => p.published).map((p) => ({ slug: p.slug, title: p.title })),
    };
  }

  async publicPage(slug: string) {
    const page = (await this.load()).pages.find((p) => p.slug === slug);
    if (!page || !page.published) throw new NotFoundException('Sayfa bulunamadı.');
    return { slug: page.slug, title: page.title, body: page.body, updatedAt: page.updatedAt };
  }

  async adminGet() {
    const s = await this.load();
    return {
      announcement: s.announcement,
      contact: s.contact,
      pages: s.pages.map(({ slug, title, body, published, updatedAt }) => ({
        slug,
        title,
        body,
        published,
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
    const entries: { key: string; value: unknown }[] = [
      { key: 'announcement', value: input.announcement },
      { key: 'contact', value: contact },
      ...input.pages.map((p) => ({
        key: `page:${p.slug}`,
        value: { title: p.title, body: p.body, published: p.published },
      })),
    ];
    await this.db.transaction(async (tx) => {
      for (const e of entries) {
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
          data: { keys: entries.map((e) => e.key) },
        },
        tx,
      );
    });
    return this.adminGet();
  }
}

export type { PageSlug };
