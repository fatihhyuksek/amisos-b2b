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

async function refreshFeed(signal?: AbortSignal) {
  try {
    const r = await fetchNotificationFeed(signal)
    publish({ items: r.items, unread: r.unread, loaded: true, error: false })
  } catch {
    if (signal?.aborted) return
    publish({ ...current, loaded: true, error: true })
  }
}

export function useNotificationFeed() {
  const [state, setState] = useState<FeedState>(current)
  useEffect(() => {
    listeners.add(setState)
    const c = new AbortController()
    void refreshFeed(c.signal)
    const t = setInterval(() => void refreshFeed(), 60_000)
    return () => {
      listeners.delete(setState)
      c.abort()
      clearInterval(t)
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
