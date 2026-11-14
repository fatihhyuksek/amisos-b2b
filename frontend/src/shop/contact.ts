// İletişim bilgileri (K-64). Değişirse yalnızca burası güncellenir.

export const CONTACT = {
  /** Görünen telefon (aynı numara WhatsApp hattı). */
  phone: '0552 492 50 58',
  /** tel: ve wa.me bağlantıları için uluslararası biçim. */
  phoneE164: '+905524925058',
  email: 'info@amisosb2b.com',
  address: 'İSTOÇ Z Blok No: 91',
} as const

export const PHONE_HREF = `tel:${CONTACT.phoneE164}`
export const WHATSAPP_HREF = `https://wa.me/${CONTACT.phoneE164.replace('+', '')}`
