// Rapor sekmeleri: siparişler, bayiler, ürünler, gruplar, durumlar, stokta yokken sipariş, sipariş vermeyen bayiler.
import { useState, type ReactNode } from 'react'
import {
  fetchReport,
  type Comparable,
  type OrderStatusValue,
  type ReportDealerProduct,
  type ReportDealerRow,
  type ReportGroupRow,
  type ReportInactiveDealer,
  type ReportOrders,
  type ReportOutOfStockRow,
  type ReportProductRow,
  type ReportStatusRow,
} from '../../api'
import { Link } from '../../Link'
import { EmptyState, OrderStatusBadge, Pagination } from '../../ui/components'
import { ErrorAlert, LoadingCard } from '../../ui/catalog'
import { formatDate, formatDateTime, formatInt, formatTRY } from '../../ui/format'
import { ORDER_STATUS, orderStatusLabel } from '../../ui/orderStatus'
import { whatsappHref } from '../phone'
import { useLoad } from '../useLoad'
import { HBarList } from './charts'
import { Delta, ExportButton, ReportTable, type Col } from './ui'

interface Period {
  from: string
  to: string
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="ui-card">
      <EmptyState title="Veri yok">{children}</EmptyState>
    </div>
  )
}

/** Karşılaştırmalı tutar hücresi: değer + önceki dönem / geçen yıl farkı. */
function CmpCell({ m, which }: { m: Comparable; which: 'previous' | 'lastYear' }) {
  return (
    <span className="ui-cmpcell">
      <span>{formatTRY(which === 'previous' ? m.previous : m.lastYear)}</span>
      <Delta change={which === 'previous' ? m.changePrev : m.changeYear} kind="money" />
    </span>
  )
}

const num = (s: string | number) => Number(s)

