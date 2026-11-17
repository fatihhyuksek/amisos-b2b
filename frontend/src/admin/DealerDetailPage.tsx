// GR-BAYI-002, GR-BAYI-006, GR-KVK-001, K-04, K-08, K-12, K-51, K-75, K-78: Admin bayi ayrıntısı (sekmeli).
import { useState, type FormEvent } from 'react'
import {
  ApiError,
  activateDealer,
  approveDealer,
  deactivateDealer,
  fetchAdminOrders,
  fetchDealer,
  fetchReportList,
  rejectDealer,
  resendInvitation,
  updateDealerTerms,
  type AdminOrderListItem,
  type DealerDetail,
  type Paged,
  type ReportDealerRow,
} from '../api'
import { Link } from '../Link'
import { replace, useRoute } from '../router'
import { Alert, Badge, Button, DealerStatusBadge, Field, Modal, OrderStatusBadge } from '../ui/components'
import { historyLabel } from '../ui/dealerStatus'
import { formatDateTime, formatInt, formatPercent, formatTRY } from '../ui/format'
import { Icon } from '../ui/Icon'
import { AdminLayout } from './AdminLayout'
import { DealerEditDialog } from './DealerEditDialog'
import { DealerNotes } from './DealerNotes'
import { GroupDiscounts } from './GroupDiscounts'
import { Panel, SkeletonRows, TabPanel, Tabs } from './kit'
import { whatsappHref } from './phone'
import { todayIstanbul } from './reports/periods'
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

/**
 * İşlem diyaloğu (onayla / reddet / pasife al). `reasonRequired` ise gerekçe (en az 3 karakter) istenir.
 * onConfirm hata iletisi (metin) döndürürse diyalog açık kalır, gerekçe korunur; istek sürerken kapanmaz.
 */
function ActionDialog({
  title,
  info,
  reasonRequired,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  info?: string
  reasonRequired: boolean
  confirmLabel: string
  danger?: boolean
  onConfirm: (reason: string) => Promise<string | null>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = reason.trim()
    if (reasonRequired && value.length < 3) {
      setError('Gerekçe zorunludur (en az 3 karakter).')
      return
    }
    setError(undefined)
    setServerError(null)
    setBusy(true)
    try {
      setServerError(await onConfirm(value))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} dismissable={!busy}>
      <form className="ui-auth__form" onSubmit={submit} noValidate>
        {info && <p>{info}</p>}
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        {reasonRequired && (
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
        )}
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

type TabId = 'genel' | 'siparisler' | 'iskonto' | 'notlar' | 'gecmis'
const TAB_IDS: TabId[] = ['genel', 'siparisler', 'iskonto', 'notlar', 'gecmis']

function Dl({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="adm-kv">
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
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'deactivate' | 'edit' | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  const d = state.status === 'ready' ? state.data : null

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

  /** Diyalog işlemi: başarıda kapanır; 409'da durum değiştiği için kapanıp sayfada bildirir; diğer hatada açık kalır. */
  async function inDialog(fn: () => Promise<void>, success: string): Promise<string | null> {
    setNotice(null)
    try {
      await fn()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNotice({ tone: 'danger', text: actionError(err) })
        reload()
        setDialog(null)
        return null
      }
      return actionError(err)
    }
    setNotice({ tone: 'info', text: success })
    reload()
    setDialog(null)
    return null
  }

  const wa = d ? whatsappHref(d.phone) : null
  const canResend = !!d && d.status === 'active' && !d.hasPassword

  return (
    <AdminLayout
      title={d ? d.companyTitle : 'Bayi'}
      meta={
        d && (
          <span className="adm-hero">
            <DealerStatusBadge status={d.status} />
            {d.approvalOverdue && <Badge tone="danger">Gecikmiş</Badge>}
          </span>
        )
      }
      actions={
        d && (
          <>
            {d.status === 'pending_approval' && (
              <Button disabled={busy} onClick={() => setDialog('approve')}>
                Onayla
              </Button>
            )}
            {(d.status === 'pending_approval' || d.status === 'pending_email') && (
              <Button variant="danger" disabled={busy} onClick={() => setDialog('reject')}>
                Reddet
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
                onClick={() => run(() => resendInvitation(d.id), 'Davet e-postası yeniden gönderiliyor.')}
              >
                Daveti yeniden gönder
              </Button>
            )}
            <Button variant="secondary" icon="edit" disabled={busy} onClick={() => setDialog('edit')}>
              Düzenle
            </Button>
            {d.status === 'active' && (
              <Button variant="secondary" disabled={busy} onClick={() => setDialog('deactivate')}>
                Pasife al
              </Button>
            )}
            <a className="ui-button ui-button--secondary" href={`tel:${d.phone.replace(/[^\d+]/g, '')}`}>
              <Icon name="phone" />
              Ara
            </a>
            {wa && (
              <a
                className="ui-button ui-button--secondary"
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="whatsapp" />
                WhatsApp<span className="visually-hidden"> (yeni sekmede açılır)</span>
              </a>
            )}
          </>
        )
      }
    >
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {state.status === 'loading' && <SkeletonRows rows={5} />}
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
      {d && <Detail dealer={d} busy={busy} run={run} />}
      {dialog === 'edit' && d && (
        <DealerEditDialog
          dealer={d}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            setNotice({ tone: 'info', text: 'Bayi bilgileri güncellendi.' })
            reload()
          }}
        />
      )}
      {dialog === 'approve' && (
        <ActionDialog
          title="Bayiyi onayla"
          info="Bayi onaylanacak ve şifre belirleme e-postası gönderilecek. Devam edilsin mi?"
          reasonRequired={false}
          confirmLabel="Onayla"
          onClose={() => setDialog(null)}
          onConfirm={() =>
            inDialog(() => approveDealer(id), 'Bayi onaylandı; şifre belirleme e-postası gönderiliyor.')
          }
        />
      )}
      {dialog === 'reject' && (
        <ActionDialog
          title="Başvuruyu reddet"
          reasonRequired
          confirmLabel="Reddet"
          danger
          onClose={() => setDialog(null)}
          onConfirm={(r) => inDialog(() => rejectDealer(id, r), 'Başvuru reddedildi.')}
        />
      )}
      {dialog === 'deactivate' && (
        <ActionDialog
          title="Bayiyi pasife al"
          info="Bayinin açık oturumları kapatılır ve giriş yapamaz."
          reasonRequired
          confirmLabel="Pasife al"
          danger
          onClose={() => setDialog(null)}
          onConfirm={(r) => inDialog(() => deactivateDealer(id, r), 'Bayi pasife alındı.')}
        />
      )}
    </AdminLayout>
  )
}

