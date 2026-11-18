// Açık vitrin ana sayfası (K-66): kampanya karuseli, kategori şeridi, geniş kampanya şeridi, koleksiyon kartları,
// yeni ürünler (K-74), simge kutucukları, öne çıkan ürünler tanıtım bloğu. Bayide hesap özeti. GR-URN-003, GR-FIY-003, K-40, K-65.
import { useRef, useState } from 'react'
import { ApiError, fetchCatalogProducts, type CatalogGroup, type CatalogProduct } from '../api'
import { useAuth } from '../auth/useAuth'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { useShopMode, type ShopMode } from '../shop/mode'
import { usePageTitle } from '../shop/pageTitle'
import { PriceListButton } from '../shop/PriceListButton'
import { PromoCarousel } from '../shop/PromoCarousel'
import { loginHref } from '../shop/returnTo'
import { useAddToCart } from '../shop/useAddToCart'
import { useBanners } from '../shop/useBanners'
import { useCatalogGroups } from '../shop/useCatalogGroups'
import { usePriceListDownload } from '../shop/usePriceListDownload'
import { catalogHref } from '../shop/catalogHref'
import { ErrorAlert, ProductCard, ProductCardSkeleton } from '../ui/catalog'
import { Icon, type IconName } from '../ui/Icon'
import { DealerQuick } from './home/DealerQuick'
import { ShopLayout } from './ShopLayout'

const FEATURED_HREF = '/katalog?one-cikan=1'
const NEW_HREF = '/katalog?yeni=1&sirala=yeni'

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'store', title: 'Başvurun', text: 'Firma bilgilerinizle bayi başvurusunu doldurun.' },
  {
    icon: 'shield',
    title: 'Onay',
    text: 'E-postanızı doğrulayın; başvuru en geç 2 iş günü içinde sonuçlanır.',
  },
  {
    icon: 'orders',
    title: 'Ön sipariş verin',
    text: 'Fiyatları görün, sepeti oluşturun, siparişi gönderin.',
  },
  { icon: 'truck', title: 'Görüşme ve sevk', text: 'Ödeme ve teslim görüşülür; siparişiniz sevk edilir.' },
]

