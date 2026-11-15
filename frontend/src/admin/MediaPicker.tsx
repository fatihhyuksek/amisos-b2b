// K-62: Ürüne görsel seçme diyaloğu. Kütüphaneden çoklu seçim ve doğrudan yükleme.
import { useState } from 'react'
import { fetchMedia, type Media, type Paged } from '../api'
import { Button, EmptyState, Modal, Pagination } from '../ui/components'
import { ErrorAlert, LoadingCard, ProductImage } from '../ui/catalog'
import { Icon } from '../ui/Icon'
import { useDebounced } from '../ui/useDebounced'
import { UploadPanel } from './UploadPanel'
import { useLoad } from './useLoad'

const PAGE_SIZE = 12

export function MediaPicker({
  excludeIds,
  single,
  onClose,
  onConfirm,
}: {
  /** Üründe zaten seçili görseller; tekrar seçilemez. */
  excludeIds: string[]
  /** Tek görsel seçimi (ör. banner): yeni seçim öncekinin yerine geçer. */
  single?: boolean
  onClose: () => void
  onConfirm: (items: Media[]) => void
}) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<Media[]>([])
  const { state, reload } = useLoad<Paged<Media>>(
    (signal) => fetchMedia({ q, page, pageSize: PAGE_SIZE }, signal),
    `${q}|${page}`,
  )

  function toggle(m: Media) {
    setPicked((cur) =>
      cur.some((x) => x.id === m.id) ? cur.filter((x) => x.id !== m.id) : single ? [m] : [...cur, m],
    )
  }

  return (
    <Modal title="Kütüphaneden görsel seç" onClose={onClose} wide>
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
      {state.status === 'loading' && <LoadingCard rows={2} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Görseller alınamadı.</ErrorAlert>}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <EmptyState title="Görsel yok">Aşağıdan yeni görsel yükleyebilirsiniz.</EmptyState>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
          <ul className="ui-media-grid">
            {state.data.items.map((m) => {
              const already = excludeIds.includes(m.id)
              const checked = already || picked.some((x) => x.id === m.id)
              return (
                <li key={m.id}>
                  <label className="ui-media ui-media--pick">
                    <ProductImage src={m.thumbUrl} alt={m.filename} ratio="1" />
                    <span className="ui-check">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={already}
                        onChange={() => toggle(m)}
                        aria-label={`${m.filename} seç`}
                      />
                      <span className="ui-media__name">{already ? 'Ürüne eklendi' : m.filename}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <Pagination
            page={state.data.page}
            pageSize={state.data.pageSize}
            total={state.data.total}
            onChange={setPage}
          />
        </>
      )}
      <details>
        <summary>Yeni görsel yükle</summary>
        <UploadPanel
          onUploaded={(items) => {
            setPicked((cur) =>
              single ? items.slice(0, 1) : [...cur, ...items.filter((m) => !cur.some((x) => x.id === m.id))],
            )
            setPage(1)
            reload()
          }}
        />
      </details>
      <div className="ui-modal__actions">
        <Button variant="secondary" onClick={onClose}>
          Vazgeç
        </Button>
        <Button disabled={picked.length === 0} onClick={() => onConfirm(picked)}>
          {single ? 'Bu görseli seç' : picked.length > 0 ? `${picked.length} görseli ekle` : 'Ekle'}
        </Button>
      </div>
    </Modal>
  )
}
