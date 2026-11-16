// K-75: Bayi iç notları. Yalnızca Admin görür; bayiye gösterilmez.
import { useState, type FormEvent } from 'react'
import { addDealerNote, deleteDealerNote, fetchDealerNotes, type DealerNote } from '../api'
import { Alert, Button, Field, Modal } from '../ui/components'
import { formatDateTime } from '../ui/format'
import { networkMessage } from '../ui/networkMessage'
import { useLoad } from './useLoad'

const MAX = 2000

export function DealerNotes({ dealerId }: { dealerId: string }) {
  const { state, reload } = useLoad<DealerNote[]>((s) => fetchDealerNotes(dealerId, s), `notes-${dealerId}`)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<DealerNote | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = body.trim()
    if (!v) {
      setError('Not boş olamaz.')
      return
    }
    if (v.length > MAX) {
      setError(`Not en fazla ${MAX} karakter olabilir.`)
      return
    }
    setError(undefined)
    setNotice(null)
    setBusy(true)
    try {
      await addDealerNote(dealerId, v)
      setBody('')
      reload()
    } catch (err) {
      setNotice(networkMessage(err, 'Not eklenemedi. Lütfen tekrar deneyin.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(n: DealerNote) {
    setBusy(true)
    try {
      await deleteDealerNote(dealerId, n.id)
      setConfirm(null)
      reload()
    } catch (err) {
      setConfirm(null)
      setNotice(networkMessage(err, 'Not silinemedi. Lütfen tekrar deneyin.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ui-card ui-card__body ui-section" aria-labelledby="sec-notes">
      <h2 id="sec-notes">İç notlar</h2>
      <p className="muted">Yalnızca yöneticiler görür; bayiye hiçbir yerde gösterilmez.</p>
      {notice && <Alert tone="danger">{notice}</Alert>}
      <form className="ui-stack" onSubmit={submit} noValidate>
        <Field label="Yeni not" htmlFor="note-body" help={`${body.length} / ${MAX}`} error={error}>
          <textarea
            id="note-body"
            className="ui-textarea"
            rows={3}
            value={body}
            aria-invalid={error ? true : undefined}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <div>
          <Button type="submit" disabled={busy || !body.trim()}>
            Not ekle
          </Button>
        </div>
      </form>
      {state.status === 'loading' && <div className="ui-skeleton" style={{ height: '3rem' }} />}
      {state.status === 'error' && (
        <Alert tone="danger">
          Notlar alınamadı.{' '}
          <button type="button" className="ui-linklike" onClick={reload}>
            Tekrar dene
          </button>
        </Alert>
      )}
      {state.status === 'ready' && state.data.length === 0 && <p className="muted">Henüz not yok.</p>}
      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="ui-notes">
          {state.data.map((n) => (
            <li key={n.id}>
              <p className="ui-prewrap">{n.body}</p>
              <div className="ui-notes__meta">
                <span className="muted">
                  {n.createdBy.fullName} · {formatDateTime(n.createdAt)}
                </span>
                <Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirm(n)}>
                  Sil<span className="visually-hidden"> (not: {n.body.slice(0, 30)})</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {confirm && (
        <Modal title="Notu sil" onClose={() => setConfirm(null)} dismissable={!busy}>
          <p>Bu not kalıcı olarak silinecek. Devam edilsin mi?</p>
          <div className="ui-modal__actions">
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Vazgeç
            </Button>
            <Button variant="danger" onClick={() => void remove(confirm)} disabled={busy}>
              Sil
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}
