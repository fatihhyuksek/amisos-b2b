// GR-SIP-006, GR-BLD-001, K-17, K-24, K-25, K-26, K-33: Admin sipariş ayrıntısı (/yonetim/siparisler/:id).
// Tutarlar sunucudan gelir; arayüz hesaplamaz.
import { useState } from 'react'
import {
  ApiError,
  changeOrderStatus,
  downloadOrdersExcel,
  fetchAdminOrder,
  markOrderTransferred,
  unmarkOrderTransferred,
  type AdminOrderDetail,
  type OrderStatusValue,
} from '../api'
import { Link } from '../Link'
import { DELIVERY_LABEL } from '../shop/delivery'
import { OrderTotals } from '../shop/OrderTotals'
import { BrandLogo } from '../shop/brand'
import { Alert, Badge, Button, Field, Modal, OrderStatusBadge } from '../ui/components'
import { ErrorAlert } from '../ui/catalog'
import { Icon } from '../ui/Icon'
import { formatDate, formatDateTime, formatPercent, formatTRY } from '../ui/format'
import { networkMessage } from '../ui/networkMessage'
import { orderStatusLabel } from '../ui/orderStatus'
import { AdminLayout } from './AdminLayout'
import { copyText, saveBlob } from './download'
import { whatsappHref } from './phone'
import { Panel, SkeletonRows } from './kit'
import { OrderNotes } from './OrderNotes'
import { useLoad } from './useLoad'
import { notifyOrdersChanged } from './orderSummary'

/** Durum adımları (K-25); iptal ayrı gösterilir. */
const FLOW: OrderStatusValue[] = ['submitted', 'negotiating', 'approved', 'shipped', 'delivered']

const NOTE_MAX = 1000
const REF_MAX = 100

const SOURCE_LABEL = { system: 'Sistem', admin: 'Admin', bizimhesap: 'BizimHesap' } as const

/** Hücreyi sekme/satır sonundan arındırır ve formül olarak yorumlanmasını engeller. */
function tsvCell(value: string): string {
  const clean = value.replace(/[\t\r\n]+/g, ' ').trim()
  return /^[=+\-@]/.test(clean) ? `'${clean}` : clean
}

/** BizimHesap / Excel'e yapıştırmaya uygun, sekme ayrımlı satırlar (başlık satırı yok). */
function linesAsTsv(o: AdminOrderDetail): string {
  return o.lines
    .map((l) =>
      [l.barcode, l.code ?? '', l.name, String(l.quantity), l.unitPrice.replace('.', ',')]
        .map(tsvCell)
        .join('\t'),
    )
    .join('\n')
}

function statusButtonLabel(s: OrderStatusValue): string {
  return s === 'cancelled' ? 'Siparişi iptal et' : `Durumu “${orderStatusLabel(s)}” yap`
}

