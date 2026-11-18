// Genel bakış: KPI kartları (önceki dönem ve geçen yıl farkıyla), aylık trend, grup dağılımı, ilk 5 ürün ve bayi.
import type { ReactNode } from 'react'
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
import { EmptyState } from '../../ui/components'
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
          <dt>Önceki dönem · {rangeText(overview.previous)}</dt>
          <dd>
            <span className="num ui-kpi__was">{fmt(metric.previous)}</span>
            <Delta change={metric.changePrev} kind={kind} />
          </dd>
        </div>
        <div>
          <dt>Geçen yıl · {rangeText(overview.lastYear)}</dt>
          <dd>
            <span className="num ui-kpi__was">{fmt(metric.lastYear)}</span>
            <Delta change={metric.changeYear} kind={kind} />
          </dd>
        </div>
      </dl>
    </div>
  )
}

function Section({
  id,
  title,
  note,
  action,
  children,
}: {
  id: string
  title: string
  note?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="ui-card ui-card__body ui-stack ui-rsection" aria-labelledby={id}>
      <div className="ui-reportbar">
        <div className="ui-rsection__head">
          <h2 id={id}>{title}</h2>
          {note && <p className="ui-rsection__note">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function NoData({ children }: { children: ReactNode }) {
  return (
    <EmptyState icon="chart" title="Bu dönemde veri yok">
      {children}
    </EmptyState>
  )
}

export function OverviewTab({
  from,
  to,
  overview,
  overviewFailed,
  onRetryOverview,
}: {
  from: string
  to: string
  overview: ReportOverview | null
  overviewFailed: boolean
  onRetryOverview: () => void
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
      {!overview && !overviewFailed && <LoadingCard rows={2} />}
      {overviewFailed && <ErrorAlert onRetry={onRetryOverview}>Özet göstergeler alınamadı.</ErrorAlert>}
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

      <Section
        id="rp-trend"
        title="Aylık net ciro"
        note="Son 12 ayın KDV hariç net cirosu; kesik çizgi geçen yılın aynı ayıdır. Ayrıntı için sütunun üzerine gelin."
        action={<ExportButton name="trend" params={{ months: 12 }} fallbackName="rapor-trend.xlsx" />}
      >
        {trend.state.status === 'loading' && <LoadingCard rows={2} />}
        {trend.state.status === 'error' && <ErrorAlert onRetry={trend.reload}>Trend alınamadı.</ErrorAlert>}
        {trend.state.status === 'ready' && <TrendChart data={trend.state.data} />}
      </Section>

      <Section
        id="rp-groups"
        title="Ürün grubu dağılımı"
        note="Seçilen dönemde net cironun gruplara göre payı."
      >
        {groups.state.status === 'loading' && <LoadingCard rows={2} />}
        {groups.state.status === 'error' && (
          <ErrorAlert onRetry={groups.reload}>Dağılım alınamadı.</ErrorAlert>
        )}
        {groups.state.status === 'ready' && groups.state.data.length === 0 && (
          <NoData>Başka bir dönem seçin; örneğin “Bu yıl” veya “Geçen yıl”.</NoData>
        )}
        {groups.state.status === 'ready' && groups.state.data.length > 0 && (
          <>
            <HBarList
              ranked
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
            {groups.state.data.length > 8 && (
              <Link to={`/yonetim/raporlar?sekme=gruplar&bas=${from}&bit=${to}`} className="ui-linkbtn">
                Tüm grupları gör ({groups.state.data.length})
              </Link>
            )}
          </>
        )}
      </Section>

      <div className="ui-minitables">
        <Section id="rp-top-products" title="En çok satan 5 ürün" note="Adet olarak, seçilen dönemde.">
          {products.state.status === 'loading' && <LoadingCard rows={2} />}
          {products.state.status === 'error' && (
            <ErrorAlert onRetry={products.reload}>Ürünler alınamadı.</ErrorAlert>
          )}
          {products.state.status === 'ready' && products.state.data.length === 0 && (
            <NoData>Bu dönemde ürün satışı olmadı.</NoData>
          )}
          {products.state.status === 'ready' && products.state.data.length > 0 && (
            <HBarList
              ranked
              label="En çok satan ürünler"
              rows={products.state.data.map((p, _i, all) => ({
                key: p.productId,
                label: p.name,
                to: `/yonetim/urunler/${encodeURIComponent(p.productId)}`,
                percent: (p.quantity / Math.max(1, ...all.map((x) => x.quantity))) * 100,
                text: `${formatInt(p.quantity)} adet`,
                sub: formatTRY(p.netTotal),
              }))}
            />
          )}
        </Section>
        <Section
          id="rp-top-dealers"
          title="En çok sipariş veren 5 bayi"
          note="Net ciroya göre, seçilen dönemde."
        >
          {dealers.state.status === 'loading' && <LoadingCard rows={2} />}
          {dealers.state.status === 'error' && (
            <ErrorAlert onRetry={dealers.reload}>Bayiler alınamadı.</ErrorAlert>
          )}
          {dealers.state.status === 'ready' && dealers.state.data.length === 0 && (
            <NoData>Bu dönemde sipariş veren bayi yok.</NoData>
          )}
          {dealers.state.status === 'ready' && dealers.state.data.length > 0 && (
            <HBarList
              ranked
              label="En çok sipariş veren bayiler"
              rows={dealers.state.data.slice(0, 5).map((d, _i, all) => ({
                key: d.dealerId,
                label: d.companyTitle,
                to: `/yonetim/bayiler/${encodeURIComponent(d.dealerId)}`,
                percent:
                  (Number(d.netTotal.current) / Math.max(1, ...all.map((x) => Number(x.netTotal.current)))) *
                  100,
                text: formatTRY(d.netTotal.current),
                sub: `${formatInt(d.orderCount)} sipariş`,
              }))}
            />
          )}
        </Section>
      </div>
    </div>
  )
}
