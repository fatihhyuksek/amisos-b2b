// K-71: Hızlı sipariş. Barkod veya ürün kodu + adet satırları; "Excel'den yapıştır" (iki sütun, sekme veya ;).
// Adet koli katına yukarı yuvarlanır; sonuç özeti (eklenenler, yuvarlananlar, hatalar) gösterilir.
// Eşleştirme ve yuvarlama backend'dedir (POST /api/cart/quick-add); arayüz yalnızca biçimi kontrol eder.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ApiError, quickAdd, type QuickAddResult } from '../api'
import { Link } from '../Link'
import { trackAddToCart } from '../shop/analytics'
import { useCart } from '../shop/cart'
import { usePageTitle } from '../shop/pageTitle'
import { Alert, Button, Field } from '../ui/components'
import { Icon } from '../ui/Icon'
import { networkMessage } from '../ui/networkMessage'
import { ShopLayout } from './ShopLayout'

const MAX_LINES = 200
const INITIAL_ROWS = 5

interface Row {
  id: number
  query: string
  qty: string
}

const ERROR_TEXT: Record<string, string> = {
  NOT_FOUND: 'Ürün bulunamadı (barkod/kod kontrol edin)',
  INACTIVE: 'Ürün artık satışta değil',
  PRICE_NOT_SET: 'Fiyatı girilmedi, siparişe eklenemez. Fiyat için bize ulaşın',
  INVALID_QUANTITY: 'Adet geçersiz',
  AMBIGUOUS: 'Bu kod birden çok ürüne uyuyor; barkodla girin',
}

/** Yapıştırılan metni (sekme veya ";" ile ayrılmış iki sütun) satırlara çevirir. */
function parsePaste(text: string): { rows: { query: string; qty: string }[]; skipped: string[] } {
  const rows: { query: string; qty: string }[] = []
  const skipped: string[] = []
  for (const [i, raw] of text.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const line = raw.trim()
    if (!line) continue
    const cells = line.split(/\t|;/).map((c) => c.trim())
    const query = cells[0] ?? ''
    const qty = cells[1] ?? ''
    if (!query || !/^\d+$/.test(qty) || Number(qty) < 1) {
      skipped.push(`${i + 1}. satır: “${line.length > 40 ? `${line.slice(0, 40)}…` : line}”`)
      continue
    }
    rows.push({ query, qty })
  }
  return { rows, skipped }
}

