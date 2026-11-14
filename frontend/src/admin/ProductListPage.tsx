// GR-URN-001, K-59, K-16, K-18, K-11: Admin ürün listesi. Arama, filtreler, hızlı stok değişimi, sayfalama.
import { useEffect, useState } from 'react'
import {
  ApiError,
  fetchAdminProducts,
  fetchProductGroups,
  updateProduct,
  type AdminProduct,
  type Paged,
  type ProductGroup,
  type StockStatus,
} from '../api'
import { Link } from '../Link'
import { replace, useRoute } from '../router'
import { Alert, Badge, Button, EmptyState, Pagination, StockBadge } from '../ui/components'
import { ErrorAlert, LoadingCard, ProductImage } from '../ui/catalog'
import { networkMessage } from '../ui/networkMessage'
import { formatInt, formatTRY } from '../ui/format'
import { Icon } from '../ui/Icon'
import { useDebounced } from '../ui/useDebounced'
import { AdminLayout } from './AdminLayout'
import { useLoad } from './useLoad'

const PAGE_SIZE = 20

interface Filters {
  q: string
  grup: string
  stok: string
  aktif: string
}

function listPath(f: Filters, page: number): string {
  const qs = new URLSearchParams()
  if (f.q) qs.set('q', f.q)
  if (f.grup) qs.set('grup', f.grup)
  if (f.stok) qs.set('stok', f.stok)
  if (f.aktif) qs.set('aktif', f.aktif)
  if (page > 1) qs.set('sayfa', String(page))
  const s = qs.toString()
  return `/yonetim/urunler${s ? `?${s}` : ''}`
}

function Thumb({ p }: { p: AdminProduct }) {
  return (
    <div className="ui-thumb">
      <ProductImage src={p.images[0]?.thumbUrl} alt={p.name} ratio="1" />
    </div>
  )
}

