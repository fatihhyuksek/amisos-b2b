// Sepet ve sipariş tutarları. GR-FIY-001, GR-FIY-002; K-11, K-33, K-39.
// Satır net = miktar × yuvarlanmış iskontolu birim fiyat (dealerLineNet); KDV satır bazında yuvarlanır;
// toplamlar yuvarlanmış satırların toplamıdır. Para hesabı yalnızca money.ts (Decimal) ile yapılır.
import { Money, roundMoney, sumLines } from '../common/money.js';
import { calculateDealerPrice, dealerLineNet } from '../pricing/pricing.service.js';

export interface LinePricing {
  unitPrice: string;
  listPrice: string;
  discountPercent: string | null;
  lineGross: string;
  lineDiscount: string;
  lineNet: string;
  vatRate: string;
  lineVat: string;
}

export interface OrderSummary {
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  vatTotal: string;
  grandTotal: string;
}

export function priceLine(
  quantity: number,
  listPrice: string,
  vatRate: string,
  generalPercent: string | null,
  groupPercent: string | null | undefined,
): LinePricing {
  const { price, discountPercent } = calculateDealerPrice(listPrice, generalPercent, groupPercent);
  const lineNet = dealerLineNet(quantity, listPrice, generalPercent, groupPercent);
  const lineGross = roundMoney(new Money(quantity).times(listPrice)).toFixed(2);
  const lineDiscount = new Money(lineGross).minus(lineNet).toFixed(2);
  const lineVat = roundMoney(new Money(lineNet).times(vatRate).div(100)).toFixed(2);
  return {
    unitPrice: price,
    listPrice: roundMoney(listPrice).toFixed(2),
    discountPercent,
    lineGross,
    lineDiscount,
    lineNet,
    vatRate: new Money(vatRate).toFixed(2),
    lineVat,
  };
}

export function summarize(
  lines: Pick<LinePricing, 'lineGross' | 'lineDiscount' | 'lineNet' | 'lineVat'>[],
): OrderSummary {
  const gross = sumLines(lines.map((l) => l.lineGross));
  const discount = sumLines(lines.map((l) => l.lineDiscount));
  const net = sumLines(lines.map((l) => l.lineNet));
  const vat = sumLines(lines.map((l) => l.lineVat));
  return {
    grossTotal: gross.toFixed(2),
    discountTotal: discount.toFixed(2),
    netTotal: net.toFixed(2),
    vatTotal: vat.toFixed(2),
    grandTotal: net.plus(vat).toFixed(2),
  };
}

/** Miktarı koli katına yukarı yuvarlar (K-21). */
export function roundUpToCase(quantity: number, caseQuantity: number): number {
  return Math.ceil(quantity / caseQuantity) * caseQuantity;
}
