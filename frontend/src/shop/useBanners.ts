// Ana sayfa kampanya görselleri (K-65). Admin'den yönetilecek; backend ucu sonraki adımda gelir.
// Uç geldiğinde yalnızca bu hook değişir (ör. GET /api/catalog/banners); şimdilik boş liste döner
// ve ana sayfa sade duyuru kartını gösterir.

export interface Banner {
  id: string
  /** Masaüstü görseli (önerilen oran 3:1). */
  imageUrl: string
  /** İsteğe bağlı mobil görsel (önerilen oran 4:3); yoksa imageUrl kullanılır. */
  mobileImageUrl?: string | null
  /** Görselin alternatif metni (zorunlu; görseldeki yazıyı içermeli). */
  alt: string
  /** İsteğe bağlı iç bağlantı (ör. "/katalog?grup=..."). */
  href?: string | null
}

export type BannersState = { status: 'loading' } | { status: 'ready'; items: Banner[] }

const EMPTY: BannersState = { status: 'ready', items: [] }

export function useBanners(): BannersState {
  return EMPTY
}
