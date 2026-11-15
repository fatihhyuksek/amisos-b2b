// Bayinin genel ve grup bazlı iskonto oranları (K-12, K-13). Tek sorgu, ürün başına sorgu yok.
import { eq } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { dealerGroupDiscounts, dealers } from '../database/schema.js';

export interface DealerRates {
  general: string | null;
  byGroup: Map<string, string>;
}

export async function loadDealerRates(
  db: Pick<Database, 'select'>,
  dealerId: string,
): Promise<DealerRates> {
  const rows = await db
    .select({
      general: dealers.generalDiscountPercent,
      groupId: dealerGroupDiscounts.groupId,
      percent: dealerGroupDiscounts.discountPercent,
    })
    .from(dealers)
    .leftJoin(dealerGroupDiscounts, eq(dealerGroupDiscounts.dealerId, dealers.id))
    .where(eq(dealers.id, dealerId));
  const byGroup = new Map<string, string>();
  for (const r of rows) if (r.groupId && r.percent) byGroup.set(r.groupId, r.percent);
  return { general: rows[0]?.general ?? null, byGroup };
}
