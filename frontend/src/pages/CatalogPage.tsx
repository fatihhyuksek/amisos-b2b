// GR-URN-003, GR-URN-002, GR-FIY-001, GR-FIY-003, K-40, K-18, K-10, K-11: Bayi ürün kataloğu.
// Süzgeçler adres satırında (?q=, ?grup=): geri tuşu ve paylaşılan bağlantı aynı sonucu verir.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchCatalogProducts, type CatalogProduct } from '../api'
import { useAuth } from '../auth/useAuth'
import { Link } from '../Link'
import { useRoute } from '../router'
import { useCatalogGroups } from '../shop/useCatalogGroups'
import { Button, EmptyState } from '../ui/components'
import { ErrorAlert, ProductCard, ProductCardSkeleton } from '../ui/catalog'
import { formatInt } from '../ui/format'
import { Icon } from '../ui/Icon'
import { catalogHref } from '../shop/catalogHref'
import { useAddToCart } from '../shop/useAddToCart'
import { ShopLayout } from './ShopLayout'

const PAGE_SIZE = 24

interface Result {
  key: string
  items: CatalogProduct[]
  total: number
  page: number
  failed: boolean
}

export function CatalogPage() {
  const { refresh } = useAuth()
  const { query } = useRoute()
  const q = (query.get('q') ?? '').trim()
  const groupId = query.get('grup') ?? ''
  const addToCart = useAddToCart()
  const groups = useCatalogGroups()
  const groupList = groups.state.status === 'ready' ? groups.state.data : []
  const group = groupList.find((g) => g.id === groupId)
  const [tick, setTick] = useState(0)
  const sideRef = useRef<HTMLUListElement>(null)
  // Telefonda yatay çip şeridinde seçili grubu görünür alana getirir (sayfayı kaydırmadan).
  useEffect(() => {
    const list = sideRef.current
    const chip = list?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!list || !chip || list.scrollWidth <= list.clientWidth) return
    list.scrollLeft += chip.getBoundingClientRect().left - list.getBoundingClientRect().left - 16
  }, [groupId, groupList.length])
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

  const title = q ? `“${q}” için sonuçlar` : (group?.name ?? 'Tüm ürünler')
  const groupLink = (id: string, label: string, count?: number) => (
    <Link
      to={catalogHref({ grup: id, q })}
      className="ui-chip"
      aria-current={groupId === id ? 'page' : undefined}
    >
      <span className="ui-chip__label">{label}</span>
      {count !== undefined && <span className="ui-chip__count num">{count}</span>}
    </Link>
  )

  return (
    <ShopLayout>
      <nav className="ui-crumbs" aria-label="Konum">
        <ol>
          <li>
            <Link to="/">Ana sayfa</Link>
          </li>
          <li>
            {q || group ? <Link to="/katalog">Katalog</Link> : <span aria-current="page">Katalog</span>}
          </li>
          {(q || group) && (
            <li>
              <span aria-current="page">{q ? 'Arama' : group?.name}</span>
            </li>
          )}
        </ol>
      </nav>

      <div className="ui-catalog">
        {groupList.length > 0 && (
          <aside className="ui-catalog__side" aria-labelledby="side-title">
            <h2 id="side-title" className="ui-catalog__sidetitle">
              Kategoriler
            </h2>
            <ul className="ui-sidelist" ref={sideRef}>
              <li>{groupLink('', 'Tüm ürünler')}</li>
              {groupList.map((g) => (
                <li key={g.id}>{groupLink(g.id, g.name, g.productCount)}</li>
              ))}
            </ul>
          </aside>
        )}

        <div className="ui-catalog__main">
          <header className="ui-catalog__head">
            <div>
              <h1>{title}</h1>
              <p className="muted" aria-live="polite">
                {list.status === 'ready' ? `${formatInt(list.total)} ürün · ` : ''}Fiyatlar KDV hariçtir
              </p>
            </div>
            {q && (
              <Link
                to={catalogHref({ grup: groupId })}
                className="ui-button ui-button--secondary ui-button--sm"
              >
                <Icon name="close" />
                Aramayı temizle
              </Link>
            )}
          </header>

          {list.status === 'loading' && (
            <>
              <ul className="ui-pgrid" aria-hidden="true">
                {Array.from({ length: 8 }, (_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </ul>
              <span className="visually-hidden" role="status">
                Yükleniyor…
              </span>
            </>
          )}
          {list.status === 'error' && list.items.length === 0 && (
            <ErrorAlert onRetry={() => setTick((t) => t + 1)}>Ürünler alınamadı.</ErrorAlert>
          )}
          {list.status === 'ready' && list.items.length === 0 && (
            <div className="ui-card">
              <EmptyState
                title="Ürün bulunamadı"
                action={
                  <Link to="/katalog" className="ui-button ui-button--secondary">
                    Tüm ürünlere dön
                  </Link>
                }
              >
                {q ? 'Başka bir ad, barkod veya kod deneyin.' : 'Bu kategoride şu an ürün yok.'}
              </EmptyState>
            </div>
          )}
          {list.items.length > 0 && (
            <>
              <ul className="ui-pgrid">
                {list.items.map((p) => (
                  <ProductCard key={p.id} product={p} onAdd={(prod) => void addToCart(prod)} />
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
        </div>
      </div>
    </ShopLayout>
  )
}
