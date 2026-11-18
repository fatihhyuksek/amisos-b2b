// Site ayarları ve bilgi sayfaları (K-73). Depolama: site_settings (anahtar -> jsonb).
// Anahtarlar: `announcement`, `contact`, `page:<slug>`. Kayıt yoksa site-defaults.ts döner.
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { normalizePhone } from '../common/phone.js';
import { DB, type Database } from '../database/database.module.js';
import { media, productGroups, products, siteSettings } from '../database/schema.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { NEW_PRODUCT_DAYS } from '../catalog/catalog.service.js';
import { PopularityService } from '../catalog/popularity.service.js';
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
import {
  DEFAULT_HOME,
  type AnnouncementsSettings,
  type HomeSection,
  type HomeSettings,
  type NavigationItem,
  type NavigationSettings,
} from './layout.schemas.js';

interface Loaded {
  /** Eski tek duyuru alanı: duyurular varsa ilk öğenin metni (geriye uyumlu). */
  announcement: string | null;
  /** K-87: üst şeritte dönen duyurular; eski `announcement` ilk öğe olarak taşınır. */
  announcements: AnnouncementsSettings['items'];
  /** `announcements` anahtarı yazılmış mı (değilse eski alandan türetilmiştir). */
  announcementsStored: boolean;
  home: HomeSettings;
  navigation: NavigationSettings;
  contact: SiteContact;
  social: SiteSocial;
  seo: SiteSeo;
  pages: (SitePage & { updatedAt: string; version: number })[];
}

const MAX_DEFAULT_GROUPS = 10;