// ---------- Siparişler ----------
export function OrdersTab({ from, to }: Period) {
  const [status, setStatus] = useState<OrderStatusValue | ''>('')
  const [page, setPage] = useState(1)
  const { state, reload } = useLoad<ReportOrders>(
    (s) => fetchReport('orders', { from, to, status, page, pageSize: 20 }, s),
    `${from}|${to}|${status}|${page}`,
  )
  const cols: Col<ReportOrders['items'][number]>[] = [
    {
      key: 'no',
      label: 'Sipariş no',
      title: true,
      sort: (r) => r.orderNo,
      cell: (r) => <Link to={`/yonetim/siparisler/${encodeURIComponent(r.id)}`}>#{r.orderNo}</Link>,
    },
    { key: 'date', label: 'Tarih', sort: (r) => r.submittedAt, cell: (r) => formatDateTime(r.submittedAt) },
    {
      key: 'dealer',
      label: 'Bayi',
      sort: (r) => r.dealer.companyTitle,
      cell: (r) => (
        <Link to={`/yonetim/bayiler/${encodeURIComponent(r.dealer.id)}`}>{r.dealer.companyTitle}</Link>
      ),
    },
    { key: 'status', label: 'Durum', cell: (r) => <OrderStatusBadge status={r.status} /> },
    { key: 'lines', label: 'Satır', num: true, sort: (r) => r.lineCount, cell: (r) => r.lineCount },
    {
      key: 'net',
      label: 'Net (KDV hariç)',
      num: true,
      sort: (r) => num(r.netTotal),
      cell: (r) => formatTRY(r.netTotal),
    },
    {
      key: 'grand',
      label: 'Genel toplam',
      num: true,
      sort: (r) => num(r.grandTotal),
      cell: (r) => formatTRY(r.grandTotal),
    },
  ]
  return (
    <div className="ui-stack">
      <div className="ui-reportbar">
        <label className="ui-orderfilters__date">
          <span className="ui-label">Durum</span>
          <select
            className="ui-select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as OrderStatusValue | '')
              setPage(1)
            }}
          >
            <option value="">Tümü (iptaller hariç toplam)</option>
            {(Object.keys(ORDER_STATUS) as OrderStatusValue[]).map((s) => (
              <option key={s} value={s}>
                {orderStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <ExportButton
          name="orders"
          params={{ from, to, status }}
          fallbackName={`rapor-siparisler-${from}-${to}.xlsx`}
        />
      </div>
      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Rapor alınamadı.</ErrorAlert>}
      {state.status === 'ready' && (
        <>
          <p className="muted" aria-live="polite">
            Toplam (iptaller hariç): {formatInt(state.data.totals.orderCount)} sipariş · Net{' '}
            <span className="num">{formatTRY(state.data.totals.netTotal)}</span> · Genel toplam{' '}
            <span className="num">{formatTRY(state.data.totals.grandTotal)}</span>
          </p>
          {state.data.items.length === 0 ? (
            <Empty>Bu dönemde sipariş yok.</Empty>
          ) : (
            <>
              <ReportTable
                rows={state.data.items}
                cols={cols}
                rowKey={(r) => r.id}
                caption="Dönemdeki siparişler"
              />
              <Pagination
                page={state.data.page}
                pageSize={state.data.pageSize}
                total={state.data.total}
                onChange={setPage}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

// ---------- Bayiler ----------
function DealerProducts({ id, from, to }: { id: string; from: string; to: string }) {
  const { state, reload } = useLoad<ReportDealerProduct[]>(
    (s) => fetchReport(`dealers/${encodeURIComponent(id)}/products`, { from, to, limit: 10 }, s),
    `dp|${id}|${from}|${to}`,
  )
  if (state.status === 'loading') return <p className="muted">Yükleniyor…</p>
  if (state.status === 'error') return <ErrorAlert onRetry={reload}>Ürünler alınamadı.</ErrorAlert>
  if (state.data.length === 0) return <p className="muted">Bu dönemde ürün yok.</p>
  return (
    <div className="ui-stack">
      <strong>En çok aldığı ürünler</strong>
      <ol className="ui-toplist">
        {state.data.map((p) => (
          <li key={p.productId}>
            <Link to={`/yonetim/urunler/${encodeURIComponent(p.productId)}`}>{p.name}</Link>
            <span className="muted num">
              {formatInt(p.quantity)} adet · {formatTRY(p.netTotal)} · {p.groupName}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function DealersTab({ from, to }: Period) {
  const { state, reload } = useLoad<ReportDealerRow[]>(
    (s) => fetchReport('dealers', { from, to }, s),
    `${from}|${to}`,
  )
  const [open, setOpen] = useState<string | null>(null)
  const cols: Col<ReportDealerRow>[] = [
    {
      key: 'dealer',
      label: 'Bayi',
      title: true,
      sort: (r) => r.companyTitle,
      cell: (r) => (
        <span className="ui-dealercell">
          <Link to={`/yonetim/bayiler/${encodeURIComponent(r.dealerId)}`}>{r.companyTitle}</Link>
          <button
            type="button"
            className="ui-linklike ui-linklike--touch"
            aria-expanded={open === r.dealerId}
            onClick={() => setOpen((o) => (o === r.dealerId ? null : r.dealerId))}
          >
            {open === r.dealerId ? 'Ürünleri gizle' : 'Ürünleri göster'}
            <span className="visually-hidden">: {r.companyTitle}</span>
          </button>
        </span>
      ),
    },
    { key: 'city', label: 'Şehir', sort: (r) => r.city, cell: (r) => r.city },
    {
      key: 'orders',
      label: 'Sipariş',
      num: true,
      sort: (r) => r.orderCount,
      cell: (r) => formatInt(r.orderCount),
    },
    {
      key: 'net',
      label: 'Net (KDV hariç)',
      num: true,
      sort: (r) => num(r.netTotal.current),
      cell: (r) => formatTRY(r.netTotal.current),
    },
    {
      key: 'prev',
      label: 'Önceki dönem',
      num: true,
      sort: (r) => num(r.netTotal.previous),
      cell: (r) => <CmpCell m={r.netTotal} which="previous" />,
    },
    {
      key: 'year',
      label: 'Geçen yıl',
      num: true,
      sort: (r) => num(r.netTotal.lastYear),
      cell: (r) => <CmpCell m={r.netTotal} which="lastYear" />,
    },
    {
      key: 'grand',
      label: 'KDV dahil',
      num: true,
      sort: (r) => num(r.grandTotal),
      cell: (r) => formatTRY(r.grandTotal),
    },
    { key: 'last', label: 'Son sipariş', sort: (r) => r.lastOrderAt, cell: (r) => formatDate(r.lastOrderAt) },
  ]
  return (
    <div className="ui-stack">
      <div className="ui-reportbar">
        <ExportButton
          name="dealers"
          params={{ from, to }}
          fallbackName={`rapor-bayiler-${from}-${to}.xlsx`}
        />
      </div>
      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Rapor alınamadı.</ErrorAlert>}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <Empty>Bu dönemde sipariş veren bayi yok.</Empty>
        ) : (
          <ReportTable
            rows={state.data}
            cols={cols}
            rowKey={(r) => r.dealerId}
            defaultSort={{ key: 'net', dir: 'desc' }}
            caption="Bayi bazında satış"
            expanded={open}
            renderExpanded={(r) => <DealerProducts id={r.dealerId} from={from} to={to} />}
          />
        ))}
    </div>
  )
}

// ---------- Ürünler ----------
export function ProductsTab({ from, to }: Period) {
  const [sort, setSort] = useState<'quantity' | 'net'>('quantity')
  const { state, reload } = useLoad<ReportProductRow[]>(
    (s) => fetchReport('products', { from, to, sort, limit: 50 }, s),
    `${from}|${to}|${sort}`,
  )
  const cols: Col<ReportProductRow>[] = [
    {
      key: 'name',
      label: 'Ürün',
      title: true,
      sort: (r) => r.name,
      cell: (r) => <Link to={`/yonetim/urunler/${encodeURIComponent(r.productId)}`}>{r.name}</Link>,
    },
    { key: 'barcode', label: 'Barkod', cell: (r) => <span className="num">{r.barcode}</span> },
    { key: 'group', label: 'Grup', sort: (r) => r.groupName, cell: (r) => r.groupName },
    { key: 'qty', label: 'Adet', num: true, sort: (r) => r.quantity, cell: (r) => formatInt(r.quantity) },
    {
      key: 'orders',
      label: 'Sipariş',
      num: true,
      sort: (r) => r.orderCount,
      cell: (r) => formatInt(r.orderCount),
    },
    {
      key: 'dealers',
      label: 'Bayi',
      num: true,
      sort: (r) => r.dealerCount,
      cell: (r) => formatInt(r.dealerCount),
    },
    {
      key: 'net',
      label: 'Net (KDV hariç)',
      num: true,
      sort: (r) => num(r.netTotal),
      cell: (r) => formatTRY(r.netTotal),
    },
  ]
  return (
    <div className="ui-stack">
      <div className="ui-reportbar">
        <label className="ui-orderfilters__date">
          <span className="ui-label">İlk 50 ürün, sıralama</span>
          <select
            className="ui-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'quantity' | 'net')}
          >
            <option value="quantity">Adede göre</option>
            <option value="net">Net cirona göre</option>
          </select>
        </label>
        <ExportButton
          name="products"
          params={{ from, to, sort, limit: 50 }}
          fallbackName={`rapor-urunler-${from}-${to}.xlsx`}
        />
      </div>
      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Rapor alınamadı.</ErrorAlert>}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <Empty>Bu dönemde ürün satışı yok.</Empty>
        ) : (
          <ReportTable
            rows={state.data}
            cols={cols}
            rowKey={(r) => r.productId}
            caption="En çok sipariş edilen ürünler"
          />
        ))}
    </div>
  )
}

// ---------- Ürün grupları ----------
export function GroupsTab({ from, to }: Period) {
  const { state, reload } = useLoad<ReportGroupRow[]>(
    (s) => fetchReport('groups', { from, to }, s),
    `${from}|${to}`,
  )
  const cols: Col<ReportGroupRow>[] = [
    { key: 'name', label: 'Ürün grubu', title: true, sort: (r) => r.name, cell: (r) => r.name },
    { key: 'qty', label: 'Adet', num: true, sort: (r) => r.quantity, cell: (r) => formatInt(r.quantity) },
    {
      key: 'net',
      label: 'Net (KDV hariç)',
      num: true,
      sort: (r) => num(r.netTotal.current),
      cell: (r) => formatTRY(r.netTotal.current),
    },
    {
      key: 'share',
      label: 'Pay',
      num: true,
      sort: (r) => num(r.sharePercent),
      cell: (r) =>
        `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(num(r.sharePercent))}`,
    },
    {
      key: 'prev',
      label: 'Önceki dönem',
      num: true,
      sort: (r) => num(r.netTotal.previous),
      cell: (r) => <CmpCell m={r.netTotal} which="previous" />,
    },
    {
      key: 'year',
      label: 'Geçen yıl',
      num: true,
      sort: (r) => num(r.netTotal.lastYear),
      cell: (r) => <CmpCell m={r.netTotal} which="lastYear" />,
    },
  ]
  return (
    <div className="ui-stack">
      <div className="ui-reportbar">
        <ExportButton name="groups" params={{ from, to }} fallbackName={`rapor-gruplar-${from}-${to}.xlsx`} />
      </div>
      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Rapor alınamadı.</ErrorAlert>}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <Empty>Bu dönemde satış yok.</Empty>
        ) : (
          <>
            <section className="ui-card ui-card__body ui-stack" aria-labelledby="rp-g-chart">
              <h2 id="rp-g-chart">Net ciro payı</h2>
              <HBarList
                label="Ürün grubu net ciro payı"
                rows={[...state.data]
                  .sort((a, b) => num(b.sharePercent) - num(a.sharePercent))
                  .map((g) => ({
                    key: g.groupId,
                    label: g.name,
                    percent: num(g.sharePercent),
                    text: formatTRY(g.netTotal.current),
                  }))}
              />
            </section>
            <ReportTable
              rows={state.data}
              cols={cols}
              rowKey={(r) => r.groupId}
              defaultSort={{ key: 'net', dir: 'desc' }}
              caption="Ürün grubu bazında satış"
            />
          </>
        ))}
    </div>
  )
}

