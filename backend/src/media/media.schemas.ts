import { z } from 'zod';

export const mediaListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  unused: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(40),
});
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;
