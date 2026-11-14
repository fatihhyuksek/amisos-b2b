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
    };
  });
export type SubmitOrderInput = z.infer<typeof submitOrderSchema>;

const paging = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
export const orderListSchema = z.object(paging);
export type OrderListQuery = z.infer<typeof orderListSchema>;

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, {
    message: 'Geçerli bir tarih girin (YYYY-AA-GG).',
  });

export const adminOrderListSchema = z.object({
  status: z.enum(['submitted', 'negotiating', 'approved', 'shipped', 'delivered', 'cancelled']).optional(),
  dealerId: z.uuid().optional(),
  from: day.optional(),
  to: day.optional(),
  ...paging,
});
export type AdminOrderListQuery = z.infer<typeof adminOrderListSchema>;
