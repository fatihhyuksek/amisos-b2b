// K-84, K-85: Admin > Analitik > Trafik (/yonetim/analitik?bas=&bit=). Karşılaştırmalı göstergeler, günlük grafik,
// "Şu an sitede" canlı kartı (30 sn'de bir yenilenir), dönüşüm hunisi, saat yoğunluğu, cihaz, kaynak, sayfalar.
import { useEffect, useState } from 'react'
import {
  fetchAnalyticsLive,
  fetchAnalyticsOverview,
  type AnalyticsLive,
  type AnalyticsOverview,
  type Compared,
} from '../../api'
import { Link } from '../../Link'
import { ErrorAlert } from '../../ui/catalog'
import { EmptyState } from '../../ui/components'
import { formatInt, formatPercent } from '../../ui/format'
import { AdminLayout } from '../AdminLayout'
import { Delta, Panel, SkeletonRows } from '../kit'
import { HBarList } from '../reports/charts'
import { timeAgo } from '../time'
import { useLoad } from '../useLoad'
import { DailyChart, Funnel, HoursChart } from './charts'
import { EventIcon, PeriodBar } from './shared'
import { DEVICE_LABEL, EVENT_LABEL, pathLabel, usePeriod } from './lib'

const LIVE_MS = 30_000

function Kpi({
  label,
  metric,
  fmt = formatInt,
  hint,
}: {
  label: string
  metric: Compared
  fmt?: (n: number) => string
  hint?: string
}) {
  return (
    <div className="adm-kpi">
      <span className="adm-kpi__label">{label}</span>
      <span className="adm-kpi__value">{fmt(metric.current)}</span>
      <Delta percent={metric.percent} label="önceki döneme göre" />
      <span className="adm-kpi__sub">
        Önceki dönem: <span className="num">{fmt(metric.previous)}</span>
        {hint ? ` · ${hint}` : ''}
      </span>
    </div>
  )
}

const rate = (n: number) => formatPercent(String(n))

