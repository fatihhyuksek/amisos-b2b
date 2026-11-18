// K-87: yönetilebilir vitrin ayarları (home, navigation, announcements) şemaları ve varsayılanları.
// Depolama: site_settings anahtarları `home`, `navigation`, `announcements`.
import { z } from 'zod';

export const MAX_SECTIONS = 20;
export const MAX_NAV_ITEMS = 12;
export const MAX_ANNOUNCEMENTS = 5;
export const SHELF_SOURCES = ['bestSellers', 'mostViewed', 'trending', 'new', 'featured', 'group', 'manual'] as const;
export type ShelfSource = (typeof SHELF_SOURCES)[number];
export const AUDIENCES = ['all', 'guest', 'dealer'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Boş metin ve null "yok" demektir (alan çıktıdan düşer). */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : undefined));

/** Uygulama içi yol ("/" ile başlar, "//" hariç) veya https adresi; `javascript:` vb. reddedilir. */
const isSafeLink = (v: string): boolean => {
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return false;
  if (/^\/(?!\/)/.test(v)) return true;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};
const internalPath = (v: string): boolean => /^\/(?!\/)/.test(v) && !/[\u0000-\u001f\u007f\\]/.test(v);

const link = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || isSafeLink(v), { message: 'Uygulama içi yol ("/..." ) veya https adresi girin.' });
const appLink = () =>
  z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || internalPath(v), { message: 'Uygulama içi bir yol girin ("/" ile başlar).' });

const audience = (def: Audience) => z.enum(AUDIENCES).default(def);

/** Raf kaynağı kuralları: group → groupId, manual → productIds zorunlu. */
const shelfFields = {
  source: z.enum(SHELF_SOURCES, { error: 'Bilinmeyen raf kaynağı.' }),
  groupId: z.uuid().nullish().transform((v) => v ?? undefined),
  productIds: z
    .array(z.uuid())
    .max(24)
    .nullish()
    .transform((v) => (v ? [...new Set(v)] : undefined)),
  limit: z.number().int().min(4).max(24),
};
type ShelfLike = { source: ShelfSource; groupId?: string; productIds?: string[] };
const shelfRule = (c: ShelfLike, ctx: z.RefinementCtx) => {
  if (c.source === 'group' && !c.groupId) {
    ctx.addIssue({ code: 'custom', path: ['groupId'], message: 'Ürün grubu seçin.' });
  }
  if (c.source === 'manual' && (!c.productIds || c.productIds.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['productIds'], message: 'En az bir ürün seçin.' });
  }
};

const emptyConfig = z.object({}).nullish().transform(() => ({}));

const base = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Bölüm kimliği 1–64 karakter ([A-Za-z0-9_-]) olmalı.'),
  enabled: z.boolean(),
  title: text(80),
  subtitle: text(160),
};

const section = <T extends string, C extends z.ZodType>(type: T, config: C) =>
  z.object({ ...base, type: z.literal(type), config });

export const homeSectionSchema = z.discriminatedUnion(
  'type',
  [
    section('hero', emptyConfig),
    section('categoryStrip', emptyConfig),
    section('trustStrip', emptyConfig),
    section('iconTiles', emptyConfig),
    section('howItWorks', z.object({ audience: audience('guest') }).default({ audience: 'guest' })),
    section(
      'campaignStrip',
      z.object({
        audience: audience('all'),
        title: text(80),
        text: text(240),
        buttonLabel: text(30),
        buttonLink: appLink(),
      }),
    ),
    section(
      'collections',
      z.object({ groupIds: z.array(z.uuid()).max(4).nullish().transform((v) => [...new Set(v ?? [])]) }).default({ groupIds: [] }),
    ),
    section(
      'productShelf',
      z.object({ ...shelfFields, limit: shelfFields.limit.default(12), layout: z.enum(['grid', 'carousel']).default('grid') }).superRefine(shelfRule),
    ),
    section(
      'promoPanel',
      z
        .object({
          ...shelfFields,
          limit: shelfFields.limit.default(8),
          panelTitle: text(80),
          panelText: text(240),
          buttonLabel: text(30),
          buttonLink: appLink(),
        })
        .superRefine(shelfRule),
    ),
  ],
  { error: 'Bilinmeyen bölüm türü.' },
);

