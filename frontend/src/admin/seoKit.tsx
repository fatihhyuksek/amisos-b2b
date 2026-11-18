// K-82: Admin SEO bileşenleri: karakter sayacı, Google arama sonucu önizlemesi, ortak SEO alanları.
import { useId } from 'react'
import { Field } from '../ui/components'

export const SEO_TITLE_MAX = 70
export const SEO_DESC_MAX = 170

/** Türkçe karakterleri sadeleştirip küçük harf, tireli adres parçası üretir (sunucu ile aynı kural). */
export function slugify(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/&/g, ' ve ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 100
}

/** "42 / 70" sayacı; önerilen uzunluğu aşınca uyarı rengi. */
export function CharCount({ value, max }: { value: number; max: number }) {
  return (
    <span className={`adm-charcount num${value > max ? ' adm-charcount--over' : ''}`}>
      {value} / {max}
    </span>
  )
}

/** Google arama sonucu görünümü (başlık, adres, açıklama). Başlık/açıklama gerçek uzunlukta kırpılır. */
export function SearchPreview({
  title,
  url,
  description,
}: {
  title: string
  url: string
  description: string
}) {
  const t = title.length > SEO_TITLE_MAX ? `${title.slice(0, SEO_TITLE_MAX - 1)}…` : title
  const d = description.length > SEO_DESC_MAX ? `${description.slice(0, SEO_DESC_MAX - 1)}…` : description
  return (
    <figure className="adm-serp" aria-label="Google arama sonucu önizlemesi">
      <figcaption className="adm-serp__cap">Google arama sonucu önizlemesi</figcaption>
      <div className="adm-serp__card">
        <p className="adm-serp__url">{url}</p>
        <p className="adm-serp__title">{t || 'Sayfa başlığı'}</p>
        <p className="adm-serp__desc">{d || 'Sayfa açıklaması burada görünür.'}</p>
      </div>
    </figure>
  )
}

/** SEO başlığı ve açıklaması (sayaçlı). Boş bırakılırsa ürün/grup adı ve açıklama kullanılır. */
export function SeoTextFields({
  title,
  description,
  onTitle,
  onDescription,
  titlePlaceholder,
  errorTitle,
  errorDescription,
  descriptionRows = 3,
}: {
  title: string
  description: string
  onTitle: (v: string) => void
  onDescription: (v: string) => void
  titlePlaceholder?: string
  errorTitle?: string
  errorDescription?: string
  descriptionRows?: number
}) {
  const id = useId()
  return (
    <>
      <Field
        label="SEO başlığı"
        htmlFor={`${id}-t`}
        help="Boşsa ad kullanılır. Arama sonuçlarında görünen başlık."
        error={errorTitle}
      >
        <input
          id={`${id}-t`}
          className="ui-input"
          value={title}
          maxLength={SEO_TITLE_MAX + 20}
          placeholder={titlePlaceholder}
          aria-invalid={errorTitle ? true : undefined}
          onChange={(e) => onTitle(e.target.value)}
        />
        <CharCount value={title.length} max={SEO_TITLE_MAX} />
      </Field>
      <Field
        label="SEO açıklaması"
        htmlFor={`${id}-d`}
        help="Arama sonucunda başlığın altında görünen kısa özet."
        error={errorDescription}
      >
        <textarea
          id={`${id}-d`}
          className="ui-textarea"
          rows={descriptionRows}
          value={description}
          aria-invalid={errorDescription ? true : undefined}
          onChange={(e) => onDescription(e.target.value)}
        />
        <CharCount value={description.length} max={SEO_DESC_MAX} />
      </Field>
    </>
  )
}
