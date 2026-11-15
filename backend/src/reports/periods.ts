// Rapor dönemleri. GR-RAP-001, K-49. Saf fonksiyonlar; günler `YYYY-MM-DD` (Europe/Istanbul günü), ikisi de dahil.
import { ISTANBUL_OFFSET_MS } from '../common/business-days.js';

export interface DayPeriod {
  from: string;
  to: string;
}

export const MAX_PERIOD_YEARS = 3;
const DAY_MS = 86_400_000;

const parse = (day: string): Date => new Date(`${day}T00:00:00Z`);
const format = (d: Date): string => d.toISOString().slice(0, 10);

/** İstanbul takvim günü (şimdi). */
export function istanbulToday(now: Date): string {
  return format(new Date(now.getTime() + ISTANBUL_OFFSET_MS));
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Varsayılan: içinde bulunulan ay (1'i → bugün). */
export function defaultPeriod(now: Date): DayPeriod {
  const today = istanbulToday(now);
  return { from: monthStart(today), to: today };
}

/** Gün sayısı (iki ucu dahil). */
export function periodLengthDays(p: DayPeriod): number {
  return Math.round((parse(p.to).getTime() - parse(p.from).getTime()) / DAY_MS) + 1;
}

/** `from` ≤ `to` ve en fazla 3 yıl; aksi hata mesajı döner. */
export function validatePeriod(p: DayPeriod): string | null {
  if (p.from > p.to) return 'Başlangıç tarihi bitişten sonra olamaz.';
  const limit = shiftYears(p.from, MAX_PERIOD_YEARS);
  if (p.to >= limit) return `Dönem en fazla ${MAX_PERIOD_YEARS} yıl olabilir.`;
  return null;
}

/** Hemen önceki eşit uzunlukta dönem. */
export function previousPeriod(p: DayPeriod): DayPeriod {
  const n = periodLengthDays(p);
  return {
    from: format(new Date(parse(p.from).getTime() - n * DAY_MS)),
    to: format(new Date(parse(p.from).getTime() - DAY_MS)),
  };
}

/** Bir tarihi yıl kadar kaydırır; hedef ayda gün yoksa ayın son gününe iner (29 Şubat → 28 Şubat). */
export function shiftYears(day: string, years: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const target = y + years;
  const lastDay = new Date(Date.UTC(target, m, 0)).getUTCDate();
  return `${String(target).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

/** Geçen yılın aynı tarihleri. */
export function lastYearPeriod(p: DayPeriod): DayPeriod {
  return { from: shiftYears(p.from, -1), to: shiftYears(p.to, -1) };
}
