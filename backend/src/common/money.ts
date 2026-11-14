import { Decimal } from 'decimal.js';

// Para hesapları için ayrı bir Decimal örneği: JavaScript sayılarındaki
// kayan nokta hataları (0.1 + 0.2) tutarlara karışmaz.
export const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type MoneyValue = InstanceType<typeof Money>;

/** Tutarı 2 ondalık basamağa standart yuvarlar (K-39: 0,005 → 0,01). */
export function roundMoney(value: Decimal.Value): MoneyValue {
  return new Money(value).toDecimalPlaces(2, Money.ROUND_HALF_UP);
}

/** Satır tutarı = miktar × birim fiyat × (1 − iskonto/100), 2 basamağa yuvarlanmış. */
export function lineTotal(
  quantity: Decimal.Value,
  unitPrice: Decimal.Value,
  discountPercent: Decimal.Value = 0,
): MoneyValue {
  const factor = new Money(100).minus(discountPercent).div(100);
  return roundMoney(new Money(quantity).times(unitPrice).times(factor));
}

/** Sipariş toplamı = yuvarlanmış satır tutarlarının toplamı (GR-FIY-002). */
export function sumLines(lines: Decimal.Value[]): MoneyValue {
  return lines.reduce<MoneyValue>((acc, line) => acc.plus(roundMoney(line)), new Money(0));
}
