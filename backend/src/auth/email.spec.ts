import { normalizeEmail } from './email.js';

describe('normalizeEmail (GR-BAYI-004, K-29)', () => {
  it('büyük/küçük harf farkını ve kenar boşluklarını giderir', () => {
    expect(normalizeEmail('  Info@Firma.COM ')).toBe('info@firma.com');
  });

  it("Türkçe 'I' harfi 'ı' olmaz (ASCII küçültme)", () => {
    expect(normalizeEmail('INFO@FIRMA.COM')).toBe('info@firma.com');
  });

  it('ASCII dışı karakterlere dokunmaz', () => {
    expect(normalizeEmail('İLK@firma.com')).toBe('İlk@firma.com');
  });
});
