// K-67, K-68: Firma ve iletişim bilgileri. Unvan ve e-posta salt okunur (yalnız Admin değiştirir).
import { useState, type FormEvent } from 'react'
import { ApiError, patchAccount, type Account, type AccountPatch } from '../../api'
import { validatePhone } from '../../dealers/form'
import { CITIES } from '../../data/cities'
import { Link } from '../../Link'
import { useSite } from '../../shop/site'
import { phoneHref } from '../../shop/contact'
import { Alert, Button, Field } from '../../ui/components'
import { networkMessage } from '../../ui/networkMessage'
import { maskPhone } from '../../ui/phoneMask'

type Values = {
  contactName: string
  phone: string
  city: string
  district: string
  address: string
  taxOffice: string
  taxNumber: string
}
type Errors = Partial<Record<keyof Values, string>>

function initial(a: Account): Values {
  return {
    contactName: a.contactName,
    phone: maskPhone(a.phone),
    city: a.city,
    district: a.district,
    address: a.address,
    taxOffice: a.taxOffice ?? '',
    taxNumber: a.taxNumber ?? '',
  }
}

function validate(v: Values): Errors {
  const e: Errors = {}
  const name = v.contactName.trim()
  if (name.length < 2 || name.length > 100) e.contactName = 'Yetkili adı 2–100 karakter olmalıdır.'
  const phone = validatePhone(v.phone)
  if (phone) e.phone = phone
  if (!v.city) e.city = 'İl seçin.'
  if (!v.district.trim()) e.district = 'İlçe zorunludur.'
  const addr = v.address.trim()
  if (!addr) e.address = 'Açık adres zorunludur.'
  else if (addr.length > 500) e.address = 'Adres en fazla 500 karakter olabilir.'
  if (v.taxOffice.trim().length > 100) e.taxOffice = 'Vergi dairesi en fazla 100 karakter olabilir.'
  if (v.taxNumber.trim() && !/^(\d{10}|\d{11})$/.test(v.taxNumber.trim()))
    e.taxNumber = 'Vergi numarası 10 (VKN) veya 11 (TCKN) haneli olmalıdır.'
  return e
}

export function InfoTab({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const site = useSite()
  const [base, setBase] = useState(() => initial(account))
  const [values, setValues] = useState<Values>(base)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const dirty = (Object.keys(values) as (keyof Values)[]).some((k) => values[k] !== base[k])
  const set = (k: keyof Values, v: string) => {
    setSaved(false)
    setValues((cur) => ({ ...cur, [k]: v }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    setFormError(null)
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    const patch: AccountPatch = {}
    if (values.contactName !== base.contactName) patch.contactName = values.contactName.trim()
    if (values.phone !== base.phone) patch.phone = values.phone.trim()
    if (values.city !== base.city) patch.city = values.city
    if (values.district !== base.district) patch.district = values.district.trim()
    if (values.address !== base.address) patch.address = values.address.trim()
    if (values.taxOffice !== base.taxOffice) patch.taxOffice = values.taxOffice.trim() || null
    if (values.taxNumber !== base.taxNumber) patch.taxNumber = values.taxNumber.trim() || null
    setBusy(true)
    try {
      const updated = await patchAccount(patch)
      const next = initial(updated)
      setBase(next)
      setValues(next)
      setSaved(true)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.fields) {
        const mapped: Errors = {}
        for (const [k, m] of Object.entries(err.fields)) if (k in values) mapped[k as keyof Values] = m
        setErrors(mapped)
        if (Object.keys(mapped).length === 0) setFormError('Formdaki bilgileri kontrol edin.')
      } else setFormError(networkMessage(err, 'Bilgiler kaydedilemedi. Lütfen tekrar deneyin.'))
    } finally {
      setBusy(false)
    }
  }

  const text = (k: keyof Values, extra: { autoComplete?: string; inputMode?: 'tel' | 'numeric' } = {}) => (
    <input
      id={`acc-${k}`}
      className="ui-input"
      value={values[k]}
      autoComplete={extra.autoComplete ?? 'off'}
      inputMode={extra.inputMode}
      aria-invalid={errors[k] ? true : undefined}
      onChange={(e) =>
        set(
          k,
          k === 'phone'
            ? maskPhone(e.target.value)
            : k === 'taxNumber'
              ? e.target.value.replace(/\D/g, '').slice(0, 11)
              : e.target.value,
        )
      }
    />
  )

  return (
    <form className="ui-card ui-card__body ui-stack" onSubmit={submit} noValidate>
      <h2>Firma ve iletişim bilgileri</h2>
      {saved && <Alert tone="info">Bilgileriniz kaydedildi.</Alert>}
      {formError && <Alert tone="danger">{formError}</Alert>}
      <dl className="ui-dl ui-readonly">
        <div>
          <dt>Firma unvanı</dt>
          <dd>{account.companyTitle}</dd>
        </div>
        <div>
          <dt>E-posta (giriş adresiniz)</dt>
          <dd>{account.email}</dd>
        </div>
      </dl>
      <p className="muted ui-readonly__note">
        Firma unvanı ve e-posta değişikliği için bize ulaşın:{' '}
        <a href={phoneHref(site.contact)}>{site.contact.phone}</a> · <Link to="/iletisim">İletişim</Link>
      </p>
      <div className="ui-form-grid ui-form-grid--2">
        <Field label="Yetkili adı soyadı" htmlFor="acc-contactName" error={errors.contactName}>
          {text('contactName', { autoComplete: 'name' })}
        </Field>
        <Field label="Telefon" htmlFor="acc-phone" error={errors.phone}>
          {text('phone', { autoComplete: 'tel', inputMode: 'tel' })}
        </Field>
        <Field label="İl" htmlFor="acc-city" error={errors.city}>
          <select
            id="acc-city"
            className="ui-select"
            value={values.city}
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
        <Field label="İlçe" htmlFor="acc-district" error={errors.district}>
          {text('district', { autoComplete: 'address-level2' })}
        </Field>
      </div>
      <Field label="Açık adres" htmlFor="acc-address" error={errors.address}>
        <textarea
          id="acc-address"
          className="ui-textarea"
          rows={3}
          value={values.address}
          aria-invalid={errors.address ? true : undefined}
          onChange={(e) => set('address', e.target.value)}
        />
      </Field>
      <fieldset className="ui-fieldset">
        <legend>Vergi bilgileri</legend>
        <div className="ui-form-grid ui-form-grid--2">
          <Field label="Vergi dairesi" htmlFor="acc-taxOffice" error={errors.taxOffice}>
            {text('taxOffice')}
          </Field>
          <Field
            label="Vergi no / TC kimlik no"
            htmlFor="acc-taxNumber"
            help="10 haneli VKN veya 11 haneli TCKN"
            error={errors.taxNumber}
          >
            {text('taxNumber', { inputMode: 'numeric' })}
          </Field>
        </div>
      </fieldset>
      <div className="ui-actions">
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
        {dirty && !busy && (
          <Button
            variant="ghost"
            onClick={() => {
              setValues(base)
              setErrors({})
            }}
          >
            Değişiklikleri geri al
          </Button>
        )}
      </div>
    </form>
  )
}
