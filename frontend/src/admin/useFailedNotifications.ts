// Başarısız e-posta sayısı (GR-BLD-001): Admin menü rozeti ve ana sayfa uyarısı için.
import { useEffect, useState } from 'react'
import { fetchNotifications } from '../api'

const EVENT = 'notifications-changed'

/** Bildirim listesi değişince (yeniden deneme) sayaçları tazelemek için. */
export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(EVENT))
}

export function useFailedNotificationCount(): number {
  const [count, setCount] = useState(0)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const on = () => setTick((t) => t + 1)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  useEffect(() => {
    const c = new AbortController()
    fetchNotifications({ status: 'failed', page: 1, pageSize: 1 }, c.signal)
      .then((r) => setCount(r.total))
      .catch(() => undefined)
    return () => c.abort()
  }, [tick])
  return count
}
