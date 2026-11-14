// GR-URN-003, GR-URN-002, GR-FIY-001, GR-FIY-003, K-40, K-18, K-10, K-11: Ürün detayı ve galeri.
// Sepete ekleme alanı: koli adımlı miktar, sepette varsa mevcut miktar (GR-SIP-003, GR-SIP-004, K-20, K-21).
import { useState, type KeyboardEvent } from 'react'
import { useCart } from '../shop/cart'
import { useAddToCart } from '../shop/useAddToCart'
import { fetchCatalogProduct, type CatalogProduct } from '../api'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { Badge, Button, Price, QuantityStepper, StockBadge } from '../ui/components'
import { ErrorAlert, ProductImage } from '../ui/catalog'
import { formatPercent } from '../ui/format'
import { Icon } from '../ui/Icon'
import { catalogHref } from '../shop/catalogHref'
import { ShopLayout } from './ShopLayout'

function Gallery({ product }: { product: CatalogProduct }) {
  const imgs = product.images
  const [index, setIndex] = useState(0)
  const go = (i: number) => setIndex(Math.min(imgs.length - 1, Math.max(0, i)))

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

  if (imgs.length === 0)
    return (
      <div className="ui-gallery">
        <div className="ui-gallery__main">
          <ProductImage alt="" ratio="1" />
        </div>
      </div>
    )

  return (
    <div className="ui-gallery" role="group" aria-label="Ürün görselleri">
      <div
        className="ui-gallery__main"
        tabIndex={imgs.length > 1 ? 0 : undefined}
        onKeyDown={imgs.length > 1 ? onKeyDown : undefined}
        aria-label={
          imgs.length > 1 ? `Görsel ${index + 1} / ${imgs.length}, ok tuşlarıyla gezinin` : undefined
        }
      >
        {/* key: görsel değişince yer tutucu/hata durumu sıfırlanır */}
        <ProductImage
          key={imgs[index].url}
          src={imgs[index].url}
          alt={product.name}
          ratio="1"
          fit="contain"
        />
        {imgs.length > 1 && (
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
            <span className="ui-gallery__count num" aria-live="polite">
              {index + 1} / {imgs.length}
            </span>
          </>
        )}
      </div>
      {imgs.length > 1 && (
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
      <p className="ui-buybox__note">
        <Icon name="info" />
        Miktar, koli içi adedin ({product.caseQuantity}) katları halinde seçilir.
        {product.stock !== 'in_stock' && ' Stokta yok: tedarik süresi görüşülecek.'}
      </p>
    </div>
  )
}

export function ProductDetailPage({ id }: { id: string }) {
  const { state, reload } = useLoad<CatalogProduct>((s) => fetchCatalogProduct(id, s), id)
  const p = state.status === 'ready' ? state.data : null
  return (
    <ShopLayout>
      <nav className="ui-crumbs" aria-label="Konum">
        <ol>
          <li>
            <Link to="/">Ana sayfa</Link>
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
        <article className="ui-detail">
          <Gallery key={p.id} product={p} />
          <div className="ui-detail__info">
            <div className="ui-detail__head">
              <p className="ui-detail__codes num">
                <span>Barkod: {p.barcode}</span>
                {p.code && <span>Ürün kodu: {p.code}</span>}
              </p>
              <h1>{p.name}</h1>
              <div className="ui-badges">
                <StockBadge inStock={p.stock === 'in_stock'} />
                {p.discountPercent && (
                  <span className="ui-pill ui-pill--accent">{formatPercent(p.discountPercent)} iskonto</span>
                )}
                <Badge tone="neutral">{p.groupName}</Badge>
              </div>
            </div>
            <div className="ui-detail__pricebox">
              <Price
                size="lg"
                value={p.price}
                listValue={p.discountPercent ? p.listPrice : undefined}
                discountPercent={p.discountPercent ?? undefined}
              />
              <dl className="ui-detail__facts">
                <div>
                  <dt>Koli içi</dt>
                  <dd className="num">{p.caseQuantity} adet</dd>
                </div>
                <div>
                  <dt>KDV oranı</dt>
                  <dd className="num">{formatPercent(p.vatRate)}</dd>
                </div>
              </dl>
            </div>
            <AddToCartBox key={p.id} product={p} />
            {p.description && (
              <section aria-labelledby="desc-h" className="ui-detail__desc">
                <h2 id="desc-h">Açıklama</h2>
                <p className="ui-desc">{p.description}</p>
              </section>
            )}
          </div>
        </article>
      )}
    </ShopLayout>
  )
}
