import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

/** LIKE joker karakterlerini (% _ \) kaçırır; kullanıcı girdisi desen olarak yorumlanmaz. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const FOLD_FROM = 'İIıÇçĞğÖöŞşÜü';
const FOLD_TO = 'iiiccggoossuu';
const FOLD_MAP = new Map(Array.from(FOLD_FROM, (c, i) => [c, FOLD_TO[i]]));

/** Arama için Türkçe harfleri ASCII'ye indirger ve küçültür ("Çay", "ÇAY", "cay" aynı olur). */
export function foldTr(value: string): string {
  return Array.from(value, (c) => FOLD_MAP.get(c) ?? c).join('').toLowerCase();
}

/** `foldTr`'nin SQL karşılığı (veritabanı yerelinden bağımsız). */
export function foldSql(column: SQL | AnyColumn): SQL {
  return sql`lower(translate(${column}, ${FOLD_FROM}, ${FOLD_TO}))`;
}
