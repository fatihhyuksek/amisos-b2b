// GR-SIP-003, GR-SIP-004, GR-SIP-008, K-20, K-21, K-33, K-41: Sepet (/sepet).
// Satır tutarları ve toplamlar sunucudan gelir; arayüz hesaplamaz.
import { useEffect, useRef, useState } from 'react'
import { ApiError, type CartLine } from '../api'
import { Link } from '../Link'
import { navigate } from '../router'
import { useCart } from '../shop/cart'
import { CartNotices } from '../shop/CartNotices'
import { OrderTotals } from '../shop/OrderTotals'
import { Alert, Button, EmptyState, Modal, QuantityStepper } from '../ui/components'
import { ErrorAlert, LoadingCard, ProductImage } from '../ui/catalog'
import { formatPercent, formatTRY } from '../ui/format'
import { ShopLayout } from './ShopLayout'

const DEBOUNCE_MS = 400

function CartLineRow({ line, onDirty }: { line: CartLine; onDirty: (id: string, dirty: boolean) => void }) {
  const { setQuantity, removeLine } = useCart()
  const [draft, setDraft] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<number | null>(null)
  const value = draft ?? line.quantity
  const out = line.stock !== 'in_stock'

  function send(q: number) {
    pending.current = null
    setQuantity(line.productId, q)
      .then(() => setError(''))
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError && err.code === 'CASE_MULTIPLE'
            ? `Adet, koli içi adedinin (${line.caseQuantity}) katı olmalı.`
            : 'Miktar güncellenemedi. Lütfen tekrar deneyin.',
        )
      })
      .finally(() => {
        if (pending.current === null) {
          setDraft(null)
          onDirty(line.productId, false)
        }
      })
  }

  function onChange(q: number) {
    setDraft(q)
    onDirty(line.productId, true)
    window.clearTimeout(timer.current)
    // Koli katı değilse sunucuya gitmez; adım altında erken uyarı gösterilir (asıl kontrol backend'de).
    if (!Number.isInteger(q) || q <= 0 || q % line.caseQuantity !== 0) {
      pending.current = null
      return
    }
    if (q === line.quantity) {
      pending.current = null
      setDraft(null)
      onDirty(line.productId, false)
      return
    }
    pending.current = q
    timer.current = window.setTimeout(() => send(q), DEBOUNCE_MS)
  }

  // Sayfadan ayrılırken bekleyen değişiklik kaybolmasın.
  const flush = useRef<() => void>(() => undefined)
  useEffect(() => {
    flush.current = () => {
      if (pending.current !== null) {
        window.clearTimeout(timer.current)
        const q = pending.current
        pending.current = null
        void setQuantity(line.productId, q).catch(() => undefined)
      }
    }
  })
  const dirtyCb = useRef(onDirty)
  useEffect(() => {
    dirtyCb.current = onDirty
  })
  const id = line.productId
  useEffect(
    () => () => {
      flush.current()
      // Satır kalkarsa (kaldırıldı / sunucu düşürdü) kilit kalmasın.
      dirtyCb.current(id, false)
    },
    [id],
  )

  async function remove() {
    // Bekleyen taslak miktar gönderilmesin; aksi halde satır silindikten sonra geri eklenir.
    window.clearTimeout(timer.current)
    pending.current = null
    setDraft(null)
    onDirty(line.productId, false)
    setRemoving(true)
    setError('')
    try {
      await removeLine(line.productId)
    } catch {
      setError('Ürün sepetten çıkarılamadı. Lütfen tekrar deneyin.')
      setRemoving(false)
    }
  }

  return (
    <li className="ui-cartline ui-card">
      <div className="ui-cartline__img">
        <ProductImage src={line.thumbUrl ?? undefined} alt="" ratio="1" fit="contain" />
      </div>
      <div className="ui-cartline__info">
        <h3 className="ui-cartline__name">
          <Link to={`/urun/${encodeURIComponent(line.productId)}`}>{line.name}</Link>
        </h3>
        <p className="ui-cartline__meta num">
          <span>
            <span className="visually-hidden">Barkod: </span>
            {line.barcode}
          </span>
          <span>Koli içi: {line.caseQuantity} adet</span>
        </p>
        <p className="ui-cartline__unit num">
          <strong>{formatTRY(line.unitPrice)}</strong> <span className="muted">KDV hariç / adet</span>
          {line.discountPercent && (
            <>
              {' '}
              <s className="muted">
                <span className="visually-hidden">Liste fiyatı </span>
                {formatTRY(line.listPrice)}
              </s>{' '}
              <span className="ui-pill ui-pill--accent">{formatPercent(line.discountPercent)} iskonto</span>
            </>
          )}
        </p>
        {out && <span className="ui-pill ui-pill--warning">Stokta yok · tedarik süresi görüşülecek</span>}
      </div>
      <div className="ui-cartline__qty">
        <QuantityStepper value={value} step={line.caseQuantity} onChange={onChange} label={line.name} />
        {error && (
          <span className="ui-error" role="alert">
            {error}
          </span>
        )}
      </div>
      <div className="ui-cartline__total">
        <span className="ui-cartline__amount num">
          <span className="visually-hidden">Satır net tutarı, KDV hariç: </span>
          {formatTRY(line.lineNet)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon="trash"
          className="ui-button--touch"
          disabled={removing}
          onClick={remove}
          aria-label={`${line.name} sepetten kaldır`}
        >
          Kaldır
        </Button>
      </div>
    </li>
  )
}

