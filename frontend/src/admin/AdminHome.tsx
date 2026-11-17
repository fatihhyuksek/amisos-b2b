// GR-BAYI-002, GR-RAP-001, K-04, K-78: Admin ana sayfası. KPI kartları, 30 günlük satış grafiği, açık sipariş hattı,
// "ilgilenilmesi gerekenler", son siparişler, ayın en iyi bayileri ve son işlemler. Tutarlar sunucudan gelir.
import { useState } from 'react'
import { fetchDashboard, type Dashboard } from '../api'
import { useAuth } from '../auth/useAuth'
import { Link } from '../Link'
import { ErrorAlert } from '../ui/catalog'
import { OrderStatusBadge } from '../ui/components'
import { formatDateTime, formatInt, formatTRY } from '../ui/format'
import { Icon } from '../ui/Icon'
import { orderStatusLabel } from '../ui/orderStatus'
import { AdminLayout } from './AdminLayout'
import { Delta, Panel } from './kit'
import { SalesAreaChart } from './reports/charts'
import { timeAgo } from './time'
import { useLoad } from './useLoad'

const todayFmt = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  weekday: 'long',
  timeZone: 'Europe/Istanbul',
})

function greeting(now: Date): string {
  const h = Number(
    new Intl.DateTimeFormat('tr-TR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Istanbul' }).format(
      now,
    ),
  )
  if (h < 6) return 'İyi geceler'
  if (h < 12) return 'Günaydın'
  if (h < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

interface AttentionRow {
  key: string
  count: number
  text: string
  /** Sıfır olduğunda tek satırlık soluk özette kullanılan kısa ad. */
  short: string
  to: string
  danger?: boolean
}

function attentionRows(a: Dashboard['attention']): AttentionRow[] {
  return [
    {
      key: 'newOrders',
      count: a.newOrders,
      text: 'yeni sipariş yanıt bekliyor',
      short: 'yeni sipariş',
      to: '/yonetim/siparisler?durum=submitted',
    },
    {
      key: 'overdue',
      count: a.overdueApplications,
      text: 'bayi başvurusu gecikti',
      short: 'geciken başvuru',
      to: '/yonetim/bayiler?durum=pending_approval',
      danger: true,
    },
    {
      key: 'pending',
      count: a.pendingApplications,
      text: 'bayi başvurusu onay bekliyor',
      short: 'onay bekleyen başvuru',
      to: '/yonetim/bayiler?durum=pending_approval',
    },
    {
      key: 'transfer',
      count: a.notTransferred,
      text: "sipariş BizimHesap'a girilmedi",
      short: "BizimHesap'a girilmeyen sipariş",
      to: '/yonetim/siparisler?aktarim=girilmedi',
    },
    {
      key: 'failed',
      count: a.failedNotifications,
      text: 'e-posta gönderilemedi',
      short: 'başarısız e-posta',
      to: '/yonetim/bildirimler',
      danger: true,
    },
    {
      key: 'featured',
      count: a.featuredOutOfStock,
      text: 'öne çıkan ürün stokta yok',
      short: 'stokta olmayan öne çıkan ürün',
      to: '/yonetim/urunler?oneCikan=true&stok=out_of_stock',
    },
    {
      key: 'inactive',
      count: a.inactiveDealers60d,
      text: 'bayi 60 günden uzun süredir sipariş vermedi',
      short: 'pasif bayi',
      to: '/yonetim/raporlar?sekme=pasif',
    },
  ]
}

function KpiSkeleton() {
  return (
    <div className="adm-kpis" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="adm-kpi">
          <div className="ui-skeleton" style={{ height: '0.875rem', width: '45%' }} />
          <div className="ui-skeleton" style={{ height: '1.75rem', width: '65%' }} />
          <div className="ui-skeleton" style={{ height: '0.875rem', width: '55%' }} />
        </div>
      ))}
      <span className="visually-hidden" role="status">
        Yükleniyor…
      </span>
    </div>
  )
}

export function AdminHome() {
  const { state: auth } = useAuth()
  const { state, reload } = useLoad<Dashboard>((s) => fetchDashboard(s), 'dashboard')
  const [now] = useState(() => new Date())
  const first = auth.status === 'authenticated' ? auth.user.name.split(' ')[0] : ''

  return (
    <AdminLayout title="Ana sayfa">
      <div className="adm-greet">
        <p>
          {greeting(now)}
          {first ? `, ${first}` : ''}. Bugün neler olduğuna bir bakış.
        </p>
        <p className="num">{todayFmt.format(now)}</p>
      </div>

      {state.status === 'loading' && (
        <>
          <KpiSkeleton />
          <div className="adm-skel adm-card" aria-hidden="true">
            <div className="ui-skeleton" style={{ height: '12rem' }} />
          </div>
        </>
      )}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Panel özeti alınamadı.</ErrorAlert>}
      {state.status === 'ready' && <Content d={state.data} />}
    </AdminLayout>
  )
}

