import { lineNetFromUnitPrice, lineTotal, Money, roundMoney, sumLines } from './money.js';

describe('money', () => {
  it('yarımları yukarı yuvarlar (K-39)', () => {
    expect(roundMoney('0.005').toFixed(2)).toBe('0.01');
    expect(roundMoney('1.004').toFixed(2)).toBe('1.00');
    expect(roundMoney('2.675').toFixed(2)).toBe('2.68');
  });

  it('kayan nokta hatası yapmaz', () => {
    expect(new Money('0.1').plus('0.2').toString()).toBe('0.3');
  });

  it('satır tutarını iskontoyla hesaplar', () => {
    // 12 adet × 19,99 TL, %15 iskonto = 203,898 → 203,90
    expect(lineTotal(12, '19.99', 15).toFixed(2)).toBe('203.90');
    expect(lineTotal(24, '10.00').toFixed(2)).toBe('240.00');
  });

  it('toplamı yuvarlanmış satırlardan alır', () => {
    expect(sumLines(['0.005', '0.005']).toFixed(2)).toBe('0.02');
  });
});

describe('lineNetFromUnitPrice', () => {
  it('miktar × birim fiyat, 2 basamak', () => {
    expect(lineNetFromUnitPrice(12, '41.57').toFixed(2)).toBe('498.84');
    expect(lineNetFromUnitPrice(3, '0.335').toFixed(2)).toBe('1.01');
  });
});
