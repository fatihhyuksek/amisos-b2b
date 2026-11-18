// K-87: Admin > Görünüm > Menü (/yonetim/gorunum/menu). Vitrin üst menüsü: grup, Öne Çıkanlar, Yeni Ürünler,
// Çok Satanlar ve özel bağlantı; en çok 12 öğe. Liste boşsa varsayılan menü (aktif gruplar + Öne Çıkanlar + Yeni Ürünler).
import { useState } from 'react'
import {
  fetchAdminNavigation,
  saveAdminNavigation,
  type CatalogGroup,
  type NavigationItem,
  type NavItemType,
} from '../../api'
import { useCatalogGroups } from '../../shop/useCatalogGroups'
import { invalidateSite } from '../../shop/site'
import { ErrorAlert } from '../../ui/catalog'
import { Alert, Button, Field } from '../../ui/components'
import { Icon } from '../../ui/Icon'
import { AdminLayout } from '../AdminLayout'
import { Panel, SkeletonRows } from '../kit'
import { useLoad } from '../useLoad'
import { useUnsavedGuard } from '../useUnsavedGuard'
import { ReorderButtons, SaveBar, SaveError } from './parts'
import { focusMoved, isAppPath, moveItem, reorderKey } from './lib'

const MAX_ITEMS = 12

const TYPE_LABEL: Record<NavItemType, string> = {
  group: 'Ürün grubu',
  featured: 'Öne çıkanlar',
  new: 'Yeni ürünler',
  bestSellers: 'Çok satanlar',
  link: 'Özel bağlantı',
}

const DEFAULT_LABEL: Partial<Record<NavItemType, string>> = {
  featured: 'Öne Çıkanlar',
  new: 'Yeni Ürünler',
  bestSellers: 'Çok Satanlar',
}

interface Row {
  key: number
  type: NavItemType
  groupId: string
  label: string
  href: string
}

let nextKey = 1
const toRows = (items: NavigationItem[]): Row[] =>
  items.map((i) => ({
    key: nextKey++,
    type: i.type,
    groupId: i.groupId ?? '',
    label: i.label ?? '',
    href: i.href ?? '',
  }))
const sig = (rows: Row[]) => JSON.stringify(rows.map((r) => [r.type, r.groupId, r.label, r.href]))

function toItem(r: Row): NavigationItem {
  if (r.type === 'group')
    return { type: 'group', groupId: r.groupId, ...(r.label.trim() ? { label: r.label.trim() } : {}) }
  if (r.type === 'link') return { type: 'link', label: r.label.trim(), href: r.href.trim() }
  return { type: r.type, ...(r.label.trim() ? { label: r.label.trim() } : {}) }
}

export function MenuPage() {
  const { state, reload } = useLoad(fetchAdminNavigation, 'navigation')
  const groups = useCatalogGroups()
  return (
    <AdminLayout title="Menü">
      {state.status === 'loading' && <SkeletonRows rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Menü ayarı alınamadı.</ErrorAlert>}
      {state.status === 'ready' && (
        <Editor
          initial={state.data.items}
          groups={groups.state.status === 'ready' ? groups.state.data : []}
        />
      )}
    </AdminLayout>
  )
}

