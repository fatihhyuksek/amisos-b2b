// K-72: bayiye özel net fiyatlı fiyat listesini Excel olarak indirir.
import { Button } from '../ui/components'
import { usePriceListDownload } from './usePriceListDownload'

export function PriceListButton({
  variant = 'secondary',
  size = 'md',
  label = 'Fiyat listesi indir (Excel)',
}: {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'sm'
  label?: string
}) {
  const { busy, run } = usePriceListDownload()
  return (
    <Button variant={variant} size={size} icon="download" disabled={busy} onClick={run}>
      {busy ? 'Hazırlanıyor…' : label}
    </Button>
  )
}
