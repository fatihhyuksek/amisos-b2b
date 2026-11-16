// Bayi mağaza kabuğu: duyuru şeridi, başlık (logo, arama, Siparişlerim / Hesabım / Sepetim),
// kategori menüsü, mobil çekmece ve alt bilgi. GR-BAYI-007 (Çıkış), GR-URN-003 (arama, gruplar), K-11.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { CatalogGroup } from '../api'
import { useAuth } from '../auth/useAuth'
import { Link } from '../Link'
import { navigate, replace, useRoute } from '../router'
import { BrandLogo } from '../shop/brand'
import { catalogHref } from '../shop/catalogHref'
import { phoneHref, whatsappLink } from '../shop/contact'
import { useCartCount } from '../shop/cartCount'
import { CartToast } from '../shop/CartToast'
import { useShopMode, type ShopMode } from '../shop/mode'
import { loginHref } from '../shop/returnTo'
import { useSite } from '../shop/site'
import { useCatalogGroups } from '../shop/useCatalogGroups'
import { useMediaQuery } from '../shop/useMediaQuery'
import { Button } from '../ui/components'
import { GroupThumb } from '../ui/catalog'
import { Icon, type IconName } from '../ui/Icon'

function useLogout() {
  const { logout } = useAuth()
  return async () => {
    await logout()
    replace('/')
  }
}

// ---------- Duyuru şeridi (metin Admin "Site ayarları"ndan; boşsa şerit gizlenir) ----------
function AnnouncementStrip() {
  const site = useSite()
  if (!site.announcement) return null
  return (
    <div className="ui-strip">
      <p>
        {site.announcement} <span aria-hidden="true">·</span>{' '}
        <a href={phoneHref(site.contact)}>
          <span className="visually-hidden">Telefon: </span>
          {site.contact.phone}
        </a>
      </p>
    </div>
  )
}

/** Admin vitrini gezerken fiyatlar gizlidir (K-66); panele dönüş her zaman görünür. */
function AdminBar() {
  const doLogout = useLogout()
  return (
    <div className="ui-adminbar">
      <div className="ui-shop__container ui-adminbar__row">
        <p>
          <Icon name="eye" />
          Yönetici olarak vitrini görüntülüyorsunuz; fiyat ve stok bayilere görünür.
        </p>
        <span className="ui-adminbar__actions">
          <Link to="/yonetim" className="ui-adminbar__link">
            Yönetim paneli
          </Link>
          <button type="button" className="ui-adminbar__link" onClick={doLogout}>
            Çıkış yap
          </button>
        </span>
      </div>
    </div>
  )
}

// ---------- Arama (Enter veya ARA; barkod okuyucu da Enter gönderir) ----------
function SearchForm({ initial, idSuffix }: { initial: string; idSuffix: string }) {
  const [value, setValue] = useState(initial)
  const inputId = `shop-search-${idSuffix}`
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    navigate(catalogHref({ q: value.trim() }))
  }
  return (
    <form role="search" className="ui-pillsearch" onSubmit={onSubmit}>
      <label htmlFor={inputId} className="visually-hidden">
        Ürün ara
      </label>
      <Icon name="search" />
      <input
        id={inputId}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Ürün adı, barkod, kod"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="ui-pillsearch__submit">
        Ara
      </button>
    </form>
  )
}

// ---------- Hesabım menüsü ----------
function AccountMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const doLogout = useLogout()

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      className="ui-popover-wrap"
      ref={rootRef}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="ui-headlink"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="user" />
        <span className="ui-headlink__text">
          <span className="ui-headlink__label">Hesabım</span>
          <span className="ui-headlink__sub" title={name}>
            {name}
          </span>
        </span>
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div id="account-menu" className="ui-popover ui-popover--end">
          <div className="ui-popover__head">
            <strong>{name}</strong>
            <span className="muted">{email}</span>
          </div>
          <Link to="/hesabim" className="ui-popover__item" onClick={() => setOpen(false)}>
            <Icon name="user" />
            Hesabım
          </Link>
          <Link to="/siparislerim" className="ui-popover__item" onClick={() => setOpen(false)}>
            <Icon name="orders" />
            Siparişlerim
          </Link>
          <Link to="/favorilerim" className="ui-popover__item" onClick={() => setOpen(false)}>
            <Icon name="heart" />
            Favorilerim
          </Link>
          <Link to="/hesabim?sekme=adresler" className="ui-popover__item" onClick={() => setOpen(false)}>
            <Icon name="pin" />
            Adreslerim
          </Link>
          <button type="button" className="ui-popover__item" onClick={doLogout}>
            <Icon name="logout" />
            Çıkış yap
          </button>
        </div>
      )}
    </div>
  )
}