function Detail({
  dealer: d,
  busy,
  run,
}: {
  dealer: DealerDetail
  busy: boolean
  run: (fn: () => Promise<void>, success: string) => Promise<boolean>
}) {
  const { query } = useRoute()
  const raw = query.get('sekme')
  const tab: TabId = TAB_IDS.includes(raw as TabId) ? (raw as TabId) : 'genel'
  const setTab = (t: TabId) =>
    replace(`/yonetim/bayiler/${encodeURIComponent(d.id)}${t === 'genel' ? '' : `?sekme=${t}`}`)
  const terms = d.status === 'pending_approval' || d.status === 'active' || d.status === 'passive'

  // Mini göstergeler: toplam sipariş ve son sipariş sipariş listesinden, bu yıl net rapordan (hesap sunucuda).
  const orders = useLoad<Paged<AdminOrderListItem>>(
    (s) => fetchAdminOrders({ dealerId: d.id, page: 1, pageSize: 10 }, s),
    `orders-${d.id}`,
  )
  const year = todayIstanbul().slice(0, 4)
  const yearNet = useLoad<ReportDealerRow | null>(async (s) => {
    const rows = await fetchReportList<ReportDealerRow>(
      'dealers',
      { from: `${year}-01-01`, to: todayIstanbul() },
      s,
    )
    return rows.find((r) => r.dealerId === d.id) ?? null
  }, `year-${d.id}`)

  const total = orders.state.status === 'ready' ? orders.state.data.total : null
  const last = orders.state.status === 'ready' ? orders.state.data.items[0]?.submittedAt : undefined

  return (
    <>
      <dl className="adm-mini">
        <div>
          <dt>Toplam sipariş</dt>
          <dd>{total === null ? '—' : formatInt(total)}</dd>
        </div>
        <div>
          <dt>Bu yıl net (KDV hariç)</dt>
          <dd>
            {yearNet.state.status !== 'ready'
              ? '—'
              : yearNet.state.data
                ? formatTRY(yearNet.state.data.netTotal.current)
                : formatTRY('0')}
          </dd>
        </div>
        <div>
          <dt>Son sipariş</dt>
          <dd>{total === null ? '—' : last ? formatDateTime(last) : 'Henüz yok'}</dd>
        </div>
        <div>
          <dt>Genel iskonto</dt>
          <dd>{d.generalDiscountPercent ? formatPercent(d.generalDiscountPercent) : 'Yok'}</dd>
        </div>
      </dl>

      <Tabs
        idBase="dealer"
        label="Bayi bölümleri"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'genel', label: 'Genel bilgiler' },
          { value: 'siparisler', label: 'Siparişler', count: total ?? undefined },
          { value: 'iskonto', label: 'İskontolar' },
          { value: 'notlar', label: 'İç notlar' },
          { value: 'gecmis', label: 'Onaylar ve geçmiş' },
        ]}
      />

      {tab === 'genel' && (
        <TabPanel idBase="dealer" value="genel">
          {d.rejectionReason && (
            <Alert tone="warning">
              <strong>Ret gerekçesi:</strong> {d.rejectionReason}
            </Alert>
          )}
          <Panel title="Bilgiler">
            <Dl
              items={[
                ['Yetkili', d.contactName],
                ['E-posta', d.email],
                ['Telefon', d.phone],
                ['İl / ilçe', `${d.city} / ${d.district}`],
                ['Adres', d.address],
                ['Vergi dairesi', d.taxOffice || '—'],
                ['Vergi no / TC kimlik no', d.taxNumber || '—'],
                ['Kaynak', d.source === 'application' ? 'Başvuru' : 'Davet'],
                ['Şifre', d.hasPassword ? 'Belirlendi' : 'Henüz belirlenmedi'],
                ['Kayıt tarihi', formatDateTime(d.createdAt)],
                ['E-posta doğrulama', d.emailVerifiedAt ? formatDateTime(d.emailVerifiedAt) : 'Doğrulanmadı'],
                ['Son inceleme', d.reviewedAt ? formatDateTime(d.reviewedAt) : '—'],
                ['Son giriş', d.lastLoginAt ? formatDateTime(d.lastLoginAt) : '—'],
              ]}
            />
          </Panel>
        </TabPanel>
      )}

      {tab === 'siparisler' && (
        <TabPanel idBase="dealer" value="siparisler">
          <DealerOrders dealerId={d.id} orders={orders} />
        </TabPanel>
      )}

      {tab === 'iskonto' && (
        <TabPanel idBase="dealer" value="iskonto">
          {terms ? (
            <>
              <Panel title="Genel iskonto">
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
              </Panel>
              <GroupDiscounts dealerId={d.id} />
            </>
          ) : (
            <p className="adm-empty adm-card">Bu durumdaki bayiye iskonto tanımlanamaz.</p>
          )}
        </TabPanel>
      )}

      {tab === 'notlar' && (
        <TabPanel idBase="dealer" value="notlar">
          <DealerNotes dealerId={d.id} />
        </TabPanel>
      )}

      {tab === 'gecmis' && (
        <TabPanel idBase="dealer" value="gecmis">
          <Panel title="Onaylar">
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
          </Panel>
          <Panel title="Geçmiş">
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
          </Panel>
        </TabPanel>
      )}
      {busy && (
        <span className="visually-hidden" role="status">
          İşlem sürüyor…
        </span>
      )}
    </>
  )
}

