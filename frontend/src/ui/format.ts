// Biçimlendirme yardımcıları. Tutarlar API'den metin olarak gelir ("1234.50");
// burada yalnızca gösterim için biçimlenir, hesap yapılmaz (hesap backend'de).

const tryFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const intFormatter = new Intl.NumberFormat('tr-TR')

/** "1234.5" → "₺1.234,50" */
export function formatTRY(amount: string): string {
  return tryFormatter.format(Number(amount))
}

export function formatInt(value: number): string {
  return intFormatter.format(value)
}

/** "15.00" → "%15", "12.50" → "%12,5" */
export function formatPercent(value: string): string {
  return `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(value))}`
}
