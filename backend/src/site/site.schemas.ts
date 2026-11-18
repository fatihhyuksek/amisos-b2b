// Site ayarları girdileri (K-73). Sayfa gövdesi düz metindir (HTML yok): kısıtlar burada.
import { z } from 'zod';
import { PAGE_SLUGS, SOCIAL_DOMAINS, type SocialKey } from './site-defaults.js';

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === null || v === '' ? null : v));

const e164 = z
  .string()
  .trim()
  .regex(/^\+\d{8,15}$/, 'Uluslararası biçimde yazın (ör. +905524925058).');

export const contactSchema = z.object({
  phone: z.string().trim().min(3).max(40),
  phoneE164: e164.nullable().optional(),
  whatsappE164: e164.nullable().optional(),
  email: z.string().trim().max(254).pipe(z.email()),
  address: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  workingHours: nullableText(200),
  mapUrl: nullableText(500).refine(
    (v) => {
      if (v === null) return true;
      try {
        return new URL(v).protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Harita bağlantısı https ile başlamalı.' },
  ),
});

/** K-77: null/boş = kaldır; aksi halde `https://` ile başlayan ve ilgili alan adına ait URL. */
const socialUrl = (key: SocialKey) =>
  z
    .string()
    .trim()
    .max(300)
    .nullable()
    .transform((v) => (v === null || v === '' ? null : v))
    .refine(
      (v) => {
        if (v === null) return true;
        try {
          const url = new URL(v);
          const domain = SOCIAL_DOMAINS[key];
          return url.protocol === 'https:' && (url.hostname === domain || url.hostname.endsWith(`.${domain}`));
        } catch {
          return false;
        }
      },
      { message: `https:// ile başlayan geçerli bir ${SOCIAL_DOMAINS[key]} adresi girin.` },
    );

/** Kısmi: verilmeyen alan mevcut değerini korur; null alanı kaldırır. */
export const socialSchema = z.object({
  instagram: socialUrl('instagram').optional(),
  facebook: socialUrl('facebook').optional(),
  youtube: socialUrl('youtube').optional(),
  tiktok: socialUrl('tiktok').optional(),
  linkedin: socialUrl('linkedin').optional(),
});

/** K-82: kısmi güncelleme; verilmeyen alan mevcut değerini korur, null (isteğe bağlı alanlar) kaldırır. */
export const seoSchema = z.object({
  siteTitle: z.string().trim().min(1).max(70).optional(),
  titleTemplate: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .refine((v) => v.includes('%s'), { message: 'Şablon sayfa başlığı için "%s" içermeli.' })
    .optional(),
  description: z.string().trim().min(1).max(170).optional(),
  keywords: nullableText(255).optional(),
  ogImageMediaId: z.uuid().nullable().optional(),
  indexable: z.boolean().optional(),
  googleAnalyticsId: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v === null || v === '' ? null : v))
    .refine((v) => v === null || /^G-[A-Z0-9]{4,12}$/.test(v), { message: 'Geçerli bir GA4 ölçüm kimliği girin (G-XXXXXXXXXX).' })
    .optional(),
  googleSiteVerification: nullableText(100)
    .refine((v) => v === null || /^[A-Za-z0-9_-]+$/.test(v), { message: 'Doğrulama kodu yalnızca harf, rakam, tire ve alt çizgi içerebilir.' })
    .optional(),
  canonicalBaseUrl: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .transform((v) => (v === null || v === '' ? null : v.replace(/\/+$/, '')))
    .refine(
      (v) => {
        if (v === null) return true;
        try {
          const u = new URL(v);
          return u.protocol === 'https:' && !u.search && !u.hash && u.pathname === '/';
        } catch {
          return false;
        }
      },
      { message: 'Taban adres https ile başlayan bir alan adı olmalı (ör. https://b2b.amisos.com).' },
    )
    .optional(),
});

export const updateSiteSchema = z.object({
  seo: seoSchema.optional(),
  announcement: nullableText(160),
  contact: contactSchema,
  social: socialSchema.optional(),
  pages: z
    .array(
      z.object({
        slug: z.enum(PAGE_SLUGS, { error: 'Bilinmeyen sayfa.' }),
        title: z.string().trim().min(1).max(80),
        body: z.string().max(20_000),
        published: z.boolean(),
      }),
    )
    .max(PAGE_SLUGS.length)
    .refine((a) => new Set(a.map((p) => p.slug)).size === a.length, { message: 'Aynı sayfa birden çok kez verilemez.' }),
});
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
