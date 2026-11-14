import type { DealerInput } from '../api'
import { CITIES } from '../data/cities'
import { Field } from '../ui/components'
import type { DealerErrors, DealerFieldName } from './form'

/** Başvuru ve Admin davet formunun ortak alanları (K-35). `idPrefix` aynı sayfada çakışmayı önler. */
export function DealerFields({
  values,
  errors,
  onChange,
  idPrefix,
}: {
  values: DealerInput
  errors: DealerErrors
  onChange: (field: DealerFieldName, value: string) => void
  idPrefix: string
}) {
  const id = (n: string) => `${idPrefix}-${n}`
  const text = (
    name: DealerFieldName,
    extra: { type?: string; autoComplete?: string; inputMode?: 'tel' | 'email' },
  ) => (
    <input
      id={id(name)}
      className="ui-input"
      type={extra.type ?? 'text'}
      autoComplete={extra.autoComplete}
      inputMode={extra.inputMode}
      value={values[name]}
      onChange={(e) => onChange(name, e.target.value)}
      aria-invalid={errors[name] ? true : undefined}
    />
  )
  return (
    <>
      <Field label="Firma unvanı" htmlFor={id('companyTitle')} error={errors.companyTitle}>
        {text('companyTitle', { autoComplete: 'organization' })}
      </Field>
      <Field label="Yetkili adı soyadı" htmlFor={id('contactName')} error={errors.contactName}>
        {text('contactName', { autoComplete: 'name' })}
      </Field>
      <div className="ui-form-grid ui-form-grid--2">
        <Field label="E-posta" htmlFor={id('email')} error={errors.email}>
          {text('email', { type: 'email', inputMode: 'email', autoComplete: 'email' })}
        </Field>
        <Field label="Telefon" htmlFor={id('phone')} error={errors.phone}>
          {text('phone', { type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
        </Field>
      </div>
      <div className="ui-form-grid ui-form-grid--2">
        <Field label="İl" htmlFor={id('city')} error={errors.city}>
          <select
            id={id('city')}
            className="ui-select"
            value={values.city}
            onChange={(e) => onChange('city', e.target.value)}
            aria-invalid={errors.city ? true : undefined}
            autoComplete="address-level1"
          >
            <option value="">İl seçin</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="İlçe" htmlFor={id('district')} error={errors.district}>
          {text('district', { autoComplete: 'address-level2' })}
        </Field>
      </div>
      <Field label="Açık adres" htmlFor={id('address')} error={errors.address}>
        <textarea
          id={id('address')}
          className="ui-textarea"
          autoComplete="street-address"
          value={values.address}
          onChange={(e) => onChange('address', e.target.value)}
          aria-invalid={errors.address ? true : undefined}
        />
      </Field>
    </>
  )
}