export function CartPage() {
  const { status, cart, reload, clear, busy } = useCart()
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState(false)
  const anyDirty = cart?.lines.some((l) => dirty[l.productId]) ?? false

  const setDirtyFor = (id: string, d: boolean) =>
    setDirty((cur) => (!!cur[id] === d ? cur : { ...cur, [id]: d }))

  async function doClear() {
    setClearing(true)
    setClearError(false)
    try {
      await clear()
      setConfirmClear(false)
    } catch {
      setClearError(true)
    } finally {
      setClearing(false)
    }
  }

  const hasOut = cart?.lines.some((l) => l.stock !== 'in_stock') ?? false

  return (
    <ShopLayout>
      <div className="ui-pagehead">
        <h1>Sepetim</h1>
        {cart && cart.lines.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            icon="trash"
            className="ui-button--touch"
            onClick={() => setConfirmClear(true)}
          >
            Sepeti boşalt
          </Button>
        )}
      </div>

      <CartNotices />

      {status === 'loading' && <LoadingCard rows={3} />}
      {status === 'error' && <ErrorAlert onRetry={() => void reload()}>Sepet alınamadı.</ErrorAlert>}

      {status === 'ready' && cart && cart.lines.length === 0 && (
        <div className="ui-card">
          <EmptyState
            title="Sepetiniz boş"
            action={
              <Link to="/katalog" className="ui-button ui-button--primary">
                Kataloğa git
              </Link>
            }
          >
            Katalogdan ürün ekleyerek ön sipariş oluşturabilirsiniz.
          </EmptyState>
        </div>
      )}

      {status === 'ready' && cart && cart.lines.length > 0 && (
        <div className="ui-cartlayout">
          <section aria-labelledby="cart-lines-h" className="ui-cartlayout__lines">
            <h2 id="cart-lines-h" className="visually-hidden">
              Sepetteki ürünler
            </h2>
            {hasOut && (
              <Alert tone="warning">
                Sepetinizde stokta olmayan ürün var. Bu ürünlerin tedarik süresi görüşülecek; yine de ön
                sipariş verebilirsiniz.
              </Alert>
            )}
            <ul className="ui-cartlist">
              {cart.lines.map((l) => (
                <CartLineRow key={l.productId} line={l} onDirty={setDirtyFor} />
              ))}
            </ul>
          </section>
          <aside className="ui-card ui-summary" aria-labelledby="cart-summary-h">
            <div className="ui-card__body ui-stack">
              <h2 id="cart-summary-h">Sipariş özeti</h2>
              <OrderTotals summary={cart.summary} />
              <p className="muted ui-summary__note">Fiyatlar KDV hariçtir; KDV ayrı satırda gösterilir.</p>
              <Button
                block
                disabled={anyDirty || busy}
                onClick={() => navigate('/sepet/onay')}
                icon="arrowRight"
              >
                Siparişi tamamla
              </Button>
              <Link to="/katalog" className="ui-button ui-button--secondary ui-button--block">
                Alışverişe devam et
              </Link>
            </div>
          </aside>
        </div>
      )}

      {confirmClear && (
        <Modal
          title="Sepeti boşalt"
          onClose={() => !clearing && setConfirmClear(false)}
          dismissable={!clearing}
        >
          <p>Sepetteki tüm ürünler çıkarılacak. Bu işlem geri alınamaz.</p>
          {clearError && <Alert tone="danger">Sepet boşaltılamadı. Lütfen tekrar deneyin.</Alert>}
          <div className="ui-modal__actions">
            <Button variant="secondary" disabled={clearing} onClick={() => setConfirmClear(false)}>
              Vazgeç
            </Button>
            <Button variant="danger" disabled={clearing} onClick={doClear}>
              {clearing ? 'Boşaltılıyor…' : 'Sepeti boşalt'}
            </Button>
          </div>
        </Modal>
      )}
    </ShopLayout>
  )
}
