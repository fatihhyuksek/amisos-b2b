// K-69: Kayıtlı teslimat adresleri (en fazla 20). Sipariş onayında seçilince alanlar dolar.
import { useState, type FormEvent } from 'react'
import {
  ApiError,
  createAddress,
  deleteAddress,
  fetchAddresses,
  updateAddress,
  type Account,
  type DealerAddress,
  type DealerAddressInput,
} from '../../api'
import { useLoad } from '../../admin/useLoad'
import { CITIES } from '../../data/cities'
import { Alert, Button, Checkbox, EmptyState, Field, Modal } from '../../ui/components'
import { ErrorAlert, LoadingCard } from '../../ui/catalog'
import { Icon } from '../../ui/Icon'
import { networkMessage } from '../../ui/networkMessage'

const MAX = 20

type Form = DealerAddressInput & { isDefault: boolean }
type Errors = Partial<Record<keyof Form, string>>

function validate(f: Form): Errors {
  const e: Errors = {}
  if (!f.label.trim() || f.label.trim().length > 60) e.label = 'Adres adı 1–60 karakter olmalıdır.'
  if (f.carrierName.trim().length > 100) e.carrierName = 'En fazla 100 karakter.'
  if (f.carrierBranch.trim().length > 100) e.carrierBranch = 'En fazla 100 karakter.'
  if (!f.address.trim() || f.address.trim().length > 500) e.address = 'Adres 1–500 karakter olmalıdır.'
  return e
}

