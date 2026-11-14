// GR-SIP-006, K-23, K-25: Sipariş geçmişi (/siparislerim). Masaüstünde tablo, mobilde kart.
import { fetchOrders, type OrderListItem, type Paged } from '../api'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { replace, useRoute } from '../router'
import { Alert, EmptyState, OrderStatusBadge, Pagination } from '../ui/components'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { formatDateTime, formatInt, formatTRY } from '../ui/format'
import { ShopLayout } from './ShopLayout'

const PAGE_SIZE = 20

export function OrdersPage() {
  const { query } = useRoute()
  const page = Math.max(1, Number(query.get('sayfa')) || 1)
  const emptyCartInfo = query.get('bilgi') === 'sepet-bos'
  const { state, reload } = useLoad<Paged<OrderListItem>>(
    (s) => fetchOrders({ page, pageSize: PAGE_SIZE }, s),
    String(page),
  )
  const go = (p: number) => replace(p > 1 ? `/siparislerim?sayfa=${p}` : '/siparislerim')

  return (
    <ShopLayout>
      <h1>Siparişlerim</h1>
      {emptyCartInfo && (
        <Alert tone="info">
          Sepetiniz boştu; ön siparişiniz az önce gönderilmiş olabilir. Aşağıdaki listeden kontrol edin.
        </Alert>
      )}
      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Siparişler alınamadı.</ErrorAlert>}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="ui-card">
          <EmptyState
            title="Henüz siparişiniz yok"
            action={
              <Link to="/katalog" className="ui-button ui-button--primary">
                Kataloğa git
              </Link>
            }
          >
            Gönderdiğiniz ön siparişler burada listelenir.
          </EmptyState>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
          <p className="muted" aria-live="polite">
            {formatInt(state.data.total)} sipariş · Tutarlar KDV hariç net ve KDV dahil genel toplam olarak
            gösterilir
          </p>
          <div className="ui-table-wrap ui-table-wrap--cards">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Sipariş no</th>
                  <th scope="col">Tarih</th>
                  <th scope="col">Durum</th>
                  <th scope="col" className="num">
                    Satır
                  </th>
                  <th scope="col" className="num">
                    Net (KDV hariç)
                  </th>
                  <th scope="col" className="num">
                    Genel toplam
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/siparislerim/${encodeURIComponent(o.id)}`}>#{o.orderNo}</Link>
                    </td>
                    <td>{formatDateTime(o.submittedAt)}</td>
                    <td>
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td className="num">{o.lineCount}</td>
                    <td className="num">{formatTRY(o.netTotal)}</td>
                    <td className="num">
                      <strong>{formatTRY(o.grandTotal)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="ui-cards">
            {state.data.items.map((o) => (
              <li key={o.id} className="ui-card ui-ordercard">
                <div className="ui-ordercard__head">
                  <Link to={`/siparislerim/${encodeURIComponent(o.id)}`} className="ui-ordercard__no num">
                    <span className="visually-hidden">Sipariş </span>#{o.orderNo}
                  </Link>
                  <OrderStatusBadge status={o.status} />
                </div>
                <p className="muted">
                  {formatDateTime(o.submittedAt)} · {o.lineCount} satır
                </p>
                <dl className="ui-ordercard__sums num">
                  <div>
                    <dt>Net (KDV hariç)</dt>
                    <dd>{formatTRY(o.netTotal)}</dd>
                  </div>
                  <div>
                    <dt>Genel toplam</dt>
                    <dd>
                      <strong>{formatTRY(o.grandTotal)}</strong>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <Pagination
            page={state.data.page}
            pageSize={state.data.pageSize}
            total={state.data.total}
            onChange={go}
          />
        </>
      )}
    </ShopLayout>
  )
}
