// Admin sipariş özeti (yeni sipariş sayısı rozeti, ana sayfa kartları). Durum değişince tazelenir.
import { useEffect, useState } from 'react'
import { fetchAdminOrderSummary, type AdminOrderSummary } from '../api'

const EVENT = 'admin-orders-changed'

export function notifyOrdersChanged() {
  window.dispatchEvent(new Event(EVENT))
}

export function useOrderSummary(): AdminOrderSummary | null {
  const [summary, setSummary] = useState<AdminOrderSummary | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const on = () => setTick((t) => t + 1)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  useEffect(() => {
    const c = new AbortController()
    fetchAdminOrderSummary(c.signal)
      .then(setSummary)
      .catch(() => undefined)
    return () => c.abort()
  }, [tick])
  return summary
}
