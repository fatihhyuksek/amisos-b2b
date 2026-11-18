import { useMemo, useSyncExternalStore } from 'react'

// Karar (K-82): harici router yok. Adresler temiz yoldur (History API); eski "#/..." adresleri
// (e-posta bağlantıları dahil) açılışta aynı yola taşınır. Statik barındırmada tüm yolların
// index.html'e düşmesi gerekir (vite dev/preview ve backend SERVE_FRONTEND_DIR bunu yapar).

export interface Route {
  path: string
  query: URLSearchParams
}

const EVENT = 'amisos:route'

/** "#/urun/abc?x=1" biçimindeki eski adresi "/urun/abc?x=1" yoluna çevirir; eski değilse null. */
export function legacyHashToPath(hash: string): string | null {
  if (!hash.startsWith('#/')) return null
  const rest = hash.slice(1)
  // "//evil.com" gibi şema/ana makine değiştiren biçimler kabul edilmez.
  if (rest.startsWith('//') || rest.includes('\\')) return null
  return rest
}

/** Eski hash adresiyle gelindiyse geçmişe kayıt eklemeden temiz yola taşır. */
export function upgradeLegacyHash(): void {
  const target = legacyHashToPath(location.hash)
  if (!target) return
  // Hash'ten önceki gerçek sorgu (ör. "/?x=1#/katalog") yeni yolun sorgusuyla birleşmez; hash kazanır.
  history.replaceState(history.state, '', target)
}

function notify(): void {
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void): () => void {
  const onHash = () => {
    upgradeLegacyHash()
    cb()
  }
  window.addEventListener('popstate', cb)
  window.addEventListener('hashchange', onHash)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('popstate', cb)
    window.removeEventListener('hashchange', onHash)
    window.removeEventListener(EVENT, cb)
  }
}

const snapshot = () => location.pathname + location.search

export function useRoute(): Route {
  const current = useSyncExternalStore(subscribe, snapshot, () => '/')
  return useMemo(() => {
    const i = current.indexOf('?')
    const rawPath = i < 0 ? current : current.slice(0, i)
    const search = i < 0 ? '' : current.slice(i + 1)
    // Sondaki eğik çizgi yok sayılır ("/katalog/" = "/katalog").
    const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') || '/' : rawPath
    return { path: path || '/', query: new URLSearchParams(search) }
  }, [current])
}

function same(to: string): boolean {
  return to === location.pathname + location.search
}

/** Geçmişe kayıt eklemeden yönlendirir (korumalı sayfadan girişe atma, süzgeç güncelleme). */
export function replace(to: string): void {
  if (same(to)) return
  history.replaceState(null, '', to)
  notify()
}

/** Geçmişe kayıt ekleyerek yönlendirir (arama gönderme gibi kullanıcı eylemleri). */
export function navigate(to: string): void {
  if (same(to)) return
  history.pushState(null, '', to)
  notify()
  window.scrollTo(0, 0)
}

/** "/yonetim/bayiler/:id" gibi bir kalıpla yolu eşler; eşleşmezse null. */
export function matchPath(path: string, pattern: string): Record<string, string> | null {
  const a = path.split('/')
  const b = pattern.split('/')
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < b.length; i++) {
    if (b[i].startsWith(':')) {
      if (!a[i]) return null
      try {
        params[b[i].slice(1)] = decodeURIComponent(a[i])
      } catch {
        return null
      }
    } else if (a[i] !== b[i]) return null
  }
  return params
}
