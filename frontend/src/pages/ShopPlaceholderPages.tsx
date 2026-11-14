// Başlıktaki bağlantıların boşa düşmemesi için yer tutucu sayfalar.
// Sepet ve Siparişlerim sonraki adımda gerçek ekranlarla değişecek (GR-SIP-006, GR-SIP-008).
import { useAuth } from '../auth/useAuth'
import { Link } from '../Link'
import { replace } from '../router'
import { CONTACT, PHONE_HREF } from '../shop/contact'
import { Button, EmptyState } from '../ui/components'
import { ShopLayout } from './ShopLayout'

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <ShopLayout>
      <h1>{title}</h1>
      <div className="ui-card">
        <EmptyState
          title="Bu bölüm hazırlanıyor"
          action={
            <Link to="/katalog" className="ui-button ui-button--primary">
              Kataloğa git
            </Link>
          }
        >
          Kısa süre içinde buradan işlem yapabileceksiniz.
        </EmptyState>
      </div>
    </ShopLayout>
  )
}

export function AccountPage() {
  const { state, logout } = useAuth()
  const user = state.status === 'authenticated' ? state.user : null
  return (
    <ShopLayout>
      <h1>Hesabım</h1>
      <section className="ui-card ui-card__body ui-account" aria-label="Hesap bilgileri">
        <dl className="ui-dl">
          <div>
            <dt>Bayi</dt>
            <dd>{user?.name}</dd>
          </div>
          <div>
            <dt>E-posta</dt>
            <dd>{user?.email}</dd>
          </div>
        </dl>
        <p className="muted">
          Bilgilerinizde değişiklik için bize ulaşın: <a href={PHONE_HREF}>{CONTACT.phone}</a>
        </p>
        <div>
          <Button
            variant="secondary"
            icon="logout"
            onClick={async () => {
              await logout()
              replace('/giris')
            }}
          >
            Çıkış yap
          </Button>
        </div>
      </section>
    </ShopLayout>
  )
}
