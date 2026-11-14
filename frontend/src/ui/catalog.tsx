// Katalog ve görsel yönetimi için ortak bileşenler (K-40, K-62).
import { useState, type ReactNode } from 'react'
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
