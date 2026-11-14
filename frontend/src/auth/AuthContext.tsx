import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchMe, logout as apiLogout, type AuthUser } from '../api'
import { AuthContext, type AuthState } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const user = await fetchMe()
      setState(user ? { status: 'authenticated', user } : { status: 'anonymous' })
      return user
    } catch {
      setState({ status: 'error' })
      return null
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchMe(controller.signal)
      .then((user) => setState(user ? { status: 'authenticated', user } : { status: 'anonymous' }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      /* Çıkış hatasında da yerel durumu temizle; çerez sunucuda süresiyle düşer. */
    }
    setState({ status: 'anonymous' })
  }, [])

  const value = useMemo(() => ({ state, refresh, logout }), [state, refresh, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
