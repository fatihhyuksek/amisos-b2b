// Sepet durumu sağlayıcısı: GET /api/cart; mutasyonlar PUT/DELETE; iyimser güncelleme yok,
// ekran sunucu yanıtıyla güncellenir. Mutasyonlar sıraya alınır (hızlı tıklamada yarış olmaz).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, clearCartApi, deleteCartItem, fetchCart, putCartItem, type Cart } from '../api'
import { useAuth } from '../auth/useAuth'
import { CartContext, type CartContextValue, type CartNotices, type Toast } from './cart'
import { CartCountContext } from './cartCount'

const NO_NOTICES: CartNotices = { removed: [], adjusted: [], skipped: [] }

interface Data {
  owner: string | null
  status: 'loading' | 'ready' | 'error'
  cart: Cart | null
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { state, refresh } = useAuth()
  const dealerId = state.status === 'authenticated' && state.user.type === 'dealer' ? state.user.id : null
  const [data, setData] = useState<Data>({ owner: null, status: 'loading', cart: null })
  const [notices, setNotices] = useState<CartNotices>(NO_NOTICES)
  const [toast, setToast] = useState<Toast | null>(null)
  const [tick, setTick] = useState(0)
  const [pending, setPending] = useState(0)
  const seq = useRef(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const toastId = useRef(0)
  const ownerRef = useRef<string | null>(null)
  useEffect(() => {
    ownerRef.current = dealerId
  })

  const absorbNotices = useCallback((cart: Cart) => {
    if (cart.removed.length === 0 && cart.adjusted.length === 0) return
    setNotices((n) => ({
      ...n,
      removed: [
        ...n.removed,
        ...cart.removed.filter((r) => !n.removed.some((x) => x.productId === r.productId)),
      ],
      adjusted: [...n.adjusted, ...cart.adjusted],
    }))
  }, [])

  const apply = useCallback(
    (cart: Cart) => {
      absorbNotices(cart)
      setData({ owner: ownerRef.current, status: 'ready', cart })
    },
    [absorbNotices],
  )

  useEffect(() => {
    if (!dealerId) return
    const mine = ++seq.current
    // İstek iptal edilmez: sunucu düşürülen satırları bu istekte bildirir, yanıt kaybolmamalı.
    fetchCart()
      .then((cart) => {
        absorbNotices(cart)
        if (mine === seq.current) setData({ owner: dealerId, status: 'ready', cart })
      })
      .catch((err: unknown) => {
        if (mine !== seq.current) return
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) void refresh()
        setData({ owner: dealerId, status: 'error', cart: null })
      })
  }, [dealerId, tick, refresh, absorbNotices])

  const view: Data = data.owner === dealerId ? data : { owner: dealerId, status: 'loading', cart: null }

  const enqueue = useCallback(
    <T,>(job: () => Promise<T>): Promise<T> => {
      setPending((n) => n + 1)
      const run = queue.current
        .then(job, job)
        .catch((err: unknown) => {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) void refresh()
          throw err
        })
        .finally(() => setPending((n) => n - 1))
      queue.current = run.catch(() => undefined)
      return run
    },
    [refresh],
  )

  const setQuantity = useCallback(
    (productId: string, quantity: number) =>
      enqueue(async () => {
        const cart = await putCartItem(productId, quantity)
        apply(cart)
        return cart
      }),
    [enqueue, apply],
  )

  const removeLine = useCallback(
    (productId: string) =>
      enqueue(async () => {
        const cart = await deleteCartItem(productId)
        apply(cart)
        return cart
      }),
    [enqueue, apply],
  )

  const clear = useCallback(
    () =>
      enqueue(async () => {
        await clearCartApi()
        const cart = await fetchCart()
        apply(cart)
      }),
    [enqueue, apply],
  )

  const reload = useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const addNotices = useCallback<CartContextValue['addNotices']>((extra) => {
    setNotices((n) => ({
      ...n,
      adjusted: [...n.adjusted, ...(extra.adjusted ?? [])],
      skipped: [...n.skipped, ...(extra.skipped ?? [])],
    }))
  }, [])

  const notify = useCallback((t: Omit<Toast, 'id'>) => {
    toastId.current += 1
    setToast({ ...t, id: toastId.current })
  }, [])

  const dismissNotices = useCallback(() => setNotices(NO_NOTICES), [])
  const dismissToast = useCallback(() => setToast(null), [])

  const cart = view.cart
  const value = useMemo<CartContextValue>(
    () => ({
      status: view.status,
      cart,
      notices,
      toast,
      reload,
      setQuantity,
      removeLine,
      clear,
      applyCart: apply,
      addNotices,
      busy: pending > 0,
      dismissNotices,
      notify,
      dismissToast,
      quantityOf: (productId) => cart?.lines.find((l) => l.productId === productId)?.quantity ?? 0,
    }),
    [
      view.status,
      cart,
      notices,
      toast,
      reload,
      setQuantity,
      removeLine,
      clear,
      apply,
      addNotices,
      notify,
      pending,
      dismissNotices,
      dismissToast,
    ],
  )

  return (
    <CartContext.Provider value={value}>
      <CartCountContext.Provider value={cart?.lines.length ?? 0}>{children}</CartCountContext.Provider>
    </CartContext.Provider>
  )
}
