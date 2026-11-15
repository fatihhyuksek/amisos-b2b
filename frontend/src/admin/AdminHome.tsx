// GR-BAYI-002, K-04: Admin ana sayfası; bayi durum özeti. Kartlar ilgili filtreli listeye gider.
import { fetchDealerSummary, type DealerCounts, type DealerStatus } from '../api'
import { Link } from '../Link'
import { Alert, Badge } from '../ui/components'
import { formatInt } from '../ui/format'
import { AdminLayout } from './AdminLayout'
import { useFailedNotificationCount } from './useFailedNotifications'
import { useLoad } from './useLoad'

function Stat({ to, label, value, note }: { to: string; label: string; value: number; note?: string }) {
  return (
    <Link to={to} className="ui-card ui-stat">
      <span className="ui-stat__label">{label}</span>
      <span className="ui-stat__value">{formatInt(value)}</span>
      {note && (
        <span>
          <Badge tone="warning">{note}</Badge>
        </span>
      )}
    </Link>
  )
}

const list = (s: DealerStatus) => `/yonetim/bayiler?durum=${s}`

export function AdminHome() {
  const { state, reload } = useLoad<DealerCounts>((signal) => fetchDealerSummary(signal), 'summary')
  const failed = useFailedNotificationCount()
  return (
    <AdminLayout title="Ana sayfa">
      {failed > 0 && (
        <Alert tone="danger">
          <strong>{formatInt(failed)} e-posta gönderilemedi.</strong>{' '}
          <Link to="/yonetim/bildirimler">Bildirimleri incele</Link>
        </Alert>
      )}
      {state.status === 'loading' && (
        <div className="ui-stats" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ui-card ui-stat">
              <div className="ui-skeleton" style={{ height: '1rem', width: '50%' }} />
              <div className="ui-skeleton" style={{ height: '2rem', width: '30%' }} />
            </div>
          ))}
          <span className="visually-hidden" role="status">
            Yükleniyor…
          </span>
        </div>
      )}
      {state.status === 'error' && (
        <Alert tone="danger">
          Özet alınamadı.{' '}
          <button type="button" className="ui-linklike" onClick={reload}>
            Tekrar dene
          </button>
        </Alert>
      )}
      {state.status === 'ready' && (
        <div className="ui-stats">
          <Stat
            to={list('pending_approval')}
            label="Onay bekleyen"
            value={state.data.pendingApproval}
            note={state.data.overdue > 0 ? `${formatInt(state.data.overdue)} gecikmiş` : undefined}
          />
          <Stat
            to={list('pending_email')}
            label="E-posta doğrulaması bekleyen"
            value={state.data.pendingEmail}
          />
          <Stat to={list('active')} label="Aktif" value={state.data.active} />
          <Stat to={list('passive')} label="Pasif" value={state.data.passive} />
        </div>
      )}
    </AdminLayout>
  )
}
