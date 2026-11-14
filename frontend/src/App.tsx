import { useEffect, useState } from 'react'
import { fetchHealth, type HealthStatus } from './api'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; health: HealthStatus }
  | { kind: 'error' }

function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then((health) => setState({ kind: 'ready', health }))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          console.error(err)
          setState({ kind: 'error' })
        }
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="shell">
      <h1>Amisos B2B</h1>
      <p className="subtitle">Bayi sipariş portalı</p>
      <section className="status" aria-live="polite">
        {state.kind === 'loading' && <p>Sunucu kontrol ediliyor…</p>}
        {state.kind === 'error' && (
          <p className="bad">Sunucuya ulaşılamadı. Backend çalışıyor mu?</p>
        )}
        {state.kind === 'ready' && (
          <ul>
            <li className={state.health.status === 'ok' ? 'good' : 'bad'}>
              Sunucu: {state.health.status === 'ok' ? 'çalışıyor' : 'hata'}
            </li>
            <li className={state.health.database === 'up' ? 'good' : 'bad'}>
              Veritabanı: {state.health.database === 'up' ? 'bağlı' : 'bağlı değil'}
            </li>
          </ul>
        )}
      </section>
    </main>
  )
}

export default App
