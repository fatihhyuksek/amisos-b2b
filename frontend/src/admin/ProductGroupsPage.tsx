// K-40, K-12: Ürün grupları yönetimi. Ekle, yeniden adlandır, sıra, pasife al, sil.
import { useState, type FormEvent } from 'react'
import {
  ApiError,
  createProductGroup,
  deleteProductGroup,
  fetchProductGroups,
  updateProductGroup,
  type ProductGroup,
} from '../api'
import { Alert, Badge, Button, EmptyState, Field, Modal } from '../ui/components'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { networkMessage } from '../ui/networkMessage'
import { AdminLayout } from './AdminLayout'
import { useLoad } from './useLoad'

const DUPLICATE = 'Bu adla bir ürün grubu zaten var.'

function parseOrder(v: string): number | null | undefined {
  const t = v.trim()
  if (t === '') return undefined
  return /^\d{1,6}$/.test(t) ? Number(t) : null
}

function groupError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.code === 'DUPLICATE_GROUP') return DUPLICATE
    if (err.status === 409 && err.code === 'GROUP_NOT_EMPTY')
      return 'Bu gruba bağlı ürünler var, silinemez. Ürünleri başka gruba taşıyın veya grubu pasife alın.'
    if (err.status === 404) return 'Grup bulunamadı; liste yenilendi.'
    if (err.status === 400) return 'Girilen bilgiler geçersiz.'
  }
  return networkMessage(err, 'İşlem tamamlanamadı. Lütfen daha sonra tekrar deneyin.')
}

function EditDialog({
  group,
  onClose,
  onSaved,
}: {
  group: ProductGroup
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(group.name)
  const [order, setOrder] = useState(String(group.sortOrder))
  const [errors, setErrors] = useState<{ name?: string; order?: string }>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const o = parseOrder(order)
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Grup adı zorunludur.'
    if (o === null || o === undefined) next.order = 'Sıra için 0 veya pozitif bir tam sayı girin.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    setServerError(null)
    try {
      await updateProductGroup(group.id, { name: name.trim(), sortOrder: o ?? undefined })
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'DUPLICATE_GROUP')
        setErrors({ name: DUPLICATE })
      else setServerError(groupError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Grubu düzenle" onClose={onClose} dismissable={!busy}>
      <form className="ui-auth__form" onSubmit={submit} noValidate>
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <Field label="Grup adı" htmlFor="g-name" error={errors.name}>
          <input
            id="g-name"
            className="ui-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            autoFocus
          />
        </Field>
        <Field label="Sıra" htmlFor="g-order" error={errors.order} help="Küçük sayı listede önce gelir.">
          <input
            id="g-order"
            className="ui-input"
            inputMode="numeric"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            aria-invalid={errors.order ? true : undefined}
          />
        </Field>
        <div className="ui-modal__actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function ProductGroupsPage() {
  const { state, reload } = useLoad<ProductGroup[]>((s) => fetchProductGroups(s), 'groups')
  const [name, setName] = useState('')
  const [order, setOrder] = useState('')
  const [addErrors, setAddErrors] = useState<{ name?: string; order?: string }>({})
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ProductGroup | null>(null)
  const [deleting, setDeleting] = useState<ProductGroup | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    const o = parseOrder(order)
    const next: typeof addErrors = {}
    if (!name.trim()) next.name = 'Grup adı zorunludur.'
    if (o === null) next.order = 'Sıra için 0 veya pozitif bir tam sayı girin.'
    setAddErrors(next)
    setNotice(null)
    if (Object.keys(next).length > 0) return
    setAdding(true)
    try {
      await createProductGroup(name.trim(), o ?? undefined)
      setName('')
      setOrder('')
      setNotice({ tone: 'info', text: 'Grup eklendi.' })
      reload()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'DUPLICATE_GROUP')
        setAddErrors({ name: DUPLICATE })
      else setNotice({ tone: 'danger', text: groupError(err) })
    } finally {
      setAdding(false)
    }
  }

  async function toggleActive(g: ProductGroup) {
    setBusyId(g.id)
    setNotice(null)
    try {
      await updateProductGroup(g.id, { isActive: !g.isActive })
      setNotice({ tone: 'info', text: g.isActive ? 'Grup pasife alındı.' : 'Grup aktif edildi.' })
      reload()
    } catch (err) {
      setNotice({ tone: 'danger', text: groupError(err) })
    } finally {
      setBusyId(null)
    }
  }

  async function remove(g: ProductGroup) {
    setBusyId(g.id)
    setNotice(null)
    try {
      await deleteProductGroup(g.id)
      setNotice({ tone: 'info', text: `"${g.name}" silindi.` })
    } catch (err) {
      setNotice({ tone: 'danger', text: groupError(err) })
    } finally {
      setBusyId(null)
      setDeleting(null)
      reload()
    }
  }

  return (
    <AdminLayout title="Ürün grupları">
      <form className="ui-card ui-card__body ui-inline-form" onSubmit={add} noValidate>
        <Field label="Yeni grup adı" htmlFor="new-name" error={addErrors.name}>
          <input
            id="new-name"
            className="ui-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={addErrors.name ? true : undefined}
          />
        </Field>
        <Field label="Sıra (isteğe bağlı)" htmlFor="new-order" error={addErrors.order}>
          <input
            id="new-order"
            className="ui-input"
            inputMode="numeric"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            aria-invalid={addErrors.order ? true : undefined}
          />
        </Field>
        <Button type="submit" disabled={adding}>
          {adding ? 'Ekleniyor…' : 'Grup ekle'}
        </Button>
      </form>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Gruplar alınamadı.</ErrorAlert>}
      {state.status === 'ready' && state.data.length === 0 && (
        <div className="ui-card">
          <EmptyState title="Henüz ürün grubu yok">Yukarıdan ilk grubu ekleyin.</EmptyState>
        </div>
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="ui-cards ui-cards--always">
          {state.data.map((g) => (
            <li key={g.id} className="ui-card ui-grouprow">
              <div className="ui-grouprow__main">
                <strong>{g.name}</strong>
                <span className="ui-rowcard__meta">
                  Sıra {g.sortOrder} · {g.productCount} ürün
                </span>
              </div>
              <Badge tone={g.isActive ? 'success' : 'neutral'}>{g.isActive ? 'Aktif' : 'Pasif'}</Badge>
              <div className="ui-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(g)}
                  disabled={busyId === g.id}
                >
                  Düzenle
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => toggleActive(g)}
                  disabled={busyId === g.id}
                >
                  {g.isActive ? 'Pasife al' : 'Aktif et'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDeleting(g)}
                  disabled={busyId === g.id}
                  aria-label={`${g.name} grubunu sil`}
                >
                  Sil
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <EditDialog
          group={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setNotice({ tone: 'info', text: 'Grup güncellendi.' })
            reload()
          }}
        />
      )}
      {deleting && (
        <Modal title="Grubu sil" onClose={() => setDeleting(null)} dismissable={busyId === null}>
          <p>
            "{deleting.name}" grubu silinecek.
            {deleting.productCount > 0 &&
              ` Grupta ${deleting.productCount} ürün var; ürünü olan grup silinemez.`}
          </p>
          <div className="ui-modal__actions">
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busyId !== null}>
              Vazgeç
            </Button>
            <Button variant="danger" onClick={() => remove(deleting)} disabled={busyId !== null}>
              {busyId ? 'Siliniyor…' : 'Sil'}
            </Button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  )
}
