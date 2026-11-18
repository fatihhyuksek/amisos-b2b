// K-78: Yönetim paneli ortak küçük bileşenleri (açılır menü, sekmeler, liste altlığı, değişim oku).
import { Link } from '../Link'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { Pagination } from '../ui/components'
import { formatAbsPercent, formatInt } from '../ui/format'
import { Icon, type IconName } from '../ui/Icon'
import { PAGE_SIZES, useDismiss } from './kitUtils'

export interface MenuEntry {
  label: string
  icon?: IconName
  to?: string
  onSelect?: () => void
  /** Öğenin üstüne ince ayırıcı koyar. */
  divider?: boolean
}

/**
 * Açılır eylem menüsü (role=menu): ok tuşları, Home/End, Esc ve dışarı tıklama.
 * `children` tetikleyici düğmenin içeriğidir.
 */
export function MenuButton({
  label,
  className,
  align = 'right',
  up,
  items,
  children,
}: {
  label: string
  className: string
  align?: 'left' | 'right'
  up?: boolean
  items: MenuEntry[]
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, wrap, btn)

  useEffect(() => {
    if (open) wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  function onKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      els[(i + 1) % els.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      els[(i - 1 + els.length) % els.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      els[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      els[els.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className="adm-menu" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`adm-pop adm-pop--${align}${up ? ' adm-pop--up' : ''}`}
          onKeyDown={onKey}
        >
          {items.map((it) => {
            const inner = (
              <>
                {it.icon && <Icon name={it.icon} />}
                <span>{it.label}</span>
              </>
            )
            const cls = `adm-pop__item${it.divider ? ' adm-pop__item--divider' : ''}`
            return it.to ? (
              <Link key={it.label} role="menuitem" className={cls} to={it.to} onClick={() => setOpen(false)}>
                {inner}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={cls}
                onClick={() => {
                  setOpen(false)
                  it.onSelect?.()
                }}
              >
                {inner}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Sekme çubuğu (WAI-ARIA tabs): ok tuşlarıyla gezilir; panel `id` = `${idBase}-panel-${value}`. */
export function Tabs<T extends string>({
  idBase,
  value,
  onChange,
  tabs,
  label,
}: {
  idBase: string
  value: T
  onChange: (v: T) => void
  tabs: { value: T; label: string; count?: number }[]
  label: string
}) {
  function onKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.value === value)
    let n = -1
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = tabs.length - 1
    if (n < 0) return
    e.preventDefault()
    onChange(tabs[n].value)
    document.getElementById(`${idBase}-tab-${tabs[n].value}`)?.focus()
  }
  return (
    <div className="adm-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.value}
          id={`${idBase}-tab-${t.value}`}
          type="button"
          role="tab"
          className="adm-tabs__tab"
          aria-selected={t.value === value}
          aria-controls={`${idBase}-panel-${t.value}`}
          tabIndex={t.value === value ? 0 : -1}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined && <span className="adm-tabs__count num">{formatInt(t.count)}</span>}
        </button>
      ))}
    </div>
  )
}

export function TabPanel({
  idBase,
  value,
  children,
}: {
  idBase: string
  value: string
  children: ReactNode
}) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      className="adm-tabpanel"
    >
      {children}
    </div>
  )
}

/** Liste altlığı: toplam kayıt, sayfalama ve sayfa başına adet seçimi. */
export function ListFooter({
  total,
  unit,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number
  unit: string
  page: number
  pageSize: number
  onPage: (p: number) => void
  onPageSize: (n: number) => void
}) {
  const id = useId()
  return (
    <div className="adm-foot">
      <span className="adm-foot__total num" aria-live="polite">
        {formatInt(total)} {unit}
      </span>
      <Pagination page={page} pageSize={pageSize} total={total} onChange={onPage} />
      <label className="adm-foot__size" htmlFor={id}>
        <span className="muted">Sayfa başına</span>
        <select
          id={id}
          className="ui-select"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

/** Değişim oku ve yüzdesi. Önceki dönem 0 ise (percent null) açıklama gösterilir. */
export function Delta({ percent, label = 'geçen aya göre' }: { percent: number | null; label?: string }) {
  if (percent === null) return <span className="adm-delta adm-delta--flat">Önceki dönemde veri yok</span>
  const dir = percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat'
  return (
    <span className={`adm-delta adm-delta--${dir}`}>
      <span className="adm-delta__pill">
        {dir !== 'flat' && <Icon name={dir === 'up' ? 'trendUp' : 'trendDown'} />}
        <span className="num">
          {dir === 'up' ? '+' : dir === 'down' ? '−' : ''}
          {formatAbsPercent(percent)}
        </span>
        <span className="visually-hidden">
          {dir === 'up' ? ' artış' : dir === 'down' ? ' düşüş' : ' değişim yok'}
        </span>
      </span>
      <span className="adm-delta__label"> {label}</span>
    </span>
  )
}

/** Yüklenirken satır yer tutucusu. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="adm-card adm-skel" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ui-skeleton" style={{ height: '1.5rem' }} />
      ))}
      <span className="visually-hidden" role="status">
        Yükleniyor…
      </span>
    </div>
  )
}

/** Başlıklı kart (bölüm). */
export function Panel({
  title,
  action,
  children,
  flush,
  id,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  /** İçerik kenara kadar uzanır (tablo, liste). */
  flush?: boolean
  id?: string
}) {
  const hid = useId()
  return (
    <section className="adm-card" aria-labelledby={hid} id={id}>
      <header className="adm-card__head">
        <h2 id={hid}>{title}</h2>
        {action}
      </header>
      <div className={flush ? 'adm-card__body adm-card__body--flush' : 'adm-card__body'}>{children}</div>
    </section>
  )
}