export function QuickOrderPage() {
  const { applyCart, notify, reload } = useCart()
  const resultRef = useRef<HTMLElement>(null)
  const nextId = useRef(INITIAL_ROWS)
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: INITIAL_ROWS }, (_, i) => ({ id: i, query: '', qty: '' })),
  )
  const [paste, setPaste] = useState('')
  const [pasteInfo, setPasteInfo] = useState<{ added: number; skipped: string[] } | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ data: QuickAddResult; queries: string[] } | null>(null)
  usePageTitle('Hızlı sipariş')

  useEffect(() => {
    if (result) resultRef.current?.focus()
  }, [result])

  const filled = rows.filter((r) => r.query.trim() || r.qty.trim())
  const setRow = (id: number, patch: Partial<Row>) =>
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const addRow = (focusLast = false) => {
    const id = nextId.current++
    setRows((cur) => [...cur, { id, query: '', qty: '' }])
    if (focusLast) requestAnimationFrame(() => document.getElementById(`qo-q-${id}`)?.focus())
  }

  function importPaste() {
    const { rows: parsed, skipped } = parsePaste(paste)
    if (parsed.length === 0 && skipped.length === 0) {
      setPasteInfo({ added: 0, skipped: ['Yapıştırılacak satır bulunamadı.'] })
      return
    }
    const kept = rows.filter((r) => r.query.trim() || r.qty.trim())
    const room = Math.max(0, MAX_LINES - kept.length)
    const accepted = parsed.slice(0, room)
    const extra = parsed.length - accepted.length
    setRows([...kept, ...accepted.map((p) => ({ id: nextId.current++, query: p.query, qty: p.qty }))])
    setPasteInfo({
      added: accepted.length,
      skipped:
        extra > 0 ? [...skipped, `${extra} satır ${MAX_LINES} satır sınırı nedeniyle eklenmedi`] : skipped,
    })
    if (skipped.length === 0) setPaste('')
    setResult(null)
  }

  function onQtyKey(e: KeyboardEvent<HTMLInputElement>, row: Row, isLast: boolean) {
    // Barkod okuyucu / klavye akışı: adetten Enter ile sonraki satıra geçilir.
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (isLast) addRow(true)
    else {
      const idx = rows.findIndex((r) => r.id === row.id)
      document.getElementById(`qo-q-${rows[idx + 1].id}`)?.focus()
    }
  }
  function onQueryKey(e: KeyboardEvent<HTMLInputElement>, row: Row) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    document.getElementById(`qo-n-${row.id}`)?.focus()
  }

  async function submit() {
    setFormError(null)
    setResult(null)
    const errs: Record<number, string> = {}
    const lines: { query: string; quantity: number; rowId: number }[] = []
    for (const r of filled) {
      const q = r.query.trim()
      const n = Number(r.qty)
      if (!q) errs[r.id] = 'Barkod veya ürün kodu girin.'
      else if (!/^\d+$/.test(r.qty.trim()) || n < 1)
        errs[r.id] = 'Adet 1 veya daha büyük bir tam sayı olmalı.'
      else lines.push({ query: q, quantity: n, rowId: r.id })
    }
    setRowErrors(errs)
    if (Object.keys(errs).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    if (lines.length === 0) {
      setFormError('En az bir satır girin.')
      return
    }
    if (lines.length > MAX_LINES) {
      setFormError(`Tek seferde en fazla ${MAX_LINES} satır eklenebilir.`)
      return
    }
    setBusy(true)
    try {
      const data = await quickAdd(lines.map(({ query, quantity }) => ({ query, quantity })))
      applyCart(data.cart)
      for (const a of data.added) trackAddToCart(a.productId, a.quantity)
      setResult({ data, queries: lines.map((l) => l.query) })
      // Eklenen satırlar listeden kalkar; hatalı satırlar düzeltilmek üzere kalır.
      const failed = new Set(data.errors.map((e) => lines[e.index]?.rowId))
      setRows((cur) => {
        const keep = cur.filter((r) => failed.has(r.id))
        return keep.length > 0
          ? keep
          : Array.from({ length: INITIAL_ROWS }, () => ({ id: nextId.current++, query: '', qty: '' }))
      })
      notify({
        tone: data.added.length > 0 ? 'success' : 'danger',
        text: data.added.length > 0 ? `${data.added.length} ürün sepete eklendi` : 'Hiçbir ürün eklenemedi',
        cartLink: data.added.length > 0,
      })
    } catch (err) {
      if (!(err instanceof ApiError) || err.status >= 500) {
        // Yanıt kaybolmuş olabilir; sunucuda işlem tamamlanmış olabilir.
        void reload()
        setFormError(
          'İşlem tamamlanmış olabilir, sepetinizi kontrol edin. Satırlar listede bırakıldı; sepeti görmeden tekrar göndermeyin.',
        )
        return
      }
      setFormError(
        err instanceof ApiError && err.status === 400
          ? 'Satırlar geçersiz. Barkod/kod ve adetleri kontrol edin.'
          : networkMessage(err, 'Ürünler sepete eklenemedi. Lütfen tekrar deneyin.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const rounded = result?.data.added.filter((a) => a.quantity !== a.requested) ?? []

  return (
    <ShopLayout>
      <nav className="ui-crumbs" aria-label="Konum">
        <ol>
          <li>
            <Link to="/" className="ui-crumbs__home">
              <Icon name="home" />
              Ana sayfa
            </Link>
          </li>
          <li>
            <span aria-current="page">Hızlı sipariş</span>
          </li>
        </ol>
      </nav>
      <header className="ui-pagetitle">
        <h1>Hızlı sipariş</h1>
        <p className="muted">
          Barkod veya ürün koduyla ürünleri tek seferde sepete ekleyin. Adet koli katına yukarı yuvarlanır.
        </p>
      </header>

      <div className="ui-quickorder">
        <section className="ui-card ui-card__body ui-stack" aria-labelledby="qo-lines">
          <h2 id="qo-lines">Ürün satırları</h2>
          <div className="ui-qorows" role="group" aria-labelledby="qo-lines">
            <div className="ui-qorow ui-qorow--head" aria-hidden="true">
              <span>Barkod / ürün kodu</span>
              <span>Adet</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div key={r.id} className="ui-qorow">
                <div className="ui-field">
                  <label className="visually-hidden" htmlFor={`qo-q-${r.id}`}>
                    {i + 1}. satır barkod veya ürün kodu
                  </label>
                  <input
                    id={`qo-q-${r.id}`}
                    className="ui-input"
                    placeholder="Barkod veya kod"
                    autoComplete="off"
                    inputMode="text"
                    value={r.query}
                    aria-invalid={rowErrors[r.id] ? true : undefined}
                    aria-describedby={rowErrors[r.id] ? `qo-e-${r.id}` : undefined}
                    onChange={(e) => setRow(r.id, { query: e.target.value })}
                    onKeyDown={(e) => onQueryKey(e, r)}
                  />
                </div>
                <div className="ui-field">
                  <label className="visually-hidden" htmlFor={`qo-n-${r.id}`}>
                    {i + 1}. satır adet
                  </label>
                  <input
                    id={`qo-n-${r.id}`}
                    className="ui-input num"
                    placeholder="Adet"
                    inputMode="numeric"
                    autoComplete="off"
                    value={r.qty}
                    aria-invalid={rowErrors[r.id] ? true : undefined}
                    aria-describedby={rowErrors[r.id] ? `qo-e-${r.id}` : undefined}
                    onChange={(e) => setRow(r.id, { qty: e.target.value.replace(/\D/g, '') })}
                    onKeyDown={(e) => onQtyKey(e, r, i === rows.length - 1)}
                  />
                </div>
                <button
                  type="button"
                  className="ui-iconbtn"
                  aria-label={`${i + 1}. satırı sil`}
                  onClick={() =>
                    setRows((cur) =>
                      cur.length > 1 ? cur.filter((x) => x.id !== r.id) : [{ ...r, query: '', qty: '' }],
                    )
                  }
                >
                  <Icon name="trash" />
                </button>
                {rowErrors[r.id] && (
                  <span id={`qo-e-${r.id}`} className="ui-error ui-qorow__error">
                    {rowErrors[r.id]}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="ui-actions">
            <Button
              variant="secondary"
              icon="plus"
              disabled={rows.length >= MAX_LINES}
              onClick={() => addRow(true)}
            >
              Satır ekle
            </Button>
            <Button
              variant="ghost"
              disabled={filled.length === 0}
              onClick={() => {
                setRows(
                  Array.from({ length: INITIAL_ROWS }, () => ({ id: nextId.current++, query: '', qty: '' })),
                )
                setRowErrors({})
                setResult(null)
              }}
            >
              Listeyi temizle
            </Button>
          </div>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <div>
            <Button icon="bagPlus" disabled={busy || filled.length === 0} onClick={() => void submit()}>
              {busy ? 'Ekleniyor…' : `Sepete ekle${filled.length > 0 ? ` (${filled.length} satır)` : ''}`}
            </Button>
          </div>
        </section>

        <aside className="ui-card ui-card__body ui-stack" aria-labelledby="qo-paste">
          <h2 id="qo-paste">Excel’den yapıştır</h2>
          <p className="muted">
            Excel’de iki sütun seçip kopyalayın: birinci sütun barkod veya ürün kodu, ikinci sütun adet.
            Sütunlar sekme veya noktalı virgül (;) ile ayrılabilir.
          </p>
          <Field label="Yapıştırılacak metin" htmlFor="qo-paste-text">
            <textarea
              id="qo-paste-text"
              className="ui-textarea"
              rows={6}
              spellCheck={false}
              placeholder={'8690000000011\t12\n8690000000028;24'}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
          </Field>
          <div>
            <Button variant="secondary" icon="clipboard" disabled={!paste.trim()} onClick={importPaste}>
              Listeye aktar
            </Button>
          </div>
          {pasteInfo && (
            <Alert tone={pasteInfo.skipped.length > 0 ? 'warning' : 'info'}>
              <strong>{pasteInfo.added} satır listeye aktarıldı.</strong>
              {pasteInfo.skipped.length > 0 && (
                <>
                  {' '}
                  Atlanan satırlar (barkod/kod ve geçerli adet gerekir):
                  <ul className="ui-list-plain">
                    {pasteInfo.skipped.slice(0, 8).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                    {pasteInfo.skipped.length > 8 && <li>… ve {pasteInfo.skipped.length - 8} satır daha</li>}
                  </ul>
                </>
              )}
            </Alert>
          )}
        </aside>
      </div>

      {result && (
        <section
          className="ui-card ui-card__body ui-stack ui-qoresult"
          aria-labelledby="qo-result"
          tabIndex={-1}
        >
          <h2 id="qo-result">Sonuç</h2>
          <ul className="ui-qosummary" aria-label="Sonuç özeti">
            <li data-tone="success">
              <strong className="num">{result.data.added.length}</strong> eklendi
            </li>
            <li data-tone="warning">
              <strong className="num">{rounded.length}</strong> koliye yuvarlandı
            </li>
            <li data-tone="danger">
              <strong className="num">{result.data.errors.length}</strong> hata
            </li>
          </ul>
          {result.data.added.length > 0 && (
            <div>
              <h3>Sepete eklenenler</h3>
              <ul className="ui-qolist">
                {result.data.added.map((a) => (
                  <li key={`${a.index}-${a.productId}`}>
                    <span>
                      <strong>{a.name}</strong>
                      <span className="muted num"> · {a.barcode}</span>
                      {a.outOfStock && (
                        <span className="ui-pill ui-pill--warning"> Stokta yok · tedarik görüşülecek</span>
                      )}
                    </span>
                    <span className="num">
                      {a.quantity !== a.requested ? (
                        <>
                          {a.requested} → <strong>{a.quantity}</strong> adet{' '}
                          <span className="muted">(koli içi {a.caseQuantity})</span>
                        </>
                      ) : (
                        <>{a.quantity} adet</>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.data.errors.length > 0 && (
            <div>
              <h3>Eklenemeyenler</h3>
              <p className="muted">Bu satırlar listede bırakıldı; düzeltip tekrar deneyin.</p>
              <ul className="ui-qolist ui-qolist--errors">
                {result.data.errors.map((e) => (
                  <li key={`${e.index}-${e.query}`}>
                    <span className="num">{e.query || result.queries[e.index]}</span>
                    <span>{ERROR_TEXT[e.code] ?? 'Eklenemedi'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="ui-actions">
            <Link to="/sepet" className="ui-button ui-button--primary">
              Sepete git
              <Icon name="arrowRight" />
            </Link>
          </div>
        </section>
      )}
    </ShopLayout>
  )
}
