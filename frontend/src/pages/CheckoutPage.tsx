// GR-SIP-005, GR-SIP-007, K-22, K-27, K-33, K-36, K-37, K-38: Ön sipariş onayı (/sepet/onay).
// expectedTotal ekrandaki genel toplamdır; fark çıkarsa sunucu 409 PRICE_CHANGED döner.
import { useRef, useState, type FormEvent } from 'react'
import {
  ApiError,
  fetchCheckoutDefaults,
  PriceChangedError,
  submitOrder,
  type CheckoutDefaults,
  type DeliveryMethod,
} from '../api'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { navigate } from '../router'
import { useCart } from '../shop/cart'
import { CartNotices } from '../shop/CartNotices'
import { DELIVERY_LABEL } from '../shop/delivery'
import { OrderTotals } from '../shop/OrderTotals'
import { Alert, Button, EmptyState, Field } from '../ui/components'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { formatTRY } from '../ui/format'
import { networkMessage } from '../ui/networkMessage'
import { ShopLayout } from './ShopLayout'

const NOTE_MAX = 1000

const OPTIONS: { value: DeliveryMethod; desc: string }[] = [
  { value: 'carrier', desc: 'Adres, ambar firması ve şubesi gerekli' },
  { value: 'pickup', desc: 'Teslim detayı görüşmede belirlenir' },
  { value: 'truck', desc: 'Adres görüşmede belirlenir' },
]

type FieldName = 'deliveryAddress' | 'carrierName' | 'carrierBranch' | 'note'

