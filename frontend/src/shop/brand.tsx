// Marka öğeleri tek yerde: logo dosyası ve iletişim bilgileri iş sahibinden gelince yalnızca burası değişir.
// Açık soru: logo, destek telefonu, e-posta ve adres (docs/design/README.md).

/** İletişim bilgileri. null olan alan arayüzde "eklenecek" yer tutucusuyla gösterilir. */
export const CONTACT: { phone: string | null; email: string | null; address: string | null; hours: string | null } =
  {
    phone: null,
    email: null,
    address: null,
    hours: null,
  }

/** Metin logo. Logo dosyası gelince `<img>` ile değiştirilir; bileşeni kullanan yerler değişmez. */
export function BrandLogo({ size = 'md', suffix }: { size?: 'sm' | 'md' | 'lg'; suffix?: string }) {
  return (
    <span className={`ui-logo ui-logo--${size}`}>
      <span className="ui-logo__mark" aria-hidden="true">
        A
      </span>
      <span className="ui-logo__text">
        Amisos<span className="ui-logo__b2b">B2B</span>
        {suffix && <span className="ui-logo__suffix">{suffix}</span>}
      </span>
    </span>
  )
}
