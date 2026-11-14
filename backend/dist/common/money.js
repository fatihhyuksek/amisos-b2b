import { Decimal } from 'decimal.js';
export const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export function roundMoney(value) {
    return new Money(value).toDecimalPlaces(2, Money.ROUND_HALF_UP);
}
export function lineTotal(quantity, unitPrice, discountPercent = 0) {
    const factor = new Money(100).minus(discountPercent).div(100);
    return roundMoney(new Money(quantity).times(unitPrice).times(factor));
}
export function sumLines(lines) {
    return lines.reduce((acc, line) => acc.plus(roundMoney(line)), new Money(0));
}
//# sourceMappingURL=money.js.map