// GR-URN-003, GR-FIY-001, K-40, K-18, K-10, K-11: Bayi ürün kataloğu. (Sepet sonraki adımda.)
import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  fetchCatalogGroups,
  fetchCatalogProducts,
  type CatalogGroup,
  type CatalogProduct,
} from '../api'
import { useAuth } from '../auth/useAuth'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { Button, EmptyState, Price, StockBadge } from '../ui/components'
import { ErrorAlert, ProductImage } from '../ui/catalog'
import { formatInt } from '../ui/format'
import { Icon } from '../ui/Icon'
import { useDebounced } from '../ui/useDebounced'
import { ShopLayout } from './ShopLayout'

const PAGE_SIZE = 24

interface Result {
  key: string
  items: CatalogProduct[]
  total: number
  page: number
  failed: boolean
}

export function ProductCard({ p }: { p: CatalogProduct }) {
  const href = `/urun/${encodeURIComponent(p.id)}`
  return (
    <li className="ui-card ui-product">
      <Link to={href} className="ui-product__media" tabIndex={-1} aria-hidden="true">
        <ProductImage src={p.images[0]?.thumbUrl} alt={p.name} />
      </Link>
      <div className="ui-product__body">
        <div className="ui-product__meta">
          <StockBadge inStock={p.stock === 'in_stock'} />
          <span className="muted num">Koli içi: {p.caseQuantity} adet</span>
        </div>
        <h3 className="ui-product__name">
          <Link to={href}>{p.name}</Link>
        </h3>
        <p className="muted num ui-product__barcode">{p.barcode}</p>
        <Price
          value={p.price}
          listValue={p.discountPercent ? p.listPrice : undefined}
          discountPercent={p.discountPercent ?? undefined}
        />
      </div>
    </li>
  )
}

export function CatalogPage() {
  const { refresh } = useAuth()
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const [groupId, setGroupId] = useState('')
  const groups = useLoad<CatalogGroup[]>((s) => fetchCatalogGroups(s), 'groups')
  const [tick, setTick] = useState(0)
  const [more, setMore] = useState(false)
  const key = `${q}|${groupId}|${tick}`
  const [result, setResult] = useState<Result | null>(null)

  // Süzgeç değişince ilk sayfadan başlar; sonuç anahtarı eşleşmiyorsa "yükleniyor" sayılır.
  useEffect(() => {
    const c = new AbortController()
    fetchCatalogProducts({ q, groupId, page: 1, pageSize: PAGE_SIZE }, c.signal)
      .then((r) => setResult({ key, items: r.items, total: r.total, page: r.page, failed: false }))
      .catch((err: unknown) => {
        if (c.signal.aborted) return
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) void refresh()
        setResult({ key, items: [], total: 0, page: 0, failed: true })
      })
    return () => c.abort()
  }, [q, groupId, key, refresh])

  const current = result && result.key === key ? result : null
  const list = {
    status: current ? (current.failed ? ('error' as const) : ('ready' as const)) : ('loading' as const),
    items: current?.items ?? [],
    total: current?.total ?? 0,
    page: current?.page ?? 0,
    loadMoreFailed: current?.items.length ? current.failed : false,
  }

  const loadMore = useCallback(async () => {
    setMore(true)
    try {
      const r = await fetchCatalogProducts({ q, groupId, page: list.page + 1, pageSize: PAGE_SIZE })
      setResult((cur) =>
        cur && cur.key === key
          ? {
              ...cur,
              items: [...cur.items, ...r.items.filter((n) => !cur.items.some((o) => o.id === n.id))],
              total: r.total,
              page: r.page,
              failed: false,
            }
          : cur,
      )
    } catch {
      setResult((cur) => (cur && cur.key === key ? { ...cur, failed: true } : cur))
    } finally {
      setMore(false)
    }
  }, [q, groupId, key, list.page])

  const searchBox = (
    <div className="ui-search">
      <Icon name="search" />
      <input
        className="ui-input"
        type="search"
        placeholder="Ürün adı veya barkod"
        aria-label="Ürün ara"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
    </div>
  )

  return (
    <ShopLayout search={searchBox}>
      {groups.state.status === 'ready' && groups.state.data.length > 0 && (
        <div className="ui-chips" role="group" aria-label="Ürün grubu">
          <button
            type="button"
            className="ui-chip"
            aria-pressed={groupId === ''}
            onClick={() => setGroupId('')}
          >
            Tümü
          </button>
          {groups.state.data.map((g) => (
            <button
              key={g.id}
              type="button"
              className="ui-chip"
              aria-pressed={groupId === g.id}
              onClick={() => setGroupId(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      <p className="muted" aria-live="polite">
        {list.status === 'ready' ? `${formatInt(list.total)} ürün · ` : ''}Fiyatlar KDV hariçtir
      </p>

      {list.status === 'loading' && (
        <ul className="ui-products" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="ui-card ui-skeleton" style={{ height: '5.5rem' }} />
          ))}
          <span className="visually-hidden" role="status">
            Yükleniyor…
          </span>
        </ul>
      )}
      {list.status === 'error' && list.items.length === 0 && (
        <ErrorAlert onRetry={() => setTick((t) => t + 1)}>Ürünler alınamadı.</ErrorAlert>
      )}
      {list.status === 'ready' && list.items.length === 0 && (
        <div className="ui-card">
          <EmptyState title="Ürün bulunamadı">Aramanızı veya ürün grubunu değiştirin.</EmptyState>
        </div>
      )}
      {list.items.length > 0 && (
        <>
          <ul className="ui-products">
            {list.items.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </ul>
          {list.loadMoreFailed && <ErrorAlert onRetry={loadMore}>Daha fazla ürün alınamadı.</ErrorAlert>}
          {list.items.length < list.total && (
            <div className="ui-more">
              <span className="muted">
                {formatInt(list.items.length)} / {formatInt(list.total)} ürün gösteriliyor
              </span>
              <Button variant="secondary" onClick={loadMore} disabled={more}>
                {more ? 'Yükleniyor…' : 'Daha fazla göster'}
              </Button>
            </div>
          )}
        </>
      )}
    </ShopLayout>
  )
}
