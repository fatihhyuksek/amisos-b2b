// K-87: Admin > Görünüm > Duyurular (/yonetim/gorunum/duyurular). Vitrin üst şeridinde dönen en çok 5 mesaj.
// Eski tek duyuru alanı (Site ayarları) buraya taşındı: sunucu onu ilk öğe olarak okur.
import { useState } from 'react'
import { fetchAdminAnnouncements, saveAdminAnnouncements, type AnnouncementItem } from '../../api'
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

const MAX_ITEMS = 5
const MAX_TEXT = 120

interface Row {
  key: number
  text: string
  link: string
}

let nextKey = 1
const toRows = (items: AnnouncementItem[]): Row[] =>
  items.map((i) => ({ key: nextKey++, text: i.text, link: i.link ?? '' }))
const sig = (rows: Row[]) => JSON.stringify(rows.map((r) => [r.text, r.link]))

function validLink(v: string): boolean {
  const t = v.trim()
  return !t || isAppPath(t) || /^https:\/\/\S+$/.test(t)
}

export function AnnouncementsPage() {
  const { state, reload } = useLoad(fetchAdminAnnouncements, 'announcements')
  return (
    <AdminLayout title="Duyurular">
      {state.status === 'loading' && <SkeletonRows rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Duyurular alınamadı.</ErrorAlert>}
      {state.status === 'ready' && <Editor initial={state.data.items} />}
    </AdminLayout>
  )
}

function Editor({ initial }: { initial: AnnouncementItem[] }) {
  const [rows, setRows] = useState(() => toRows(initial))
  const [baseRows, setBaseRows] = useState(rows)
  const base = sig(baseRows)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [live, setLive] = useState('')
  const dirty = sig(rows) !== base
  useUnsavedGuard(dirty)

  const patch = (key: number, p: Partial<Row>) =>
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return
    focusMoved(`ann-${rows[from].key}`, to > from ? 'down' : 'up')
    setRows(moveItem(rows, from, to))
    setLive(`Duyuru ${to + 1}. sıraya taşındı`)
  }

  async function save() {
    const errs: Record<number, string> = {}
    for (const r of rows) {
      if (!r.text.trim()) errs[r.key] = 'Duyuru metni boş olamaz.'
      else if (r.text.length > MAX_TEXT) errs[r.key] = `En fazla ${MAX_TEXT} karakter.`
      else if (!validLink(r.link))
        errs[r.key] = 'Bağlantı "/" ile başlayan site yolu ya da https:// adresi olmalı.'
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
      const out = await saveAdminAnnouncements({
        items: rows.map((r) => ({ text: r.text.trim(), ...(r.link.trim() ? { link: r.link.trim() } : {}) })),
      })
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
        Vitrinin en üstündeki şeritte sırayla döner (5 saniyede bir). “Fiyatlar KDV hariçtir” ve telefon
        mesajı her zaman en sonda gösterilir.
      </p>
      {saved && !dirty && <Alert>Duyurular kaydedildi. Değişiklikler vitrinde hemen görünür.</Alert>}
      <SaveError error={error} />
      <span className="visually-hidden" role="status" aria-live="polite">
        {live}
      </span>

      <Panel
        title={`Duyurular (${rows.length}/${MAX_ITEMS})`}
        action={
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            disabled={rows.length >= MAX_ITEMS}
            onClick={() => setRows((cur) => [...cur, { key: nextKey++, text: '', link: '' }])}
          >
            Duyuru ekle
          </Button>
        }
      >
        {rows.length === 0 ? (
          <p className="adm-empty">Duyuru yok. Şerit yalnızca sabit mesajları gösterir.</p>
        ) : (
          <ol className="ap-rows">
            {rows.map((r, i) => (
              <li
                key={r.key}
                className="ap-row"
                onKeyDown={(e) => {
                  if (e.target instanceof HTMLInputElement) return
                  reorderKey(e, i, (to) => move(i, to))
                }}
              >
                <span className="ap-row__no num" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="ap-row__fields">
                  <Field
                    label={`Duyuru ${i + 1} metni`}
                    htmlFor={`ann-text-${r.key}`}
                    help={`${r.text.length} / ${MAX_TEXT}`}
                    error={errors[r.key]}
                  >
                    <input
                      id={`ann-text-${r.key}`}
                      className="ui-input"
                      value={r.text}
                      aria-invalid={errors[r.key] ? true : undefined}
                      onChange={(e) => patch(r.key, { text: e.target.value })}
                    />
                  </Field>
                  <Field label="Bağlantı (isteğe bağlı)" htmlFor={`ann-link-${r.key}`}>
                    <input
                      id={`ann-link-${r.key}`}
                      className="ui-input"
                      placeholder="/katalog?yeni=1"
                      value={r.link}
                      onChange={(e) => patch(r.key, { link: e.target.value })}
                    />
                  </Field>
                </div>
                <span className="ap-row__tools">
                  <ReorderButtons
                    idBase={`ann-${r.key}`}
                    index={i}
                    count={rows.length}
                    label={`Duyuru ${i + 1}`}
                    onMove={(to) => move(i, to)}
                  />
                  <button
                    type="button"
                    className="ap-iconbtn ap-iconbtn--danger"
                    aria-label={`Duyuru ${i + 1}: kaldır`}
                    onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                  >
                    <Icon name="trash" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {rows.some((r) => r.text.trim()) && (
        <Panel title="Önizleme">
          <div className="ui-strip ui-strip--preview" aria-label="Önizleme">
            {rows
              .filter((r) => r.text.trim())
              .map((r) => (
                <p key={r.key}>{r.text.trim()}</p>
              ))}
          </div>
        </Panel>
      )}

      <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={() => setRows(baseRows)} />
    </div>
  )
}
