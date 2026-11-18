// K-85: Trafik grafikleri. Hafif SVG/CSS, renkler tasarım belirteçlerinden; her grafiğin tablo/metin karşılığı var.
import { useState } from 'react'
import type { AnalyticsOverview } from '../../api'
import { formatInt } from '../../ui/format'
import { niceScale, useWidth } from '../reports/chartUtils'

const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })
const dayLongFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })
const dayOf = (iso: string) => new Date(`${iso}T12:00:00`)

const H = 230
const M = { top: 10, right: 10, bottom: 26, left: 44 }

/** Günlük ziyaretçi (düz çizgi + alan) ve sayfa görüntüleme (kesik çizgi). İpucu ve "Tabloyu göster". */
export function DailyChart({ data }: { data: AnalyticsOverview['daily'] }) {
  const { ref, width } = useWidth()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const n = data.length
  const { top, values } = niceScale(Math.max(0, ...data.map((d) => Math.max(d.visitors, d.pageViews))), 4)
  const innerW = Math.max(0, width - M.left - M.right)
  const innerH = H - M.top - M.bottom
  const x = (i: number) => M.left + (n > 1 ? (innerW * i) / (n - 1) : innerW / 2)
  const y = (v: number) => M.top + innerH - (v / top) * innerH
  const path = (pick: (d: AnalyticsOverview['daily'][number]) => number) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pick(d)).toFixed(1)}`).join(' ')
  const visitors = path((d) => d.visitors)
  const area = n ? `${visitors} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : ''
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 64))))

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const rel = (e.clientX - r.left - M.left) / (innerW || 1)
    setHover(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))))
  }
  const h = hover !== null ? data[hover] : null

  return (
    <div className="adm-chart">
      <div className="an-legend" aria-hidden="true">
        <span>
          <i className="an-sw an-sw--solid" /> Ziyaretçi
        </span>
        <span>
          <i className="an-sw an-sw--dash" /> Sayfa görüntüleme
        </span>
      </div>
      <div ref={ref} className="an-chartbox">
        {width > 0 && n > 0 && (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`Günlük ziyaretçi (düz çizgi) ve sayfa görüntüleme (kesik çizgi) grafiği, ${n} gün. Aynı veri için Tabloyu göster düğmesini kullanın.`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {values.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className="adm-chart__grid" />
                <text
                  x={M.left - 8}
                  y={y(v)}
                  className="adm-chart__tick"
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {formatInt(v)}
                </text>
              </g>
            ))}
            <path d={area} className="adm-chart__area" />
            <path d={visitors} className="adm-chart__line" />
            <path d={path((d) => d.pageViews)} className="an-line2" />
            {data.map((d, i) =>
              (n - 1 - i) % step === 0 ? (
                <text key={d.date} x={x(i)} y={H - 8} className="adm-chart__tick" textAnchor="middle">
                  {dayFmt.format(dayOf(d.date))}
                </text>
              ) : null,
            )}
            {hover !== null && h && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={M.top}
                  y2={M.top + innerH}
                  className="adm-chart__cross"
                />
                <circle cx={x(hover)} cy={y(h.visitors)} r={4} className="adm-chart__dot" />
                <circle cx={x(hover)} cy={y(h.pageViews)} r={4} className="an-dot2" />
              </g>
            )}
          </svg>
        )}
        {h && hover !== null && (
          <div
            className="adm-chart__tip"
            style={{ left: Math.min(Math.max(x(hover) - 70, 0), Math.max(0, width - 170)), top: 0 }}
          >
            <strong>{dayLongFmt.format(dayOf(h.date))}</strong>
            <br />
            <span className="num">{formatInt(h.visitors)}</span> ziyaretçi
            <br />
            <span className="num">{formatInt(h.pageViews)}</span> sayfa görüntüleme
            <br />
            <span className="num">{formatInt(h.orders)}</span> sipariş
          </div>
        )}
      </div>
      <button type="button" className="adm-textbtn" aria-expanded={table} onClick={() => setTable((t) => !t)}>
        {table ? 'Tabloyu gizle' : 'Tabloyu göster'}
      </button>
      {table && (
        <div className="ui-table-wrap ui-table-wrap--scroll an-scrolltable">
          <table className="ui-table">
            <caption className="visually-hidden">Günlük trafik</caption>
            <thead>
              <tr>
                <th scope="col">Gün</th>
                <th scope="col" className="num">
                  Ziyaretçi
                </th>
                <th scope="col" className="num">
                  Oturum
                </th>
                <th scope="col" className="num">
                  Sayfa görüntüleme
                </th>
                <th scope="col" className="num">
                  Bayi ziyaretçi
                </th>
                <th scope="col" className="num">
                  Sipariş
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.date}>
                  <th scope="row">{dayLongFmt.format(dayOf(d.date))}</th>
                  <td className="num">{formatInt(d.visitors)}</td>
                  <td className="num">{formatInt(d.sessions)}</td>
                  <td className="num">{formatInt(d.pageViews)}</td>
                  <td className="num">{formatInt(d.dealerVisitors)}</td>
                  <td className="num">{formatInt(d.orders)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Saatlere göre yoğunluk: 24 sütun (0–23, İstanbul saati). */
export function HoursChart({ data }: { data: AnalyticsOverview['hours'] }) {
  const byHour = new Map(data.map((h) => [h.hour, h.pageViews]))
  const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, pageViews: byHour.get(hour) ?? 0 }))
  const max = Math.max(1, ...rows.map((r) => r.pageViews))
  const peak = rows.reduce((a, b) => (b.pageViews > a.pageViews ? b : a), rows[0])
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
  return (
    <div className="an-hours">
      <ol className="an-hours__cols" aria-label="Saatlere göre sayfa görüntüleme">
        {rows.map((r) => (
          <li key={r.hour} title={`${hh(r.hour)}: ${formatInt(r.pageViews)} sayfa görüntüleme`}>
            <span
              className="an-hours__bar"
              style={{ height: `${Math.max(2, (r.pageViews / max) * 100)}%` }}
            />
            <span className="an-hours__lab" aria-hidden="true">
              {r.hour % 3 === 0 ? r.hour : ''}
            </span>
            <span className="visually-hidden">
              {hh(r.hour)}: {formatInt(r.pageViews)}
            </span>
          </li>
        ))}
      </ol>
      <p className="muted an-hours__note">
        {peak.pageViews > 0
          ? `En yoğun saat: ${hh(peak.hour)} (${formatInt(peak.pageViews)} sayfa görüntüleme).`
          : 'Bu dönemde sayfa görüntüleme yok.'}
      </p>
    </div>
  )
}

