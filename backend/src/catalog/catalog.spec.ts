import { foldTr } from '../common/like.js';
import { parseDecimalText } from './decimal.js';
import { headerKey } from './import-format.js';

describe('parseDecimalText (K-59: "19,99" ve sayı)', () => {
  it('virgül, nokta, Türkçe binlik ve simgeleri kabul eder', () => {
    expect(parseDecimalText('19,99')).toBe('19.99');
    expect(parseDecimalText('19.99')).toBe('19.99');
    expect(parseDecimalText('1.234,56')).toBe('1234.56');
    expect(parseDecimalText('₺ 48,9')).toBe('48.90');
    expect(parseDecimalText('%18')).toBe('18.00');
    expect(parseDecimalText('7')).toBe('7.00');
  });

  it('geçersiz veya 2 basamaktan fazla ondalığı reddeder', () => {
    for (const v of ['', 'abc', '1,999', '-5', '1,2,3', '1,234.56', '12.']) {
      expect(parseDecimalText(v)).toBeNull();
    }
  });
});

describe('başlık ve arama normalizasyonu (K-59, K-40)', () => {
  it('headerKey Türkçe harf, boşluk, noktalama ve büyük/küçük harf duyarsızdır', () => {
    expect(headerKey('  LİSTE   Fiyatı (KDV hariç) ')).toBe(headerKey('liste fiyati kdv haric'));
    expect(headerKey('Koli içi adet')).toBe(headerKey('KOLI ICI ADET'));
  });

  it('foldTr Türkçe harfleri ASCII\'ye indirger', () => {
    expect(foldTr('ÇAY Bardağı İŞ')).toBe('cay bardagi is');
    expect(foldTr('Işık')).toBe('isik');
  });
});
