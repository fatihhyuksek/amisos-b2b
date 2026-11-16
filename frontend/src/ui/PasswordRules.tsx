// K-53 şifre kuralının canlı göstergesi: en az 8 karakter, büyük harf, küçük harf, rakam.
import { MIN_PASSWORD_LENGTH } from '../auth/validation'
import { Icon } from './Icon'

const RULES: { id: string; label: string; test: (v: string) => boolean }[] = [
  { id: 'len', label: `En az ${MIN_PASSWORD_LENGTH} karakter`, test: (v) => v.length >= MIN_PASSWORD_LENGTH },
  { id: 'upper', label: 'Bir büyük harf', test: (v) => /\p{Lu}/u.test(v) },
  { id: 'lower', label: 'Bir küçük harf', test: (v) => /\p{Ll}/u.test(v) },
  { id: 'digit', label: 'Bir rakam', test: (v) => /\p{Nd}/u.test(v) },
]

export function PasswordRules({ value, id }: { value: string; id: string }) {
  return (
    <ul className="ui-pwrules" id={id} aria-label="Şifre kuralları">
      {RULES.map((r) => {
        const ok = r.test(value)
        return (
          <li key={r.id} data-ok={ok}>
            <Icon name={ok ? 'check' : 'minus'} />
            <span>{r.label}</span>
            <span className="visually-hidden">{ok ? ' (sağlandı)' : ' (sağlanmadı)'}</span>
          </li>
        )
      })}
    </ul>
  )
}
