// Genel bakış: KPI kartları (önceki dönem ve geçen yıl farkıyla), aylık trend, grup dağılımı, ilk 5 ürün ve bayi.
import type {
  Comparable,
  ReportDealerRow,
  ReportGroupRow,
  ReportOverview,
  ReportProductRow,
  ReportTrendPoint,
} from '../../api'
import { fetchReport, fetchReportList } from '../../api'
import { Link } from '../../Link'
import { ErrorAlert, LoadingCard } from '../../ui/catalog'
import { formatInt, formatTRY } from '../../ui/format'
import { useLoad } from '../useLoad'
import { HBarList, TrendChart } from './charts'
import { rangeText } from './periods'
import { Delta, ExportButton } from './ui'

function Kpi({
  label,
  metric,
  kind,
  overview,
}: {
  label: string
  metric: Comparable<number | string>
  kind: 'money' | 'count'
  overview: ReportOverview
}) {
  const fmt = (v: number | string) => (kind === 'money' ? formatTRY(String(v)) : formatInt(Number(v)))
  return (
    <div className="ui-card ui-kpi">
      <span className="ui-kpi__label">{label}</span>
      <span className="ui-kpi__value num">{fmt(metric.current)}</span>
      <dl className="ui-kpi__cmp">
        <div>
          <dt>Önceki dönem ({rangeText(overview.previous)})</dt>
          <dd>
            <span className="num muted">{fmt(metric.previous)}</span>{' '}
            <Delta change={metric.changePrev} kind={kind} />
          </dd>
        </div>
        <div>
          <dt>Geçen yıl ({rangeText(overview.lastYear)})</dt>
          <dd>
            <span className="num muted">{fmt(metric.lastYear)}</span>{' '}
            <Delta change={metric.changeYear} kind={kind} />
          </dd>
        </div>
      </dl>
    </div>
  )
}

export function OverviewTab({
  from,
  to,
  overview,
}: {
  from: string
  to: string
  overview: ReportOverview | null
}) {
  const trend = useLoad<ReportTrendPoint[]>((s) => fetchReport('trend', { months: 12 }, s), 'trend')
  const groups = useLoad<ReportGroupRow[]>(
    (s) => fetchReportList('groups', { from, to }, s),
    `g|${from}|${to}`,
  )
  const products = useLoad<ReportProductRow[]>(
    (s) => fetchReportList('products', { from, to, sort: 'quantity', limit: 5 }, s),
    `p|${from}|${to}`,
  )
  const dealers = useLoad<ReportDealerRow[]>(
    (s) => fetchReportList('dealers', { from, to }, s),
    `d|${from}|${to}`,
  )
  const m = overview?.metrics

  return (
    <div className="ui-stack ui-reportgrid">
      <div className="ui-reportbar">
        <ExportButton name="overview" params={{ from, to }} fallbackName={`rapor-genel-${from}-${to}.xlsx`} />
      </div>
      {!overview && <LoadingCard rows={2} />}
      {overview && m && (
        <section aria-label="Özet göstergeler" className="ui-kpis">
          <Kpi label="Sipariş sayısı" metric={m.orderCount} kind="count" overview={overview} />
          <Kpi label="Ciro (KDV hariç)" metric={m.netTotal} kind="money" overview={overview} />
          <Kpi label="Ciro (KDV dahil)" metric={m.grandTotal} kind="money" overview={overview} />
          <Kpi label="Sipariş veren bayi" metric={m.orderingDealerCount} kind="count" overview={overview} />
          <Kpi
            label="Ortalama sipariş (KDV hariç)"
            metric={m.averageOrderNet}
            kind="money"
            overview={overview}
          />
        </section>
      )}

      <section className="ui-card ui-card__body ui-stack" aria-labelledby="rp-trend">
        <h2 id="rp-trend">Aylık net ciro · son 12 ay</h2>
        {trend.state.status === 'loading' && <LoadingCard rows={2} />}
        {trend.state.status === 'error' && <ErrorAlert onRetry={trend.reload}>Trend alınamadı.</ErrorAlert>}
        {trend.state.status === 'ready' && <TrendChart data={trend.state.data} />}
      </section>

      <section className="ui-card ui-card__body ui-stack" aria-labelledby="rp-groups">
        <h2 id="rp-groups">Ürün grubu dağılımı (net ciro payı)</h2>
        {groups.state.status === 'loading' && <LoadingCard rows={2} />}
        {groups.state.status === 'error' && (
          <ErrorAlert onRetry={groups.reload}>Dağılım alınamadı.</ErrorAlert>
        )}
        {groups.state.status === 'ready' && groups.state.data.length === 0 && (
          <p className="muted">Bu dönemde satış yok.</p>
        )}
        {groups.state.status === 'ready' && groups.state.data.length > 0 && (
          <HBarList
            label="Ürün grubu net ciro payı"
            rows={[...groups.state.data]
              .sort((a, b) => Number(b.sharePercent) - Number(a.sharePercent))
              .slice(0, 8)
              .map((g) => ({
                key: g.groupId,
                label: g.name,
                percent: Number(g.sharePercent),
                text: `${formatTRY(g.netTotal.current)} · %${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(Number(g.sharePercent))}`,
              }))}
          />
        )}
      </section>

      <div className="ui-minitables">
        <section className="ui-card ui-card__body ui-stack" aria-labelledby="rp-top-products">
          <h2 id="rp-top-products">En çok satan 5 ürün</h2>
          {products.state.status === 'loading' && <LoadingCard rows={2} />}
          {products.state.status === 'error' && (
            <ErrorAlert onRetry={products.reload}>Ürünler alınamadı.</ErrorAlert>
          )}
          {products.state.status === 'ready' && products.state.data.length === 0 && (
            <p className="muted">Bu dönemde satış yok.</p>
          )}
          {products.state.status === 'ready' && products.state.data.length > 0 && (
            <ol className="ui-toplist">
              {products.state.data.map((p) => (
                <li key={p.productId}>
                  <Link to={`/yonetim/urunler/${encodeURIComponent(p.productId)}`}>{p.name}</Link>
                  <span className="muted num">
                    {formatInt(p.quantity)} adet · {formatTRY(p.netTotal)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="ui-card ui-card__body ui-stack" aria-labelledby="rp-top-dealers">
          <h2 id="rp-top-dealers">En çok sipariş veren 5 bayi</h2>
          {dealers.state.status === 'loading' && <LoadingCard rows={2} />}
          {dealers.state.status === 'error' && (
            <ErrorAlert onRetry={dealers.reload}>Bayiler alınamadı.</ErrorAlert>
          )}
          {dealers.state.status === 'ready' && dealers.state.data.length === 0 && (
            <p className="muted">Bu dönemde sipariş yok.</p>
          )}
          {dealers.state.status === 'ready' && dealers.state.data.length > 0 && (
            <ol className="ui-toplist">
              {dealers.state.data.slice(0, 5).map((d) => (
                <li key={d.dealerId}>
                  <Link to={`/yonetim/bayiler/${encodeURIComponent(d.dealerId)}`}>{d.companyTitle}</Link>
                  <span className="muted num">
                    {formatInt(d.orderCount)} sipariş · {formatTRY(d.netTotal.current)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
