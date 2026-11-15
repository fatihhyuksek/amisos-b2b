import type { DeliveryMethod } from '../api'

/** Teslimat şekilleri (K-36). */
export const DELIVERY_LABEL: Record<DeliveryMethod, string> = {
  carrier: 'Ambar ile',
  pickup: 'Bayi kendisi alır',
  truck: 'Tır yüklemesi',
}