function Editor({ initial, groups }: { initial: NavigationItem[]; groups: CatalogGroup[] }) {
  const [rows, setRows] = useState(() => toRows(initial))
  const [baseRows, setBaseRows] = useState(rows)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [live, setLive] = useState('')
  const [addType, setAddType] = useState<NavItemType>('group')
  const dirty = sig(rows) !== sig(baseRows)
  useUnsavedGuard(dirty)

  const patch = (key: number, p: Partial<Row>) =>
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return
    focusMoved(`nav-${rows[from].key}`, to > from ? 'down' : 'up')
    setRows(moveItem(rows, from, to))
    setLive(`Menü öğesi ${to + 1}. sıraya taşındı`)
  }
  const add = () =>
    setRows((cur) => [
      ...cur,
      {
        key: nextKey++,
        type: addType,
        groupId: addType === 'group' ? (groups[0]?.id ?? '') : '',
        label: '',
        href: '',
      },
    ])

  async function save() {
    const errs: Record<number, string> = {}
    for (const r of rows) {
      if (r.type === 'group' && !groups.some((g) => g.id === r.groupId)) errs[r.key] = 'Bir ürün grubu seçin.'
      else if (r.type === 'link') {
        if (!r.label.trim()) errs[r.key] = 'Menü yazısı boş olamaz.'
        else if (!isAppPath(r.href.trim()))
          errs[r.key] = 'Bağlantı "/" ile başlayan bir site yolu olmalı (ör. /katalog).'
      }
    }
    setErrors(errs)
    setSaved(false)
    if (Object.keys(errs).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setBusy(true)
    setError(null)
    try {
      const out = await saveAdminNavigation({ items: rows.map(toItem) })
      invalidateSite()
      const next = toRows(out.items)
      setRows(next)
      setBaseRows(next)
      setSaved(true)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-stack">
      <p className="muted">
        Vitrinde kategori çubuğunda soldaki “Kategoriler” menüsünün yanında sıralanır. Dar ekranda sığmayanlar
        çubukta gizlenir; telefonda tümü çekmecede görünür.
      </p>
      {saved && !dirty && <Alert>Menü kaydedildi. Değişiklikler vitrinde hemen görünür.</Alert>}
      <SaveError error={error} />
      <span className="visually-hidden" role="status" aria-live="polite">
        {live}
      </span>

      <Panel title={`Menü öğeleri (${rows.length}/${MAX_ITEMS})`}>
        {rows.length === 0 ? (
          <p className="adm-empty">
            Özel menü yok: vitrinde varsayılan menü gösteriliyor (aktif gruplar, Öne Çıkanlar, Yeni Ürünler).
          </p>
        ) : (
          <ol className="ap-rows">
            {rows.map((r, i) => (
              <li
                key={r.key}
                className="ap-row"
                onKeyDown={(e) => {
                  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
                  reorderKey(e, i, (to) => move(i, to))
                }}
              >
                <span className="ap-row__no num" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="ap-row__fields">
                  <p className="ap-row__type">{TYPE_LABEL[r.type]}</p>
                  {r.type === 'group' && (
                    <Field label="Ürün grubu" htmlFor={`nav-group-${r.key}`} error={errors[r.key]}>
                      <select
                        id={`nav-group-${r.key}`}
                        className="ui-select"
                        value={r.groupId}
                        aria-invalid={errors[r.key] ? true : undefined}
                        onChange={(e) => patch(r.key, { groupId: e.target.value })}
                      >
                        {!groups.some((g) => g.id === r.groupId) && <option value="">Seçin…</option>}
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {r.type !== 'group' && (
                    <Field
                      label="Menü yazısı"
                      htmlFor={`nav-label-${r.key}`}
                      help={r.type === 'link' ? undefined : `Boşsa “${DEFAULT_LABEL[r.type]}” yazar.`}
                      error={r.type === 'link' ? errors[r.key] : undefined}
                    >
                      <input
                        id={`nav-label-${r.key}`}
                        className="ui-input"
                        value={r.label}
                        maxLength={40}
                        aria-invalid={r.type === 'link' && errors[r.key] ? true : undefined}
                        onChange={(e) => patch(r.key, { label: e.target.value })}
                      />
                    </Field>
                  )}
                  {r.type === 'link' && (
                    <Field
                      label="Bağlantı"
                      htmlFor={`nav-href-${r.key}`}
                      help="Örn. /katalog?stok=var ya da /iletisim"
                    >
                      <input
                        id={`nav-href-${r.key}`}
                        className="ui-input"
                        placeholder="/katalog"
                        value={r.href}
                        aria-invalid={errors[r.key] ? true : undefined}
                        onChange={(e) => patch(r.key, { href: e.target.value })}
                      />
                    </Field>
                  )}
                </div>
                <span className="ap-row__tools">
                  <ReorderButtons
                    idBase={`nav-${r.key}`}
                    index={i}
                    count={rows.length}
                    label={`Menü öğesi ${i + 1}`}
                    onMove={(to) => move(i, to)}
                  />
                  <button
                    type="button"
                    className="ap-iconbtn ap-iconbtn--danger"
                    aria-label={`Menü öğesi ${i + 1}: kaldır`}
                    onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                  >
                    <Icon name="trash" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="ap-add">
          <Field label="Eklenecek öğe türü" htmlFor="nav-add-type">
            <select
              id="nav-add-type"
              className="ui-select"
              value={addType}
              onChange={(e) => setAddType(e.target.value as NavItemType)}
            >
              {(Object.keys(TYPE_LABEL) as NavItemType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Button variant="secondary" icon="plus" disabled={rows.length >= MAX_ITEMS} onClick={add}>
            Öğe ekle
          </Button>
        </div>
        {rows.length >= MAX_ITEMS && <p className="muted">En çok {MAX_ITEMS} öğe eklenebilir.</p>}
      </Panel>

      <SaveBar
        dirty={dirty}
        busy={busy}
        onSave={save}
        onReset={() => setRows(baseRows)}
        extra={
          rows.length > 0 ? (
            <Button variant="ghost" onClick={() => setRows([])}>
              Varsayılana dön
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}
