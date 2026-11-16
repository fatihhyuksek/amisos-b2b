// Fiyat alanı kilidi (K-66): oturumsuzken fiyat, iskonto ve stok gösterilmez.
import { Link } from '../Link'
import { Icon } from '../ui/Icon'
import { useShopMode } from './mode'
import { loginHref } from './returnTo'

export function PriceLock({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const mode = useShopMode()
  if (mode === 'admin')
    return (
      <p className={`ui-pricelock ui-pricelock--${size} muted`}>
        <Icon name="eye" />
        Fiyatlar yalnızca bayi oturumunda görünür
      </p>
    )
  return (
    <Link to={loginHref()} className={`ui-pricelock ui-pricelock--${size}`}>
      <Icon name="lock" />
      Fiyatı görmek için giriş yapın
    </Link>
  )
}