/** "Şu an sitede": son 5 dakikadaki farklı oturumlar, aktif bayiler ve son olaylar. 30 sn'de bir, sekme açıkken yenilenir. */
export function LiveCard() {
  const [live, setLive] = useState<AnalyticsLive | null>(null)
  const [failed, setFailed] = useState(false)
  const [updated, setUpdated] = useState<number | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const c = new AbortController()
    fetchAnalyticsLive(c.signal)
      .then((d) => {
        if (!alive) return
        setLive(d)
        setFailed(false)
        setUpdated(Date.now())
      })
      .catch(() => {
        if (alive && !c.signal.aborted) setFailed(true)
      })
    return () => {
      alive = false
      c.abort()
    }
  }, [tick])

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1)
    }, LIVE_MS)
    return () => clearInterval(t)
  }, [])

  return (
    <Panel
      title="Şu an sitede"
      action={
        <button type="button" className="adm-textbtn" onClick={() => setTick((n) => n + 1)}>
          Yenile
        </button>
      }
    >
      {!live && !failed && <SkeletonRows rows={4} />}
      {failed && !live && (
        <ErrorAlert onRetry={() => setTick((n) => n + 1)}>Canlı veri alınamadı.</ErrorAlert>
      )}
      {live && (
        <div className="an-live">
          <p className="an-live__big" aria-live="polite">
            <span className="an-live__dot" aria-hidden="true" />
            <strong className="num">{formatInt(live.activeVisitors)}</strong>
            <span>
              kişi aktif <span className="muted">(son 5 dakika)</span>
            </span>
          </p>
          {failed && <p className="muted an-live__stale">Yenilenemedi; son alınan veri gösteriliyor.</p>}

          <h3 className="an-sub">Aktif bayiler</h3>
          {live.activeDealers.length === 0 ? (
            <p className="muted">Şu an sitede giriş yapmış bayi yok.</p>
          ) : (
            <ul className="an-list">
              {live.activeDealers.map((d) => (
                <li key={d.dealerId}>
                  <span className="an-list__main">
                    <Link to={`/yonetim/bayiler/${encodeURIComponent(d.dealerId)}`}>{d.companyTitle}</Link>
                    <span className="muted an-list__sub">{pathLabel(d.path)}</span>
                  </span>
                  <span className="muted num">{timeAgo(d.lastSeenAt)}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="an-sub">Son olaylar</h3>
          {live.recent.length === 0 ? (
            <p className="muted">Henüz olay yok.</p>
          ) : (
            <ul className="an-feed">
              {live.recent.map((e, i) => (
                <li key={`${e.at}-${i}`}>
                  <EventIcon type={e.type} />
                  <span className="an-feed__text">
                    <span>
                      {e.dealerName ? <strong>{e.dealerName}</strong> : <span>Ziyaretçi</span>} ·{' '}
                      {EVENT_LABEL[e.type].toLocaleLowerCase('tr')}
                    </span>
                    <span className="muted an-feed__sub">
                      {e.type === 'search' && e.query ? `“${e.query}”` : (e.productName ?? pathLabel(e.path))}
                    </span>
                  </span>
                  <span className="muted num an-feed__time">{timeAgo(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
          {updated && (
            <p className="muted an-live__foot">
              30 saniyede bir yenilenir · Son güncelleme{' '}
              {new Intl.DateTimeFormat('tr-TR', { timeStyle: 'medium', timeZone: 'Europe/Istanbul' }).format(
                updated,
              )}
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}

export function TrafficPage() {
  const { from, to, invalid } = usePeriod()
  const { state, reload } = useLoad<AnalyticsOverview>(
    (s) => fetchAnalyticsOverview({ from, to }, s),
    `${from}|${to}`,
  )
  const o = state.status === 'ready' ? state.data : null
  const empty = o !== null && o.totals.pageViews.current === 0

  return (
    <AdminLayout title="Trafik">
      <PeriodBar path="/yonetim/analitik" from={from} to={to} invalid={invalid} previous={o?.previous} />
      <p className="an-note muted">
        Ziyaretçi sayısı çerezsiz ve günlük bir tahmindir: aynı kişi farklı günlerde yeniden sayılır, dönem
        toplamı günlük ziyaretçi sayılarının toplamıdır. Gizlilik için kişi kimliği saklanmaz.
      </p>

      {state.status === 'loading' && <SkeletonRows rows={5} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Trafik verisi alınamadı.</ErrorAlert>}

      {o && (
        <>
          <div className="adm-kpis an-kpis">
            <Kpi label="Ziyaretçi" metric={o.totals.visitors} />
            <Kpi label="Oturum" metric={o.totals.sessions} />
            <Kpi label="Sayfa görüntüleme" metric={o.totals.pageViews} />
            <Kpi label="Bayi ziyaretçi" metric={o.totals.dealerVisitors} />
            <Kpi label="Sepete ekleme" metric={o.totals.addToCarts} />
            <Kpi label="Sipariş" metric={o.totals.orders} />
            <Kpi
              label="Dönüşüm oranı"
              metric={o.totals.conversionRate}
              fmt={rate}
              hint="sipariş veren oturum / oturum"
            />
          </div>

          {empty && (
            <div className="adm-card">
              <EmptyState icon="chart" title="Bu dönemde trafik verisi yok">
                Vitrin ziyaretleri kaydedildikçe burada görünür. Başka bir dönem seçmeyi deneyin.
              </EmptyState>
            </div>
          )}
        </>
      )}

      <div className="adm-dash">
        <div className="adm-stack">
          {o && !empty && (
            <>
              <Panel title="Günlük ziyaretçi ve sayfa görüntüleme" flush>
                <DailyChart data={o.daily} />
              </Panel>
              <Panel title="Dönüşüm hunisi">
                <p className="muted an-panelnote">
                  Her adım, o adıma ulaşan oturum sayısıdır. Oranlar bir önceki adıma göre hesaplanır.
                </p>
                <Funnel steps={o.funnel} />
              </Panel>
              <Panel title="Saatlere göre yoğunluk">
                <HoursChart data={o.hours} />
              </Panel>
              <Panel title="En çok görüntülenen sayfalar" flush>
                {o.topPages.length === 0 ? (
                  <p className="adm-empty">Veri yok.</p>
                ) : (
                  <div className="an-padded">
                    <HBarList
                      ranked
                      label="En çok görüntülenen sayfalar"
                      rows={o.topPages.map((p) => ({
                        key: p.path,
                        label: pathLabel(p.path),
                        sub: `${formatInt(p.visitors)} ziyaretçi`,
                        percent: (p.pageViews / Math.max(1, o.topPages[0].pageViews)) * 100,
                        text: formatInt(p.pageViews),
                        to: p.path,
                      }))}
                    />
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>
        <div className="adm-stack">
          <LiveCard />
          {o && !empty && (
            <>
              <Panel title="Cihaz dağılımı">
                <HBarList
                  label="Cihaz dağılımı (oturum)"
                  rows={o.devices.map((d) => ({
                    key: d.device,
                    label: DEVICE_LABEL[d.device] ?? d.device,
                    percent: d.share,
                    text: `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(d.share)} · ${formatInt(d.sessions)}`,
                  }))}
                />
              </Panel>
              <Panel title="Kaynaklar">
                {o.referrers.length === 0 ? (
                  <p className="muted">Veri yok.</p>
                ) : (
                  <HBarList
                    label="Trafik kaynakları (oturum)"
                    rows={o.referrers.map((r) => ({
                      key: r.host,
                      label: r.host,
                      percent: (r.sessions / Math.max(1, o.referrers[0].sessions)) * 100,
                      text: formatInt(r.sessions),
                    }))}
                  />
                )}
              </Panel>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
