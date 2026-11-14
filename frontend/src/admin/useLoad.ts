import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api'
import { useAuth } from '../auth/useAuth'

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; notFound: boolean }
  | { status: 'ready'; data: T }

/**
 * Admin verisini yükler. `key` değişince yeniden yükler; `reload()` aynı anahtarla tazeler.
 * Oturum düştüyse (401/403) oturum durumu yenilenir ve korumalı alan girişe yönlendirir.
 */
export function useLoad<T>(loader: (signal: AbortSignal) => Promise<T>, key: string) {
  const { refresh } = useAuth()
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [tick, setTick] = useState(0)
  const loaderRef = useRef(loader)
  useEffect(() => {
    loaderRef.current = loader
  })

  useEffect(() => {
    const controller = new AbortController()
    loaderRef
      .current(controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) void refresh()
        setState({ status: 'error', notFound: err instanceof ApiError && err.status === 404 })
      })
    return () => controller.abort()
  }, [key, tick, refresh])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { state, reload }
}
