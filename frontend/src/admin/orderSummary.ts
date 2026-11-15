// Admin sipariş özeti: tek kaynak (OrderSummaryProvider). Menü rozeti ve ana sayfa kartları aynı veriyi kullanır.
import { createContext, useContext } from 'react'
import type { AdminOrderSummary } from '../api'

export const OrderSummaryContext = createContext<AdminOrderSummary | null>(null)

export const ORDERS_CHANGED_EVENT = 'admin-orders-changed'

/** Durum / BizimHesap işareti değişince özeti tazelemek için. */
export function notifyOrdersChanged() {
  window.dispatchEvent(new Event(ORDERS_CHANGED_EVENT))
}

export function useOrderSummary(): AdminOrderSummary | null {
  return useContext(OrderSummaryContext)
}
