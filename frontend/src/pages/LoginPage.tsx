// GR-BAYI-007, K-29: e-posta ve şifre ile giriş. Bayi (/giris) ve Admin (/yonetim/giris) ayrı ekranlardır.
// GR-BAYI-006, K-54: pasif bayi reddedilir; şifresi doğruysa sunucu 403 döner ve açık mesaj gösterilir.
import { useState, type FormEvent } from 'react'
import { ApiError, login, type UserType } from '../api'
import { useAuth } from '../auth/useAuth'
import { validateEmail, validateRequired } from '../auth/validation'
import { Link } from '../Link'
import { replace, useRoute } from '../router'
import { safeReturnPath } from '../shop/returnTo'
import { Alert, AuthCard, Button, Field, PasswordInput } from '../ui/components'

const SERVER_UNREACHABLE = 'Sunucuya ulaşılamadı. Lütfen biraz sonra tekrar deneyin.'

function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Hesabınız pasif durumda. Bilgi için bizimle iletişime geçin.'
    if (err.status === 401) return 'E-posta veya şifre hatalı ya da hesabınız giriş için uygun değil.'
    if (err.status === 429) return 'Çok fazla deneme yaptınız. Bir dakika sonra tekrar deneyin.'
    if (err.status === 503 && err.code === 'BACKEND_UNREACHABLE') return SERVER_UNREACHABLE
    if (err.status >= 500) return 'Sunucuda bir sorun oluştu. Lütfen biraz sonra tekrar deneyin.'
  }
  // fetch ağ hatasında TypeError fırlatır: sunucu kapalı veya ulaşılamıyor.
  if (err instanceof TypeError) return SERVER_UNREACHABLE
  return 'Giriş yapılamadı. Lütfen daha sonra tekrar deneyin.'
}

export function LoginPage({ type }: { type: UserType }) {
  const { refresh } = useAuth()
  const back = safeReturnPath(useRoute().query.get('donus'))
  const isAdmin = type === 'admin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next = { email: validateEmail(email), password: validateRequired(password) }
    setErrors(next)
    setFormError(null)
    if (next.email || next.password) return
    setBusy(true)
    try {
      await login(type, email.trim(), password)
      const user = await refresh()
      if (user)
        replace(
          user.type === 'admin'
            ? back?.startsWith('/yonetim')
              ? back
              : '/yonetim'
            : back && !back.startsWith('/yonetim')
              ? back
              : '/',
        )
      // Giriş kabul edildi ama oturum çerezi geri gelmedi (tarayıcı çerezi engellemiş olabilir).
      else
        setFormError(
          'Giriş kabul edildi ancak oturum açılamadı. Tarayıcınızın çerezlere izin verdiğinden emin olun.',
        )
    } catch (err) {
      setFormError(loginErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title={isAdmin ? 'Yönetim girişi' : 'Bayi girişi'}
      intro={
        !isAdmin && back
          ? 'Devam etmek için giriş yapın. Girişten sonra kaldığınız sayfaya döneceksiniz.'
          : undefined
      }
      footer={
        isAdmin ? undefined : (
          <>
            <p className="muted">
              Bayi değil misiniz? <Link to="/basvuru">Bayi olun</Link>
            </p>
            <p className="muted">
              <Link to="/katalog">Fiyatsız vitrine göz atın</Link>
            </p>
          </>
        )
      }
    >
      <form className="ui-auth__form" onSubmit={onSubmit} noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="E-posta" htmlFor="email" error={errors.email}>
          <input
            id="email"
            className="ui-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
          />
        </Field>
        <Field label="Şifre" htmlFor="password" error={errors.password}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!errors.password}
          />
        </Field>
        <Button type="submit" block disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </Button>
        <div className="ui-auth__links">
          <Link to={`/sifremi-unuttum?tur=${type === 'admin' ? 'admin' : 'bayi'}`}>Şifremi unuttum</Link>
        </div>
      </form>
    </AuthCard>
  )
}
