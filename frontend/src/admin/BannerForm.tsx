// K-65: Kampanya görseli (banner) ekleme / düzenleme formu. Görsel kütüphaneden seçilir (K-62).
import { useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  createBanner,
  fetchAdminProduct,
  fetchAdminProducts,
  fetchProductGroups,
  updateBanner,
  type AdminBanner,
  type AdminProduct,
  type BannerInput,
  type Media,
  type ProductGroup,
} from '../api'
import { Alert, Button, Field } from '../ui/components'
import { ProductImage } from '../ui/catalog'
import { networkMessage } from '../ui/networkMessage'
import { useDebounced } from '../ui/useDebounced'
import { endToDay, endToIso, istanbulDay, startToIso } from './bannerDates'
import { buildLink, parseLink, type LinkKind } from './bannerLink'
import { MediaPicker } from './MediaPicker'

type Errors = Partial<
  Record<'mediaId' | 'title' | 'subtitle' | 'linkPath' | 'startsAt' | 'endsAt' | 'form', string>
>

const KINDS: { value: LinkKind; label: string }[] = [
  { value: 'none', label: 'Yok' },
  { value: 'catalog', label: 'Katalog' },
  { value: 'group', label: 'Ürün grubu' },
  { value: 'product', label: 'Ürün' },
]