/** (b) Kategori küçük resim şeridi: her grup için yuvarlak köşeli kare görsel + etiket; yatay kaydırılır. */
function CategoryStrip({ groups, loading }: { groups: CatalogGroup[]; loading: boolean }) {
  if (!loading && groups.length === 0) return null
  return (
    <nav aria-label="Ürün grupları" className="ui-catstrip">
      <ul>
        {loading &&
          Array.from({ length: 8 }, (_, i) => (
            <li key={i} aria-hidden="true">
              <span className="ui-catstrip__img ui-skeleton" />
            </li>
          ))}
        {groups.map((g) => (
          <li key={g.id}>
            <CatStripItem group={g} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

function CatStripItem({ group }: { group: CatalogGroup }) {
  const [failed, setFailed] = useState(false)
  const ok = group.thumbUrl && !failed
  return (
    <Link to={catalogHref({ grup: group.id, slug: group.slug })} className="ui-catstrip__item">
      <span className={ok ? 'ui-catstrip__img' : 'ui-catstrip__img ui-catstrip__img--empty'}>
        {ok ? (
          <img
            src={group.thumbUrl as string}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <img className="ui-img__ph" src="/brand/logo-64.webp" alt="" width={64} height={64} />
        )}
      </span>
      <span className="ui-catstrip__name">{group.name}</span>
    </Link>
  )
}

/** (c) Geniş kampanya şeridi: CSS ile krem zemin ve ince altın süs çizgileri. */
function CampaignBand({ mode }: { mode: ShopMode }) {
  if (mode === 'admin') return null
  return (
    <section className="ui-wideband" aria-labelledby="band-title">
      <div className="ui-wideband__text">
        {mode === 'guest' ? (
          <>
            <h2 id="band-title">Bayimiz olun</h2>
            <p>Bayiye özel iskontolu toptan fiyatlar, koli bazlı ön sipariş ve hızlı destek.</p>
          </>
        ) : (
          <>
            <h2 id="band-title">Fiyat listenizi indirin</h2>
            <p>İskontolu net fiyatlarınızı Excel olarak alın; koli bazlı siparişi hızlıca girin.</p>
          </>
        )}
      </div>
      <div className="ui-wideband__actions">
        {mode === 'guest' ? (
          <>
            <Link to="/basvuru" className="ui-button ui-button--primary">
              Bayi ol
              <Icon name="arrowRight" />
            </Link>
            <Link to={loginHref('/')} className="ui-wideband__link">
              Giriş yap
            </Link>
          </>
        ) : (
          <>
            <Link to="/hizli-siparis" className="ui-button ui-button--primary">
              <Icon name="zap" />
              Hızlı sipariş
            </Link>
            <PriceListButton label="Fiyat listesi indir" />
          </>
        )}
      </div>
    </section>
  )
}

/** (d) Koleksiyon kartları: ürün sayısı en çok 4 grup; dikey 3:4, sol üstte serif başlık. */
function CollectionCards({ groups }: { groups: CatalogGroup[] }) {
  const top = [...groups]
    .filter((g) => g.thumbUrl)
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, 4)
  if (top.length === 0) return null
  return (
    <section aria-label="Koleksiyonlar">
      <ul className="ui-collections">
        {top.map((g) => (
          <li key={g.id}>
            <Link to={catalogHref({ grup: g.id, slug: g.slug })} className="ui-collection">
              <img src={g.thumbUrl as string} alt="" loading="lazy" decoding="async" />
              <span className="ui-collection__text">
                <span className="ui-collection__title">{g.name}</span>
                <span className="ui-collection__sub">{g.productCount} ürün</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function useShelf(id: string, load: Parameters<typeof fetchCatalogProducts>[0]) {
  const { refresh } = useAuth()
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
  return products
}

/** (e) Ürün rafı: ortalanmış büyük harf başlık + 5 sütun; yükleniyor iskeleti, hata, boşsa gizlenir. */
function Shelf({
  id,
  title,
  load,
  moreHref,
}: {
  id: string
  title: string
  load: Parameters<typeof fetchCatalogProducts>[0]
  moreHref: string
}) {
  const addToCart = useAddToCart()
  const products = useShelf(id, load)
  if (products.state.status === 'ready' && products.state.data.length === 0) return null
  return (
    <section aria-labelledby={`${id}-title`} className="ui-home__section">
      <div className="ui-bigtitle">
        <h2 id={`${id}-title`}>{title}</h2>
        <Link to={moreHref} className="ui-bigtitle__more">
          Tümünü gör
        </Link>
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
        <ul className="ui-pgrid ui-pgrid--home">
          {products.state.data.map((p) => (
            <ProductCard key={p.id} product={p} onAdd={(prod) => void addToCart(prod)} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** (f) Simge kutucukları: krem zeminli 6 kare kutucuk. Oturumsuzda bayiye özel olanlar girişe gider. */
function IconTiles({ mode }: { mode: ShopMode }) {
  const priceList = usePriceListDownload()
  const guest = mode === 'guest'
  const tiles: { icon: IconName; label: string; to?: string; onClick?: () => void; busy?: boolean }[] = [
    { icon: 'tag', label: 'Yeni ürünler', to: NEW_HREF },
    { icon: 'star', label: 'Öne çıkanlar', to: FEATURED_HREF },
  ]
  if (mode !== 'admin') {
    tiles.push(
      { icon: 'zap', label: 'Hızlı sipariş', to: guest ? loginHref('/hizli-siparis') : '/hizli-siparis' },
      guest
        ? { icon: 'file', label: 'Fiyat listesi', to: loginHref('/') }
        : { icon: 'file', label: 'Fiyat listesi', onClick: priceList.run, busy: priceList.busy },
      { icon: 'heart', label: 'Favorilerim', to: guest ? loginHref('/favorilerim') : '/favorilerim' },
    )
  }
  tiles.push({ icon: 'grid', label: 'Tüm ürünler', to: '/katalog' })
  return (
    <nav aria-label="Hızlı erişim">
      <ul className="ui-icontiles">
        {tiles.map((t) => (
          <li key={t.label}>
            {t.to ? (
              <Link to={t.to} className="ui-icontile">
                <Icon name={t.icon} />
                <span>{t.label}</span>
              </Link>
            ) : (
              <button type="button" className="ui-icontile" disabled={t.busy} onClick={t.onClick}>
                <Icon name={t.icon} />
                <span>{t.busy ? 'Hazırlanıyor…' : t.label}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** (g) Tanıtım bloğu: solda koyu dikey panel, sağda öne çıkan ürünlerin kaydırmalı şeridi. */
function FeaturedBlock() {
  const addToCart = useAddToCart()
  const products = useShelf('featured', { featured: true, page: 1, pageSize: 8 })
  const scroller = useRef<HTMLUListElement>(null)
  if (products.state.status === 'ready' && products.state.data.length === 0) return null
  const scroll = (dir: 1 | -1) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  return (
    <section className="ui-featblock" aria-labelledby="featured-title">
      <div className="ui-featblock__panel">
        <h2 id="featured-title">Öne çıkan ürünler</h2>
        <p>Bu dönem öne çıkardığımız ürünler.</p>
        <Link to={FEATURED_HREF} className="ui-featblock__btn">
          Tümünü gör
          <Icon name="arrowRight" />
        </Link>
      </div>
      <div className="ui-featblock__strip">
        {products.state.status === 'loading' && (
          <ul className="ui-featblock__list" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </ul>
        )}
        {products.state.status === 'error' && (
          <ErrorAlert onRetry={products.reload}>Ürünler alınamadı.</ErrorAlert>
        )}
        {products.state.status === 'ready' && (
          <>
            <ul className="ui-featblock__list" ref={scroller}>
              {products.state.data.map((p) => (
                <ProductCard key={p.id} product={p} onAdd={(prod) => void addToCart(prod)} />
              ))}
            </ul>
            {products.state.data.length > 4 && (
              <>
                <button
                  type="button"
                  className="ui-carousel__arrow ui-featblock__arrow ui-featblock__arrow--prev"
                  aria-label="Önceki ürünler"
                  onClick={() => scroll(-1)}
                >
                  <Icon name="chevronLeft" />
                </button>
                <button
                  type="button"
                  className="ui-carousel__arrow ui-featblock__arrow ui-featblock__arrow--next"
                  aria-label="Sonraki ürünler"
                  onClick={() => scroll(1)}
                >
                  <Icon name="chevronRight" />
                </button>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export function HomePage() {
  const mode = useShopMode()
  usePageTitle('Züccaciye toptan ön sipariş portalı')
  const banners = useBanners()
  const groups = useCatalogGroups()
  const groupList = groups.state.status === 'ready' ? groups.state.data : []

  return (
    <ShopLayout>
      <h1 className="visually-hidden">AMİSOS B2B: züccaciye toptan ön sipariş portalı</h1>
      {banners.status === 'ready' && <PromoCarousel banners={banners.items} />}

      <CategoryStrip groups={groupList} loading={groups.state.status === 'loading'} />

      <CampaignBand mode={mode} />
      {mode === 'dealer' && <DealerQuick />}

      <CollectionCards groups={groupList} />

      <Shelf
        id="new"
        title="Yeni ürünler"
        load={{ isNew: true, sort: 'newest', page: 1, pageSize: 5 }}
        moreHref={NEW_HREF}
      />

      <IconTiles mode={mode} />

      <FeaturedBlock />

      {mode === 'guest' && (
        <section aria-labelledby="steps-title" className="ui-howstrip">
          <h2 id="steps-title">Nasıl çalışır?</h2>
          <ol>
            {STEPS.map((st, i) => (
              <li key={st.title}>
                <span className="ui-howstrip__no num" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <strong>{st.title}</strong>
                  <span className="muted">{st.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </ShopLayout>
  )
}
