// K-78: Sipariş iç notları. Yalnızca Admin görür; bayiye hiçbir yerde gösterilmez.
import { useState, type FormEvent } from 'react'
import { addOrderNote, deleteOrderNote, fetchOrderNotes, type OrderNote } from '../api'
import { Alert, Button, Modal } from '../ui/components'
import { networkMessage } from '../ui/networkMessage'
import { Icon } from '../ui/Icon'
import { formatDateTime } from '../ui/format'
import { Panel } from './kit'
import { useLoad } from './useLoad'

const MAX = 2000

export function OrderNotes({ orderId }: { orderId: string }) {
  const { state, reload } = useLoad<OrderNote[]>((s) => fetchOrderNotes(orderId, s), `notes-${orderId}`)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<OrderNote | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) {
      setError('Not boş olamaz.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await addOrderNote(orderId, text)
      setBody('')
      reload()
    } catch (err) {
      setError(networkMessage(err, 'Not kaydedilemedi. Lütfen tekrar deneyin.'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setBusy(true)
    try {
      await deleteOrderNote(orderId, toDelete.id)
      setToDelete(null)
      reload()
    } catch (err) {
      setError(networkMessage(err, 'Not silinemedi. Lütfen tekrar deneyin.'))
      setToDelete(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="İç notlar" flush id="ic-notlar">
      <p className="adm-private" style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
        <Icon name="lock" />
        Yalnızca yönetim ekibi görür; bayiye gösterilmez.
      </p>
      <form
        onSubmit={submit}
        className="adm-stack"
        style={{ padding: 'var(--space-3) var(--space-4)' }}
        noValidate
      >
        <label className="visually-hidden" htmlFor="order-note">
          Yeni iç not
        </label>
        <textarea
          id="order-note"
          className="ui-textarea"
          rows={3}
          maxLength={MAX}
          placeholder="Örn. Bayi ile telefonda görüşüldü, sevkiyat Cuma."
          value={body}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setBody(e.target.value)
            setError('')
          }}
        />
        {error && <Alert tone="danger">{error}</Alert>}
        <div>
          <Button type="submit" size="sm" disabled={busy || !body.trim()}>
            {busy ? 'Kaydediliyor…' : 'Not ekle'}
          </Button>
        </div>
      </form>
      {state.status === 'loading' && (
        <div className="adm-skel" aria-busy="true">
          <div className="ui-skeleton" style={{ height: '1.5rem' }} />
        </div>
      )}
      {state.status === 'error' && (
        <p className="adm-empty">
          Notlar alınamadı.{' '}
          <button type="button" className="ui-linklike" onClick={reload}>
            Tekrar dene
          </button>
        </p>
      )}
      {state.status === 'ready' && state.data.length === 0 && (
        <p className="adm-empty" style={{ borderTop: '1px solid var(--adm-border)' }}>
          Bu sipariş için not yok.
        </p>
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="adm-notes" style={{ borderTop: '1px solid var(--adm-border)' }}>
          {state.data.map((n) => (
            <li key={n.id}>
              <span className="ui-prewrap">{n.body}</span>
              <span className="adm-notes__meta">
                <span>
                  {n.createdBy.fullName} · {formatDateTime(n.createdAt)}
                </span>
                <button type="button" className="adm-textbtn" onClick={() => setToDelete(n)}>
                  Sil<span className="visually-hidden"> ({formatDateTime(n.createdAt)} tarihli not)</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {toDelete && (
        <Modal title="Notu sil" onClose={() => setToDelete(null)} dismissable={!busy}>
          <p>Bu iç not kalıcı olarak silinecek.</p>
          <div className="ui-modal__actions">
            <Button variant="secondary" disabled={busy} onClick={() => setToDelete(null)}>
              Vazgeç
            </Button>
            <Button variant="danger" disabled={busy} onClick={confirmDelete}>
              {busy ? 'Siliniyor…' : 'Sil'}
            </Button>
          </div>
        </Modal>
      )}
    </Panel>
  )
}
