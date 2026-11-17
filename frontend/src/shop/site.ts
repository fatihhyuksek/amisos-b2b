// Site ayarları (K-73): duyuru şeridi, iletişim bilgileri, yayımlanmış sayfa listesi.
// Tüm vitrin sayfaları aynı veriyi kullanır; kısa süreli bellek önbelleği. Hata olursa sabitler (contact.ts).
import { useEffect, useState } from 'react'
import { fetchSite, type SiteInfo } from '../api'
import { DEFAULT_CONTACT, DEFAULT_PAGES, DEFAULT_SOCIAL } from './contact'

const TTL_MS = 2 * 60 * 1000
let cache: { at: number; data: SiteInfo } | null = null
let inflight: Promise<SiteInfo | null> | null = null

const FALLBACK: SiteInfo = {
  announcement: null,
  contact: DEFAULT_CONTACT,
  pages: DEFAULT_PAGES,
  social: DEFAULT_SOCIAL,
}

function load(): Promise<SiteInfo | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.data)
  inflight ??= fetchSite()
    .then((data) => {
      const merged: SiteInfo = {
        announcement: data.announcement ?? null,
        contact: { ...DEFAULT_CONTACT, ...data.contact },
        pages: Array.isArray(data.pages) ? data.pages : DEFAULT_PAGES,
        // Eski sunucu yanıtında social yoksa varsayılan hesap gösterilir (K-77).
        social: data.social ?? DEFAULT_SOCIAL,
      }
      cache = { at: Date.now(), data: merged }
      return merged
    })
    .catch(() => null)
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Admin kaydettikten sonra vitrin yeni veriyi alsın. */
export function invalidateSite(): void {
  cache = null
}

/** Duyuru şeridi hata durumunda gösterilmez; iletişim ve sayfa listesi sabitlere düşer. */
export function useSite(): SiteInfo {
  const [site, setSite] = useState<SiteInfo>(() => cache?.data ?? FALLBACK)
  useEffect(() => {
    let alive = true
    void load().then((d) => {
      if (alive && d) setSite(d)
    })
    return () => {
      alive = false
    }
  }, [])
  return site
}
