// K-87: Yönetilebilir ana sayfa düzeni. Ayar yoksa ya da sunucu eskiyse mevcut varsayılan görünüm çizilir.
// Raf kaynağı sunucuda çözülmüşse (productIds) `ids=` ile alınır; çözülmemişse (varsayılan) kaynağa göre sorgulanır.
import { useEffect, useState } from 'react'
import {
  fetchSiteHome,
  type Audience,
  type HomeSection,
  type HomeSectionType,
  type ShelfSource,
} from '../api'
import type { ShopMode } from './mode'

export const SECTION_LABELS: Record<HomeSectionType, string> = {
  hero: 'Kampanya görselleri',
  categoryStrip: 'Kategori şeridi',
  trustStrip: 'Güven şeridi',
  howItWorks: 'Nasıl çalışır?',
  campaignStrip: 'Kampanya şeridi',
  collections: 'Koleksiyon kartları',
  productShelf: 'Ürün rafı',
  promoPanel: 'Tanıtım paneli',
  iconTiles: 'Hızlı erişim kutucukları',
}

export const SECTION_HELP: Record<HomeSectionType, string> = {
  hero: 'Kampanya görselleri sayfasındaki aktif görseller kayar.',
  categoryStrip: 'Ürün gruplarının yuvarlak küçük resimleri.',
  trustStrip: 'KDV hariç fiyat, koli bazlı sipariş gibi güven maddeleri.',
  howItWorks: 'Bayi olma adımlarını anlatan şerit.',
  campaignStrip: 'Başlık, kısa metin ve düğmeli geniş şerit.',
  collections: 'Seçilen gruplar için büyük görselli kartlar.',
  productShelf: 'Seçtiğiniz kaynaktan ürün listesi.',
  promoPanel: 'Solda koyu tanıtım paneli, sağda kayan ürünler.',
  iconTiles: 'Yeni ürünler, Öne çıkanlar, Hızlı sipariş gibi kısayollar.',
}

export const SOURCE_LABELS: Record<ShelfSource, string> = {
  bestSellers: 'En çok satanlar (son 90 gün)',
  mostViewed: 'En çok incelenenler',
  trending: 'Yükselenler (son 7 gün)',
  new: 'Yeni ürünler',
  featured: 'Öne çıkanlar',
  group: 'Bir ürün grubu',
  manual: 'Elle seçilen ürünler',
}

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'Herkes',
  guest: 'Yalnız oturumsuz ziyaretçi',
  dealer: 'Yalnız giriş yapmış bayi',
}

export const SHELF_TITLES: Record<ShelfSource, string> = {
  bestSellers: 'En çok satanlar',
  mostViewed: 'En çok incelenenler',
  trending: 'Yükselenler',
  new: 'Yeni ürünler',
  featured: 'Öne çıkan ürünler',
  group: 'Ürünler',
  manual: 'Seçilmiş ürünler',
}

export const MAX_SECTIONS = 20

/** Mevcut vitrin düzeni (sunucu varsayılanıyla aynı sıra). */
export const DEFAULT_SECTIONS: HomeSection[] = [
  { id: 'hero', type: 'hero', enabled: true, config: {} },
  { id: 'categoryStrip', type: 'categoryStrip', enabled: true, config: {} },
  { id: 'campaignStrip', type: 'campaignStrip', enabled: true, config: { audience: 'all' } },
  { id: 'collections', type: 'collections', enabled: true, config: { groupIds: [] } },
  {
    id: 'shelf-new',
    type: 'productShelf',
    enabled: true,
    title: 'Yeni ürünler',
    config: { source: 'new', limit: 5, layout: 'grid' },
  },
  { id: 'iconTiles', type: 'iconTiles', enabled: true, config: {} },
  {
    id: 'promo-featured',
    type: 'promoPanel',
    enabled: true,
    config: { source: 'featured', limit: 8, panelTitle: 'Öne çıkan ürünler' },
  },
  { id: 'howItWorks', type: 'howItWorks', enabled: true, config: { audience: 'guest' } },
  { id: 'trustStrip', type: 'trustStrip', enabled: true, config: {} },
]

let cache: { at: number; sections: HomeSection[] | null } | null = null
const TTL_MS = 60_000

export type HomeLayoutState = { status: 'loading' } | { status: 'ready'; sections: HomeSection[] }

/**
 * `GET /api/site/home`. Hata ya da boş yanıtta varsayılan düzen. Ayarlar kaydedilince `invalidateHome()`.
 * Bilinmeyen bölüm tipleri atlanır.
 */
export function useHomeLayout(): HomeLayoutState {
  const [state, setState] = useState<HomeLayoutState>(() =>
    cache && Date.now() - cache.at < TTL_MS
      ? { status: 'ready', sections: cache.sections ?? DEFAULT_SECTIONS }
      : { status: 'loading' },
  )
  useEffect(() => {
    if (cache && Date.now() - cache.at < TTL_MS) return
    const c = new AbortController()
    fetchSiteHome(c.signal)
      .then((h) => {
        const list = Array.isArray(h?.sections)
          ? h.sections.filter((s) => s && s.type in SECTION_LABELS && s.config !== null)
          : null
        cache = { at: Date.now(), sections: list && list.length > 0 ? list : null }
        setState({ status: 'ready', sections: cache.sections ?? DEFAULT_SECTIONS })
      })
      .catch(() => {
        if (!c.signal.aborted) setState({ status: 'ready', sections: DEFAULT_SECTIONS })
      })
    return () => c.abort()
  }, [])
  return state
}

export function invalidateHome(): void {
  cache = null
}

/** Kitle süzgeci: bölüm bu ziyaretçi türüne gösterilir mi? Yönetici görünümü her şeyi görür. */
export function audienceOk(audience: Audience | undefined, mode: ShopMode): boolean {
  if (!audience || audience === 'all' || mode === 'admin') return true
  return audience === mode
}
