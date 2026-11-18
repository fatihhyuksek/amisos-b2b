/**
 * Katalog adresi (K-82): grup sayfası "/katalog/<grupSlug>"; slug bilinmiyorsa eski "?grup=<id>" biçimi
 * (katalog sayfası, slug'ı öğrenince adresi kendisi düzeltir). Arama "?q=" ile eklenir.
 */
export function catalogHref(params: { grup?: string; slug?: string | null; q?: string }): string {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.grup && !params.slug) qs.set('grup', params.grup)
  const s = qs.toString()
  const base = params.grup && params.slug ? `/katalog/${encodeURIComponent(params.slug)}` : '/katalog'
  return s ? `${base}?${s}` : base
}

/** Ürün adresi: slug varsa "/urun/<slug>", yoksa kimlikle (K-82, geriye uyum). */
export function productHref(p: { id: string; slug?: string | null }): string {
  return `/urun/${encodeURIComponent(p.slug || p.id)}`
}
