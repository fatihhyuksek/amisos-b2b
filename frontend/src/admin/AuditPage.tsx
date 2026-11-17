// K-75: İşlem geçmişi (audit log). Filtreler adres satırında; sayfalama; her kayıt ayrıntı açılır.
import { useEffect, useState } from 'react'
import { fetchAudit, type AuditEntry, type Paged } from '../api'
import { replace, useRoute } from '../router'
import { Badge, Button, EmptyState } from '../ui/components'
import { ErrorAlert } from '../ui/catalog'
import { formatDateTime } from '../ui/format'
import { Icon } from '../ui/Icon'
import { useDebounced } from '../ui/useDebounced'
import { AdminLayout } from './AdminLayout'
import { ListFooter, SkeletonRows } from './kit'
import { parsePageSize } from './kitUtils'
import { useLoad } from './useLoad'

interface Filters {
  q: string
  tur: string
  kayit: string
  from: string
  to: string
}

function listPath(f: Filters, page: number, size = 20): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v)
  if (size !== 20) qs.set('adet', String(size))
  if (page > 1) qs.set('sayfa', String(page))
  const s = qs.toString()
  return `/yonetim/islem-gecmisi${s ? `?${s}` : ''}`
}

const ENTITY_TYPES: [string, string][] = [
  ['dealers', 'Bayi'],
  ['orders', 'Sipariş'],
  ['products', 'Ürün'],
  ['product_groups', 'Ürün grubu'],
  ['banners', 'Kampanya görseli'],
  ['site_settings', 'Site ayarları'],
  ['admin_users', 'Admin hesabı'],
  ['media', 'Görsel'],
]

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
  const size = parsePageSize(query.get('adet'))
  const [search, setSearch] = useState(f.q)
  const debounced = useDebounced(search.trim())
  useEffect(() => {
    if (debounced !== f.q) replace(listPath({ ...f, q: debounced }, 1, size))
    // yalnızca arama metni değişince adrese yazılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const { state, reload } = useLoad<Paged<AuditEntry>>(
    (signal) =>
      fetchAudit(
        {
          page,
          pageSize: size,
          q: f.q,
          actorType: f.tur,
          entityType: f.kayit,
          from: f.from,
          to: f.to,
        },
        signal,
      ),
    `${f.q}|${f.tur}|${f.kayit}|${f.from}|${f.to}|${page}|${size}`,
  )
  const go = (patch: Partial<Filters>) => replace(listPath({ ...f, ...patch }, 1, size))
  const hasFilter = Object.values(f).some(Boolean)

  return (
    <AdminLayout title="İşlem geçmişi">
      <p className="muted">
        Admin, bayi ve sistem tarafından yapılan değişikliklerin kaydı. Kayıtlar silinmez ve değiştirilemez.
      </p>
      <div className="adm-filters">
        <div className="ui-search adm-filters__search">
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
        <select
          className="ui-select"
          aria-label="Kayıt türü"
          value={f.kayit}
          onChange={(e) => go({ kayit: e.target.value })}
        >
          <option value="">Kayıt türü: tümü</option>
          {ENTITY_TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <div className="adm-filters__dates">
          <input
            className="ui-input"
            type="date"
            aria-label="Başlangıç tarihi"
            value={f.from}
            max={f.to || undefined}
            onChange={(e) => go({ from: e.target.value })}
          />
          <span aria-hidden="true">–</span>
          <input
            className="ui-input"
            type="date"
            aria-label="Bitiş tarihi"
            value={f.to}
            min={f.from || undefined}
            onChange={(e) => go({ to: e.target.value })}
          />
          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                replace('/yonetim/islem-gecmisi')
              }}
            >
              Temizle
            </Button>
          )}
        </div>
      </div>
      {state.status === 'loading' && <SkeletonRows rows={8} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>İşlem geçmişi alınamadı.</ErrorAlert>}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="adm-card">
          <EmptyState title="Kayıt bulunamadı">
            {hasFilter ? 'Bu filtreyle eşleşen işlem yok.' : 'Henüz kayıtlı işlem yok.'}
          </EmptyState>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
          <ul className="ui-audit">
            {state.data.items.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </ul>
          <ListFooter
            total={state.data.total}
            unit="kayıt"
            page={state.data.page}
            pageSize={state.data.pageSize}
            onPage={(p) => replace(listPath(f, p, size))}
            onPageSize={(n) => replace(listPath(f, 1, n))}
          />
        </>
      )}
    </AdminLayout>
  )
}
