// Sunucunun sepette yaptığı değişiklikler (GR-SIP-008): düşürülen, yuvarlanan, eklenemeyen ürünler.
import { useCart } from './cart'
import { Alert } from '../ui/components'

export function CartNotices() {
  const { notices, dismissNotices } = useCart()
  const { removed, adjusted, skipped } = notices
  if (removed.length + adjusted.length + skipped.length === 0) return null
  return (
    <Alert tone="info">
      <div className="ui-notices">
        {removed.length > 0 && (
          <p>
            Satıştan kalktığı için sepetten çıkarıldı:{' '}
            <strong>{removed.map((r) => r.name).join(', ')}</strong>
          </p>
        )}
        {skipped.length > 0 && (
          <p>
            Satışta olmadığı için sepete eklenmedi: <strong>{skipped.map((r) => r.name).join(', ')}</strong>
          </p>
        )}
        {adjusted.map((a, i) => (
          <p key={`${a.productId}-${i}`}>
            <strong>{a.name}</strong>: koli içi adedi ({a.caseQuantity}) değiştiği için miktar {a.from}{' '}
            adetten {a.to} adede yükseltildi.
          </p>
        ))}
        <button type="button" className="ui-linklike ui-linklike--touch" onClick={dismissNotices}>
          Tamam, kapat
        </button>
      </div>
    </Alert>
  )
}
