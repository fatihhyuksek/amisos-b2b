// Bayi bilgi formu: istemci tarafı ön kontrol. Asıl doğrulama backend'dedir (K-35, GR-BAYI-008).
import type { DealerInput } from '../api'
import { validateEmail } from '../auth/validation'

export type DealerFieldName = keyof DealerInput
export type DealerErrors = Partial<Record<DealerFieldName | 'kvkk' | 'terms', string>>

export const EMPTY_DEALER: DealerInput = {
  companyTitle: '',
  contactName: '',
  email: '',
  phone: '',
  city: '',
  district: '',
  address: '',
}

export const FIELD_NAMES = Object.keys(EMPTY_DEALER) as DealerFieldName[]

const REQUIRED: Record<Exclude<DealerFieldName, 'email' | 'phone'>, string> = {
  companyTitle: 'Firma unvanı zorunludur.',
  contactName: 'Yetkili adı soyadı zorunludur.',
  city: 'İl seçin.',
  district: 'İlçe zorunludur.',
  address: 'Açık adres zorunludur.',
}

export function validatePhone(value: string): string | undefined {
  if (!value.trim()) return 'Telefon zorunludur.'
  const digits = value.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 11)
    return 'Telefon 10 veya 11 haneli olmalıdır (ör. 0532 123 45 67).'
}

export function validateDealer(v: DealerInput): DealerErrors {
  const errors: DealerErrors = {}
  for (const key of Object.keys(REQUIRED) as (keyof typeof REQUIRED)[]) {
    if (!v[key].trim()) errors[key] = REQUIRED[key]
  }
  const email = validateEmail(v.email)
  if (email) errors.email = email
  const phone = validatePhone(v.phone)
  if (phone) errors.phone = phone
  return errors
}

export function trimmed(v: DealerInput): DealerInput {
  return {
    companyTitle: v.companyTitle.trim(),
    contactName: v.contactName.trim(),
    email: v.email.trim(),
    phone: v.phone.trim(),
    city: v.city,
    district: v.district.trim(),
    address: v.address.trim(),
  }
}

/** Sunucunun `fields` hatalarını ilgili alanlara dağıtır; tanınmayan anahtarlar `unknown` sayılır. */
export function mapServerFields(fields: Record<string, string> | undefined): {
  errors: DealerErrors
  unknown: boolean
} {
  const errors: DealerErrors = {}
  let unknown = false
  for (const [key, msg] of Object.entries(fields ?? {})) {
    const name = key.replace(/^consents\./, '')
    if ((FIELD_NAMES as string[]).includes(name) || name === 'kvkk' || name === 'terms') {
      errors[name as keyof DealerErrors] = msg
    } else unknown = true
  }
  return { errors, unknown }
}
