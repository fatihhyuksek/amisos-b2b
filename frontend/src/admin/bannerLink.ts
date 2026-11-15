// Banner bağlantısı: serbest metin yerine uygulama içi seçenekler (K-65, banner-api linkPath kuralı).
export type LinkKind = 'none' | 'catalog' | 'group' | 'product' | 'keep'

export function parseLink(path: string | null): { kind: LinkKind; id: string } {
  if (!path) return { kind: 'none', id: '' }
  if (path === '/katalog') return { kind: 'catalog', id: '' }
  const g = /^\/katalog\?grup=([^&\s]+)$/.exec(path)
  if (g) return { kind: 'group', id: decodeURIComponent(g[1]) }
  const p = /^\/urun\/([^/?\s]+)$/.exec(path)
  if (p) return { kind: 'product', id: decodeURIComponent(p[1]) }
  return { kind: 'keep', id: '' }
}

export function buildLink(kind: LinkKind, id: string, current: string | null): string | null {
  switch (kind) {
    case 'none':
      return null
    case 'catalog':
      return '/katalog'
    case 'group':
      return `/katalog?grup=${encodeURIComponent(id)}`
    case 'product':
      return `/urun/${encodeURIComponent(id)}`
    case 'keep':
      return current
  }
}
