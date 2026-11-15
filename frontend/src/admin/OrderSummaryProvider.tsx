import { useEffect, useState, type ReactNode } from 'react'
import { fetchAdminOrderSummary, type AdminOrderSummary } from '../api'
import { useAuth } from '../auth/useAuth'
import { ORDERS_CHANGED_EVENT, OrderSummaryContext } from './orderSummary'

/** Yalnızca Admin oturumunda özeti çeker; sayfa geçişlerinde tekrar istek atmaz. */
export function OrderSummaryProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const adminId = state.status === 'authenticated' && state.user.type === 'admin' ? state.user.id : null
  const [data, setData] = useState<{ owner: string; summary: AdminOrderSummary } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const on = () => setTick((t) => t + 1)
    window.addEventListener(ORDERS_CHANGED_EVENT, on)
    return () => window.removeEventListener(ORDERS_CHANGED_EVENT, on)
  }, [])

  useEffect(() => {
    if (!adminId) return
    const c = new AbortController()
    fetchAdminOrderSummary(c.signal)
      .then((summary) => setData({ owner: adminId, summary }))
      .catch(() => undefined)
    return () => c.abort()
  }, [adminId, tick])

  const value = data && data.owner === adminId ? data.summary : null
  return <OrderSummaryContext.Provider value={value}>{children}</OrderSummaryContext.Provider>
}
