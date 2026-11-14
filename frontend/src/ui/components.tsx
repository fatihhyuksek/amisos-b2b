import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
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

export type OrderStatus = 'submitted' | 'negotiating' | 'approved' | 'shipped' | 'delivered' | 'cancelled'

const STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'Gönderildi', tone: 'info' },
  negotiating: { label: 'Görüşülüyor', tone: 'warning' },
  approved: { label: 'Onaylandı', tone: 'success' },
  shipped: { label: 'Sevk edildi', tone: 'info' },
  delivered: { label: 'Teslim edildi', tone: 'success' },
  cancelled: { label: 'İptal', tone: 'danger' },
}

/** Sipariş durumları (K-25). */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS[status]
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
}: {
  value: string
  listValue?: string
  discountPercent?: string
}) {
  return (
    <div className="ui-price">
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
        {discountPercent && (
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
}: {
  value: number
  step: number
  onChange: (value: number) => void
  label: string
}) {
  const id = useId()
  const invalid = value <= 0 || value % step !== 0
  return (
    <div className="ui-field">
      <div className="ui-stepper">
        <button
          type="button"
          onClick={() => onChange(Math.max(step, value - step))}
          disabled={value <= step}
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
          aria-label={`${label} adedi`}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-err` : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button type="button" onClick={() => onChange(value + step)} aria-label={`${label}: ${step} artır`}>
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
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="ui-empty">
      <Icon name="box" />
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
      <div className="ui-auth__brand">Amisos B2B</div>
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
