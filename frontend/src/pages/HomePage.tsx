// Açık vitrin ana sayfası (K-66): kampanya karuseli, değer önerileri, kategori kartları, öne çıkan ve yeni
// ürünler (K-74), "Nasıl çalışır", bayi olma çağrısı. Bayide hızlı erişim özeti. GR-URN-003, GR-FIY-003, K-40, K-65.
import { useState } from 'react'
import { ApiError, fetchCatalogProducts, type CatalogGroup, type CatalogProduct } from '../api'
import { useAuth } from '../auth/useAuth'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { useShopMode } from '../shop/mode'
import { usePageTitle } from '../shop/pageTitle'
import { PromoCarousel } from '../shop/PromoCarousel'
import { loginHref } from '../shop/returnTo'
import { useAddToCart } from '../shop/useAddToCart'
import { useBanners } from '../shop/useBanners'
import { useCatalogGroups } from '../shop/useCatalogGroups'
import { catalogHref } from '../shop/catalogHref'
import { ErrorAlert, ProductCard, ProductCardSkeleton } from '../ui/catalog'
import { Icon, type IconName } from '../ui/Icon'
import { DealerQuick } from './home/DealerQuick'
import { ShopLayout } from './ShopLayout'

const MAX_CATEGORIES = 8
const SHELF_COUNT = 10

const VALUES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'percent',
    title: 'Bayiye özel iskonto',
    text: 'İskonto oranınız fiyatlara yansıtılır; net tutarı görürsünüz.',
  },
  { icon: 'boxes', title: 'Koli bazında toptan', text: 'Siparişler koli içi adedin katlarıyla verilir.' },
  {
    icon: 'truck',
    title: 'Ambar ile sevkiyat',
    text: 'Türkiye geneline ambar, tır veya elden teslim seçenekleri.',
  },
  { icon: 'zap', title: 'BizimHesap ile işlem', text: 'Onaylanan siparişler BizimHesap üzerinden işlenir.' },
]

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'store', title: 'Başvurun', text: 'Firma bilgilerinizle bayi başvurusunu doldurun.' },
  {
    icon: 'shield',
    title: 'Onay',
    text: 'E-postanızı doğrulayın; başvurunuz en geç 2 iş günü içinde sonuçlanır.',
  },
  {
    icon: 'orders',
    title: 'Ön sipariş verin',
    text: 'Fiyatları görün, sepeti oluşturun, ön siparişi gönderin.',
  },
  {
    icon: 'truck',
    title: 'Görüşme ve sevk',
    text: 'Ödeme ve teslim detayları görüşülür; siparişiniz sevk edilir.',
  },
]

function CategoryCard({ group }: { group: CatalogGroup }) {
  const thumb = group.thumbUrl
  const [failed, setFailed] = useState(false)
  return (
    <li>
      <Link to={catalogHref({ grup: group.id })} className="ui-catcard">
        <span className={thumb && !failed ? 'ui-catcard__img' : 'ui-catcard__img ui-catcard__img--empty'}>
          {thumb && !failed ? (
            <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
          ) : (
            <img className="ui-img__ph" src="/brand/logo-64.webp" alt="" width={64} height={64} />
          )}
        </span>
        <span className="ui-catcard__name">{group.name}</span>
        <span className="ui-catcard__count muted num">{group.productCount} ürün</span>
      </Link>
    </li>
  )
}

/** Ürün rafı: yükleniyor iskeleti, hata, boşsa gizlenir. */
function Shelf({
  id,
  title,
  note,
  load,
  moreHref,
}: {
  id: string
  title: string
  note?: string
  load: Parameters<typeof fetchCatalogProducts>[0]
  moreHref: string
}) {
  const { refresh } = useAuth()
  const addToCart = useAddToCart()
  const products = useLoad<CatalogProduct[]>(
    (s) =>
      fetchCatalogProducts(load, s)
        .then((r) => r.items)
        .catch((err: unknown) => {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) void refresh()
          throw err
        }),
    `home-${id}`,
  )
  if (products.state.status === 'ready' && products.state.data.length === 0) return null
  return (
    <section aria-labelledby={`${id}-title`} className="ui-home__section">
      <div className="ui-sectionhead ui-sectionhead--center">
        <h2 id={`${id}-title`}>{title}</h2>
        {note && <p className="muted">{note}</p>}
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
      {products.state.status === 'ready' && (
        <>
          <ul className="ui-pgrid ui-pgrid--home">
            {products.state.data.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={(prod) => void addToCart(prod)} />
            ))}
          </ul>
          <div className="ui-more">
            <Link to={moreHref} className="ui-button ui-button--secondary">
              Tümünü gör
              <Icon name="arrowRight" />
            </Link>
          </div>
        </>
      )}
    </section>
  )
}

