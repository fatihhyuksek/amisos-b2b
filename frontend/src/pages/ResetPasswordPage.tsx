// GR-BAYI-007: şifre sıfırlama bağlantısı 1 saat geçerlidir (K-39); geçersiz/süresi dolmuş token 400 döner.
import { useState, type FormEvent } from 'react'
import { ApiError, confirmPasswordReset } from '../api'
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../auth/validation'
import { Link } from '../Link'
import { useRoute } from '../router'
import { Alert, AuthCard, Button, Field, PasswordInput } from '../ui/components'

const INVALID_LINK = 'Bağlantı geçersiz veya süresi dolmuş. Yeni bir şifre sıfırlama bağlantısı isteyin.'

export function ResetPasswordPage() {
  const { query } = useRoute()
  // Token ve tür ilk açılışta saklanır; başarıdan sonra token adresten silinir.
  const [token] = useState(() => query.get('token') ?? '')
  const [tur] = useState(() => (query.get('tur') === 'admin' ? 'admin' : 'bayi'))
  const loginPath = tur === 'admin' ? '/yonetim/giris' : '/giris'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <AuthCard
        title="Şifre sıfırlama"
        footer={<Link to={`/sifremi-unuttum?tur=${tur}`}>Yeni bağlantı iste</Link>}
      >
        <Alert tone="danger">{INVALID_LINK}</Alert>
      </AuthCard>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next = {
      password: validateNewPassword(password),
      confirm: password !== confirm ? 'Şifreler eşleşmiyor.' : undefined,
    }
    setErrors(next)
    setFormError(null)
    if (next.password || next.confirm) return
    setBusy(true)
    try {
      await confirmPasswordReset(token, password)
      // Token adres çubuğunda ve geçmişte kalmasın.
      history.replaceState(null, '', `#/sifre-sifirla?tur=${tur}`)
      setDone(true)
    } catch (err) {
      setFormError(
        err instanceof ApiError && err.status === 400
          ? INVALID_LINK
          : err instanceof ApiError && err.status === 429
            ? 'Çok fazla deneme yaptınız. Bir dakika sonra tekrar deneyin.'
            : 'Şifre güncellenemedi. Lütfen daha sonra tekrar deneyin.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Yeni şifre belirleyin" footer={<Link to={loginPath}>Girişe dön</Link>}>
      {done ? (
        <>
          <Alert tone="info">Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.</Alert>
          <Link to={loginPath}>Giriş yap</Link>
        </>
      ) : (
        <form className="ui-auth__form" onSubmit={onSubmit} noValidate>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field
            label="Yeni şifre"
            htmlFor="new-password"
            help={`En az ${MIN_PASSWORD_LENGTH} karakter.`}
            error={errors.password}
          >
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={!!errors.password}
            />
          </Field>
          <Field label="Yeni şifre (tekrar)" htmlFor="confirm-password" error={errors.confirm}>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              invalid={!!errors.confirm}
            />
          </Field>
          <Button type="submit" block disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Şifreyi kaydet'}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
