// K-78: Bildirim merkezi verisi. Sayfa geçişlerinde (her sayfa kabuğu yeniden çizer) titremesin diye
// modül düzeyinde önbellek; 60 saniyede bir tazelenir. Uç yoksa/başarısızsa liste boş, hata durumu işaretlenir.
import { useCallback, useEffect, useState } from 'react'
import { fetchNotificationFeed, markFeedRead, type FeedItem } from '../api'

interface FeedState {
  items: FeedItem[]
  unread: number
  loaded: boolean
  error: boolean
}

let current: FeedState = { items: [], unread: 0, loaded: false, error: false }
const listeners = new Set<(s: FeedState) => void>()

function publish(next: FeedState) {
  current = next
  listeners.forEach((l) => l(next))
}

let inflight: Promise<void> | null = null

/** Aynı anda tek istek: kabuktaki rozet ve zil paneli aynı veriyi paylaşır. */
function refreshFeed(): Promise<void> {
  inflight ??= fetchNotificationFeed()
    .then((r) => publish({ items: r.items, unread: r.unread, loaded: true, error: false }))
    .catch(() => publish({ ...current, loaded: true, error: true }))
    .finally(() => {
      inflight = null
    })
  return inflight
}

let timer: ReturnType<typeof setInterval> | undefined

export function useNotificationFeed() {
  const [state, setState] = useState<FeedState>(current)
  useEffect(() => {
    listeners.add(setState)
    void refreshFeed()
    timer ??= setInterval(() => void refreshFeed(), 60_000)
    return () => {
      listeners.delete(setState)
      if (listeners.size === 0) {
        clearInterval(timer)
        timer = undefined
      }
    }
  }, [])

  const markAllRead = useCallback(async () => {
    const newest = current.items[0]?.createdAt ?? new Date().toISOString()
    publish({ ...current, unread: 0 })
    try {
      await markFeedRead(newest)
    } catch {
      void refreshFeed()
    }
  }, [])

  const reload = useCallback(() => void refreshFeed(), [])
  return { ...state, markAllRead, reload }
}
