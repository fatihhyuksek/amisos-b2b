// GR-YON-001: Admin paneli ortak düzeni. Üst çubuk + yan menü (masaüstü) / üst menü (mobil).
import type { ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { Link } from '../Link'
import { replace, useRoute } from '../router'
import { Button } from '../ui/components'

const LINKS = [
  { to: '/yonetim', label: 'Ana sayfa', match: (p: string) => p === '/yonetim' },
  { to: '/yonetim/bayiler', label: 'Bayiler', match: (p: string) => p.startsWith('/yonetim/bayiler') },
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
  const name = state.status === 'authenticated' ? state.user.name : ''
  return (
    <div className="ui-admin">
      <header className="ui-admin__top">
        <div className="ui-admin__brand">Amisos B2B Yönetim</div>
        <div className="ui-admin__user">
          <span>{name}</span>
          <Button
            variant="secondary"
            size="sm"
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
