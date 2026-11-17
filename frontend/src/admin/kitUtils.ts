// K-78: Panel bileşenlerinin ortak yardımcıları (bileşen olmayan dışa aktarımlar).
import { useEffect } from 'react'

/** Dışarı tıklayınca veya Esc ile kapatır; Esc'te odağı tetikleyiciye geri verir. */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  ref: React.RefObject<HTMLElement | null>,
  returnFocus?: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        returnFocus?.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, ref, returnFocus])
}

export const PAGE_SIZES = [20, 50, 100] as const

/** Adreste `adet` parametresi; geçersizse 20. */
export function parsePageSize(raw: string | null): number {
  const n = Number(raw)
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : 20
}
