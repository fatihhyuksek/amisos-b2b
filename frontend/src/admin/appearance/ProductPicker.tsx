// K-87: Elle ürün seçimi (ürün arama ile). Seçilenler sıralanabilir; en çok `max` ürün.
import { useEffect, useRef, useState } from 'react'
import { fetchAdminProducts, fetchCatalogProducts, type AdminProduct } from '../../api'
import { Icon } from '../../ui/Icon'
import { useDebounced } from '../../ui/useDebounced'
import { ReorderButtons } from './parts'
import { focusMoved, moveItem } from './lib'

interface Known {
  name: string
  barcode: string
  thumb: string | null
}

export function ProductPicker({
  idBase,
  ids,
  max,
  onChange,
}: {
  idBase: string
  ids: string[]
  max: number
  onChange: (ids: string[]) => void
}) {
  const [known, setKnown] = useState<Record<string, Known>>({})
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 300)
  const [found, setFound] = useState<{ q: string; items: AdminProduct[] | null } | null>(null)
  const results = dq && found?.q === dq ? found.items : null
  const failed = Boolean(dq && found?.q === dq && found.items === null)
  const asked = useRef(new Set<string>())

  // Kayıtlı ürünlerin adlarını bir kez çöz (vitrin ucundan, `ids=` ile).
  useEffect(() => {
    const missing = ids.filter((id) => !known[id] && !asked.current.has(id))
    if (missing.length === 0) return
    missing.forEach((id) => asked.current.add(id))
    let alive = true
    fetchCatalogProducts({ ids: missing.slice(0, 24), page: 1, pageSize: 24 })
      .then((r) => {
        if (!alive) return
        setKnown((cur) => ({
          ...cur,
          ...Object.fromEntries(
            r.items.map((p) => [
              p.id,
              { name: p.name, barcode: p.barcode, thumb: p.images[0]?.thumbUrl ?? null },
            ]),
          ),
        }))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [ids, known])

  useEffect(() => {
    if (!dq) return
    const c = new AbortController()
    fetchAdminProducts({ q: dq, active: 'true', page: 1, pageSize: 8 }, c.signal)
      .then((r) => setFound({ q: dq, items: r.items }))
      .catch(() => {
        if (!c.signal.aborted) setFound({ q: dq, items: null })
      })
    return () => c.abort()
  }, [dq])

  function add(p: AdminProduct) {
    setKnown((cur) => ({
      ...cur,
      [p.id]: { name: p.name, barcode: p.barcode, thumb: p.images[0]?.thumbUrl ?? null },
    }))
    onChange([...ids, p.id])
  }

  return (
    <div className="ap-picker">
      <div className="ui-field">
        <label className="ui-label" htmlFor={`${idBase}-search`}>
          Ürün ara (ad, barkod ya da kod)
        </label>
        <div className="ui-search">
          <Icon name="search" />
          <input
            id={`${idBase}-search`}
            className="ui-input"
            type="search"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={ids.length >= max}
          />
        </div>
        {ids.length >= max && <span className="ui-help">En çok {max} ürün seçilebilir.</span>}
      </div>
      {failed && <p className="ui-error">Arama yapılamadı.</p>}
      {results && (
        <ul className="ap-picker__results" aria-label="Arama sonuçları">
          {results.length === 0 && <li className="muted">Eşleşen aktif ürün yok.</li>}
          {results.map((p) => {
            const picked = ids.includes(p.id)
            return (
              <li key={p.id}>
                {p.images[0]?.thumbUrl ? (
                  <img src={p.images[0].thumbUrl} alt="" width={36} height={36} loading="lazy" />
                ) : (
                  <span className="ap-picker__ph" aria-hidden="true" />
                )}
                <span className="ap-picker__name">
                  {p.name}
                  <span className="muted num"> · {p.barcode}</span>
                </span>
                <button
                  type="button"
                  className="ui-button ui-button--secondary ui-button--sm"
                  disabled={picked || ids.length >= max}
                  onClick={() => add(p)}
                >
                  {picked ? 'Seçildi' : 'Ekle'}
                  <span className="visually-hidden">: {p.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="ui-label">
        Seçilen ürünler ({ids.length}/{max})
      </p>
      {ids.length === 0 ? (
        <p className="muted">Henüz ürün seçilmedi. Ürün seçilmezse bölüm vitrinde görünmez.</p>
      ) : (
        <ol className="ap-picker__chosen">
          {ids.map((id, i) => {
            const k = known[id]
            return (
              <li key={id}>
                {k?.thumb ? (
                  <img src={k.thumb} alt="" width={36} height={36} loading="lazy" />
                ) : (
                  <span className="ap-picker__ph" aria-hidden="true" />
                )}
                <span className="ap-picker__name">{k ? k.name : 'Ürün yükleniyor…'}</span>
                <ReorderButtons
                  idBase={`${idBase}-p${id}`}
                  index={i}
                  count={ids.length}
                  label={k?.name ?? `Ürün ${i + 1}`}
                  onMove={(to) => {
                    focusMoved(`${idBase}-p${id}`, to > i ? 'down' : 'up')
                    onChange(moveItem(ids, i, to))
                  }}
                />
                <button
                  type="button"
                  className="ap-iconbtn ap-iconbtn--danger"
                  aria-label={`${k?.name ?? 'Ürün'}: kaldır`}
                  onClick={() => onChange(ids.filter((x) => x !== id))}
                >
                  <Icon name="trash" />
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
