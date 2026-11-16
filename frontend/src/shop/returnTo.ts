// Girişten sonra geri dönüş (K-66): yalnızca uygulama içi yol kabul edilir (açık yönlendirme yok).

/** "/katalog?grup=1" gibi tek eğik çizgiyle başlayan, şema ve ters eğik çizgi içermeyen yol. */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.length > 500) return null
  if (!/^\/(?!\/)[^\\\s]*$/.test(value)) return null
  // Oturum sayfalarına geri dönmek döngü yaratır.
  if (
    /^\/(giris|yonetim\/giris|basvuru|davet|sifremi-unuttum|sifre-sifirla|eposta-dogrula)(\?|$)/.test(value)
  )
    return null
  return value
}

/** Adres çubuğundaki geçerli uygulama yolu ("/katalog?grup=1"). */
export function currentPath(): string {
  return location.hash.replace(/^#/, '') || '/'
}

/** Giriş sayfası adresi; `donus` verilmezse geçerli sayfaya döner. */
export function loginHref(returnTo: string = currentPath()): string {
  const safe = safeReturnPath(returnTo)
  return safe && safe !== '/' ? `/giris?donus=${encodeURIComponent(safe)}` : '/giris'
}
