// Istanbul takvim günü SQL yardımcıları ve "iptal hariç" satış koşulu (K-46). Raporlar, yönetim paneli ve
// analitik (K-85) aynı tanımı kullanır.
import { sql, type SQL } from 'drizzle-orm';
import type { DayPeriod } from '../reports/periods.js';

export const TZ = 'Europe/Istanbul';

export const startOf = (d: string): SQL => sql`((${d}::date)::timestamp at time zone ${TZ})`;
export const endOf = (d: string): SQL => sql`(((${d}::date + 1))::timestamp at time zone ${TZ})`;
/** `col` bu dönemde mi (Istanbul günleri, iki uç dahil). */
export const inPeriod = (col: SQL, p: DayPeriod): SQL => sql`(${col} >= ${startOf(p.from)} and ${col} < ${endOf(p.to)})`;

/** timestamptz -> ISO-8601 metni (sürücü ham sorgularda tarihi metin döndürür). */
export const isoSql = (col: SQL): SQL => sql`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Satış metriklerinde iptal edilen siparişler sayılmaz (K-46); `orders o` takma adıyla. */
export const SOLD_ORDERS: SQL = sql`o.status <> 'cancelled'`;

