// GR-SIP-006, GR-YON-001, K-17, K-24, K-25: Admin sipariş listesi (/yonetim/siparisler).
// Süzgeçler adreste: ?durum= &q= &aktarim=girilmedi &bas= &bit= &bayi= &sayfa=
import { useEffect, useState } from 'react'
import {
  downloadOrdersExcel,
  fetchAdminOrders,
  type AdminOrderFilters,
  type AdminOrderListItem,
  type OrderStatusValue,
  type Paged,
} from '../api'
import { Link } from '../Link'
import { replace, useRoute } from '../router'
import { DELIVERY_LABEL } from '../shop/delivery'
import { Alert, Badge, Button, EmptyState, OrderStatusBadge, Pagination } from '../ui/components'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { formatDateTime, formatInt, formatTRY } from '../ui/format'
import { Icon } from '../ui/Icon'
import { ORDER_STATUS } from '../ui/orderStatus'
import { AdminLayout } from './AdminLayout'
import { saveBlob } from './download'
import { useLoad } from './useLoad'

const PAGE_SIZE = 20

const TABS: { value: OrderStatusValue | ''; label: string }[] = [
  { value: '', label: 'Tümü' },
  { value: 'submitted', label: 'Gönderildi' },
  { value: 'negotiating', label: 'Görüşülüyor' },
  { value: 'approved', label: 'Onaylandı' },
  { value: 'shipped', label: 'Sevk edildi' },
  { value: 'delivered', label: 'Teslim edildi' },
  { value: 'cancelled', label: 'İptal' },
]

interface Filters {
  status: OrderStatusValue | ''
  q: string
  notTransferred: boolean
  from: string
  to: string
  dealerId: string
  page: number
}

function pathFor(f: Filters): string {
  const qs = new URLSearchParams()
  if (f.status) qs.set('durum', f.status)
  if (f.q) qs.set('q', f.q)
  if (f.notTransferred) qs.set('aktarim', 'girilmedi')
  if (f.from) qs.set('bas', f.from)
  if (f.to) qs.set('bit', f.to)
  if (f.dealerId) qs.set('bayi', f.dealerId)
  if (f.page > 1) qs.set('sayfa', String(f.page))
  const s = qs.toString()
  return `/yonetim/siparisler${s ? `?${s}` : ''}`
}

function apiFilters(f: Filters): AdminOrderFilters {
  return {
    status: f.status,
    q: f.q,
    transfer: f.notTransferred ? 'pending' : '',
    from: f.from,
    to: f.to,
    dealerId: f.dealerId,
  }
}

function TransferBadge({ status }: { status: AdminOrderListItem['transferStatus'] }) {
  return status === 'transferred' ? (
    <Badge tone="success">Girildi</Badge>
  ) : (
    <Badge tone="neutral">Girilmedi</Badge>
  )
}

