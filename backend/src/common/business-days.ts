// İş günü hesabı (K-04: Admin onayı 2 iş günü içinde; geçerse hatırlatma). Saf fonksiyonlar.
// Hafta sonu (Cumartesi, Pazar) sayılmaz; resmî tatiller şimdilik sayılır (API sözleşmesi).
// Gün sınırları sunucunun yerel saatine göredir.

const DAY_MS = 24 * 60 * 60 * 1000;

/** K-04: onay için tanınan süre. */
export const APPROVAL_DEADLINE_BUSINESS_DAYS = 2;

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** `from`–`to` arasında hafta içi günlere düşen süre (ms). `to <= from` ise 0. */
export function businessElapsedMs(from: Date, to: Date): number {
  let cursor = from.getTime();
  const end = to.getTime();
  let total = 0;
  while (cursor < end) {
    const current = new Date(cursor);
    const nextMidnight = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate() + 1,
    ).getTime();
    const segmentEnd = Math.min(nextMidnight, end);
    if (!isWeekend(current)) total += segmentEnd - cursor;
    cursor = segmentEnd;
  }
  return total;
}

/**
 * `since` anından beri `businessDays` iş günü (24 saatlik hafta içi süre) geçtiyse true.
 * Tam süre dolunca henüz gecikmiş sayılmaz; yalnızca aşılınca sayılır.
 * Örnek: Cuma 10:00'da doğrulanan başvuru Salı 10:00'a kadar gecikmemiştir.
 */
export function isBusinessDaysOverdue(
  since: Date,
  now: Date,
  businessDays: number = APPROVAL_DEADLINE_BUSINESS_DAYS,
): boolean {
  return businessElapsedMs(since, now) > businessDays * DAY_MS;
}
