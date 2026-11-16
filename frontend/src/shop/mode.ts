// Vitrin kipi (K-66): oturumsuz (guest), bayi (dealer) veya Admin. Fiyat yalnızca bayiye görünür.
import { useAuth } from '../auth/useAuth'

export type ShopMode = 'guest' | 'dealer' | 'admin'

export function useShopMode(): ShopMode {
  const { state } = useAuth()
  if (state.status !== 'authenticated') return 'guest'
  return state.user.type === 'admin' ? 'admin' : 'dealer'
}
