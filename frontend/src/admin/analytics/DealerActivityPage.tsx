// K-85: Admin > Analitik > Bayi etkinliği (/yonetim/analitik/bayiler). Bayi tablosu ve "ilgileniyor ama sipariş vermedi" kartı.
import { useEffect, useState } from 'react'
import { fetchAnalyticsDealers, fetchDealer, type AnalyticsDealerRow } from '../../api'
import { Link } from '../../Link'
import { ErrorAlert } from '../../ui/catalog'
import { EmptyState } from '../../ui/components'
import { formatInt, formatTRY } from '../../ui/format'
import { Icon } from '../../ui/Icon'
import { AdminLayout } from '../AdminLayout'
import { Panel, SkeletonRows } from '../kit'
import { whatsappHref } from '../phone'
import { ReportTable, type Col } from '../reports/ui'
import { timeAgo } from '../time'
import { useLoad } from '../useLoad'
import { PeriodBar } from './shared'
import { usePeriod } from './lib'

const dealerTo = (id: string) => `/yonetim/bayiler/${encodeURIComponent(id)}`

/** WhatsApp bağlantıları için ilk 12 bayinin telefonu bayi detayından alınır (analitik yanıtında telefon yok). */
function usePhones(ids: string[]): Record<string, string | null> {
  const [phones, setPhones] = useState<Record<string, string | null>>({})
  const key = ids.join(',')
  useEffect(() => {
    let alive = true
    const c = new AbortController()
    void Promise.all(
      key
        .split(',')
        .filter(Boolean)
        .slice(0, 12)
        .map((id) =>
          fetchDealer(id, c.signal)
            .then((d) => [id, whatsappHref(d.phone)] as const)
            .catch(() => [id, null] as const),
        ),
    ).then((pairs) => {
      if (alive) setPhones(Object.fromEntries(pairs))
    })
    return () => {
      alive = false
      c.abort()
    }
  }, [key])
  return phones
}

function Interested({ rows }: { rows: AnalyticsDealerRow[] }) {
  const phones = usePhones(rows.map((r) => r.dealerId))
  return (
    <Panel title="İlgileniyor ama sipariş vermedi" flush>
      <p className="muted an-panelnote an-padded">
        Dönemde en az 3 ürün inceleyen ya da sepete ekleyen ama sipariş vermeyen bayiler: arayıp destek
        olabilirsiniz.
      </p>
      {rows.length === 0 ? (
        <p className="adm-empty">Bu dönemde böyle bir bayi yok.</p>
      ) : (
        <ul className="an-interest">
          {rows.map((r) => {
            const wa = phones[r.dealerId]
            return (
              <li key={r.dealerId}>
                <span className="an-interest__main">
                  <Link to={dealerTo(r.dealerId)}>{r.companyTitle}</Link>
                  <span className="muted an-interest__sub">
                    <span className="num">{formatInt(r.productViews)}</span> ürün inceledi ·{' '}
                    <span className="num">{formatInt(r.addToCarts)}</span> sepete ekledi
                    {r.lastSeenAt ? ` · son görülme ${timeAgo(r.lastSeenAt)}` : ''}
                  </span>
                </span>
                <span className="an-actions">
                  <Link className="ui-button ui-button--secondary ui-button--sm" to={dealerTo(r.dealerId)}>
                    Bayiye git
                  </Link>
                  {wa && (
                    <a
                      className="ui-button ui-button--secondary ui-button--sm"
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Icon name="whatsapp" />
                      WhatsApp<span className="visually-hidden"> (yeni sekmede açılır)</span>
                    </a>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

export function DealerActivityPage() {
  const { from, to, invalid } = usePeriod()
  const { state, reload } = useLoad((s) => fetchAnalyticsDealers({ from, to }, s), `${from}|${to}`)
  const d = state.status === 'ready' ? state.data : null

  const cols: Col<AnalyticsDealerRow>[] = [
    {
      key: 'dealer',
      label: 'Bayi',
      title: true,
      sort: (r) => r.companyTitle,
      cell: (r) => (
        <span className="an-prod__text">
          <Link to={dealerTo(r.dealerId)}>{r.companyTitle}</Link>
          {r.city && <span className="muted an-prod__sub">{r.city}</span>}
        </span>
      ),
    },
    {
      key: 'sessions',
      label: 'Oturum',
      num: true,
      sort: (r) => r.sessions,
      cell: (r) => formatInt(r.sessions),
    },
    {
      key: 'last',
      label: 'Son görülme',
      sort: (r) => r.lastSeenAt ?? '',
      cell: (r) => (r.lastSeenAt ? timeAgo(r.lastSeenAt) : '—'),
    },
    {
      key: 'views',
      label: 'İnceleme',
      num: true,
      sort: (r) => r.productViews,
      cell: (r) => formatInt(r.productViews),
    },
    {
      key: 'cart',
      label: 'Sepete ekleme',
      num: true,
      sort: (r) => r.addToCarts,
      cell: (r) => formatInt(r.addToCarts),
    },
    { key: 'orders', label: 'Sipariş', num: true, sort: (r) => r.orders, cell: (r) => formatInt(r.orders) },
    {
      key: 'net',
      label: 'Net (KDV hariç)',
      num: true,
      sort: (r) => Number(r.netTotal),
      cell: (r) => formatTRY(r.netTotal),
    },
  ]

  return (
    <AdminLayout title="Bayi etkinliği">
      <PeriodBar path="/yonetim/analitik/bayiler" from={from} to={to} invalid={invalid} />
      {state.status === 'loading' && <SkeletonRows rows={6} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Bayi etkinliği alınamadı.</ErrorAlert>}
      {d && (
        <>
          <Interested rows={d.interestedNoOrder} />
          <Panel title="Bayiler" flush>
            {d.items.length === 0 ? (
              <EmptyState icon="users" title="Bu dönemde bayi etkinliği yok">
                Bayiler giriş yapıp vitrinde gezdikçe burada görünür.
              </EmptyState>
            ) : (
              <div className="an-tablewrap">
                <ReportTable
                  rows={d.items}
                  cols={cols}
                  rowKey={(r) => r.dealerId}
                  caption="Bayi etkinliği"
                  defaultSort={{ key: 'sessions', dir: 'desc' }}
                />
              </div>
            )}
          </Panel>
        </>
      )}
    </AdminLayout>
  )
}
