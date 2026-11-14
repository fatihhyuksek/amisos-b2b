// GR-BAYI-007: şifre sıfırlama bağlantısı yalnızca kayıtlı e-postaya gider, 1 saat geçerlidir (K-39).
// Hesap var/yok bilgisi sızdırılmaz: her durumda aynı mesaj gösterilir.
import { useState, type FormEvent } from 'react'
import { requestPasswordReset } from '../api'
import { validateEmail } from '../auth/validation'
import { Link } from '../Link'
import { useRoute } from '../router'
import { Alert, AuthCard, Button, Field } from '../ui/components'

export function ForgotPasswordPage() {
  const { query } = useRoute()
  const isAdmin = query.get('tur') === 'admin'
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const back = isAdmin ? '/yonetim/giris' : '/giris'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const err = validateEmail(email)
    setError(err)
    if (err) return
    setBusy(true)
    try {
      await requestPasswordReset(email.trim(), isAdmin ? 'admin' : 'dealer')
    } catch {
      /* Sonuç ne olursa olsun aynı mesaj gösterilir. */
    }
    setBusy(false)
    setDone(true)
  }

  return (
    <AuthCard
      title="Şifremi unuttum"
      intro={done ? undefined : 'E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.'}
      footer={<Link to={back}>Girişe dön</Link>}
    >
      {done ? (
        <Alert tone="info">
          Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderdik. Bağlantı 1 saat geçerlidir.
        </Alert>
      ) : (
        <form className="ui-auth__form" onSubmit={onSubmit} noValidate>
          <Field label="E-posta" htmlFor="email" error={error}>
            <input
              id="email"
              className="ui-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
            />
          </Field>
          <Button type="submit" block disabled={busy}>
            {busy ? 'Gönderiliyor…' : 'Bağlantı gönder'}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
