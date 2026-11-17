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

/** Takvimde gerçekten var olan gün mü ("2026-02-30" değil). */
function isRealDay(day: string): boolean {
  if (!DATE_RE.test(day)) return false
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Başlangıçtan 3 yıl sonrası (29 Şubat → 28 Şubat); bitiş bu güne eşit veya sonrası ise dönem geçersizdir (backend ile aynı). */
function tooLong(from: string, to: string): boolean {
  const [y, m, d] = from.split('-').map(Number)
  const limit = new Date(Date.UTC(y + 3, m - 1, m === 2 && d === 29 ? 28 : d)).toISOString().slice(0, 10)
  return to >= limit
}

export function ReportsPage() {
  const { query } = useRoute()
  const rawTab = query.get('sekme')
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : 'genel'
  const def = presetRange('this-month')
  const qFrom = query.get('bas') ?? ''
  const qTo = query.get('bit') ?? ''
  const hasParams = query.has('bas') || query.has('bit')
  const valid = isRealDay(qFrom) && isRealDay(qTo) && qFrom <= qTo && !tooLong(qFrom, qTo)
  const invalidParams = hasParams && !valid
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
    if (!isRealDay(next.from) || !isRealDay(next.to)) return
    if (next.from > next.to) return setRangeError('Başlangıç, bitişten sonra olamaz.')
    if (tooLong(next.from, next.to)) return setRangeError('Dönem en fazla 3 yıl olabilir.')
    setRangeError('')
    replace(pathFor(tab, next.from, next.to))
  }

  const showCustom = custom || preset === 'custom'
  const today = todayIstanbul()

  return (
    <AdminLayout title="Raporlar">
      <div
        className="adm-tabs"
        role="tablist"
        aria-label="Rapor türü"
        onKeyDown={(e) => {
          const i = TABS.findIndex((t) => t.id === tab)
          const next =
            e.key === 'ArrowRight'
              ? (i + 1) % TABS.length
              : e.key === 'ArrowLeft'
                ? (i - 1 + TABS.length) % TABS.length
                : e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? TABS.length - 1
                    : -1
          if (next < 0) return
          e.preventDefault()
          replace(pathFor(TABS[next].id, from, to))
          requestAnimationFrame(() => document.getElementById(`tab-${TABS[next].id}`)?.focus())
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            aria-selected={tab === t.id}
            aria-controls="rapor-panel"
            className="adm-tabs__tab"
            onClick={() => replace(pathFor(t.id, from, to))}
          >
            {t.label}
          </button>
        ))}
      </div>

      {invalidParams && tab !== 'pasif' && (
        <Alert tone="warning">
          Adresteki dönem geçersiz (tarih bulunamadı, sıra hatalı veya 3 yıldan uzun). Bu ay gösteriliyor.
        </Alert>
      )}
      {tab !== 'pasif' && (
        <section className="ui-card ui-card__body ui-stack" aria-label="Dönem">
          <div className="ui-chips" role="group" aria-label="Dönem seçimi">
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

      <div id="rapor-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'genel' && (
          <OverviewTab
            from={from}
            to={to}
            overview={ov}
            overviewFailed={overview.state.status === 'error'}
            onRetryOverview={overview.reload}
          />
        )}
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
