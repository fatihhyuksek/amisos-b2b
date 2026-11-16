// Site ayarları girdileri (K-73). Sayfa gövdesi düz metindir (HTML yok): kısıtlar burada.
import { z } from 'zod';
import { PAGE_SLUGS } from './site-defaults.js';

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

export const updateSiteSchema = z.object({
  announcement: nullableText(160),
  contact: contactSchema,
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
