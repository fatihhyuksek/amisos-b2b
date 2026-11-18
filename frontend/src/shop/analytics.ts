// K-84: Vitrin olay izleyici. Çerezsiz; oturum anahtarı sessionStorage'da (yoksa bellekte) tutulur.
// Olaylar kuyruğa alınır: 5 saniyede bir veya 10 olayda gönderilir, sayfa gizlenince sendBeacon (text/plain) kullanılır.
// Admin oturumunda hiçbir şey gönderilmez (sunucu da yok sayar). Hatalar sessizce yutulur: izleme sayfayı bozmamalı.

export type TrackedType = 'page_view' | 'product_view' | 'search' | 'add_to_cart'

export interface TrackedEvent {
  type: TrackedType
  path: string
  productId?: string
  groupId?: string
  query?: string
  resultCount?: number
  quantity?: number
  referrer?: string
}

const ENDPOINT = '/api/events'
const FLUSH_MS = 5000
const FLUSH_AT = 10
const MAX_PER_REQUEST = 20
const SEARCH_DEBOUNCE_MS = 800
const KEY_NAME = 'amisos.sk'

let enabled = false
let queue: TrackedEvent[] = []
let timer: ReturnType<typeof setTimeout> | undefined
let memoryKey: string | null = null
let referrerSent = false
let searchTimer: ReturnType<typeof setTimeout> | undefined
let hooked = false

function randomKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      return crypto.randomUUID().replace(/-/g, '')
  } catch {
    /* eski tarayıcı */
  }
  let out = ''
  while (out.length < 32) out += Math.floor(Math.random() * 36).toString(36)
  return out
}

/** Oturum anahtarı: 16–64 karakter, yalnız [A-Za-z0-9_-]. */
export function sessionKey(): string {
  try {
    const stored = sessionStorage.getItem(KEY_NAME)
    if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) return stored
    const fresh = memoryKey ?? randomKey()
    sessionStorage.setItem(KEY_NAME, fresh)
    memoryKey = fresh
    return fresh
  } catch {
    memoryKey ??= randomKey()
    return memoryKey
  }
}

function body(events: TrackedEvent[]): string {
  return JSON.stringify({ sessionKey: sessionKey(), events })
}

function send(events: TrackedEvent[], beacon: boolean): void {
  if (events.length === 0) return
  try {
    if (beacon && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body(events)], { type: 'text/plain' }))) return
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: body(events),
    }).catch(() => undefined)
  } catch {
    /* izleme hataları sessizdir */
  }
}

/** Kuyruğu gönderir (en çok 20 olay/istek). */
export function flush(beacon = false): void {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  if (queue.length === 0) return
  const pending = queue
  queue = []
  for (let i = 0; i < pending.length; i += MAX_PER_REQUEST)
    send(pending.slice(i, i + MAX_PER_REQUEST), beacon)
}

function hookLifecycle(): void {
  if (hooked || typeof document === 'undefined') return
  hooked = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })
  window.addEventListener('pagehide', () => flush(true))
}

/** Admin oturumunda ya da oturum durumu belli olmadan kapalıdır; kapanınca kuyruk atılır. */
export function setTrackingEnabled(on: boolean): void {
  enabled = on
  if (!on) {
    queue = []
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = undefined
  } else hookLifecycle()
}

export function track(event: TrackedEvent): void {
  if (!enabled) return
  try {
    const e: TrackedEvent = { ...event, path: event.path.slice(0, 300) }
    if (e.query !== undefined) e.query = e.query.trim().slice(0, 100)
    queue.push(e)
    if (queue.length >= FLUSH_AT) flush()
    else timer ??= setTimeout(() => flush(), FLUSH_MS)
  } catch {
    /* sessiz */
  }
}

/** Sayfa görüntüleme; oturumun ilk görüntülemesine yönlendiren adres (referrer) eklenir. */
export function trackPageView(path: string): void {
  if (path.startsWith('/yonetim')) return
  const event: TrackedEvent = { type: 'page_view', path }
  if (!referrerSent) {
    referrerSent = true
    if (typeof document !== 'undefined' && document.referrer) event.referrer = document.referrer.slice(0, 300)
  }
  track(event)
}

export function trackProductView(productId: string, groupId?: string): void {
  track({ type: 'product_view', path: location.pathname, productId, groupId })
}

/** Arama: art arda gelen aramalarda yalnız sonuncusu (800 ms sakinleşme) gönderilir. */
export function trackSearch(query: string, resultCount: number): void {
  if (!enabled || !query.trim()) return
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    track({ type: 'search', path: location.pathname, query, resultCount })
  }, SEARCH_DEBOUNCE_MS)
}

export function trackAddToCart(productId: string, quantity: number, groupId?: string): void {
  track({ type: 'add_to_cart', path: location.pathname, productId, groupId, quantity })
}