const ALL_KEYS = ['announcement', 'announcements', 'home', 'navigation', 'contact', 'social', 'seo', ...PAGE_SLUGS.map((s) => `page:${s}`)];

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
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PopularityService) private readonly popularity: PopularityService,
  ) {}

  private async load(): Promise<Loaded> {
    const rows = await this.db.select().from(siteSettings).where(inArray(siteSettings.key, ALL_KEYS));
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const legacy = byKey.has('announcement')
      ? ((byKey.get('announcement')?.value as string | null) ?? null)
      : DEFAULT_ANNOUNCEMENT;
    const announcementsStored = byKey.has('announcements');
    const announcements = announcementsStored
      ? ((byKey.get('announcements')?.value as AnnouncementsSettings).items ?? [])
      : legacy
        ? [{ text: legacy.slice(0, 120) }]
        : [];
    const announcement = announcementsStored ? (announcements[0]?.text ?? null) : legacy;
    const home = byKey.has('home') ? (byKey.get('home')?.value as HomeSettings) : DEFAULT_HOME;
    const navigation = byKey.has('navigation') ? (byKey.get('navigation')?.value as NavigationSettings) : { items: [] };
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
    return { announcement, announcements, announcementsStored, home, navigation, contact, social, seo, pages };
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
      announcements: { items: s.announcements },
      home: { sections: s.home.sections.filter((x) => x.enabled) },
      navigation: await this.effectiveNavigation(s.navigation),
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
      announcements: { items: s.announcements },
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

  // --- K-87: yönetilebilir vitrin --------------------------------------------

  private async saveKey(key: string, previous: unknown, next: unknown, adminId: string): Promise<void> {
    if (isDeepStrictEqual(previous, next)) return;
    await this.db.transaction(async (tx) => {
      await tx
        .insert(siteSettings)
        .values({ key, value: json(next), updatedBy: adminId })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: json(next), updatedAt: new Date(), updatedBy: adminId } });
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'site.updated',
          entityType: 'site_settings',
          entityId: 'site',
          data: { changes: { [key]: { previous, next } } },
        },
        tx,
      );
    });
  }

  async adminGetHome(): Promise<HomeSettings> {
    return (await this.load()).home;
  }

  async adminUpdateHome(input: HomeSettings, adminId: string): Promise<HomeSettings> {
    await this.saveKey('home', (await this.load()).home, input, adminId);
    return (await this.load()).home;
  }

  async adminGetNavigation() {
    return this.effectiveNavigation((await this.load()).navigation, false);
  }

  async adminUpdateNavigation(input: NavigationSettings, adminId: string) {
    await this.saveKey('navigation', (await this.load()).navigation, input, adminId);
    return this.adminGetNavigation();
  }

  async adminGetAnnouncements(): Promise<AnnouncementsSettings> {
    return { items: (await this.load()).announcements };
  }

  async adminUpdateAnnouncements(input: AnnouncementsSettings, adminId: string): Promise<AnnouncementsSettings> {
    const before = await this.load();
    // Eski tek alan da senkron kalır (eski istemciler `announcement` okur).
    const legacy = input.items[0]?.text ?? null;
    if (!isDeepStrictEqual({ items: before.announcements }, input) || !before.announcementsStored) {
      await this.db.transaction(async (tx) => {
        for (const [key, value] of [['announcements', input], ['announcement', legacy]] as const) {
          await tx
            .insert(siteSettings)
            .values({ key, value: json(value), updatedBy: adminId })
            .onConflictDoUpdate({ target: siteSettings.key, set: { value: json(value), updatedAt: new Date(), updatedBy: adminId } });
        }
        await this.audit.record(
          {
            actorType: 'admin',
            actorId: adminId,
            action: 'site.updated',
            entityType: 'site_settings',
            entityId: 'site',
            data: { changes: { announcements: { previous: { items: before.announcements }, next: input } } },
          },
          tx,
        );
      });
    }
    return this.adminGetAnnouncements();
  }

  /**
   * Menü: öğe yoksa varsayılan (aktif gruplar + Öne Çıkanlar + Yeni Ürünler). Grup öğelerine etiket (grup adı)
   * eklenir; pasif/silinmiş gruplar `resolve` açıkken (herkese açık görünüm) elenir.
   */
  private async effectiveNavigation(nav: NavigationSettings, dropMissing = true) {
    const groups = await this.db
      .select({ id: productGroups.id, name: productGroups.name })
      .from(productGroups)
      .where(eq(productGroups.isActive, true))
      .orderBy(asc(productGroups.sortOrder), asc(productGroups.name), asc(productGroups.id));
    const byId = new Map(groups.map((g) => [g.id, g.name]));
    if (nav.items.length === 0) {
      const items: (NavigationItem & { label: string })[] = [
        ...groups.slice(0, MAX_DEFAULT_GROUPS).map((g) => ({ type: 'group' as const, groupId: g.id, label: g.name })),
        { type: 'featured' as const, label: 'Öne Çıkanlar' },
        { type: 'new' as const, label: 'Yeni Ürünler' },
      ];
      return { items, isDefault: true };
    }
    const items = nav.items
      .filter((i) => !(dropMissing && i.type === 'group' && !byId.has(i.groupId as string)))
      .map((i) => (i.type === 'group' && !i.label ? { ...i, label: byId.get(i.groupId as string) } : i));
    return { items, isDefault: false };
  }

  /**
   * GET /api/site/home: yalnızca açık bölümler; raf ve tanıtım panelleri için sunucunun çözdüğü `productIds`
   * (boşsa arayüz bölümü gizler), koleksiyonlar için çözülmüş `groupIds` (boşsa en çok ürünlü 4 grup).
   * Aynı kaynak için tek sorgu: önce kaynaklar toplanır, sonra dağıtılır (bölüm başına sorgu yok).
   */
  async publicHome() {
    const home = (await this.load()).home;
    const sections = home.sections.filter((x) => x.enabled);
    const shelves = sections.filter((x) => x.type === 'productShelf' || x.type === 'promoPanel') as Extract<
      HomeSection,
      { type: 'productShelf' | 'promoPanel' }
    >[];
    const maxBy = (pick: (c: (typeof shelves)[number]['config']) => boolean) =>
      Math.max(0, ...shelves.filter((x) => pick(x.config)).map((x) => x.config.limit));
    const [highlights, newIds, featuredIds, manual, groupLists, collectionGroups] = await Promise.all([
      this.popularity.highlights(24),
      maxBy((c) => c.source === 'new') > 0 ? this.activeProductIds('new', maxBy((c) => c.source === 'new')) : [],
      maxBy((c) => c.source === 'featured') > 0 ? this.activeProductIds('featured', maxBy((c) => c.source === 'featured')) : [],
      this.activeManualIds(shelves.flatMap((x) => (x.config.source === 'manual' ? (x.config.productIds ?? []) : []))),
      Promise.all(
        [...new Set(shelves.filter((x) => x.config.source === 'group' && x.config.groupId).map((x) => x.config.groupId as string))].map(
          async (id) => [id, await this.activeProductIds('group', maxBy((c) => c.source === 'group' && c.groupId === id), id)] as const,
        ),
      ),
      sections.some((x) => x.type === 'collections') ? this.collectionGroups(sections) : new Map<string, string[]>(),
    ]);
    const byGroup = new Map(groupLists);
    const resolve = (c: (typeof shelves)[number]['config']): string[] => {
      switch (c.source) {
        case 'bestSellers':
          return highlights.bestSellers;
        case 'mostViewed':
          return highlights.mostViewed;
        case 'trending':
          return highlights.trending;
        case 'new':
          return newIds;
        case 'featured':
          return featuredIds;
        case 'group':
          return byGroup.get(c.groupId as string) ?? [];
        case 'manual':
          return (c.productIds ?? []).filter((id) => manual.has(id));
      }
    };
    return {
      sections: sections.map((x) => {
        if (x.type === 'productShelf' || x.type === 'promoPanel') {
          return { ...x, productIds: resolve(x.config).slice(0, x.config.limit) };
        }
        if (x.type === 'collections') return { ...x, config: { ...x.config, groupIds: collectionGroups.get(x.id) ?? [] } };
        return x;
      }),
    };
  }

  /** Aktif ürün (ve aktif grup) kimlikleri; `new`: son 30 gün, `featured`: öne çıkanlar, `group`: grubun ürünleri. */
  private async activeProductIds(source: 'new' | 'featured' | 'group', limit: number, groupId?: string): Promise<string[]> {
    const filters = [eq(products.isActive, true), eq(productGroups.isActive, true)];
    let order = [asc(sql`lower(${products.name})`), asc(products.id)];
    if (source === 'new') {
      filters.push(gte(products.createdAt, new Date(this.clock.now().getTime() - NEW_PRODUCT_DAYS * 86_400_000)));
      order = [desc(products.createdAt), desc(products.id)];
    }
    if (source === 'featured') filters.push(eq(products.isFeatured, true));
    if (source === 'group' && groupId) filters.push(eq(products.groupId, groupId));
    const rows = await this.db
      .select({ id: products.id })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(and(...filters))
      .orderBy(...order)
      .limit(limit);
    return rows.map((r) => r.id);
  }

  private async activeManualIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: products.id })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(and(inArray(products.id, ids), eq(products.isActive, true), eq(productGroups.isActive, true)));
    return new Set(rows.map((r) => r.id));
  }

  /** Koleksiyon bölümü başına grup kimlikleri: seçilmiş aktif gruplar; boşsa en çok aktif ürünlü 4 grup. Tek sorgu. */
  private async collectionGroups(sections: HomeSection[]): Promise<Map<string, string[]>> {
    const rows = await this.db
      .select({ id: productGroups.id, count: sql<number>`count(${products.id})::int` })
      .from(productGroups)
      .innerJoin(products, and(eq(products.groupId, productGroups.id), eq(products.isActive, true)))
      .where(eq(productGroups.isActive, true))
      .groupBy(productGroups.id)
      .orderBy(desc(sql`count(${products.id})`), asc(productGroups.sortOrder), asc(productGroups.name), asc(productGroups.id));
    const active = new Set(rows.map((r) => r.id));
    const top = rows.slice(0, 4).map((r) => r.id);
    const out = new Map<string, string[]>();
    for (const s of sections) {
      if (s.type !== 'collections') continue;
      const picked = s.config.groupIds.filter((id) => active.has(id));
      out.set(s.id, picked.length > 0 ? picked : top);
    }
    return out;
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
      // K-87: yeni duyuru listesi yazılmışsa eski alandaki değişiklik ilk öğeye de yansır (geriye uyumlu).
      if (before.announcementsStored) {
        const rest = before.announcements.slice(1);
        const first = input.announcement
          ? [{ ...before.announcements[0], text: input.announcement.slice(0, 120) }]
          : [];
        const next = { items: [...first, ...rest] };
        changed.push({ key: 'announcements', previous: { items: before.announcements }, next, value: next });
      }
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
