// K-02, K-53, K-57, GR-KVK-001: Admin'in açtığı hesap için davet bağlantısıyla şifre belirleme (/davet?token=).
// Davet 72 saat geçerlidir; geçersiz/kullanılmış/süresi dolmuş token 400 döner.
import { useState, type FormEvent } from 'react'
import { ApiError, acceptInvitation } from '../api'
import { PASSWORD_RULE_TEXT, validateNewPassword } from '../auth/validation'
import { Link } from '../Link'
import { PageTextModal } from '../shop/PageTextModal'
import { useRoute } from '../router'
import { Alert, AuthCard, Button, Checkbox, Field, PasswordInput } from '../ui/components'

const MAX_PASSWORD_LENGTH = 200
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
  const [kvkk, setKvkk] = useState(false)
  const [terms, setTerms] = useState(false)
  const [marketing, setMarketing] = useState(false) // varsayılan işaretsiz
  const [consentErrors, setConsentErrors] = useState<{ kvkk?: string; terms?: string }>({})
  const [textModal, setTextModal] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [invalid, setInvalid] = useState(false)

  if (!token || invalid) {
    return (
      <AuthCard title="Şifre belirleme" footer={<Link to="/giris">Girişe git</Link>}>
        <Alert tone="danger">{INVALID_LINK}</Alert>
      </AuthCard>
    )
  }

  const textLink = (label: string, key: string) => (
    <button type="button" className="ui-linklike" onClick={() => setTextModal(key)}>
      {label}
    </button>
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next = {
      password:
        password.length > MAX_PASSWORD_LENGTH
          ? `Şifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir.`
          : validateNewPassword(password),
      confirm: password !== confirm ? 'Şifreler eşleşmiyor.' : undefined,
    }
    const nextConsents = {
      kvkk: kvkk ? undefined : 'KVKK aydınlatma metnini onaylamanız gerekir.',
      terms: terms ? undefined : 'Kullanım koşullarını onaylamanız gerekir.',
    }
    setErrors(next)
    setConsentErrors(nextConsents)
    setFormError(null)
    if (next.password || next.confirm || nextConsents.kvkk || nextConsents.terms) return
    setBusy(true)
    try {
      await acceptInvitation(token, password, { kvkk, terms, marketing })
      history.replaceState(null, '', '#/davet')
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION') {
        // Alan hataları: token korunur, form kalır.
        const f = err.fields ?? {}
        setErrors({ password: f.password })
        setConsentErrors({ kvkk: f['consents.kvkk'], terms: f['consents.terms'] })
        if (!f.password && !f['consents.kvkk'] && !f['consents.terms'])
          setFormError('Formdaki bilgileri kontrol edin.')
      } else if (err instanceof ApiError && err.status === 400) {
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
          <Checkbox id="invite-kvkk" checked={kvkk} onChange={setKvkk} error={consentErrors.kvkk}>
            KVKK aydınlatma metnini okudum, anladım. ({textLink('Metni oku', 'KVKK aydınlatma metni')})
          </Checkbox>
          <Checkbox id="invite-terms" checked={terms} onChange={setTerms} error={consentErrors.terms}>
            Kullanım koşullarını kabul ediyorum. ({textLink('Metni oku', 'Kullanım koşulları')})
          </Checkbox>
          <Checkbox id="invite-marketing" checked={marketing} onChange={setMarketing}>
            Kampanya ve duyuru e-postaları almak istiyorum. (İsteğe bağlı)
          </Checkbox>
          <Button type="submit" block disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Şifreyi belirle'}
          </Button>
        </form>
      )}
      {textModal && (
        <PageTextModal
          slug={textModal === 'KVKK aydınlatma metni' ? 'kvkk' : 'kullanim-kosullari'}
          title={textModal}
          onClose={() => setTextModal(null)}
        />
      )}
    </AuthCard>
  )
}
