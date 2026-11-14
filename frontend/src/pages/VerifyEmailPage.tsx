// E-posta doğrulama bağlantısı (/eposta-dogrula?token=...). Geçersiz token 400 döner.
import { useEffect, useState } from 'react'
import { verifyEmail } from '../api'
import { Link } from '../Link'
import { useRoute } from '../router'
import { Alert, AuthCard } from '../ui/components'

// StrictMode efekti iki kez çalıştırır; aynı token için tek istek atılır, sonuç paylaşılır.
// Tek kullanımlık token ikinci istekte 400 alıp yanlış "geçersiz" göstermesin diye.
const inflight = new Map<string, Promise<void>>()

function verifyOnce(token: string): Promise<void> {
  let p = inflight.get(token)
  if (!p) {
    p = verifyEmail(token)
    inflight.set(token, p)
    // Başarı ve 400 sonucu önbellekte kalır; geçici hatalarda (429, ağ) yeniden denemeye izin ver.
    p.catch((err: unknown) => {
      if ((err as { status?: number }).status !== 400) inflight.delete(token)
    })
  }
  return p
}

type State = 'loading' | 'ok' | 'invalid' | 'rate' | 'error'

export function VerifyEmailPage() {
  const token = useRoute().query.get('token') ?? ''
  const [state, setState] = useState<State>(token ? 'loading' : 'invalid')

  useEffect(() => {
    if (!token) return
    let active = true
    verifyOnce(token)
      .then(() => active && setState('ok'))
      .catch((err: unknown) => {
        if (active) {
          const status = (err as { status?: number }).status
          setState(status === 400 ? 'invalid' : status === 429 ? 'rate' : 'error')
        }
      })
    return () => {
      active = false
    }
  }, [token])

  return (
    <AuthCard title="E-posta doğrulama" footer={<Link to="/giris">Girişe git</Link>}>
      {state === 'loading' && <p aria-live="polite">E-posta adresiniz doğrulanıyor…</p>}
      {state === 'ok' && (
        <Alert tone="info">
          E-postanız doğrulandı, başvurunuz Admin onayına gönderildi. Onay en geç 2 iş günü içinde tamamlanır.
        </Alert>
      )}
      {state === 'invalid' && <Alert tone="danger">Doğrulama bağlantısı geçersiz veya süresi dolmuş.</Alert>}
      {state === 'rate' && (
        <Alert tone="danger">Çok fazla deneme yaptınız. Bir dakika sonra tekrar deneyin.</Alert>
      )}
      {state === 'error' && (
        <Alert tone="danger">Doğrulama yapılamadı. Lütfen daha sonra tekrar deneyin.</Alert>
      )}
    </AuthCard>
  )
}
