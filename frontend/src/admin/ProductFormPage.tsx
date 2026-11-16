// GR-URN-001, K-14, K-16, K-30, K-32, K-11, K-62: Ürün ekleme / düzenleme ve görsel seçimi.
import { useRef, useState, type FormEvent } from 'react'
import {
  ApiError,
  createProduct,
  fetchAdminProduct,
  fetchProductGroups,
  updateProduct,
  type AdminProduct,
  type Media,
  type ProductGroup,
  type ProductInput,
  type StockStatus,
} from '../api'
import { Link } from '../Link'
import { replace, useRoute } from '../router'
import { Alert, Button, Checkbox, Field } from '../ui/components'
import { ErrorAlert, LoadingCard, ProductImage } from '../ui/catalog'
import { networkMessage } from '../ui/networkMessage'
import { AdminLayout } from './AdminLayout'
import { MediaPicker } from './MediaPicker'
import { useLoad } from './useLoad'

interface SelImage {
  mediaId: string
  url: string
  thumbUrl: string
  label: string
}

interface Values {
  groupId: string
  barcode: string
  code: string
  name: string
  description: string
  caseQuantity: string
  listPrice: string
  vatRate: string
  stockStatus: StockStatus
  isActive: boolean
  isFeatured: boolean
}

type Errors = Partial<Record<keyof Values, string>>

const EMPTY: Values = {
  groupId: '',
  barcode: '',
  code: '',
  name: '',
  description: '',
  caseQuantity: '',
  listPrice: '',
  vatRate: '20',
  stockStatus: 'in_stock',
  isActive: true,
  isFeatured: false,
}

/** "19,99" ve "19.99" kabul edilir; gönderirken noktalı biçime çevrilir. */
function normalizeDecimal(v: string): string | null {
  const t = v.trim().replace(',', '.')
  return /^\d+(\.\d{1,2})?$/.test(t) ? t : null
}

function fromProduct(p: AdminProduct): Values {
  return {
    groupId: p.groupId,
    barcode: p.barcode,
    code: p.code ?? '',
    name: p.name,
    description: p.description ?? '',
    caseQuantity: String(p.caseQuantity),
    listPrice: p.listPrice.replace('.', ','),
    vatRate: String(Number(p.vatRate)).replace('.', ','),
    stockStatus: p.stockStatus,
    isActive: p.isActive,
    isFeatured: p.isFeatured ?? false,
  }
}

function validate(v: Values): Errors {
  const e: Errors = {}
  if (!v.groupId) e.groupId = 'Ürün grubu seçin.'
  if (!v.barcode.trim()) e.barcode = 'Barkod zorunludur.'
  if (!v.name.trim()) e.name = 'Ürün adı zorunludur.'
  if (!/^\d+$/.test(v.caseQuantity.trim()) || Number(v.caseQuantity) < 1)
    e.caseQuantity = 'En az 1 olan bir tam sayı girin.'
  if (normalizeDecimal(v.listPrice) === null) e.listPrice = 'Fiyatı 19,99 biçiminde girin.'
  const vat = normalizeDecimal(v.vatRate)
  if (vat === null || Number(vat) > 99.99) e.vatRate = '0 ile 99,99 arasında bir oran girin.'
  return e
}

const FIELD_KEYS = new Set<string>(Object.keys(EMPTY))

export function ProductFormPage({ id }: { id?: string }) {
  const { state, reload } = useLoad<{ product: AdminProduct | null; groups: ProductGroup[] }>(
    async (signal) => {
      const [groups, product] = await Promise.all([
        fetchProductGroups(signal),
        id ? fetchAdminProduct(id, signal) : Promise.resolve(null),
      ])
      return { product, groups }
    },
    id ?? 'new',
  )

  return (
    <AdminLayout
      title={
        id ? (state.status === 'ready' && state.data.product ? state.data.product.name : 'Ürün') : 'Ürün ekle'
      }
      actions={
        <Link to="/yonetim/urunler" className="ui-button ui-button--secondary">
          Ürün listesine dön
        </Link>
      }
    >
      {state.status === 'loading' && <LoadingCard />}
      {state.status === 'error' && (
        <ErrorAlert onRetry={state.notFound ? undefined : reload}>
          {state.notFound ? 'Ürün bulunamadı.' : 'Ürün bilgileri alınamadı.'}
        </ErrorAlert>
      )}
      {state.status === 'ready' && (
        <ProductForm
          key={state.data.product?.updatedAt ?? 'new'}
          product={state.data.product}
          groups={state.data.groups}
        />
      )}
    </AdminLayout>
  )
}

