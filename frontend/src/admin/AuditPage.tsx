// K-75: İşlem geçmişi (audit log). Filtreler adres satırında; sayfalama; her kayıt ayrıntı açılır.
import { useEffect, useState } from 'react'
import { fetchAudit, type AuditEntry, type Paged } from '../api'
import { replace, useRoute } from '../router'
import { Badge, Button, EmptyState, Pagination } from '../ui/components'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { formatDateTime, formatInt } from '../ui/format'
import { Icon } from '../ui/Icon'
import { useDebounced } from '../ui/useDebounced'
import { AdminLayout } from './AdminLayout'
import { useLoad } from './useLoad'

const PAGE_SIZE = 25

interface Filters {
  q: string
  tur: string
  kayit: string
  from: string
  to: string
}

function listPath(f: Filters, page: number): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v)
  if (page > 1) qs.set('sayfa', String(page))
  const s = qs.toString()
  return `/yonetim/islem-gecmisi${s ? `?${s}` : ''}`
}

const ACTOR_LABEL: Record<string, string> = { admin: 'Admin', dealer: 'Bayi', system: 'Sistem' }
const ACTOR_TONE = { admin: 'info', dealer: 'success', system: 'neutral' } as const

function dataText(data: unknown): string | null {
  if (data === null || data === undefined) return null
  if (typeof data === 'object' && Object.keys(data as object).length === 0) return null
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return null
  }
}

function Entry({ e }: { e: AuditEntry }) {
  const text = dataText(e.data)
  const actorName = e.actor.name ?? (e.actor.type === 'system' ? 'Sistem' : 'Bilinmiyor')
  return (
    <li>
      <details className="ui-audit__row">
        <summary>
          <span className="ui-audit__time num">{formatDateTime(e.createdAt)}</span>
          <span className="ui-audit__action">
            <strong>{e.actionLabel}</strong>
            {e.entityLabel && <span className="muted"> · {e.entityLabel}</span>}
          </span>
          <span className="ui-audit__actor">
            <Badge tone={ACTOR_TONE[e.actor.type] ?? 'neutral'}>
              {ACTOR_LABEL[e.actor.type] ?? e.actor.type}
            </Badge>
            <span>{actorName}</span>
          </span>
          <Icon name="chevronDown" />
        </summary>
        <dl className="ui-dl ui-audit__detail">
          <div>
            <dt>Eylem kodu</dt>
            <dd className="num">{e.action}</dd>
          </div>
          <div>
            <dt>Kayıt türü</dt>
            <dd>{e.entityType}</dd>
          </div>
          {e.entityId && (
            <div>
              <dt>Kayıt kimliği</dt>
              <dd className="num">{e.entityId}</dd>
            </div>
          )}
          {e.reason && (
            <div>
              <dt>Gerekçe</dt>
              <dd className="ui-prewrap">{e.reason}</dd>
            </div>
          )}
        </dl>
        {text && (
          <pre className="ui-audit__data" tabIndex={0} aria-label="Ayrıntı verisi">
            {text}
          </pre>
        )}
      </details>
    </li>
  )
}

export function AuditPage() {
  const { query } = useRoute()
  const f: Filters = {
    q: query.get('q') ?? '',
    tur: query.get('tur') ?? '',
    kayit: query.get('kayit') ?? '',
    from: query.get('from') ?? '',
    to: query.get('to') ?? '',
  }
  const page = Math.max(1, Number(query.get('sayfa')) || 1)
  const [search, setSearch] = useState(f.q)
  const debounced = useDebounced(search.trim())
  useEffect(() => {
    if (debounced !== f.q) replace(listPath({ ...f, q: debounced }, 1))
    // yalnızca arama metni değişince adrese yazılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const { state, reload } = useLoad<Paged<AuditEntry>>(
    (signal) =>
      fetchAudit(
        {
          page,
          pageSize: PAGE_SIZE,
          q: f.q,
          actorType: f.tur,
          entityType: f.kayit,
          from: f.from,
          to: f.to,
        },
        signal,
      ),
    `${f.q}|${f.tur}|${f.kayit}|${f.from}|${f.to}|${page}`,
  )
  const go = (patch: Partial<Filters>) => replace(listPath({ ...f, ...patch }, 1))
  const hasFilter = Object.values(f).some(Boolean)

  return (
    <AdminLayout title="İşlem geçmişi">
      <p className="muted">
        Admin, bayi ve sistem tarafından yapılan değişikliklerin kaydı. Kayıtlar silinmez ve değiştirilemez.
      </p>
      <div className="ui-toolbar__row">
        <div className="ui-search">
          <Icon name="search" />
          <input
            className="ui-input"
            type="search"
            aria-label="Eylem veya kayıt kimliği ara"
            placeholder="Eylem kodu veya kayıt kimliği"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="ui-select"
          aria-label="İşlemi yapan"
          value={f.tur}
          onChange={(e) => go({ tur: e.target.value })}
        >
          <option value="">İşlemi yapan: tümü</option>
          <option value="admin">Admin</option>
          <option value="dealer">Bayi</option>
          <option value="system">Sistem</option>
        </select>
        <div className="ui-field">
          <input
            className="ui-input"
            aria-label="Kayıt türü"
            list="audit-entity-types"
            placeholder="Kayıt türü (ör. dealer)"
            value={f.kayit}
            onChange={(e) => go({ kayit: e.target.value.trim() })}
          />
          <datalist id="audit-entity-types">
            <option value="dealer">Bayi</option>
            <option value="order">Sipariş</option>
            <option value="product">Ürün</option>
            <option value="product_group">Ürün grubu</option>
            <option value="banner">Kampanya görseli</option>
            <option value="site">Site ayarları</option>
          </datalist>
        </div>
        <label className="ui-field ui-datefield">
          <span className="ui-help">Başlangıç</span>
          <input
            className="ui-input"
            type="date"
            value={f.from}
            max={f.to || undefined}
            onChange={(e) => go({ from: e.target.value })}
          />
        </label>
        <label className="ui-field ui-datefield">
          <span className="ui-help">Bitiş</span>
          <input
            className="ui-input"
            type="date"
            value={f.to}
            min={f.from || undefined}
            onChange={(e) => go({ to: e.target.value })}
          />
        </label>
      </div>
      {hasFilter && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              replace('/yonetim/islem-gecmisi')
            }}
          >
            Filtreleri temizle
          </Button>
        </div>
      )}
      {state.status === 'loading' && <LoadingCard rows={6} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>İşlem geçmişi alınamadı.</ErrorAlert>}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="ui-card">
          <EmptyState title="Kayıt bulunamadı">
            {hasFilter ? 'Bu filtreyle eşleşen işlem yok.' : 'Henüz kayıtlı işlem yok.'}
          </EmptyState>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
          <p className="muted" aria-live="polite">
            {formatInt(state.data.total)} kayıt
          </p>
          <ul className="ui-audit">
            {state.data.items.map((e) => (
              <Entry key={e.id} e={e} />
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
