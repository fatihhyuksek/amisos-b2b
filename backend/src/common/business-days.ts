// İş günü hesabı (K-04: Admin onayı 2 iş günü içinde; geçerse hatırlatma). Saf fonksiyonlar.
// Hafta sonu (Cumartesi, Pazar) sayılmaz; resmî tatiller şimdilik sayılır (API sözleşmesi).
// Gün sınırları Europe/Istanbul'a göredir. Türkiye 2016'dan beri kalıcı UTC+3 kullanır (yaz saati
// uygulaması yok), bu yüzden sabit +3 saat farkı kullanılır; sunucu saat diliminden bağımsızdır.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Europe/Istanbul sabit UTC+3 (DST yok). */
export const ISTANBUL_OFFSET_MS = 3 * HOUR_MS;
export const BUSINESS_TIME_ZONE = 'Europe/Istanbul';

/** K-04: onay için tanınan süre. */
export const APPROVAL_DEADLINE_BUSINESS_DAYS = 2;
/** Onay süresi dolmadan uyarı verilen eşik (1 iş günü geçti). */
export const APPROVAL_WARNING_BUSINESS_DAYS = 1;

/** İstanbul duvar saatinde gün numarası (0 = Pazar). */
function istanbulWeekday(ms: number): number {
  return new Date(ms + ISTANBUL_OFFSET_MS).getUTCDay();
}

/** `from`–`to` arasında İstanbul hafta içi günlerine düşen süre (ms). `to <= from` ise 0. */
export function businessElapsedMs(from: Date, to: Date): number {
  let cursor = from.getTime();
  const end = to.getTime();
  let total = 0;
  while (cursor < end) {
    // Sonraki İstanbul gece yarısı (UTC cinsinden).
    const nextMidnight =
      Math.floor((cursor + ISTANBUL_OFFSET_MS) / DAY_MS) * DAY_MS +
      DAY_MS -
      ISTANBUL_OFFSET_MS;
    const segmentEnd = Math.min(nextMidnight, end);
    const day = istanbulWeekday(cursor);
    if (day !== 0 && day !== 6) total += segmentEnd - cursor;
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

export type ApprovalUrgency = 'ok' | 'dueSoon' | 'overdue';

/**
 * K-04 hatırlatma sınıfı: 2 iş gününü aşan 'overdue'; 1 iş gününü aşmış ama 2'yi aşmamış 'dueSoon'.
 */
export function approvalUrgency(since: Date, now: Date): ApprovalUrgency {
  if (isBusinessDaysOverdue(since, now)) return 'overdue';
  if (isBusinessDaysOverdue(since, now, APPROVAL_WARNING_BUSINESS_DAYS))
    return 'dueSoon';
  return 'ok';
}

/** Bekleyen başvuruların doğrulama zamanlarından yaklaşan/gecikmiş sayıları. */
export function countApprovalUrgency(
  verifiedAts: Date[],
  now: Date,
): { dueSoon: number; overdue: number } {
  let dueSoon = 0;
  let overdue = 0;
  for (const since of verifiedAts) {
    const u = approvalUrgency(since, now);
    if (u === 'overdue') overdue++;
    else if (u === 'dueSoon') dueSoon++;
  }
  return { dueSoon, overdue };
}
