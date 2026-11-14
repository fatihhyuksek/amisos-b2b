// K-61, K-62: Admin görsel kütüphanesi. Toplu yükleme, arama, kullanılmayanlar, silme.
import { useState } from 'react'
import { ApiError, deleteMedia, fetchMedia, type Media, type Paged } from '../api'
import { Alert, Button, EmptyState, Modal, Pagination } from '../ui/components'
import { ErrorAlert, LoadingCard, ProductImage } from '../ui/catalog'
import { networkMessage } from '../ui/networkMessage'
import { formatInt } from '../ui/format'
import { Icon } from '../ui/Icon'
import { useDebounced } from '../ui/useDebounced'
import { AdminLayout } from './AdminLayout'
import { UploadPanel } from './UploadPanel'
import { useLoad } from './useLoad'

const PAGE_SIZE = 40

export function MediaLibraryPage() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const [unused, setUnused] = useState(false)
  const [page, setPage] = useState(1)
  const [confirm, setConfirm] = useState<Media | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  const { state, reload } = useLoad<Paged<Media>>(
    (signal) => fetchMedia({ q, unused, page, pageSize: PAGE_SIZE }, signal),
    `${q}|${unused}|${page}`,
  )

  async function remove(m: Media) {
    setBusy(true)
    try {
      await deleteMedia(m.id)
      setNotice({ tone: 'info', text: `"${m.filename}" silindi.` })
      reload()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'MEDIA_IN_USE') {
        setNotice({
          tone: 'danger',
          text: `"${m.filename}" bir veya daha fazla üründe kullanılıyor. Önce ürünlerden kaldırın.`,
        })
        reload()
      } else if (err instanceof ApiError && err.status === 404) {
        setNotice({ tone: 'danger', text: 'Görsel bulunamadı; liste yenilendi.' })
        reload()
      } else {
        setNotice({ tone: 'danger', text: networkMessage(err, 'Görsel silinemedi.') })
      }
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <AdminLayout title="Görseller">
      <UploadPanel
        onUploaded={() => {
          setPage(1)
          reload()
        }}
      />
      <div className="ui-toolbar__row">
        <div className="ui-search">
          <Icon name="search" />
          <input
            className="ui-input"
            type="search"
            aria-label="Görsel ara"
            placeholder="Dosya adında ara"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="ui-chips ui-chips--wrap" role="group" aria-label="Görsel filtresi">
          <button
            type="button"
            className="ui-chip"
            aria-pressed={!unused}
            onClick={() => {
              setUnused(false)
              setPage(1)
            }}
          >
            Tümü
          </button>
          <button
            type="button"
            className="ui-chip"
            aria-pressed={unused}
            onClick={() => {
              setUnused(true)
              setPage(1)
            }}
          >
            Kullanılmayanlar
          </button>
        </div>
      </div>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {state.status === 'loading' && <LoadingCard rows={3} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Görseller alınamadı.</ErrorAlert>}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="ui-card">
          <EmptyState title="Görsel yok">
            {q || unused ? 'Bu filtreyle eşleşen görsel yok.' : 'Yukarıdan görsel yükleyebilirsiniz.'}
          </EmptyState>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
          <p className="muted" aria-live="polite">
            {formatInt(state.data.total)} görsel
          </p>
          <ul className="ui-media-grid">
            {state.data.items.map((m) => (
              <li key={m.id} className="ui-media">
                <ProductImage src={m.thumbUrl} alt={m.filename} ratio="1" />
                <span className="ui-media__name">{m.filename}</span>
                <div className="ui-media__meta">
                  <span>{m.usedBy > 0 ? `${m.usedBy} üründe` : 'Kullanılmıyor'}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    aria-label={`${m.filename} görselini sil`}
                    disabled={busy}
                    onClick={() => setConfirm(m)}
                  />
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={state.data.page}
            pageSize={state.data.pageSize}
            total={state.data.total}
            onChange={setPage}
          />
        </>
      )}
      {confirm && (
        <Modal title="Görseli sil" onClose={() => setConfirm(null)} dismissable={!busy}>
          <p>"{confirm.filename}" kalıcı olarak silinecek. Devam edilsin mi?</p>
          <div className="ui-modal__actions">
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Vazgeç
            </Button>
            <Button variant="danger" onClick={() => remove(confirm)} disabled={busy}>
              {busy ? 'Siliniyor…' : 'Sil'}
            </Button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  )
}
