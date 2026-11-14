// GR-URN-003, GR-FIY-001, K-40, K-18, K-10, K-11: Ürün detayı ve görsel galerisi.
import { useState, type KeyboardEvent } from 'react'
import { fetchCatalogProduct, type CatalogProduct } from '../api'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { Badge, Price, StockBadge } from '../ui/components'
import { ErrorAlert, LoadingCard, ProductImage } from '../ui/catalog'
import { formatPercent } from '../ui/format'
import { ShopLayout } from './ShopLayout'

function Gallery({ product }: { product: CatalogProduct }) {
  const imgs = product.images
  const [index, setIndex] = useState(0)
  const go = (i: number) => setIndex(Math.min(imgs.length - 1, Math.max(0, i)))

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(index - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(index + 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      go(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      go(imgs.length - 1)
    }
  }

  if (imgs.length === 0)
    return (
      <div className="ui-gallery__main">
        <ProductImage alt={product.name} ratio="4 / 3" />
      </div>
    )

  return (
    <div className="ui-gallery" role="group" aria-label="Ürün görselleri">
      <div
        className="ui-gallery__main"
        tabIndex={imgs.length > 1 ? 0 : undefined}
        onKeyDown={imgs.length > 1 ? onKeyDown : undefined}
        aria-label={imgs.length > 1 ? 'Büyük görsel, ok tuşlarıyla gezinin' : undefined}
      >
        {/* key: görsel değişince yer tutucu/hata durumu sıfırlanır */}
        <ProductImage
          key={imgs[index].url}
          src={imgs[index].url}
          alt={product.name}
          ratio="4 / 3"
          fit="contain"
        />
      </div>
      {imgs.length > 1 && (
        <>
          <div className="ui-gallery__nav">
            <button
              type="button"
              className="ui-button ui-button--secondary ui-button--sm"
              onClick={() => go(index - 1)}
              disabled={index === 0}
            >
              Önceki
            </button>
            <span aria-live="polite">
              Görsel {index + 1} / {imgs.length}
            </span>
            <button
              type="button"
              className="ui-button ui-button--secondary ui-button--sm"
              onClick={() => go(index + 1)}
              disabled={index === imgs.length - 1}
            >
              Sonraki
            </button>
          </div>
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
                  <ProductImage src={im.thumbUrl} alt={`${product.name}, küçük resim ${i + 1}`} ratio="1" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function ProductDetailPage({ id }: { id: string }) {
  const { state, reload } = useLoad<CatalogProduct>((s) => fetchCatalogProduct(id, s), id)
  return (
    <ShopLayout>
      <div>
        <Link
          to="/"
          className="ui-button ui-button--secondary ui-button--sm"
          style={{ textDecoration: 'none' }}
        >
          ← Kataloğa dön
        </Link>
      </div>
      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && (
        <ErrorAlert onRetry={state.notFound ? undefined : reload}>
          {state.notFound ? 'Ürün bulunamadı veya satışta değil.' : 'Ürün bilgileri alınamadı.'}
        </ErrorAlert>
      )}
      {state.status === 'ready' && (
        <article className="ui-detail">
          <Gallery key={state.data.id} product={state.data} />
          <div className="ui-detail__info">
            <div className="ui-badges">
              <StockBadge inStock={state.data.stock === 'in_stock'} />
              <Badge tone="neutral">{state.data.groupName}</Badge>
            </div>
            <h1>{state.data.name}</h1>
            <Price
              value={state.data.price}
              listValue={state.data.discountPercent ? state.data.listPrice : undefined}
              discountPercent={state.data.discountPercent ?? undefined}
            />
            <dl className="ui-dl">
              <div>
                <dt>Barkod</dt>
                <dd className="num">{state.data.barcode}</dd>
              </div>
              {state.data.code && (
                <div>
                  <dt>Ürün kodu</dt>
                  <dd>{state.data.code}</dd>
                </div>
              )}
              <div>
                <dt>Koli içi adet</dt>
                <dd className="num">{state.data.caseQuantity} adet</dd>
              </div>
              <div>
                <dt>KDV oranı</dt>
                <dd className="num">{formatPercent(state.data.vatRate)}</dd>
              </div>
            </dl>
            {state.data.description && (
              <section aria-labelledby="desc-h">
                <h2 id="desc-h">Açıklama</h2>
                <p className="ui-desc">{state.data.description}</p>
              </section>
            )}
          </div>
        </article>
      )}
    </ShopLayout>
  )
}
