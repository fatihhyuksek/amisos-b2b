// Başvuru ve davet formlarında "Metni oku": KVKK ve kullanım koşulları sunucudaki yayımlı metinden okunur (K-73).
import { fetchSitePage, type SitePage } from '../api'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { Button, Modal } from '../ui/components'
import { RichText } from '../ui/RichText'

export function PageTextModal({
  slug,
  title,
  onClose,
}: {
  slug: string
  title: string
  onClose: () => void
}) {
  const { state, reload } = useLoad<SitePage>((s) => fetchSitePage(slug, s), slug)
  return (
    <Modal title={title} onClose={onClose} wide>
      {state.status === 'loading' && (
        <div className="ui-stack" aria-busy="true">
          <div className="ui-skeleton" style={{ height: '1.25rem', width: '70%' }} />
          <div className="ui-skeleton" style={{ height: '5rem' }} />
          <span className="visually-hidden" role="status">
            Yükleniyor…
          </span>
        </div>
      )}
      {state.status === 'error' && (
        <p>
          Metin şu an alınamadı.{' '}
          {!state.notFound && (
            <button type="button" className="ui-linklike" onClick={reload}>
              Tekrar dene
            </button>
          )}{' '}
          <Link to={`/${slug}`} target="_blank">
            Sayfayı ayrı sekmede aç
          </Link>
        </p>
      )}
      {state.status === 'ready' && (
        <div className="ui-modal__scroll">
          <RichText body={state.data.body} />
        </div>
      )}
      <div className="ui-modal__actions">
        <Button onClick={onClose}>Kapat</Button>
      </div>
    </Modal>
  )
}