// ---------- Durumlar ----------
export function StatusTab({ from, to }: Period) {
  const { state, reload } = useLoad<ReportStatusRow[]>(
    (s) => fetchReport('status', { from, to }, s),
    `${from}|${to}`,
  )
  const hours = (v: ReportStatusRow['averageHoursInStatus']) =>
    v === null
      ? '—'
      : `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(Number(v))} saat`
  const cols: Col<ReportStatusRow>[] = [
    { key: 'status', label: 'Durum', title: true, cell: (r) => <OrderStatusBadge status={r.status} /> },
    { key: 'count', label: 'Sipariş', num: true, sort: (r) => r.count, cell: (r) => formatInt(r.count) },
    {
      key: 'hours',
      label: 'Ort. bekleme',
      num: true,
      sort: (r) => (r.averageHoursInStatus === null ? -1 : num(r.averageHoursInStatus)),
      cell: (r) => hours(r.averageHoursInStatus),
    },
  ]
  return (
    <div className="ui-stack">
      <div className="ui-reportbar">
        <p className="muted">
          Dönemde gönderilen siparişler (iptaller dahil); bekleme, siparişin o durumda kaldığı ortalama
          süredir.
        </p>
        <ExportButton
          name="status"
          params={{ from, to }}
          fallbackName={`rapor-durumlar-${from}-${to}.xlsx`}
        />
      </div>
      {state.status === 'loading' && <LoadingCard rows={3} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Rapor alınamadı.</ErrorAlert>}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <Empty>Bu dönemde sipariş yok.</Empty>
        ) : (
          <ReportTable
            rows={state.data}
            cols={cols}
            rowKey={(r) => r.status}
            caption="Sipariş durumu dağılımı"
          />
        ))}
    </div>
  )
}

