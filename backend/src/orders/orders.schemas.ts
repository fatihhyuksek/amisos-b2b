// Sepet ve sipariş girdileri. GR-SIP-004, GR-SIP-007; K-21, K-36 – K-38.
import { z } from 'zod';
import { parseDecimalText } from '../catalog/decimal.js';

export const MAX_QUANTITY = 100_000;

export const cartItemSchema = z.object({
  quantity: z.number().int().min(0).max(MAX_QUANTITY),
});
export type CartItemInput = z.infer<typeof cartItemSchema>;

const text = (max: number) => z.string().trim().max(max);

export const submitOrderSchema = z
  .object({
    deliveryMethod: z.enum(['carrier', 'pickup', 'truck']),
    deliveryAddress: text(500).nullish(),
    carrierName: text(200).nullish(),
    carrierBranch: text(200).nullish(),
    note: text(1000).nullish(),
    /** Sepet sürümü (GET /api/cart `version`): içerik farklıysa toplam aynı olsa da 409. */
    expectedVersion: z.string().trim().min(1).max(64),
    expectedTotal: z
      .string()
      .trim()
      .max(20)
      .transform((v, ctx) => {
        const parsed = parseDecimalText(v);
        if (parsed === null) {
          ctx.addIssue({ code: 'custom', message: 'Geçerli bir tutar girin.' });
          return z.NEVER;
        }
        return parsed;
      }),
  })
  .superRefine((v, ctx) => {
    // K-38, GR-SIP-007: ambar ile teslimatta adres, ambar adı ve şube zorunlu.
    if (v.deliveryMethod !== 'carrier') return;
    for (const key of ['deliveryAddress', 'carrierName', 'carrierBranch'] as const) {
      if (!v[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Ambar ile teslimatta zorunludur.' });
    }
  })
  .transform((v) => {
    const carrier = v.deliveryMethod === 'carrier';
    return {
      deliveryMethod: v.deliveryMethod,
      // K-37: ambar dışında adres alanları yok sayılır.
      deliveryAddress: carrier ? (v.deliveryAddress ?? null) : null,
      carrierName: carrier ? (v.carrierName ?? null) : null,
      carrierBranch: carrier ? (v.carrierBranch ?? null) : null,
      note: v.note ? v.note : null,
      expectedTotal: v.expectedTotal,
      expectedVersion: v.expectedVersion,
    };
  });
export type SubmitOrderInput = z.infer<typeof submitOrderSchema>;

const paging = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
export const orderListSchema = z.object(paging);
export type OrderListQuery = z.infer<typeof orderListSchema>;

/** Takvimde var olan gün mü (2030-02-30 gibi değerler geçersiz); geçersiz tarih istisna fırlatmaz. */
const isRealDay = (v: string): boolean => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => isRealDay(v), {
    message: 'Geçerli bir tarih girin (YYYY-AA-GG).',
  });

export const adminOrderListSchema = z.object({
  status: z.enum(['submitted', 'negotiating', 'approved', 'shipped', 'delivered', 'cancelled']).optional(),
  dealerId: z.uuid().optional(),
  /** Sipariş numarası (tam eşleşme) veya bayi firma unvanı/yetkili adı içinde arama (Türkçe harf duyarsız). */
  q: z.string().trim().max(100).optional(),
  /** BizimHesap'a girildi mi: pending (girilmedi) | transferred (girildi). */
  transfer: z.enum(['pending', 'transferred']).optional(),
  from: day.optional(),
  to: day.optional(),
  ...paging,
});
export type AdminOrderListQuery = z.infer<typeof adminOrderListSchema>;

const statusValues = ['submitted', 'negotiating', 'approved', 'shipped', 'delivered', 'cancelled'] as const;

/** K-25: durum değiştirme. İptalde not (gerekçe) zorunlu. */
export const changeStatusSchema = z
  .object({
    status: z.enum(statusValues),
    note: text(1000).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'cancelled' && !v.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'İptal için gerekçe (not) zorunludur.' });
    }
  })
  .transform((v) => ({ status: v.status, note: v.note ? v.note : null }));
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

export const markTransferredSchema = z.object({
  reference: text(100).nullish().transform((v) => (v ? v : null)),
});
export type MarkTransferredInput = z.infer<typeof markTransferredSchema>;
