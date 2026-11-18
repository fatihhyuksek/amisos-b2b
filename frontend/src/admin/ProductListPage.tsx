// GR-URN-001, K-59, K-16, K-18, K-11, K-74, K-75: Admin ürün listesi. Arama, filtreler, hızlı stok değişimi,
// çoklu seçim + toplu işlem çubuğu, "öne çıkan" filtresi, sayfalama.
import { useEffect, useState } from 'react'
import {
  ApiError,
  bulkProducts,
  downloadProductsExcel,
  fetchAdminProducts,
  fetchProductGroups,
  updateProduct,
  type AdminProduct,
  type BulkAction,
  type Paged,
  type ProductGroup,
  type StockStatus,
} from '../api'
import { Link } from '../Link'
import { replace, useRoute } from '../router'
import { Alert, Badge, Button, EmptyState, Modal, StockBadge } from '../ui/components'
import { ErrorAlert, ProductImage } from '../ui/catalog'
import { networkMessage } from '../ui/networkMessage'
import { formatTRY } from '../ui/format'
import { Icon } from '../ui/Icon'
import { useDebounced } from '../ui/useDebounced'
import { AdminLayout } from './AdminLayout'
import { DuplicateProductDialog } from './DuplicateProductDialog'
import { saveBlob } from './download'
import { ListFooter, SkeletonRows } from './kit'
import { parsePageSize } from './kitUtils'
import { useLoad } from './useLoad'

interface Filters {
  q: string
  grup: string
  stok: string
  aktif: string
  oneCikan: string
  fiyatsiz: string
}

function listPath(f: Filters, page: number, size = 20): string {
  const qs = new URLSearchParams()
  if (f.q) qs.set('q', f.q)
  if (f.grup) qs.set('grup', f.grup)
  if (f.stok) qs.set('stok', f.stok)
  if (f.aktif) qs.set('aktif', f.aktif)
  if (f.oneCikan) qs.set('oneCikan', f.oneCikan)
  if (f.fiyatsiz) qs.set('fiyatsiz', f.fiyatsiz)
  if (size !== 20) qs.set('adet', String(size))
  if (page > 1) qs.set('sayfa', String(page))
  const s = qs.toString()
  return `/yonetim/urunler${s ? `?${s}` : ''}`
}

