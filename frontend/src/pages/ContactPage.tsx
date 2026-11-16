// K-64, K-66, K-73: İletişim sayfası. Bilgiler GET /api/site'tan; hata olursa contact.ts sabitleri.
import { Link } from '../Link'
import { phoneHref, whatsappLink } from '../shop/contact'
import { usePageTitle } from '../shop/pageTitle'
import { useSite } from '../shop/site'
import { Icon, type IconName } from '../ui/Icon'
import { ShopLayout } from './ShopLayout'

function Card({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <li className="ui-contactcard">
      <span className="ui-trust__icon">
        <Icon name={icon} />
      </span>
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    </li>
  )
}

export function ContactPage() {
  const { contact: c } = useSite()
  const wa = whatsappLink(c)
  usePageTitle('İletişim')
  const mapOk = c.mapUrl !== null && /^https:\/\//.test(c.mapUrl)
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
            <span aria-current="page">İletişim</span>
          </li>
        </ol>
      </nav>
      <header className="ui-pagetitle">
        <h1>İletişim</h1>
        <p className="muted">Sipariş, bayilik ve ürün soruları için bize ulaşın.</p>
      </header>
      <ul className="ui-contactgrid">
        <Card icon="phone" title="Telefon">
          <a href={phoneHref(c)} className="ui-contactcard__main">
            {c.phone}
          </a>
          <p className="muted">Arayın veya mesaj bırakın.</p>
        </Card>
        {wa && (
          <Card icon="whatsapp" title="WhatsApp">
            <a href={wa} className="ui-contactcard__main" target="_blank" rel="noopener noreferrer">
              WhatsApp ile yazın<span className="visually-hidden"> (yeni sekmede açılır)</span>
            </a>
            <p className="muted">Hızlı sorular ve sipariş takibi için.</p>
          </Card>
        )}
        <Card icon="mail" title="E-posta">
          <a href={`mailto:${c.email}`} className="ui-contactcard__main">
            {c.email}
          </a>
          <p className="muted">Resmî yazışmalar ve başvurular için.</p>
        </Card>
        <Card icon="pin" title="Adres">
          <p className="ui-contactcard__main">
            {c.address}
            {c.city ? `, ${c.city}` : ''}
          </p>
          {mapOk && (
            <a href={c.mapUrl as string} target="_blank" rel="noopener noreferrer">
              Haritada aç<span className="visually-hidden"> (yeni sekmede açılır)</span>
            </a>
          )}
        </Card>
        {c.workingHours && (
          <Card icon="clock" title="Çalışma saatleri">
            <p className="ui-contactcard__main">{c.workingHours}</p>
          </Card>
        )}
      </ul>
      <section className="ui-creamband ui-creamband--cta" aria-labelledby="contact-cta">
        <div className="ui-creamband__lead">
          <h2 id="contact-cta">Bayimiz olmak ister misiniz?</h2>
          <p>Başvurunuz onaylandığında bayiye özel iskontolu fiyatlarla ön sipariş verebilirsiniz.</p>
        </div>
        <div className="ui-creamband__actions">
          <Link to="/basvuru" className="ui-button ui-button--primary">
            Bayi ol
            <Icon name="arrowRight" />
          </Link>
          <Link to="/sss" className="ui-button ui-button--secondary">
            Sık sorulan sorular
          </Link>
        </div>
      </section>
    </ShopLayout>
  )
}
