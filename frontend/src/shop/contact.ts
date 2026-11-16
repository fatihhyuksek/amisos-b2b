// İletişim bilgileri (K-64). Asıl kaynak GET /api/site (K-73); bu sabitler yalnızca sunucuya ulaşılamazsa
// kullanılır. Değişirse Admin "Site ayarları"ndan güncellenir.
import type { SiteContact } from '../api'

export const CONTACT = {
  /** Görünen telefon (aynı numara WhatsApp hattı). */
  phone: '0552 492 50 58',
  /** tel: ve wa.me bağlantıları için uluslararası biçim. */
  phoneE164: '+905524925058',
  email: 'info@amisosb2b.com',
  address: 'İSTOÇ Z Blok No: 91',
} as const

export const DEFAULT_CONTACT: SiteContact = {
  phone: CONTACT.phone,
  phoneE164: CONTACT.phoneE164,
  whatsappE164: CONTACT.phoneE164,
  email: CONTACT.email,
  address: CONTACT.address,
  city: 'İstanbul',
  workingHours: 'Hafta içi 09:00 – 18:30, Cumartesi 09:00 – 14:00',
  mapUrl: null,
}

/** Sunucudan sayfa listesi gelmezse bağlantılar yine de görünür (içerik sayfada alınır). */
export const DEFAULT_PAGES: { slug: string; title: string }[] = [
  { slug: 'hakkimizda', title: 'Hakkımızda' },
  { slug: 'sss', title: 'Sık sorulan sorular' },
  { slug: 'teslimat', title: 'Teslimat' },
  { slug: 'kvkk', title: 'KVKK aydınlatma metni' },
  { slug: 'kullanim-kosullari', title: 'Kullanım koşulları' },
]

export const PHONE_HREF = `tel:${CONTACT.phoneE164}`
export const WHATSAPP_HREF = `https://wa.me/${CONTACT.phoneE164.replace('+', '')}`

export function phoneHref(c: SiteContact): string {
  return `tel:${c.phoneE164 || c.phone.replace(/[^\d+]/g, '') || CONTACT.phoneE164}`
}

/** WhatsApp numarası Admin tarafından gizlendiyse (null) null döner; arayüz bağlantıyı göstermez (K-73). */
export function whatsappLink(c: SiteContact): string | null {
  if (c.whatsappE164 === null) return null
  const digits = (c.whatsappE164 || c.phoneE164 || CONTACT.phoneE164).replace(/\D/g, '')
  return digits ? `https://wa.me/${digits}` : null
}
