// Marka logosu (K-63): yuvarlak monogram + "AMİSOS B2B" yazısı.
// Görseller frontend/public/brand/ altında; scripts/brand-assets.mjs ile kaynaktan üretilir.

/**
 * size: sm 32 px (Admin, çekmece), md 44 px (mağaza başlığı), lg 64 px (giriş kartı).
 * compact: telefonda yalnızca monogram + kısa yazı ("B2B" gizlenmez, "AMİSOS" kalır).
 */
export function BrandLogo({
  size = 'md',
  suffix,
  textless,
}: {
  size?: 'sm' | 'md' | 'lg'
  suffix?: string
  /** Yalnızca monogram (yazı ekran okuyucuya yine verilir). */
  textless?: boolean
}) {
  const px = size === 'sm' ? 32 : size === 'lg' ? 64 : 44
  return (
    <span className={`ui-logo ui-logo--${size}`} lang="tr">
      <img
        className="ui-logo__mark"
        src={px > 44 ? '/brand/logo-128.webp' : '/brand/logo-64.webp'}
        srcSet={
          px > 44
            ? '/brand/logo-128.webp 1x, /brand/logo-256.webp 2x'
            : '/brand/logo-64.webp 1x, /brand/logo-128.webp 2x'
        }
        width={px}
        height={px}
        alt=""
        decoding="async"
      />
      <span className={textless ? 'visually-hidden' : 'ui-logo__text'}>
        <span className="ui-logo__word">AMİSOS</span> <span className="ui-logo__b2b">B2B</span>
      </span>
      {suffix && <span className="ui-logo__suffix">{suffix}</span>}
    </span>
  )
}
