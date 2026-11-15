// GR-URN-003, GR-URN-002, GR-FIY-001, GR-FIY-003, K-40, K-18, K-10, K-11: Bayi ürün kataloğu (kategori sayfası).
// Süzgeçler adres satırında (?q=, ?grup=, ?sirala=yeni): geri tuşu ve paylaşılan bağlantı aynı sonucu verir.
// ?stok=var: yalnızca stokta olanlar (backend `stock=in_stock` süzgeci; istemcide süzülmez).
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ApiError, fetchCatalogProducts, type CatalogGroup, type CatalogProduct } from '../api'
import { useAuth } from '../auth/useAuth'
import { Link } from '../Link'
import { navigate, useRoute } from '../router'
import { catalogHref } from '../shop/catalogHref'
import { useAddToCart } from '../shop/useAddToCart'
import { useCatalogGroups } from '../shop/useCatalogGroups'
import { Button, EmptyState } from '../ui/components'
import { ErrorAlert, GroupThumb, ProductCard, ProductCardSkeleton } from '../ui/catalog'
import { formatInt } from '../ui/format'
import { Icon } from '../ui/Icon'
import { ShopLayout } from './ShopLayout'

const PAGE_SIZE = 24
type Sort = 'name' | 'newest'
type Cols = '3' | '4'

const SORTS: { id: Sort; label: string }[] = [
  { id: 'name', label: 'Ada göre (A-Z)' },
  { id: 'newest', label: 'En yeni' },
]

interface Result {
  key: string
  items: CatalogProduct[]
  total: number
  page: number
  failed: boolean
}

function hrefWith(p: { q: string; grup: string; sort: Sort; stock: boolean }): string {
  const base = catalogHref({ q: p.q, grup: p.grup })
  const extra = [p.sort === 'newest' ? 'sirala=yeni' : '', p.stock ? 'stok=var' : ''].filter(Boolean)
  if (extra.length === 0) return base
  return `${base}${base.includes('?') ? '&' : '?'}${extra.join('&')}`
}

function readCols(): Cols {
  try {
    return localStorage.getItem('katalog-gorunum') === '3' ? '3' : '4'
  } catch {
    return '4'
  }
}

// ---------- Grup süzgeci (arama kutulu liste, sayılarla) ----------
function GroupFilter({
  groups,
  active,
  q,
  sort,
  stock,
}: {
  groups: CatalogGroup[]
  active: string
  q: string
  sort: Sort
  stock: boolean
}) {
  const [term, setTerm] = useState('')
  const id = useId()
  const t = term.trim().toLocaleLowerCase('tr')
  const shown = t ? groups.filter((g) => g.name.toLocaleLowerCase('tr').includes(t)) : groups
  return (
    <div className="ui-filter__body">
      {groups.length > 6 && (
        <div className="ui-filter__search">
          <Icon name="search" />
          <label htmlFor={id} className="visually-hidden">
            Kategori ara
          </label>
          <input
            id={id}
            type="search"
            placeholder="Kategori ara"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
      )}
      <ul className="ui-filter__list">
        {!t && (
          <li>
            <Link
              to={hrefWith({ q, grup: '', sort, stock })}
              className="ui-filter__option"
              aria-current={active === '' ? 'page' : undefined}
            >
              <span className="ui-filter__radio" aria-hidden="true" />
              <span className="ui-popover__grow">Tümü</span>
            </Link>
          </li>
        )}
        {shown.map((g) => (
          <li key={g.id}>
            <Link
              to={hrefWith({ q, grup: g.id, sort, stock })}
              className="ui-filter__option"
              aria-current={active === g.id ? 'page' : undefined}
            >
              <span className="ui-filter__radio" aria-hidden="true" />
              <span className="ui-popover__grow">{g.name}</span>
              <span className="ui-filter__count num">{g.productCount}</span>
            </Link>
          </li>
        ))}
        {shown.length === 0 && <li className="muted ui-filter__none">Eşleşen kategori yok</li>}
      </ul>
    </div>
  )
}

function StockSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const id = useId()
  return (
    <label className="ui-check ui-stockswitch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>Yalnızca stokta olanlar</span>
    </label>
  )
}

