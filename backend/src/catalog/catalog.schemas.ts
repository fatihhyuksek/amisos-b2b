// Katalog girdileri. GR-URN-001…003; K-14 – K-16, K-30 – K-32, K-60.
import { z } from 'zod';
import { Money } from '../common/money.js';
import { normalizeCompanyTitle } from '../dealers/company-title.js';
import { SLUG_PATTERN } from '../common/slug.js';
import { parseDecimalText } from './decimal.js';

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === null || v === '' ? null : v));

const moneyText = z
  .string()
  .trim()
  .max(20)
  .transform((v, ctx) => {
    const parsed = parseDecimalText(v);
    if (parsed === null || parsed.length > 15) {
      ctx.addIssue({ code: 'custom', message: 'Geçerli bir tutar girin (en fazla 2 ondalık).' });
      return z.NEVER;
    }
    return parsed;
  });

const vatText = z
  .string()
  .trim()
  .max(10)
  .transform((v, ctx) => {
    const parsed = parseDecimalText(v);
    if (parsed === null || new Money(parsed).gte(100)) {
      ctx.addIssue({ code: 'custom', message: 'KDV oranı 0 ile 99,99 arasında olmalı.' });
      return z.NEVER;
    }
    return parsed;
  });

const stock = z.enum(['in_stock', 'out_of_stock']);
const mediaIds = z.array(z.uuid()).max(30).refine((a) => new Set(a).size === a.length, {
  message: 'Aynı görsel birden çok kez seçilemez.',
});

/** K-82: vitrin adresi; küçük harf/rakam ve tire. */
const slugText = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(SLUG_PATTERN, 'Adres yalnızca küçük harf, rakam ve tire içerebilir (ör. cay-bardagi).');

export const groupName = z.string().max(100).transform(normalizeCompanyTitle).pipe(z.string().min(1));
const sortOrder = z.number().int().min(-100_000).max(100_000);

export const createGroupSchema = z.object({
  name: groupName,
  slug: slugText.optional(),
  seoTitle: optionalText(70).optional(),
  seoDescription: optionalText(170).optional(),
  description: optionalText(1000).optional(),
  sortOrder: sortOrder.default(0),
});
export const updateGroupSchema = z.object({
  name: groupName.optional(),
  slug: slugText.optional(),
  seoTitle: optionalText(70).optional(),
  seoDescription: optionalText(170).optional(),
  description: optionalText(1000).optional(),
  sortOrder: sortOrder.optional(),
  isActive: z.boolean().optional(),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const createProductSchema = z.object({
  groupId: z.uuid(),
  barcode: trimmed(64),
  code: optionalText(64).optional(),
  bizimhesapId: optionalText(100).optional(),
  slug: slugText.optional(),
  seoTitle: optionalText(70).optional(),
  seoDescription: optionalText(170).optional(),
  name: trimmed(300),
  description: optionalText(4000).optional(),
  caseQuantity: z.number().int().min(1).max(1_000_000),
  listPrice: moneyText,
  vatRate: vatText.default('20.00'),
  stockStatus: stock.default('in_stock'),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  mediaIds: mediaIds.optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

/** K-78: kopyada barkod zorunlu (boş olamaz ve tekil), kod isteğe bağlı. */
export const duplicateProductSchema = z.object({
  barcode: trimmed(64),
  code: optionalText(64).optional(),
});
export type DuplicateProductInput = z.infer<typeof duplicateProductSchema>;

export const updateProductSchema = z.object({
  groupId: z.uuid().optional(),
  barcode: trimmed(64).optional(),
  code: optionalText(64).optional(),
  bizimhesapId: optionalText(100).optional(),
  slug: slugText.optional(),
  seoTitle: optionalText(70).optional(),
  seoDescription: optionalText(170).optional(),
  name: trimmed(300).optional(),
  description: optionalText(4000).optional(),
  caseQuantity: z.number().int().min(1).max(1_000_000).optional(),
  listPrice: moneyText.optional(),
  vatRate: vatText.optional(),
  stockStatus: stock.optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  mediaIds: mediaIds.optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** `?featured=true` biçimli isteğe bağlı bayrak; yalnızca "true" etkindir. */
const boolFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

const paging = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
};

export const adminProductListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  groupId: z.uuid().optional(),
  stock: stock.optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  featured: boolFlag,
  /** K-79: aktif ve liste fiyatı 0 olan ürünler. */
  priceMissing: boolFlag,
  ...paging,
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminProductListQuery = z.infer<typeof adminProductListSchema>;

export const catalogListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  groupId: z.uuid().optional(),
  stock: z.enum(['in_stock']).optional(),
  // K-66: price_* oturumsuzken isme göre sıralanır (servis katmanı).
  // K-86: popular = son 90 günde satış adedi azalan (iptal hariç), eşitlikte ad.
  sort: z.enum(['name', 'newest', 'price_asc', 'price_desc', 'popular']).default('name'),
  featured: boolFlag,
  new: boolFlag,
  // K-86: virgülle ayrılmış ürün kimlikleri (≤24); verilen sırayla döner, pasifler atlanır.
  ids: z
    .string()
    .transform((v) => [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))])
    .pipe(z.array(z.uuid()).min(1).max(24))
    .optional(),
  ...paging,
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type CatalogListQuery = z.infer<typeof catalogListSchema>;

export const highlightsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(12),
});
export type HighlightsQuery = z.infer<typeof highlightsSchema>;

export const importQuerySchema = z.object({
  dryRun: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

/** K-12, K-13: 0 < oran < 100, en fazla 2 ondalık. */
export const groupDiscountsSchema = z.object({
  items: z
    .array(
      z.object({
        groupId: z.uuid(),
        discountPercent: z
          .string()
          .trim()
          .max(10)
          .transform((v, ctx) => {
            const parsed = parseDecimalText(v);
            if (parsed === null || Number(parsed) <= 0 || new Money(parsed).gte(100)) {
              ctx.addIssue({
                code: 'custom',
                message: 'Oran 0 ile 100 arasında olmalı (en fazla 2 ondalık).',
              });
              return z.NEVER;
            }
            return parsed;
          }),
      }),
    )
    .max(500)
    .refine((a) => new Set(a.map((i) => i.groupId)).size === a.length, {
      message: 'Aynı grup birden çok kez verilemez.',
    }),
});
export type GroupDiscountsInput = z.infer<typeof groupDiscountsSchema>;

/** K-75: toplu işlem. `set_group` için `groupId` zorunlu. */
export const bulkProductsSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(500),
    action: z.enum(['activate', 'deactivate', 'in_stock', 'out_of_stock', 'feature', 'unfeature', 'set_group']),
    groupId: z.uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === 'set_group' && !v.groupId) {
      ctx.addIssue({ code: 'custom', path: ['groupId'], message: 'Grup seçimi zorunludur.' });
    }
  })
  .transform((v) => ({ ...v, ids: [...new Set(v.ids)] }));
export type BulkProductsInput = z.infer<typeof bulkProductsSchema>;
