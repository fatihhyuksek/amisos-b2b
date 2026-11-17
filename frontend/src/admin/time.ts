import { formatDate, formatDateTime } from '../ui/format'

/** "az önce", "5 dk önce", "3 sa önce", "dün"; daha eskisi tarih. Gösterim amaçlıdır. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'az önce'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} dk önce`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} sa önce`
  const d = Math.floor(h / 24)
  if (d === 1) return 'dün'
  if (d < 7) return `${d} gün önce`
  return formatDate(iso)
}

export { formatDateTime }
