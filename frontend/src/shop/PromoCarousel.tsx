// Kampanya alanı (K-65): birden çok banner için erişilebilir carousel.
// Otomatik geçiş yok (WCAG 2.2.2); oklar, noktalar, klavye (←/→) ve kaydırma (dokunmatik) ile gezinilir.
// Banner yoksa sade duyuru kartı gösterilir.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link } from '../Link'
import { Icon } from '../ui/Icon'
import { useShopMode } from './mode'
import type { Banner } from './useBanners'

export function AnnouncementCard() {
  const mode = useShopMode()
  const dealer = mode === 'dealer'
  return (
    <section className="ui-promo" aria-labelledby="promo-title">
      <div className="ui-promo__text">
        <p className="ui-promo__eyebrow">Duyuru</p>
        <h2 id="promo-title">
          {dealer ? 'Yeni sezon ürünleri katalogda' : 'Züccaciye ürünlerinde toptan fiyatlar'}
        </h2>
        <p>
          {dealer
            ? 'Güncel fiyatlarınız ve stok durumu ile tüm ürünlere göz atın.'
            : 'Mutfak eşyaları ve dekorasyon ürünlerini inceleyin; bayiye özel fiyatlar için başvurun.'}
        </p>
        <span className="ui-promo__ctas">
          <Link to="/katalog" className="ui-button ui-button--primary ui-promo__cta">
            Kataloğa git
            <Icon name="arrowRight" />
          </Link>
          {mode === 'guest' && (
            <Link to="/basvuru" className="ui-button ui-button--secondary ui-promo__cta">
              Bayi ol
            </Link>
          )}
        </span>
      </div>
      <div className="ui-promo__art" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  )
}

function Slide({ banner }: { banner: Banner }) {
  const img = (
    <>
      <img src={banner.imageUrl} alt={banner.alt} decoding="async" />
      {banner.subtitle && <span className="ui-carousel__caption">{banner.subtitle}</span>}
    </>
  )
  return banner.href ? (
    <Link to={banner.href} className="ui-carousel__link">
      {img}
    </Link>
  ) : (
    <div className="ui-carousel__link">{img}</div>
  )
}

export function PromoCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0)
  const startX = useRef<number | null>(null)
  if (banners.length === 0) return <AnnouncementCard />

  const count = banners.length
  const current = Math.min(index, count - 1)
  const go = (i: number) => setIndex((i + count) % count)

  function onKeyDown(e: KeyboardEvent) {
    if (count < 2) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(current - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(current + 1)
    }
  }
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse') startX.current = e.clientX
  }
  function onPointerUp(e: PointerEvent) {
    if (startX.current === null) return
    const dx = e.clientX - startX.current
    startX.current = null
    if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1))
  }

  return (
    <section
      className="ui-carousel"
      aria-roledescription="carousel"
      aria-label="Kampanyalar"
      onKeyDown={onKeyDown}
    >
      <div className="ui-carousel__viewport" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div className="ui-carousel__track" style={{ transform: `translateX(${-100 * current}%)` }}>
          {banners.map((b, i) => (
            <div
              key={b.id}
              className="ui-carousel__slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count}`}
              inert={i !== current}
            >
              <Slide banner={b} />
            </div>
          ))}
        </div>
      </div>
      {count > 1 && (
        <>
          <button
            type="button"
            className="ui-carousel__arrow ui-carousel__arrow--prev"
            aria-label="Önceki kampanya"
            onClick={() => go(current - 1)}
          >
            <Icon name="chevronLeft" />
          </button>
          <button
            type="button"
            className="ui-carousel__arrow ui-carousel__arrow--next"
            aria-label="Sonraki kampanya"
            onClick={() => go(current + 1)}
          >
            <Icon name="chevronRight" />
          </button>
          <div className="ui-carousel__dots">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                className="ui-carousel__dot"
                aria-label={`${i + 1}. kampanya`}
                aria-current={i === current ? 'true' : undefined}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <p className="visually-hidden" aria-live="polite">
            Kampanya {current + 1} / {count}
          </p>
        </>
      )}
    </section>
  )
}
