/**
 * E-posta normalleştirme (K-29, GR-BAYI-004). Boşlukları kırpar, yalnızca ASCII A-Z harflerini
 * küçültür. `toLocaleLowerCase('tr')` kullanılmaz: Türkçe kuralı 'I' harfini 'ı' yapar ve
 * "INFO@FIRMA.COM" ile "info@firma.com" farklı adrese dönüşür. E-posta adresleri ASCII'dir;
 * ASCII dışı karakterler dokunulmadan kalır. Veritabanı tekilliği `lower()` ile aynı sonucu verir.
 */
export function normalizeEmail(email: string): string {
  return email.trim().replace(/[A-Z]/g, (c) => c.toLowerCase());
}
