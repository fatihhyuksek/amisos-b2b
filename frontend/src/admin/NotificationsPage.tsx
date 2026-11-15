// GR-BLD-001: Admin e-posta bildirimleri (/yonetim/bildirimler). Başarısız e-postalar yeniden denenebilir.
import { useState } from 'react'
import {
  ApiError,
  fetchNotifications,
  retryNotification,
  type AdminNotification,
  type NotificationKind,
  type NotificationStatus,
  type Paged,
} from '../api'
import { replace, useRoute } from '../router'
import { Alert, Badge, Button, EmptyState, Pagination } from '../ui/components'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { formatDateTime, formatInt } from '../ui/format'
import { networkMessage } from '../ui/networkMessage'
import { AdminLayout } from './AdminLayout'
import { notifyNotificationsChanged } from './useFailedNotifications'
import { useLoad } from './useLoad'

const PAGE_SIZE = 20

const KIND: Record<NotificationKind, string> = {
  order_confirmation: 'Sipariş bildirimi',
  new_order_team: 'Sipariş bildirimi',
  new_application: 'Yeni başvuru',
  invitation: 'Davet',
  rejection: 'Ret',
  password_reset: 'Şifre sıfırlama',
  email_verification: 'E-posta doğrulama',
  approval_reminder: 'Onay hatırlatma',
}

const STATUS_TABS: { value: NotificationStatus; label: string }[] = [
  { value: 'failed', label: 'Başarısız' },
  { value: 'pending', label: 'Bekleyen' },
  { value: 'sent', label: 'Gönderildi' },
]

const STATUS_BADGE: Record<NotificationStatus, { label: string; tone: 'danger' | 'warning' | 'success' }> = {
  failed: { label: 'Başarısız', tone: 'danger' },
  pending: { label: 'Bekliyor', tone: 'warning' },
  sent: { label: 'Gönderildi', tone: 'success' },
}

function shorten(text: string | null, max = 80): string {
  if (!text) return '—'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function NotificationsPage() {
  const { query } = useRoute()
  const rawStatus = query.get('durum')
  const status: NotificationStatus = rawStatus === 'pending' || rawStatus === 'sent' ? rawStatus : 'failed'
  const page = Math.max(1, Number(query.get('sayfa')) || 1)
  const { state, reload } = useLoad<Paged<AdminNotification>>(
    (s) => fetchNotifications({ status, page, pageSize: PAGE_SIZE }, s),
    `${status}|${page}`,
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  const path = (s: NotificationStatus, p: number) => {
    const qs = new URLSearchParams()
    if (s !== 'failed') qs.set('durum', s)
    if (p > 1) qs.set('sayfa', String(p))
    const t = qs.toString()
    return t ? `/yonetim/bildirimler?${t}` : '/yonetim/bildirimler'
  }

  async function retry(n: AdminNotification) {
    setBusyId(n.id)
    setNotice(null)
    try {
      const r = await retryNotification(n.id)
      setNotice({
        tone: r.status === 'sent' ? 'info' : 'danger',
        text:
          r.status === 'sent'
            ? 'E-posta gönderildi.'
            : 'Yeniden deneme yapıldı ancak e-posta henüz gönderilemedi.',
      })
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      setNotice({
        tone: 'danger',
        text:
          code === 'ALREADY_SENT'
            ? 'Bu e-posta zaten gönderilmiş.'
            : code === 'PAYLOAD_EXPIRED'
              ? 'Bağlantısının süresi dolduğu için bu e-posta yeniden gönderilemez. İşlemi (davet, şifre sıfırlama vb.) yeniden başlatın.'
              : err instanceof ApiError && err.status === 404
                ? 'Bildirim bulunamadı.'
                : networkMessage(err, 'Yeniden denenemedi. Lütfen tekrar deneyin.'),
      })
    } finally {
      setBusyId(null)
      notifyNotificationsChanged()
      reload()
    }
  }

  const retryButton = (n: AdminNotification) =>
    n.status === 'sent' ? null : (
      <Button
        variant="secondary"
        size="sm"
        className="ui-button--touch"
        disabled={busyId === n.id}
        onClick={() => retry(n)}
        aria-label={`${KIND[n.kind]} (${n.recipient}): yeniden dene`}
      >
        {busyId === n.id ? 'Deneniyor…' : 'Yeniden dene'}
      </Button>
    )

  return (
    <AdminLayout title="Bildirimler">
      <p className="muted">
        Sistemin gönderdiği e-postalar. Başarısız olanlar otomatik yeniden denenir; buradan elle de
        deneyebilirsiniz.
      </p>
      <div className="ui-chips ui-chips--wrap" role="group" aria-label="Durum">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            className="ui-chip"
            aria-pressed={status === t.value}
            onClick={() => {
              setNotice(null)
              replace(path(t.value, 1))
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="status" aria-live="polite">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      </div>

      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Bildirimler alınamadı.</ErrorAlert>}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="ui-card">
          <EmptyState title={status === 'failed' ? 'Başarısız e-posta yok' : 'Kayıt yok'}>
            {status === 'failed' ? 'Tüm e-postalar gönderilmiş görünüyor.' : 'Bu durumda bildirim yok.'}
          </EmptyState>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
          <p className="muted" aria-live="polite">
            {formatInt(state.data.total)} bildirim
          </p>
          <div className="ui-table-wrap ui-table-wrap--cards">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Tür</th>
                  <th scope="col">Alıcı</th>
                  <th scope="col">Durum</th>
                  <th scope="col" className="num">
                    Deneme
                  </th>
                  <th scope="col">Son hata</th>
                  <th scope="col">Oluşturma</th>
                  <th scope="col">
                    <span className="visually-hidden">İşlem</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((n) => (
                  <tr key={n.id}>
                    <td>{KIND[n.kind] ?? n.kind}</td>
                    <td className="wrap">{n.recipient}</td>
                    <td>
                      <Badge tone={STATUS_BADGE[n.status].tone}>{STATUS_BADGE[n.status].label}</Badge>
                    </td>
                    <td className="num">{n.attempts}</td>
                    <td className="wrap" title={n.lastError ?? undefined}>
                      {shorten(n.lastError)}
                    </td>
                    <td>{formatDateTime(n.createdAt)}</td>
                    <td>{retryButton(n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="ui-cards">
            {state.data.items.map((n) => (
              <li key={n.id} className="ui-card ui-rowcard">
                <div className="ui-badges">
                  <strong>{KIND[n.kind] ?? n.kind}</strong>
                  <Badge tone={STATUS_BADGE[n.status].tone}>{STATUS_BADGE[n.status].label}</Badge>
                </div>
                <span className="ui-rowcard__meta">{n.recipient}</span>
                <span className="ui-rowcard__meta">
                  {n.attempts} deneme · {formatDateTime(n.createdAt)}
                </span>
                {n.lastError && <span className="ui-rowcard__meta">{shorten(n.lastError, 120)}</span>}
                <div>{retryButton(n)}</div>
              </li>
            ))}
          </ul>
          <Pagination
            page={state.data.page}
            pageSize={state.data.pageSize}
            total={state.data.total}
            onChange={(p) => replace(path(status, p))}
          />
        </>
      )}
    </AdminLayout>
  )
}
