// K-78: Komut paleti (Ctrl/Cmd+K). Genel arama (sipariş, bayi, ürün) ve sayfalara hızlı geçiş.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { fetchAdminSearch, type SearchResults } from '../api'
import { navigate } from '../router'
import { OrderStatusBadge } from '../ui/components'
import { formatTRY } from '../ui/format'
import { Icon, type IconName } from '../ui/Icon'
import { CREATE_ACTIONS, ALL_NAV } from './nav'

interface Entry {
  key: string
  group: string
  label: string
  hint?: string
  icon: IconName
  to: string
  trailing?: React.ReactNode
}

const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()

function commandEntries(q: string): Entry[] {
  const needle = norm(q)
  const pages: Entry[] = ALL_NAV.map((n) => ({
    key: `page-${n.to}`,
    group: 'Sayfalar',
    label: n.label,
    icon: n.icon,
    to: n.to,
    hint: n.keywords,
  }))
  const create: Entry[] = CREATE_ACTIONS.map((c) => ({
    key: `new-${c.to}`,
    group: 'Oluştur',
    label: `Yeni: ${c.label}`,
    icon: 'plus',
    to: c.to,
  }))
  const extra: Entry[] = [
    { key: 'page-hesabim', group: 'Sayfalar', label: 'Hesabım', icon: 'user', to: '/yonetim/hesabim' },
    { key: 'page-vitrin', group: 'Sayfalar', label: 'Vitrini gör', icon: 'external', to: '/' },
  ]
  const all = [...pages, ...extra, ...create]
  if (!needle) return all
  return all.filter((e) => norm(`${e.label} ${e.hint ?? ''}`).includes(needle))
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="adm-palette"
      aria-label="Komut paleti"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      {open && <PaletteBody onClose={onClose} />}
    </dialog>
  )
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [remote, setRemote] = useState<{ q: string; data: SearchResults | null; failed: boolean } | null>(
    null,
  )
  const listRef = useRef<HTMLDivElement>(null)
  const trimmed = q.trim()
  const canSearch = trimmed.length >= 2

  useEffect(() => {
    if (!canSearch) return
    const c = new AbortController()
    const t = setTimeout(() => {
      fetchAdminSearch(trimmed, c.signal)
        .then((data) => setRemote({ q: trimmed, data, failed: false }))
        .catch(() => {
          if (!c.signal.aborted) setRemote({ q: trimmed, data: null, failed: true })
        })
    }, 220)
    return () => {
      clearTimeout(t)
      c.abort()
    }
  }, [trimmed, canSearch])

  const fresh = canSearch && remote && remote.q === trimmed ? remote : null
  const searching = canSearch && !fresh

  const entries = useMemo(() => {
    const out: Entry[] = []
    const d = fresh?.data
    if (d) {
      for (const o of d.orders)
        out.push({
          key: `o-${o.id}`,
          group: 'Siparişler',
          label: `#${o.orderNo} · ${o.dealerName}`,
          icon: 'orders',
          to: `/yonetim/siparisler/${encodeURIComponent(o.id)}`,
          trailing: (
            <>
              <OrderStatusBadge status={o.status} />
              <span className="num">{formatTRY(o.grandTotal)}</span>
            </>
          ),
        })
      for (const b of d.dealers)
        out.push({
          key: `d-${b.id}`,
          group: 'Bayiler',
          label: b.companyTitle,
          hint: [b.contactName, b.city].filter(Boolean).join(' · '),
          icon: 'users',
          to: `/yonetim/bayiler/${encodeURIComponent(b.id)}`,
        })
      for (const p of d.products)
        out.push({
          key: `p-${p.id}`,
          group: 'Ürünler',
          label: p.name,
          hint: [p.barcode, p.code].filter(Boolean).join(' · '),
          icon: 'boxes',
          to: `/yonetim/urunler/${encodeURIComponent(p.id)}`,
          trailing: p.isActive ? undefined : <span className="muted">Pasif</span>,
        })
    }
    return [...out, ...commandEntries(trimmed)]
  }, [fresh, trimmed])

  const clamped = Math.min(active, Math.max(0, entries.length - 1))

  useEffect(() => {
    listRef.current?.querySelector(`#pal-opt-${clamped}`)?.scrollIntoView({ block: 'nearest' })
  }, [clamped])

  function go(e: Entry) {
    onClose()
    navigate(e.to)
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(entries.length ? (clamped + 1) % entries.length : 0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(entries.length ? (clamped - 1 + entries.length) % entries.length : 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (entries[clamped]) go(entries[clamped])
    }
  }

  let lastGroup = ''
  return (
    <div className="adm-palette__box">
      <div className="adm-palette__input">
        <Icon name="search" />
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="pal-list"
          aria-activedescendant={entries.length ? `pal-opt-${clamped}` : undefined}
          aria-label="Sipariş, bayi, ürün ara veya sayfaya git"
          placeholder="Sipariş no, bayi, ürün veya sayfa ara…"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKey}
        />
        <kbd>Esc</kbd>
      </div>
      <div className="adm-palette__list" id="pal-list" role="listbox" aria-label="Sonuçlar" ref={listRef}>
        {entries.map((e, i) => {
          const head = e.group !== lastGroup
          lastGroup = e.group
          return (
            <div key={e.key} role="presentation">
              {head && (
                <div className="adm-palette__group" role="presentation">
                  {e.group}
                </div>
              )}
              <div
                id={`pal-opt-${i}`}
                role="option"
                aria-selected={i === clamped}
                className="adm-palette__item"
                onMouseMove={() => setActive(i)}
                onClick={() => go(e)}
              >
                <Icon name={e.icon} />
                <span className="adm-palette__label">
                  {e.label}
                  {e.hint && <span className="adm-palette__hint">{e.hint}</span>}
                </span>
                {e.trailing && <span className="adm-palette__trail">{e.trailing}</span>}
              </div>
            </div>
          )
        })}
        {entries.length === 0 && !searching && <p className="adm-palette__note">Sonuç bulunamadı.</p>}
        {searching && (
          <p className="adm-palette__note" role="status">
            Aranıyor…
          </p>
        )}
        {fresh?.failed && (
          <p className="adm-palette__note" role="status">
            Arama şu an yapılamıyor; yalnızca sayfa komutları gösteriliyor.
          </p>
        )}
        {canSearch &&
          fresh?.data &&
          !fresh.data.orders.length &&
          !fresh.data.dealers.length &&
          !fresh.data.products.length && (
            <p className="adm-palette__note" role="status">
              Kayıt bulunamadı.
            </p>
          )}
      </div>
      <div className="adm-palette__foot" aria-hidden="true">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> gez
        </span>
        <span>
          <kbd>Enter</kbd> aç
        </span>
        <span>
          <kbd>Esc</kbd> kapat
        </span>
      </div>
    </div>
  )
}
