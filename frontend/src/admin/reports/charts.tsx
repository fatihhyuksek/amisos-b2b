// Hafif, bağımlılıksız SVG/CSS grafikler. Renkler tasarım belirteçlerinden; her grafiğin metin/tablo karşılığı var.
import { useEffect, useRef, useState } from 'react'
import type { ReportTrendPoint } from '../../api'
import { formatCompactTRY, formatInt, formatTRY } from '../../ui/format'
import { monthLong, monthShort } from './periods'

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

/** Eksen için "yuvarlak" üst sınır ve eşit aralıklı çizgiler (yalnızca ölçek; tutar hesabı değil). */
function niceScale(max: number, ticks = 4): { top: number; values: number[] } {
  if (max <= 0) return { top: 1, values: [0, 1] }
  const raw = max / ticks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const values = Array.from({ length: ticks + 1 }, (_, i) => i * step).filter((v) => v <= step * ticks)
  return { top: step * ticks, values }
}

const H = 260
const M = { top: 12, right: 12, bottom: 30, left: 60 }

/** Aylık net ciro sütunları + geçen yıl çizgisi. Altında "Tabloyu göster" ile aynı veri tablo olarak açılır. */
export function TrendChart({ data }: { data: ReportTrendPoint[] }) {
  const { ref, width } = useWidth()
  const [table, setTable] = useState(false)
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

  return (
    <div className="ui-chart">
      <div className="ui-chart__legend" aria-hidden="true">
        <span>
          <i className="ui-chart__sw ui-chart__sw--bar" /> Son {data.length} ay net ciro (KDV hariç)
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
            role="img"
            aria-label={`Son ${data.length} ayın aylık net ciro grafiği (sütun) ve geçen yılın aynı ayları (çizgi). Aynı veri için Tabloyu göster düğmesini kullanın.`}
          >
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
  /** Çubuk uzunluğu (0–100); sunucunun verdiği pay yüzdesi. */
  percent: number
  /** Çubuğun yanında gösterilen metin (tutar ve pay). */
  text: string
}

/** Yatay çubuk listesi: her satır etiket + çubuk + metin değeri (metin zaten erişilebilir karşılıktır). */
export function HBarList({ rows, label }: { rows: BarRow[]; label: string }) {
  return (
    <ul className="ui-hbars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className="ui-hbars__row">
          <span className="ui-hbars__label">{r.label}</span>
          <span className="ui-hbars__track" aria-hidden="true">
            <span className="ui-hbars__fill" style={{ width: `${Math.min(100, Math.max(0, r.percent))}%` }} />
          </span>
          <span className="ui-hbars__text num">{r.text}</span>
        </li>
      ))}
    </ul>
  )
}
