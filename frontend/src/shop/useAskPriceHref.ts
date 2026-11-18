import { phoneHref, whatsappLink } from './contact'
import { useSite } from './site'

/** WhatsApp bağlantısı ya da (WhatsApp gizliyse) telefon bağlantısı; mesaj ürün adı ve barkodla dolu. */
export function useAskPriceHref(product?: { name: string; barcode: string }): {
  href: string
  external: boolean
} {
  const { contact } = useSite()
  const wa = whatsappLink(contact)
  if (wa) {
    const text = product
      ? `Merhaba, "${product.name}" (barkod: ${product.barcode}) ürününün fiyatını öğrenmek istiyorum.`
      : 'Merhaba, ürün fiyatlarını öğrenmek istiyorum.'
    return { href: `${wa}?text=${encodeURIComponent(text)}`, external: true }
  }
  return { href: phoneHref(contact), external: false }
}