export function HomePage() {
  const mode = useShopMode()
  usePageTitle('Züccaciye toptan ön sipariş portalı')
  const banners = useBanners()
  const groups = useCatalogGroups()
  const groupList = groups.state.status === 'ready' ? groups.state.data.slice(0, MAX_CATEGORIES) : []

  return (
    <ShopLayout>
      <h1 className="visually-hidden">AMİSOS B2B: züccaciye toptan ön sipariş portalı</h1>
      {banners.status === 'ready' && <PromoCarousel banners={banners.items} />}

      <ul className="ui-valuestrip" aria-label="Neden Amisos B2B">
        {VALUES.map((v) => (
          <li key={v.title}>
            <span className="ui-trust__icon">
              <Icon name={v.icon} />
            </span>
            <span>
              <strong>{v.title}</strong>
              <span className="muted">{v.text}</span>
            </span>
          </li>
        ))}
      </ul>

      {mode === 'dealer' && <DealerQuick />}

      {groups.state.status === 'loading' && (
        <ul className="ui-catcards" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <span className="ui-catcard">
                <span className="ui-catcard__img ui-skeleton" />
                <span className="ui-skeleton" style={{ height: '1rem', width: '60%' }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {groupList.length > 0 && (
        <section aria-labelledby="cats-title" className="ui-home__section">
          <div className="ui-sectionhead">
            <h2 id="cats-title">Ürün grupları</h2>
            <Link to="/katalog" className="ui-sectionhead__more">
              Tüm ürünler
              <Icon name="arrowRight" />
            </Link>
          </div>
          <ul className="ui-catcards">
            {groupList.map((g) => (
              <CategoryCard key={g.id} group={g} />
            ))}
          </ul>
        </section>
      )}

      <Shelf
        id="featured"
        title="Öne çıkan ürünler"
        note={mode === 'dealer' ? 'Fiyatlar KDV hariçtir' : 'Fiyatları görmek için bayi girişi yapın'}
        load={{ featured: true, page: 1, pageSize: SHELF_COUNT }}
        moreHref="/katalog?one-cikan=1"
      />
      <Shelf
        id="new"
        title="Yeni ürünler"
        note="Son 30 günde eklenenler"
        load={{ isNew: true, sort: 'newest', page: 1, pageSize: SHELF_COUNT }}
        moreHref="/katalog?yeni=1&sirala=yeni"
      />

      <section className="ui-home__section" aria-labelledby="steps-title">
        <div className="ui-sectionhead ui-sectionhead--center">
          <h2 id="steps-title">Nasıl çalışır?</h2>
          <p className="muted">Başvurudan sevke dört adım</p>
        </div>
        <ol className="ui-steps4">
          {STEPS.map((st, i) => (
            <li key={st.title}>
              <span className="ui-steps4__no num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="ui-trust__icon">
                <Icon name={st.icon} />
              </span>
              <strong>{st.title}</strong>
              <span className="muted">{st.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {mode === 'guest' && (
        <section className="ui-becomedealer" aria-labelledby="become-title">
          <div>
            <h2 id="become-title">Bayimiz olun</h2>
            <p>
              Mutfak eşyaları ve dekorasyon ürünlerinde bayiye özel iskontolu toptan fiyatlar, koli bazlı ön
              sipariş ve hızlı destek için başvurun. Zaten bayimizseniz giriş yapın.
            </p>
          </div>
          <div className="ui-becomedealer__actions">
            <Link to="/basvuru" className="ui-button ui-button--primary">
              Bayi ol
              <Icon name="arrowRight" />
            </Link>
            <Link to={loginHref('/')} className="ui-button ui-button--secondary">
              Giriş yap
            </Link>
          </div>
        </section>
      )}
    </ShopLayout>
  )
}
