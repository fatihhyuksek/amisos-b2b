// Açık vitrin ana sayfası (K-66): kampanya karuseli, kategori şeridi, geniş kampanya şeridi, koleksiyon kartları,
// ürün rafları (K-74, K-86), simge kutucukları, tanıtım paneli. Bayide hesap özeti. GR-URN-003, GR-FIY-003, K-40, K-65.
// K-87: bölümlerin sırası, açık/kapalı durumu ve içeriği yönetim panelinden gelir (shop/homeLayout.ts);
// ayar yoksa mevcut varsayılan görünüm çizilir.
import { Fragment, useRef, useState } from 'react'
import {
  ApiError,
  fetchCatalogProducts,
  type CatalogGroup,
  type CatalogProduct,
  type HomeSection,
} from '../api'
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
import { audienceOk, SHELF_TITLES, useHomeLayout } from '../shop/homeLayout'
import { ShopLayout, TrustStrip } from './ShopLayout'

const FEATURED_HREF = '/katalog?one-cikan=1'
const NEW_HREF = '/katalog?yeni=1&sirala=yeni'
const BEST_HREF = '/katalog?sirala=cok-satan'

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
function CampaignBand({ mode, section }: { mode: ShopMode; section: HomeSection }) {
  const c = section.config
  const custom = Boolean(c.title?.trim())
  if (mode === 'admin' && !custom) return null
  if (custom)
    return (
      <section className="ui-wideband" aria-labelledby={`${section.id}-title`}>
        <div className="ui-wideband__text">
          <h2 id={`${section.id}-title`}>{c.title}</h2>
          {c.text && <p>{c.text}</p>}
        </div>
        {c.buttonLabel && c.buttonLink && isAppPath(c.buttonLink) && (
          <div className="ui-wideband__actions">
            <Link to={c.buttonLink} className="ui-button ui-button--primary">
              {c.buttonLabel}
              <Icon name="arrowRight" />
            </Link>
          </div>
        )}
      </section>
    )
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
function CollectionCards({ groups, groupIds }: { groups: CatalogGroup[]; groupIds?: string[] }) {
  const chosen = (groupIds ?? [])
    .map((id) => groups.find((g) => g.id === id))
    .filter((g): g is CatalogGroup => Boolean(g?.thumbUrl))
  const top =
    chosen.length > 0
      ? chosen.slice(0, 4)
      : [...groups]
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

function isAppPath(p: string): boolean {
  return /^\/(?!\/)[^\\\s]*$/.test(p)
}

type ShelfLoad = Parameters<typeof fetchCatalogProducts>[0]

/**
 * Raf/panel ürünleri. Sunucu kaynağı çözdüyse (`productIds`) `ids=` ile alınır (sıra korunur);
 * çözülmediyse kaynağa göre sorgulanır. Çözülemeyen kaynak (örn. incelenenler) ürün döndürmezse bölüm gizlenir.
 */
function loadFor(section: HomeSection): ShelfLoad | null {
  const c = section.config
  const limit = Math.min(24, Math.max(1, c.limit ?? 5))
  const ids = section.productIds ?? (c.source === 'manual' ? c.productIds : undefined)
  if (ids) return ids.length > 0 ? { ids: ids.slice(0, limit), page: 1, pageSize: limit } : null
  switch (c.source) {
    case 'new':
      return { isNew: true, sort: 'newest', page: 1, pageSize: limit }
    case 'featured':
      return { featured: true, page: 1, pageSize: limit }
    case 'bestSellers':
      return { sort: 'popular', page: 1, pageSize: limit }
    case 'group':
      return c.groupId ? { groupId: c.groupId, page: 1, pageSize: limit } : null
    default:
      return null
  }
}

function useShelf(section: HomeSection) {
  const { refresh } = useAuth()
  const load = loadFor(section)
  const products = useLoad<CatalogProduct[]>(
    (s) =>
      load
        ? fetchCatalogProducts(load, s)
            .then((r) => r.items)
            .catch((err: unknown) => {
              if (err instanceof ApiError && (err.status === 401 || err.status === 403)) void refresh()
              throw err
            })
        : Promise.resolve([]),
    `home-${section.id}-${JSON.stringify(load)}`,
  )
  return products
}

function moreHref(section: HomeSection, groups: CatalogGroup[]): string {
  const c = section.config
  switch (c.source) {
    case 'new':
      return NEW_HREF
    case 'featured':
      return FEATURED_HREF
    case 'bestSellers':
      return BEST_HREF
    case 'group': {
      const g = groups.find((x) => x.id === c.groupId)
      return g ? catalogHref({ grup: g.id, slug: g.slug }) : '/katalog'
    }
    default:
      return '/katalog'
  }
}

/** (e) Ürün rafı: ortalanmış büyük harf başlık + ızgara ya da kaydırmalı şerit; yükleniyor iskeleti, hata, boşsa gizlenir. */
function Shelf({ section, groups }: { section: HomeSection; groups: CatalogGroup[] }) {
  const addToCart = useAddToCart()
  const products = useShelf(section)
  const scroller = useRef<HTMLUListElement>(null)
  const c = section.config
  const source = c.source ?? 'new'
  const group = groups.find((g) => g.id === c.groupId)
  const title = section.title?.trim() || (source === 'group' && group ? group.name : SHELF_TITLES[source])
  const carousel = c.layout === 'carousel'
  const skeletons = Math.min(c.limit ?? 5, 5)
  if (products.state.status === 'ready' && products.state.data.length === 0) return null
  const scroll = (dir: 1 | -1) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  return (
    <section aria-labelledby={`${section.id}-title`} className="ui-home__section">
      <div className="ui-bigtitle">
        <h2 id={`${section.id}-title`}>{title}</h2>
        <Link to={moreHref(section, groups)} className="ui-bigtitle__more">
          Tümünü gör
        </Link>
      </div>
      {section.subtitle && <p className="muted ui-home__sub">{section.subtitle}</p>}
      {products.state.status === 'loading' && (
        <ul className="ui-pgrid ui-pgrid--home" aria-hidden="true">
          {Array.from({ length: skeletons }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </ul>
      )}
      {products.state.status === 'error' && (
        <ErrorAlert onRetry={products.reload}>Ürünler alınamadı.</ErrorAlert>
      )}
      {products.state.status === 'ready' && carousel && (
        <div className="ui-home__carousel">
          <ul className="ui-pgrid ui-pgrid--strip" ref={scroller}>
            {products.state.data.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={(prod) => void addToCart(prod)} />
            ))}
          </ul>
          <div className="ui-strip-nav">
            <button
              type="button"
              className="ui-roundbtn"
              aria-label="Önceki ürünler"
              onClick={() => scroll(-1)}
            >
              <Icon name="chevronLeft" />
            </button>
            <button
              type="button"
              className="ui-roundbtn"
              aria-label="Sonraki ürünler"
              onClick={() => scroll(1)}
            >
              <Icon name="chevronRight" />
            </button>
          </div>
        </div>
      )}
      {products.state.status === 'ready' && !carousel && (
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

/** (g) Tanıtım paneli: solda koyu dikey panel, sağda ürünlerin kaydırmalı şeridi. */
function PromoPanel({ section, groups }: { section: HomeSection; groups: CatalogGroup[] }) {
  const addToCart = useAddToCart()
  const products = useShelf(section)
  const scroller = useRef<HTMLUListElement>(null)
  const c = section.config
  const title = c.panelTitle?.trim() || section.title?.trim() || 'Öne çıkan ürünler'
  const text = c.panelText?.trim() ?? 'Bu dönem öne çıkardığımız ürünler.'
  const link = c.buttonLink && isAppPath(c.buttonLink) ? c.buttonLink : moreHref(section, groups)
  if (products.state.status === 'ready' && products.state.data.length === 0) return null
  const scroll = (dir: 1 | -1) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  return (
    <section className="ui-featblock" aria-labelledby={`${section.id}-title`}>
      <div className="ui-featblock__panel">
        <h2 id={`${section.id}-title`}>{title}</h2>
        {text && <p>{text}</p>}
        <Link to={link} className="ui-featblock__btn">
          {c.buttonLabel?.trim() || 'Tümünü gör'}
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

function HowItWorks() {
  return (
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
  )
}

export function HomePage() {
  const mode = useShopMode()
  usePageTitle('Züccaciye toptan ön sipariş portalı')
  const banners = useBanners()
  const groups = useCatalogGroups()
  const layout = useHomeLayout()
  const groupList = groups.state.status === 'ready' ? groups.state.data : []

  function render(s: HomeSection) {
    switch (s.type) {
      case 'hero':
        return banners.status === 'ready' ? <PromoCarousel key={s.id} banners={banners.items} /> : null
      case 'categoryStrip':
        return <CategoryStrip key={s.id} groups={groupList} loading={groups.state.status === 'loading'} />
      case 'campaignStrip':
        if (!audienceOk(s.config.audience, mode)) return null
        return (
          <Fragment key={s.id}>
            <CampaignBand mode={mode} section={s} />
            {mode === 'dealer' && <DealerQuick />}
          </Fragment>
        )
      case 'collections':
        return <CollectionCards key={s.id} groups={groupList} groupIds={s.config.groupIds} />
      case 'productShelf':
        return <Shelf key={s.id} section={s} groups={groupList} />
      case 'iconTiles':
        return <IconTiles key={s.id} mode={mode} />
      case 'promoPanel':
        return <PromoPanel key={s.id} section={s} groups={groupList} />
      case 'howItWorks':
        return audienceOk(s.config.audience ?? 'guest', mode) ? <HowItWorks key={s.id} /> : null
      case 'trustStrip':
        return (
          <section key={s.id} aria-label="Neden AMİSOS B2B" className="ui-home__section">
            <TrustStrip />
          </section>
        )
    }
  }

  return (
    <ShopLayout footerTrust={false}>
      <h1 className="visually-hidden">AMİSOS B2B: züccaciye toptan ön sipariş portalı</h1>
      {layout.status === 'loading' ? (
        <div className="ui-skeleton" style={{ height: '16rem' }} aria-hidden="true" />
      ) : (
        layout.sections.filter((s) => s.enabled).map(render)
      )}
    </ShopLayout>
  )
}
