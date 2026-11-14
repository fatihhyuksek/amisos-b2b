// Bayi portalı ortak düzeni: üst çubukta bayi adı ve Çıkış (GR-BAYI-007).
import type { ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { Link } from '../Link'
import { replace } from '../router'
import { Button } from '../ui/components'

export function ShopLayout({ search, children }: { search?: ReactNode; children: ReactNode }) {
  const { state, logout } = useAuth()
  const name = state.status === 'authenticated' ? state.user.name : ''
  return (
    <div className="ui-shop">
      <header className="ui-shop__bar">
        <Link to="/" className="ui-shop__brand">
          Amisos B2B
        </Link>
        <div className="ui-shop__search">{search}</div>
        <div className="ui-shop__user">
          <span title={name}>{name}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await logout()
              replace('/giris')
            }}
          >
            Çıkış
          </Button>
        </div>
      </header>
      <main className="ui-shop__main">{children}</main>
    </div>
  )
}
