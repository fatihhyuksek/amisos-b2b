// K-79: liste fiyatı girilmemiş ürün. Fiyat yerine "Fiyat için bize ulaşın" (WhatsApp/telefon) gösterilir;
// sepete eklenmez, "Fiyat sor" ile WhatsApp mesajı ürün adı ve barkodla önceden doldurulur.
import { useAskPriceHref } from './useAskPriceHref'
import { Icon } from '../ui/Icon'

/** Kart ve satır içi kısa metin. */
export function PriceOnRequest({
  product,
  size = 'md',
}: {
  product?: { name: string; barcode: string }
  size?: 'md' | 'lg'
}) {
  const { href, external } = useAskPriceHref(product)
  return (
    <a
      className={`ui-pricelock ui-pricelock--${size} ui-onrequest`}
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <Icon name="phone" />
      Fiyat için bize ulaşın
      {external && <span className="visually-hidden"> (WhatsApp, yeni sekmede açılır)</span>}
    </a>
  )
}

/** "Fiyat sor" eylem butonu (sepete ekle yerine). */
export function AskPriceButton({
  product,
  variant = 'secondary',
  block,
  className = '',
}: {
  product: { name: string; barcode: string }
  variant?: 'primary' | 'secondary'
  block?: boolean
  className?: string
}) {
  const { href, external } = useAskPriceHref(product)
  return (
    <a
      className={`ui-button ui-button--${variant}${block ? ' ui-button--block' : ''} ${className}`.trim()}
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <Icon name="whatsapp" />
      Fiyat sor
      {external && <span className="visually-hidden"> (yeni sekmede açılır)</span>}
    </a>
  )
}
