// GR-BAYI-002, K-04: Admin bayi listesi. Durum filtresi, arama, sayfalama; masaüstünde tablo, mobilde kart.
import { useEffect, useState } from 'react'
import { fetchDealers, type DealerList, type DealerStatus } from '../api'
import { Link } from '../Link'
import { replace, useRoute } from '../router'
import { Alert, Badge, Button, DealerStatusBadge, EmptyState, Pagination } from '../ui/components'
import { DEALER_STATUS } from '../ui/dealerStatus'
import { Icon } from '../ui/Icon'
import { formatDate, formatInt } from '../ui/format'
import { AdminLayout } from './AdminLayout'
import { useLoad } from './useLoad'

const PAGE_SIZE = 20

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

function listPath(status: string, q: string, page: number): string {
  const qs = new URLSearchParams()
  if (status) qs.set('durum', status)
  if (q) qs.set('q', q)
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
  const [search, setSearch] = useState(q)

  // Arama kutusu yazıldıkça 300 ms bekleyip adrese yazılır; sayfa 1'e döner.
  useEffect(() => {
    if (search.trim() === q) return
    const t = setTimeout(() => replace(listPath(status, search.trim(), 1)), 300)
    return () => clearTimeout(t)
  }, [search, q, status])

  const { state, reload } = useLoad<DealerList>(
    (signal) => fetchDealers({ status, q, page, pageSize: PAGE_SIZE }, signal),
    `${status}|${q}|${page}`,
  )

  return (
    <AdminLayout
      title="Bayiler"
      actions={
        <a
          className="ui-button ui-button--primary"
          href="#/yonetim/bayiler/yeni"
          style={{ textDecoration: 'none' }}
        >
          <Icon name="plus" />
          Bayi davet et
        </a>
      }
    >
      <div className="ui-toolbar">
        <div className="ui-search">
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
        <div className="ui-chips ui-chips--wrap" role="group" aria-label="Durum filtresi">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className="ui-chip"
              aria-pressed={status === f.value}
              onClick={() => replace(listPath(f.value, q, 1))}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && (
        <div
          className="ui-card ui-card__body"
          aria-busy="true"
          style={{ display: 'grid', gap: 'var(--space-3)' }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="ui-skeleton" style={{ height: '2.5rem' }} />
          ))}
          <span className="visually-hidden" role="status">
            Yükleniyor…
          </span>
        </div>
      )}
      {state.status === 'error' && (
        <Alert tone="danger">
          Bayiler alınamadı.{' '}
          <button type="button" className="ui-linklike" onClick={reload}>
            Tekrar dene
          </button>
        </Alert>
      )}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="ui-card">
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
          <p className="muted" aria-live="polite">
            {formatInt(state.data.total)} bayi
          </p>
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
                      <Link to={`/yonetim/bayiler/${encodeURIComponent(d.id)}`}>{d.companyTitle}</Link>
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
          <Pagination
            page={state.data.page}
            pageSize={state.data.pageSize}
            total={state.data.total}
            onChange={(p) => replace(listPath(status, q, p))}
          />
        </>
      )}
    </AdminLayout>
  )
}
