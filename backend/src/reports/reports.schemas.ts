// Rapor girdileri. GR-RAP-001…003, K-46 – K-50. Dönem: YYYY-MM-DD (Europe/Istanbul günü), ikisi de dahil.
import { z } from 'zod';

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

const period = { from: day.optional(), to: day.optional() };
const limit = (max: number, def: number) => z.coerce.number().int().min(1).max(max).default(def);

export const periodSchema = z.object(period);
export type PeriodQuery = z.infer<typeof periodSchema>;

export const trendSchema = z.object({ months: limit(36, 12) });
export type TrendQuery = z.infer<typeof trendSchema>;

export const reportOrdersSchema = z.object({
  ...period,
  status: z.enum(['submitted', 'negotiating', 'approved', 'shipped', 'delivered', 'cancelled']).optional(),
  /** Sıralama: date (gönderim tarihi) | net (KDV hariç) | grand (genel toplam); varsayılan date desc. */
  sort: z.enum(['date', 'net', 'grand']).default('date'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: limit(100, 20),
});
export type ReportOrdersQuery = z.infer<typeof reportOrdersSchema>;

export const dealerProductsSchema = z.object({ ...period, limit: limit(100, 10) });
export type DealerProductsQuery = z.infer<typeof dealerProductsSchema>;

export const inactiveSchema = z.object({ days: limit(3650, 60) });
export type InactiveQuery = z.infer<typeof inactiveSchema>;

export const productsReportSchema = z.object({
  ...period,
  sort: z.enum(['quantity', 'net']).default('quantity'),
  limit: limit(500, 50),
});
export type ProductsReportQuery = z.infer<typeof productsReportSchema>;
