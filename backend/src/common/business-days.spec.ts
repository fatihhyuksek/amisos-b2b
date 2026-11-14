import {
  approvalUrgency,
  businessElapsedMs,
  countApprovalUrgency,
  isBusinessDaysOverdue,
} from './business-days.js';

// 2026-11-09 Pazartesi. Saatler Europe/Istanbul (UTC+3) duvar saatidir; test sunucu saatinden bağımsızdır.
const at = (day: number, hour = 10, minute = 0) =>
  new Date(Date.UTC(2026, 10, day, hour - 3, minute));
const MON = 9,
  WED = 11,
  THU = 12,
  FRI = 13,
  SAT = 14,
  SUN = 15,
  NEXT_MON = 16,
  NEXT_TUE = 17,
  NEXT_WED = 18;

describe('iş günü hesabı (K-04)', () => {
  it('K-04: hafta içi 2 gün dolmadan gecikmiş sayılmaz', () => {
    expect(isBusinessDaysOverdue(at(MON), at(WED, 9))).toBe(false);
  });

  it('K-04: tam 2 iş günü dolunca henüz gecikmiş sayılmaz, aşılınca sayılır', () => {
    expect(isBusinessDaysOverdue(at(MON), at(WED))).toBe(false);
    expect(isBusinessDaysOverdue(at(MON), at(WED, 10, 1))).toBe(true);
  });

  it('K-04: Cuma doğrulanan başvuru Salı 10:00 e kadar gecikmiş sayılmaz', () => {
    expect(isBusinessDaysOverdue(at(FRI), at(SAT))).toBe(false);
    expect(isBusinessDaysOverdue(at(FRI), at(NEXT_MON))).toBe(false);
    expect(isBusinessDaysOverdue(at(FRI), at(NEXT_TUE))).toBe(false);
    expect(isBusinessDaysOverdue(at(FRI), at(NEXT_TUE, 10, 1))).toBe(true);
  });

  it('K-04: Cumartesi doğrulanan başvuru Pazartesi 00:00 dan itibaren sayılır', () => {
    expect(isBusinessDaysOverdue(at(SAT), at(NEXT_TUE, 23))).toBe(false);
    expect(isBusinessDaysOverdue(at(SAT), at(NEXT_WED, 0, 1))).toBe(true);
  });

  it('K-04: hafta sonu süreye eklenmez', () => {
    expect(businessElapsedMs(at(SAT), at(SUN, 23))).toBe(0);
    // Perşembe 10:00 -> Pazartesi 10:00: 14 saat + Cuma 24 saat + Pazartesi 10 saat
    expect(businessElapsedMs(at(THU), at(NEXT_MON))).toBe(48 * 3600_000);
  });

  it('K-04: geçmişteki saat için 0', () => {
    expect(businessElapsedMs(at(WED), at(MON))).toBe(0);
  });

  it('K-04: hafta sonu sınırı İstanbul saatine göredir (UTC Cuma 22:00 = İstanbul Cumartesi 01:00)', () => {
    const utcFriday22 = new Date(Date.UTC(2026, 10, 13, 22, 0));
    // İstanbul'da Cumartesi 01:00 -> hafta sonu: Pazartesi 00:00'a kadar süre işlemez.
    expect(businessElapsedMs(utcFriday22, at(NEXT_MON, 0, 0))).toBe(0);
    expect(isBusinessDaysOverdue(utcFriday22, at(NEXT_WED, 0, 0))).toBe(false);
    expect(isBusinessDaysOverdue(utcFriday22, at(NEXT_WED, 0, 1))).toBe(true);
    // UTC Pazar 22:00 = İstanbul Pazartesi 01:00 -> Pazartesi sayılır.
    const utcSunday22 = new Date(Date.UTC(2026, 10, 15, 22, 0));
    expect(businessElapsedMs(utcSunday22, at(NEXT_MON, 2, 0))).toBe(3600_000);
  });

  it('K-04: yaklaşan (1 iş günü geçti) ve gecikmiş sınıflandırması', () => {
    expect(approvalUrgency(at(MON), at(MON, 20))).toBe('ok');
    expect(approvalUrgency(at(MON), at(MON + 1, 10))).toBe('ok'); // tam 1 gün
    expect(approvalUrgency(at(MON), at(MON + 1, 10, 1))).toBe('dueSoon');
    expect(approvalUrgency(at(MON), at(WED, 10))).toBe('dueSoon');
    expect(approvalUrgency(at(MON), at(WED, 10, 1))).toBe('overdue');
    // Cuma doğrulanan: Pazartesi 10:01 yaklaşan, Salı 10:01 gecikmiş
    expect(approvalUrgency(at(FRI), at(NEXT_MON, 10, 1))).toBe('dueSoon');
    expect(approvalUrgency(at(FRI), at(NEXT_TUE, 10, 1))).toBe('overdue');
  });

  it('K-04: countApprovalUrgency sayıları ayırır', () => {
    const now = at(WED, 12);
    expect(
      countApprovalUrgency([at(MON), at(MON + 1), at(WED, 9), at(MON, 5)], now),
    ).toEqual({ dueSoon: 1, overdue: 2 });
  });
});
