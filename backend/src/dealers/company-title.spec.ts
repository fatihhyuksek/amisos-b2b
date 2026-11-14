import { companyTitleKey, normalizeCompanyTitle } from './company-title.js';

describe('firma unvanı anahtarı (GR-BAYI-005)', () => {
  it('GR-BAYI-005: Türkçe büyük/küçük harf ve boşluk farkları aynı anahtarı verir', () => {
    const a = companyTitleKey('ÖRNEK ZÜCCACİYE LTD. ŞTİ.');
    expect(a).toBe('örnek züccaciye ltd. şti.');
    expect(companyTitleKey('Örnek Züccaciye Ltd. Şti.')).toBe(a);
    expect(companyTitleKey('  Örnek   Züccaciye\tLtd. Şti. ')).toBe(a);
  });

  it('GR-BAYI-005: I harfi ı olur, noktalama aynen kalır', () => {
    expect(companyTitleKey('IŞIK A.Ş.')).toBe('ışık a.ş.');
    expect(companyTitleKey('A.Ş.')).not.toBe(companyTitleKey('AŞ'));
  });

  it('GR-BAYI-005: normalizeCompanyTitle harf biçimini korur', () => {
    expect(normalizeCompanyTitle('  Örnek   Züccaciye ')).toBe(
      'Örnek Züccaciye',
    );
  });
});
