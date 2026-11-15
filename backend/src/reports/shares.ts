// Grup payı yüzdeleri. Saf fonksiyon.
import { Money } from '../common/money.js';

/**
 * Grup payları (%, 1 basamak): en büyük kalan yöntemiyle toplam tam 100,0. Satışı olup 0,0 yuvarlanacak grup en az
 * 0,1 alır (farkı en büyük paydan düşer). Toplam sıfırsa hepsi 0.
 */
export function allocateShares(nets: string[]): number[] {
  const values = nets.map((n) => new Money(n));
  const total = values.reduce((a, v) => a.plus(v), new Money(0));
  if (total.isZero()) return nets.map(() => 0);
  const exact = values.map((v) => v.div(total).times(1000)); // binde (onda bir yüzde)
  const tenths = exact.map((e) => e.floor().toNumber());
  let remainder = 1000 - tenths.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e.minus(e.floor()) }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    tenths[i] += 1;
    remainder -= 1;
  }
  // Satışı olan hiçbir grup 0,0 görünmesin.
  for (const [i, v] of values.entries()) {
    if (v.gt(0) && tenths[i] === 0) {
      const biggest = tenths.indexOf(Math.max(...tenths));
      tenths[biggest] -= 1;
      tenths[i] = 1;
    }
  }
  return tenths.map((t) => t / 10);
}
