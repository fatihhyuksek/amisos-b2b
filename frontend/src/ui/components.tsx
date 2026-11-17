import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import type { DealerStatus } from '../api'
import { BrandLogo } from '../shop/brand'
import { DEALER_STATUS } from './dealerStatus'
import { ORDER_STATUS, type OrderStatus } from './orderStatus'
import { formatPercent, formatTRY } from './format'
import { Icon, type IconName } from './Icon'

// ---------- Buton ----------
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  block?: boolean
  icon?: IconName
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = [
    'ui-button',
    `ui-button--${variant}`,
    size === 'sm' && 'ui-button--sm',
    block && 'ui-button--block',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

// ---------- Etiketler ----------
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>
}

/** Stok yalnızca "Var / Yok" (K-18). */
export function StockBadge({ inStock }: { inStock: boolean }) {
  return inStock ? <Badge tone="success">Stokta var</Badge> : <Badge tone="warning">Stokta yok</Badge>
}

/** Sipariş durumları (K-25). */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

// ---------- Fiyat ----------
/**
 * KDV hariç fiyat gösterimi (K-11). İskontolu fiyatta liste fiyatı üstü çizili gösterilir (K-10).
 * Tutarlar backend'den hazır gelir; burada hesap yapılmaz.
 */
export function Price({
  value,
  listValue,
  discountPercent,
  size = 'md',
  hideDiscount,
}: {
  value: string
  listValue?: string
  discountPercent?: string
  /** md: liste/kart, lg: ürün detayı */
  size?: 'md' | 'lg'
  /** İskonto oranı başka yerde (ör. kart rozeti) gösteriliyorsa metin satırı gizlenir. */
  hideDiscount?: boolean
}) {
  return (
    <div className={size === 'lg' ? 'ui-price ui-price--lg' : 'ui-price'}>
      <div className="ui-price__row">
        <span className="ui-price__value">{formatTRY(value)}</span>
        {listValue && listValue !== value && (
          <span className="ui-price__list">
            <span className="visually-hidden">Liste fiyatı </span>
            {formatTRY(listValue)}
          </span>
        )}
      </div>
      <div className="ui-price__row">
        <span className="ui-price__note">KDV hariç</span>
        {discountPercent && !hideDiscount && (
          <span className="ui-price__discount">{formatPercent(discountPercent)} iskonto</span>
        )}
      </div>
    </div>
  )
}

// ---------- Miktar seçici ----------
/**
 * Koli adımlı miktar seçici (K-21). Artı/eksi koli içi adedi kadar değiştirir.
 * Elle yazılan adet koli katı değilse uyarı gösterir; asıl kontrol backend'dedir.
 */
export function QuantityStepper({
  value,
  step,
  onChange,
  label,
  disabled,
}: {
  value: number
  step: number
  onChange: (value: number) => void
  label: string
  disabled?: boolean
}) {
  const id = useId()
  const invalid = !disabled && (value <= 0 || value % step !== 0)
  return (
    <div className="ui-field">
      <div className="ui-stepper">
        <button
          type="button"
          onClick={() => onChange(Math.max(step, value - step))}
          disabled={disabled || value <= step}
          aria-label={`${label}: ${step} azalt`}
        >
          <Icon name="minus" />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={step}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={`${label} adedi`}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-err` : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button
          type="button"
          onClick={() => onChange(value + step)}
          disabled={disabled}
          aria-label={`${label}: ${step} artır`}
        >
          <Icon name="plus" />
        </button>
      </div>
      {invalid && (
        <span id={`${id}-err`} className="ui-error">
          Adet, koli içi adedinin ({step}) katı olmalı
        </span>
      )}
    </div>
  )
}

// ---------- Form alanı ----------
export function Field({
  label,
  help,
  error,
  children,
  htmlFor,
}: {
  label: string
  help?: string
  error?: string
  children: ReactNode
  htmlFor: string
}) {
  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {help && !error && <span className="ui-help">{help}</span>}
      {error && <span className="ui-error">{error}</span>}
    </div>
  )
}

// ---------- Uyarı ve boş durum ----------
export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger'
  children: ReactNode
}) {
  return (
    <div className={`ui-alert ui-alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={tone === 'info' ? 'info' : 'warning'} />
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
  icon = 'box',
}: {
  icon?: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="ui-empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

// ---------- Şifre alanı ----------
/** Göster/gizle düğmeli şifre girişi. Etiket Field ile verilir (id eşleşmeli). */
export function PasswordInput({
  invalid,
  describedBy,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalid?: boolean; describedBy?: string }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="ui-password">
      <input
        {...rest}
        className="ui-input"
        type={shown ? 'text' : 'password'}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        className="ui-password__toggle"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-label={shown ? 'Şifreyi gizle' : 'Şifreyi göster'}
      >
        <Icon name={shown ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  )
}

// ---------- Kimlik doğrulama kartı ----------
/** Ortalanmış kart düzeni: üstte marka metni, altında başlık ve içerik. */
export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string
  intro?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="ui-auth">
      <div className="ui-auth__brand">
        <BrandLogo size="lg" />
      </div>
      <section className="ui-card ui-auth__card" aria-labelledby="auth-title">
        <div className="ui-card__body ui-auth__body">
          <div className="ui-auth__head">
            <h1 id="auth-title">{title}</h1>
            {intro && <p className="muted">{intro}</p>}
          </div>
          {children}
        </div>
      </section>
      {footer && <div className="ui-auth__footer">{footer}</div>}
    </main>
  )
}

// ---------- Bayi durumu (K-04, K-08, K-51) ----------
export function DealerStatusBadge({ status }: { status: DealerStatus }) {
  const s = DEALER_STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

// ---------- Onay kutusu ----------
export function Checkbox({
  id,
  checked,
  onChange,
  error,
  children,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string
  children: ReactNode
}) {
  return (
    <div className="ui-field">
      <label className="ui-check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <span>{children}</span>
      </label>
      {error && (
        <span id={`${id}-err`} className="ui-error">
          {error}
        </span>
      )}
    </div>
  )
}

// ---------- Sayfalama ----------
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <nav className="ui-pagination" aria-label="Sayfalama">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Önceki
      </Button>
      <span className="ui-pagination__info" aria-live="polite">
        Sayfa {page} / {pages}
      </span>
      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Sonraki
      </Button>
    </nav>
  )
}

// ---------- Diyalog ----------
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Kalıcı modal diyalog: yerel <dialog> arka planı etkisiz kılar, Esc kapatır;
 * Tab odağı diyalog içinde döner, kapanınca odak açan öğeye geri gider.
 * Diyalog yalnızca açıkken oluşturulur (ebeveyn koşullu çizer).
 */
export function Modal({
  title,
  onClose,
  dismissable = true,
  wide,
  children,
}: {
  wide?: boolean
  title: string
  onClose: () => void
  /** false iken Esc ve arka plan tıklaması diyaloğu kapatmaz (istek sürerken). */
  dismissable?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const opener = document.activeElement as HTMLElement | null
    if (!dialog.open) dialog.showModal()
    return () => {
      dialog.close()
      opener?.focus()
    }
  }, [])

  function onKeyDown(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Tab') return
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <dialog
      ref={ref}
      className={wide ? 'ui-modal ui-modal--wide' : 'ui-modal'}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (dismissable) onClose()
      }}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === ref.current && dismissable) onClose()
      }}
    >
      <div className="ui-modal__body">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  )
}
