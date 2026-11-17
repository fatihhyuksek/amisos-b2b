// GR-YON-001, K-78: Yönetim paneli kabuğu. Koyu kenar menü (gruplu, ikonlu, daraltılabilir; mobilde çekmece),
// üst çubukta kırıntı yolu, genel arama (Ctrl+K), "Yeni" menüsü ve bildirim merkezi.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { Link } from '../Link'
import { BrandLogo } from '../shop/brand'
import { replace, useRoute } from '../router'
import { Icon } from '../ui/Icon'
import { CommandPalette } from './CommandPalette'
import { MenuButton } from './kit'
import { CREATE_ACTIONS, NAV_GROUPS, currentNav, navMatches, type NavBadge } from './nav'
import { NotificationBell } from './NotificationBell'
import { useOrderSummary } from './orderSummary'
import { useFailedNotificationCount } from './useFailedNotifications'
import { usePendingApplications } from './useShellCounts'

const PREF_KEY = 'admin.nav.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(PREF_KEY, v ? '1' : '0')
  } catch {
    /* depolama kapalı olabilir */
  }
}

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || '')

export function AdminLayout({
  title,
  meta,
  actions,
  children,
}: {
  title: string
  /** Başlığın yanında (ör. durum etiketi, tarih). */
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const { state, logout } = useAuth()
  const { path } = useRoute()
  const failed = useFailedNotificationCount()
  const orders = useOrderSummary()
  const applications = usePendingApplications()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawer, setDrawer] = useState(false)
  const [palette, setPalette] = useState(false)
  const sideRef = useRef<HTMLElement>(null)
  const name = state.status === 'authenticated' ? state.user.name : ''
  const email = state.status === 'authenticated' ? state.user.email : ''
  const nav = currentNav(path)

  const badgeFor = (b?: NavBadge): { n: number; label: string } | null => {
    if (!b) return null
    const n = b === 'orders' ? (orders?.submitted ?? 0) : b === 'applications' ? applications : failed
    const label =
      b === 'orders' ? 'yeni sipariş' : b === 'applications' ? 'onay bekleyen başvuru' : 'başarısız e-posta'
    return n > 0 ? { n, label } : null
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false)
    }
    window.addEventListener('keydown', onKey)
    sideRef.current?.querySelector<HTMLElement>('a.adm-nav__link')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      writeCollapsed(!c)
      return !c
    })
  }, [])

  return (
    <div className="ui-admin" data-collapsed={collapsed || undefined} data-drawer={drawer || undefined}>
      <aside className="ui-admin__side" ref={sideRef}>
        <div className="adm-side__brand">
          <Link to="/yonetim" aria-label="AMİSOS B2B Yönetim, ana sayfa" className="adm-side__logo">
            <BrandLogo size="sm" textless={collapsed} />
          </Link>
          <button
            type="button"
            className="adm-side__collapse"
            aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
            aria-pressed={collapsed}
            onClick={toggleCollapsed}
          >
            <Icon name="panel" />
          </button>
        </div>
        <nav className="adm-nav" aria-label="Yönetim menüsü">
          {NAV_GROUPS.map((g) => (
            <div key={g.label} className="adm-nav__group" role="group" aria-label={g.label}>
              <p className="adm-nav__title" aria-hidden="true">
                {g.label}
              </p>
              {g.items.map((it) => {
                const b = badgeFor(it.badge)
                const current = navMatches(path, it.to)
                return (
                  <Link
                    key={it.to}
                    to={it.to}
                    className="adm-nav__link"
                    aria-current={current ? 'page' : undefined}
                    title={collapsed ? it.label : undefined}
                    onClick={() => setDrawer(false)}
                  >
                    <Icon name={it.icon} />
                    <span className="adm-nav__label">{it.label}</span>
                    {b && (
                      <span className="adm-nav__badge num">
                        {b.n}
                        <span className="visually-hidden"> {b.label}</span>
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="adm-side__foot">
          <MenuButton
            label="Hesap menüsü"
            className="adm-user"
            up
            align="left"
            items={[
              { label: 'Hesabım', icon: 'user', to: '/yonetim/hesabim' },
              { label: 'Vitrini gör', icon: 'external', to: '/' },
              {
                label: 'Çıkış',
                icon: 'logout',
                divider: true,
                onSelect: async () => {
                  await logout()
                  replace('/yonetim/giris')
                },
              },
            ]}
          >
            <span className="adm-user__avatar" aria-hidden="true">
              {(name || email || 'A').charAt(0).toLocaleUpperCase('tr')}
            </span>
            <span className="adm-user__text">
              <span className="adm-user__name">{name || 'Yönetici'}</span>
              <span className="adm-user__mail">{email}</span>
            </span>
            <span className="adm-user__chev" aria-hidden="true">
              <Icon name="chevronDown" />
            </span>
          </MenuButton>
        </div>
      </aside>
      {drawer && (
        <button
          type="button"
          className="adm-scrim"
          aria-label="Menüyü kapat"
          onClick={() => setDrawer(false)}
        />
      )}

      <div className="ui-admin__body">
        <header className="ui-admin__top">
          <button
            type="button"
            className="adm-iconbtn adm-top__menu"
            aria-label="Menüyü aç"
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          >
            <Icon name="menu" />
          </button>
          <nav className="adm-crumbs" aria-label="Konum">
            {nav && (
              <>
                {nav.group !== nav.item.label && (
                  <>
                    <span>{nav.group}</span>
                    <Icon name="chevronRight" />
                  </>
                )}
                {path === nav.item.to ? (
                  <span aria-current="page">{nav.item.label}</span>
                ) : (
                  <Link to={nav.item.to}>{nav.item.label}</Link>
                )}
              </>
            )}
            {!nav && path === '/yonetim/hesabim' && <span aria-current="page">Hesabım</span>}
          </nav>
          <button
            type="button"
            className="adm-search"
            aria-label="Ara: sipariş, bayi, ürün veya sayfa"
            aria-keyshortcuts="Control+K Meta+K"
            onClick={() => setPalette(true)}
          >
            <Icon name="search" />
            <span className="adm-search__text">Ara…</span>
            <kbd className="adm-search__kbd">{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
          </button>
          <div className="adm-top__right">
            <MenuButton
              label="Yeni oluştur"
              className="adm-btn adm-btn--primary adm-top__new"
              items={CREATE_ACTIONS.map((c) => ({ label: c.label, icon: c.icon, to: c.to }))}
            >
              <Icon name="plus" />
              <span className="adm-top__newtext">Yeni</span>
              <Icon name="chevronDown" />
            </MenuButton>
            <NotificationBell />
          </div>
        </header>
        <main className="ui-admin__main" id="admin-main">
          <div className="ui-admin__head">
            <div className="ui-admin__title">
              <h1>{title}</h1>
              {meta}
            </div>
            {actions && <div className="ui-admin__actions adm-noprint">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}
