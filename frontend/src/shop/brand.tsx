// Yazı logo (K-63). Logo dosyası gelirse yalnızca bu bileşen değişir.

/** Yazı logo "AMİSOS B2B" (Türkçe İ ile). Logo dosyası gelince `<img>` ile değiştirilir. */
export function BrandLogo({ size = 'md', suffix }: { size?: 'sm' | 'md' | 'lg'; suffix?: string }) {
  return (
    <span className={`ui-logo ui-logo--${size}`} lang="tr">
      <span className="ui-logo__word">AMİSOS</span>
      <span className="ui-logo__b2b">B2B</span>
      {suffix && <span className="ui-logo__suffix">{suffix}</span>}
    </span>
  )
}
