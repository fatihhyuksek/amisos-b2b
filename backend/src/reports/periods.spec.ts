import {
  defaultPeriod,
  istanbulToday,
  lastYearPeriod,
  periodLengthDays,
  previousPeriod,
  shiftYears,
  validatePeriod,
} from './periods.js';

describe('rapor dönemleri (K-49)', () => {
  it('önceki dönem: eşit uzunlukta, hemen öncesi; ay sonu ve 1 günlük dönem', () => {
    expect(previousPeriod({ from: '2026-11-01', to: '2026-11-30' })).toEqual({ from: '2026-10-02', to: '2026-10-31' });
    expect(previousPeriod({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-01-29', to: '2026-02-28' });
    expect(previousPeriod({ from: '2026-11-15', to: '2026-11-15' })).toEqual({ from: '2026-11-14', to: '2026-11-14' });
    expect(previousPeriod({ from: '2026-01-01', to: '2026-01-01' })).toEqual({ from: '2025-12-31', to: '2025-12-31' });
    expect(periodLengthDays({ from: '2026-11-01', to: '2026-11-30' })).toBe(30);
    expect(periodLengthDays({ from: '2026-11-15', to: '2026-11-15' })).toBe(1);
  });

  it('geçen yıl: aynı tarihler; 29 Şubat -> 28 Şubat; yıl dönümü', () => {
    expect(lastYearPeriod({ from: '2026-11-01', to: '2026-11-15' })).toEqual({ from: '2025-11-01', to: '2025-11-15' });
    expect(lastYearPeriod({ from: '2024-02-29', to: '2024-02-29' })).toEqual({ from: '2023-02-28', to: '2023-02-28' });
    expect(lastYearPeriod({ from: '2024-02-01', to: '2024-03-31' })).toEqual({ from: '2023-02-01', to: '2023-03-31' });
    expect(lastYearPeriod({ from: '2025-12-15', to: '2026-01-15' })).toEqual({ from: '2024-12-15', to: '2025-01-15' });
    expect(shiftYears('2023-02-28', 1)).toBe('2024-02-28');
    expect(shiftYears('2024-02-29', 4)).toBe('2028-02-29');
  });

  it('varsayılan dönem: ayın 1 i -> bugün (İstanbul günü; UTC gece yarısına yakın saat)', () => {
    expect(defaultPeriod(new Date('2026-11-14T10:00:00Z'))).toEqual({ from: '2026-11-01', to: '2026-11-14' });
    // 2026-11-30 22:30 UTC = 2026-12-01 01:30 İstanbul.
    expect(istanbulToday(new Date('2026-11-30T22:30:00Z'))).toBe('2026-12-01');
    expect(defaultPeriod(new Date('2026-11-30T22:30:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-01' });
  });

  it('doğrulama: from > to ve 3 yıldan uzun dönem reddedilir', () => {
    expect(validatePeriod({ from: '2026-11-02', to: '2026-11-01' })).toMatch(/sonra/);
    expect(validatePeriod({ from: '2026-11-01', to: '2026-11-01' })).toBeNull();
    expect(validatePeriod({ from: '2023-11-15', to: '2026-11-14' })).toBeNull();
    expect(validatePeriod({ from: '2023-11-15', to: '2026-11-15' })).toMatch(/3 yıl/);
    expect(validatePeriod({ from: '2020-01-01', to: '2026-11-01' })).toMatch(/3 yıl/);
  });
});
