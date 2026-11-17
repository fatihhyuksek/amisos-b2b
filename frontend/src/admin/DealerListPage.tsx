// GR-BAYI-002, K-04: Admin bayi listesi. Durum filtresi, arama, sayfalama; masaüstünde tablo, mobilde kart.
import { useEffect, useState } from 'react'
import { ApiError, downloadDealersExcel, fetchDealers, type DealerList, type DealerStatus } from '../api'
import { Link } from '../Link'
import { replace, useRoute } from '../router'
import { Alert, Badge, Button, DealerStatusBadge, EmptyState } from '../ui/components'
import { DEALER_STATUS } from '../ui/dealerStatus'
import { Icon } from '../ui/Icon'
import { formatDate } from '../ui/format'
import { AdminLayout } from './AdminLayout'
import { saveBlob } from './download'
import { ListFooter, SkeletonRows } from './kit'
import { parsePageSize } from './kitUtils'
import { useLoad } from './useLoad'

const FILTERS: { value: DealerStatus | ''; label: string }[] = [
  { value: '', label: 'Tümü' },
  { value: 'pending_approval', label: 'Onay bekleyen' },
  { value: 'pending_email', label: 'E-posta bekleyen' },
  { value: 'active', label: 'Aktif' },
  { value: 'passive', label: 'Pasif' },
  { value: 'rejected', label: 'Reddedildi' },
]

function parseStatus(v: string | null): DealerStatus | '' {
  return v && v in DEALER_STATUS ? (v as DealerStatus) : ''
}

function listPath(status: string, q: string, page: number, size = 20): string {
  const qs = new URLSearchParams()
  if (status) qs.set('durum', status)
  if (q) qs.set('q', q)
  if (size !== 20) qs.set('adet', String(size))
  if (page > 1) qs.set('sayfa', String(page))
  const s = qs.toString()
  return `/yonetim/bayiler${s ? `?${s}` : ''}`
}

function Flags({ overdue }: { overdue: boolean }) {
  return overdue ? <Badge tone="danger">Gecikmiş</Badge> : null
}

export function DealerListPage() {
  const { query } = useRoute()
  const status = parseStatus(query.get('durum'))
  const q = query.get('q') ?? ''
  const page = Math.max(1, Number(query.get('sayfa')) || 1)
  const size = parsePageSize(query.get('adet'))
  const [search, setSearch] = useState(q)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  // Arama kutusu yazıldıkça 300 ms bekleyip adrese yazılır; sayfa 1'e döner.
  useEffect(() => {
    if (search.trim() === q) return
    const t = setTimeout(() => replace(listPath(status, search.trim(), 1, size)), 300)
    return () => clearTimeout(t)
  }, [search, q, status, size])

  const { state, reload } = useLoad<DealerList>(
    (signal) => fetchDealers({ status, q, page, pageSize: size }, signal),
    `${status}|${q}|${page}|${size}`,
  )

  async function exportExcel() {
    setExporting(true)
    setExportError('')
    try {
      const { blob, filename } = await downloadDealersExcel({ status, q })
      saveBlob(blob, filename ?? `bayiler-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err) {
      setExportError(
        err instanceof ApiError && err.code === 'EXPORT_TOO_LARGE'
          ? 'Çok fazla kayıt var (en fazla 20.000). Filtreyle daraltın.'
          : err instanceof ApiError && err.status === 404
            ? 'Excel dışa aktarma bu sunucuda henüz yok.'
            : 'Excel dosyası oluşturulamadı. Lütfen tekrar deneyin.',
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <AdminLayout
      title="Bayiler"
      actions={
        <>
          <Button variant="secondary" icon="download" disabled={exporting} onClick={exportExcel}>
            {exporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
          </Button>
          <Link className="ui-button ui-button--primary" to="/yonetim/bayiler/yeni">
            <Icon name="plus" />
            Bayi davet et
          </Link>
        </>
      }
    >
      {exportError && <Alert tone="danger">{exportError}</Alert>}
      <div className="adm-filters">
        <div className="ui-search adm-filters__search">
          <Icon name="search" />
          <input
            className="ui-input"
            type="search"
            aria-label="Bayi ara"
            placeholder="Firma, yetkili veya e-posta ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ui-chips" role="group" aria-label="Durum filtresi">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className="ui-chip"
              aria-pressed={status === f.value}
              onClick={() => replace(listPath(f.value, q, 1, size))}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && <SkeletonRows rows={8} />}
      {state.status === 'error' && (
        <Alert tone="danger">
          Bayiler alınamadı.{' '}
          <button type="button" className="ui-linklike" onClick={reload}>
            Tekrar dene
          </button>
        </Alert>
      )}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="adm-card">
          <EmptyState
            title="Bayi bulunamadı"
            action={
              status || q ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('')
                    replace('/yonetim/bayiler')
                  }}
                >
                  Filtreleri temizle
                </Button>
              ) : undefined
            }
          >
            {status || q ? 'Bu filtreyle eşleşen bayi yok.' : 'Henüz kayıtlı bayi yok.'}
          </EmptyState>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
          <div className="ui-table-wrap ui-table-wrap--cards">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Firma</th>
                  <th scope="col">Yetkili</th>
                  <th scope="col">İl</th>
                  <th scope="col">Durum</th>
                  <th scope="col">Kayıt tarihi</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link className="ui-rowlink" to={`/yonetim/bayiler/${encodeURIComponent(d.id)}`}>
                        {d.companyTitle}
                      </Link>
                    </td>
                    <td>{d.contactName}</td>
                    <td>{d.city}</td>
                    <td>
                      <div className="ui-badges">
                        <DealerStatusBadge status={d.status} />
                        <Flags overdue={d.approvalOverdue} />
                      </div>
                    </td>
                    <td className="num">{formatDate(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="ui-cards">
            {state.data.items.map((d) => (
              <li key={d.id} className="ui-card ui-rowcard">
                <Link to={`/yonetim/bayiler/${encodeURIComponent(d.id)}`}>{d.companyTitle}</Link>
                <span className="ui-rowcard__meta">
                  {d.contactName} · {d.city}
                </span>
                <div className="ui-badges">
                  <DealerStatusBadge status={d.status} />
                  <Flags overdue={d.approvalOverdue} />
                </div>
                <span className="ui-rowcard__meta">Kayıt: {formatDate(d.createdAt)}</span>
              </li>
            ))}
          </ul>
          <ListFooter
            total={state.data.total}
            unit="bayi"
            page={state.data.page}
            pageSize={state.data.pageSize}
            onPage={(p) => replace(listPath(status, q, p, size))}
            onPageSize={(n) => replace(listPath(status, q, 1, n))}
          />
        </>
      )}
    </AdminLayout>
  )
}
