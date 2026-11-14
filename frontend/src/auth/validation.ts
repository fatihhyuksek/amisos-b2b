// Sunucuya gitmeden önce basit kontroller; asıl doğrulama backend'dedir.
/** K-53: en az 8 karakter; büyük harf, küçük harf ve rakam. */
export const MIN_PASSWORD_LENGTH = 8
export const PASSWORD_RULE_TEXT = `En az ${MIN_PASSWORD_LENGTH} karakter; büyük harf, küçük harf ve rakam içermeli.`

export function validateEmail(value: string): string | undefined {
  const v = value.trim()
  if (!v) return 'E-posta adresi zorunludur.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Geçerli bir e-posta adresi girin.'
}

export function validateNewPassword(value: string): string | undefined {
  if (!value) return 'Şifre zorunludur.'
  if (value.length < MIN_PASSWORD_LENGTH) return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`
  if (!/\p{Lu}/u.test(value)) return 'Şifre en az bir büyük harf içermelidir.'
  if (!/\p{Ll}/u.test(value)) return 'Şifre en az bir küçük harf içermelidir.'
  if (!/\p{Nd}/u.test(value)) return 'Şifre en az bir rakam içermelidir.'
}

export function validateRequired(value: string): string | undefined {
  if (!value) return 'Şifre zorunludur.'
}
