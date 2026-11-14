// "Sepete eklendi · Sepete git" bildirimi. Bölge her zaman sayfada durur (aria-live); içerik değişince okunur.
import { useEffect } from 'react'
import { Link } from '../Link'
import { useRoute } from '../router'
import { Icon } from '../ui/Icon'
import { useCart } from './cart'

const VISIBLE_MS = 7000

export function CartToast() {
  const { toast, dismissToast } = useCart()
  const id = toast?.id
  const { path } = useRoute()
  // Başka sayfaya geçince eski bildirim kalkar.
  useEffect(() => {
    dismissToast()
  }, [path, dismissToast])
  useEffect(() => {
    if (id === undefined) return
    const t = window.setTimeout(dismissToast, VISIBLE_MS)
    return () => window.clearTimeout(t)
  }, [id, dismissToast])

  return (
    <div className="ui-toastzone" role="status" aria-live="polite" aria-atomic="true">
      {toast && (
        <div className={`ui-toast ui-toast--${toast.tone}`} key={toast.id}>
          <Icon name={toast.tone === 'success' ? 'bag' : 'warning'} />
          <div className="ui-toast__body">
            <strong>{toast.text}</strong>
            {toast.detail && <span className="ui-toast__detail">{toast.detail}</span>}
            {toast.note && <span className="ui-toast__note">{toast.note}</span>}
            {toast.cartLink && (
              <Link to="/sepet" className="ui-toast__link" onClick={dismissToast}>
                Sepete git
                <Icon name="arrowRight" />
              </Link>
            )}
          </div>
          <button
            type="button"
            className="ui-toast__close"
            aria-label="Bildirimi kapat"
            onClick={dismissToast}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  )
}
