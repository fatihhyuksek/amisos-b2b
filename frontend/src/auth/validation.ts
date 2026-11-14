// Sunucuya gitmeden önce basit kontroller; asıl doğrulama backend'dedir.
export const MIN_PASSWORD_LENGTH = 10

export function validateEmail(value: string): string | undefined {
  const v = value.trim()
  if (!v) return 'E-posta adresi zorunludur.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Geçerli bir e-posta adresi girin.'
}

export function validateNewPassword(value: string): string | undefined {
  if (!value) return 'Şifre zorunludur.'
  if (value.length < MIN_PASSWORD_LENGTH) return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`
}

export function validateRequired(value: string): string | undefined {
  if (!value) return 'Şifre zorunludur.'
}
