// GR-YON-001: Admin paneli ortak düzeni. Üst çubuk + yan menü (masaüstü) / üst menü (mobil).
import type { ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { Link } from '../Link'
import { BrandLogo } from '../shop/brand'
import { replace, useRoute } from '../router'
import { Button } from '../ui/components'
import { useFailedNotificationCount } from './useFailedNotifications'
import { useOrderSummary } from './orderSummary'

const LINKS = [
  { to: '/yonetim', label: 'Ana sayfa', match: (p: string) => p === '/yonetim' },
  {
    to: '/yonetim/siparisler',
    label: 'Siparişler',
    match: (p: string) => p.startsWith('/yonetim/siparisler'),
  },
  { to: '/yonetim/bayiler', label: 'Bayiler', match: (p: string) => p.startsWith('/yonetim/bayiler') },
  { to: '/yonetim/urunler', label: 'Ürünler', match: (p: string) => p.startsWith('/yonetim/urunler') },
  {
    to: '/yonetim/urun-gruplari',
    label: 'Ürün grupları',
    match: (p: string) => p.startsWith('/yonetim/urun-gruplari'),
  },
  { to: '/yonetim/gorseller', label: 'Görseller', match: (p: string) => p.startsWith('/yonetim/gorseller') },
  {
    to: '/yonetim/bannerlar',
    label: 'Kampanya görselleri',
    match: (p: string) => p.startsWith('/yonetim/bannerlar'),
  },
  {
    to: '/yonetim/bildirimler',
    label: 'Bildirimler',
    match: (p: string) => p.startsWith('/yonetim/bildirimler'),
  },
]

export function AdminLayout({
  title,
  actions,
  children,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  const { state, logout } = useAuth()
  const { path } = useRoute()
  const failed = useFailedNotificationCount()
  const orders = useOrderSummary()
  const name = state.status === 'authenticated' ? state.user.name : ''
  return (
    <div className="ui-admin">
      <header className="ui-admin__top">
        <div className="ui-admin__brand">
          <BrandLogo size="sm" suffix="Yönetim" />
        </div>
        <div className="ui-admin__user">
          <span>{name}</span>
          <Button
            variant="secondary"
            size="sm"
            className="ui-button--touch"
            onClick={async () => {
              await logout()
              replace('/yonetim/giris')
            }}
          >
            Çıkış
          </Button>
        </div>
      </header>
      <nav className="ui-admin__nav" aria-label="Yönetim menüsü">
        {LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="ui-admin__link"
            aria-current={l.match(path) ? 'page' : undefined}
          >
            {l.label}
            {l.to === '/yonetim/siparisler' && orders !== null && orders.submitted > 0 && (
              <span className="ui-navbadge">
                {orders.submitted}
                <span className="visually-hidden"> yeni sipariş</span>
              </span>
            )}
            {l.to === '/yonetim/bildirimler' && failed > 0 && (
              <span className="ui-navbadge">
                {failed}
                <span className="visually-hidden"> başarısız</span>
              </span>
            )}
          </Link>
        ))}
      </nav>
      <main className="ui-admin__main">
        <div className="ui-admin__head">
          <h1>{title}</h1>
          {actions}
        </div>
        {children}
      </main>
    </div>
  )
}
