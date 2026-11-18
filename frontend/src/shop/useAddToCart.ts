// Ürün kartı ve ürün detayından sepete ekleme (GR-SIP-003, GR-SIP-004, K-20, K-21).
// Koli katı kontrolü yalnızca erken uyarıdır; asıl kontrol backend'dedir (400 CASE_MULTIPLE).
import { useCallback } from 'react'
import { ApiError, type CatalogProduct } from '../api'
import { useCart } from './cart'

const PRICE_NOT_SET_TEXT = 'Bu ürünün fiyatı henüz girilmedi. Fiyat için bize ulaşın.'
export const OUT_OF_STOCK_NOTE = 'Stokta yok — tedarik süresi görüşülecek'

export function useAddToCart() {
  const { setQuantity, notify } = useCart()
  return useCallback(
    /**
     * `quantity` verilmezse sepetteki miktara bir koli eklenir (sepette yoksa tek koli).
     * Verilirse sepet miktarı bu değere ayarlanır (ürün detayı).
     */
    async (p: CatalogProduct, quantity?: number, mode: 'add' | 'update' = 'add'): Promise<boolean> => {
      try {
        const cart = await setQuantity(
          p.id,
          quantity !== undefined ? quantity : (current) => current + p.caseQuantity,
        )
        const target = quantity ?? p.caseQuantity
        const line = cart.lines.find((l) => l.productId === p.id)
        notify({
          tone: 'success',
          text: mode === 'update' ? 'Sepet güncellendi' : 'Sepete eklendi',
          detail: `${p.name} · ${line?.quantity ?? target} adet`,
          note: p.stock === 'out_of_stock' ? OUT_OF_STOCK_NOTE : undefined,
          cartLink: true,
        })
        return true
      } catch (err) {
        const text =
          err instanceof ApiError && err.code === 'CASE_MULTIPLE'
            ? `Adet, koli içi adedinin (${p.caseQuantity}) katı olmalı`
            : err instanceof ApiError && err.code === 'PRICE_NOT_SET'
              ? PRICE_NOT_SET_TEXT
              : err instanceof ApiError && err.code === 'PRODUCT_NOT_FOUND'
                ? 'Bu ürün artık satışta değil'
                : err instanceof TypeError
                  ? 'Sunucuya ulaşılamadı. Lütfen biraz sonra tekrar deneyin.'
                  : 'Sepete eklenemedi. Lütfen tekrar deneyin.'
        notify({ tone: 'danger', text, detail: p.name })
        return false
      }
    },
    [setQuantity, notify],
  )
}