export function ProductListPage() {
  const { query } = useRoute()
  const f: Filters = {
    q: query.get('q') ?? '',
    grup: query.get('grup') ?? '',
    stok: query.get('stok') ?? '',
    aktif: query.get('aktif') ?? '',
  }
  const page = Math.max(1, Number(query.get('sayfa')) || 1)
  const [search, setSearch] = useState(f.q)
  const debounced = useDebounced(search.trim())
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (debounced !== f.q) replace(listPath({ ...f, q: debounced }, 1))
    // yalnızca arama metni değişince adrese yazılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const groups = useLoad<ProductGroup[]>((s) => fetchProductGroups(s), 'groups')
  const { state, reload } = useLoad<Paged<AdminProduct>>(
    (signal) =>
      fetchAdminProducts(
        { q: f.q, groupId: f.grup, stock: f.stok, active: f.aktif, page, pageSize: PAGE_SIZE },
        signal,
      ),
    `${f.q}|${f.grup}|${f.stok}|${f.aktif}|${page}`,
  )

  const go = (patch: Partial<Filters>) => replace(listPath({ ...f, ...patch }, 1))
  const hasFilter = !!(f.q || f.grup || f.stok || f.aktif)

  async function toggleStock(p: AdminProduct) {
    const next: StockStatus = p.stockStatus === 'in_stock' ? 'out_of_stock' : 'in_stock'
    setBusyId(p.id)
    setNotice(null)
    try {
      await updateProduct(p.id, { stockStatus: next })
      reload()
    } catch (err) {
      setNotice(
        err instanceof ApiError && err.status === 404
          ? 'Ürün bulunamadı.'
          : networkMessage(err, 'Stok durumu değiştirilemedi.'),
      )
    } finally {
      setBusyId(null)
    }
  }

  const stockButton = (p: AdminProduct) => (
    <Button
      variant="secondary"
      size="sm"
      disabled={busyId === p.id}
      onClick={() => toggleStock(p)}
      aria-label={`${p.name}: stoku ${p.stockStatus === 'in_stock' ? 'Yok' : 'Var'} yap`}
    >
      {p.stockStatus === 'in_stock' ? 'Yok yap' : 'Var yap'}
    </Button>
  )

  return (
    <AdminLayout
      title="Ürünler"
      actions={
        <div className="ui-actions">
          <Link to="/yonetim/urunler/ice-aktar" className="ui-button ui-button--secondary">
            Excel'den yükle
          </Link>
          <Link to="/yonetim/urunler/yeni" className="ui-button ui-button--primary">
            <Icon name="plus" />
            Ürün ekle
          </Link>
        </div>
      }
    >
      <div className="ui-toolbar__row">
        <div className="ui-search">
          <Icon name="search" />
          <input
            className="ui-input"
            type="search"
            aria-label="Ürün ara"
            placeholder="Ad, barkod veya kod ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="ui-select"
          aria-label="Ürün grubu"
          value={f.grup}
          onChange={(e) => go({ grup: e.target.value })}
        >
          <option value="">Tüm gruplar</option>
          {groups.state.status === 'ready' &&
            groups.state.data.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
        <select
          className="ui-select"
          aria-label="Stok durumu"
          value={f.stok}
          onChange={(e) => go({ stok: e.target.value })}
        >
          <option value="">Stok: tümü</option>
          <option value="in_stock">Stokta var</option>
          <option value="out_of_stock">Stokta yok</option>
        </select>
        <select
          className="ui-select"
          aria-label="Aktiflik"
          value={f.aktif}
          onChange={(e) => go({ aktif: e.target.value })}
        >
          <option value="">Durum: tümü</option>
          <option value="true">Aktif</option>
          <option value="false">Pasif</option>
        </select>
      </div>

      {notice && <Alert tone="danger">{notice}</Alert>}
      {state.status === 'loading' && <LoadingCard rows={5} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Ürünler alınamadı.</ErrorAlert>}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="ui-card">
          <EmptyState
            title="Ürün bulunamadı"
            action={
              hasFilter ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('')
                    replace('/yonetim/urunler')
                  }}
                >
                  Filtreleri temizle
                </Button>
              ) : undefined
            }
          >
            {hasFilter ? 'Bu filtreyle eşleşen ürün yok.' : 'Henüz ürün yok.'}
          </EmptyState>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
          <p className="muted" aria-live="polite">
            {formatInt(state.data.total)} ürün · Fiyatlar KDV hariçtir
          </p>
          <div className="ui-table-wrap ui-table-wrap--cards">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Ürün</th>
                  <th scope="col">Barkod</th>
                  <th scope="col">Grup</th>
                  <th scope="col" className="num">
                    Koli içi
                  </th>
                  <th scope="col" className="num">
                    Liste fiyatı (KDV hariç)
                  </th>
                  <th scope="col">Stok</th>
                  <th scope="col">Durum</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((p) => (
                  <tr key={p.id}>
                    <td className="wrap">
                      <div className="ui-cell-product">
                        <Thumb p={p} />
                        <Link to={`/yonetim/urunler/${encodeURIComponent(p.id)}`}>{p.name}</Link>
                      </div>
                    </td>
                    <td className="num">{p.barcode}</td>
                    <td>{p.groupName}</td>
                    <td className="num">{p.caseQuantity}</td>
                    <td className="num">{formatTRY(p.listPrice)}</td>
                    <td>
                      <div className="ui-stockline">
                        <StockBadge inStock={p.stockStatus === 'in_stock'} />
                        {stockButton(p)}
                      </div>
                    </td>
                    <td>
                      <Badge tone={p.isActive ? 'success' : 'neutral'}>
                        {p.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="ui-cards">
            {state.data.items.map((p) => (
              <li key={p.id} className="ui-card ui-prodcard">
                <Thumb p={p} />
                <div className="ui-prodcard__body">
                  <Link to={`/yonetim/urunler/${encodeURIComponent(p.id)}`}>{p.name}</Link>
                  <span className="ui-rowcard__meta num">
                    {p.barcode} · {p.groupName}
                  </span>
                  <span className="ui-rowcard__meta">
                    Koli içi: {p.caseQuantity} · <span className="num">{formatTRY(p.listPrice)}</span> KDV
                    hariç
                  </span>
                </div>
                <div className="ui-prodcard__foot">
                  <div className="ui-stockline">
                    <StockBadge inStock={p.stockStatus === 'in_stock'} />
                    <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Aktif' : 'Pasif'}</Badge>
                  </div>
                  {stockButton(p)}
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={state.data.page}
            pageSize={state.data.pageSize}
            total={state.data.total}
            onChange={(p) => replace(listPath(f, p))}
          />
        </>
      )}
    </AdminLayout>
  )
}
