// K-66, K-67, K-72: Oturum açmış bayi için ana sayfa özeti ve hızlı erişim.
import { fetchAccount, fetchOrders, type Account, type OrderListItem, type Paged } from '../../api'
import { useLoad } from '../../admin/useLoad'
import { useAuth } from '../../auth/useAuth'
import { Link } from '../../Link'
import { OrderStatusBadge } from '../../ui/components'
import { formatDate, formatInt, formatPercent, formatTRY } from '../../ui/format'

export function DealerQuick() {
  const { state: auth } = useAuth()
  const name = auth.status === 'authenticated' ? auth.user.name : ''
  const account = useLoad<Account>((s) => fetchAccount(s), 'home-account')
  const orders = useLoad<Paged<OrderListItem>>((s) => fetchOrders({ page: 1, pageSize: 3 }, s), 'home-orders')
  const a = account.state.status === 'ready' ? account.state.data : null

  return (
    <section className="ui-quick" aria-labelledby="quick-title">
      <h2 id="quick-title" className="ui-quick__hello">
        Hoş geldiniz{name ? `, ${name}` : ''}
      </h2>
      <div className="ui-quick__stats" aria-live="polite">
        {account.state.status === 'loading' && <div className="ui-skeleton ui-quick__skel" />}
        {a && (
          <>
            <span className="ui-quickstat">
              <span className="ui-quickstat__label">İskonto oranınız</span>
              <strong className="num">
                {a.generalDiscountPercent ? formatPercent(a.generalDiscountPercent) : 'Liste fiyatı'}
              </strong>
            </span>
            <span className="ui-quickstat">
              <span className="ui-quickstat__label">Açık siparişler</span>
              <strong className="num">{formatInt(a.stats.openOrderCount)}</strong>
            </span>
            <span className="ui-quickstat">
              <span className="ui-quickstat__label">Bu yıl net (KDV hariç)</span>
              <strong className="num">{formatTRY(a.stats.yearNetTotal)}</strong>
            </span>
          </>
        )}
        {account.state.status === 'error' && (
          <p className="muted ui-quick__note">
            Hesap özeti alınamadı.{' '}
            <button type="button" className="ui-linklike" onClick={account.reload}>
              Tekrar dene
            </button>
          </p>
        )}
      </div>
      <div className="ui-quick__orders">
        <span className="ui-quickstat__label">Son siparişler</span>
        {orders.state.status === 'loading' && <span className="ui-skeleton ui-quick__skel" />}
        {orders.state.status === 'error' && <span className="muted">Alınamadı.</span>}
        {orders.state.status === 'ready' && orders.state.data.items.length === 0 && (
          <span className="muted">Henüz siparişiniz yok.</span>
        )}
        {orders.state.status === 'ready' && orders.state.data.items.length > 0 && (
          <ul className="ui-quick__orderlist">
            {orders.state.data.items.map((o) => (
              <li key={o.id}>
                <Link to={`/siparislerim/${encodeURIComponent(o.id)}`}>
                  <span className="num">#{o.orderNo}</span>
                  <span className="muted">{formatDate(o.submittedAt)}</span>
                  <OrderStatusBadge status={o.status} />
                  <span className="num ui-quick__ordertotal">{formatTRY(o.netTotal)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link to="/siparislerim" className="ui-quick__all">
          Tümü
        </Link>
      </div>
    </section>
  )
}
