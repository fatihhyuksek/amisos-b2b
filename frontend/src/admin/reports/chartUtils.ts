import { useEffect, useRef, useState } from 'react'

export function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

/** Eksen için "yuvarlak" üst sınır ve eşit aralıklı çizgiler (yalnızca ölçek; tutar hesabı değil). */
export function niceScale(max: number, ticks = 4): { top: number; values: number[] } {
  if (max <= 0) return { top: 1, values: [0, 1] }
  const raw = max / ticks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const values = Array.from({ length: ticks + 1 }, (_, i) => i * step).filter((v) => v <= step * ticks)
  return { top: step * ticks, values }
}
