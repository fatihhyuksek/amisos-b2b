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
