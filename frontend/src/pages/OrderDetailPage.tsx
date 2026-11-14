// GR-SIP-005, GR-SIP-006, GR-SIP-008, K-22, K-25, K-27, K-33, K-44: Sipariş ayrıntısı (/siparislerim/:id).
// Fiyatlar sipariş anındaki kopyadır. Düzenleme ve iptal yoktur (K-22).
import { useEffect, useRef, useState } from 'react'
import { ApiError, fetchOrder, reorder, type OrderDetail, type OrderLine } from '../api'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { navigate, useRoute } from '../router'
import { useCart } from '../shop/cart'
import { CONTACT, PHONE_HREF } from '../shop/contact'
import { DELIVERY_LABEL } from '../shop/delivery'
import { OrderTotals } from '../shop/OrderTotals'
import { Alert, Button, OrderStatusBadge } from '../ui/components'
import { orderStatusLabel } from '../ui/orderStatus'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { formatDateTime, formatPercent, formatTRY } from '../ui/format'
import { networkMessage } from '../ui/networkMessage'
import { ShopLayout } from './ShopLayout'

function LineName({ l }: { l: OrderLine }) {
  return (
    <>
      <span className="ui-orderline__name">{l.name}</span>
      <span className="muted num ui-orderline__code">
        {l.barcode}
        {l.code ? ` · ${l.code}` : ''}
      </span>
      {l.outOfStock && <span className="ui-pill ui-pill--warning">Stokta yoktu · tedarik görüşüldü</span>}
    </>
  )
}

function UnitPrice({ l }: { l: OrderLine }) {
  return (
    <>
      {formatTRY(l.unitPrice)}
      {l.discountPercent && (
        <span className="ui-orderline__disc muted">
          <s>{formatTRY(l.listPrice)}</s> · {formatPercent(l.discountPercent)} iskonto
        </span>
      )}
    </>
  )
}

export function OrderDetailPage({ id }: { id: string }) {
  const { query } = useRoute()
  const fresh = query.get('yeni') === '1'
  const { state, reload } = useLoad<OrderDetail>((s) => fetchOrder(id, s), id)
  const { applyCart, addNotices } = useCart()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const okRef = useRef<HTMLDivElement>(null)
  const o = state.status === 'ready' ? state.data : null

  useEffect(() => {
    if (fresh && o) okRef.current?.focus()
  }, [fresh, o])

  async function doReorder() {
    setBusy(true)
    setError('')
    try {
      const r = await reorder(id)
      applyCart(r.cart)
      addNotices({ adjusted: r.adjusted, skipped: r.skipped })
      navigate('/sepet')
    } catch (err) {
      setBusy(false)
      setError(
        err instanceof ApiError && err.status === 404
          ? 'Sipariş bulunamadı.'
          : networkMessage(err, 'Ürünler sepete eklenemedi. Lütfen tekrar deneyin.'),
      )
    }
  }

  return (
    <ShopLayout>
      <nav className="ui-crumbs" aria-label="Konum">
        <ol>
          <li>
            <Link to="/siparislerim">Siparişlerim</Link>
          </li>
          <li>
            <span aria-current="page">{o ? `Sipariş #${o.orderNo}` : 'Sipariş'}</span>
          </li>
        </ol>
      </nav>

      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && (
        <ErrorAlert onRetry={state.notFound ? undefined : reload}>
          {state.notFound ? 'Sipariş bulunamadı.' : 'Sipariş alınamadı.'}
        </ErrorAlert>
      )}

      {o && (
        <>
          {fresh && (
            <div ref={okRef} tabIndex={-1} className="ui-orderok">
              <Alert tone="info">
                <strong>Ön siparişiniz alındı #{o.orderNo}</strong>
                <br />
                Ödeme ve teslim detayları ekibimizle görüşülerek tamamlanır. Durum değişikliklerinde e-posta
                ile bilgilendirileceksiniz.
              </Alert>
            </div>
          )}
          <div className="ui-pagehead">
            <div className="ui-pagehead__title">
              <h1>Sipariş #{o.orderNo}</h1>
              <OrderStatusBadge status={o.status} />
            </div>
            <Button icon="bag" disabled={busy} onClick={doReorder}>
              {busy ? 'Ekleniyor…' : 'Tekrar sipariş ver'}
            </Button>
          </div>
          <p className="muted">
            {formatDateTime(o.submittedAt)} tarihinde gönderildi · Tekrar siparişte güncel fiyatlar kullanılır
          </p>
          {error && <Alert tone="danger">{error}</Alert>}

          <div className="ui-cartlayout">
            <div className="ui-cartlayout__lines ui-stack">
              <section className="ui-card ui-card__body ui-stack" aria-labelledby="od-delivery">
                <h2 id="od-delivery">Teslimat</h2>
                <dl className="ui-dl">
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
                      <dt>Not</dt>
                      <dd className="ui-prewrap">{o.note}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section aria-labelledby="od-lines" className="ui-stack">
                <h2 id="od-lines">Ürünler</h2>
                <div className="ui-table-wrap ui-table-wrap--cards">
                  <table className="ui-table">
                    <thead>
                      <tr>
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
                      </tr>
                    </thead>
                    <tbody>
                      {o.lines.map((l) => (
                        <tr key={l.lineNo}>
                          <td className="wrap">
                            <div className="ui-orderline">
                              <LineName l={l} />
                            </div>
                          </td>
                          <td className="num">{l.quantity}</td>
                          <td className="num">
                            <UnitPrice l={l} />
                          </td>
                          <td className="num">{formatTRY(l.lineNet)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="ui-cards">
                  {o.lines.map((l) => (
                    <li key={l.lineNo} className="ui-card ui-ordercard">
                      <div className="ui-orderline">
                        <LineName l={l} />
                      </div>
                      <dl className="ui-ordercard__sums num">
                        <div>
                          <dt>Adet</dt>
                          <dd>{l.quantity}</dd>
                        </div>
                        <div>
                          <dt>Birim fiyat (KDV hariç)</dt>
                          <dd>
                            <UnitPrice l={l} />
                          </dd>
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
              </section>

              <section className="ui-card ui-card__body ui-stack" aria-labelledby="od-history">
                <h2 id="od-history">Durum geçmişi</h2>
                <ol className="ui-timeline">
                  {o.history.map((h, i) => (
                    <li key={i}>
                      <strong>{orderStatusLabel(h.toStatus)}</strong>
                      <span className="muted">{formatDateTime(h.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <aside className="ui-card ui-summary" aria-labelledby="od-summary">
              <div className="ui-card__body ui-stack">
                <h2 id="od-summary">Sipariş toplamı</h2>
                <OrderTotals summary={o.summary} />
                <p className="muted ui-summary__note">
                  Gönderilen sipariş portalda değiştirilemez ve iptal edilemez. Değişiklik için bizi arayın:{' '}
                  <a href={PHONE_HREF}>{CONTACT.phone}</a>
                </p>
              </div>
            </aside>
          </div>
        </>
      )}
    </ShopLayout>
  )
}
