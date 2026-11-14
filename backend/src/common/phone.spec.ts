import { normalizePhone } from './phone.js';

describe('telefon normalleştirme (K-35)', () => {
  it('K-35: farklı yazımlar 0XXXXXXXXXX olur', () => {
    expect(normalizePhone('0532 123 45 67')).toBe('05321234567');
    expect(normalizePhone('+90 532 123 45 67')).toBe('05321234567');
    expect(normalizePhone('(0532) 123-45-67')).toBe('05321234567');
    expect(normalizePhone('532 123 45 67')).toBe('05321234567');
    expect(normalizePhone('905321234567')).toBe('05321234567');
    expect(normalizePhone('0352 222 33 44')).toBe('03522223344');
  });

  it('K-35: geçersiz değerler reddedilir', () => {
    expect(normalizePhone('12345678901')).toBeUndefined();
    expect(normalizePhone('123')).toBeUndefined();
    expect(normalizePhone('0132 123 45 67')).toBeUndefined(); // [2-5] ile başlamıyor
    expect(normalizePhone('0632 123 45 67')).toBeUndefined();
    expect(normalizePhone('5321234')).toBeUndefined();
    expect(normalizePhone('+1 532 123 45 67 89')).toBeUndefined();
    expect(normalizePhone('')).toBeUndefined();
  });
});
