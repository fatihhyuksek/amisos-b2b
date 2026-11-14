// Firma unvanı normalleştirme (GR-BAYI-005). Saf fonksiyonlar.

/** İç boşlukları tek boşluğa indirir, baş/son boşluğu kırpar. Noktalama ve harf biçimi korunur. */
export function normalizeCompanyTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ');
}

/**
 * Tekillik anahtarı: Türkçe yerelle küçültme ('İ'->'i', 'I'->'ı') + boşluk sadeleştirme.
 * Migration 0003'teki SQL ile birebir aynı sonucu vermelidir (test: company-title e2e).
 */
export function companyTitleKey(title: string): string {
  return normalizeCompanyTitle(title).toLocaleLowerCase('tr-TR');
}
