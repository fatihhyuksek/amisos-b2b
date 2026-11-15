// GR-URN-003, GR-URN-002, GR-FIY-001, GR-FIY-003, K-40, K-18, K-10, K-11: Ürün detayı.
// Sepete ekleme alanı: koli adımlı miktar, sepette varsa mevcut miktar (GR-SIP-003, GR-SIP-004, K-20, K-21).
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useCart } from '../shop/cart'
import { useAddToCart } from '../shop/useAddToCart'
import { fetchCatalogProduct, fetchCatalogProducts, type CatalogProduct } from '../api'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { Button, Price, QuantityStepper, StockBadge } from '../ui/components'
import { ErrorAlert, ProductCard, ProductImage } from '../ui/catalog'
import { formatPercent } from '../ui/format'
import { Icon, type IconName } from '../ui/Icon'
import { catalogHref } from '../shop/catalogHref'
import { CONTACT, WHATSAPP_HREF } from '../shop/contact'
import { DELIVERY_LABEL } from '../shop/delivery'
import { ShopLayout } from './ShopLayout'

// ---------- Galeri: masaüstünde solda dikey küçük resim şeridi; telefonda tam genişlik + noktalar ----------
function Gallery({ product }: { product: CatalogProduct }) {
  const imgs = product.images
  const [index, setIndex] = useState(0)
  const startX = useRef<number | null>(null)
  const go = (i: number) => setIndex(Math.min(imgs.length - 1, Math.max(0, i)))
  const many = imgs.length > 1

  function onKeyDown(e: KeyboardEvent) {
    const map: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: imgs.length - 1,
    }
    if (e.key in map) {
      e.preventDefault()
      go(map[e.key])
    }
  }
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse') startX.current = e.clientX
  }
  function onPointerUp(e: PointerEvent) {
    if (startX.current === null) return
    const dx = e.clientX - startX.current
    startX.current = null
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1))
  }

  if (imgs.length === 0)
    return (
      <div className="ui-gallery">
        <div className="ui-gallery__main">
          <ProductImage alt="" ratio="1" />
        </div>
      </div>
    )

  return (
    <div
      className={many ? 'ui-gallery ui-gallery--many' : 'ui-gallery'}
      role="group"
      aria-label="Ürün görselleri"
    >
      {many && (
        <ul className="ui-gallery__thumbs">
          {imgs.map((im, i) => (
            <li key={im.url}>
              <button
                type="button"
                className="ui-gallery__thumb"
                aria-current={i === index}
                aria-label={`${i + 1}. görseli göster`}
                onClick={() => setIndex(i)}
              >
                <ProductImage src={im.thumbUrl} alt="" ratio="1" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        className="ui-gallery__main"
        tabIndex={many ? 0 : undefined}
        onKeyDown={many ? onKeyDown : undefined}
        onPointerDown={many ? onPointerDown : undefined}
        onPointerUp={many ? onPointerUp : undefined}
        aria-label={many ? `Görsel ${index + 1} / ${imgs.length}, ok tuşlarıyla gezinin` : undefined}
      >
        {/* key: görsel değişince yer tutucu/hata durumu sıfırlanır */}
        <ProductImage
          key={imgs[index].url}
          src={imgs[index].url}
          alt={product.name}
          ratio="1"
          fit="contain"
        />
        {product.discountPercent && (
          <span className="ui-pill ui-pill--accent ui-gallery__badge">
            {formatPercent(product.discountPercent)} iskonto
          </span>
        )}
        {many && (
          <>
            <button
              type="button"
              className="ui-gallery__arrow ui-gallery__arrow--prev"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Önceki görsel"
            >
              <Icon name="chevronLeft" />
            </button>
            <button
              type="button"
              className="ui-gallery__arrow ui-gallery__arrow--next"
              onClick={() => go(index + 1)}
              disabled={index === imgs.length - 1}
              aria-label="Sonraki görsel"
            >
              <Icon name="chevronRight" />
            </button>
            <div className="ui-gallery__dots" aria-hidden="true">
              {imgs.map((im, i) => (
                <span key={im.url} data-active={i === index} />
              ))}
            </div>
            <span className="visually-hidden" aria-live="polite">
              Görsel {index + 1} / {imgs.length}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/** Sepete ekleme alanı. Sepette varsa mevcut miktar gösterilir ve buton "Sepeti güncelle" olur. */
function AddToCartBox({ product }: { product: CatalogProduct }) {
  const { status, quantityOf } = useCart()
  const add = useAddToCart()
  const inCart = quantityOf(product.id)
  // null: bayi henüz değiştirmedi; sepetteki miktar (yoksa bir koli) gösterilir.
  const [edited, setEdited] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const qty = edited ?? (inCart > 0 ? inCart : product.caseQuantity)
  const valid = Number.isInteger(qty) && qty > 0 && qty % product.caseQuantity === 0
  const unchanged = inCart > 0 && qty === inCart

  async function submit() {
    setBusy(true)
    const ok = await add(product, qty, inCart > 0 ? 'update' : 'add')
    setBusy(false)
    if (ok) setEdited(null)
  }

  return (
    <div className="ui-buybox">
      {inCart > 0 && (
        <p className="ui-buybox__incart num">
          <Icon name="bag" />
          Sepetinizde: {inCart} adet
        </p>
      )}
      <div className="ui-buybox__row">
        <QuantityStepper value={qty} step={product.caseQuantity} onChange={setEdited} label={product.name} />
        <Button
          icon="bagPlus"
          className="ui-buybox__btn"
          disabled={busy || !valid || unchanged || status === 'error'}
          onClick={submit}
        >
          {busy ? 'Kaydediliyor…' : inCart > 0 ? 'Sepeti güncelle' : 'Sepete ekle'}
        </Button>
      </div>
    </div>
  )
}

const PERKS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'percent', title: 'Net fiyat', text: 'KDV hariç, iskontolu' },
  { icon: 'boxes', title: 'Koli bazlı', text: 'Koli katlarıyla sipariş' },
  { icon: 'headset', title: 'Hızlı destek', text: CONTACT.phone },
]

/** Aynı gruptan ürünler (kendisi hariç), yatay kaydırmalı şerit. */
function SimilarProducts({ product }: { product: CatalogProduct }) {
  const add = useAddToCart()
  const listRef = useRef<HTMLUListElement>(null)
  const { state } = useLoad<CatalogProduct[]>(
    (s) =>
      fetchCatalogProducts({ groupId: product.groupId, page: 1, pageSize: 13 }, s).then((r) =>
        r.items.filter((x) => x.id !== product.id).slice(0, 12),
      ),
    `similar-${product.id}`,
  )
  if (state.status !== 'ready' || state.data.length === 0) return null
  const scroll = (dir: 1 | -1) => {
    const el = listRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  return (
    <section className="ui-home__section" aria-labelledby="similar-title">
      <div className="ui-sectionhead">
        <h2 id="similar-title">Benzer ürünler</h2>
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
      <ul className="ui-pgrid ui-pgrid--strip" ref={listRef}>
        {state.data.map((p) => (
          <ProductCard key={p.id} product={p} onAdd={(prod) => void add(prod)} />
        ))}
      </ul>
    </section>
  )
}

export function ProductDetailPage({ id }: { id: string }) {
  const { state, reload } = useLoad<CatalogProduct>((s) => fetchCatalogProduct(id, s), id)
  const [specsOpen, setSpecsOpen] = useState(true)
  const p = state.status === 'ready' ? state.data : null

  function showSpecs() {
    setSpecsOpen(true)
    const el = document.getElementById('ozellikler')
    requestAnimationFrame(() => {
      el?.scrollIntoView({ block: 'start' })
      el?.querySelector('summary')?.focus()
    })
  }

  return (
    <ShopLayout>
      <nav className="ui-crumbs" aria-label="Konum">
        <ol>
          <li>
            <Link to="/" className="ui-crumbs__home">
              <Icon name="home" />
              Ana sayfa
            </Link>
          </li>
          <li>
            <Link to="/katalog">Katalog</Link>
          </li>
          {p && (
            <li>
              <Link to={catalogHref({ grup: p.groupId })}>{p.groupName}</Link>
            </li>
          )}
          {p && (
            <li>
              <span aria-current="page">{p.name}</span>
            </li>
          )}
        </ol>
      </nav>
      {state.status === 'loading' && (
        <div className="ui-detail" aria-busy="true">
          <div className="ui-skeleton ui-detail__skeleton-img" />
          <div className="ui-stack">
            <div className="ui-skeleton" style={{ height: '2.25rem', width: '80%' }} />
            <div className="ui-skeleton" style={{ height: '1rem', width: '40%' }} />
            <div className="ui-skeleton" style={{ height: '5rem' }} />
            <div className="ui-skeleton" style={{ height: '7rem' }} />
          </div>
          <span className="visually-hidden" role="status">
            Yükleniyor…
          </span>
        </div>
      )}
      {state.status === 'error' && (
        <ErrorAlert onRetry={state.notFound ? undefined : reload}>
          {state.notFound ? 'Ürün bulunamadı veya satışta değil.' : 'Ürün bilgileri alınamadı.'}
        </ErrorAlert>
      )}
      {p && (
        <>
          <article className="ui-detail" aria-labelledby="pdp-title">
            <Gallery key={p.id} product={p} />
            <div className="ui-detail__info">
              <div className="ui-detail__head">
                <p className="ui-detail__codes num">
                  <span>Barkod: {p.barcode}</span>
                  {p.code && <span>Ürün kodu: {p.code}</span>}
                </p>
                <h1 id="pdp-title">{p.name}</h1>
                <div className="ui-detail__links">
                  <button type="button" className="ui-linkbtn" onClick={showSpecs}>
                    Ürün özellikleri
                  </button>
                  <span>
                    Kategorideki{' '}
                    <Link to={catalogHref({ grup: p.groupId })} className="ui-linkbtn">
                      diğer ürünler
                    </Link>
                  </span>
                </div>
              </div>
              <div className="ui-detail__pricerow">
                <Price
                  size="lg"
                  value={p.price}
                  listValue={p.discountPercent ? p.listPrice : undefined}
                  discountPercent={p.discountPercent ?? undefined}
                  hideDiscount
                />
                <StockBadge inStock={p.stock === 'in_stock'} />
              </div>
              <AddToCartBox key={p.id} product={p} />
              <div className="ui-infobox">
                <Icon name="boxes" />
                <div>
                  <p>
                    <strong className="num">Koli içi: {p.caseQuantity} adet.</strong> Miktar {p.caseQuantity}{' '}
                    adedin katları halinde seçilir.
                  </p>
                  {p.discountPercent && (
                    <p>
                      Size özel <strong>{formatPercent(p.discountPercent)} iskonto</strong> uygulanmış
                      fiyattır.
                    </p>
                  )}
                  {p.stock !== 'in_stock' && <p>Stokta yok: tedarik süresi görüşülecek.</p>}
                </div>
              </div>
              <section aria-labelledby="perks-title">
                <h2 id="perks-title" className="ui-detail__subtitle">
                  Ayrıcalıklar
                </h2>
                <ul className="ui-perks">
                  {PERKS.map((x) => (
                    <li key={x.title}>
                      <span className="ui-trust__icon">
                        <Icon name={x.icon} />
                      </span>
                      <span>
                        <strong>{x.title}</strong>
                        <span className="muted">{x.text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </article>

          <div className="ui-accordions">
            <details
              id="ozellikler"
              className="ui-acc"
              open={specsOpen}
              onToggle={(e) => setSpecsOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary>
                <h2>Ürün özellikleri</h2>
                <Icon name="chevronDown" />
              </summary>
              <div className="ui-acc__body">
                {p.description && <p className="ui-desc">{p.description}</p>}
                <table className="ui-spec">
                  <tbody>
                    <tr>
                      <th scope="row">Barkod</th>
                      <td className="num">{p.barcode}</td>
                    </tr>
                    <tr>
                      <th scope="row">Ürün kodu</th>
                      <td>{p.code ?? '—'}</td>
                    </tr>
                    <tr>
                      <th scope="row">Koli içi adet</th>
                      <td className="num">{p.caseQuantity}</td>
                    </tr>
                    <tr>
                      <th scope="row">KDV oranı</th>
                      <td className="num">{formatPercent(p.vatRate)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Grup</th>
                      <td>
                        <Link to={catalogHref({ grup: p.groupId })}>{p.groupName}</Link>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
            <details className="ui-acc">
              <summary>
                <h2>Teslimat şekilleri</h2>
                <Icon name="chevronDown" />
              </summary>
              <div className="ui-acc__body">
                <p>Teslimat şeklini ön siparişi gönderirken seçersiniz:</p>
                <ul className="ui-acc__list">
                  {Object.values(DELIVERY_LABEL).map((l) => (
                    <li key={l}>
                      <Icon name="truck" />
                      {l}
                    </li>
                  ))}
                </ul>
                <p className="muted">
                  Sorularınız için{' '}
                  <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
                    WhatsApp<span className="visually-hidden"> (yeni sekmede açılır)</span>
                  </a>{' '}
                  veya telefonla ulaşın: {CONTACT.phone}
                </p>
              </div>
            </details>
          </div>

          <SimilarProducts key={`s-${p.id}`} product={p} />
        </>
      )}
    </ShopLayout>
  )
}
