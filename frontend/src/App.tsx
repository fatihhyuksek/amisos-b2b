import { Fragment, useEffect, type ReactNode } from 'react'
import { BrandLogo } from './shop/brand'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { AdminHome } from './admin/AdminHome'
import { BannerListPage } from './admin/BannerListPage'
import { OrderSummaryProvider } from './admin/OrderSummaryProvider'
import { ReportsPage } from './admin/ReportsPage'
import { OrderListPage } from './admin/OrderListPage'
import { AdminOrderDetailPage } from './admin/OrderDetailPage'
import { NotificationsPage } from './admin/NotificationsPage'
import { DealerCreatePage } from './admin/DealerCreatePage'
import { DealerDetailPage } from './admin/DealerDetailPage'
import { DealerListPage } from './admin/DealerListPage'
import { MediaLibraryPage } from './admin/MediaLibraryPage'
import { ProductFormPage } from './admin/ProductFormPage'
import { ProductGroupsPage } from './admin/ProductGroupsPage'
import { ProductImportPage } from './admin/ProductImportPage'
import { ProductListPage } from './admin/ProductListPage'
import { CatalogPage } from './pages/CatalogPage'
import { HomePage } from './pages/HomePage'
import { AccountPage } from './pages/AccountPage'
import { ContactPage } from './pages/ContactPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { InfoPage } from './pages/InfoPage'
import { QuickOrderPage } from './pages/QuickOrderPage'
import { AdminAccountPage } from './admin/AdminAccountPage'
import { AuditPage } from './admin/AuditPage'
import { SiteSettingsPage } from './admin/SiteSettingsPage'
import { CartPage } from './pages/CartPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { CartProvider } from './shop/CartProvider'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { DesignPreview } from './design/DesignPreview'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ApplyPage } from './pages/ApplyPage'
import { InvitationPage } from './pages/InvitationPage'
import { LoginPage } from './pages/LoginPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { safeReturnPath, currentPath } from './shop/returnTo'
import { matchPath, replace, useRoute } from './router'
import { Alert, AuthCard, Button } from './ui/components'

