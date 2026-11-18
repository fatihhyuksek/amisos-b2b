import { useEffect } from 'react'
import { setNavigationBlocker } from '../router'

const MESSAGE = 'Kaydedilmemiş değişiklikler var. Sayfadan çıkarsanız kaybolacak. Çıkılsın mı?'

/** Kaydedilmemiş değişiklik varken sayfa yenileme/kapatma ve uygulama içi bağlantılarda onay ister. */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    setNavigationBlocker(() => window.confirm(MESSAGE))
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      setNavigationBlocker(null)
    }
  }, [dirty])
}