/** Bayinin son 10 siparişi; tümü sipariş listesinde bayi süzgeciyle açılır. */
function DealerOrders({
  dealerId,
  orders,
}: {
  dealerId: string
  orders: ReturnType<typeof useLoad<Paged<AdminOrderListItem>>>
}) {
  const { state, reload } = orders
  return (
    <Panel
      title="Son siparişler"
      flush
      action={
        <Link to={`/yonetim/siparisler?bayi=${encodeURIComponent(dealerId)}`}>
          Tüm siparişleri gör{state.status === 'ready' ? ` (${formatInt(state.data.total)})` : ''}
        </Link>
      }
    >
      {state.status === 'loading' && (
        <div className="adm-skel" aria-busy="true">
          <div className="ui-skeleton" style={{ height: '1.5rem' }} />
        </div>
      )}
      {state.status === 'error' && (
        <p className="adm-empty">
          Siparişler alınamadı.{' '}
          <button type="button" className="ui-linklike" onClick={reload}>
            Tekrar dene
          </button>
        </p>
      )}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <p className="adm-empty">Henüz sipariş yok.</p>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <div className="ui-table-wrap ui-table-wrap--scroll" style={{ border: 0, borderRadius: 0 }}>
          <table className="ui-table">
            <caption className="visually-hidden">Bayinin son siparişleri</caption>
            <thead>
              <tr>
                <th scope="col">Sipariş</th>
                <th scope="col">Tarih</th>
                <th scope="col">Durum</th>
                <th scope="col" className="num">
                  Net (KDV hariç)
                </th>
                <th scope="col" className="num">
                  Toplam
                </th>
              </tr>
            </thead>
            <tbody>
              {state.data.items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link className="ui-rowlink num" to={`/yonetim/siparisler/${encodeURIComponent(o.id)}`}>
                      #{o.orderNo}
                    </Link>
                  </td>
                  <td className="num muted">{formatDateTime(o.submittedAt)}</td>
                  <td>
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="num">{formatTRY(o.netTotal)}</td>
                  <td className="num">{formatTRY(o.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
