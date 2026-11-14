// Kimlik doğrulama sabitleri. Süreler açık soru olarak raporlandı (docs/ilerleme.md).

/** Oturum süresi, kayan: her kullanımda uzar. Gereksinimde yok, varsayım (7 gün). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** last_seen_at / expires_at güncellemesi en fazla bu sıklıkta yazılır. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;
/** Kayan süreden bağımsız mutlak üst süre: oturum açıldıktan en fazla 30 gün sonra biter. */
export const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = 'amisos_session';

/** K-39: şifre sıfırlama bağlantısı 1 saat geçerli. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
/** Aynı hesaba iki şifre sıfırlama e-postası arasındaki en kısa süre (e-posta bombardımanını önler). */
export const PASSWORD_RESET_COOLDOWN_MS = 2 * 60 * 1000;
/** Gereksinimde yok, varsayım (24 saat). */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/** K-04: davet (şifre belirleme) bağlantısı 72 saat geçerli. */
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

/** K-53: en az 8 karakter; büyük harf, küçük harf ve rakam zorunlu. */
export const PASSWORD_MIN_LENGTH = 8;

/** K-53 şifre kuralı. Uygunsa undefined, değilse Türkçe hata mesajı döner. */
export function passwordPolicyError(password: string): string | undefined {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`;
  if (!/\p{Lu}/u.test(password)) return 'Şifre en az bir büyük harf içermeli.';
  if (!/\p{Ll}/u.test(password)) return 'Şifre en az bir küçük harf içermeli.';
  if (!/\p{Nd}/u.test(password)) return 'Şifre en az bir rakam içermeli.';
  return undefined;
}
export const PASSWORD_MAX_LENGTH = 200;

/** Başarısız girişlerde ortak mesaj; hesap durumu sızdırılmaz (pasif bayi istisnası: K-54). */
export const LOGIN_FAILED_MESSAGE =
  'Giriş yapılamadı. E-posta veya şifre hatalı olabilir.';

/** K-54: şifresi doğru olan pasif bayiye gösterilen mesaj. */
export const ACCOUNT_PASSIVE_MESSAGE =
  'Hesabınız pasif durumda. Bilgi için bizimle iletişime geçin.';
