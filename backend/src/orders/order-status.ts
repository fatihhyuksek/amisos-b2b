// Ön sipariş durum geçişleri (K-25, GR-SIP-006).
// Durumlar sırayla ilerler; İptal, Teslim edildi dışındaki her adımdan seçilebilir.
import type { orderStatus } from '../database/schema.js';

export type OrderStatus = (typeof orderStatus.enumValues)[number];

const FORWARD: Record<OrderStatus, OrderStatus | null> = {
  submitted: 'negotiating',
  negotiating: 'approved',
  approved: 'shipped',
  shipped: 'delivered',
  delivered: null,
  cancelled: null,
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  submitted: 'Gönderildi',
  negotiating: 'Görüşülüyor',
  approved: 'Onaylandı',
  shipped: 'Sevk edildi',
  delivered: 'Teslim edildi',
  cancelled: 'İptal',
};

export function allowedNextStatuses(from: OrderStatus): OrderStatus[] {
  if (from === 'delivered' || from === 'cancelled') return [];
  const next = FORWARD[from];
  return next ? [next, 'cancelled'] : ['cancelled'];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return allowedNextStatuses(from).includes(to);
}
