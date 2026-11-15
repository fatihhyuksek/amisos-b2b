/** Katalog adresi: süzgeçler adres satırında (?q=, ?grup=). */
export function catalogHref(params: { grup?: string; q?: string }): string {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.grup) qs.set('grup', params.grup)
  const s = qs.toString()
  return s ? `/katalog?${s}` : '/katalog'
}
