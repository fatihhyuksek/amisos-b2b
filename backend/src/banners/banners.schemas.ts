// Banner girdileri. K-65: bağlantı yalnızca uygulama içi yoldur (açık yönlendirme yok).
import { z } from 'zod';

/** "/" ile başlar; "//", ters eğik çizgi, boşluk ve şema yok. Veritabanındaki check ile aynı kural. */
export const INTERNAL_PATH = /^\/([^/\\\s][^\\\s]*)?$/;

const linkPath = z
  .string()
  .trim()
  .max(500)
  .regex(INTERNAL_PATH, { message: 'Bağlantı "/" ile başlayan uygulama içi bir yol olmalı.' })
  .nullable();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === null || v === '' ? null : v));
const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v)).nullable();

const fields = {
  mediaId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  subtitle: optionalText(300),
  linkPath: linkPath.transform((v) => (v === '' ? null : v)),
  isActive: z.boolean(),
  startsAt: instant,
  endsAt: instant,
};

const period = (v: { startsAt?: Date | null; endsAt?: Date | null }, ctx: z.RefinementCtx) => {
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Bitiş, başlangıçtan sonra olmalı.' });
  }
};

export const createBannerSchema = z
  .object({
    mediaId: fields.mediaId,
    title: fields.title,
    subtitle: fields.subtitle.optional(),
    linkPath: fields.linkPath.optional(),
    isActive: fields.isActive.default(true),
    startsAt: fields.startsAt.optional(),
    endsAt: fields.endsAt.optional(),
  })
  .superRefine(period);
export type CreateBannerInput = z.infer<typeof createBannerSchema>;

export const updateBannerSchema = z
  .object({
    mediaId: fields.mediaId.optional(),
    title: fields.title.optional(),
    subtitle: fields.subtitle.optional(),
    linkPath: fields.linkPath.optional(),
    isActive: fields.isActive.optional(),
    startsAt: fields.startsAt.optional(),
    endsAt: fields.endsAt.optional(),
  })
  .superRefine(period);
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;

export const reorderBannersSchema = z.object({
  ids: z
    .array(z.uuid())
    .max(500)
    .refine((a) => new Set(a).size === a.length, { message: 'Aynı banner birden çok kez verilemez.' }),
});
export type ReorderBannersInput = z.infer<typeof reorderBannersSchema>;
