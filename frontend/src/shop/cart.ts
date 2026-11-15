// Sepet durumu bağlamı (K-41, GR-SIP-008). Tek kaynak: CartProvider (GET /api/cart).
// Tutarlar sunucudan gelir; burada hesap yapılmaz.
import { createContext, useContext } from 'react'
import type { Cart, CartAdjusted } from '../api'

export interface CartNotices {
  removed: { productId: string; name: string }[]
  adjusted: CartAdjusted[]
  /** Tekrar siparişte pasif olduğu için sepete eklenmeyenler. */
  skipped: { productId: string; name: string; reason?: string }[]
}

export interface Toast {
  id: number
  tone: 'success' | 'danger'
  text: string
  detail?: string
  note?: string
  /** Sepete git bağlantısı gösterilsin mi. */
  cartLink?: boolean
}

export interface CartContextValue {
  status: 'loading' | 'ready' | 'error'
  cart: Cart | null
  /** Sunucunun sepetten düşürdüğü / miktarını yuvarladığı satırlar; bayi kapatana kadar kalır. */
  notices: CartNotices
  toast: Toast | null
  reload: () => Promise<void>
  /** Miktarı ayarlar (0 = kaldırır). Hata ApiError olarak fırlar (ör. 400 CASE_MULTIPLE). */
  setQuantity: (productId: string, quantity: number | ((current: number) => number)) => Promise<Cart>
  removeLine: (productId: string) => Promise<Cart>
  clear: () => Promise<void>
  /** Başka bir uçtan (409 PRICE_CHANGED, tekrar sipariş) gelen güncel sepeti uygular. */
  applyCart: (cart: Cart) => void
  /** Tekrar sipariş yanıtındaki adjusted / skipped kayıtlarını bilgi kutusuna ekler. */
  addNotices: (extra: { adjusted?: CartAdjusted[]; skipped?: CartNotices['skipped'] }) => void
  /** Sunucuda işlem sürüyor mu (sepet mutasyonu). */
  busy: boolean
  dismissNotices: () => void
  notify: (toast: Omit<Toast, 'id'>) => void
  dismissToast: () => void
  quantityOf: (productId: string) => number
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('CartProvider eksik')
  return ctx
}