export function AdminOrderDetailPage({ id }: { id: string }) {
  const { state, reload } = useLoad<AdminOrderDetail>((s) => fetchAdminOrder(id, s), id)
  // Eylem sonrası sunucunun döndürdüğü güncel detay yüklenen veriyi geçersiz kılar.
  const [fresh, setFresh] = useState<AdminOrderDetail | null>(null)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  const [statusDialog, setStatusDialog] = useState<OrderStatusValue | null>(null)
  const [transferDialog, setTransferDialog] = useState<'mark' | 'unmark' | null>(null)
  const [note, setNote] = useState('')
  const [reference, setReference] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const o = fresh && fresh.id === id ? fresh : state.status === 'ready' ? state.data : null

  function closeDialogs() {
    setStatusDialog(null)
    setTransferDialog(null)
    setNote('')
    setReference('')
    setDialogError('')
  }

  async function submitStatus() {
    if (!statusDialog || busy) return
    if (statusDialog === 'cancelled' && !note.trim()) {
      setDialogError('İptal için gerekçe notu zorunlu.')
      return
    }
    setBusy(true)
    setDialogError('')
    try {
      const next = await changeOrderStatus(id, statusDialog, note.trim() || undefined)
      setFresh(next)
      notifyOrdersChanged()
      closeDialogs()
      setNotice({
        tone: 'info',
        text: `Durum “${orderStatusLabel(statusDialog)}” olarak güncellendi. Bayiye e-posta gönderiliyor.`,
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'INVALID_TRANSITION') {
        closeDialogs()
        setNotice({
          tone: 'danger',
          text: 'Sipariş durumu bu arada değişti; bu geçiş artık yapılamıyor. Sayfa yenilendi.',
        })
        setFresh(null)
        reload()
        notifyOrdersChanged()
      } else if (err instanceof ApiError && err.status === 400) {
        setDialogError('Not geçersiz veya eksik. Lütfen kontrol edin.')
      } else {
        setDialogError(networkMessage(err, 'Durum güncellenemedi. Lütfen tekrar deneyin.'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function submitTransfer() {
    if (!transferDialog || busy) return
    setBusy(true)
    setDialogError('')
    try {
      const next =
        transferDialog === 'mark'
          ? await markOrderTransferred(id, reference.trim() || undefined)
          : await unmarkOrderTransferred(id)
      setFresh(next)
      notifyOrdersChanged()
      const wasMark = transferDialog === 'mark'
      closeDialogs()
      setNotice({
        tone: 'info',
        text: wasMark ? "BizimHesap'a girildi olarak işaretlendi." : 'BizimHesap işareti kaldırıldı.',
      })
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      const conflict: Record<string, string> = {
        ALREADY_TRANSFERRED: "Bu sipariş zaten BizimHesap'a girildi olarak işaretli.",
        NOT_TRANSFERRED: 'Bu sipariş zaten girilmemiş görünüyor.',
        TRANSFER_LOCKED: 'Bu sipariş entegrasyonla aktarıldığı için işareti kaldırılamaz.',
      }
      if (code && conflict[code]) {
        closeDialogs()
        setNotice({ tone: 'danger', text: `${conflict[code]} Sayfa yenilendi.` })
        setFresh(null)
        reload()
        notifyOrdersChanged()
      } else {
        setDialogError(
          err instanceof ApiError && err.status === 400
            ? 'Referans geçersiz (en fazla 100 karakter).'
            : networkMessage(err, 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'),
        )
      }
    } finally {
      setBusy(false)
    }
  }

  async function copyLines() {
    if (!o) return
    const ok = await copyText(linesAsTsv(o))
    setNotice(
      ok
        ? {
            tone: 'info',
            text: 'Satırlar panoya kopyalandı (Barkod, Ürün kodu, Ürün adı, Adet, Birim fiyat).',
          }
        : { tone: 'danger', text: 'Panoya kopyalanamadı. Tarayıcı izni gerekebilir.' },
    )
  }

  async function downloadExcel() {
    if (!o) return
    setDownloading(true)
    try {
      const { blob, filename } = await downloadOrdersExcel({ orderId: id })
      saveBlob(blob, filename ?? `siparis-${o.orderNo}.xlsx`)
    } catch {
      setNotice({ tone: 'danger', text: 'Excel dosyası indirilemedi. Lütfen tekrar deneyin.' })
    } finally {
      setDownloading(false)
    }
  }

  const whatsapp = o ? whatsappHref(o.dealer.phone) : null
  const next = o?.allowedNextStatuses ?? []
  const forward = next.filter((s) => s !== 'cancelled')
  const canCancel = next.includes('cancelled')

  const stepDate = (st: OrderStatusValue) => {
    const h = o?.history.find((x) => x.toStatus === st)
    return h ? formatDate(h.createdAt) : null
  }
  const stepIndex = o ? FLOW.indexOf(o.status) : -1

  return (
    <AdminLayout
      title={o ? `Sipariş #${o.orderNo}` : 'Sipariş'}
      meta={
        o && (
          <span className="adm-hero">
            <OrderStatusBadge status={o.status} />
            <span className="adm-hero__meta num">{formatDateTime(o.submittedAt)}</span>
          </span>
        )
      }
      actions={
        o && (
          <>
            {forward.map((s, i) => (
              <Button key={s} variant={i === 0 ? 'primary' : 'secondary'} onClick={() => setStatusDialog(s)}>
                {statusButtonLabel(s)}
              </Button>
            ))}
            {canCancel && (
              <Button variant="secondary" icon="close" onClick={() => setStatusDialog('cancelled')}>
                İptal et
              </Button>
            )}
            <Button variant="secondary" icon="print" onClick={() => window.print()}>
              Yazdır
            </Button>
            <Button variant="secondary" icon="download" disabled={downloading} onClick={downloadExcel}>
              {downloading ? 'Hazırlanıyor…' : 'Excel'}
            </Button>
          </>
        )
      }
    >
      <div role="status" aria-live="polite" className="adm-noprint">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      </div>
      {state.status === 'loading' && !o && <SkeletonRows rows={6} />}
      {state.status === 'error' && !o && (
        <ErrorAlert onRetry={state.notFound ? undefined : reload}>
          {state.notFound ? 'Sipariş bulunamadı.' : 'Sipariş alınamadı.'}
        </ErrorAlert>
      )}

      {o && (
        <>
          <div className="ui-printhead" aria-hidden="true">
            <BrandLogo size="md" />
            <p>
              Sipariş #{o.orderNo} · {formatDateTime(o.submittedAt)} · {o.dealer.companyTitle} · Fiyatlar KDV
              hariçtir
            </p>
          </div>

          <section className="adm-card" aria-label="Sipariş durumu">
            {o.status === 'cancelled' ? (
              <p className="adm-cancelled">
                <Icon name="close" />
                Sipariş iptal edildi
                {stepDate('cancelled') ? ` · ${stepDate('cancelled')}` : ''}
              </p>
            ) : (
              <ol className="adm-steps">
                {FLOW.map((st, i) => {
                  const done = i < stepIndex || o.status === 'delivered'
                  const mode = done ? 'done' : i === stepIndex ? 'current' : 'todo'
                  return (
                    <li key={st} data-state={mode} aria-current={mode === 'current' ? 'step' : undefined}>
                      <span className="adm-steps__dot">{done && <Icon name="check" />}</span>
                      <span>
                        {orderStatusLabel(st)}
                        {mode === 'done' && <span className="visually-hidden"> (tamamlandı)</span>}
                      </span>
                      {stepDate(st) && <span className="adm-steps__when num">{stepDate(st)}</span>}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <div className="adm-split">
            <div className="adm-stack">
              <Panel title={`Ürünler (${o.lines.length})`} flush>
                <div className="ui-table-wrap ui-table-wrap--cards" style={{ border: 0, borderRadius: 0 }}>
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th scope="col">Barkod</th>
                        <th scope="col">Ürün</th>
                        <th scope="col" className="num">
                          Adet
                        </th>
                        <th scope="col" className="num">
                          Birim fiyat (KDV hariç)
                        </th>
                        <th scope="col" className="num">
                          Satır net
                        </th>
                        <th scope="col" className="num">
                          KDV
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.lines.map((l) => (
                        <tr key={l.lineNo}>
                          <td className="num ui-left">{l.barcode}</td>
                          <td className="wrap">
                            <div className="ui-orderline">
                              <span className="ui-orderline__name">{l.name}</span>
                              {l.code && <span className="muted num ui-orderline__code">{l.code}</span>}
                              {l.outOfStock && <span className="ui-pill ui-pill--warning">Stokta yoktu</span>}
                            </div>
                          </td>
                          <td className="num">
                            {l.quantity}
                            <span className="muted"> / koli {l.caseQuantity}</span>
                          </td>
                          <td className="num">
                            {formatTRY(l.unitPrice)}
                            {l.discountPercent && (
                              <span className="ui-orderline__disc muted">
                                <s>{formatTRY(l.listPrice)}</s> · {formatPercent(l.discountPercent)} iskonto
                              </span>
                            )}
                          </td>
                          <td className="num">{formatTRY(l.lineNet)}</td>
                          <td className="num">
                            {formatTRY(l.lineVat)}
                            <span className="ui-orderline__disc muted">{formatPercent(l.vatRate)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="ui-cards" style={{ padding: 'var(--space-3)' }}>
                  {o.lines.map((l) => (
                    <li key={l.lineNo} className="ui-card ui-ordercard">
                      <div className="ui-orderline">
                        <span className="ui-orderline__name">{l.name}</span>
                        <span className="muted num ui-orderline__code">
                          {l.barcode}
                          {l.code ? ` · ${l.code}` : ''}
                        </span>
                        {l.outOfStock && <span className="ui-pill ui-pill--warning">Stokta yoktu</span>}
                      </div>
                      <dl className="ui-ordercard__sums num">
                        <div>
                          <dt>Adet</dt>
                          <dd>{l.quantity}</dd>
                        </div>
                        <div>
                          <dt>Birim fiyat (KDV hariç)</dt>
                          <dd>{formatTRY(l.unitPrice)}</dd>
                        </div>
                        <div>
                          <dt>Satır net</dt>
                          <dd>
                            <strong>{formatTRY(l.lineNet)}</strong>
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
                <div className="adm-card__body" style={{ borderTop: '1px solid var(--adm-border)' }}>
                  <OrderTotals summary={o.summary} />
                </div>
              </Panel>

              <Panel title="Durum geçmişi">
                <ol className="ui-timeline">
                  {o.history.map((h, i) => (
                    <li key={i}>
                      <strong>{orderStatusLabel(h.toStatus)}</strong>
                      <span className="muted">
                        {formatDateTime(h.createdAt)} ·{' '}
                        {h.source === 'admin' && h.changedBy ? h.changedBy.fullName : SOURCE_LABEL[h.source]}
                      </span>
                      {h.note && (
                        <span className="ui-prewrap">
                          <span className="muted">Bayiye görünür not: </span>
                          {h.note}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </Panel>
            </div>

            <aside className="adm-stack" aria-label="Sipariş bilgileri">
              <Panel title="Bayi">
                <dl className="adm-kv adm-kv--col" style={{ gridTemplateColumns: '1fr' }}>
                  <div>
                    <dt>Firma</dt>
                    <dd>
                      <Link to={`/yonetim/bayiler/${encodeURIComponent(o.dealer.id)}`}>
                        {o.dealer.companyTitle}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt>Yetkili</dt>
                    <dd>{o.dealer.contactName}</dd>
                  </div>
                  <div>
                    <dt>Telefon</dt>
                    <dd className="ui-contactlinks">
                      <a href={`tel:${o.dealer.phone.replace(/[^\d+]/g, '')}`}>{o.dealer.phone}</a>
                      {whatsapp && (
                        <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                          WhatsApp<span className="visually-hidden"> (yeni sekmede açılır)</span>
                        </a>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>E-posta</dt>
                    <dd>
                      <a href={`mailto:${o.dealer.email}`}>{o.dealer.email}</a>
                    </dd>
                  </div>
                  <div>
                    <dt>Adres</dt>
                    <dd>
                      {o.dealer.address}, {o.dealer.district} / {o.dealer.city}
                    </dd>
                  </div>
                </dl>
              </Panel>

              <Panel title="Teslimat">
                <dl className="adm-kv adm-kv--col" style={{ gridTemplateColumns: '1fr' }}>
                  <div>
                    <dt>Teslimat şekli</dt>
                    <dd>{DELIVERY_LABEL[o.deliveryMethod]}</dd>
                  </div>
                  {o.deliveryMethod === 'carrier' ? (
                    <>
                      <div>
                        <dt>Adres</dt>
                        <dd>{o.deliveryAddress}</dd>
                      </div>
                      <div>
                        <dt>Ambar firması</dt>
                        <dd>{o.carrierName}</dd>
                      </div>
                      <div>
                        <dt>Şube</dt>
                        <dd>{o.carrierBranch}</dd>
                      </div>
                    </>
                  ) : (
                    <div>
                      <dt>Adres</dt>
                      <dd>Adres görüşmede belirlenecek</dd>
                    </div>
                  )}
                  {o.note && (
                    <div>
                      <dt>Bayi notu</dt>
                      <dd className="ui-prewrap">{o.note}</dd>
                    </div>
                  )}
                </dl>
              </Panel>

              <div className="adm-noprint adm-stack">
                <OrderNotes orderId={o.id} />

                <Panel title="BizimHesap">
                  <div className="adm-stack">
                    {o.transfer.status === 'transferred' ? (
                      <>
                        <Badge tone="success">Girildi</Badge>
                        <dl className="adm-kv adm-kv--col" style={{ gridTemplateColumns: '1fr' }}>
                          <div>
                            <dt>Referans</dt>
                            <dd>{o.transfer.reference ?? '—'}</dd>
                          </div>
                          <div>
                            <dt>Tarih</dt>
                            <dd>
                              {o.transfer.transferredAt ? formatDateTime(o.transfer.transferredAt) : '—'}
                            </dd>
                          </div>
                          <div>
                            <dt>Giren</dt>
                            <dd>{o.transfer.transferredBy?.fullName ?? '—'}</dd>
                          </div>
                        </dl>
                      </>
                    ) : o.transfer.status === 'failed' ? (
                      <>
                        <Badge tone="warning">Aktarım başarısız</Badge>
                        <p className="muted ui-summary__note">
                          Otomatik aktarım başarısız oldu. Siparişi BizimHesap'a elle girip
                          işaretleyebilirsiniz.
                        </p>
                      </>
                    ) : (
                      <Badge tone="neutral">Girilmedi</Badge>
                    )}
                    <Button variant="secondary" block icon="copy" onClick={copyLines}>
                      Satırları kopyala
                    </Button>
                    <p className="muted ui-summary__note">
                      Excel'e yapıştırırken barkod sütununu Metin biçimine çevirin; daha güvenli yol: Excel
                      indir.
                    </p>
                    {o.transfer.status === 'transferred' ? (
                      <Button variant="ghost" block onClick={() => setTransferDialog('unmark')}>
                        İşareti kaldır
                      </Button>
                    ) : (
                      <Button block onClick={() => setTransferDialog('mark')}>
                        BizimHesap'a girildi olarak işaretle
                      </Button>
                    )}
                    <p className="muted ui-summary__note">
                      Sipariş BizimHesap'a şimdilik elle girilir; girdikten sonra işaretleyin.
                    </p>
                  </div>
                </Panel>
              </div>
            </aside>
          </div>
        </>
      )}

      {statusDialog && (
        <Modal title={statusButtonLabel(statusDialog)} onClose={closeDialogs} dismissable={!busy}>
          <p>
            Durum <strong>{orderStatusLabel(statusDialog)}</strong> olacak ve bayiye e-posta gönderilecek.
          </p>
          <Field
            label={
              statusDialog === 'cancelled'
                ? 'Bayiye görünür not (zorunlu)'
                : 'Bayiye görünür not (isteğe bağlı)'
            }
            htmlFor="ao-note"
            help={`${note.length} / ${NOTE_MAX}`}
            error={dialogError || undefined}
          >
            <textarea
              id="ao-note"
              className="ui-textarea"
              rows={4}
              maxLength={NOTE_MAX}
              value={note}
              aria-invalid={dialogError ? true : undefined}
              onChange={(e) => {
                setNote(e.target.value)
                setDialogError('')
              }}
            />
          </Field>
          <div className="ui-modal__actions">
            <Button variant="secondary" disabled={busy} onClick={closeDialogs}>
              Vazgeç
            </Button>
            <Button
              variant={statusDialog === 'cancelled' ? 'danger' : 'primary'}
              disabled={busy}
              onClick={submitStatus}
            >
              {busy ? 'Kaydediliyor…' : 'Onayla'}
            </Button>
          </div>
        </Modal>
      )}

      {transferDialog && (
        <Modal
          title={transferDialog === 'mark' ? "BizimHesap'a girildi" : 'BizimHesap işaretini kaldır'}
          onClose={closeDialogs}
          dismissable={!busy}
        >
          {transferDialog === 'mark' ? (
            <Field
              label="BizimHesap belge / sipariş no (isteğe bağlı)"
              htmlFor="ao-ref"
              error={dialogError || undefined}
            >
              <input
                id="ao-ref"
                className="ui-input"
                maxLength={REF_MAX}
                autoComplete="off"
                value={reference}
                aria-invalid={dialogError ? true : undefined}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
          ) : (
            <>
              <p>Sipariş yeniden “Girilmedi” olarak işaretlenecek.</p>
              {dialogError && <Alert tone="danger">{dialogError}</Alert>}
            </>
          )}
          <div className="ui-modal__actions">
            <Button variant="secondary" disabled={busy} onClick={closeDialogs}>
              Vazgeç
            </Button>
            <Button disabled={busy} onClick={submitTransfer}>
              {busy ? 'Kaydediliyor…' : transferDialog === 'mark' ? 'İşaretle' : 'Kaldır'}
            </Button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  )
}
