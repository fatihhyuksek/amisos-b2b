import { useEffect, useState } from 'react'

// Karar: harici router yok. Rota sayısı az ve düz; hash tabanlı yönlendirme
// statik barındırmada sunucu ayarı gerektirmez ve mevcut #/tasarim bağlantısını korur.

export interface Route {
  path: string
  query: URLSearchParams
}

function read(): Route {
  const raw = location.hash.replace(/^#/, '') || '/'
  const [path, search = ''] = raw.split('?')
  return { path: path || '/', query: new URLSearchParams(search) }
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => location.hash)
  useEffect(() => {
    const onChange = () => setHash(location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  void hash
  return read()
}

/** Geçmişe kayıt eklemeden yönlendirir (korumalı sayfadan girişe atma). */
export function replace(to: string): void {
  location.replace(`#${to}`)
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
