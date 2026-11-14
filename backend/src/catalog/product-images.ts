// Ürün-görsel ilişkisi yardımcıları (K-40, K-62).
import { asc, inArray } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { productImages } from '../database/schema.js';
import { mediaThumbUrl, mediaUrl } from '../media/media.urls.js';

export interface ProductImageRef {
  mediaId: string;
  sortOrder: number;
}

/** Verilen ürünlerin görselleri, sıralı; tek sorgu. */
export async function loadImages(
  db: Pick<Database, 'select'>,
  productIds: string[],
): Promise<Map<string, ProductImageRef[]>> {
  const result = new Map<string, ProductImageRef[]>();
  if (productIds.length === 0) return result;
  const rows = await db
    .select({
      productId: productImages.productId,
      mediaId: productImages.mediaId,
      sortOrder: productImages.sortOrder,
    })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt), asc(productImages.id));
  for (const r of rows) {
    const list = result.get(r.productId) ?? [];
    list.push({ mediaId: r.mediaId, sortOrder: r.sortOrder });
    result.set(r.productId, list);
  }
  return result;
}

export const adminImageDto = (i: ProductImageRef) => ({
  mediaId: i.mediaId,
  url: mediaUrl(i.mediaId),
  thumbUrl: mediaThumbUrl(i.mediaId),
  sortOrder: i.sortOrder,
});
export const catalogImageDto = (i: ProductImageRef) => ({
  url: mediaUrl(i.mediaId),
  thumbUrl: mediaThumbUrl(i.mediaId),
});
