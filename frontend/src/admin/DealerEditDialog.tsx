// K-67, K-68, K-75: Admin bayi bilgilerini düzenler (unvan, e-posta dahil). Yalnızca değişen alanlar gönderilir.
import { useState, type FormEvent } from 'react'
import { ApiError, patchDealer, type DealerDetail, type DealerPatch } from '../api'
import { CITIES } from '../data/cities'
import { validatePhone } from '../dealers/form'
import { validateEmail } from '../auth/validation'
import { Alert, Button, Field, Modal } from '../ui/components'
import { networkMessage } from '../ui/networkMessage'

type Values = Required<{ [K in keyof DealerPatch]: string }>
type Errors = Partial<Record<keyof Values, string>>

function initial(d: DealerDetail): Values {
  return {
    companyTitle: d.companyTitle,
    contactName: d.contactName,
    email: d.email,
    phone: d.phone,
    city: d.city,
    district: d.district,
    address: d.address,
    taxOffice: d.taxOffice ?? '',
    taxNumber: d.taxNumber ?? '',
  }
}

function validate(v: Values): Errors {
  const e: Errors = {}
  if (!v.companyTitle.trim()) e.companyTitle = 'Firma unvanı zorunludur.'
  if (v.contactName.trim().length < 2) e.contactName = 'Yetkili adı zorunludur.'
  const mail = validateEmail(v.email)
  if (mail) e.email = mail
  const phone = validatePhone(v.phone)
  if (phone) e.phone = phone
  if (!v.city) e.city = 'İl seçin.'
  if (!v.district.trim()) e.district = 'İlçe zorunludur.'
  if (!v.address.trim()) e.address = 'Adres zorunludur.'
  if (v.taxNumber.trim() && !/^(\d{10}|\d{11})$/.test(v.taxNumber.trim()))
    e.taxNumber = 'Vergi numarası 10 (VKN) veya 11 (TCKN) haneli olmalıdır.'
  return e
}

export function DealerEditDialog({
  dealer,
  onClose,
  onSaved,
}: {
  dealer: DealerDetail
  onClose: () => void
  onSaved: () => void
}) {
  const base = initial(dealer)
  const [v, setV] = useState<Values>(base)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Values, value: string) => setV((cur) => ({ ...cur, [k]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const found = validate(v)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const patch: DealerPatch = {}
    for (const k of Object.keys(v) as (keyof Values)[]) {
      if (v[k] === base[k]) continue
      const value = v[k].trim()
      if (k === 'taxOffice' || k === 'taxNumber') patch[k] = value || null
      else patch[k] = value
    }
    if (Object.keys(patch).length === 0) {
      onClose()
      return
    }
    setBusy(true)
    try {
      await patchDealer(dealer.id, patch)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'DUPLICATE_EMAIL')
        setErrors({ email: 'Bu e-posta başka bir bayide kayıtlı.' })
      else if (err instanceof ApiError && err.status === 409 && err.code === 'DUPLICATE_COMPANY')
        setErrors({ companyTitle: 'Bu firma unvanı başka bir bayide kayıtlı.' })
      else if (err instanceof ApiError && err.status === 400 && err.fields) {
        const mapped: Errors = {}
        for (const [k, m] of Object.entries(err.fields)) if (k in v) mapped[k as keyof Values] = m
        setErrors(mapped)
        if (Object.keys(mapped).length === 0) setFormError('Formdaki bilgileri kontrol edin.')
      } else if (err instanceof ApiError && err.status === 404) setFormError('Bayi bulunamadı.')
      else setFormError(networkMessage(err, 'Bilgiler kaydedilemedi. Lütfen tekrar deneyin.'))
    } finally {
      setBusy(false)
    }
  }

  const text = (k: keyof Values, type = 'text') => (
    <input
      id={`de-${k}`}
      className="ui-input"
      type={type}
      autoComplete="off"
      value={v[k]}
      aria-invalid={errors[k] ? true : undefined}
      onChange={(e) => set(k, e.target.value)}
    />
  )

  return (
    <Modal title="Bayi bilgilerini düzenle" onClose={onClose} dismissable={!busy} wide>
      <form className="ui-stack" onSubmit={submit} noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Alert tone="info">
          Firma unvanı ve e-posta yalnızca Admin tarafından değiştirilir; değişiklik işlem geçmişine yazılır.
        </Alert>
        <div className="ui-form-grid ui-form-grid--2">
          <Field label="Firma unvanı" htmlFor="de-companyTitle" error={errors.companyTitle}>
            {text('companyTitle')}
          </Field>
          <Field label="Yetkili adı soyadı" htmlFor="de-contactName" error={errors.contactName}>
            {text('contactName')}
          </Field>
          <Field label="E-posta" htmlFor="de-email" error={errors.email}>
            {text('email', 'email')}
          </Field>
          <Field label="Telefon" htmlFor="de-phone" error={errors.phone}>
            {text('phone', 'tel')}
          </Field>
          <Field label="İl" htmlFor="de-city" error={errors.city}>
            <select
              id="de-city"
              className="ui-select"
              value={v.city}
              aria-invalid={errors.city ? true : undefined}
              onChange={(e) => set('city', e.target.value)}
            >
              <option value="">İl seçin</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="İlçe" htmlFor="de-district" error={errors.district}>
            {text('district')}
          </Field>
        </div>
        <Field label="Adres" htmlFor="de-address" error={errors.address}>
          <textarea
            id="de-address"
            className="ui-textarea"
            rows={3}
            value={v.address}
            aria-invalid={errors.address ? true : undefined}
            onChange={(e) => set('address', e.target.value)}
          />
        </Field>
        <div className="ui-form-grid ui-form-grid--2">
          <Field label="Vergi dairesi" htmlFor="de-taxOffice" error={errors.taxOffice}>
            {text('taxOffice')}
          </Field>
          <Field label="Vergi no / TC kimlik no" htmlFor="de-taxNumber" error={errors.taxNumber}>
            {text('taxNumber')}
          </Field>
        </div>
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
