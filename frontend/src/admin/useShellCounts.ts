// K-78: Menü rozeti için onay bekleyen başvuru sayısı (modül önbelleği; sayfa geçişinde titremez).
import { useEffect, useState } from 'react'
import { fetchDealerSummary } from '../api'

let cached: number | null = null

export function usePendingApplications(): number {
  const [n, setN] = useState(cached ?? 0)
  useEffect(() => {
    const c = new AbortController()
    fetchDealerSummary(c.signal)
      .then((r) => {
        cached = r.pendingApproval
        setN(r.pendingApproval)
      })
      .catch(() => undefined)
    return () => c.abort()
  }, [])
  return n
}