export function OrderListPage() {
  const { query } = useRoute()
  const rawStatus = query.get('durum') ?? ''
  const f: Filters = {
    status: rawStatus in ORDER_STATUS ? (rawStatus as OrderStatusValue) : '',
    q: query.get('q') ?? '',
    notTransferred: query.get('aktarim') === 'girilmedi',
    from: query.get('bas') ?? '',
    to: query.get('bit') ?? '',
    dealerId: query.get('bayi') ?? '',
    page: Math.max(1, Number(query.get('sayfa')) || 1),
  }
  const [search, setSearch] = useState(f.q)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)

  useEffect(() => {
    if (search.trim() === f.q) return
    const t = setTimeout(() => replace(pathFor({ ...f, q: search.trim(), page: 1 })), 300)
    return () => clearTimeout(t)
    // f her çizimde yeniden oluşur; yalnızca değerleri önemli
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, f.q, f.status, f.notTransferred, f.from, f.to, f.dealerId])

  const key = pathFor(f)
  const { state, reload } = useLoad<Paged<AdminOrderListItem>>(
    (s) => fetchAdminOrders({ ...apiFilters(f), page: f.page, pageSize: PAGE_SIZE }, s),
    key,
  )
  const hasFilter = !!(f.status || f.q || f.notTransferred || f.from || f.to || f.dealerId)
  const go = (patch: Partial<Filters>) => replace(pathFor({ ...f, ...patch, page: patch.page ?? 1 }))

  async function exportExcel() {
    setExporting(true)
    setExportError(false)
    try {
      const { blob, filename } = await downloadOrdersExcel({ filters: apiFilters(f) })
      saveBlob(blob, filename ?? `siparisler-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  const orderLink = (o: AdminOrderListItem) => (
    <Link to={`/yonetim/siparisler/${encodeURIComponent(o.id)}`}>#{o.orderNo}</Link>
  )
  const stockFlag = (o: AdminOrderListItem) =>
    o.hasOutOfStock ? <span className="ui-pill ui-pill--warning">Stokta yok</span> : null

  return (
    <AdminLayout
      title="Siparişler"
      actions={
        <Button variant="secondary" icon="download" disabled={exporting} onClick={exportExcel}>
          {exporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
        </Button>
      }
    >
      {exportError && <Alert tone="danger">Excel dosyası oluşturulamadı. Lütfen tekrar deneyin.</Alert>}
      <div className="ui-toolbar">
        <div className="ui-search">
          <Icon name="search" />
          <input
            className="ui-input"
            type="search"
            aria-label="Sipariş ara"
            placeholder="Sipariş no, firma veya yetkili ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ui-chips ui-chips--wrap" role="group" aria-label="Durum filtresi">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              className="ui-chip"
              aria-pressed={f.status === t.value}
              onClick={() => go({ status: t.value })}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ui-orderfilters">
          <label className="ui-check">
            <input
              type="checkbox"
              checked={f.notTransferred}
              onChange={(e) => go({ notTransferred: e.target.checked })}
            />
            <span>BizimHesap'a girilmedi</span>
          </label>
          <label className="ui-orderfilters__date">
            <span className="ui-label">Başlangıç</span>
            <input
              className="ui-input"
              type="date"
              value={f.from}
              max={f.to || undefined}
              onChange={(e) => go({ from: e.target.value })}
            />
          </label>
          <label className="ui-orderfilters__date">
            <span className="ui-label">Bitiş</span>
            <input
              className="ui-input"
              type="date"
              value={f.to}
              min={f.from || undefined}
              onChange={(e) => go({ to: e.target.value })}
            />
          </label>
          {f.dealerId && (
            <Button
              variant="secondary"
              size="sm"
              className="ui-button--touch"
              onClick={() => go({ dealerId: '' })}
            >
              <Icon name="close" />
              Bayi filtresini kaldır
            </Button>
          )}
        </div>
      </div>

      {state.status === 'loading' && <LoadingCard rows={5} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Siparişler alınamadı.</ErrorAlert>}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="ui-card">
          <EmptyState
            title="Sipariş bulunamadı"
            action={
              hasFilter ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('')
                    replace('/yonetim/siparisler')
                  }}
                >
                  Filtreleri temizle
                </Button>
              ) : undefined
            }
          >
            {hasFilter ? 'Bu filtreyle eşleşen sipariş yok.' : 'Henüz sipariş yok.'}
          </EmptyState>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
          <p className="muted" aria-live="polite">
            {formatInt(state.data.total)} sipariş · Tutarlar TL, net tutar KDV hariçtir
          </p>
          <div className="ui-table-wrap ui-table-wrap--cards">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Sipariş no</th>
                  <th scope="col">Tarih</th>
                  <th scope="col">Bayi</th>
                  <th scope="col" className="num">
                    Satır
                  </th>
                  <th scope="col" className="num">
                    Net (KDV hariç)
                  </th>
                  <th scope="col" className="num">
                    Genel toplam
                  </th>
                  <th scope="col">Teslimat</th>
                  <th scope="col">Durum</th>
                  <th scope="col">BizimHesap</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((o) => (
                  <tr key={o.id}>
                    <td>{orderLink(o)}</td>
                    <td>{formatDateTime(o.submittedAt)}</td>
                    <td className="wrap">
                      <Link to={`/yonetim/bayiler/${encodeURIComponent(o.dealer.id)}`}>
                        {o.dealer.companyTitle}
                      </Link>
                    </td>
                    <td className="num">{o.lineCount}</td>
                    <td className="num">{formatTRY(o.netTotal)}</td>
                    <td className="num">
                      <strong>{formatTRY(o.grandTotal)}</strong>
                    </td>
                    <td>{DELIVERY_LABEL[o.deliveryMethod]}</td>
                    <td>
                      <div className="ui-badges">
                        <OrderStatusBadge status={o.status} />
                        {stockFlag(o)}
                      </div>
                    </td>
                    <td>
                      <TransferBadge status={o.transferStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="ui-cards">
            {state.data.items.map((o) => (
              <li key={o.id} className="ui-card ui-rowcard">
                <div className="ui-ordercard__head">
                  <strong className="num">{orderLink(o)}</strong>
                  <OrderStatusBadge status={o.status} />
                </div>
                <Link to={`/yonetim/bayiler/${encodeURIComponent(o.dealer.id)}`}>
                  {o.dealer.companyTitle}
                </Link>
                <span className="ui-rowcard__meta">
                  {formatDateTime(o.submittedAt)} · {o.lineCount} satır · {DELIVERY_LABEL[o.deliveryMethod]}
                </span>
                <dl className="ui-ordercard__sums num">
                  <div>
                    <dt>Net (KDV hariç)</dt>
                    <dd>{formatTRY(o.netTotal)}</dd>
                  </div>
                  <div>
                    <dt>Genel toplam</dt>
                    <dd>
                      <strong>{formatTRY(o.grandTotal)}</strong>
                    </dd>
                  </div>
                </dl>
                <div className="ui-badges">
                  <TransferBadge status={o.transferStatus} />
                  {stockFlag(o)}
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={state.data.page}
            pageSize={state.data.pageSize}
            total={state.data.total}
            onChange={(p) => go({ page: p })}
          />
        </>
      )}
    </AdminLayout>
  )
}
