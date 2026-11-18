import { pickFreeSlug, slugify } from './slug.js';

describe('slugify (K-82)', () => {
  it('Türkçe karakterleri sadeleştirir', () => {
    expect(slugify("Çay Bardağı 6'lı Şık İnci", 'urun')).toBe('cay-bardagi-6-li-sik-inci');
    expect(slugify('IŞIK ÜRÜN', 'urun')).toBe('isik-urun');
  });
  it('boş sonuçta yedek kullanır, uzunluğu sınırlar', () => {
    expect(slugify('!!!', 'urun')).toBe('urun');
    expect(slugify('a'.repeat(200), 'urun').length).toBe(80);
  });
  it('çakışmada -2, -3 ekler', () => {
    expect(pickFreeSlug('tabak', new Set())).toBe('tabak');
    expect(pickFreeSlug('tabak', new Set(['tabak']))).toBe('tabak-2');
    expect(pickFreeSlug('tabak', new Set(['tabak', 'tabak-2']))).toBe('tabak-3');
  });
});
