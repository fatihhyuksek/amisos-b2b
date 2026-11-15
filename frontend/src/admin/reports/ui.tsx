// Rapor ekranlarının ortak bileşenleri: fark göstergesi, sıralanabilir tablo/kart listesi, Excel düğmesi.
import { useId, useState, type ReactNode } from 'react'
import { ApiError, downloadReportExcel, type ReportChange, type ReportName } from '../../api'
import { Alert, Button } from '../../ui/components'
import { formatAbsPercent, formatSignedInt, formatSignedTRY } from '../../ui/format'
import { Icon } from '../../ui/Icon'
import { saveBlob } from '../download'

/** Artış/azalış: ikon + işaretli metin + renk (renge tek başına dayanmaz; ekran okuyucu için gizli metin). */
export function Delta({ change, kind }: { change: ReportChange<string | number>; kind: 'money' | 'count' }) {
  const n = Number(change.amount)
  const dir = n > 0 ? 'up' : n < 0 ? 'down' : 'flat'
  const amount = kind === 'money' ? formatSignedTRY(String(change.amount)) : formatSignedInt(change.amount)
  return (
    <span className={`ui-delta ui-delta--${dir}`}>
      {dir !== 'flat' && <Icon name={dir === 'up' ? 'arrowUp' : 'arrowDown'} />}
      <span className="visually-hidden">
        {dir === 'up' ? 'Artış: ' : dir === 'down' ? 'Azalış: ' : 'Değişim yok: '}
      </span>
      <span className="num">{amount}</span>
      <span className="num ui-delta__pct">
        {change.percent === null ? '(yüzde yok)' : `(${formatAbsPercent(change.percent)})`}
      </span>
    </span>
  )
}

export interface Col<T> {
  key: string
  label: string
  num?: boolean
  /** Sıralama değeri; verilmezse sütun sıralanamaz. */
  sort?: (row: T) => number | string
  cell: (row: T) => ReactNode
  /** Mobil kartta başlık olarak kullanılır (ilk sütun). */
  title?: boolean
}

export function ReportTable<T>({
  rows,
  cols,
  rowKey,
  defaultSort,
  caption,
  expanded,
  renderExpanded,
  serverSort,
}: {
  rows: T[]
  cols: Col<T>[]
  rowKey: (row: T) => string
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  caption: string
  expanded?: string | null
  renderExpanded?: (row: T) => ReactNode
  /** Sıralama sunucuda yapılırsa: geçerli sıralama ve değişim işleyicisi; satırlar olduğu gibi gösterilir. */
  serverSort?: {
    value: { key: string; dir: 'asc' | 'desc' }
    onChange: (v: { key: string; dir: 'asc' | 'desc' }) => void
  }
}) {
  const [localSort, setLocalSort] = useState(defaultSort ?? null)
  const sort = serverSort ? serverSort.value : localSort
  const setSort = (v: { key: string; dir: 'asc' | 'desc' }) =>
    serverSort ? serverSort.onChange(v) : setLocalSort(v)
  const selectId = useId()
  const col = cols.find((c) => c.key === sort?.key)
  const sorted =
    col?.sort && !serverSort
      ? [...rows].sort((a, b) => {
          const x = col.sort!(a)
          const y = col.sort!(b)
          const r =
            typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'tr')
          return sort!.dir === 'asc' ? r : -r
        })
      : rows
  const toggle = (key: string) =>
    setSort(sort?.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
  const sortable = cols.filter((c) => c.sort)
  const title = cols.find((c) => c.title) ?? cols[0]

  return (
    <>
      <div className="ui-sortbar">
        <label htmlFor={selectId} className="ui-label">
          Sırala
        </label>
        <select
          id={selectId}
          className="ui-select"
          value={sort ? `${sort.key}|${sort.dir}` : ''}
          onChange={(e) => {
            const [key, dir] = e.target.value.split('|')
            setSort({ key, dir: dir as 'asc' | 'desc' })
          }}
        >
          {!sort && <option value="">Varsayılan</option>}
          {sortable.flatMap((c) => [
            <option key={`${c.key}|desc`} value={`${c.key}|desc`}>
              {c.label} (çoktan aza)
            </option>,
            <option key={`${c.key}|asc`} value={`${c.key}|asc`}>
              {c.label} (azdan çoğa)
            </option>,
          ])}
        </select>
      </div>
      <div className="ui-table-wrap ui-table-wrap--cards">
        <table className="ui-table ui-table--dense">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={c.num ? 'num' : undefined}
                  aria-sort={
                    sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {c.sort ? (
                    <button type="button" className="ui-thsort" onClick={() => toggle(c.key)}>
                      {c.label}
                      {sort?.key === c.key && <Icon name={sort.dir === 'asc' ? 'arrowUp' : 'arrowDown'} />}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.flatMap((r) => {
              const k = rowKey(r)
              const out = [
                <tr key={k}>
                  {cols.map((c) => (
                    <td key={c.key} className={c.num ? 'num' : 'wrap'}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>,
              ]
              if (expanded === k && renderExpanded)
                out.push(
                  <tr key={`${k}-x`} className="ui-xrow">
                    <td colSpan={cols.length}>{renderExpanded(r)}</td>
                  </tr>,
                )
              return out
            })}
          </tbody>
        </table>
      </div>
      <ul className="ui-cards">
        {sorted.map((r) => {
          const k = rowKey(r)
          return (
            <li key={k} className="ui-card ui-rowcard">
              <strong>{title.cell(r)}</strong>
              <dl className="ui-ordercard__sums num">
                {cols
                  .filter((c) => c !== title)
                  .map((c) => (
                    <div key={c.key}>
                      <dt>{c.label}</dt>
                      <dd>{c.cell(r)}</dd>
                    </div>
                  ))}
              </dl>
              {expanded === k && renderExpanded && <div>{renderExpanded(r)}</div>}
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** Aynı parametrelerle Excel indirir. */
export function ExportButton({
  name,
  params,
  fallbackName,
}: {
  name: ReportName
  params: Record<string, string | number | undefined>
  fallbackName: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run() {
    setBusy(true)
    setError('')
    try {
      const { blob, filename } = await downloadReportExcel(name, params)
      saveBlob(blob, filename ?? fallbackName)
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'EXPORT_TOO_LARGE'
          ? 'Bu dönemde çok fazla sipariş var (en fazla 5000). Dönemi daraltıp tekrar deneyin.'
          : 'Excel dosyası oluşturulamadı. Lütfen tekrar deneyin.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="ui-export">
      <Button variant="secondary" icon="download" disabled={busy} onClick={run}>
        {busy ? 'Hazırlanıyor…' : "Excel'e aktar"}
      </Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  )
}
