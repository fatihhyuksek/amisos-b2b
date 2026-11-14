import { useEffect, type ReactNode } from 'react'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { DesignPreview } from './design/DesignPreview'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LoginPage } from './pages/LoginPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { WelcomePage } from './pages/WelcomePage'
import { replace, useRoute } from './router'
import { Alert, AuthCard, Button } from './ui/components'

function LoadingScreen() {
  return (
    <main className="ui-auth" aria-busy="true">
      <div className="ui-auth__brand">Amisos B2B</div>
      <div className="ui-card ui-auth__card">
        <div className="ui-card__body ui-auth__body">
          <div className="ui-skeleton" style={{ height: '1.75rem', width: '60%' }} />
          <div className="ui-skeleton" style={{ height: 'var(--control-height)' }} />
          <div className="ui-skeleton" style={{ height: 'var(--control-height)' }} />
          <span className="visually-hidden" role="status">
            Yükleniyor…
          </span>
        </div>
      </div>
    </main>
  )
}

function Redirect({ to }: { to: string }) {
  useEffect(() => replace(to), [to])
  return <LoadingScreen />
}

/** Korumalı alan: GR-YON-001 (bayi Admin sayfalarına giremez), GR-BAYI-007. */
function Protected({ area, children }: { area: 'dealer' | 'admin'; children: ReactNode }) {
  const { state } = useAuth()
  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <ServerError />
  if (state.status === 'anonymous') return <Redirect to={area === 'admin' ? '/yonetim/giris' : '/giris'} />
  const isAdmin = state.user.type === 'admin'
  if (area === 'admin' && !isAdmin) return <Forbidden />
  if (area === 'dealer' && isAdmin) return <Redirect to="/yonetim" />
  return children
}

/** Giriş sayfaları: oturum varsa ilgili ana sayfaya yönlendirir. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'authenticated')
    return <Redirect to={state.user.type === 'admin' ? '/yonetim' : '/'} />
  return children
}

function Forbidden() {
  const { logout } = useAuth()
  return (
    <AuthCard title="Erişim yok">
      <Alert tone="danger">Bu sayfaya erişim yetkiniz yok.</Alert>
      <Button
        variant="secondary"
        block
        onClick={async () => {
          await logout()
          replace('/giris')
        }}
      >
        Çıkış yap
      </Button>
    </AuthCard>
  )
}

function ServerError() {
  return (
    <AuthCard title="Sunucuya ulaşılamadı">
      <Alert tone="danger">Oturum durumu alınamadı. Lütfen sayfayı yenileyin.</Alert>
      <Button block onClick={() => location.reload()}>
        Yenile
      </Button>
    </AuthCard>
  )
}

function Routes() {
  const { path } = useRoute()
  switch (path) {
    case '/tasarim':
      return <DesignPreview />
    case '/giris':
      return (
        <GuestOnly>
          <LoginPage type="dealer" />
        </GuestOnly>
      )
    case '/yonetim/giris':
      return (
        <GuestOnly>
          <LoginPage type="admin" />
        </GuestOnly>
      )
    case '/sifremi-unuttum':
      return <ForgotPasswordPage />
    case '/sifre-sifirla':
      return <ResetPasswordPage />
    case '/eposta-dogrula':
      return <VerifyEmailPage />
    case '/':
      return (
        <Protected area="dealer">
          <WelcomePage area="dealer" />
        </Protected>
      )
    case '/yonetim':
      return (
        <Protected area="admin">
          <WelcomePage area="admin" />
        </Protected>
      )
    default:
      return <Redirect to="/" />
  }
}

function App() {
  // Önizlemede seçilen tema tüm sayfalarda uygulanır.
  useEffect(() => {
    try {
      const t = localStorage.getItem('theme')
      if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
    } catch {
      /* depolama kapalı olabilir */
    }
  }, [])
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  )
}

export default App