function LoadingScreen() {
  return (
    <main className="ui-auth" aria-busy="true">
      <div className="ui-auth__brand">
        <BrandLogo size="lg" />
      </div>
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

/**
 * Korumalı alan: GR-YON-001 (bayi Admin sayfalarına giremez), GR-BAYI-007.
 * Oturumsuz kullanıcı girişe yönlenir ve girişten sonra geldiği sayfaya döner (K-66).
 */
function Protected({ area, children }: { area: 'dealer' | 'admin'; children: ReactNode }) {
  const { state } = useAuth()
  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <ServerError />
  if (state.status === 'anonymous') {
    const back = safeReturnPath(currentPath())
    const base = area === 'admin' ? '/yonetim/giris' : '/giris'
    return <Redirect to={back && back !== '/' ? `${base}?donus=${encodeURIComponent(back)}` : base} />
  }
  const isAdmin = state.user.type === 'admin'
  if (area === 'admin' && !isAdmin) return <Forbidden />
  if (area === 'dealer' && isAdmin) return <Redirect to="/yonetim" />
  return children
}

/** Açık vitrin (K-66): oturum durumu belli olunca çizilir; oturum türü değişince sayfa yeniden kurulur. */
function Public({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  if (state.status === 'loading') return <LoadingScreen />
  const kind = state.status === 'authenticated' ? state.user.type : 'guest'
  return <Fragment key={kind}>{children}</Fragment>
}

/** Giriş sayfaları: oturum varsa ilgili ana sayfaya (veya geldiği sayfaya) yönlendirir. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const { query } = useRoute()
  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'authenticated') {
    const back = safeReturnPath(query.get('donus'))
    if (state.user.type === 'admin') return <Redirect to={back?.startsWith('/yonetim') ? back : '/yonetim'} />
    return <Redirect to={back && !back.startsWith('/yonetim') ? back : '/'} />
  }
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
    case '/basvuru':
      return <ApplyPage />
    case '/davet':
      return <InvitationPage />
    case '/':
      return (
        <Public>
          <HomePage />
        </Public>
      )
    case '/katalog':
      return (
        <Public>
          <CatalogPage />
        </Public>
      )
    case '/hakkimizda':
    case '/sss':
    case '/teslimat':
    case '/kvkk':
    case '/kullanim-kosullari':
      return (
        <Public>
          <InfoPage key={path} slug={path.slice(1)} />
        </Public>
      )
    case '/iletisim':
      return (
        <Public>
          <ContactPage />
        </Public>
      )
    case '/favorilerim':
      return (
        <Protected area="dealer">
          <FavoritesPage />
        </Protected>
      )
    case '/hizli-siparis':
      return (
        <Protected area="dealer">
          <QuickOrderPage />
        </Protected>
      )
    case '/sepet':
      return (
        <Protected area="dealer">
          <CartPage />
        </Protected>
      )
    case '/sepet/onay':
      return (
        <Protected area="dealer">
          <CheckoutPage />
        </Protected>
      )
    case '/siparislerim':
      return (
        <Protected area="dealer">
          <OrdersPage />
        </Protected>
      )
    case '/hesabim':
      return (
        <Protected area="dealer">
          <AccountPage />
        </Protected>
      )
    case '/yonetim':
      return (
        <Protected area="admin">
          <AdminHome />
        </Protected>
      )
    case '/yonetim/bayiler':
      return (
        <Protected area="admin">
          <DealerListPage />
        </Protected>
      )
    case '/yonetim/bayiler/yeni':
      return (
        <Protected area="admin">
          <DealerCreatePage />
        </Protected>
      )
    case '/yonetim/urunler':
      return (
        <Protected area="admin">
          <ProductListPage />
        </Protected>
      )
    case '/yonetim/urunler/yeni':
      return (
        <Protected area="admin">
          <ProductFormPage />
        </Protected>
      )
    case '/yonetim/urunler/ice-aktar':
      return (
        <Protected area="admin">
          <ProductImportPage />
        </Protected>
      )
    case '/yonetim/urun-gruplari':
      return (
        <Protected area="admin">
          <ProductGroupsPage />
        </Protected>
      )
    case '/yonetim/gorseller':
      return (
        <Protected area="admin">
          <MediaLibraryPage />
        </Protected>
      )
    case '/yonetim/raporlar':
      return (
        <Protected area="admin">
          <ReportsPage />
        </Protected>
      )
    case '/yonetim/siparisler':
      return (
        <Protected area="admin">
          <OrderListPage />
        </Protected>
      )
    case '/yonetim/bildirimler':
      return (
        <Protected area="admin">
          <NotificationsPage />
        </Protected>
      )
    case '/yonetim/site-ayarlari':
      return (
        <Protected area="admin">
          <SiteSettingsPage />
        </Protected>
      )
    case '/yonetim/islem-gecmisi':
      return (
        <Protected area="admin">
          <AuditPage />
        </Protected>
      )
    case '/yonetim/hesabim':
      return (
        <Protected area="admin">
          <AdminAccountPage />
        </Protected>
      )
    case '/yonetim/bannerlar':
      return (
        <Protected area="admin">
          <BannerListPage />
        </Protected>
      )
    default: {
      const adminOrder = matchPath(path, '/yonetim/siparisler/:id')
      if (adminOrder)
        return (
          <Protected area="admin">
            <AdminOrderDetailPage id={adminOrder.id} />
          </Protected>
        )
      const order = matchPath(path, '/siparislerim/:id')
      if (order)
        return (
          <Protected area="dealer">
            <OrderDetailPage id={order.id} />
          </Protected>
        )
      const product = matchPath(path, '/yonetim/urunler/:id')
      if (product)
        return (
          <Protected area="admin">
            <ProductFormPage id={product.id} />
          </Protected>
        )
      const shopProduct = matchPath(path, '/urun/:id')
      if (shopProduct)
        return (
          <Public>
            <ProductDetailPage id={shopProduct.id} />
          </Public>
        )
      const shopGroup = matchPath(path, '/katalog/:slug')
      if (shopGroup)
        return (
          <Public>
            <CatalogPage key={shopGroup.slug} groupSlug={shopGroup.slug} />
          </Public>
        )
      const detail = matchPath(path, '/yonetim/bayiler/:id')
      if (detail)
        return (
          <Protected area="admin">
            <DealerDetailPage id={detail.id} />
          </Protected>
        )
      return <Redirect to="/" />
    }
  }
}

/** Sepet bayiye aittir: oturum sahibi değişince sepet durumu sıfırlanır. */
function DealerCart({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const key = state.status === 'authenticated' ? state.user.id : 'anon'
  return <CartProvider key={key}>{children}</CartProvider>
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
      <DealerCart>
        <OrderSummaryProvider>
          <Routes />
        </OrderSummaryProvider>
      </DealerCart>
    </AuthProvider>
  )
}

export default App
