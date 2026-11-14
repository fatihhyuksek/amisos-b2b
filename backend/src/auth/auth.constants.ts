// Kimlik doğrulama sabitleri. Süreler açık soru olarak raporlandı (docs/ilerleme.md).

/** Oturum süresi, kayan: her kullanımda uzar. Gereksinimde yok, varsayım (7 gün). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** last_seen_at / expires_at güncellemesi en fazla bu sıklıkta yazılır. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;
export const SESSION_COOKIE = 'amisos_session';

/** K-39: şifre sıfırlama bağlantısı 1 saat geçerli. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
/** Gereksinimde yok, varsayım (24 saat). */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Gereksinimde yok, varsayım. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/** Tüm başarısız girişlerde aynı mesaj: hesap durumu sızdırılmaz. */
export const LOGIN_FAILED_MESSAGE =
  'Giriş yapılamadı. E-posta veya şifre hatalı olabilir.';
