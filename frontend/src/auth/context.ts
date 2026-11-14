import { createContext } from 'react'
import type { AuthUser } from '../api'

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'error' }
  | { status: 'authenticated'; user: AuthUser }

export interface AuthContextValue {
  state: AuthState
  /** Girişten sonra oturumu /api/auth/me ile yeniden yükler. */
  refresh: () => Promise<AuthUser | null>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
