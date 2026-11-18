// K-82: vitrin adresi (slug) üretimi. Migration 0012'deki SQL ile aynı kural:
// Türkçe harfler sadeleşir, küçük harf, harf/rakam dışı her dizi tek tire.
import { foldTr } from './like.js';

export const MAX_SLUG_LENGTH = 80;
/** Elle girilen slug biçimi: küçük harf/rakam, aralarında tek tire. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(text: string, fallback: string): string {
  const base = foldTr(text.normalize('NFC'))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return base || fallback;
}

/** `base`, `base-2`, `base-3` ... sırasıyla ilk boş olanı döner (`taken` büyük/küçük harf duyarlı küme). */
export function pickFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
