// K-70: Favorilerim. Kalbe tekrar basınca ürün listeden kalkar; sepete eklenebilir.
import { useState } from 'react'
import { fetchFavorites, type CatalogProduct } from '../api'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { usePageTitle } from '../shop/pageTitle'
import { useAddToCart } from '../shop/useAddToCart'
import { EmptyState } from '../ui/components'
import { ErrorAlert, ProductCard, ProductCardSkeleton } from '../ui/catalog'
import { formatInt } from '../ui/format'
import { Icon } from '../ui/Icon'
import { ShopLayout } from './ShopLayout'

export function FavoritesPage() {
  const { state, reload } = useLoad<CatalogProduct[]>((s) => fetchFavorites(s), 'favorites')
  const addToCart = useAddToCart()
  const [removed, setRemoved] = useState<string[]>([])
  usePageTitle('Favorilerim')
  const items = state.status === 'ready' ? state.data.filter((p) => !removed.includes(p.id)) : []

  return (
    <ShopLayout>
      <header className="ui-pagetitle">
        <h1>Favorilerim</h1>
        <p className="muted" aria-live="polite">
          {state.status === 'ready' ? `${formatInt(items.length)} ürün · ` : ''}Fiyatlar KDV hariçtir
        </p>
      </header>
      {state.status === 'loading' && (
        <>
          <ul className="ui-pgrid ui-pgrid--catalog" data-cols="4" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </ul>
          <span className="visually-hidden" role="status">
            Yükleniyor…
          </span>
        </>
      )}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Favoriler alınamadı.</ErrorAlert>}
      {state.status === 'ready' && items.length === 0 && (
        <div className="ui-card">
          <EmptyState
            title="Henüz favori ürününüz yok"
            action={
              <Link to="/katalog" className="ui-button ui-button--primary">
                Kataloğa göz at
              </Link>
            }
          >
            Ürün kartlarındaki kalp simgesine basarak sık sipariş ettiğiniz ürünleri buraya ekleyin.
          </EmptyState>
        </div>
      )}
      {items.length > 0 && (
        <>
          <ul className="ui-pgrid ui-pgrid--catalog" data-cols="4">
            {items.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onAdd={(prod) => void addToCart(prod)}
                onFavoriteChange={(fav) => {
                  if (!fav) setRemoved((r) => [...r, p.id])
                }}
              />
            ))}
          </ul>
          <div className="ui-more">
            <Link to="/hizli-siparis" className="ui-button ui-button--secondary">
              <Icon name="zap" />
              Hızlı sipariş
            </Link>
          </div>
        </>
      )}
    </ShopLayout>
  )
}
