// Bayi ana sayfası: kampanya alanı (K-65), görselli kategori kutucukları, katalogdan ürünler.
// GR-URN-003, GR-FIY-003, K-40.
import { useState } from 'react'
import { ApiError, fetchCatalogProducts, type CatalogGroup, type CatalogProduct } from '../api'
import { useAuth } from '../auth/useAuth'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { PromoCarousel } from '../shop/PromoCarousel'
import { useAddToCart } from '../shop/useAddToCart'
import { useBanners } from '../shop/useBanners'
import { useCatalogGroups } from '../shop/useCatalogGroups'
import { ErrorAlert, ProductCard, ProductCardSkeleton } from '../ui/catalog'
import { Icon } from '../ui/Icon'
import { catalogHref } from '../shop/catalogHref'
import { ShopLayout } from './ShopLayout'

const MAX_TILES = 12
const PRODUCT_COUNT = 10

/** Kapak: gruplar yanıtındaki thumbUrl (ilk görselli ürün); yoksa ikon. */
function CategoryTile({ group }: { group: CatalogGroup }) {
  const thumb = group.thumbUrl
  const [failed, setFailed] = useState(false)
  return (
    <li>
      <Link to={catalogHref({ grup: group.id })} className="ui-cattile">
        <span className="ui-cattile__img">
          {thumb && !failed ? (
            <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
          ) : (
            <Icon name="boxes" />
          )}
        </span>
        <span className="ui-cattile__name">{group.name}</span>
      </Link>
    </li>
  )
}

export function HomePage() {
  const { refresh } = useAuth()
  const addToCart = useAddToCart()
  const banners = useBanners()
  const groups = useCatalogGroups()
  const groupList = groups.state.status === 'ready' ? groups.state.data.slice(0, MAX_TILES) : []
  const products = useLoad<CatalogProduct[]>(
    (s) =>
      fetchCatalogProducts({ sort: 'newest', page: 1, pageSize: PRODUCT_COUNT }, s)
        .then((r) => r.items)
        .catch((err: unknown) => {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) void refresh()
          throw err
        }),
    'home-products',
  )

  return (
    <ShopLayout>
      <h1 className="visually-hidden">AMİSOS B2B bayi ana sayfası</h1>
      {banners.status === 'ready' && <PromoCarousel banners={banners.items} />}

      {groups.state.status === 'loading' && (
        <ul className="ui-cattiles" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <span className="ui-cattile">
                <span className="ui-cattile__img ui-skeleton" />
                <span className="ui-skeleton" style={{ height: '0.875rem', width: '70%' }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {groupList.length > 0 && (
        <section aria-labelledby="cats-title" className="ui-home__section">
          <div className="ui-sectionhead">
            <h2 id="cats-title">Kategoriler</h2>
            <Link to="/katalog" className="ui-sectionhead__more">
              Tüm ürünler
              <Icon name="arrowRight" />
            </Link>
          </div>
          <ul className="ui-cattiles">
            {groupList.map((g) => (
              <CategoryTile key={g.id} group={g} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="products-title" className="ui-home__section">
        <div className="ui-sectionhead ui-sectionhead--center">
          <h2 id="products-title">Yeni ürünler</h2>
          <p className="muted">Fiyatlar KDV hariçtir</p>
        </div>
        {products.state.status === 'loading' && (
          <ul className="ui-pgrid ui-pgrid--home" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </ul>
        )}
        {products.state.status === 'error' && (
          <ErrorAlert onRetry={products.reload}>Ürünler alınamadı.</ErrorAlert>
        )}
        {products.state.status === 'ready' && products.state.data.length > 0 && (
          <ul className="ui-pgrid ui-pgrid--home">
            {products.state.data.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={(prod) => void addToCart(prod)} />
            ))}
          </ul>
        )}
        <div className="ui-more">
          <Link to="/katalog" className="ui-button ui-button--secondary">
            Tüm ürünleri gör
            <Icon name="arrowRight" />
          </Link>
        </div>
      </section>
    </ShopLayout>
  )
}
