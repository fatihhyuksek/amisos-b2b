// Favori (kalp) butonu (K-70). Oturumsuzsa girişe yönlendirir (K-66); Admin için gösterilmez.
import { useState } from 'react'
import { addFavorite, removeFavorite } from '../api'
import { navigate } from '../router'
import { Icon } from '../ui/Icon'
import { useCart } from './cart'
import { useShopMode } from './mode'
import { loginHref } from './returnTo'

export function FavoriteButton({
  productId,
  name,
  initial,
  onChange,
  variant = 'card',
}: {
  productId: string
  name: string
  initial: boolean
  /** Sunucuda başarıyla değişince çağrılır (Favorilerim listesi kartı kaldırır). */
  onChange?: (favorite: boolean) => void
  variant?: 'card' | 'inline'
}) {
  const mode = useShopMode()
  const { notify } = useCart()
  const [fav, setFav] = useState(initial)
  const [busy, setBusy] = useState(false)
  if (mode === 'admin') return null

  async function toggle() {
    if (mode === 'guest') {
      navigate(loginHref())
      return
    }
    if (busy) return
    setBusy(true)
    const next = !fav
    try {
      if (next) await addFavorite(productId)
      else await removeFavorite(productId)
      setFav(next)
      onChange?.(next)
      notify({ tone: 'success', text: next ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı', detail: name })
    } catch {
      notify({ tone: 'danger', text: 'Favori güncellenemedi. Lütfen tekrar deneyin.', detail: name })
    } finally {
      setBusy(false)
    }
  }

  const label =
    mode === 'guest'
      ? `Favorilere eklemek için giriş yapın: ${name}`
      : fav
        ? `Favorilerden çıkar: ${name}`
        : `Favorilere ekle: ${name}`

  return (
    <button
      type="button"
      className={`ui-favbtn ui-favbtn--${variant}`}
      aria-pressed={mode === 'dealer' ? fav : undefined}
      aria-label={label}
      title={
        mode === 'guest'
          ? 'Favorilere eklemek için giriş yapın'
          : fav
            ? 'Favorilerden çıkar'
            : 'Favorilere ekle'
      }
      disabled={busy}
      onClick={() => void toggle()}
    >
      <Icon name={fav ? 'heartFilled' : 'heart'} />
      {variant === 'inline' && <span>{fav ? 'Favorilerde' : 'Favorilere ekle'}</span>}
    </button>
  )
}