function SortRadios({ value, onChange, name }: { value: Sort; onChange: (s: Sort) => void; name: string }) {
  return (
    <fieldset className="ui-sortradios">
      <legend className="visually-hidden">Sıralama</legend>
      {SORTS.map((s) => (
        <label key={s.id} className="ui-filter__option">
          <input type="radio" name={name} checked={value === s.id} onChange={() => onChange(s.id)} />
          <span className="ui-popover__grow">{s.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

// ---------- Telefonda alttan açılan panel ----------
function Sheet({
  mode,
  onClose,
  total,
  children,
}: {
  mode: 'filter' | 'sort'
  onClose: () => void
  total: number | null
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    const opener = document.activeElement as HTMLElement | null
    if (d && !d.open) d.showModal()
    return () => {
      d?.close()
      opener?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="ui-sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="ui-sheet__panel">
        <div className="ui-sheet__head">
          <h2 id={titleId}>{mode === 'filter' ? 'Filtrele' : 'Sırala'}</h2>
          <button type="button" className="ui-iconbtn" aria-label="Kapat" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="ui-sheet__body">{children}</div>
        <div className="ui-sheet__foot">
          <Button block onClick={onClose}>
            {total === null ? 'Sonuçları göster' : `${formatInt(total)} ürünü göster`}
          </Button>
        </div>
      </div>
    </dialog>
  )
}

export function CatalogPage() {
  const { refresh } = useAuth()
  const { query } = useRoute()
  const q = (query.get('q') ?? '').trim()
  const groupId = query.get('grup') ?? ''
  const sort: Sort = query.get('sirala') === 'yeni' ? 'newest' : 'name'
  const stock = query.get('stok') === 'var'
  const addToCart = useAddToCart()
  const groups = useCatalogGroups()
  const groupList = groups.state.status === 'ready' ? groups.state.data : []
  const group = groupList.find((g) => g.id === groupId)
  const [cols, setColsState] = useState<Cols>(readCols)
  const [sheet, setSheet] = useState<'filter' | 'sort' | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)
  const [tick, setTick] = useState(0)
  const tilesRef = useRef<HTMLUListElement>(null)
  const [more, setMore] = useState(false)
  const key = `${q}|${groupId}|${sort}|${stock}|${tick}`
  const [result, setResult] = useState<Result | null>(null)

  function setCols(c: Cols) {
    setColsState(c)
    try {
      localStorage.setItem('katalog-gorunum', c)
    } catch {
      /* depolama kapalı olabilir */
    }
  }
  const setSort = (s: Sort) => navigate(hrefWith({ q, grup: groupId, sort: s, stock }))
  const setStock = (on: boolean) => navigate(hrefWith({ q, grup: groupId, sort, stock: on }))

  // Seçili alt kategori kutucuğunu yatay şeritte görünür alana getirir (sayfayı kaydırmadan).
  useEffect(() => {
    const list = tilesRef.current
    const tile = list?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!list || !tile || list.scrollWidth <= list.clientWidth) return
    list.scrollLeft += tile.getBoundingClientRect().left - list.getBoundingClientRect().left - 16
  }, [groupId, groupList.length])

  // Süzgeç değişince ilk sayfadan başlar; sonuç anahtarı eşleşmiyorsa "yükleniyor" sayılır.
  useEffect(() => {
    const c = new AbortController()
    fetchCatalogProducts(
      {
        q,
        groupId,
        sort: sort === 'newest' ? 'newest' : undefined,
        stock: stock ? 'in_stock' : undefined,
        page: 1,
        pageSize: PAGE_SIZE,
      },
      c.signal,
    )
      .then((r) => setResult({ key, items: r.items, total: r.total, page: r.page, failed: false }))
      .catch((err: unknown) => {
        if (c.signal.aborted) return
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) void refresh()
        setResult({ key, items: [], total: 0, page: 0, failed: true })
      })
    return () => c.abort()
  }, [q, groupId, sort, stock, key, refresh])

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
      const r = await fetchCatalogProducts({
        q,
        groupId,
        sort: sort === 'newest' ? 'newest' : undefined,
        stock: stock ? 'in_stock' : undefined,
        page: list.page + 1,
        pageSize: PAGE_SIZE,
      })
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
  }, [q, groupId, sort, stock, key, list.page])

  const title = q ? `“${q}” için sonuçlar` : (group?.name ?? 'Tüm ürünler')
  const filterPanel = <GroupFilter groups={groupList} active={groupId} q={q} sort={sort} stock={stock} />

  return (
    <ShopLayout>
      <nav className="ui-crumbs" aria-label="Konum">
        <ol>
          <li>
            <Link to="/" className="ui-crumbs__home">
              <Icon name="home" />
              Ana sayfa
            </Link>
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

      <header className="ui-cathead">
        <h1>{title}</h1>
        <p className="muted" aria-live="polite">
          {list.status === 'ready' ? `${formatInt(list.total)} ürün · ` : ''}Fiyatlar KDV hariçtir
        </p>
        {q && (
          <Link
            to={hrefWith({ q: '', grup: groupId, sort, stock })}
            className="ui-button ui-button--secondary ui-button--sm"
          >
            <Icon name="close" />
            Aramayı temizle
          </Link>
        )}
      </header>

      {groupList.length > 0 && (
        <nav aria-label="Alt kategoriler">
          <ul className="ui-subcats" ref={tilesRef}>
            <li>
              <Link
                to={hrefWith({ q, grup: '', sort, stock })}
                className="ui-subcat"
                aria-current={groupId === '' ? 'page' : undefined}
              >
                <span className="ui-subcat__img ui-subcat__img--all">
                  <img src="/brand/logo-128.webp" alt="" width={64} height={64} />
                </span>
                <span className="ui-subcat__name">Tümü</span>
              </Link>
            </li>
            {groupList.map((g) => (
              <li key={g.id}>
                <Link
                  to={hrefWith({ q, grup: g.id, sort, stock })}
                  className="ui-subcat"
                  aria-current={groupId === g.id ? 'page' : undefined}
                >
                  <span className="ui-subcat__img">
                    <GroupThumb src={g.thumbUrl} />
                  </span>
                  <span className="ui-subcat__name">{g.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="ui-catalog" data-filter={filterOpen ? 'open' : 'closed'}>
        {groupList.length > 0 && (
          <aside className="ui-filters" aria-label="Filtreler">
            <section className="ui-filter">
              <h2 className="ui-filter__title">
                <button
                  type="button"
                  className="ui-filter__toggle"
                  aria-expanded={filterOpen}
                  aria-controls="filter-groups"
                  onClick={() => setFilterOpen((o) => !o)}
                >
                  Kategoriler
                  <Icon name="chevronDown" />
                </button>
              </h2>
              <div id="filter-groups" hidden={!filterOpen}>
                {filterPanel}
              </div>
            </section>
            <section className="ui-filter" aria-label="Stok">
              <StockSwitch on={stock} onChange={setStock} />
            </section>
          </aside>
        )}

        <div className="ui-catalog__main">
          <div className="ui-listbar">
            <div className="ui-listbar__mobile">
              <Button variant="secondary" icon="filter" onClick={() => setSheet('filter')}>
                Filtrele{groupId || stock ? ` (${(groupId ? 1 : 0) + (stock ? 1 : 0)})` : ''}
              </Button>
              <Button variant="secondary" icon="sort" onClick={() => setSheet('sort')}>
                Sırala
              </Button>
            </div>
            <label className="ui-listbar__sort">
              <span>Sıralama:</span>
              <select className="ui-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="ui-listbar__view" role="group" aria-label="Görünüm">
              <span aria-hidden="true">Görünüm</span>
              {(['3', '4'] as Cols[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="ui-viewbtn"
                  aria-pressed={cols === c}
                  aria-label={`${c} sütun`}
                  onClick={() => setCols(c)}
                >
                  <span className={`ui-viewbtn__dots ui-viewbtn__dots--${c}`} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          {list.status === 'loading' && (
            <>
              <ul className="ui-pgrid ui-pgrid--catalog" data-cols={cols} aria-hidden="true">
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
                {q
                  ? 'Başka bir ad, barkod veya kod deneyin.'
                  : stock
                    ? 'Bu seçimde stokta ürün yok.'
                    : 'Bu kategoride şu an ürün yok.'}
              </EmptyState>
            </div>
          )}
          {list.items.length > 0 && (
            <>
              <ul className="ui-pgrid ui-pgrid--catalog" data-cols={cols}>
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

      {sheet && (
        <Sheet
          mode={sheet}
          onClose={() => setSheet(null)}
          total={list.status === 'ready' ? list.total : null}
        >
          {sheet === 'filter' ? (
            <section aria-label="Kategoriler">
              <h3 className="ui-sheet__sub">Kategoriler</h3>
              {filterPanel}
              <h3 className="ui-sheet__sub">Stok</h3>
              <StockSwitch on={stock} onChange={setStock} />
            </section>
          ) : (
            <SortRadios value={sort} onChange={setSort} name="sheet-sort" />
          )}
        </Sheet>
      )}
    </ShopLayout>
  )
}