function Content({ d }: { d: Dashboard }) {
  const k = d.kpis
  const rows = attentionRows(d.attention)
  const active = rows.filter((r) => r.count > 0)
  const quiet = rows.filter((r) => r.count === 0)
  const maxPipe = Math.max(1, ...d.pipeline.map((p) => p.count))

  return (
    <>
      <div className="adm-kpis">
        <Link to="/yonetim/raporlar" className="adm-kpi">
          <span className="adm-kpi__label">Bu ay net satış</span>
          <span className="adm-kpi__value">{formatTRY(k.monthNet.current)}</span>
          <Delta percent={k.monthNet.percent} />
        </Link>
        <Link to="/yonetim/siparisler" className="adm-kpi">
          <span className="adm-kpi__label">Bu ay sipariş</span>
          <span className="adm-kpi__value">{formatInt(k.monthOrders.current)}</span>
          <Delta percent={k.monthOrders.percent} />
        </Link>
        <Link to="/yonetim/raporlar" className="adm-kpi">
          <span className="adm-kpi__label">Ortalama sipariş (net)</span>
          <span className="adm-kpi__value">{formatTRY(k.averageOrderNet.current)}</span>
          <Delta percent={k.averageOrderNet.percent} />
        </Link>
        <Link to="/yonetim/bayiler?durum=active" className="adm-kpi">
          <span className="adm-kpi__label">Aktif bayi</span>
          <span className="adm-kpi__value">{formatInt(k.activeDealers.current)}</span>
          <span className="adm-kpi__sub">
            <span className="num">{formatInt(k.activeDealers.orderingThisMonth)}</span> tanesi bu ay sipariş
            verdi
          </span>
        </Link>
      </div>
      <p className="muted" style={{ marginTop: '-0.5rem', fontSize: '0.75rem' }}>
        Tutarlar KDV hariçtir; iptal edilen siparişler dahil değildir. Karşılaştırma geçen ayın aynı günlerine
        göredir.
      </p>

      <div className="adm-dash">
        <div className="adm-stack">
          <Panel title="Son 30 gün satış" action={<Link to="/yonetim/raporlar">Raporlar</Link>} flush>
            <SalesAreaChart data={d.sales30d} />
          </Panel>

          <Panel title="Son siparişler" flush action={<Link to="/yonetim/siparisler">Tümünü gör</Link>}>
            {d.recentOrders.length === 0 ? (
              <p className="adm-empty">Henüz sipariş yok.</p>
            ) : (
              <div className="ui-table-wrap ui-table-wrap--scroll" style={{ border: 0, borderRadius: 0 }}>
                <table className="ui-table">
                  <caption className="visually-hidden">Son siparişler</caption>
                  <thead>
                    <tr>
                      <th scope="col">Sipariş</th>
                      <th scope="col">Bayi</th>
                      <th scope="col">Durum</th>
                      <th scope="col" className="num">
                        Toplam (KDV dahil)
                      </th>
                      <th scope="col" className="adm-hide-sm">
                        Tarih
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.recentOrders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <Link
                            className="ui-rowlink num"
                            to={`/yonetim/siparisler/${encodeURIComponent(o.id)}`}
                          >
                            #{o.orderNo}
                          </Link>
                        </td>
                        <td className="wrap">{o.dealer.companyTitle}</td>
                        <td>
                          <OrderStatusBadge status={o.status} />
                        </td>
                        <td className="num">{formatTRY(o.grandTotal)}</td>
                        <td className="muted num adm-hide-sm">{formatDateTime(o.submittedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Son işlemler" action={<Link to="/yonetim/islem-gecmisi">İşlem geçmişi</Link>} flush>
            {d.recentActivity.length === 0 ? (
              <p className="adm-empty">Kayıt yok.</p>
            ) : (
              <ul className="adm-activity">
                {d.recentActivity.map((a) => (
                  <li key={a.id}>
                    <span className="adm-activity__what">
                      <strong>{a.actorName ?? 'Sistem'}</strong> · {a.actionLabel}
                      {a.entityLabel ? <span className="muted"> · {a.entityLabel}</span> : null}
                    </span>
                    <span className="adm-activity__when">{timeAgo(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="adm-stack">
          <Panel title="İlgilenilmesi gerekenler" flush>
            {active.length === 0 ? (
              <p className="adm-attn__ok">
                <Icon name="check" />
                Şu an bekleyen bir iş yok.
              </p>
            ) : (
              <ul className="adm-attn">
                {active.map((r) => (
                  <li key={r.key}>
                    <Link to={r.to}>
                      <span className={r.danger ? 'adm-attn__n adm-attn__n--danger num' : 'adm-attn__n num'}>
                        {formatInt(r.count)}
                      </span>
                      <span className="adm-attn__text">{r.text}</span>
                      <Icon name="chevronRight" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {active.length > 0 && quiet.length > 0 && (
              <p className="adm-attn__quiet">Bekleyen yok: {quiet.map((q) => q.short).join(', ')}</p>
            )}
          </Panel>

          <Panel title="Açık sipariş hattı" flush>
            <ul className="adm-pipe" aria-label="Duruma göre açık siparişler">
              {d.pipeline.map((p) => (
                <li key={p.status}>
                  <Link className="adm-pipe__row" to={`/yonetim/siparisler?durum=${p.status}`}>
                    <span>{orderStatusLabel(p.status)}</span>
                    <span className="adm-pipe__track" aria-hidden="true">
                      <span className="adm-pipe__fill" style={{ width: `${(p.count / maxPipe) * 100}%` }} />
                    </span>
                    <span className="adm-pipe__n num">{formatInt(p.count)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Bu ayın en iyi bayileri"
            flush
            action={<Link to="/yonetim/raporlar?sekme=bayiler">Rapor</Link>}
          >
            {d.topDealersMonth.length === 0 ? (
              <p className="adm-empty">Bu ay henüz sipariş yok.</p>
            ) : (
              <ol className="adm-list">
                {d.topDealersMonth.map((t, i) => (
                  <li key={t.dealerId}>
                    <span className="adm-list__main">
                      <Link to={`/yonetim/bayiler/${encodeURIComponent(t.dealerId)}`}>
                        <span className="muted num">{i + 1}. </span>
                        {t.companyTitle}
                      </Link>
                      <span className="adm-list__sub num">{formatInt(t.orderCount)} sipariş</span>
                    </span>
                    <strong className="num">{formatTRY(t.netTotal)}</strong>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
