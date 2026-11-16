// Şifre değiştirme formu (bayi hesabı K-67 ve Admin hesabı ortak). Mevcut şifre yanlışsa 400 WRONG_PASSWORD.
import { useState, type FormEvent } from 'react'
import { ApiError } from '../api'
import { validateNewPassword } from '../auth/validation'
import { Alert, Button, Field, PasswordInput } from './components'
import { networkMessage } from './networkMessage'
import { PasswordRules } from './PasswordRules'

export function PasswordChangeForm({
  onSubmit,
  idPrefix,
  successText,
}: {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>
  idPrefix: string
  successText: string
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const id = (n: string) => `${idPrefix}-${n}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    setDone(false)
    setFormError(null)
    const found = {
      current: current ? undefined : 'Mevcut şifre zorunludur.',
      next: validateNewPassword(next),
      confirm: confirm === next ? undefined : 'Şifreler eşleşmiyor.',
    }
    setErrors(found)
    if (found.current || found.next || found.confirm) return
    setBusy(true)
    try {
      await onSubmit(current, next)
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.code === 'WRONG_PASSWORD')
        setErrors({ current: 'Mevcut şifre hatalı.' })
      else if (err instanceof ApiError && err.status === 400)
        setErrors({ next: 'Yeni şifre kurallara uymuyor. Aşağıdaki kuralları kontrol edin.' })
      else if (err instanceof ApiError && err.status === 429)
        setFormError('Çok fazla deneme yaptınız. Bir dakika sonra tekrar deneyin.')
      else setFormError(networkMessage(err, 'Şifre değiştirilemedi. Lütfen tekrar deneyin.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="ui-stack ui-formnarrow" onSubmit={submit} noValidate>
      {done && <Alert tone="info">{successText}</Alert>}
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Mevcut şifre" htmlFor={id('current')} error={errors.current}>
        <PasswordInput
          id={id('current')}
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          invalid={!!errors.current}
        />
      </Field>
      <Field label="Yeni şifre" htmlFor={id('new')} error={errors.next}>
        <PasswordInput
          id={id('new')}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          invalid={!!errors.next}
          describedBy={id('rules')}
        />
      </Field>
      <PasswordRules value={next} id={id('rules')} />
      <Field label="Yeni şifre (tekrar)" htmlFor={id('confirm')} error={errors.confirm}>
        <PasswordInput
          id={id('confirm')}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          invalid={!!errors.confirm}
        />
      </Field>
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
        </Button>
      </div>
    </form>
  )
}
