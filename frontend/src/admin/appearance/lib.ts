// K-87: Görünüm ekranlarının yardımcı işlevleri (sıra değiştirme, odak, bağlantı doğrulama).

/** Listede bir öğeyi bir yer yukarı/aşağı alır. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list
  const next = [...list]
  const [it] = next.splice(from, 1)
  next.splice(to, 0, it)
  return next
}

/** Sıra değişince DOM düğümü taşınır ve odak düşer; aynı satırın düğmesine odağı geri verir. */
export function focusMoved(idBase: string, dir: 'up' | 'down'): void {
  requestAnimationFrame(() => {
    const first = document.getElementById(`${idBase}-${dir}`) as HTMLButtonElement | null
    const other = document.getElementById(
      `${idBase}-${dir === 'up' ? 'down' : 'up'}`,
    ) as HTMLButtonElement | null
    ;(first && !first.disabled ? first : other)?.focus()
  })
}

/** Alt+ok tuşlarıyla sıra değiştirme. true dönerse olay işlenmiştir. */
export function reorderKey(e: React.KeyboardEvent, index: number, onMove: (to: number) => void): boolean {
  if (!e.altKey) return false
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    onMove(index - 1)
    return true
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    onMove(index + 1)
    return true
  }
  return false
}

/** Uygulama içi yol mu ("/katalog", çift eğik çizgi ve boşluk yok)? */
export function isAppPath(v: string): boolean {
  return /^\/(?!\/)[^\\\s]*$/.test(v)
}
