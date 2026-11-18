// K-87: Görünüm ekranlarının ortak parçaları: yukarı/aşağı düğmeleri, aç/kapa anahtarı, kayıt çubuğu, sunucu hata özeti.
import { useId } from 'react'
import { ApiError } from '../../api'
import { Alert, Button } from '../../ui/components'
import { Icon } from '../../ui/Icon'
import { networkMessage } from '../../ui/networkMessage'

/** Erişilebilir sıralama düğmeleri; Alt+Yukarı/Aşağı kısayolu satırın kendisinden de çalışır (onKeyDown ile). */
export function ReorderButtons({
  idBase,
  index,
  count,
  label,
  onMove,
}: {
  /** Taşıma sonrası odağı geri vermek için düğme kimliği öneki (`focusMoved`). */
  idBase: string
  index: number
  count: number
  label: string
  onMove: (to: number) => void
}) {
  return (
    <span className="ap-reorder">
      <button
        id={`${idBase}-up`}
        type="button"
        className="ap-iconbtn"
        aria-label={`${label}: yukarı taşı`}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
      >
        <Icon name="arrowUp" />
      </button>
      <button
        id={`${idBase}-down`}
        type="button"
        className="ap-iconbtn"
        aria-label={`${label}: aşağı taşı`}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
      >
        <Icon name="arrowDown" />
      </button>
    </span>
  )
}

export function Switch({
  on,
  onChange,
  label,
  hideLabel,
}: {
  on: boolean
  onChange: (on: boolean) => void
  label: string
  hideLabel?: boolean
}) {
  const id = useId()
  return (
    <label className="ui-check ui-switch ap-switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={hideLabel ? 'visually-hidden' : undefined}>{label}</span>
    </label>
  )
}

/** Sayfa altında yapışkan kayıt çubuğu. */
export function SaveBar({
  dirty,
  busy,
  onSave,
  onReset,
  extra,
}: {
  dirty: boolean
  busy: boolean
  onSave: () => void
  onReset: () => void
  extra?: React.ReactNode
}) {
  return (
    <div className="ap-savebar">
      <span className="muted" role="status">
        {dirty ? 'Kaydedilmemiş değişiklikler var.' : 'Tüm değişiklikler kaydedildi.'}
      </span>
      <span className="ap-savebar__btns">
        {extra}
        <Button variant="secondary" disabled={busy || !dirty} onClick={onReset}>
          Değişiklikleri geri al
        </Button>
        <Button disabled={busy || !dirty} onClick={onSave}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </span>
    </div>
  )
}

/** Kayıt hatasını kullanıcıya uygun metne çevirir; 400'de sunucunun alan mesajları listelenir. */
export function SaveError({ error }: { error: unknown }) {
  if (!error) return null
  if (error instanceof ApiError && error.status === 400) {
    const msgs = Object.values(error.fields ?? {})
    return (
      <Alert tone="danger">
        Kayıt yapılamadı. Alanları kontrol edin.
        {msgs.length > 0 && (
          <ul className="ui-list-plain">
            {msgs.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </Alert>
    )
  }
  return <Alert tone="danger">{networkMessage(error, 'Kayıt yapılamadı. Lütfen tekrar deneyin.')}</Alert>
}
