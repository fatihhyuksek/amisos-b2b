// K-73 / GR-KVK-001: onay kaydında KVKK ve koşul metninin O ANKİ sürümü saklanır.
// Sürüm, sayfa gövdesi her değiştiğinde 1 artar (`v1`, `v2` ...); değişmemiş kayıt/varsayılan = v1.
import { inArray } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { siteSettings } from '../database/schema.js';

export const consentVersionLabel = (n: number): string => `v${n}`;

/** Sayfa değerinden sürüm numarası (kayıtta yoksa 1). */
export const pageVersionOf = (value: unknown): number => {
  const v = (value as { version?: unknown } | null)?.version;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : 1;
};

/** Yeni onaylar için geçerli KVKK ve kullanım koşulları sürümleri. */
export async function currentConsentVersions(
  db: Pick<Database, 'select'>,
): Promise<{ kvkk: string; terms: string }> {
  const rows = await db
    .select()
    .from(siteSettings)
    .where(inArray(siteSettings.key, ['page:kvkk', 'page:kullanim-kosullari']));
  const of = (key: string) => consentVersionLabel(pageVersionOf(rows.find((r) => r.key === key)?.value));
  return { kvkk: of('page:kvkk'), terms: of('page:kullanim-kosullari') };
}
