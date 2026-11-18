// Hafif, bağımlılıksız SVG/CSS grafikler. Renkler tasarım belirteçlerinden; her grafiğin metin/tablo karşılığı var.
import { useState } from 'react'
import type { ReportTrendPoint } from '../../api'
import { Link } from '../../Link'
import { formatCompactTRY, formatInt, formatTRY } from '../../ui/format'
import { niceScale, useWidth } from './chartUtils'
import { monthLong, monthShort } from './periods'

const H = 260
const M = { top: 12, right: 12, bottom: 30, left: 66 }

/** Aylık net ciro sütunları + geçen yıl çizgisi. Altında "Tabloyu göster" ile aynı veri tablo olarak açılır. */
export function TrendChart({ data }: { data: ReportTrendPoint[] }) {
  const { ref, width } = useWidth()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const nets = data.map((d) => Number(d.netTotal))
  const lasts = data.map((d) => Number(d.lastYearNetTotal))
  const { top, values } = niceScale(Math.max(0, ...nets, ...lasts))
  const innerW = Math.max(0, width - M.left - M.right)
  const innerH = H - M.top - M.bottom
  const band = data.length ? innerW / data.length : 0
  const y = (v: number) => M.top + innerH - (v / top) * innerH
  const cx = (i: number) => M.left + band * i + band / 2
  const skip = band < 38 ? 2 : 1
  const line = lasts.map((v, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${y(v)}`).join(' ')

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - r.left - M.left) / (band || 1))
    setHover(i >= 0 && i < data.length ? i : null)
  }
  const hd = hover !== null ? data[hover] : null

  return (
    <div className="ui-chart">
      <div className="ui-chart__legend" aria-hidden="true">
        <span>
          <i className="ui-chart__sw ui-chart__sw--bar" /> Bu yıl · aylık net ciro (KDV hariç)
        </span>
        <span>
          <i className="ui-chart__sw ui-chart__sw--line" /> Geçen yılın aynı ayı
        </span>
      </div>
      <div ref={ref} className="ui-chart__box">
        {width > 0 && (
          <svg
            width={width}
            height={H}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={`Son ${data.length} ayın aylık net ciro grafiği (sütun) ve geçen yılın aynı ayları (çizgi). Aynı veri için Tabloyu göster düğmesini kullanın.`}
          >
            {hover !== null && (
              <rect
                x={M.left + band * hover}
                y={M.top}
                width={band}
                height={innerH}
                className="ui-chart__hl"
              />
            )}
            {values.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className="ui-chart__grid" />
                <text
                  x={M.left - 8}
                  y={y(v)}
                  className="ui-chart__tick"
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {formatCompactTRY(v)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const bw = Math.min(40, band * 0.6)
              const bh = innerH - (y(nets[i]) - M.top)
              return (
                <g key={d.month}>
                  <rect
                    x={cx(i) - bw / 2}
                    y={y(nets[i])}
                    width={bw}
                    height={Math.max(0, bh)}
                    rx={3}
                    className="ui-chart__bar"
                  >
                    <title>{`${monthLong(d.month)}: ${formatTRY(d.netTotal)}`}</title>
                  </rect>
                  {(data.length - 1 - i) % skip === 0 && (
                    <text x={cx(i)} y={H - 10} className="ui-chart__tick" textAnchor="middle">
                      {monthShort(d.month)}
                    </text>
                  )}
                </g>
              )
            })}
            <path d={line} className="ui-chart__line" fill="none" />
            {lasts.map((v, i) => (
              <circle key={i} cx={cx(i)} cy={y(v)} r={3.5} className="ui-chart__dot" />
            ))}
          </svg>
        )}
        {hd && hover !== null && (
          <div
            className="ui-chart__tip"
            style={{ left: Math.min(Math.max(cx(hover) - 80, 0), Math.max(0, width - 176)), top: 0 }}
          >
            <strong>{monthLong(hd.month)}</strong>
            <span className="ui-chart__tiprow">
              <i className="ui-chart__sw ui-chart__sw--bar" /> Net ciro
              <b className="num">{formatTRY(hd.netTotal)}</b>
            </span>
            <span className="ui-chart__tiprow">
              <i className="ui-chart__sw ui-chart__sw--line" /> Geçen yıl
              <b className="num">{formatTRY(hd.lastYearNetTotal)}</b>
            </span>
            <span className="ui-chart__tiprow ui-chart__tiprow--muted">
              {formatInt(hd.orderCount)} sipariş
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        className="ui-linklike ui-linklike--touch"
        aria-expanded={table}
        onClick={() => setTable((t) => !t)}
      >
        {table ? 'Tabloyu gizle' : 'Tabloyu göster'}
      </button>
      {table && (
        <div className="ui-table-wrap">
          <table className="ui-table">
            <caption className="visually-hidden">Aylık net ciro (KDV hariç)</caption>
            <thead>
              <tr>
                <th scope="col">Ay</th>
                <th scope="col" className="num">
                  Sipariş
                </th>
                <th scope="col" className="num">
                  Net ciro
                </th>
                <th scope="col" className="num">
                  Geçen yıl net ciro
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month}>
                  <th scope="row">{monthLong(d.month)}</th>
                  <td className="num">{formatInt(d.orderCount)}</td>
                  <td className="num">{formatTRY(d.netTotal)}</td>
                  <td className="num">{formatTRY(d.lastYearNetTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export interface BarRow {
  key: string
  label: string
  /** Çubuk uzunluğu (0–100); sunucunun verdiği pay yüzdesi ya da en büyüğe oran. */
  percent: number
  /** Çubuğun yanında gösterilen metin (tutar ve pay). */
  text: string
  /** Etiket bağlantı olsun (ör. ürün/bayi sayfası). */
  to?: string
  /** Küçük ikincil metin (etiketin altında). */
  sub?: string
}

/**
 * Yatay çubuk listesi: her satır etiket + çubuk + metin değeri (metin zaten erişilebilir karşılıktır).
 * `ranked`: satırlar sıra numarasıyla (1., 2., …) gösterilir.
 */
export function HBarList({ rows, label, ranked }: { rows: BarRow[]; label: string; ranked?: boolean }) {
  const List = ranked ? 'ol' : 'ul'
  return (
    <List className={`ui-hbars${ranked ? ' ui-hbars--ranked' : ''}`} aria-label={label}>
      {rows.map((r, i) => (
        <li key={r.key} className="ui-hbars__row">
          {ranked && (
            <span className="ui-hbars__rank num" aria-hidden="true">
              {i + 1}
            </span>
          )}
          <span className="ui-hbars__label">
            {r.to ? <Link to={r.to}>{r.label}</Link> : r.label}
            {r.sub && <span className="ui-hbars__sub num">{r.sub}</span>}
          </span>
          <span className="ui-hbars__track" aria-hidden="true">
            <span className="ui-hbars__fill" style={{ width: `${Math.min(100, Math.max(0, r.percent))}%` }} />
          </span>
          <span className="ui-hbars__text num">{r.text}</span>
        </li>
      ))}
    </List>
  )
}

const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })
const dayLongFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })
const dayOf = (iso: string) => new Date(`${iso}T12:00:00`)

const AH = 210
const AM = { top: 10, right: 10, bottom: 26, left: 58 }

/**
 * K-78: 30 günlük satış alan grafiği (net, KDV hariç). Değerler sunucudan gelir; burada yalnızca ölçeklenir.
 * Fare/dokunma ile gün ayrıntısı; aynı veri "Tabloyu göster" ile tablo olarak açılır.
 */
export function SalesAreaChart({ data }: { data: { date: string; orderCount: number; netTotal: string }[] }) {
  const { ref, width } = useWidth()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const nets = data.map((d) => Number(d.netTotal))
  const { top, values } = niceScale(Math.max(0, ...nets), 3)
  const innerW = Math.max(0, width - AM.left - AM.right)
  const innerH = AH - AM.top - AM.bottom
  const n = data.length
  const x = (i: number) => AM.left + (n > 1 ? (innerW * i) / (n - 1) : innerW / 2)
  const y = (v: number) => AM.top + innerH - (v / top) * innerH
  const line = nets.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = n ? `${line} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : ''
  const step = width < 420 ? 10 : width < 640 ? 7 : 5

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const rel = (e.clientX - r.left - AM.left) / (innerW || 1)
    setHover(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))))
  }

  const h = hover !== null ? data[hover] : null
  return (
    <div className="adm-chart">
      <div ref={ref}>
        {width > 0 && n > 0 && (
          <svg
            width={width}
            height={AH}
            role="img"
            aria-label={`Son ${n} günün günlük net satış grafiği (KDV hariç). Aynı veri için Tabloyu göster düğmesini kullanın.`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {values.map((v) => (
              <g key={v}>
                <line x1={AM.left} x2={width - AM.right} y1={y(v)} y2={y(v)} className="adm-chart__grid" />
                <text
                  x={AM.left - 8}
                  y={y(v)}
                  className="adm-chart__tick"
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {formatCompactTRY(v)}
                </text>
              </g>
            ))}
            <path d={area} className="adm-chart__area" />
            <path d={line} className="adm-chart__line" />
            {data.map((d, i) =>
              (n - 1 - i) % step === 0 ? (
                <text key={d.date} x={x(i)} y={AH - 8} className="adm-chart__tick" textAnchor="middle">
                  {dayFmt.format(dayOf(d.date))}
                </text>
              ) : null,
            )}
            {hover !== null && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={AM.top}
                  y2={AM.top + innerH}
                  className="adm-chart__cross"
                />
                <circle cx={x(hover)} cy={y(nets[hover])} r={4} className="adm-chart__dot" />
              </g>
            )}
          </svg>
        )}
        {h && hover !== null && (
          <div
            className="adm-chart__tip"
            style={{
              left: Math.min(Math.max(x(hover) - 60, 0), Math.max(0, width - 150)),
              top: 0,
            }}
          >
            <strong>{dayLongFmt.format(dayOf(h.date))}</strong>
            <br />
            <span className="num">{formatTRY(h.netTotal)}</span> · {formatInt(h.orderCount)} sipariş
          </div>
        )}
      </div>
      <button type="button" className="adm-textbtn" aria-expanded={table} onClick={() => setTable((t) => !t)}>
        {table ? 'Tabloyu gizle' : 'Tabloyu göster'}
      </button>
      {table && (
        <div
          className="ui-table-wrap ui-table-wrap--scroll"
          style={{ maxHeight: '16rem', overflowY: 'auto' }}
        >
          <table className="ui-table">
            <caption className="visually-hidden">Günlük net satış (KDV hariç)</caption>
            <thead>
              <tr>
                <th scope="col">Gün</th>
                <th scope="col" className="num">
                  Sipariş
                </th>
                <th scope="col" className="num">
                  Net satış
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.date}>
                  <th scope="row">{dayLongFmt.format(dayOf(d.date))}</th>
                  <td className="num">{formatInt(d.orderCount)}</td>
                  <td className="num">{formatTRY(d.netTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