// ---------- Stokta yokken sipariş ----------
export function OutOfStockTab({ from, to }: Period) {
  const { state, reload } = useLoad<ReportOutOfStockRow[]>(
    (s) => fetchReport('out-of-stock', { from, to }, s),
    `${from}|${to}`,
  )
  const cols: Col<ReportOutOfStockRow>[] = [
    {
      key: 'name',
      label: 'Ürün',
      title: true,
      sort: (r) => r.name,
      cell: (r) => <Link to={`/yonetim/urunler/${encodeURIComponent(r.productId)}`}>{r.name}</Link>,
    },
    { key: 'barcode', label: 'Barkod', cell: (r) => <span className="num">{r.barcode}</span> },
    { key: 'group', label: 'Grup', sort: (r) => r.groupName, cell: (r) => r.groupName },
    { key: 'qty', label: 'Adet', num: true, sort: (r) => r.quantity, cell: (r) => formatInt(r.quantity) },
    {
      key: 'orders',
      label: 'Sipariş',
      num: true,
      sort: (r) => r.orderCount,
      cell: (r) => formatInt(r.orderCount),
    },
    {
      key: 'dealers',
      label: 'Bayi',
      num: true,
      sort: (r) => r.dealerCount,
      cell: (r) => formatInt(r.dealerCount),
    },
    {
      key: 'last',
      label: 'Son sipariş',
      sort: (r) => r.lastOrderedAt,
      cell: (r) => formatDate(r.lastOrderedAt),
    },
  ]
  return (
    <div className="ui-stack">
      <div className="ui-reportbar">
        <p className="muted">Sipariş anında stokta yokken sipariş edilen ürünler (tedarik planı için).</p>
        <ExportButton
          name="out-of-stock"
          params={{ from, to }}
          fallbackName={`rapor-stokta-yok-${from}-${to}.xlsx`}
        />
      </div>
      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Rapor alınamadı.</ErrorAlert>}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <Empty>Bu dönemde stokta yokken verilen sipariş yok.</Empty>
        ) : (
          <ReportTable
            rows={state.data}
            cols={cols}
            rowKey={(r) => r.productId}
            defaultSort={{ key: 'qty', dir: 'desc' }}
            caption="Stokta yokken sipariş edilen ürünler"
          />
        ))}
    </div>
  )
}

