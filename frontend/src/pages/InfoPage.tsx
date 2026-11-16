// K-66, K-73: Bilgi sayfaları (Hakkımızda, SSS, Teslimat, KVKK, Kullanım koşulları). Herkese açık.
// Gövde düz metindir (docs/api/vitrin-hesap-api.md §2) ve ui/RichText ile güvenli çizilir.
import { fetchSitePage, type SitePage } from '../api'
import { useLoad } from '../admin/useLoad'
import { Link } from '../Link'
import { usePageTitle } from '../shop/pageTitle'
import { useSite } from '../shop/site'
import { whatsappLink } from '../shop/contact'
import { EmptyState } from '../ui/components'
import { ErrorAlert } from '../ui/catalog'
import { formatDate } from '../ui/format'
import { Icon } from '../ui/Icon'
import { Faq } from '../ui/Faq'
import { RichText } from '../ui/RichText'
import { ShopLayout } from './ShopLayout'

export function InfoPage({ slug }: { slug: string }) {
  const site = useSite()
  const wa = whatsappLink(site.contact)
  const { state, reload } = useLoad<SitePage>((s) => fetchSitePage(slug, s), slug)
  const page = state.status === 'ready' ? state.data : null
  const fallbackTitle = site.pages.find((p) => p.slug === slug)?.title
  usePageTitle(page?.title ?? fallbackTitle)
  const nav = [...site.pages, { slug: 'iletisim', title: 'İletişim' }]

  return (
    <ShopLayout>
      <nav className="ui-crumbs" aria-label="Konum">
        <ol>
          <li>
            <Link to="/" className="ui-crumbs__home">
              <Icon name="home" />
              Ana sayfa
            </Link>
          </li>
          <li>
            <span aria-current="page">{page?.title ?? fallbackTitle ?? 'Bilgi'}</span>
          </li>
        </ol>
      </nav>
      <div className="ui-infopage">
        <nav className="ui-infonav" aria-label="Kurumsal sayfalar">
          <ul>
            {nav.map((p) => (
              <li key={p.slug}>
                <Link to={`/${p.slug}`} aria-current={p.slug === slug ? 'page' : undefined}>
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="ui-infopage__body" aria-labelledby="info-title">
          {state.status === 'loading' && (
            <div className="ui-stack" aria-busy="true">
              <div className="ui-skeleton" style={{ height: '2.5rem', width: '55%' }} />
              <div className="ui-skeleton" style={{ height: '1rem' }} />
              <div className="ui-skeleton" style={{ height: '1rem', width: '90%' }} />
              <div className="ui-skeleton" style={{ height: '1rem', width: '75%' }} />
              <span className="visually-hidden" role="status">
                Yükleniyor…
              </span>
            </div>
          )}
          {state.status === 'error' &&
            (state.notFound ? (
              <div className="ui-card">
                <EmptyState
                  title="Sayfa bulunamadı"
                  action={
                    <Link to="/" className="ui-button ui-button--secondary">
                      Ana sayfaya dön
                    </Link>
                  }
                >
                  Bu sayfa yayında değil veya kaldırılmış olabilir.
                </EmptyState>
              </div>
            ) : (
              <ErrorAlert onRetry={reload}>Sayfa alınamadı.</ErrorAlert>
            ))}
          {page && (
            <>
              <header className="ui-infopage__head">
                <h1 id="info-title">{page.title}</h1>
                <p className="muted">Son güncelleme: {formatDate(page.updatedAt)}</p>
              </header>
              {slug === 'sss' ? <Faq body={page.body} /> : <RichText body={page.body} />}
              <aside className="ui-helpcard" aria-label="Yardım">
                <div>
                  <strong>Aradığınızı bulamadınız mı?</strong>
                  <span className="muted">Ekibimiz telefon ve WhatsApp ile yardımcı olur.</span>
                </div>
                <div className="ui-helpcard__actions">
                  <Link to="/iletisim" className="ui-button ui-button--secondary">
                    İletişim
                  </Link>
                  {wa && (
                    <a
                      href={wa}
                      className="ui-button ui-button--primary"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Icon name="whatsapp" />
                      WhatsApp
                      <span className="visually-hidden"> (yeni sekmede açılır)</span>
                    </a>
                  )}
                </div>
              </aside>
            </>
          )}
        </article>
      </div>
    </ShopLayout>
  )
}
