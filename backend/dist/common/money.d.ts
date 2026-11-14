import { Decimal } from 'decimal.js';
export declare const Money: typeof Decimal;
export type MoneyValue = InstanceType<typeof Money>;
export declare function roundMoney(value: Decimal.Value): MoneyValue;
export declare function lineTotal(quantity: Decimal.Value, unitPrice: Decimal.Value, discountPercent?: Decimal.Value): MoneyValue;
export declare function sumLines(lines: Decimal.Value[]): MoneyValue;
