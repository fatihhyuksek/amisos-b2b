// Rapor dönemleri: Europe/Istanbul günü olarak "YYYY-MM-DD" metinleri (ikisi de dahil).
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' })

export function todayIstanbul(): string {
  return DAY.format(new Date())
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))

export type PresetId = 'this-month' | 'last-month' | 'last-30' | 'this-quarter' | 'this-year' | 'last-year'

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'this-month', label: 'Bu ay' },
  { id: 'last-month', label: 'Geçen ay' },
  { id: 'last-30', label: 'Son 30 gün' },
  { id: 'this-quarter', label: 'Bu çeyrek' },
  { id: 'this-year', label: 'Bu yıl' },
  { id: 'last-year', label: 'Geçen yıl' },
]

/** Hazır dönemin başlangıç/bitişi. "Bu çeyrek": içinde bulunulan takvim çeyreğinin başından bugüne. */
export function presetRange(id: PresetId, today = todayIstanbul()): { from: string; to: string } {
  const [y, m, d] = today.split('-').map(Number)
  switch (id) {
    case 'this-month':
      return { from: iso(utc(y, m - 1, 1)), to: today }
    case 'last-month':
      return { from: iso(utc(y, m - 2, 1)), to: iso(utc(y, m - 1, 0)) }
    case 'last-30':
      return { from: iso(utc(y, m - 1, d - 29)), to: today }
    case 'this-quarter':
      return { from: iso(utc(y, Math.floor((m - 1) / 3) * 3, 1)), to: today }
    case 'this-year':
      return { from: iso(utc(y, 0, 1)), to: today }
    case 'last-year':
      return { from: iso(utc(y - 1, 0, 1)), to: iso(utc(y - 1, 11, 31)) }
  }
}

export function presetOf(from: string, to: string): PresetId | 'custom' {
  for (const p of PRESETS) {
    const r = presetRange(p.id)
    if (r.from === from && r.to === to) return p.id
  }
  return 'custom'
}

const SHOW = new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', dateStyle: 'medium' })

/** "2026-11-01" → "1 Kas 2026" */
export function showDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return SHOW.format(utc(y, m - 1, d))
}

export function rangeText(r: { from: string; to: string }): string {
  return r.from === r.to ? showDay(r.from) : `${showDay(r.from)} – ${showDay(r.to)}`
}

const MONTH = new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', month: 'short' })
const MONTH_YEAR = new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', month: 'long', year: 'numeric' })

/** "2026-11" → kısa ay adı ("Kas") ve uzun ("Kasım 2026"). */
export function monthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return MONTH.format(utc(y, m - 1, 1))
}
export function monthLong(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return MONTH_YEAR.format(utc(y, m - 1, 1))
}
