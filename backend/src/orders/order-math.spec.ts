import { priceLine, roundUpToCase, summarize } from './order-math.js';

describe('order-math', () => {
  it('GR-FIY-002, K-39: 12 x 48.90, %15 iskonto -> birim 41.57, satır net 498.84', () => {
    const l = priceLine(12, '48.90', '20.00', '15.00', null);
    expect(l.unitPrice).toBe('41.57');
    expect(l.lineNet).toBe('498.84');
    expect(l.lineGross).toBe('586.80');
    expect(l.lineDiscount).toBe('87.96');
    expect(l.lineVat).toBe('99.77');
  });

  it('K-13: genel ve grup oranından yüksek olan uygulanır', () => {
    expect(priceLine(1, '100.00', '20.00', '10.00', '15.00').unitPrice).toBe('85.00');
    expect(priceLine(1, '100.00', '20.00', '20.00', '15.00').unitPrice).toBe('80.00');
  });

  it('K-10: iskonto yoksa liste fiyatı, discountPercent null', () => {
    const l = priceLine(3, '10.00', '10.00', null, undefined);
    expect(l).toMatchObject({ unitPrice: '10.00', discountPercent: null, lineDiscount: '0.00', lineNet: '30.00', lineVat: '3.00' });
  });

  it('K-33, K-39: KDV satır bazında yuvarlanır; toplam satır toplamıdır (0.005 -> 0.01)', () => {
    // net 0.25 x %1 = 0.0025 -> 0.00; net 0.50 x %1 = 0.005 -> 0.01
    const a = priceLine(1, '0.25', '1.00', null, null);
    const b = priceLine(1, '0.50', '1.00', null, null);
    expect([a.lineVat, b.lineVat]).toEqual(['0.00', '0.01']);
    // üç satır 3.33 x %20: her satır 0.67 (0.666) -> toplam 2.01, tek seferde 9.99 x 0.2 = 1.998 -> 2.00
    const lines = [1, 2, 3].map(() => priceLine(1, '3.33', '20.00', null, null));
    const s = summarize(lines);
    expect(lines.map((l) => l.lineVat)).toEqual(['0.67', '0.67', '0.67']);
    expect(s.vatTotal).toBe('2.01');
    expect(s.netTotal).toBe('9.99');
    expect(s.grandTotal).toBe('12.00');
  });

  it('boş sepet toplamları 0.00', () => {
    expect(summarize([])).toEqual({
      grossTotal: '0.00', discountTotal: '0.00', netTotal: '0.00', vatTotal: '0.00', grandTotal: '0.00',
    });
  });

  it('K-21, K-44: koli katına yukarı yuvarlama', () => {
    expect(roundUpToCase(10, 12)).toBe(12);
    expect(roundUpToCase(24, 12)).toBe(24);
    expect(roundUpToCase(13, 6)).toBe(18);
  });
});
