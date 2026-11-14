// GR-BAYI-001, K-02: Admin, başvuru olmadan davetle bayi açar (aktif + şifre belirleme e-postası).
import { useRef, useState, type FormEvent } from 'react'
import { ApiError, createDealer, type DealerInput } from '../api'
import { DealerFields } from '../dealers/DealerFields'
import {
  EMPTY_DEALER,
  mapServerFields,
  trimmed,
  validateDealer,
  type DealerErrors,
  type DealerFieldName,
} from '../dealers/form'
import { Link } from '../Link'
import { replace } from '../router'
import { Alert, Button } from '../ui/components'
import { AdminLayout } from './AdminLayout'

const DUPLICATE = 'Bu e-posta veya firma unvanıyla bekleyen ya da aktif bir kayıt var.'

export function DealerCreatePage() {
  const [values, setValues] = useState<DealerInput>(EMPTY_DEALER)
  const [errors, setErrors] = useState<DealerErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  function focusFirstError() {
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next = validateDealer(values)
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length > 0) {
      focusFirstError()
      return
    }
    setBusy(true)
    try {
      const dealer = await createDealer(trimmed(values))
      replace(`/yonetim/bayiler/${encodeURIComponent(dealer.id)}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'DUPLICATE_APPLICATION') {
        setFormError(DUPLICATE)
      } else if (err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION') {
        const { errors: serverErrors, unknown } = mapServerFields(err.fields)
        setErrors(serverErrors)
        if (unknown || Object.keys(serverErrors).length === 0)
          setFormError('Formdaki bilgileri kontrol edin.')
        focusFirstError()
      } else {
        setFormError('Bayi oluşturulamadı. Lütfen daha sonra tekrar deneyin.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminLayout title="Bayi davet et">
      <section className="ui-card ui-page__card" aria-label="Bayi bilgileri">
        <div className="ui-card__body ui-auth__body">
          <p className="muted">
            Bayi doğrudan aktif olarak açılır ve şifre belirleme bağlantısı e-posta ile gönderilir.
          </p>
          <form ref={formRef} className="ui-auth__form" onSubmit={onSubmit} noValidate>
            {formError && <Alert tone="danger">{formError}</Alert>}
            <DealerFields
              idPrefix="invite"
              values={values}
              errors={errors}
              onChange={(f: DealerFieldName, v: string) => setValues((s) => ({ ...s, [f]: v }))}
            />
            <div className="ui-actions">
              <Button type="submit" disabled={busy}>
                {busy ? 'Oluşturuluyor…' : 'Bayi oluştur ve davet gönder'}
              </Button>
              <Link
                to="/yonetim/bayiler"
                className="ui-button ui-button--secondary"
                style={{ textDecoration: 'none' }}
              >
                Vazgeç
              </Link>
            </div>
          </form>
        </div>
      </section>
    </AdminLayout>
  )
}