/** K-79: liste fiyatı 0 olan ürün "fiyat sorunuz" ürünüdür. */
function isUnpriced(p: AdminProduct): boolean {
  return Number(p.listPrice) === 0
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
    oneCikan: query.get('oneCikan') ?? '',
    fiyatsiz: query.get('fiyatsiz') ?? '',
  }
  const page = Math.max(1, Number(query.get('sayfa')) || 1)
  const size = parsePageSize(query.get('adet'))
  const [dup, setDup] = useState<AdminProduct | null>(null)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState(f.q)
  const debounced = useDebounced(search.trim())
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (debounced !== f.q) replace(listPath({ ...f, q: debounced }, 1, size))
    // yalnızca arama metni değişince adrese yazılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const listKey = `${f.q}|${f.grup}|${f.stok}|${f.aktif}|${f.oneCikan}|${f.fiyatsiz}|${page}|${size}`
  // Seçim yalnızca görüntülenen liste içindir: süzgeç veya sayfa değişince sıfırlanır.
  const [sel, setSel] = useState<{ key: string; ids: string[] }>({ key: listKey, ids: [] })
  const selected = sel.key === listKey ? sel.ids : []
  const setSelected = (ids: string[]) => setSel({ key: listKey, ids })
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkGroup, setBulkGroup] = useState('')
  const [confirmBulk, setConfirmBulk] = useState<{
    action: BulkAction
    label: string
    groupId?: string
    text: string
  } | null>(null)

  const groups = useLoad<ProductGroup[]>((s) => fetchProductGroups(s), 'groups')
  const { state, reload } = useLoad<Paged<AdminProduct>>(
    (signal) =>
      fetchAdminProducts(
        {
          q: f.q,
          groupId: f.grup,
          stock: f.stok,
          active: f.aktif,
          featured: f.oneCikan,
          priceMissing: f.fiyatsiz,
          page,
          pageSize: size,
        },
        signal,
      ),
    listKey,
  )

  const go = (patch: Partial<Filters>) => replace(listPath({ ...f, ...patch }, 1, size))
  const hasFilter = !!(f.q || f.grup || f.stok || f.aktif || f.oneCikan || f.fiyatsiz)

  async function runBulk(action: BulkAction, label: string, groupId?: string) {
    setBulkBusy(true)
    setNotice(null)
    try {
      const r = await bulkProducts({ ids: selected, action, groupId })
      setNotice({ tone: 'info', text: `${label}: ${r.updated} ürün güncellendi.` })
      setSelected([])
      reload()
    } catch (err) {
      setNotice({
        tone: 'danger',
        text:
          err instanceof ApiError && err.status === 400
            ? 'Toplu işlem yapılamadı. Seçimi ve grubu kontrol edin.'
            : networkMessage(err, 'Toplu işlem yapılamadı. Lütfen tekrar deneyin.'),
      })
    } finally {
      setBulkBusy(false)
    }
  }

  async function exportExcel() {
    setExporting(true)
    setNotice(null)
    try {
      const { blob, filename } = await downloadProductsExcel({
        q: f.q,
        groupId: f.grup,
        stock: f.stok,
        active: f.aktif,
        featured: f.oneCikan,
      })
      saveBlob(blob, filename ?? `urunler-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err) {
      setNotice({
        tone: 'danger',
        text:
          err instanceof ApiError && err.code === 'EXPORT_TOO_LARGE'
            ? 'Çok fazla kayıt var (en fazla 20.000). Filtreyle daraltın.'
            : err instanceof ApiError && err.status === 404
              ? 'Excel dışa aktarma bu sunucuda henüz yok.'
              : 'Excel dosyası oluşturulamadı. Lütfen tekrar deneyin.',
      })
    } finally {
      setExporting(false)
    }
  }

  async function toggleStock(p: AdminProduct) {
    const next: StockStatus = p.stockStatus === 'in_stock' ? 'out_of_stock' : 'in_stock'
    setBusyId(p.id)
    setNotice(null)
    try {
      await updateProduct(p.id, { stockStatus: next })
      reload()
    } catch (err) {
      setNotice({
        tone: 'danger',
        text:
          err instanceof ApiError && err.status === 404
            ? 'Ürün bulunamadı.'
            : networkMessage(err, 'Stok durumu değiştirilemedi.'),
      })
    } finally {
      setBusyId(null)
    }
  }

  const allOnPage =
    state.status === 'ready' &&
    state.data.items.length > 0 &&
    state.data.items.every((p) => selected.includes(p.id))
  const selectBox = (p: AdminProduct) => (
    <input
      type="checkbox"
      className="ui-selbox"
      aria-label={`Seç: ${p.name}`}
      checked={selected.includes(p.id)}
      onChange={(e) =>
        setSelected(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))
      }
    />
  )

  const stockButton = (p: AdminProduct) => (
    <Button
      variant="secondary"
      size="sm"
      className="ui-button--touch"
      disabled={busyId === p.id}
      onClick={() => toggleStock(p)}
      aria-label={`${p.name}: stoku ${p.stockStatus === 'in_stock' ? 'Yok' : 'Var'} yap`}
    >
      {p.stockStatus === 'in_stock' ? 'Yok yap' : 'Var yap'}
    </Button>
  )

  const copyButton = (p: AdminProduct) => (
    <Button
      variant="ghost"
      size="sm"
      icon="copyPlus"
      title="Kopyala"
      aria-label={`${p.name}: ürünü kopyala`}
      onClick={() => setDup(p)}
    >
      <span className="adm-copylabel">Kopyala</span>
    </Button>
  )

  return (
    <AdminLayout
      title="Ürünler"
      actions={
        <>
          <Button variant="secondary" icon="download" disabled={exporting} onClick={exportExcel}>
            {exporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
          </Button>
          <Link to="/yonetim/urunler/ice-aktar" className="ui-button ui-button--secondary">
            <Icon name="file" />
            Excel'den yükle
          </Link>
          <Link to="/yonetim/urunler/yeni" className="ui-button ui-button--primary">
            <Icon name="plus" />
            Ürün ekle
          </Link>
        </>
      }
    >
      <div className="adm-filters">
        <div className="ui-search adm-filters__search">
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
        <select
          className="ui-select"
          aria-label="Öne çıkan"
          value={f.oneCikan}
          onChange={(e) => go({ oneCikan: e.target.value })}
        >
          <option value="">Öne çıkan: tümü</option>
          <option value="true">Yalnız öne çıkanlar</option>
        </select>
        <select
          className="ui-select"
          aria-label="Fiyat durumu"
          value={f.fiyatsiz}
          onChange={(e) => go({ fiyatsiz: e.target.value })}
        >
          <option value="">Fiyat: tümü</option>
          <option value="true">Fiyatı girilmemiş</option>
        </select>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {state.status === 'loading' && <SkeletonRows rows={8} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Ürünler alınamadı.</ErrorAlert>}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="adm-card">
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
          <div className="ui-table-wrap ui-table-wrap--cards">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col" className="ui-selcol">
                    <input
                      type="checkbox"
                      className="ui-selbox"
                      aria-label="Bu sayfadaki tüm ürünleri seç"
                      checked={allOnPage}
                      ref={(el) => {
                        if (el) el.indeterminate = selected.length > 0 && !allOnPage
                      }}
                      onChange={(e) => setSelected(e.target.checked ? state.data.items.map((p) => p.id) : [])}
                    />
                  </th>
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
                  <th scope="col">
                    <span className="visually-hidden">İşlemler</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((p) => (
                  <tr key={p.id} data-selected={selected.includes(p.id) || undefined}>
                    <td className="ui-selcol">{selectBox(p)}</td>
                    <td className="wrap">
                      <div className="ui-cell-product">
                        <Thumb p={p} />
                        <span>
                          <Link className="ui-rowlink" to={`/yonetim/urunler/${encodeURIComponent(p.id)}`}>
                            {p.name}
                          </Link>
                          {p.isFeatured && (
                            <span className="ui-pill ui-pill--soft ui-pill--inline">Öne çıkan</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="num ui-left">{p.barcode}</td>
                    <td>{p.groupName}</td>
                    <td className="num">{p.caseQuantity}</td>
                    <td className="num">
                      {isUnpriced(p) ? (
                        <Badge tone="warning">Fiyatı girilmedi</Badge>
                      ) : (
                        formatTRY(p.listPrice)
                      )}
                    </td>
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
                    <td>{copyButton(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="ui-cards">
            {state.data.items.map((p) => (
              <li
                key={p.id}
                className="ui-card ui-prodcard"
                data-selected={selected.includes(p.id) || undefined}
              >
                <div className="ui-prodcard__sel">{selectBox(p)}</div>
                <Thumb p={p} />
                <div className="ui-prodcard__body">
                  <Link to={`/yonetim/urunler/${encodeURIComponent(p.id)}`}>{p.name}</Link>
                  {p.isFeatured && <span className="ui-pill ui-pill--soft ui-pill--inline">Öne çıkan</span>}
                  <span className="ui-rowcard__meta num">
                    {p.barcode} · {p.groupName}
                  </span>
                  <span className="ui-rowcard__meta">
                    Koli içi: {p.caseQuantity} ·{' '}
                    {isUnpriced(p) ? (
                      <Badge tone="warning">Fiyatı girilmedi</Badge>
                    ) : (
                      <>
                        <span className="num">{formatTRY(p.listPrice)}</span> KDV hariç
                      </>
                    )}
                  </span>
                </div>
                <div className="ui-prodcard__foot">
                  <div className="ui-stockline">
                    <StockBadge inStock={p.stockStatus === 'in_stock'} />
                    <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Aktif' : 'Pasif'}</Badge>
                  </div>
                  <span className="ui-actions">
                    {stockButton(p)}
                    {copyButton(p)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {selected.length > 0 && (
            <div className="ui-bulkbar" role="region" aria-label="Toplu işlemler">
              <strong className="num" aria-live="polite">
                {selected.length} ürün seçildi
              </strong>
              <div className="ui-bulkbar__actions">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={bulkBusy}
                  onClick={() => void runBulk('activate', 'Aktif yap')}
                >
                  Aktif yap
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={bulkBusy}
                  onClick={() =>
                    setConfirmBulk({
                      action: 'deactivate',
                      label: 'Pasife al',
                      text: `${selected.length} ürün pasife alınacak ve bayilere görünmeyecek.`,
                    })
                  }
                >
                  Pasife al
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={bulkBusy}
                  onClick={() => void runBulk('in_stock', 'Stokta var yap')}
                >
                  Stokta var
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={bulkBusy}
                  onClick={() => void runBulk('out_of_stock', 'Stokta yok yap')}
                >
                  Stokta yok
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={bulkBusy}
                  onClick={() => void runBulk('feature', 'Öne çıkar')}
                >
                  Öne çıkar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={bulkBusy}
                  onClick={() => void runBulk('unfeature', 'Öne çıkarmayı kaldır')}
                >
                  Öne çıkarmayı kaldır
                </Button>
                <span className="ui-bulkbar__group">
                  <select
                    className="ui-select"
                    aria-label="Taşınacak grup"
                    value={bulkGroup}
                    onChange={(e) => setBulkGroup(e.target.value)}
                  >
                    <option value="">Grup seçin</option>
                    {groups.state.status === 'ready' &&
                      groups.state.data
                        .filter((g) => g.isActive)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={bulkBusy || !bulkGroup}
                    onClick={() =>
                      setConfirmBulk({
                        action: 'set_group',
                        label: 'Grup değiştir',
                        groupId: bulkGroup,
                        text: `${selected.length} ürün seçilen gruba taşınacak.`,
                      })
                    }
                  >
                    Gruba taşı
                  </Button>
                </span>
                <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected([])}>
                  Seçimi temizle
                </Button>
              </div>
            </div>
          )}
          {confirmBulk && (
            <Modal
              title={`${confirmBulk.label}: onay`}
              onClose={() => setConfirmBulk(null)}
              dismissable={!bulkBusy}
            >
              <p>{confirmBulk.text} Devam edilsin mi?</p>
              <div className="ui-modal__actions">
                <Button variant="secondary" onClick={() => setConfirmBulk(null)} disabled={bulkBusy}>
                  Vazgeç
                </Button>
                <Button
                  disabled={bulkBusy}
                  onClick={async () => {
                    await runBulk(confirmBulk.action, confirmBulk.label, confirmBulk.groupId)
                    setConfirmBulk(null)
                  }}
                >
                  {bulkBusy ? 'Uygulanıyor…' : 'Onayla'}
                </Button>
              </div>
            </Modal>
          )}
          <ListFooter
            total={state.data.total}
            unit="ürün · fiyatlar KDV hariç"
            page={state.data.page}
            pageSize={state.data.pageSize}
            onPage={(p) => replace(listPath(f, p, size))}
            onPageSize={(n) => replace(listPath(f, 1, n))}
          />
        </>
      )}
      {dup && (
        <DuplicateProductDialog productId={dup.id} productName={dup.name} onClose={() => setDup(null)} />
      )}
    </AdminLayout>
  )
}
