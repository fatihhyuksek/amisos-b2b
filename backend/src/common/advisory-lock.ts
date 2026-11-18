// Çok örnekli çalışmada zamanlanmış işlerin tek örnekte koşması için PostgreSQL advisory lock.
import { sql } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Zamanlanmış iş kilit kimlikleri (rastgele sabitler; uygulamada benzersiz olmalı). */
export const LOCK_APPROVAL_REMINDER = 7_301_001;
export const LOCK_STALE_APPLICATIONS = 7_301_002;
/** Excel ürün içe aktarmaları art arda (eşzamanlı değil) çalışır. */
export const LOCK_PRODUCT_IMPORT = 7_301_003;
/** E-posta outbox yeniden deneme işi (dakikada bir). */
export const LOCK_NOTIFICATION_OUTBOX = 7_301_004;
/** Banner sıralama numarası yarışı (K-65). */
export const LOCK_BANNER_ORDER = 7_301_005;

/**
 * `work`'ü transaction içinde, yalnızca kilit alınabilirse çalıştırır (kilit transaction bitince
 * kendiliğinden bırakılır). Başka örnek kilidi tutuyorsa `ran: false` döner.
 */
export async function runExclusive<T>(
  db: Database,
  lockId: number,
  work: (tx: Tx) => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  return db.transaction(async (tx) => {
    const res = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${lockId}) as locked`,
    );
    if (!res.rows[0]?.locked) return { ran: false as const };
    return { ran: true as const, result: await work(tx) };
  });
}

/**
 * Bayi bazında sepet/sipariş kilidi (K-41, GR-SIP-005): sepeti değiştiren ve sipariş gönderen işlemler
 * aynı bayi için sıraya girer; transaction bitince kilit kendiliğinden bırakılır. Çift gönderimde
 * ikinci istek kilidi bekler, sepetin boşaldığını görür (EMPTY_CART) ve tek sipariş oluşur.
 * Kilit kimliği bayi id'sinden türetilir; bayiler birbirini beklemez.
 */
export async function lockDealerCart(tx: Tx, dealerId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`dealer-cart:${dealerId}`}, 0))`);
}
/** K-84: 400 günlük olay temizliği. */
export const LOCK_ANALYTICS_RETENTION = 7_301_006;
