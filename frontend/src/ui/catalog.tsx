// Katalog ve görsel yönetimi için ortak bileşenler (K-40, K-62).
import { useState, type ReactNode } from 'react'
import type { CatalogProduct } from '../api'
import { Link } from '../Link'
import { Price } from './components'
import { formatPercent } from './format'
import { Icon } from './Icon'

/**
 * Sabit oranlı ürün görseli (yerleşim kayması olmaz). Görsel yoksa veya yüklenemezse yer tutucu ikon.
 * `alt` ürün adıdır; yer tutucu dekoratiftir.
 */
export function ProductImage({
  src,
  alt,
  ratio = '4 / 3',
  fit = 'cover',
}: {
  src?: string
  alt: string
  ratio?: string
  fit?: 'cover' | 'contain'
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const ok = src && failed !== src
  return (
    <div className="ui-img" style={{ aspectRatio: ratio }}>
      {ok ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          style={{ objectFit: fit }}
          onError={() => setFailed(src)}
        />
      ) : (
        <Icon name="box" />
      )}
    </div>
  )
}

export function LoadingCard({ rows = 4 }: { rows?: number }) {
  return (
    <div className="ui-card ui-card__body ui-stack" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ui-skeleton" style={{ height: '2.5rem' }} />
      ))}
      <span className="visually-hidden" role="status">
        Yükleniyor…
      </span>
    </div>
  )
}

export function ErrorAlert({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="ui-alert ui-alert--danger" role="alert">
      <Icon name="warning" />
      <div>
        {children}{' '}
        {onRetry && (
          <button type="button" className="ui-linklike" onClick={onRetry}>
            Tekrar dene
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- Bayi ürün kartı (GR-URN-003, GR-URN-002, GR-FIY-003, K-10, K-18) ----------
/**
 * Kare görsel, sol üstte rozetler (Stokta yok, iskonto), barkod, ad (2 satır), koli içi, fiyat ve
 * sağ altta "sepete ekle" ikon butonu. `onAdd` verilmezse buton ürün detayına götürür
 * (sepet bağlanınca `onAdd` ile değişir). Kartın tamamı ürün detayına tıklanabilir.
 */
export function ProductCard({
  product: p,
  onAdd,
  headingLevel = 3,
}: {
  product: CatalogProduct
  onAdd?: (product: CatalogProduct) => void
  headingLevel?: 2 | 3
}) {
  const href = `/urun/${encodeURIComponent(p.id)}`
  const out = p.stock !== 'in_stock'
  const H = headingLevel === 2 ? 'h2' : 'h3'
  const addLabel = `Sepete ekle: ${p.name}`
  return (
    <li className="ui-pcard">
      <div className="ui-pcard__media">
        <ProductImage src={p.images[0]?.thumbUrl} alt="" ratio="1" fit="contain" />
        {(out || p.discountPercent) && (
          <div className="ui-pcard__badges">
            {out && <span className="ui-pill ui-pill--warning">Stokta yok</span>}
            {p.discountPercent && (
              <span className="ui-pill ui-pill--accent">{formatPercent(p.discountPercent)} iskonto</span>
            )}
          </div>
        )}
      </div>
      <div className="ui-pcard__body">
        <p className="ui-pcard__barcode num">
          <span className="visually-hidden">Barkod: </span>
          {p.barcode}
        </p>
        <H className="ui-pcard__name">
          <Link to={href} className="ui-pcard__link">
            {p.name}
          </Link>
        </H>
        <p className="ui-pcard__case num">Koli içi: {p.caseQuantity} adet</p>
        <div className="ui-pcard__foot">
          <Price
            value={p.price}
            listValue={p.discountPercent ? p.listPrice : undefined}
            discountPercent={p.discountPercent ?? undefined}
            hideDiscount
          />
          {onAdd ? (
            <button
              type="button"
              className="ui-pcard__add"
              aria-label={addLabel}
              title="Sepete ekle"
              onClick={() => onAdd(p)}
            >
              <Icon name="bagPlus" />
            </button>
          ) : (
            <Link to={href} className="ui-pcard__add" aria-label={addLabel} title="Sepete ekle">
              <Icon name="bagPlus" />
            </Link>
          )}
        </div>
      </div>
    </li>
  )
}

export function ProductCardSkeleton() {
  return (
    <li className="ui-pcard ui-pcard--skeleton" aria-hidden="true">
      <div className="ui-pcard__media">
        <div className="ui-skeleton" style={{ aspectRatio: '1' }} />
      </div>
      <div className="ui-pcard__body">
        <div className="ui-skeleton" style={{ height: '0.75rem', width: '45%' }} />
        <div className="ui-skeleton" style={{ height: '2.5rem' }} />
        <div className="ui-skeleton" style={{ height: '1.5rem', width: '60%' }} />
      </div>
    </li>
  )
}

/** Grup küçük resmi (yoksa ikon); sabit boyut, yerleşim kayması yok. */
export function GroupThumb({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="ui-groupthumb" aria-hidden="true">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <Icon name="boxes" />
      )}
    </span>
  )
}
