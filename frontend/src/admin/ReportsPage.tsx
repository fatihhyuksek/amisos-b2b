// GR-RAP-001…003, K-46 – K-50: Admin raporları (/yonetim/raporlar?sekme=&bas=&bit=).
import { useState } from 'react'
import { fetchReport, type ReportOverview } from '../api'
import { replace, useRoute } from '../router'
import { Alert } from '../ui/components'
import { AdminLayout } from './AdminLayout'
import {
  DealersTab,
  GroupsTab,
  InactiveTab,
  OrdersTab,
  OutOfStockTab,
  ProductsTab,
  StatusTab,
} from './reports/DataTabs'
import { OverviewTab } from './reports/OverviewTab'
import { PRESETS, presetOf, presetRange, rangeText, todayIstanbul, type PresetId } from './reports/periods'
import { useLoad } from './useLoad'

const TABS = [
  { id: 'genel', label: 'Genel bakış' },
  { id: 'siparisler', label: 'Siparişler' },
  { id: 'bayiler', label: 'Bayiler' },
  { id: 'urunler', label: 'Ürünler' },
  { id: 'gruplar', label: 'Ürün grupları' },
  { id: 'durumlar', label: 'Durumlar' },
  { id: 'stokta-yok', label: 'Stokta yokken sipariş' },
  { id: 'pasif', label: 'Sipariş vermeyen bayiler' },
] as const
type TabId = (typeof TABS)[number]['id']

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function pathFor(tab: TabId, from: string, to: string): string {
  const qs = new URLSearchParams()
  if (tab !== 'genel') qs.set('sekme', tab)
  qs.set('bas', from)
  qs.set('bit', to)
  return `/yonetim/raporlar?${qs.toString()}`
}

/** Bitiş, başlangıçtan en fazla 3 yıl sonra olabilir (sözleşme). */
function tooLong(from: string, to: string): boolean {
  const [y, m, d] = from.split('-').map(Number)
  return to > new Date(Date.UTC(y + 3, m - 1, d)).toISOString().slice(0, 10)
}

export function ReportsPage() {
  const { query } = useRoute()
  const rawTab = query.get('sekme')
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : 'genel'
  const def = presetRange('this-month')
  const qFrom = query.get('bas') ?? ''
  const qTo = query.get('bit') ?? ''
  const valid = DATE_RE.test(qFrom) && DATE_RE.test(qTo) && qFrom <= qTo && !tooLong(qFrom, qTo)
  const from = valid ? qFrom : def.from
  const to = valid ? qTo : def.to
  const preset = presetOf(from, to)
  const [custom, setCustom] = useState(preset === 'custom')
  const [draft, setDraft] = useState({ from, to })
  const [rangeError, setRangeError] = useState('')

  const overview = useLoad<ReportOverview>((s) => fetchReport('overview', { from, to }, s), `${from}|${to}`)
  const ov = overview.state.status === 'ready' ? overview.state.data : null

  function pickPreset(id: PresetId) {
    const r = presetRange(id)
    setCustom(false)
    setRangeError('')
    replace(pathFor(tab, r.from, r.to))
  }

  function applyCustom(next: { from: string; to: string }) {
    setDraft(next)
    if (!DATE_RE.test(next.from) || !DATE_RE.test(next.to)) return
    if (next.from > next.to) return setRangeError('Başlangıç, bitişten sonra olamaz.')
    if (tooLong(next.from, next.to)) return setRangeError('Dönem en fazla 3 yıl olabilir.')
    setRangeError('')
    replace(pathFor(tab, next.from, next.to))
  }

  const showCustom = custom || preset === 'custom'
  const today = todayIstanbul()

  return (
    <AdminLayout title="Raporlar">
      {tab !== 'pasif' && (
        <section className="ui-card ui-card__body ui-stack" aria-label="Dönem">
          <div className="ui-chips ui-chips--wrap" role="group" aria-label="Dönem seçimi">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="ui-chip"
                aria-pressed={!showCustom && preset === p.id}
                onClick={() => pickPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className="ui-chip"
              aria-pressed={showCustom}
              onClick={() => {
                setCustom(true)
                setDraft({ from, to })
              }}
            >
              Özel
            </button>
          </div>
          {showCustom && (
            <div className="ui-orderfilters">
              <label className="ui-orderfilters__date">
                <span className="ui-label">Başlangıç</span>
                <input
                  className="ui-input"
                  type="date"
                  value={draft.from}
                  max={today}
                  onChange={(e) => applyCustom({ from: e.target.value, to: draft.to })}
                />
              </label>
              <label className="ui-orderfilters__date">
                <span className="ui-label">Bitiş</span>
                <input
                  className="ui-input"
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  max={today}
                  onChange={(e) => applyCustom({ from: draft.from, to: e.target.value })}
                />
              </label>
            </div>
          )}
          {rangeError && <Alert tone="danger">{rangeError}</Alert>}
          <p className="ui-periodtext" aria-live="polite">
            <strong>Seçilen dönem: {rangeText({ from, to })}</strong>
            {ov && (
              <>
                <span> · Önceki dönem: {rangeText(ov.previous)}</span>
                <span> · Geçen yıl: {rangeText(ov.lastYear)}</span>
              </>
            )}
          </p>
        </section>
      )}

      <div className="ui-chips ui-chips--wrap" role="tablist" aria-label="Rapor türü">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="rapor-panel"
            className="ui-chip"
            onClick={() => replace(pathFor(t.id, from, to))}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="rapor-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'genel' && <OverviewTab from={from} to={to} overview={ov} />}
        {tab === 'siparisler' && <OrdersTab from={from} to={to} />}
        {tab === 'bayiler' && <DealersTab from={from} to={to} />}
        {tab === 'urunler' && <ProductsTab from={from} to={to} />}
        {tab === 'gruplar' && <GroupsTab from={from} to={to} />}
        {tab === 'durumlar' && <StatusTab from={from} to={to} />}
        {tab === 'stokta-yok' && <OutOfStockTab from={from} to={to} />}
        {tab === 'pasif' && <InactiveTab />}
      </div>
    </AdminLayout>
  )
}
