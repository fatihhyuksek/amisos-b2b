// K-85: Analitik ekranlarının ortak parçaları: dönem seçici (rapor ekranıyla aynı hazır aralıklar) ve olay gösterimi.
import { useState } from 'react'
import type { LiveEventType } from '../../api'
import { replace } from '../../router'
import { Alert } from '../../ui/components'
import { Icon } from '../../ui/Icon'
import { PRESETS, presetOf, presetRange, rangeText, todayIstanbul, type PresetId } from '../reports/periods'
import { dayCount, EVENT_ICON, isRealDay, MAX_DAYS } from './lib'

/** Hazır aralık düğmeleri + özel tarih; seçim adrese yazılır (geri tuşu ve paylaşım çalışır). */
export function PeriodBar({
  path,
  from,
  to,
  invalid,
  previous,
}: {
  path: string
  from: string
  to: string
  invalid: boolean
  previous?: { from: string; to: string }
}) {
  const preset = presetOf(from, to)
  const [custom, setCustom] = useState(preset === 'custom')
  const [draft, setDraft] = useState({ from, to })
  const [error, setError] = useState('')
  const today = todayIstanbul()
  const go = (r: { from: string; to: string }) => replace(`${path}?bas=${r.from}&bit=${r.to}`)
  const showCustom = custom || preset === 'custom'

  function pick(id: PresetId) {
    setCustom(false)
    setError('')
    go(presetRange(id))
  }

  function apply(next: { from: string; to: string }) {
    setDraft(next)
    if (!isRealDay(next.from) || !isRealDay(next.to)) return
    if (next.from > next.to) return setError('Başlangıç, bitişten sonra olamaz.')
    if (dayCount(next.from, next.to) > MAX_DAYS) return setError(`Dönem en fazla ${MAX_DAYS} gün olabilir.`)
    setError('')
    go(next)
  }

  return (
    <section className="adm-card an-period" aria-label="Dönem">
      <div className="adm-card__body an-period__body">
        {invalid && (
          <Alert tone="warning">
            Adresteki dönem geçersiz (tarih bulunamadı, sıra hatalı, bugünden sonra ya da {MAX_DAYS} günden
            uzun). Son 30 gün gösteriliyor.
          </Alert>
        )}
        <div className="ui-chips" role="group" aria-label="Dönem seçimi">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ui-chip"
              aria-pressed={!showCustom && preset === p.id}
              onClick={() => pick(p.id)}
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
          <div className="adm-filters__dates an-period__dates">
            <label>
              <span className="ui-label">Başlangıç</span>
              <input
                className="ui-input"
                type="date"
                value={draft.from}
                max={today}
                onChange={(e) => apply({ from: e.target.value, to: draft.to })}
              />
            </label>
            <label>
              <span className="ui-label">Bitiş</span>
              <input
                className="ui-input"
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                max={today}
                onChange={(e) => apply({ from: draft.from, to: e.target.value })}
              />
            </label>
          </div>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <p className="an-period__text" aria-live="polite">
          <strong>Seçilen dönem: {rangeText({ from, to })}</strong>
          {previous && <span className="muted"> · Karşılaştırılan önceki dönem: {rangeText(previous)}</span>}
        </p>
      </div>
    </section>
  )
}

export function EventIcon({ type }: { type: LiveEventType }) {
  return (
    <span className={`an-evicon an-evicon--${type}`} aria-hidden="true">
      <Icon name={EVENT_ICON[type]} />
    </span>
  )
}
