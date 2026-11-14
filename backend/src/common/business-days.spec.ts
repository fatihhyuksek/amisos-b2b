import { businessElapsedMs, isBusinessDaysOverdue } from './business-days.js';

// 2026-11-09 Pazartesi. Yerel saat kullanılır; test saat diliminden bağımsızdır.
const at = (day: number, hour = 10, minute = 0) =>
  new Date(2026, 10, day, hour, minute);
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
});