function ProductForm({ product, groups }: { product: AdminProduct | null; groups: ProductGroup[] }) {
  const { query } = useRoute()
  const [values, setValues] = useState<Values>(product ? fromProduct(product) : EMPTY)
  const [images, setImages] = useState<SelImage[]>(
    (product?.images ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({ mediaId: i.mediaId, url: i.url, thumbUrl: i.thumbUrl, label: product?.name ?? '' })),
  )
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(query.get('kaydedildi') === '1')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const set = <K extends keyof Values>(k: K, v: Values[K]) => {
    setValues((s) => ({ ...s, [k]: v }))
    setSaved(false)
  }

  function focusFirstError() {
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  function move(i: number, d: -1 | 1) {
    setImages((cur) => {
      const j = i + d
      if (j < 0 || j >= cur.length) return cur
      const next = cur.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setSaved(false)
  }

  function addMedia(items: Media[]) {
    setImages((cur) => [
      ...cur,
      ...items
        .filter((m) => !cur.some((c) => c.mediaId === m.id))
        .map((m) => ({ mediaId: m.id, url: m.url, thumbUrl: m.thumbUrl, label: m.filename })),
    ])
    setPicking(false)
    setSaved(false)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSaved(false)
    const next = validate(values)
    setErrors(next)
    if (Object.keys(next).length > 0) {
      focusFirstError()
      return
    }
    const input: ProductInput = {
      groupId: values.groupId,
      barcode: values.barcode.trim(),
      code: values.code.trim() || null,
      name: values.name.trim(),
      description: values.description.trim() || null,
      caseQuantity: Number(values.caseQuantity),
      listPrice: normalizeDecimal(values.listPrice)!,
      vatRate: normalizeDecimal(values.vatRate)!,
      stockStatus: values.stockStatus,
      isActive: values.isActive,
      isFeatured: values.isFeatured,
      mediaIds: images.map((i) => i.mediaId),
    }
    setBusy(true)
    try {
      if (product) {
        await updateProduct(product.id, input)
        setSaved(true)
      } else {
        const created = await createProduct(input)
        replace(`/yonetim/urunler/${encodeURIComponent(created.id)}?kaydedildi=1`)
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'DUPLICATE_BARCODE') {
        setErrors({ barcode: 'Bu barkodla kayıtlı başka bir ürün var.' })
        focusFirstError()
      } else if (err instanceof ApiError && err.status === 409 && err.code === 'DUPLICATE_CODE') {
        setErrors({ code: 'Bu ürün koduyla kayıtlı başka bir ürün var.' })
        focusFirstError()
      } else if (err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION') {
        const mapped: Errors = {}
        for (const k of Object.keys(err.fields ?? {})) {
          if (FIELD_KEYS.has(k)) mapped[k as keyof Values] = 'Geçersiz değer.'
        }
        setErrors(mapped)
        if (Object.keys(mapped).length === 0) setFormError('Girilen bilgiler geçersiz.')
        else focusFirstError()
      } else if (err instanceof ApiError && err.status === 404) {
        setFormError('Ürün bulunamadı.')
      } else {
        setFormError(networkMessage(err, 'Ürün kaydedilemedi. Lütfen daha sonra tekrar deneyin.'))
      }
    } finally {
      setBusy(false)
    }
  }

  const inv = (k: keyof Values) => (errors[k] ? true : undefined)
  const text = (k: keyof Values, v: string) => ({
    value: v,
    'aria-invalid': inv(k),
    onChange: (e: { target: { value: string } }) => set(k, e.target.value as never),
  })

  return (
    <>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="ui-stack">
        {saved && <Alert tone="info">Ürün kaydedildi.</Alert>}
        {formError && <Alert tone="danger">{formError}</Alert>}

        <section className="ui-card ui-card__body ui-form-section" aria-labelledby="sec-prod">
          <h2 id="sec-prod">Ürün bilgileri</h2>
          {groups.length === 0 && (
            <Alert tone="warning">
              Önce bir ürün grubu oluşturun: <Link to="/yonetim/urun-gruplari">Ürün grupları</Link>
            </Alert>
          )}
          <div className="ui-form-grid ui-form-grid--2">
            <Field label="Ürün grubu" htmlFor="p-group" error={errors.groupId}>
              <select
                id="p-group"
                className="ui-select"
                value={values.groupId}
                aria-invalid={inv('groupId')}
                onChange={(e) => set('groupId', e.target.value)}
              >
                <option value="">Seçin</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.isActive ? '' : ' (pasif)'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ürün adı" htmlFor="p-name" error={errors.name}>
              <input id="p-name" className="ui-input" {...text('name', values.name)} />
            </Field>
            <Field label="Barkod" htmlFor="p-barcode" error={errors.barcode}>
              <input
                id="p-barcode"
                className="ui-input"
                inputMode="numeric"
                {...text('barcode', values.barcode)}
              />
            </Field>
            <Field label="Ürün kodu (isteğe bağlı)" htmlFor="p-code" error={errors.code}>
              <input id="p-code" className="ui-input" {...text('code', values.code)} />
            </Field>
            <Field
              label="Koli içi adet"
              htmlFor="p-case"
              error={errors.caseQuantity}
              help="Tek satılan ürünlerde 1."
            >
              <input
                id="p-case"
                className="ui-input"
                inputMode="numeric"
                {...text('caseQuantity', values.caseQuantity)}
              />
            </Field>
            <Field
              label="Liste fiyatı (KDV hariç, ₺)"
              htmlFor="p-price"
              error={errors.listPrice}
              help="Örn. 19,99"
            >
              <input
                id="p-price"
                className="ui-input"
                inputMode="decimal"
                {...text('listPrice', values.listPrice)}
              />
            </Field>
            <Field label="KDV oranı (%)" htmlFor="p-vat" error={errors.vatRate}>
              <input
                id="p-vat"
                className="ui-input"
                inputMode="decimal"
                {...text('vatRate', values.vatRate)}
              />
            </Field>
            <Field label="Stok" htmlFor="p-stock">
              <select
                id="p-stock"
                className="ui-select"
                value={values.stockStatus}
                onChange={(e) => set('stockStatus', e.target.value as StockStatus)}
              >
                <option value="in_stock">Var</option>
                <option value="out_of_stock">Yok</option>
              </select>
            </Field>
          </div>
          <Field label="Açıklama (isteğe bağlı)" htmlFor="p-desc" error={errors.description}>
            <textarea
              id="p-desc"
              className="ui-textarea ui-textarea--lg"
              {...text('description', values.description)}
            />
          </Field>
          <Checkbox id="p-active" checked={values.isActive} onChange={(v) => set('isActive', v)}>
            Aktif (bayilere satışta görünür)
          </Checkbox>
          <label className="ui-check ui-switch" htmlFor="p-featured">
            <input
              id="p-featured"
              type="checkbox"
              role="switch"
              checked={values.isFeatured}
              onChange={(e) => set('isFeatured', e.target.checked)}
            />
            <span>Öne çıkan ürün (ana sayfada "Öne çıkan ürünler" bölümünde gösterilir)</span>
          </label>
        </section>

        <section className="ui-card ui-card__body ui-form-section" aria-labelledby="sec-img">
          <h2 id="sec-img">Görseller</h2>
          <p className="muted">İlk görsel kapak olarak kullanılır. Sırayı okların yardımıyla değiştirin.</p>
          {images.length === 0 ? (
            <p className="muted">Henüz görsel seçilmedi.</p>
          ) : (
            <ul className="ui-sel-images">
              {images.map((im, i) => (
                <li key={im.mediaId} className="ui-sel-image">
                  <ProductImage src={im.thumbUrl} alt={values.name || im.label} ratio="1" />
                  {i === 0 && <span className="ui-badge">Kapak</span>}
                  <div className="ui-sel-image__tools">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`${i + 1}. görseli sola taşı`}
                    >
                      ←
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="trash"
                      onClick={() => {
                        setImages((c) => c.filter((x) => x.mediaId !== im.mediaId))
                        setSaved(false)
                      }}
                      aria-label={`${i + 1}. görseli kaldır`}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={i === images.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`${i + 1}. görseli sağa taşı`}
                    >
                      →
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button variant="secondary" icon="plus" onClick={() => setPicking(true)}>
              Kütüphaneden seç
            </Button>
          </div>
        </section>

        <div className="ui-form-actions">
          <Button type="submit" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
          <Link to="/yonetim/urunler" className="ui-button ui-button--secondary">
            Vazgeç
          </Link>
        </div>
      </form>
      {/* Diyalog formun dışında: içindeki Enter tuşu ürün formunu göndermesin. */}
      {picking && (
        <MediaPicker
          excludeIds={images.map((i) => i.mediaId)}
          onClose={() => setPicking(false)}
          onConfirm={addMedia}
        />
      )}
    </>
  )
}