function AddressDialog({
  address,
  defaults,
  first,
  onClose,
  onSaved,
}: {
  address: DealerAddress | null
  defaults: { city: string; district: string }
  first: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState<Form>({
    label: address?.label ?? '',
    carrierName: address?.carrierName ?? '',
    carrierBranch: address?.carrierBranch ?? '',
    address: address?.address ?? '',
    city: address?.city ?? defaults.city,
    district: address?.district ?? defaults.district,
    isDefault: address?.isDefault ?? first,
  })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((cur) => ({ ...cur, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const found = validate(f)
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0) return
    const body: Form = {
      ...f,
      label: f.label.trim(),
      carrierName: f.carrierName.trim(),
      carrierBranch: f.carrierBranch.trim(),
      address: f.address.trim(),
      district: f.district.trim(),
    }
    setBusy(true)
    try {
      if (address) await updateAddress(address.id, body)
      else await createAddress(body)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'ADDRESS_LIMIT')
        setFormError(`En fazla ${MAX} adres kaydedebilirsiniz. Önce kullanmadığınız bir adresi silin.`)
      else if (err instanceof ApiError && err.status === 400 && err.fields) {
        const mapped: Errors = {}
        for (const [k, m] of Object.entries(err.fields)) if (k in f) mapped[k as keyof Form] = m
        setErrors(mapped)
        if (Object.keys(mapped).length === 0) setFormError('Formdaki bilgileri kontrol edin.')
      } else setFormError(networkMessage(err, 'Adres kaydedilemedi. Lütfen tekrar deneyin.'))
    } finally {
      setBusy(false)
    }
  }

  const input = (k: 'label' | 'carrierName' | 'carrierBranch' | 'district') => (
    <input
      id={`addr-${k}`}
      className="ui-input"
      value={f[k]}
      autoComplete="off"
      aria-invalid={errors[k] ? true : undefined}
      onChange={(e) => set(k, e.target.value)}
    />
  )

  return (
    <Modal title={address ? 'Adresi düzenle' : 'Yeni adres'} onClose={onClose} dismissable={!busy} wide>
      <form className="ui-stack" onSubmit={submit} noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Adres adı" htmlFor="addr-label" help="Örn. Depo, Mağaza" error={errors.label}>
          {input('label')}
        </Field>
        <div className="ui-form-grid ui-form-grid--2">
          <Field label="Ambar firması" htmlFor="addr-carrierName" error={errors.carrierName}>
            {input('carrierName')}
          </Field>
          <Field label="Ambar şubesi" htmlFor="addr-carrierBranch" error={errors.carrierBranch}>
            {input('carrierBranch')}
          </Field>
        </div>
        <div className="ui-form-grid ui-form-grid--2">
          <Field label="İl" htmlFor="addr-city" error={errors.city}>
            <select
              id="addr-city"
              className="ui-select"
              value={f.city}
              aria-invalid={errors.city ? true : undefined}
              onChange={(e) => set('city', e.target.value)}
            >
              <option value="">İl seçin (isteğe bağlı)</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="İlçe" htmlFor="addr-district" error={errors.district}>
            {input('district')}
          </Field>
        </div>
        <Field label="Açık adres" htmlFor="addr-address" error={errors.address}>
          <textarea
            id="addr-address"
            className="ui-textarea"
            rows={3}
            value={f.address}
            aria-invalid={errors.address ? true : undefined}
            onChange={(e) => set('address', e.target.value)}
          />
        </Field>
        <Checkbox id="addr-default" checked={f.isDefault} onChange={(v) => set('isDefault', v)}>
          Varsayılan adres olarak kullan
        </Checkbox>
        <div className="ui-modal__actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function AddressesTab({ account }: { account: Account }) {
  const { state, reload } = useLoad<DealerAddress[]>((s) => fetchAddresses(s), 'addresses')
  const [dialog, setDialog] = useState<{ address: DealerAddress | null } | null>(null)
  const [confirm, setConfirm] = useState<DealerAddress | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  const list = state.status === 'ready' ? state.data : []

  async function makeDefault(a: DealerAddress) {
    setBusyId(a.id)
    setNotice(null)
    try {
      await updateAddress(a.id, { isDefault: true })
      reload()
    } catch (err) {
      setNotice({ tone: 'danger', text: networkMessage(err, 'Varsayılan adres değiştirilemedi.') })
    } finally {
      setBusyId(null)
    }
  }

  async function remove(a: DealerAddress) {
    setBusyId(a.id)
    try {
      await deleteAddress(a.id)
      setConfirm(null)
      setNotice({ tone: 'info', text: 'Adres silindi.' })
      reload()
    } catch (err) {
      setConfirm(null)
      setNotice({
        tone: 'danger',
        text:
          err instanceof ApiError && err.status === 404
            ? 'Adres bulunamadı.'
            : networkMessage(err, 'Adres silinemedi. Lütfen tekrar deneyin.'),
      })
      reload()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="ui-stack" aria-labelledby="addr-title">
      <div className="ui-pagehead">
        <div>
          <h2 id="addr-title">Adreslerim</h2>
          <p className="muted">
            Sipariş onayında kayıtlı adres seçerek teslimat bilgilerini hızlıca doldurun. En fazla {MAX}{' '}
            adres.
          </p>
        </div>
        <Button icon="plus" disabled={list.length >= MAX} onClick={() => setDialog({ address: null })}>
          Adres ekle
        </Button>
      </div>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {state.status === 'loading' && <LoadingCard rows={2} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Adresler alınamadı.</ErrorAlert>}
      {state.status === 'ready' && list.length === 0 && (
        <div className="ui-card">
          <EmptyState
            title="Kayıtlı adresiniz yok"
            action={<Button onClick={() => setDialog({ address: null })}>İlk adresinizi ekleyin</Button>}
          >
            Ambar firması ve şubesiyle teslimat adreslerinizi kaydedin.
          </EmptyState>
        </div>
      )}
      {list.length > 0 && (
        <ul className="ui-addrgrid">
          {list.map((a) => (
            <li key={a.id} className="ui-card ui-card__body ui-addr">
              <div className="ui-addr__head">
                <h3>{a.label}</h3>
                {a.isDefault && <span className="ui-pill ui-pill--soft">Varsayılan</span>}
              </div>
              <p className="ui-prewrap">{a.address}</p>
              <p className="muted">
                {a.district} / {a.city}
              </p>
              {(a.carrierName || a.carrierBranch) && (
                <p className="muted">
                  <Icon name="truck" /> {[a.carrierName, a.carrierBranch].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="ui-actions">
                <Button variant="secondary" size="sm" icon="edit" onClick={() => setDialog({ address: a })}>
                  Düzenle
                </Button>
                {!a.isDefault && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === a.id}
                    onClick={() => void makeDefault(a)}
                  >
                    Varsayılan yap
                  </Button>
                )}
                <Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirm(a)}>
                  Sil
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {dialog && (
        <AddressDialog
          address={dialog.address}
          defaults={{ city: account.city, district: account.district }}
          first={list.length === 0}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            setNotice({ tone: 'info', text: 'Adres kaydedildi.' })
            reload()
          }}
        />
      )}
      {confirm && (
        <Modal title="Adresi sil" onClose={() => setConfirm(null)} dismissable={busyId === null}>
          <p>“{confirm.label}” adresi silinecek. Geçmiş siparişleriniz etkilenmez. Devam edilsin mi?</p>
          <div className="ui-modal__actions">
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busyId !== null}>
              Vazgeç
            </Button>
            <Button variant="danger" onClick={() => void remove(confirm)} disabled={busyId !== null}>
              Sil
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}
