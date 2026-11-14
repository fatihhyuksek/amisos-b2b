import { historyLabel } from '../ui/dealerStatus'
// GR-BAYI-002, GR-BAYI-006, GR-KVK-001, K-04, K-08, K-12, K-51: Admin bayi ayrıntısı ve durum işlemleri.
import { useState, type FormEvent } from 'react'
import {
  ApiError,
  activateDealer,
  approveDealer,
  deactivateDealer,
  fetchDealer,
  rejectDealer,
  resendInvitation,
  updateDealerTerms,
  type DealerDetail,
} from '../api'
import { Link } from '../Link'
import { Alert, Badge, Button, DealerStatusBadge, Field, Modal } from '../ui/components'
import { formatDateTime, formatPercent } from '../ui/format'
import { AdminLayout } from './AdminLayout'
import { useLoad } from './useLoad'

const INVALID_STATE = 'Bu işlem bayinin şu anki durumunda yapılamaz, sayfayı yenileyin.'
const CONSENT_LABELS: Record<string, string> = {
  kvkk: 'KVKK aydınlatma metni',
  terms: 'Kullanım koşulları',
  marketing: 'Pazarlama e-postası',
}

function actionError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.code === 'INVALID_STATE') return INVALID_STATE
    if (err.status === 404) return 'Bayi bulunamadı.'
  }
  if (err instanceof TypeError) return 'Sunucuya ulaşılamadı. Lütfen biraz sonra tekrar deneyin.'
  return 'İşlem tamamlanamadı. Lütfen daha sonra tekrar deneyin.'
}

