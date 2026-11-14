// K-02, K-53: Admin'in açtığı hesap için davet bağlantısıyla şifre belirleme (/davet?token=).
// Davet 72 saat geçerlidir; geçersiz/kullanılmış/süresi dolmuş token 400 döner.
import { useState, type FormEvent } from 'react'
import { ApiError, acceptInvitation } from '../api'
import { PASSWORD_RULE_TEXT, validateNewPassword } from '../auth/validation'
import { Link } from '../Link'
import { useRoute } from '../router'
import { Alert, AuthCard, Button, Field, PasswordInput } from '../ui/components'

const INVALID_LINK =
  'Davet bağlantısı geçersiz veya süresi dolmuş. Yeni bir davet için Amisos ile iletişime geçin.'

export function InvitationPage() {
  const { query } = useRoute()
  // Token ilk açılışta saklanır; başarıdan sonra adresten silinir.
  const [token] = useState(() => query.get('token') ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [invalid, setInvalid] = useState(false)

  if (!token || invalid) {
    return (
      <AuthCard title="Şifre belirleme" footer={<Link to="/giris">Girişe git</Link>}>
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
      await acceptInvitation(token, password)
      history.replaceState(null, '', '#/davet')
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        history.replaceState(null, '', '#/davet')
        setInvalid(true)
      } else {
        setFormError(
          err instanceof ApiError && err.status === 429
            ? 'Çok fazla deneme yaptınız. Bir dakika sonra tekrar deneyin.'
            : 'Şifre belirlenemedi. Lütfen daha sonra tekrar deneyin.',
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title={done ? 'Şifreniz belirlendi' : 'Şifrenizi belirleyin'}
      intro={done ? undefined : 'Bayi hesabınız hazır. Giriş için bir şifre belirleyin.'}
      footer={done ? undefined : <Link to="/giris">Girişe git</Link>}
    >
      {done ? (
        <>
          <Alert tone="info">
            Şifreniz belirlendi. Artık e-posta adresiniz ve şifrenizle giriş yapabilirsiniz.
          </Alert>
          <Link to="/giris">Giriş yap</Link>
        </>
      ) : (
        <form className="ui-auth__form" onSubmit={onSubmit} noValidate>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="Şifre" htmlFor="invite-password" help={PASSWORD_RULE_TEXT} error={errors.password}>
            <PasswordInput
              id="invite-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={!!errors.password}
            />
          </Field>
          <Field label="Şifre (tekrar)" htmlFor="invite-confirm" error={errors.confirm}>
            <PasswordInput
              id="invite-confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              invalid={!!errors.confirm}
            />
          </Field>
          <Button type="submit" block disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Şifreyi belirle'}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
