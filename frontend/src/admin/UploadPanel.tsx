// K-62: Görsel kütüphanesine sürükle-bırak veya dosya seçerek çoklu yükleme.
import { useRef, useState, type DragEvent } from 'react'
import { ApiError, uploadMedia, type Media } from '../api'
import { Alert, Button } from '../ui/components'
import { Icon } from '../ui/Icon'
import {} from '../ui/catalog'
import { networkMessage } from '../ui/networkMessage'

const CHUNK = 10
const FILE_ERROR = 'Yüklenemedi. Dosya jpeg, png veya webp olmalı ve en fazla 8 MB olmalı.'

interface FileError {
  filename: string
  text: string
}

export function UploadPanel({ onUploaded }: { onUploaded: (items: Media[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [errors, setErrors] = useState<FileError[]>([])
  const [general, setGeneral] = useState<string | null>(null)
  const [okCount, setOkCount] = useState<number | null>(null)
  const busy = progress !== null

  async function start(list: FileList | File[]) {
    const files = Array.from(list)
    if (files.length === 0 || busy) return
    setErrors([])
    setGeneral(null)
    setOkCount(null)
    const errs: FileError[] = []
    let ok = 0
    setProgress({ done: 0, total: files.length })
    for (let i = 0; i < files.length; i += CHUNK) {
      const part = files.slice(i, i + CHUNK)
      try {
        const res = await uploadMedia(part)
        ok += res.items.length
        for (const e of res.errors) errs.push({ filename: e.filename, text: FILE_ERROR })
        if (res.items.length > 0) onUploaded(res.items)
      } catch (err) {
        const text =
          err instanceof ApiError && err.status === 413
            ? 'Dosya çok büyük.'
            : networkMessage(err, 'Yüklenemedi. Lütfen tekrar deneyin.')
        for (const f of part) errs.push({ filename: f.name, text })
      }
      setProgress({ done: Math.min(i + CHUNK, files.length), total: files.length })
    }
    setProgress(null)
    setErrors(errs)
    setOkCount(ok)
    if (ok === 0 && errs.length === 0) setGeneral('Yüklenecek dosya bulunamadı.')
    if (inputRef.current) inputRef.current.value = ''
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    void start(e.dataTransfer.files)
  }

  return (
    <div className="ui-stack">
      <div
        className="ui-dropzone"
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        aria-busy={busy}
      >
        <Icon name="plus" />
        <p>Görselleri buraya sürükleyin veya seçin (jpeg, png, webp · en fazla 8 MB)</p>
        <input
          ref={inputRef}
          type="file"
          className="visually-hidden"
          accept="image/jpeg,image/png,image/webp"
          multiple
          tabIndex={-1}
          aria-label="Görsel dosyaları"
          onChange={(e) => e.target.files && void start(e.target.files)}
        />
        <Button variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? `Yükleniyor… (${progress.done} / ${progress.total})` : 'Dosya seç'}
        </Button>
      </div>
      {progress && (
        <div role="status" className="muted">
          {progress.done} / {progress.total} dosya işlendi
        </div>
      )}
      {okCount !== null && okCount > 0 && <Alert tone="info">{okCount} görsel yüklendi.</Alert>}
      {general && <Alert tone="warning">{general}</Alert>}
      {errors.length > 0 && (
        <Alert tone="danger">
          <strong>{errors.length} dosya yüklenemedi:</strong>
          <ul className="ui-list-plain">
            {errors.map((e, i) => (
              <li key={`${e.filename}-${i}`}>
                {e.filename} — {e.text}
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  )
}
