// K-82: ürün ve grup slug tahsisi. Otomatik slug canlı slug'larla ve başka ürünlerin eski (yönlendirme) slug'larıyla
// çakışmaz; çakışmada -2, -3 eklenir. Elle verilen slug başka bir canlı slug'la çakışırsa 409 (DUPLICATE_SLUG);
// başka bir ürünün eski slug'ıyla çakışırsa canlı slug kazanır ve o yönlendirme silinir.
import { and, eq, like, ne, or } from 'drizzle-orm';
import { escapeLike } from '../common/like.js';
import { pickFreeSlug, slugify } from '../common/slug.js';
import type { Database } from '../database/database.module.js';
import { productGroups, productSlugRedirects, products } from '../database/schema.js';

type Reader = Pick<Database, 'select'>;

export async function allocateProductSlug(db: Reader, name: string, excludeProductId?: string): Promise<string> {
  const base = slugify(name, 'urun');
  const pattern = `${escapeLike(base)}-%`;
  const live = await db
    .select({ slug: products.slug })
    .from(products)
    .where(
      and(
        or(eq(products.slug, base), like(products.slug, pattern)),
        excludeProductId ? ne(products.id, excludeProductId) : undefined,
      ),
    );
  const old = await db
    .select({ slug: productSlugRedirects.slug })
    .from(productSlugRedirects)
    .where(
      and(
        or(eq(productSlugRedirects.slug, base), like(productSlugRedirects.slug, pattern)),
        excludeProductId ? ne(productSlugRedirects.productId, excludeProductId) : undefined,
      ),
    );
  return pickFreeSlug(base, new Set([...live, ...old].map((r) => r.slug)));
}

/** Toplu içe aktarma için: tüm canlı ve eski ürün slug'ları (bellekte tahsis, ürün başına sorgu yok). */
export async function loadTakenProductSlugs(db: Reader): Promise<Set<string>> {
  const live = await db.select({ slug: products.slug }).from(products);
  const old = await db.select({ slug: productSlugRedirects.slug }).from(productSlugRedirects);
  return new Set([...live, ...old].map((r) => r.slug));
}

export async function allocateGroupSlug(db: Reader, name: string, excludeGroupId?: string): Promise<string> {
  const base = slugify(name, 'grup');
  const rows = await db
    .select({ slug: productGroups.slug })
    .from(productGroups)
    .where(
      and(
        or(eq(productGroups.slug, base), like(productGroups.slug, `${escapeLike(base)}-%`)),
        excludeGroupId ? ne(productGroups.id, excludeGroupId) : undefined,
      ),
    );
  return pickFreeSlug(base, new Set(rows.map((r) => r.slug)));
}

