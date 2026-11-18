// K-82: sayfa başına başlık ve meta (istemci tarafı). Canlıda aynı etiketleri sunucu da <head>'e yazar;
// burada yalnızca gezinti sırasında tutarlılık için güncellenir.
import { useEffect } from 'react'
import { useSite } from './site'

const DEFAULT_SITE_TITLE = 'AMİSOS B2B'

export interface PageMeta {
  description?: string | null
  image?: string | null
  /** Sayfa arama motorlarına kapalı olsun (ör. sepet, hesap). */
  noindex?: boolean
}

function setMeta(attr: 'name' | 'property', key: string, value: string | null): void {
  const sel = `meta[${attr}="${key}"][data-seo]`
  let el = document.head.querySelector<HTMLMetaElement>(sel)
  if (!value) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    el.setAttribute('data-seo', '')
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

function setCanonical(href: string | null): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"][data-seo]')
  if (!href) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    el.setAttribute('data-seo', '')
    document.head.appendChild(el)
  }
  el.href = href
}

/** "%s" yer tutucusunu doldurur; şablonda yoksa "<başlık> · <site>" biçimi kullanılır. */
export function applyTitleTemplate(
  template: string | null | undefined,
  title: string | null | undefined,
): string {
  if (!title) return template && !template.includes('%s') ? template : DEFAULT_SITE_TITLE
  return template?.includes('%s') ? template.replace('%s', title) : `${title} · ${DEFAULT_SITE_TITLE}`
}

/** Sekme başlığı ve meta etiketleri (vitrin). Başlık verilmezse site başlığı kullanılır. */
export function usePageTitle(title: string | null | undefined, meta: PageMeta = {}): void {
  const seo = useSite().seo
  const { description, image, noindex } = meta
  useEffect(() => {
    const full = title
      ? applyTitleTemplate(seo?.titleTemplate, title)
      : (seo?.siteTitle ?? DEFAULT_SITE_TITLE)
    document.title = full
    const desc = description || seo?.description || null
    const img = image || seo?.ogImageUrl || null
    setMeta('name', 'description', desc)
    setMeta('name', 'keywords', seo?.keywords ?? null)
    setMeta('property', 'og:title', title || seo?.siteTitle || DEFAULT_SITE_TITLE)
    setMeta('property', 'og:description', desc)
    setMeta('property', 'og:image', img)
    setMeta('name', 'robots', noindex || seo?.indexable === false ? 'noindex, nofollow' : null)
    const base = seo?.canonicalBaseUrl?.replace(/\/+$/, '')
    setCanonical(base ? `${base}${location.pathname === '/' ? '' : location.pathname}` : null)
  }, [title, description, image, noindex, seo])
  useEffect(
    () => () => {
      document.head.querySelectorAll('[data-seo]').forEach((el) => el.remove())
    },
    [],
  )
}

/** Yönetim paneli sekme başlığı: "Siparişler · AMİSOS Yönetim". */
export function useAdminTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · AMİSOS Yönetim`
    setMeta('name', 'robots', 'noindex, nofollow')
    return () => setMeta('name', 'robots', null)
  }, [title])
}

let gaLoaded: string | null = null

/** Google Analytics 4 (yalnızca vitrin). Şimdilik kimlik girildiyse yüklenir; onay (consent) bandı yoktur. */
export function useAnalytics(): void {
  const id = useSite().seo?.googleAnalyticsId
  useEffect(() => {
    if (!id || !/^G-[A-Z0-9]{4,12}$/.test(id) || gaLoaded === id) return
    gaLoaded = id
    const w = window as unknown as { dataLayer?: unknown[] }
    w.dataLayer = w.dataLayer ?? []
    // gtag, dataLayer'a `arguments` nesnesini iter (dizi değil); Google'ın standart kalıbı.
    function gtag(..._args: unknown[]) {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer?.push(arguments)
    }
    gtag('js', new Date())
    gtag('config', id)
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    document.head.appendChild(s)
  }, [id])
}
