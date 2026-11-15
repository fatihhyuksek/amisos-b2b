// Sepet rozeti için sayı kaynağı. Sepet frontend'i bağlanınca bir CartCountContext.Provider
// (GET /api/cart satır sayısı) uygulamayı sarar; başlık kodu değişmez. Şimdilik 0.
import { createContext, useContext } from 'react'

export const CartCountContext = createContext<number>(0)

export function useCartCount(): number {
  return useContext(CartCountContext)
}
