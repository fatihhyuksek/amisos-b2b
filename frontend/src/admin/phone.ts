/**
 * WhatsApp bağlantısı: yalnızca 0 ile başlayan 11 haneli yerel numaraya Türkiye öneki (90) eklenir;
 * "+" ile başlayan uluslararası numara olduğu gibi kullanılır; diğer biçimlerde bağlantı gösterilmez.
 */
export function whatsappHref(phone: string): string | null {
  const compact = phone.replace(/[\s().-]/g, '')
  if (/^\+\d{8,15}$/.test(compact)) return `https://wa.me/${compact.slice(1)}`
  if (/^0\d{10}$/.test(compact)) return `https://wa.me/90${compact.slice(1)}`
  return null
}