function ProductLinkPicker({
  id,
  onPick,
  invalid,
}: {
  id: string
  onPick: (p: { id: string; name: string }) => void
  invalid: boolean
}) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const [results, setResults] = useState<AdminProduct[] | null>(null)
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [failed, setFailed] = useState(false)

  // Düzenlemede kayıtlı ürünün adını göster.
  useEffect(() => {
    if (!id) return
    const c = new AbortController()
    fetchAdminProduct(id, c.signal)
      .then((p) => setSelected({ id: p.id, name: p.name }))
      .catch(() => {
        if (!c.signal.aborted) setSelected({ id, name: 'Ürün bulunamadı' })
      })
    return () => c.abort()
  }, [id])

  useEffect(() => {
    if (q.length < 2) return
    const c = new AbortController()
    fetchAdminProducts({ q, active: 'true', page: 1, pageSize: 8 }, c.signal)
      .then((r) => {
        setResults(r.items)
        setFailed(false)
      })
      .catch(() => {
        if (!c.signal.aborted) setFailed(true)
      })
    return () => c.abort()
  }, [q])

  const shown = q.length >= 2 ? results : null
  return (
    <div className="ui-stack">
      {selected && (
        <p className="ui-linkpick__selected">
          Seçili ürün: <strong>{selected.name}</strong>
        </p>
      )}
      <Field
        label="Ürün ara"
        htmlFor="bn-product-search"
        help="Ad, barkod veya kod yazın (en az 2 karakter)."
      >
        <input
          id="bn-product-search"
          className="ui-input"
          type="search"
          autoComplete="off"
          value={search}
          aria-invalid={invalid ? true : undefined}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>
      {failed && <Alert tone="danger">Ürünler aranamadı.</Alert>}
      {shown && shown.length === 0 && <p className="muted">Eşleşen aktif ürün yok.</p>}
      {shown && shown.length > 0 && (
        <ul className="ui-linkpick__list">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="ui-linkpick__item"
                aria-pressed={selected?.id === p.id}
                onClick={() => {
                  const v = { id: p.id, name: p.name }
                  setSelected(v)
                  onPick(v)
                }}
              >
                <span>{p.name}</span>
                <span className="muted num">{p.barcode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function BannerForm({
  banner,
  onCancel,
  onSaved,
}: {
  banner: AdminBanner | null
  onCancel: () => void
  onSaved: () => void
}) {
  const initialLink = parseLink(banner?.linkPath ?? null)
  const [media, setMedia] = useState<{ id: string; url: string; name: string } | null>(
    banner ? { id: banner.mediaId, url: banner.thumbUrl, name: banner.title } : null,
  )
  const [picker, setPicker] = useState(false)
  const [title, setTitle] = useState(banner?.title ?? '')
  const [subtitle, setSubtitle] = useState(banner?.subtitle ?? '')
  const [kind, setKind] = useState<LinkKind>(initialLink.kind)
  const [linkId, setLinkId] = useState(initialLink.id)
  const [isActive, setIsActive] = useState(banner?.isActive ?? true)
  const initialStart = banner?.startsAt ? istanbulDay(banner.startsAt) : ''
  const initialEnd = banner?.endsAt ? endToDay(banner.endsAt) : ''
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [groups, setGroups] = useState<ProductGroup[] | null>(null)
  const [groupsFailed, setGroupsFailed] = useState(false)

  useEffect(() => {
    if (kind !== 'group' || groups) return
    const c = new AbortController()
    fetchProductGroups(c.signal)
      .then(setGroups)
      .catch(() => {
        if (!c.signal.aborted) setGroupsFailed(true)
      })
    return () => c.abort()
  }, [kind, groups])

  function onPickMedia(items: Media[]) {
    const m = items[0]
    if (m) setMedia({ id: m.id, url: m.thumbUrl, name: m.filename })
    setPicker(false)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const next: Errors = {}
    if (!media) next.mediaId = 'Bir görsel seçin.'
    if (!title.trim()) next.title = 'Başlık zorunlu.'
    if ((kind === 'group' || kind === 'product') && !linkId) next.linkPath = 'Bağlantı için bir seçim yapın.'
    if (start && end && end < start) next.endsAt = 'Bitiş tarihi başlangıçtan önce olamaz.'
    setErrors(next)
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    const input: BannerInput = {
      mediaId: media!.id,
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      linkPath: buildLink(kind, linkId, banner?.linkPath ?? null),
      isActive,
      // Tarih değişmediyse kayıtlı değer olduğu gibi korunur.
      startsAt: start
        ? start === initialStart && banner?.startsAt
          ? banner.startsAt
          : startToIso(start)
        : null,
      endsAt: end ? (end === initialEnd && banner?.endsAt ? banner.endsAt : endToIso(end)) : null,
    }
    setBusy(true)
    try {
      if (banner) await updateBanner(banner.id, input)
      else await createBanner(input)
      onSaved()
    } catch (err) {
      setBusy(false)
      if (err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION') {
        const mapped: Errors = {}
        const f = err.fields ?? {}
        if (f.mediaId) mapped.mediaId = 'Görsel bulunamadı; yeniden seçin.'
        if (f.title) mapped.title = 'Başlığı kontrol edin (en fazla 200 karakter).'
        if (f.subtitle) mapped.subtitle = 'Alt başlığı kontrol edin (en fazla 300 karakter).'
        if (f.linkPath) mapped.linkPath = 'Bağlantıyı kontrol edin.'
        if (f.startsAt) mapped.startsAt = 'Başlangıç tarihini kontrol edin.'
        if (f.endsAt) mapped.endsAt = 'Bitiş tarihini kontrol edin.'
        if (Object.keys(mapped).length === 0) mapped.form = 'Formdaki bilgileri kontrol edin.'
        setErrors(mapped)
      } else if (err instanceof ApiError && err.status === 404) {
        setErrors({ form: 'Kampanya görseli bulunamadı; liste yenilenmeli.' })
      } else {
        setErrors({ form: networkMessage(err, 'Kaydedilemedi. Lütfen tekrar deneyin.') })
      }
    }
  }

  return (
    <form className="ui-card ui-card__body ui-stack ui-bannerform" onSubmit={onSubmit} noValidate>
      {errors.form && <Alert tone="danger">{errors.form}</Alert>}

      <fieldset className="ui-fieldset">
        <legend className="ui-label">Görsel</legend>
        <div className="ui-bannerform__media">
          <div className="ui-bannerform__preview">
            {media ? (
              <ProductImage src={media.url} alt={media.name} ratio="3 / 1" fit="cover" />
            ) : (
              <ProductImage alt="" ratio="3 / 1" />
            )}
          </div>
          <div className="ui-stack">
            <Button
              variant="secondary"
              icon="plus"
              onClick={() => setPicker(true)}
              aria-invalid={errors.mediaId ? true : undefined}
            >
              {media ? 'Görseli değiştir' : 'Kütüphaneden görsel seç'}
            </Button>
            <p className="ui-help">
              Önerilen boyut: 1200 × 400 piksel (3:1). Önemli içeriği görselin ortasına koyun; küçük
              ekranlarda kenarlar kırpılır.
            </p>
            {errors.mediaId && <span className="ui-error">{errors.mediaId}</span>}
          </div>
        </div>
      </fieldset>

      <Field
        label="Başlık"
        htmlFor="bn-title"
        help="Görselin alternatif metni olarak da kullanılır."
        error={errors.title}
      >
        <input
          id="bn-title"
          className="ui-input"
          maxLength={200}
          value={title}
          aria-invalid={errors.title ? true : undefined}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="Alt başlık (isteğe bağlı)" htmlFor="bn-subtitle" error={errors.subtitle}>
        <input
          id="bn-subtitle"
          className="ui-input"
          maxLength={300}
          value={subtitle}
          aria-invalid={errors.subtitle ? true : undefined}
          onChange={(e) => setSubtitle(e.target.value)}
        />
      </Field>

      <fieldset className="ui-choice-group">
        <legend className="ui-label">Bağlantı</legend>
        <div className="ui-chips ui-chips--wrap">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className="ui-chip"
              aria-pressed={kind === k.value}
              onClick={() => {
                setKind(k.value)
                setLinkId('')
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
        {kind === 'keep' && (
          <p className="muted">
            Mevcut bağlantı korunuyor: <span className="num">{banner?.linkPath}</span>. Değiştirmek için bir
            seçenek belirleyin.
          </p>
        )}
        {kind === 'group' && (
          <Field label="Ürün grubu" htmlFor="bn-group" error={errors.linkPath}>
            <select
              id="bn-group"
              className="ui-select"
              value={linkId}
              aria-invalid={errors.linkPath ? true : undefined}
              onChange={(e) => setLinkId(e.target.value)}
            >
              <option value="">Grup seçin</option>
              {groups?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {groupsFailed && <span className="ui-error">Gruplar alınamadı.</span>}
          </Field>
        )}
        {kind === 'product' && (
          <>
            <ProductLinkPicker
              key="p"
              id={initialLink.kind === 'product' ? linkId : ''}
              invalid={!!errors.linkPath}
              onPick={(p) => setLinkId(p.id)}
            />
            {errors.linkPath && <span className="ui-error">{errors.linkPath}</span>}
          </>
        )}
        {kind === 'catalog' && <p className="muted">Banner tüm ürünler sayfasına gider.</p>}
      </fieldset>

      <div className="ui-form-grid ui-form-grid--2">
        <Field
          label="Başlangıç tarihi (isteğe bağlı)"
          htmlFor="bn-start"
          help="İstanbul saatiyle gün başında yayına girer."
          error={errors.startsAt}
        >
          <input
            id="bn-start"
            className="ui-input"
            type="date"
            value={start}
            aria-invalid={errors.startsAt ? true : undefined}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field
          label="Bitiş tarihi (isteğe bağlı)"
          htmlFor="bn-end"
          help="Bu günün sonuna kadar yayında kalır."
          error={errors.endsAt}
        >
          <input
            id="bn-end"
            className="ui-input"
            type="date"
            value={end}
            aria-invalid={errors.endsAt ? true : undefined}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>

      <label className="ui-check" htmlFor="bn-active">
        <input
          id="bn-active"
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <span>Aktif (işaretli değilse bayilere gösterilmez)</span>
      </label>

      <div className="ui-actions">
        <Button type="submit" disabled={busy}>
          {busy ? 'Kaydediliyor…' : banner ? 'Değişiklikleri kaydet' : 'Kampanya görselini ekle'}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Vazgeç
        </Button>
      </div>

      {picker && (
        <MediaPicker single excludeIds={[]} onClose={() => setPicker(false)} onConfirm={onPickMedia} />
      )}
    </form>
  )
}
