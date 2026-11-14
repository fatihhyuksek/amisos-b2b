// K-59, K-60: Excel'den toplu ürün yükleme. Şablon indir, kontrol et (dryRun), içe aktar.
import { useRef, useState, type DragEvent } from 'react'
import { ApiError, fetchImportTemplate, importProducts, type ImportReport } from '../api'
import { Link } from '../Link'
import { Alert, Button } from '../ui/components'
import { networkMessage } from '../ui/networkMessage'
import { formatInt } from '../ui/format'
import { AdminLayout } from './AdminLayout'

const MAX_BYTES = 5 * 1024 * 1024

function ReportView({ report, done }: { report: ImportReport; done: boolean }) {
  const hasErrors = report.errors.length > 0
  return (
    <div className="ui-stack" aria-live="polite">
      {hasErrors ? (
        <Alert tone="danger">
          {formatInt(report.errors.length)} hata bulundu.{' '}
          {done ? 'Hata olduğu için hiçbir satır kaydedilmedi.' : 'Düzeltip dosyayı yeniden kontrol edin.'}
        </Alert>
      ) : (
        <Alert tone="info">
          {done ? 'İçe aktarma tamamlandı.' : 'Dosyada hata yok. İçe aktarabilirsiniz.'}
        </Alert>
      )}
      {done && hasErrors && (
        <Alert tone="warning">Kontrolden sonra veriler değişmiş olabilir. Dosyayı tekrar kontrol edin.</Alert>
      )}
      <dl className="ui-summary-list">
        <div>
          <dt>Toplam satır</dt>
          <dd>{formatInt(report.total)}</dd>
        </div>
        <div>
          <dt>{done ? 'Eklenen' : 'Eklenecek'}</dt>
          <dd>{formatInt(report.created)}</dd>
        </div>
        <div>
          <dt>{done ? 'Güncellenen' : 'Güncellenecek'}</dt>
          <dd>{formatInt(report.updated)}</dd>
        </div>
        <div>
          <dt>{done ? 'Değişmeyen' : 'Değişmeyecek'}</dt>
          <dd>{formatInt(report.unchanged)}</dd>
        </div>
      </dl>
      {report.groupsCreated.length > 0 && (
        <p>
          {done ? 'Oluşturulan' : 'Oluşturulacak'} ürün grupları:{' '}
          <strong>{report.groupsCreated.join(', ')}</strong>
        </p>
      )}
      {report.warnings.length > 0 && (
        <Alert tone="warning">
          <strong>{formatInt(report.warnings.length)} uyarı:</strong>
          <ul className="ui-list-plain">
            {report.warnings.map((w, i) => (
              <li key={`${w.row}-${i}`}>
                Satır {w.row} — {w.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {hasErrors && (
        <div className="ui-table-wrap">
          <table className="ui-table">
            <caption className="visually-hidden">Hata raporu</caption>
            <thead>
              <tr>
                <th scope="col" className="num">
                  Satır
                </th>
                <th scope="col">Sütun</th>
                <th scope="col">Hata</th>
              </tr>
            </thead>
            <tbody>
              {report.errors.map((e, i) => (
                <tr key={`${e.row}-${e.column}-${i}`}>
                  <td className="num">{e.row}</td>
                  <td>{e.column}</td>
                  <td className="wrap">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ProductImportPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'template' | 'check' | 'import' | null>(null)
  const [report, setReport] = useState<{ data: ImportReport; done: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  function pick(f: File | null) {
    setReport(null)
    setError(null)
    setFileError(null)
    if (f && !f.name.toLowerCase().endsWith('.xlsx')) {
      setFile(null)
      setFileError('Yalnızca .xlsx dosyası seçin.')
      return
    }
    if (f && f.size > MAX_BYTES) {
      setFile(null)
      setFileError('Dosya en fazla 5 MB olabilir.')
      return
    }
    setFile(f)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    pick(e.dataTransfer.files[0] ?? null)
  }

  async function downloadTemplate() {
    setBusy('template')
    setError(null)
    try {
      const blob = await fetchImportTemplate()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'urun-sablonu.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(networkMessage(err, 'Şablon indirilemedi.'))
    } finally {
      setBusy(null)
    }
  }

  async function run(dryRun: boolean) {
    if (!file) return
    setBusy(dryRun ? 'check' : 'import')
    setError(null)
    try {
      setReport({ data: await importProducts(file, dryRun), done: !dryRun })
    } catch (err) {
      setReport(null)
      if (err instanceof ApiError && err.status === 413)
        setError('Dosya çok büyük (en fazla 5 MB, 5000 satır).')
      else if (err instanceof ApiError && err.status === 400)
        setError('Dosya okunamadı. Şablondaki biçimde bir .xlsx dosyası yükleyin.')
      else setError(networkMessage(err, 'İşlem tamamlanamadı. Lütfen daha sonra tekrar deneyin.'))
    } finally {
      setBusy(null)
    }
  }

  const canImport = report && !report.done && report.data.errors.length === 0 && report.data.total > 0

  return (
    <AdminLayout
      title="Excel'den ürün yükle"
      actions={
        <Link to="/yonetim/urunler" className="ui-button ui-button--secondary">
          Ürün listesine dön
        </Link>
      }
    >
      <ol className="ui-steps">
        <li className="ui-card ui-card__body">
          <h2>Şablonu indirin</h2>
          <p className="muted">
            Barkod, ürün adı, ürün grubu, koli içi adet ve liste fiyatı (KDV hariç) zorunludur. Barkodu
            kayıtlı olan ürün güncellenir, olmayan eklenir. Hata varsa hiçbir satır kaydedilmez.
          </p>
          <div>
            <Button variant="secondary" disabled={busy !== null} onClick={downloadTemplate}>
              {busy === 'template' ? 'İndiriliyor…' : 'Şablonu indir (.xlsx)'}
            </Button>
          </div>
        </li>
        <li className="ui-card ui-card__body">
          <h2>Dosyayı seçin</h2>
          <div
            className="ui-dropzone"
            data-over={over}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <p>{file ? file.name : 'Dosya seçilmedi'}</p>
            <input
              ref={inputRef}
              type="file"
              className="visually-hidden"
              tabIndex={-1}
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Excel dosyası"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <Button variant="secondary" onClick={() => inputRef.current?.click()}>
              Dosya seç
            </Button>
            <span className="ui-help">veya .xlsx dosyasını buraya sürükleyin</span>
          </div>
          {fileError && <span className="ui-error">{fileError}</span>}
          {file && <p className="muted">{Math.max(1, Math.round(file.size / 1024))} KB</p>}
        </li>
        <li className="ui-card ui-card__body">
          <h2>Kontrol edin</h2>
          <p className="muted">Bu adımda hiçbir şey kaydedilmez; yalnızca rapor çıkarılır.</p>
          <div>
            <Button disabled={!file || busy !== null} onClick={() => run(true)}>
              {busy === 'check' ? 'Kontrol ediliyor…' : 'Kontrol et'}
            </Button>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          {report && <ReportView report={report.data} done={report.done} />}
        </li>
        <li className="ui-card ui-card__body">
          <h2>İçe aktarın</h2>
          <p className="muted">Yalnızca hatasız kontrolden sonra açılır.</p>
          <div>
            <Button disabled={!canImport || busy !== null} onClick={() => run(false)}>
              {busy === 'import' ? 'İçe aktarılıyor…' : 'İçe aktar'}
            </Button>
          </div>
        </li>
      </ol>
    </AdminLayout>
  )
}
