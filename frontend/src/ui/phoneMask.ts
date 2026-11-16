/** Telefon girişi maskesi: "0532 123 45 67". Yalnızca rakam alınır; "+90" öneki ve baştaki 0 düzeltilir. */
export function maskPhone(value: string): string {
  let digits = value.replace(/\D/g, '')
  if (value.trim().startsWith('+') && digits.startsWith('90')) digits = digits.slice(2)
  else if (digits.length > 10 && digits.startsWith('90')) digits = digits.slice(2)
  if (digits && !digits.startsWith('0')) digits = `0${digits}`
  digits = digits.slice(0, 11)
  const parts = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 9), digits.slice(9, 11)]
  return parts.filter(Boolean).join(' ')
}
