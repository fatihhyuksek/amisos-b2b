// GR-BLD-001, K-83: Admin bildirimleri (/yonetim/bildirimler). Sekmeler: Etkinlikler (feed) ve E-posta gönderimleri
// (outbox; başarısız e-postalar yeniden denenebilir).
import { useState } from 'react'
import { Link } from '../Link'
import { Icon, type IconName } from '../ui/Icon'
import { timeAgo } from './time'
import { useNotificationFeed } from './useFeed'
import { TabPanel, Tabs } from './kit'
import {
  ApiError,
  fetchNotifications,
  retryNotification,
  type AdminNotification,
  type FeedItem,
  type NotificationKind,
  type NotificationStatus,
  type Paged,
} from '../api'
import { replace, useRoute } from '../router'
import { Alert, Badge, Button, EmptyState } from '../ui/components'
import { ListFooter } from './kit'
import { parsePageSize } from './kitUtils'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { formatDateTime } from '../ui/format'
import { networkMessage } from '../ui/networkMessage'
import { AdminLayout } from './AdminLayout'
import { notifyNotificationsChanged } from './useFailedNotifications'
import { useLoad } from './useLoad'

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

function EmailTab() {
  const { query } = useRoute()
  const rawStatus = query.get('durum')
  const status: NotificationStatus = rawStatus === 'pending' || rawStatus === 'sent' ? rawStatus : 'failed'
  const page = Math.max(1, Number(query.get('sayfa')) || 1)
  const size = parsePageSize(query.get('adet'))
  const { state, reload } = useLoad<Paged<AdminNotification>>(
    (s) => fetchNotifications({ status, page, pageSize: size }, s),
    `${status}|${page}|${size}`,
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  const path = (s: NotificationStatus, p: number, n = size) => {
    const qs = new URLSearchParams()
    qs.set('sekme', 'eposta')
    if (s !== 'failed') qs.set('durum', s)
    if (n !== 20) qs.set('adet', String(n))
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
    <>
      <p className="muted">
        Sistemin gönderdiği e-postalar. Başarısız olanlar otomatik yeniden denenir; buradan elle de
        deneyebilirsiniz.
      </p>
      <div className="ui-chips" role="group" aria-label="Durum">
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
          <EmptyState icon="inbox" title={status === 'failed' ? 'Başarısız e-posta yok' : 'Kayıt yok'}>
            {status === 'failed' ? 'Tüm e-postalar gönderilmiş görünüyor.' : 'Bu durumda bildirim yok.'}
          </EmptyState>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
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
          <ListFooter
            total={state.data.total}
            unit="bildirim"
            page={state.data.page}
            pageSize={state.data.pageSize}
            onPage={(p) => replace(path(status, p))}
            onPageSize={(n) => replace(path(status, 1, n))}
          />
        </>
      )}
    </>
  )
}

// ---------- Etkinlikler (feed) ----------
const TYPE_META: Record<FeedItem['type'], { label: string; icon: IconName }> = {
  order_submitted: { label: 'Yeni sipariş', icon: 'orders' },
  application_verified: { label: 'Bayi başvurusu', icon: 'users' },
  order_status_changed: { label: 'Sipariş durumu', icon: 'truck' },
  notification_failed: { label: 'E-posta hatası', icon: 'warning' },
}

function EventsTab() {
  const feed = useNotificationFeed()
  const [type, setType] = useState<FeedItem['type'] | 'all'>('all')
  const shown = type === 'all' ? feed.items : feed.items.filter((i) => i.type === type)
  // Okunmamışlar listenin en yenileridir (sunucu `unread` sayısını verir).
  const unreadIds = new Set(feed.items.slice(0, feed.unread).map((i) => i.id))
  return (
    <>
      <div className="adm-evhead">
        <p className="muted">
          Son 30 günün gelişmeleri: yeni siparişler, başvurular ve durum değişiklikleri.
          {feed.unread > 0 && (
            <>
              {' '}
              <strong className="num">{feed.unread}</strong> okunmamış.
            </>
          )}
        </p>
        <Button
          variant="secondary"
          size="sm"
          icon="check"
          disabled={feed.unread === 0}
          onClick={() => void feed.markAllRead()}
        >
          Tümünü okundu say
        </Button>
      </div>
      <div className="ui-chips" role="group" aria-label="Tür">
        {(['all', ...Object.keys(TYPE_META)] as (FeedItem['type'] | 'all')[]).map((t) => (
          <button
            key={t}
            type="button"
            className="ui-chip"
            aria-pressed={type === t}
            onClick={() => setType(t)}
          >
            {t === 'all' ? 'Tümü' : TYPE_META[t].label}
          </button>
        ))}
      </div>
      {!feed.loaded && <LoadingCard rows={4} />}
      {feed.loaded && feed.error && feed.items.length === 0 && (
        <ErrorAlert onRetry={feed.reload}>Etkinlikler alınamadı.</ErrorAlert>
      )}
      {feed.loaded && !feed.error && shown.length === 0 && (
        <div className="ui-card">
          <EmptyState icon="inbox" title="Etkinlik yok">
            {type === 'all'
              ? 'Son 30 günde yeni bir gelişme yok.'
              : 'Bu türde etkinlik yok. Başka bir tür seçin.'}
          </EmptyState>
        </div>
      )}
      {shown.length > 0 && (
        <ul className="ui-card adm-evlist">
          {shown.map((it) => {
            const unread = unreadIds.has(it.id)
            return (
              <li key={it.id}>
                <Link to={it.link} className="adm-evitem" data-unread={unread || undefined}>
                  <span className="adm-evitem__icon">
                    <Icon name={TYPE_META[it.type]?.icon ?? 'info'} />
                  </span>
                  <span className="adm-evitem__text">
                    <span className="adm-evitem__title">
                      {unread && <span className="visually-hidden">Okunmamış: </span>}
                      {it.title}
                    </span>
                    <span className="adm-evitem__body">{it.body}</span>
                  </span>
                  <span className="adm-evitem__meta">
                    <Badge tone="neutral">{TYPE_META[it.type]?.label ?? 'Etkinlik'}</Badge>
                    <time dateTime={it.createdAt}>{timeAgo(it.createdAt)}</time>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export function NotificationsPage() {
  const { query } = useRoute()
  const feed = useNotificationFeed()
  // Eski adresler (?durum=...) e-posta sekmesine düşer.
  const tab = query.get('sekme') === 'eposta' || query.has('durum') ? 'eposta' : 'etkinlikler'
  return (
    <AdminLayout title="Bildirimler">
      <Tabs
        idBase="bildirim"
        label="Bildirim türü"
        value={tab}
        onChange={(v) =>
          replace(v === 'eposta' ? '/yonetim/bildirimler?sekme=eposta' : '/yonetim/bildirimler')
        }
        tabs={[
          { value: 'etkinlikler', label: 'Etkinlikler', count: feed.unread || undefined },
          { value: 'eposta', label: 'E-posta gönderimleri' },
        ]}
      />
      <TabPanel idBase="bildirim" value={tab}>
        {tab === 'eposta' ? <EmailTab /> : <EventsTab />}
      </TabPanel>
    </AdminLayout>
  )
}