/** Gerekçe isteyen diyalog (reddet / pasife al). Gerekçe en az 3 karakter (API sözleşmesi). */
function ReasonDialog({
  title,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  confirmLabel: string
  danger?: boolean
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = reason.trim()
    if (value.length < 3) {
      setError('Gerekçe zorunludur (en az 3 karakter).')
      return
    }
    setError(undefined)
    setBusy(true)
    try {
      await onConfirm(value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form className="ui-auth__form" onSubmit={submit} noValidate>
        <Field label="Gerekçe" htmlFor="reason" error={error}>
          <textarea
            id="reason"
            className="ui-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={error ? true : undefined}
            autoFocus
          />
        </Field>
        <div className="ui-modal__actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={busy}>
            {busy ? 'Kaydediliyor…' : confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Genel iskonto oranı (K-12): 0 < oran < 100, en fazla 2 ondalık; boş = standart liste fiyatı. */
function DiscountForm({
  dealer,
  onSaved,
}: {
  dealer: DealerDetail
  onSaved: (v: string | null) => Promise<void>
}) {
  const initial = dealer.generalDiscountPercent
    ? String(Number(dealer.generalDiscountPercent)).replace('.', ',')
    : ''
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const raw = value.trim().replace(',', '.')
    let payload: string | null = null
    if (raw !== '') {
      const n = Number(raw)
      if (!/^\d+(\.\d{1,2})?$/.test(raw) || !(n > 0 && n < 100)) {
        setError('0 ile 100 arasında, en fazla 2 ondalıklı bir oran girin.')
        return
      }
      payload = raw
    }
    setError(undefined)
    setBusy(true)
    try {
      await onSaved(payload)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="ui-inline-form" onSubmit={submit} noValidate>
      <Field
        label="Genel iskonto oranı (%)"
        htmlFor="discount"
        help="Boş bırakırsanız bayi standart liste fiyatını görür."
        error={error}
      >
        <input
          id="discount"
          className="ui-input"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          placeholder="Örn. 10"
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? 'Kaydediliyor…' : 'Kaydet'}
      </Button>
    </form>
  )
}

function Dl({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="ui-dl">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function DealerDetailPage({ id }: { id: string }) {
  const { state, reload } = useLoad<DealerDetail>((signal) => fetchDealer(id, signal), id)
  const [dialog, setDialog] = useState<'reject' | 'deactivate' | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  /** İşlemi çalıştırır, sonucu bildirir ve veriyi yeniler. Başarıda true döner. */
  async function run(fn: () => Promise<void>, success: string): Promise<boolean> {
    setBusy(true)
    setNotice(null)
    try {
      await fn()
      setNotice({ tone: 'info', text: success })
      reload()
      return true
    } catch (err) {
      setNotice({ tone: 'danger', text: actionError(err) })
      // Durum değişmiş olabilir; güncel veriyi göster.
      if (err instanceof ApiError && err.status === 409) reload()
      return false
    } finally {
      setBusy(false)
    }
  }

  async function withReason(
    fn: (reason: string) => Promise<void>,
    reason: string,
    success: string,
  ): Promise<void> {
    await run(() => fn(reason), success)
    setDialog(null)
  }

  return (
    <AdminLayout
      title={state.status === 'ready' ? state.data.companyTitle : 'Bayi'}
      actions={
        <Link
          to="/yonetim/bayiler"
          className="ui-button ui-button--secondary"
          style={{ textDecoration: 'none' }}
        >
          Bayi listesine dön
        </Link>
      }
    >
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {state.status === 'loading' && (
        <div
          className="ui-card ui-card__body"
          aria-busy="true"
          style={{ display: 'grid', gap: 'var(--space-3)' }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ui-skeleton" style={{ height: '2.5rem' }} />
          ))}
          <span className="visually-hidden" role="status">
            Yükleniyor…
          </span>
        </div>
      )}
      {state.status === 'error' && (
        <Alert tone="danger">
          {state.notFound ? 'Bayi bulunamadı.' : 'Bayi bilgileri alınamadı.'}{' '}
          {!state.notFound && (
            <button type="button" className="ui-linklike" onClick={reload}>
              Tekrar dene
            </button>
          )}
        </Alert>
      )}
      {state.status === 'ready' && (
        <Detail dealer={state.data} busy={busy} run={run} openDialog={setDialog} />
      )}
      {dialog === 'reject' && (
        <ReasonDialog
          title="Başvuruyu reddet"
          confirmLabel="Reddet"
          danger
          onClose={() => setDialog(null)}
          onConfirm={(r) => withReason((x) => rejectDealer(id, x), r, 'Başvuru reddedildi.')}
        />
      )}
      {dialog === 'deactivate' && (
        <ReasonDialog
          title="Bayiyi pasife al"
          confirmLabel="Pasife al"
          danger
          onClose={() => setDialog(null)}
          onConfirm={(r) => withReason((x) => deactivateDealer(id, x), r, 'Bayi pasife alındı.')}
        />
      )}
    </AdminLayout>
  )
}

function Detail({
  dealer: d,
  busy,
  run,
  openDialog,
}: {
  dealer: DealerDetail
  busy: boolean
  run: (fn: () => Promise<void>, success: string) => Promise<boolean>
  openDialog: (d: 'reject' | 'deactivate') => void
}) {
  const canResend = d.status === 'active' && !d.hasPassword
  return (
    <>
      <section className="ui-card ui-card__body ui-section" aria-labelledby="sec-info">
        <div className="ui-badges">
          <DealerStatusBadge status={d.status} />
          {d.approvalOverdue && <Badge tone="danger">Gecikmiş</Badge>}
        </div>
        <h2 id="sec-info">Bilgiler</h2>
        <Dl
          items={[
            ['Yetkili', d.contactName],
            ['E-posta', d.email],
            ['Telefon', d.phone],
            ['İl / ilçe', `${d.city} / ${d.district}`],
            ['Adres', d.address],
            ['Kaynak', d.source === 'application' ? 'Başvuru' : 'Davet'],
            ['Şifre', d.hasPassword ? 'Belirlendi' : 'Henüz belirlenmedi'],
            ['Kayıt tarihi', formatDateTime(d.createdAt)],
            ['E-posta doğrulama', d.emailVerifiedAt ? formatDateTime(d.emailVerifiedAt) : 'Doğrulanmadı'],
            ['Son inceleme', d.reviewedAt ? formatDateTime(d.reviewedAt) : '—'],
            ['Son giriş', d.lastLoginAt ? formatDateTime(d.lastLoginAt) : '—'],
            [
              'Genel iskonto',
              d.generalDiscountPercent
                ? formatPercent(d.generalDiscountPercent)
                : 'Yok (standart liste fiyatı)',
            ],
          ]}
        />
        {d.rejectionReason && (
          <Alert tone="warning">
            <strong>Ret gerekçesi:</strong> {d.rejectionReason}
          </Alert>
        )}
      </section>

      {(d.status === 'pending_approval' ||
        d.status === 'pending_email' ||
        d.status === 'active' ||
        d.status === 'passive') && (
        <section className="ui-card ui-card__body ui-section" aria-labelledby="sec-actions">
          <h2 id="sec-actions">İşlemler</h2>
          <div className="ui-actions">
            {d.status === 'pending_approval' && (
              <Button
                disabled={busy}
                onClick={() =>
                  run(() => approveDealer(d.id), 'Bayi onaylandı; şifre belirleme e-postası gönderildi.')
                }
              >
                Onayla
              </Button>
            )}
            {(d.status === 'pending_approval' || d.status === 'pending_email') && (
              <Button variant="danger" disabled={busy} onClick={() => openDialog('reject')}>
                Reddet
              </Button>
            )}
            {d.status === 'active' && (
              <Button variant="secondary" disabled={busy} onClick={() => openDialog('deactivate')}>
                Pasife al
              </Button>
            )}
            {d.status === 'passive' && (
              <Button
                disabled={busy}
                onClick={() => run(() => activateDealer(d.id), 'Bayi yeniden aktif edildi.')}
              >
                Aktif et
              </Button>
            )}
            {canResend && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => run(() => resendInvitation(d.id), 'Davet e-postası yeniden gönderildi.')}
              >
                Daveti yeniden gönder
              </Button>
            )}
          </div>
        </section>
      )}

      {d.status !== 'rejected' && (
        <section className="ui-card ui-card__body ui-section" aria-labelledby="sec-terms">
          <h2 id="sec-terms">İskonto</h2>
          {/* Kayıttan sonra veri yenilenir; anahtar formu yeni değerle sıfırlar. */}
          <DiscountForm
            key={d.generalDiscountPercent ?? 'none'}
            dealer={d}
            onSaved={async (v) => {
              await run(
                () => updateDealerTerms(d.id, v),
                v ? 'İskonto oranı kaydedildi.' : 'İskonto kaldırıldı.',
              )
            }}
          />
        </section>
      )}

      <section className="ui-card ui-card__body ui-section" aria-labelledby="sec-consents">
        <h2 id="sec-consents">Onaylar</h2>
        {d.consents.length === 0 ? (
          <p className="muted">Kayıtlı onay yok (davetle açılan bayi).</p>
        ) : (
          <ul className="ui-timeline">
            {d.consents.map((c, i) => (
              <li key={`${c.type}-${i}`}>
                <span>
                  <strong>{CONSENT_LABELS[c.type] ?? c.type}</strong> —{' '}
                  {c.granted ? 'Onaylandı' : 'Onaylanmadı'}
                </span>
                <span className="muted">
                  Metin sürümü {c.documentVersion} · {formatDateTime(c.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ui-card ui-card__body ui-section" aria-labelledby="sec-history">
        <h2 id="sec-history">Geçmiş</h2>
        {d.history.length === 0 ? (
          <p className="muted">Kayıt yok.</p>
        ) : (
          <ol className="ui-timeline">
            {d.history.map((h, i) => (
              <li key={`${h.createdAt}-${i}`}>
                <span>
                  <strong>{historyLabel(h.action)}</strong>
                  {h.actor ? ` · ${h.actor}` : ''}
                </span>
                {h.reason && <span>Gerekçe: {h.reason}</span>}
                <span className="muted">{formatDateTime(h.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}
