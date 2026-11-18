// K-85: Analitik ekranlarının ortak yardımcıları (dönem okuma, olay etiketleri).
import type { LiveEventType } from '../../api'
import type { IconName } from '../../ui/Icon'
import { useRoute } from '../../router'
import { presetRange, todayIstanbul } from '../reports/periods'

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const MAX_DAYS = 400

export function isRealDay(day: string): boolean {
  if (!DATE_RE.test(day)) return false
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
}

/** Adres satırındaki ?bas=&bit= dönemi; yoksa ya da geçersizse son 30 gün. */
export function usePeriod(): { from: string; to: string; invalid: boolean } {
  const { query } = useRoute()
  const def = presetRange('last-30')
  const qFrom = query.get('bas') ?? ''
  const qTo = query.get('bit') ?? ''
  const given = query.has('bas') || query.has('bit')
  const valid =
    isRealDay(qFrom) &&
    isRealDay(qTo) &&
    qFrom <= qTo &&
    dayCount(qFrom, qTo) <= MAX_DAYS &&
    qTo <= todayIstanbul()
  return valid ? { from: qFrom, to: qTo, invalid: false } : { from: def.from, to: def.to, invalid: given }
}

export const EVENT_ICON: Record<LiveEventType, IconName> = {
  page_view: 'file',
  product_view: 'eye',
  search: 'search',
  add_to_cart: 'bagPlus',
  login: 'user',
  order_submitted: 'orders',
}

export const EVENT_LABEL: Record<LiveEventType, string> = {
  page_view: 'Sayfa görüntüledi',
  product_view: 'Ürünü inceledi',
  search: 'Arama yaptı',
  add_to_cart: 'Sepete ekledi',
  login: 'Giriş yaptı',
  order_submitted: 'Sipariş gönderdi',
}

/** Sayfa yolunu okunur etikete çevirir. */
export function pathLabel(path: string | null): string {
  if (!path || path === '/') return 'Ana sayfa'
  if (path === '/katalog') return 'Katalog'
  if (path.startsWith('/katalog/')) return `Katalog · ${decodeURIComponent(path.slice(9))}`
  if (path.startsWith('/urun/')) return `Ürün · ${decodeURIComponent(path.slice(6))}`
  return path
}

export const DEVICE_LABEL: Record<string, string> = {
  mobile: 'Telefon',
  tablet: 'Tablet',
  desktop: 'Bilgisayar',
}