const FUNNEL_LABEL: Record<AnalyticsOverview['funnel'][number]['step'], string> = {
  sessions: 'Oturum',
  productView: 'Ürün inceleyen',
  addToCart: 'Sepete ekleyen',
  order: 'Sipariş veren',
}

/** Dönüşüm hunisi: yatay daralan çubuklar; adımlar arası geçiş oranı çubukların arasında yazar. */
export function Funnel({ steps }: { steps: AnalyticsOverview['funnel'] }) {
  const first = steps[0]?.sessions ?? 0
  return (
    <ol className="an-funnel" aria-label="Dönüşüm hunisi (oturum sayısı)">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].sessions : 0
        const rate = i > 0 && prev > 0 ? (s.sessions / prev) * 100 : null
        return (
          <li key={s.step}>
            {i > 0 && (
              <p className="an-funnel__rate num">
                {rate === null
                  ? '—'
                  : `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(rate)}`}
                <span className="muted"> bir önceki adımdan devam etti</span>
              </p>
            )}
            <div className="an-funnel__row">
              <span className="an-funnel__label">{FUNNEL_LABEL[s.step]}</span>
              <span className="an-funnel__track">
                <span
                  className="an-funnel__bar"
                  style={{ width: `${first > 0 ? Math.max(1.5, (s.sessions / first) * 100) : 0}%` }}
                />
              </span>
              <span className="an-funnel__n num">{formatInt(s.sessions)}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
