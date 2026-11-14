// Katalog grupları: kategori menüsü ve ana sayfa aynı veriyi kullanır.
// Sayfa geçişlerinde tekrar istek atmamak için kısa süreli bellek önbelleği (yalnızca başarılı yanıt).
import { fetchCatalogGroups, type CatalogGroup } from '../api'
import { useLoad } from '../admin/useLoad'

const TTL_MS = 5 * 60 * 1000
let cache: { at: number; data: CatalogGroup[] } | null = null

export function useCatalogGroups() {
  return useLoad<CatalogGroup[]>(async (signal) => {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.data
    const data = await fetchCatalogGroups(signal)
    cache = { at: Date.now(), data }
    return data
  }, 'catalog-groups')
}