export const homeSchema = z.object({
  sections: z
    .array(homeSectionSchema)
    .max(MAX_SECTIONS)
    .refine((a) => new Set(a.map((s) => s.id)).size === a.length, { message: 'Bölüm kimlikleri benzersiz olmalı.' }),
});
export type HomeSettings = z.infer<typeof homeSchema>;
export type HomeSection = HomeSettings['sections'][number];

export const NAV_TYPES = ['group', 'featured', 'new', 'bestSellers', 'link'] as const;
export const navigationSchema = z.object({
  items: z
    .array(
      z
        .object({
          type: z.enum(NAV_TYPES, { error: 'Bilinmeyen menü öğesi türü.' }),
          groupId: z.uuid().nullish().transform((v) => v ?? undefined),
          label: text(30),
          href: link(),
        })
        .superRefine((i, ctx) => {
          if (i.type === 'group' && !i.groupId) ctx.addIssue({ code: 'custom', path: ['groupId'], message: 'Ürün grubu seçin.' });
          if (i.type === 'link') {
            if (!i.label) ctx.addIssue({ code: 'custom', path: ['label'], message: 'Bağlantı için etiket gerekli.' });
            if (!i.href) ctx.addIssue({ code: 'custom', path: ['href'], message: 'Bağlantı adresi gerekli.' });
          }
        })
        // Gereksiz alanları ele: yalnızca türüne ait alanlar saklanır.
        .transform((i) => ({
          type: i.type,
          ...(i.type === 'group' ? { groupId: i.groupId } : {}),
          ...(i.label ? { label: i.label } : {}),
          ...(i.type === 'link' && i.href ? { href: i.href } : {}),
        })),
    )
    .max(MAX_NAV_ITEMS),
});
export type NavigationSettings = z.infer<typeof navigationSchema>;
export type NavigationItem = NavigationSettings['items'][number];

export const announcementsSchema = z.object({
  items: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(120),
        link: link(),
      }).transform((i) => ({ text: i.text, ...(i.link ? { link: i.link } : {}) })),
    )
    .max(MAX_ANNOUNCEMENTS),
});
export type AnnouncementsSettings = z.infer<typeof announcementsSchema>;

/** Mevcut ana sayfa sırası + "En çok satanlar" rafı (K-87). */
export const DEFAULT_HOME: HomeSettings = homeSchema.parse({
  sections: [
    { id: 'hero', type: 'hero', enabled: true, config: {} },
    { id: 'categoryStrip', type: 'categoryStrip', enabled: true, config: {} },
    { id: 'campaignStrip', type: 'campaignStrip', enabled: true, config: { audience: 'all' } },
    { id: 'collections', type: 'collections', enabled: true, config: { groupIds: [] } },
    { id: 'shelf-new', type: 'productShelf', enabled: true, title: 'Yeni ürünler', config: { source: 'new', limit: 5, layout: 'grid' } },
    { id: 'shelf-best', type: 'productShelf', enabled: true, title: 'En çok satanlar', config: { source: 'bestSellers', limit: 5, layout: 'grid' } },
    { id: 'iconTiles', type: 'iconTiles', enabled: true, config: {} },
    {
      id: 'promo-featured',
      type: 'promoPanel',
      enabled: true,
      config: { source: 'featured', limit: 8, panelTitle: 'Öne çıkan ürünler' },
    },
    { id: 'howItWorks', type: 'howItWorks', enabled: true, config: { audience: 'guest' } },
    { id: 'trustStrip', type: 'trustStrip', enabled: true, config: {} },
  ],
});
