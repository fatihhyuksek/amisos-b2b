// K-84, K-85 girdileri.
import { z } from 'zod';
import { CLIENT_EVENT_TYPES, MAX_EVENTS_PER_REQUEST, SESSION_KEY_PATTERN } from './analytics.constants.js';

/** Uygulama içi yol: "/" ile başlar ("//" hariç), kontrol karakteri yok, ≤300. */
const appPath = z
  .string()
  .max(300)
  .refine((v) => /^\/(?!\/)/.test(v) && !/[\u0000-\u001f\u007f\\]/.test(v), {
    message: 'Uygulama içi bir yol olmalı ("/" ile başlar).',
  });

const optional = <T extends z.ZodType>(s: T) => s.nullish();

export const eventSchema = z
  .object({
    type: z.enum(CLIENT_EVENT_TYPES),
    path: appPath,
    productId: optional(z.uuid()),
    groupId: optional(z.uuid()),
    query: optional(z.string().trim().min(1).max(100)),
    resultCount: optional(z.number().int().min(0).max(1_000_000)),
    quantity: optional(z.number().int().min(1).max(1_000_000)),
    referrer: optional(z.string().max(500)),
    // `at` istemci zamanı yok sayılır (sunucu zamanı kullanılır); yalnızca kabul edilir.
    at: z.unknown().optional(),
  })
  .superRefine((e, ctx) => {
    if ((e.type === 'product_view' || e.type === 'add_to_cart') && !e.productId) {
      ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Bu olay türü için productId gerekli.' });
    }
    if (e.type === 'search' && !e.query) {
      ctx.addIssue({ code: 'custom', path: ['query'], message: 'Arama olayı için query gerekli.' });
    }
  });

export const eventsBodySchema = z.object({
  sessionKey: z.string().regex(SESSION_KEY_PATTERN, 'Oturum anahtarı 16–64 karakter ([A-Za-z0-9_-]) olmalı.'),
  events: z.array(eventSchema).min(1).max(MAX_EVENTS_PER_REQUEST),
});
export type EventsBody = z.infer<typeof eventsBodySchema>;

const MAX_PERIOD_DAYS = 400;
export { MAX_PERIOD_DAYS };

const isRealDay = (v: string): boolean => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDay, { message: 'Geçerli bir tarih girin (YYYY-AA-GG).' });
const limit = (max: number, def: number) => z.coerce.number().int().min(1).max(max).default(def);

export const analyticsPeriodSchema = z.object({ from: day.optional(), to: day.optional() });
export type AnalyticsPeriodQuery = z.infer<typeof analyticsPeriodSchema>;

export const analyticsProductsSchema = z.object({
  ...analyticsPeriodSchema.shape,
  sort: z.enum(['views', 'addToCart', 'ordered']).default('views'),
  limit: limit(200, 50),
});
export type AnalyticsProductsQuery = z.infer<typeof analyticsProductsSchema>;

export const dealerActivitySchema = z.object({
  before: z.coerce.number().int().min(1).optional(),
  limit: limit(200, 50),
});
export type DealerActivityQuery = z.infer<typeof dealerActivitySchema>;
