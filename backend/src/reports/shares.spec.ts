import { allocateShares } from './shares.js';

const sum = (a: number[]) => a.reduce((x, y) => Math.round((x + y) * 10) / 10, 0);

describe('allocateShares (GR-RAP-002)', () => {
  it('en büyük kalan yöntemiyle toplam tam 100,0 (üçte bir paylar)', () => {
    const shares = allocateShares(['100.00', '100.00', '100.00']);
    expect(shares).toEqual([33.4, 33.3, 33.3]);
    expect(sum(shares)).toBe(100);
  });

  it('yuvarlama toplamı 100,1 yapacak durumda da 100,0 kalır', () => {
    const shares = allocateShares(['66.50', '16.75', '16.75']);
    expect(sum(shares)).toBe(100);
  });

  it('satışı olan grup 0,0 çıkmaz: en az 0,1; toplam yine 100,0', () => {
    const shares = allocateShares(['100000.00', '1.00', '50000.00']);
    expect(shares[1]).toBe(0.1);
    expect(sum(shares)).toBe(100);
    expect(shares[0]).toBeGreaterThan(shares[2]);
  });

  it('tek grup 100; toplam sıfırsa hepsi 0', () => {
    expect(allocateShares(['12.00'])).toEqual([100]);
    expect(allocateShares(['0.00', '0.00'])).toEqual([0, 0]);
    expect(allocateShares([])).toEqual([]);
  });
});