export function CheckoutPage() {
  const { status, cart, reload, applyCart } = useCart()
  const defaults = useLoad<CheckoutDefaults>((s) => fetchCheckoutDefaults(s), 'checkout-defaults')
  const def = defaults.state.status === 'ready' ? defaults.state.data : null

  const [method, setMethod] = useState<DeliveryMethod>('carrier')
  // null: bayi henüz dokunmadı, sunucunun önerdiği değer gösterilir.
  const [address, setAddress] = useState<string | null>(null)
  const [carrierName, setCarrierName] = useState<string | null>(null)
  const [carrierBranch, setCarrierBranch] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [changed, setChanged] = useState(false)
  const lock = useRef(false)

  const addressValue = address ?? def?.address ?? ''
  const nameValue = carrierName ?? def?.lastCarrier?.name ?? ''
  const branchValue = carrierBranch ?? def?.lastCarrier?.branch ?? ''

  const clearError = (k: FieldName) => setErrors((cur) => (cur[k] ? { ...cur, [k]: undefined } : cur))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (lock.current || !cart || cart.lines.length === 0) return
    const next: Partial<Record<FieldName, string>> = {}
    if (method === 'carrier') {
      if (!addressValue.trim()) next.deliveryAddress = 'Teslimat adresi zorunlu.'
      if (!nameValue.trim()) next.carrierName = 'Ambar firması zorunlu.'
      if (!branchValue.trim()) next.carrierBranch = 'Ambar şubesi zorunlu.'
    }
    if (note.length > NOTE_MAX) next.note = `Not en fazla ${NOTE_MAX} karakter olabilir.`
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    lock.current = true
    setBusy(true)
    try {
      const result = await submitOrder({
        deliveryMethod: method,
        ...(method === 'carrier'
          ? {
              deliveryAddress: addressValue.trim(),
              carrierName: nameValue.trim(),
              carrierBranch: branchValue.trim(),
            }
          : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        expectedTotal: cart.summary.grandTotal,
        expectedVersion: cart.version,
      })
      void reload()
      navigate(`/siparislerim/${encodeURIComponent(result.id)}?yeni=1`)
    } catch (err) {
      lock.current = false
      setBusy(false)
      if (err instanceof PriceChangedError) {
        applyCart(err.cart)
        setChanged(true)
      } else if (err instanceof ApiError && err.status === 400 && err.code === 'EMPTY_CART') {
        void reload()
        navigate('/siparislerim?bilgi=sepet-bos')
      } else if (err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION') {
        const mapped: Partial<Record<FieldName, string>> = {}
        for (const k of Object.keys(err.fields ?? {})) {
          if (k === 'deliveryAddress' || k === 'carrierName' || k === 'carrierBranch' || k === 'note')
            mapped[k] = 'Bu alanı kontrol edin.'
        }
        setErrors(mapped)
        if (Object.keys(mapped).length === 0) setFormError('Formdaki bilgileri kontrol edin.')
      } else if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setFormError('Oturumunuz sona erdi. Lütfen sayfayı yenileyip tekrar giriş yapın.')
      } else {
        setFormError(networkMessage(err, 'Ön sipariş gönderilemedi. Lütfen tekrar deneyin.'))
      }
    }
  }

  const empty = status === 'ready' && cart && cart.lines.length === 0

  return (
    <ShopLayout>
      <nav className="ui-crumbs" aria-label="Konum">
        <ol>
          <li>
            <Link to="/sepet">Sepetim</Link>
          </li>
          <li>
            <span aria-current="page">Siparişi tamamla</span>
          </li>
        </ol>
      </nav>
      <h1>Siparişi tamamla</h1>

      {changed && (
        <Alert tone="warning">
          <strong>Fiyatlar veya sepet içeriği değişti.</strong> Lütfen aşağıdaki güncel tutarları kontrol edip
          tekrar onaylayın.
        </Alert>
      )}
      <CartNotices />

      {status === 'loading' && <LoadingCard rows={3} />}
      {status === 'error' && <ErrorAlert onRetry={() => void reload()}>Sepet alınamadı.</ErrorAlert>}
      {empty && (
        <div className="ui-card">
          <EmptyState
            title="Sepetiniz boş"
            action={
              <Link to="/katalog" className="ui-button ui-button--primary">
                Kataloğa git
              </Link>
            }
          >
            Ön sipariş vermek için önce sepete ürün ekleyin.
          </EmptyState>
        </div>
      )}

      {status === 'ready' && cart && cart.lines.length > 0 && (
        <form className="ui-cartlayout" onSubmit={onSubmit} noValidate>
          <div className="ui-cartlayout__lines ui-stack">
            <fieldset className="ui-choice-group">
              <legend>
                <h2>Teslimat şekli</h2>
              </legend>
              <div className="ui-choice-grid">
                {OPTIONS.map((o) => (
                  <label key={o.value} className="ui-choice">
                    <input
                      type="radio"
                      name="delivery"
                      value={o.value}
                      checked={method === o.value}
                      onChange={() => setMethod(o.value)}
                    />
                    <span>
                      <span className="ui-choice__title">{DELIVERY_LABEL[o.value]}</span>
                      <br />
                      <span className="ui-choice__desc">{o.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {method === 'carrier' ? (
              <section className="ui-card ui-card__body ui-stack" aria-labelledby="carrier-h">
                <h2 id="carrier-h">Teslimat bilgileri</h2>
                {defaults.state.status === 'error' && (
                  <Alert tone="info">Kayıtlı adresiniz getirilemedi; adresi elle girebilirsiniz.</Alert>
                )}
                <Field
                  label="Teslimat adresi"
                  htmlFor="co-address"
                  help="Başvurudaki adresiniz getirildi, değiştirebilirsiniz."
                  error={errors.deliveryAddress}
                >
                  <textarea
                    id="co-address"
                    className="ui-textarea"
                    rows={3}
                    value={addressValue}
                    aria-invalid={errors.deliveryAddress ? true : undefined}
                    onChange={(e) => {
                      setAddress(e.target.value)
                      clearError('deliveryAddress')
                    }}
                  />
                </Field>
                <div className="ui-form-grid ui-form-grid--2">
                  <Field label="Ambar firması" htmlFor="co-carrier" error={errors.carrierName}>
                    <input
                      id="co-carrier"
                      className="ui-input"
                      autoComplete="off"
                      value={nameValue}
                      aria-invalid={errors.carrierName ? true : undefined}
                      onChange={(e) => {
                        setCarrierName(e.target.value)
                        clearError('carrierName')
                      }}
                    />
                  </Field>
                  <Field label="Ambar şubesi" htmlFor="co-branch" error={errors.carrierBranch}>
                    <input
                      id="co-branch"
                      className="ui-input"
                      autoComplete="off"
                      value={branchValue}
                      aria-invalid={errors.carrierBranch ? true : undefined}
                      onChange={(e) => {
                        setCarrierBranch(e.target.value)
                        clearError('carrierBranch')
                      }}
                    />
                  </Field>
                </div>
              </section>
            ) : (
              <Alert tone="info">
                {DELIVERY_LABEL[method]} seçildi. Teslim adresi ve ayrıntılar ekibimizle görüşülerek
                belirlenir.
              </Alert>
            )}

            <section className="ui-card ui-card__body ui-stack" aria-labelledby="note-h">
              <h2 id="note-h">Sipariş notu</h2>
              <Field
                label="Not (isteğe bağlı)"
                htmlFor="co-note"
                help={`${note.length} / ${NOTE_MAX}`}
                error={errors.note}
              >
                <textarea
                  id="co-note"
                  className="ui-textarea"
                  rows={3}
                  value={note}
                  aria-invalid={errors.note ? true : undefined}
                  onChange={(e) => {
                    setNote(e.target.value)
                    clearError('note')
                  }}
                />
              </Field>
            </section>
          </div>

          <aside className="ui-card ui-summary" aria-labelledby="co-summary-h">
            <div className="ui-card__body ui-stack">
              <h2 id="co-summary-h">Ön sipariş özeti</h2>
              <ul className="ui-minilines">
                {cart.lines.map((l) => (
                  <li key={l.productId}>
                    <span className="ui-minilines__name">
                      {l.name}
                      <span className="muted num"> × {l.quantity}</span>
                      {l.stock !== 'in_stock' && <span className="ui-minilines__out"> · stokta yok</span>}
                    </span>
                    <span className="num">{formatTRY(l.lineNet)}</span>
                  </li>
                ))}
              </ul>
              <OrderTotals summary={cart.summary} />
              {formError && <Alert tone="danger">{formError}</Alert>}
              <Button type="submit" block disabled={busy} icon="arrowRight">
                {busy ? 'Gönderiliyor…' : 'Ön siparişi gönder'}
              </Button>
              <p className="muted ui-summary__note">
                Gönderdikten sonra sipariş değiştirilemez ve iptal edilemez. Ödeme ve teslim detayları
                ekibimizle görüşülerek tamamlanır.
              </p>
              <Link to="/sepet" className="ui-button ui-button--secondary ui-button--block">
                Sepete dön
              </Link>
            </div>
          </aside>
        </form>
      )}
    </ShopLayout>
  )
}
