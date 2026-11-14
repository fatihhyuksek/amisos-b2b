// Sipariş durumları ve etiket tonları (K-25).
import type { Tone } from './components'

export type OrderStatus = 'submitted' | 'negotiating' | 'approved' | 'shipped' | 'delivered' | 'cancelled'

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'Gönderildi', tone: 'info' },
  negotiating: { label: 'Görüşülüyor', tone: 'warning' },
  approved: { label: 'Onaylandı', tone: 'success' },
  shipped: { label: 'Sevk edildi', tone: 'info' },
  delivered: { label: 'Teslim edildi', tone: 'success' },
  cancelled: { label: 'İptal', tone: 'danger' },
}

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS[status].label
}
