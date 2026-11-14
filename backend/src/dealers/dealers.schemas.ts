// Bayi başvuru ve yönetim girdileri (GR-BAYI-001…008, GR-KVK-001; K-35, K-12, K-43).
import { z } from 'zod';
import { normalizeEmail } from '../auth/email.js';
import { normalizeCompanyTitle } from './company-title.js';
import { normalizePhone } from '../common/phone.js';
import { Money } from '../common/money.js';

const email = z.string().max(254).transform(normalizeEmail).pipe(z.email());
const text = (max: number) => z.string().trim().min(1).max(max);

/** K-35: `0XXXXXXXXXX` biçimine normalize edilir (bkz. normalizePhone). */
const phone = z
  .string()
  .max(40)
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: 'Geçerli bir telefon numarası girin.',
      });
      return z.NEVER;
    }
    return normalized;
  });

const dealerFields = {
  companyTitle: z
    .string()
    .max(200)
    .transform(normalizeCompanyTitle)
    .pipe(z.string().min(1)),
  contactName: text(200),
  email,
  phone,
  city: text(100),
  district: text(100),
  address: text(500),
};

export const applicationSchema = z.object({
  ...dealerFields,
  // GR-KVK-001: KVKK ve kullanım koşulları onayı zorunlu.
  consents: z.object({
    kvkk: z.literal(true, { error: 'KVKK onayı zorunludur.' }),
    terms: z.literal(true, { error: 'Kullanım koşulları onayı zorunludur.' }),
    marketing: z.boolean().optional().default(false),
  }),
});
export type ApplicationInput = z.infer<typeof applicationSchema>;

export const createDealerSchema = z.object(dealerFields);
export type DealerFieldsInput = z.infer<typeof createDealerSchema>;

export const dealerStatusSchema = z.enum([
  'pending_email',
  'pending_approval',
  'active',
  'rejected',
  'passive',
]);

export const listQuerySchema = z.object({
  status: dealerStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const reasonRequiredSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});
export const reasonOptionalSchema = z
  .object({ reason: z.string().trim().max(1000).optional() })
  .default({});

/** K-12, K-43: 0 < oran < 100, en fazla 2 ondalık; null iskontoyu kaldırır. */
export const termsSchema = z.object({
  generalDiscountPercent: z
    .union([z.string().trim(), z.null()])
    .refine(
      (v) => {
        if (v === null) return true;
        if (!/^\d{1,3}(\.\d{1,2})?$/.test(v)) return false;
        const n = new Money(v);
        return n.gt(0) && n.lt(100);
      },
      { message: 'Oran 0 ile 100 arasında olmalı (en fazla 2 ondalık).' },
    )
    .transform((v) => (v === null ? null : new Money(v).toFixed(2))),
});