// ---------- Sipariş vermeyen bayiler (K-50) ----------
const DAY_CHOICES = [30, 45, 60, 90, 120, 180]

export function InactiveTab() {
  const [days, setDays] = useState(60)
  const { state, reload } = useLoad<ReportInactiveDealer[]>(
    (s) => fetchReport('inactive-dealers', { days }, s),
    String(days),
  )
  const cols: Col<ReportInactiveDealer>[] = [
    {
      key: 'dealer',
      label: 'Bayi',
      title: true,
      sort: (r) => r.companyTitle,
      cell: (r) => <Link to={`/yonetim/bayiler/${encodeURIComponent(r.dealerId)}`}>{r.companyTitle}</Link>,
    },
    { key: 'contact', label: 'Yetkili', sort: (r) => r.contactName, cell: (r) => r.contactName },
    { key: 'city', label: 'Şehir', sort: (r) => r.city, cell: (r) => r.city },
    {
      key: 'phone',
      label: 'İletişim',
      cell: (r) => {
        const wa = whatsappHref(r.phone)
        return (
          <span className="ui-contactlinks">
            <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} className="ui-linkbtn">
              {r.phone}
            </a>
            {wa && (
              <a href={wa} className="ui-linkbtn" target="_blank" rel="noopener noreferrer">
                WhatsApp<span className="visually-hidden"> (yeni sekmede açılır)</span>
              </a>
            )}
          </span>
        )
      },
    },
    {
      key: 'last',
      label: 'Son sipariş',
      sort: (r) => r.lastOrderAt ?? '',
      cell: (r) => (r.lastOrderAt ? formatDate(r.lastOrderAt) : 'Hiç sipariş vermedi'),
    },
    {
      key: 'days',
      label: 'Gün',
      num: true,
      sort: (r) => r.daysSinceLastOrder ?? Number.MAX_SAFE_INTEGER,
      cell: (r) => (r.daysSinceLastOrder === null ? '—' : formatInt(r.daysSinceLastOrder)),
    },
    {
      key: 'approved',
      label: 'Onay tarihi',
      sort: (r) => r.approvedAt,
      cell: (r) => formatDate(r.approvedAt),
    },
  ]
  return (
    <div className="ui-stack">
      <div className="ui-reportbar">
        <label className="ui-orderfilters__date">
          <span className="ui-label">Son siparişi şundan eski</span>
          <select className="ui-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DAY_CHOICES.map((d) => (
              <option key={d} value={d}>
                {d} gün
              </option>
            ))}
          </select>
        </label>
        <ExportButton
          name="inactive-dealers"
          params={{ days }}
          fallbackName={`rapor-siparis-vermeyen-bayiler.xlsx`}
        />
      </div>
      <p className="muted">Bu rapor seçilen döneme bağlı değildir; bugüne göre hesaplanır.</p>
      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Rapor alınamadı.</ErrorAlert>}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <Empty>Bu süredir sipariş vermeyen aktif bayi yok.</Empty>
        ) : (
          <ReportTable
            rows={state.data}
            cols={cols}
            rowKey={(r) => r.dealerId}
            defaultSort={{ key: 'days', dir: 'desc' }}
            caption="Sipariş vermeyen bayiler"
          />
        ))}
    </div>
  )
}
