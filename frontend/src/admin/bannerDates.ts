// Banner tarihleri: panel Europe/Istanbul gününü `+03:00` ofsetli ISO olarak gönderir (K-65).
// Bitiş tarihi "dahil" sayılır: gönderilen değer bitiş gününü izleyen günün 00:00'ıdır
// (backend `startsAt <= şimdi < endsAt` uygular). Açık soru olarak raporlandı.
import type { AdminBanner } from '../api'

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }) // YYYY-MM-DD
const SHOW = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium' })

/** ISO → İstanbul günü "YYYY-MM-DD". */
export function istanbulDay(iso: string): string {
  return DAY.format(new Date(iso))
}

export function startToIso(day: string): string {
  return `${day}T00:00:00+03:00`
}

export function endToIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return `${next.toISOString().slice(0, 10)}T00:00:00+03:00`
}

/** Kayıtlı bitiş anından, formda gösterilecek (dahil) bitiş günü. */
export function endToDay(iso: string): string {
  return istanbulDay(new Date(new Date(iso).getTime() - 1).toISOString())
}

export function showDay(iso: string): string {
  return SHOW.format(new Date(iso))
}

export type BannerStatus = 'active' | 'inactive' | 'scheduled' | 'expired'

export function bannerStatus(
  b: Pick<AdminBanner, 'isActive' | 'startsAt' | 'endsAt'>,
  now = Date.now(),
): BannerStatus {
  if (!b.isActive) return 'inactive'
  if (b.startsAt && new Date(b.startsAt).getTime() > now) return 'scheduled'
  if (b.endsAt && new Date(b.endsAt).getTime() <= now) return 'expired'
  return 'active'
}

export const BANNER_STATUS: Record<
  BannerStatus,
  { label: string; tone: 'success' | 'neutral' | 'info' | 'warning' }
> = {
  active: { label: 'Aktif', tone: 'success' },
  inactive: { label: 'Pasif', tone: 'neutral' },
  scheduled: { label: 'Planlandı', tone: 'info' },
  expired: { label: 'Süresi doldu', tone: 'warning' },
}

/** Tarih aralığı metni; sınır yoksa "sınırsız". */
export function rangeText(b: Pick<AdminBanner, 'startsAt' | 'endsAt'>): string {
  if (!b.startsAt && !b.endsAt) return 'Süresiz'
  const from = b.startsAt ? showDay(b.startsAt) : 'Başlangıç yok'
  const to = b.endsAt ? showDay(new Date(new Date(b.endsAt).getTime() - 1).toISOString()) : 'Bitiş yok'
  return `${from} – ${to}`
}
