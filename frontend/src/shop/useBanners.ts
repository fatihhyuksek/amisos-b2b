// Ana sayfa kampanya görselleri (K-65): GET /api/catalog/banners.
// Yalnızca aktif ve tarih aralığındaki banner'lar gelir. Hata olursa boş liste döner;
// ana sayfa duyuru kartına düşer (kampanya alanı sayfayı bozmamalı).
import { useEffect, useState } from 'react'
import { fetchShopBanners } from '../api'

export interface Banner {
  id: string
  /** Görsel (kütüphanedeki `large` sürüm; önerilen oran 3:1, telefonda 4:3 kırpılır). */
  imageUrl: string
  /** Görselin alternatif metni = banner başlığı. */
  alt: string
  subtitle?: string | null
  /** Uygulama içi yol (ör. "/katalog?grup=..."). */
  href?: string | null
}

export type BannersState = { status: 'loading' } | { status: 'ready'; items: Banner[] }

export function useBanners(): BannersState {
  const [state, setState] = useState<BannersState>({ status: 'loading' })
  useEffect(() => {
    const c = new AbortController()
    fetchShopBanners(c.signal)
      .then((list) =>
        setState({
          status: 'ready',
          items: list.map((b) => ({
            id: b.id,
            imageUrl: b.imageUrl,
            alt: b.title,
            subtitle: b.subtitle,
            // Yalnızca uygulama içi yol; savunma amaçlı çift eğik çizgi / şema reddedilir.
            href: b.linkPath && /^\/(?!\/)[^\\\s]*$/.test(b.linkPath) ? b.linkPath : null,
          })),
        }),
      )
      .catch(() => {
        if (!c.signal.aborted) setState({ status: 'ready', items: [] })
      })
    return () => c.abort()
  }, [])
  return state
}
