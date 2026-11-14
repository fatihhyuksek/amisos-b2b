// Bayi fiyatı hesabı. GR-FIY-001, GR-FIY-002; K-10, K-12, K-13, K-39.
// Saf fonksiyon: veritabanına dokunmaz; para hesabı yalnızca money.ts ile yapılır.
import { Money, roundMoney } from '../common/money.js';

export interface DealerPrice {
  /** İskonto sonrası birim fiyat, KDV hariç, 2 basamak. */
  price: string;
  /** Uygulanan iskonto (2 basamak); iskonto yoksa null (K-10). */
  discountPercent: string | null;
}

/**
 * İskonto = bayinin genel oranı ile ürün grubuna tanımlı oranın yükseği (K-13); ikisi de yoksa
 * iskonto yok ve standart liste fiyatı gösterilir (K-10). Yuvarlama standart, 0,005 → 0,01 (K-39).
 */
export function calculateDealerPrice(
  listPrice: string,
  generalPercent: string | null | undefined,
  groupPercent: string | null | undefined,
): DealerPrice {
  const candidates = [generalPercent, groupPercent]
    .filter((p): p is string => p !== null && p !== undefined)
    .map((p) => new Money(p))
    .filter((p) => p.gt(0));
  if (candidates.length === 0) {
    return { price: roundMoney(listPrice).toFixed(2), discountPercent: null };
  }
  const percent = candidates.reduce((a, b) => (b.gt(a) ? b : a));
  const factor = new Money(100).minus(percent).div(100);
  return {
    price: roundMoney(new Money(listPrice).times(factor)).toFixed(2),
    discountPercent: percent.toFixed(2),
  };
}
