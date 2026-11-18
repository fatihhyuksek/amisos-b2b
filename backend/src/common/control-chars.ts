/** Kontrol karakteri (U+0000–U+001F, U+007F) veya ters eğik çizgi içerir mi (yol/bağlantı doğrulamasında). */
export function hasControlOrBackslash(v: string): boolean {
  for (let i = 0; i < v.length; i += 1) {
    const c = v.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || c === 0x5c) return true;
  }
  return false;
}
