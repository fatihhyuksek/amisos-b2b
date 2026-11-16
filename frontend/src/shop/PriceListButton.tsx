// K-72: bayiye özel net fiyatlı fiyat listesini Excel olarak indirir.
import { useState } from 'react'
import { downloadPriceList } from '../api'
import { saveBlob } from '../admin/download'
import { Button } from '../ui/components'
import { useCart } from './cart'

function today(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
}

export function PriceListButton({
  variant = 'secondary',
  size = 'md',
  label = 'Fiyat listesi indir (Excel)',
}: {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'sm'
  label?: string
}) {
  const { notify } = useCart()
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try {
      const { blob, filename } = await downloadPriceList()
      saveBlob(blob, filename ?? `fiyat-listesi-${today()}.xlsx`)
    } catch (err) {
      notify({
        tone: 'danger',
        text:
          err instanceof TypeError
            ? 'Sunucuya ulaşılamadı. Lütfen biraz sonra tekrar deneyin.'
            : 'Fiyat listesi indirilemedi. Lütfen tekrar deneyin.',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant={variant} size={size} icon="download" disabled={busy} onClick={() => void run()}>
      {busy ? 'Hazırlanıyor…' : label}
    </Button>
  )
}
