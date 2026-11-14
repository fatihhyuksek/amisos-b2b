// Ondalık metin ayrıştırma (Excel ve API girdisi). Para/oran değerleri JavaScript sayısıyla hesaplanmaz;
// yalnızca metne çevrilir ve Money (decimal.js) ile doğrulanır.
import { Money } from '../common/money.js';

/**
 * "19,99", "19.99", "1.234,56", "₺19,99", "%18,5" gibi girdiyi "19.99" biçimine çevirir.
 * Geçersizse (veya ondalık basamak sayısı `maxScale`'i aşarsa) null.
 */
export function parseDecimalText(raw: string, maxScale = 2): string | null {
  let v = raw.replace(/\s+/g, '').replace(/₺|TL|tl|%/g, '');
  if (v.includes('.') && v.includes(',')) {
    // Türkçe biçim: nokta binlik, virgül ondalık.
    if (v.lastIndexOf(',') < v.lastIndexOf('.')) return null;
    v = v.replace(/\./g, '').replace(',', '.');
  } else {
    v = v.replace(',', '.');
  }
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const [, frac = ''] = v.split('.');
  if (frac.length > maxScale) return null;
  return new Money(v).toFixed(2);
}
