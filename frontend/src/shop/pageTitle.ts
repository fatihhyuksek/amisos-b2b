import { useEffect } from 'react'

/** Sekme başlığı (erişilebilirlik ve geçmiş listesi için sayfaya özel). */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · AMİSOS B2B` : 'AMİSOS B2B'
  }, [title])
}
