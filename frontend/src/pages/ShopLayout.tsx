// Bayi mağaza kabuğu: duyuru şeridi, başlık (logo, arama, Siparişlerim / Hesabım / Sepetim),
// kategori menüsü, mobil çekmece ve alt bilgi. GR-BAYI-007 (Çıkış), GR-URN-003 (arama, gruplar), K-11.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { CatalogGroup } from '../api'
import { useAuth } from '../auth/useAuth'
import { Link } from '../Link'
import { matchPath, navigate, replace, useRoute } from '../router'
import { BrandLogo } from '../shop/brand'
import { useAnalytics } from '../shop/pageTitle'
import { catalogHref } from '../shop/catalogHref'
import { phoneHref, socialLinks, whatsappLink } from '../shop/contact'
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

// ---------- Üst şerit (GR-URN-003, K-11, K-73): solda iletişim, ortada dönen duyuru, sağda kısa bağlantılar ----------
const ROTATE_MS = 5000

function TopStrip({ mode }: { mode: ShopMode }) {
  const site = useSite()
  const c = site.contact
  const wa = whatsappLink(c)
  const social = socialLinks(site.social)
  const messages = [site.announcement, 'Fiyatlar KDV hariçtir', `Sipariş ve destek: ${c.phone}`].filter(
    (m): m is string => Boolean(m),
  )
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const count = messages.length
  const current = index % count

  // Otomatik geçiş: fare/odak üstündeyken ve "hareketi azalt" tercihinde durur; oklarla elle de gezilir.
  useEffect(() => {
    if (paused || reduced || count < 2) return
    const t = window.setInterval(() => setIndex((i) => i + 1), ROTATE_MS)
    return () => window.clearInterval(t)
  }, [paused, reduced, count])

  return (
    <div className="ui-strip">
      <div className="ui-shop__container ui-strip__row">
        <ul className="ui-strip__contact" aria-label="İletişim">
          <li>
            <a href={phoneHref(c)} aria-label={`Telefon: ${c.phone}`} title={c.phone}>
              <Icon name="phone" />
            </a>
          </li>
          {wa && (
            <li>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp (yeni sekmede açılır)"
                title="WhatsApp"
              >
                <Icon name="whatsapp" />
              </a>
            </li>
          )}
          <li>
            <a href={`mailto:${c.email}`} aria-label={`E-posta: ${c.email}`} title={c.email}>
              <Icon name="mail" />
            </a>
          </li>
          {social.map((x) => (
            <li key={x.key}>
              <a
                href={x.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${x.label} (yeni sekmede açılır)`}
                title={x.label}
              >
                <Icon name={x.icon} />
              </a>
            </li>
          ))}
        </ul>
        <div
          className="ui-strip__rotator"
          role="group"
          aria-roledescription="carousel"
          aria-label="Duyurular"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {count > 1 && (
            <button
              type="button"
              className="ui-strip__arrow"
              aria-label="Önceki duyuru"
              onClick={() => setIndex(current - 1 + count)}
            >
              <Icon name="chevronLeft" />
            </button>
          )}
          <p className="ui-strip__msg" aria-live={paused ? 'polite' : 'off'}>
            {messages[current]}
          </p>
          {count > 1 && (
            <button
              type="button"
              className="ui-strip__arrow"
              aria-label="Sonraki duyuru"
              onClick={() => setIndex(current + 1)}
            >
              <Icon name="chevronRight" />
            </button>
          )}
        </div>
        <ul className="ui-strip__links" aria-label="Kısa bağlantılar">
          <li>
            <Link to="/sss">SSS</Link>
          </li>
          <li>
            <Link to="/iletisim">İletişim</Link>
          </li>
          <li>
            {mode === 'guest' ? (
              <Link to="/basvuru">Bayi ol</Link>
            ) : mode === 'dealer' ? (
              <Link to="/siparislerim">Siparişlerim</Link>
            ) : (
              <Link to="/yonetim">Yönetim paneli</Link>
            )}
          </li>
        </ul>
      </div>
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
        <span className="ui-headlink__label">Hesabım</span>
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

function CartLink({ guest }: { guest?: boolean }) {
  const count = useCartCount()
  return (
    <Link
      to={guest ? loginHref('/sepet') : '/sepet'}
      className="ui-headlink"
      aria-label={guest ? 'Sepetim (giriş gerekir)' : `Sepetim, ${count} ürün`}
    >
      <span className="ui-headlink__iconwrap">
        <Icon name="bag" />
        {!guest && (
          <span className="ui-countbadge" aria-hidden="true" data-empty={count === 0}>
            {count}
          </span>
        )}
      </span>
      <span className="ui-headlink__label">Sepetim</span>
    </Link>
  )
}

// ---------- Kategori menüsü (masaüstü): "Kategoriler" mega menüsü, sığan gruplar, Öne Çıkanlar, Yeni Ürünler ----------
const FEATURED_HREF = '/katalog?one-cikan=1'
const NEW_HREF = '/katalog?yeni=1&sirala=yeni'

function AllCategories({
  groups,
  activeId,
  rootRef,
}: {
  groups: CatalogGroup[]
  activeId: string | null
  rootRef: React.RefObject<HTMLDivElement | null>
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
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
  }, [open, rootRef])

  // Fare ile üzerine gelince açılır; kapanmadan önce kısa bir bekleme (menüye geçiş) tanınır. Tık ve klavye de çalışır.
  const hoverOpen = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const hoverClose = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 160)
  }

  return (
    <div
      className="ui-popover-wrap ui-catnav__allwrap"
      ref={rootRef}
      onPointerEnter={hoverOpen}
      onPointerLeave={hoverClose}
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
        Kategoriler
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div id="all-categories" className="ui-mega">
          <ul className="ui-mega__grid">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  to={catalogHref({ grup: g.id, slug: g.slug })}
                  className="ui-mega__item"
                  aria-current={activeId === g.id ? 'page' : undefined}
                >
                  <GroupThumb src={g.thumbUrl} />
                  <span className="ui-mega__name">{g.name}</span>
                  <span className="ui-mega__count num">{g.productCount} ürün</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/katalog" className="ui-mega__all" aria-current={activeId === '' ? 'page' : undefined}>
            Tüm ürünleri gör
            <Icon name="arrowRight" />
          </Link>
        </div>
      )}
    </div>
  )
}

function CategoryNav({ groups, activeId }: { groups: CatalogGroup[]; activeId: string | null }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const allRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLUListElement>(null)
  const measureRef = useRef<HTMLUListElement>(null)
  const [fit, setFit] = useState(groups.length)

  // Önce ölçülür, sonra sığan kadar grup gösterilir; kalan boşluk öğeler arasında eşit dağılır (space-between).
  useLayoutEffect(() => {
    const box = innerRef.current
    const all = allRef.current
    const tail = tailRef.current
    const measure = measureRef.current
    if (!box || !all || !tail || !measure) return
    const calc = () => {
      const cs = getComputedStyle(box)
      const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const gap = 24 // öğeler arası en az boşluk
      const tailW = (Array.from(tail.children) as HTMLElement[]).reduce(
        (sum, li) => sum + li.offsetWidth + gap,
        0,
      )
      let used = all.offsetWidth + tailW
      let n = 0
      for (const li of Array.from(measure.children) as HTMLElement[]) {
        const w = li.offsetWidth + gap
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

  return (
    <nav className="ui-catnav" aria-label="Kategoriler">
      <div className="ui-catnav__inner" ref={innerRef}>
        <AllCategories groups={groups} activeId={activeId} rootRef={allRef} />
        <ul className="ui-catnav__list">
          {groups.slice(0, fit).map((g) => (
            <li key={g.id}>
              <Link
                to={catalogHref({ grup: g.id, slug: g.slug })}
                className="ui-catnav__link"
                aria-current={activeId === g.id ? 'page' : undefined}
              >
                {g.name}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="ui-catnav__tail" ref={tailRef}>
          <li>
            <Link to={FEATURED_HREF} className="ui-catnav__link">
              Öne Çıkanlar
            </Link>
          </li>
          <li>
            <Link to={NEW_HREF} className="ui-catnav__link">
              Yeni Ürünler
            </Link>
          </li>
        </ul>
        <ul className="ui-catnav__measure" ref={measureRef} aria-hidden="true">
          {groups.map((g) => (
            <li key={g.id}>
              <span className="ui-catnav__link">{g.name}</span>
            </li>
          ))}
        </ul>
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
                to={catalogHref({ grup: g.id, slug: g.slug })}
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
  const groups = useCatalogGroups()
  const c = site.contact
  const wa = whatsappLink(c)
  const social = socialLinks(site.social)
  const popular =
    groups.state.status === 'ready'
      ? [...groups.state.data].sort((x, y) => y.productCount - x.productCount).slice(0, 6)
      : []
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
          <FooterColumn id="f-kurumsal" title="Kurumsal">
            <ul>
              {corporate.map((p) => li(`/${p.slug}`, p.title))}
              {li('/iletisim', 'İletişim')}
            </ul>
          </FooterColumn>
          {popular.length > 0 && (
            <FooterColumn id="f-populer" title="Popüler kategoriler">
              <ul>{popular.map((g) => li(catalogHref({ grup: g.id, slug: g.slug }), g.name))}</ul>
            </FooterColumn>
          )}
          <FooterColumn id="f-yasal" title="Yasal">
            <ul>{legal.map((p) => li(`/${p.slug}`, p.title))}</ul>
          </FooterColumn>
          <FooterColumn id="f-portal" title="Keşfet">
            <ul>
              {li('/katalog', 'Ürün kataloğu')}
              {li(FEATURED_HREF, 'Öne çıkanlar')}
              {li(NEW_HREF, 'Yeni ürünler')}
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
          <section aria-labelledby="f-iletisim" className="ui-footer__col ui-footer__address">
            <h2 id="f-iletisim">Adres bilgileri</h2>
            <ul className="ui-footer__contact">
              <li>
                <Icon name="pin" />
                <span>
                  {c.address}
                  {c.city ? `, ${c.city}` : ''}
                </span>
              </li>
              <li>
                <Icon name="mail" />
                <a href={`mailto:${c.email}`} className="ui-footer__link">
                  {c.email}
                </a>
              </li>
            </ul>
          </section>
        </div>
        <div className="ui-shop__container ui-footer__contactrow">
          <BrandLogo size="lg" />
          <ul className="ui-footer__boxes">
            <li>
              <a href={phoneHref(c)} className="ui-footer__box">
                <Icon name="phone" />
                <span>
                  <span className="muted">Müşteri hattı</span>
                  <strong className="num">{c.phone}</strong>
                </span>
              </a>
            </li>
            {wa && (
              <li>
                <a href={wa} className="ui-footer__box" target="_blank" rel="noopener noreferrer">
                  <Icon name="whatsapp" />
                  <span>
                    <span className="muted">WhatsApp destek</span>
                    <strong>
                      Bize yazın<span className="visually-hidden"> (yeni sekmede açılır)</span>
                    </strong>
                  </span>
                </a>
              </li>
            )}
          </ul>
          {social.length > 0 && (
            <ul className="ui-footer__social" aria-label="Sosyal medya">
              {social.map((x) => (
                <li key={x.key}>
                  <a
                    href={x.href}
                    className="ui-footer__socialLink"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${x.label} (yeni sekmede açılır)`}
                    title={x.label}
                  >
                    <Icon name={x.icon} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {c.workingHours && (
          <p className="ui-footer__hours">
            <Icon name="clock" />
            {c.workingHours}
          </p>
        )}
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
  useAnalytics()
  const wa = whatsappLink(site.contact)
  const { path, query } = useRoute()
  const groups = useCatalogGroups()
  const groupList = groups.state.status === 'ready' ? groups.state.data : []
  const [drawer, setDrawer] = useState(false)
  const name = state.status === 'authenticated' ? state.user.name : ''
  const email = state.status === 'authenticated' ? state.user.email : ''
  const slugParam = matchPath(path, '/katalog/:slug')?.slug
  const onCatalog = path === '/katalog' || slugParam !== undefined
  const q = onCatalog ? (query.get('q') ?? '') : ''
  // null: katalog dışında (hiçbir kategori "geçerli sayfa" değil)
  const activeGroup = onCatalog
    ? slugParam !== undefined
      ? (groupList.find((g) => g.slug === slugParam)?.id ?? '')
      : (query.get('grup') ?? '')
    : null

  return (
    <div className="ui-shop">
      <button type="button" className="ui-skip" onClick={() => document.getElementById('icerik')?.focus()}>
        İçeriğe geç
      </button>
      {mode === 'admin' && <AdminBar />}
      <TopStrip mode={mode} />
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
            <BrandLogo size="lg" />
          </Link>
          <div className="ui-shophead__search ui-shophead__search--wide">
            <SearchForm key={`w-${q}`} initial={q} idSuffix="wide" />
          </div>
          <div className="ui-shophead__actions">
            {mode === 'dealer' && (
              <Link to="/hizli-siparis" className="ui-headlink ui-headlink--wide" aria-label="Hızlı sipariş">
                <Icon name="zap" />
                <span className="ui-headlink__label">Hızlı sipariş</span>
              </Link>
            )}
            {mode !== 'admin' && (
              <Link
                to={mode === 'guest' ? loginHref('/favorilerim') : '/favorilerim'}
                className="ui-headlink ui-headlink--fav"
                aria-label="Favorilerim"
              >
                <Icon name="heart" />
                <span className="ui-headlink__label">Favorilerim</span>
              </Link>
            )}
            {mode === 'guest' && (
              <>
                <Link to={loginHref()} className="ui-headlink">
                  <Icon name="user" />
                  <span className="ui-headlink__label">Giriş yap</span>
                </Link>
                <Link to="/basvuru" className="ui-headcta">
                  Bayi ol
                </Link>
              </>
            )}
            {mode === 'dealer' && <AccountMenu name={name} email={email} />}
            {mode !== 'admin' && <CartLink guest={mode === 'guest'} />}
            {mode === 'admin' && (
              <Link to="/yonetim" className="ui-headlink">
                <Icon name="sliders" />
                <span className="ui-headlink__label">Yönetim paneli</span>
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
      {wa && (
        <a
          href={wa}
          className="ui-wafab"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp ile yazın (yeni sekmede açılır)"
          title="WhatsApp ile yazın"
        >
          <Icon name="whatsapp" />
        </a>
      )}
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