function CartLink({ compact }: { compact?: boolean }) {
  const count = useCartCount()
  return (
    <Link
      to="/sepet"
      className={compact ? 'ui-headlink ui-headlink--icon' : 'ui-headlink'}
      aria-label={`Sepetim, ${count} ürün`}
    >
      <span className="ui-headlink__iconwrap">
        <Icon name="bag" />
        <span className="ui-countbadge" aria-hidden="true" data-empty={count === 0}>
          {count}
        </span>
      </span>
      {!compact && <span className="ui-headlink__label">Sepetim</span>}
    </Link>
  )
}

// ---------- Kategori menüsü (masaüstü): sığmayan gruplar yalnızca "Tüm kategoriler"de ----------
function AllCategories({ groups, activeId }: { groups: CatalogGroup[]; activeId: string | null }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { path, query } = useRoute()
  const routeKey = `${path}?${query.toString()}`
  const [lastRoute, setLastRoute] = useState(routeKey)
  if (routeKey !== lastRoute) {
    setLastRoute(routeKey)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      className="ui-popover-wrap"
      ref={rootRef}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="ui-catnav__all"
        aria-expanded={open}
        aria-controls="all-categories"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="grid" />
        Tüm kategoriler
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div id="all-categories" className="ui-mega">
          <div className="ui-mega__head">
            <h2>Kategoriler</h2>
            <Link
              to="/katalog"
              className="ui-sectionhead__more"
              aria-current={activeId === '' ? 'page' : undefined}
            >
              Tüm ürünler
              <Icon name="arrowRight" />
            </Link>
          </div>
          <ul className="ui-mega__grid">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  to={catalogHref({ grup: g.id })}
                  className="ui-mega__item"
                  aria-current={activeId === g.id ? 'page' : undefined}
                >
                  <GroupThumb src={g.thumbUrl} />
                  <span className="ui-mega__name">{g.name}</span>
                  <span className="ui-mega__count num">{g.productCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function CategoryNav({ groups, activeId }: { groups: CatalogGroup[]; activeId: string | null }) {
  const listRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLUListElement>(null)
  const [fit, setFit] = useState(groups.length)

  // Önce ölçülür, sonra sığan kadar grup gösterilir (sığmayanlar odak sırasına girmez).
  useLayoutEffect(() => {
    const box = listRef.current
    const measure = measureRef.current
    if (!box || !measure) return
    const calc = () => {
      const avail = box.clientWidth
      const gap = parseFloat(getComputedStyle(measure).columnGap) || 0
      let used = 0
      let n = 0
      for (const li of Array.from(measure.children) as HTMLElement[]) {
        const w = li.offsetWidth + (n > 0 ? gap : 0)
        if (used + w > avail) break
        used += w
        n++
      }
      setFit(n)
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(box)
    return () => ro.disconnect()
  }, [groups])

  const items = (list: CatalogGroup[]) =>
    list.map((g) => (
      <li key={g.id}>
        <Link
          to={catalogHref({ grup: g.id })}
          className="ui-catnav__link"
          aria-current={activeId === g.id ? 'page' : undefined}
        >
          {g.name}
        </Link>
      </li>
    ))

  return (
    <nav className="ui-catnav" aria-label="Kategoriler">
      <div className="ui-catnav__inner">
        <AllCategories groups={groups} activeId={activeId} />
        <div className="ui-catnav__fit" ref={listRef}>
          <ul className="ui-catnav__list">{items(groups.slice(0, fit))}</ul>
          <ul className="ui-catnav__list ui-catnav__measure" ref={measureRef} aria-hidden="true">
            {groups.map((g) => (
              <li key={g.id}>
                <span className="ui-catnav__link">{g.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  )
}

// ---------- Mobil çekmece ----------
function Drawer({
  open,
  onClose,
  groups,
  activeId,
  name,
  mode,
}: {
  open: boolean
  onClose: () => void
  groups: CatalogGroup[]
  activeId: string | null
  name: string
  mode: ShopMode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const doLogout = useLogout()
  const count = useCartCount()
  const site = useSite()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const link = (to: string, icon: IconName, label: string, extra?: ReactNode) => (
    <li>
      <Link to={to} className="ui-drawer__item" onClick={onClose}>
        <Icon name={icon} />
        <span className="ui-popover__grow">{label}</span>
        {extra}
      </Link>
    </li>
  )

  return (
    <dialog
      ref={ref}
      className="ui-drawer"
      aria-label="Menü"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="ui-drawer__panel">
        <div className="ui-drawer__head">
          <BrandLogo size="sm" />
          <button type="button" className="ui-iconbtn" onClick={onClose} aria-label="Menüyü kapat">
            <Icon name="close" />
          </button>
        </div>
        {mode === 'dealer' && (
          <p className="ui-drawer__user">
            <Icon name="user" />
            <span>{name}</span>
          </p>
        )}
        <ul className="ui-drawer__list">
          {mode === 'guest' && (
            <>
              {link(loginHref(), 'user', 'Giriş yap')}
              {link('/basvuru', 'store', 'Bayi ol')}
            </>
          )}
          {mode === 'dealer' && (
            <>
              {link('/hizli-siparis', 'zap', 'Hızlı sipariş')}
              {link('/siparislerim', 'orders', 'Siparişlerim')}
              {link('/favorilerim', 'heart', 'Favorilerim')}
              {link(
                '/sepet',
                'bag',
                'Sepetim',
                <span className="ui-countbadge ui-countbadge--inline" data-empty={count === 0}>
                  {count}
                </span>,
              )}
              {link('/hesabim', 'user', 'Hesabım')}
            </>
          )}
          {mode === 'admin' && link('/yonetim', 'sliders', 'Yönetim paneli')}
        </ul>
        <h2 className="ui-drawer__title">Kategoriler</h2>
        <ul className="ui-drawer__list">
          <li>
            <Link
              to="/katalog"
              className="ui-drawer__item"
              aria-current={activeId === '' ? 'page' : undefined}
              onClick={onClose}
            >
              <span className="ui-popover__grow">Tüm ürünler</span>
            </Link>
          </li>
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                to={catalogHref({ grup: g.id })}
                className="ui-drawer__item"
                aria-current={activeId === g.id ? 'page' : undefined}
                onClick={onClose}
              >
                <span className="ui-popover__grow">{g.name}</span>
                <span className="muted num">{g.productCount}</span>
              </Link>
            </li>
          ))}
        </ul>
        <h2 className="ui-drawer__title">Kurumsal</h2>
        <ul className="ui-drawer__list">
          {site.pages.map((pg) => (
            <li key={pg.slug}>
              <Link to={`/${pg.slug}`} className="ui-drawer__item" onClick={onClose}>
                <span className="ui-popover__grow">{pg.title}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link to="/iletisim" className="ui-drawer__item" onClick={onClose}>
              <span className="ui-popover__grow">İletişim</span>
            </Link>
          </li>
        </ul>
        {mode !== 'guest' && (
          <div className="ui-drawer__foot">
            <Button variant="secondary" block icon="logout" onClick={doLogout}>
              Çıkış yap
            </Button>
          </div>
        )}
      </div>
    </dialog>
  )
}

// ---------- Alt bilgi ----------
const YEAR = new Date().getFullYear()

const TRUST: { icon: IconName; title: string; text: string }[] = [
  { icon: 'percent', title: 'KDV hariç net fiyat', text: 'Bayiye özel iskonto fiyata yansır' },
  { icon: 'boxes', title: 'Koli bazlı sipariş', text: 'Miktarlar koli içi adedin katlarıyla' },
  { icon: 'shield', title: 'Onaylı bayi girişi', text: 'Fiyatlar yalnızca onaylı bayilere açık' },
  { icon: 'headset', title: 'Hızlı destek', text: 'Telefon ve WhatsApp ile yanınızdayız' },
]

/** Alt bilgi sütunu: telefonda akordeon (<details>), geniş ekranda açık liste. */
function FooterColumn({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const wide = useMediaQuery('(min-width: 40rem)')
  if (wide)
    return (
      <nav aria-labelledby={id} className="ui-footer__col">
        <h2 id={id}>{title}</h2>
        {children}
      </nav>
    )
  return (
    <details className="ui-footer__col ui-footer__acc">
      <summary>
        <h2 id={id}>{title}</h2>
        <Icon name="chevronDown" />
      </summary>
      <nav aria-labelledby={id}>{children}</nav>
    </details>
  )
}

function Footer({ mode }: { mode: ShopMode }) {
  const site = useSite()
  const c = site.contact
  const legal = site.pages.filter((p) => p.slug === 'kvkk' || p.slug === 'kullanim-kosullari')
  const corporate = site.pages.filter((p) => p.slug !== 'kvkk' && p.slug !== 'kullanim-kosullari')
  const li = (to: string, label: string) => (
    <li key={to}>
      <Link to={to} className="ui-footer__link">
        {label}
      </Link>
    </li>
  )
  return (
    <footer className="ui-footer">
      <div className="ui-shop__container">
        <ul className="ui-trust">
          {TRUST.map((t) => (
            <li key={t.title} className="ui-trust__item">
              <span className="ui-trust__icon">
                <Icon name={t.icon} />
              </span>
              <span>
                <strong>{t.title}</strong>
                <span className="muted">{t.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="ui-footer__main">
        <div className="ui-shop__container ui-footer__cols">
          <div className="ui-footer__brand">
            <BrandLogo size="lg" />
            <p className="muted">
              Amisos Züccaciye: mutfak eşyaları ve dekorasyon ürünlerinde bayilere toptan ön sipariş portalı.
              Fiyatlar KDV hariçtir.
            </p>
          </div>
          <FooterColumn id="f-portal" title="Portal">
            <ul>
              {li('/katalog', 'Ürün kataloğu')}
              {mode === 'guest' && (
                <>
                  {li(loginHref(), 'Bayi girişi')}
                  {li('/basvuru', 'Bayi ol')}
                </>
              )}
              {mode === 'dealer' && (
                <>
                  {li('/hizli-siparis', 'Hızlı sipariş')}
                  {li('/siparislerim', 'Siparişlerim')}
                  {li('/favorilerim', 'Favorilerim')}
                  {li('/hesabim', 'Hesabım')}
                </>
              )}
              {mode === 'admin' && li('/yonetim', 'Yönetim paneli')}
            </ul>
          </FooterColumn>
          <FooterColumn id="f-kurumsal" title="Kurumsal">
            <ul>
              {corporate.map((p) => li(`/${p.slug}`, p.title))}
              {li('/iletisim', 'İletişim')}
            </ul>
          </FooterColumn>
          <FooterColumn id="f-yasal" title="Yasal">
            <ul>{legal.map((p) => li(`/${p.slug}`, p.title))}</ul>
          </FooterColumn>
          <section aria-labelledby="f-iletisim" className="ui-footer__col">
            <h2 id="f-iletisim">İletişim</h2>
            <ul className="ui-footer__contact">
              <li>
                <Icon name="phone" />
                <a href={phoneHref(c)} className="ui-footer__link">
                  <span className="visually-hidden">Telefon: </span>
                  {c.phone}
                </a>
              </li>
              <li>
                <Icon name="whatsapp" />
                <a
                  href={whatsappLink(c)}
                  className="ui-footer__link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp ile yazın<span className="visually-hidden"> (yeni sekmede açılır)</span>
                </a>
              </li>
              <li>
                <Icon name="mail" />
                <a href={`mailto:${c.email}`} className="ui-footer__link">
                  {c.email}
                </a>
              </li>
              <li>
                <Icon name="pin" />
                <span>
                  {c.address}
                  {c.city ? `, ${c.city}` : ''}
                </span>
              </li>
              {c.workingHours && (
                <li>
                  <Icon name="clock" />
                  <span>{c.workingHours}</span>
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>
      <div className="ui-footer__bottom">
        <div className="ui-shop__container">
          <span>© {YEAR} Amisos Züccaciye</span>
          <span>Fiyatlar KDV hariçtir · Stok yalnızca Var / Yok olarak gösterilir</span>
        </div>
      </div>
    </footer>
  )
}

// ---------- Kabuk ----------
export function ShopLayout({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const mode = useShopMode()
  const site = useSite()
  const { path, query } = useRoute()
  const groups = useCatalogGroups()
  const groupList = groups.state.status === 'ready' ? groups.state.data : []
  const [drawer, setDrawer] = useState(false)
  const name = state.status === 'authenticated' ? state.user.name : ''
  const email = state.status === 'authenticated' ? state.user.email : ''
  const onCatalog = path === '/katalog'
  const q = onCatalog ? (query.get('q') ?? '') : ''
  // null: katalog dışında (hiçbir kategori "geçerli sayfa" değil)
  const activeGroup = onCatalog ? (query.get('grup') ?? '') : null

  return (
    <div className="ui-shop">
      <button type="button" className="ui-skip" onClick={() => document.getElementById('icerik')?.focus()}>
        İçeriğe geç
      </button>
      {mode === 'admin' && <AdminBar />}
      <AnnouncementStrip />
      <header className="ui-shophead">
        <div className="ui-shop__container ui-shophead__row">
          <button
            type="button"
            className="ui-iconbtn ui-shophead__menu"
            aria-label="Menüyü aç"
            aria-haspopup="dialog"
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          >
            <Icon name="menu" />
          </button>
          <Link to="/" className="ui-shophead__logo" aria-label="AMİSOS B2B ana sayfa">
            <BrandLogo />
          </Link>
          <div className="ui-shophead__search ui-shophead__search--wide">
            <SearchForm key={`w-${q}`} initial={q} idSuffix="wide" />
          </div>
          <div className="ui-shophead__actions">
            {mode === 'guest' && (
              <>
                <Link to={loginHref()} className="ui-button ui-button--secondary ui-button--sm ui-headbtn">
                  Giriş yap
                </Link>
                <Link to="/basvuru" className="ui-button ui-button--primary ui-button--sm ui-headbtn">
                  Bayi ol
                </Link>
              </>
            )}
            {mode === 'dealer' && (
              <>
                <Link
                  to="/hizli-siparis"
                  className="ui-headlink ui-headlink--wide"
                  aria-label="Hızlı sipariş"
                >
                  <Icon name="zap" />
                  <span className="ui-headlink__label">Hızlı sipariş</span>
                </Link>
                <Link to="/favorilerim" className="ui-headlink ui-headlink--wide" aria-label="Favorilerim">
                  <Icon name="heart" />
                  <span className="ui-headlink__label">Favorilerim</span>
                </Link>
                <Link
                  to="/siparislerim"
                  className="ui-headlink ui-headlink--collapse"
                  aria-label="Siparişlerim"
                >
                  <Icon name="orders" />
                  <span className="ui-headlink__label">Siparişlerim</span>
                </Link>
                <div className="ui-shophead__account">
                  <AccountMenu name={name} email={email} />
                </div>
                <CartLink />
              </>
            )}
            {mode === 'admin' && (
              <Link to="/yonetim" className="ui-button ui-button--primary ui-button--sm ui-headbtn">
                Yönetim paneli
              </Link>
            )}
          </div>
        </div>
        <div className="ui-shop__container ui-shophead__search ui-shophead__search--narrow">
          <SearchForm key={`n-${q}`} initial={q} idSuffix="narrow" />
        </div>
        {groupList.length > 0 && <CategoryNav groups={groupList} activeId={activeGroup} />}
      </header>
      <main id="icerik" tabIndex={-1} className="ui-shop__main">
        <div className="ui-shop__container ui-shop__content">{children}</div>
      </main>
      <Footer mode={mode} />
      <a
        href={whatsappLink(site.contact)}
        className="ui-wafab"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp ile yazın (yeni sekmede açılır)"
        title="WhatsApp ile yazın"
      >
        <Icon name="whatsapp" />
      </a>
      <CartToast />
      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        groups={groupList}
        activeId={activeGroup}
        name={name}
        mode={mode}
      />
    </div>
  )
}
