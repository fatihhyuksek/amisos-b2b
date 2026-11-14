// Telefon normalleştirme (GR-BAYI-001, K-35). Sonuç her zaman `0XXXXXXXXXX` (11 hane) biçimindedir.

/**
 * Boşluk, tire, parantez ve + atılır. `90` ile başlayan 12 hane ise ülke kodu atılır; baştaki 0 atılır.
 * Kalan 10 hane `[2-5]` ile başlamalı (Türkiye alan/cep kodları). Geçersizse undefined.
 */
export function normalizePhone(input: string): string | undefined {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('90')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0'))
    digits = digits.slice(1);
  if (!/^[2-5]\d{9}$/.test(digits)) return undefined;
  return `0${digits}`;
}
