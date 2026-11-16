// K-67 – K-69, K-72: Hesabım (sekmeli): Özet, Firma ve iletişim, Adreslerim, Şifre ve güvenlik, İletişim tercihleri.
// Sekme adres satırında (?sekme=): geri tuşu ve bağlantı paylaşımı çalışır.
import { useState } from 'react'
import {
  changeAccountPassword,
  fetchAccount,
  revokeOtherSessions,
  setMarketingConsent,
  type Account,
} from '../api'
import { useLoad } from '../admin/useLoad'
import { useAuth } from '../auth/useAuth'
import { Link } from '../Link'
import { replace, useRoute } from '../router'
import { phoneHref, whatsappLink } from '../shop/contact'
import { usePageTitle } from '../shop/pageTitle'
import { PriceListButton } from '../shop/PriceListButton'
import { useSite } from '../shop/site'
import { Alert, Button, Checkbox } from '../ui/components'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { formatDate, formatDateTime, formatInt, formatPercent, formatTRY } from '../ui/format'
import { Icon } from '../ui/Icon'
import { networkMessage } from '../ui/networkMessage'
import { PasswordChangeForm } from '../ui/PasswordChangeForm'
import { AddressesTab } from './account/AddressesTab'
import { InfoTab } from './account/InfoTab'
import { ShopLayout } from './ShopLayout'

type Tab = 'ozet' | 'bilgiler' | 'adresler' | 'guvenlik' | 'tercihler'

const TABS: { id: Tab; label: string }[] = [
  { id: 'ozet', label: 'Özet' },
  { id: 'bilgiler', label: 'Firma ve iletişim' },
  { id: 'adresler', label: 'Adreslerim' },
  { id: 'guvenlik', label: 'Şifre ve güvenlik' },
  { id: 'tercihler', label: 'İletişim tercihleri' },
]

function SummaryTab({ account: a }: { account: Account }) {
  const site = useSite()
  const c = site.contact
  const wa = whatsappLink(c)
  return (
    <div className="ui-stack">
      <ul className="ui-stats ui-accstats" aria-label="Sipariş özeti">
        <li className="ui-card ui-stat">
          <span className="ui-stat__value num">{formatInt(a.stats.orderCount)}</span>
          <span className="ui-stat__label">Toplam sipariş</span>
        </li>
        <li className="ui-card ui-stat">
          <span className="ui-stat__value num">{formatInt(a.stats.openOrderCount)}</span>
          <span className="ui-stat__label">Açık sipariş</span>
        </li>
        <li className="ui-card ui-stat">
          <span className="ui-stat__value num">{formatTRY(a.stats.yearNetTotal)}</span>
          <span className="ui-stat__label">Bu yıl net toplam (KDV hariç)</span>
        </li>
        <li className="ui-card ui-stat">
          <span className="ui-stat__value">
            {a.stats.lastOrderAt ? formatDate(a.stats.lastOrderAt) : '—'}
          </span>
          <span className="ui-stat__label">Son sipariş tarihi</span>
        </li>
      </ul>
      <div className="ui-accgrid">
        <section className="ui-card ui-card__body ui-stack" aria-labelledby="sum-terms">
          <h2 id="sum-terms">Bayilik bilgileriniz</h2>
          <dl className="ui-dl">
            <div>
              <dt>İskonto oranınız</dt>
              <dd className="num">
                {a.generalDiscountPercent ? formatPercent(a.generalDiscountPercent) : 'Liste fiyatı'}
              </dd>
            </div>
            <div>
              <dt>Üyelik tarihi</dt>
              <dd>{formatDate(a.memberSince)}</dd>
            </div>
            <div>
              <dt>Son giriş</dt>
              <dd>{a.lastLoginAt ? formatDateTime(a.lastLoginAt) : '—'}</dd>
            </div>
          </dl>
          <div className="ui-actions">
            <Link to="/siparislerim" className="ui-button ui-button--secondary">
              <Icon name="orders" />
              Siparişlerim
            </Link>
            <PriceListButton />
          </div>
        </section>
        <section className="ui-card ui-card__body ui-stack" aria-labelledby="sum-contact">
          <h2 id="sum-contact">Size yardımcı olalım</h2>
          <p className="muted">Sipariş, fiyat veya hesabınızla ilgili sorularınız için ekibimize ulaşın.</p>
          <ul className="ui-contactlist">
            <li>
              <Icon name="phone" />
              <a href={phoneHref(c)}>{c.phone}</a>
            </li>
            {wa && (
              <li>
                <Icon name="whatsapp" />
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  WhatsApp ile yazın<span className="visually-hidden"> (yeni sekmede açılır)</span>
                </a>
              </li>
            )}
            <li>
              <Icon name="mail" />
              <a href={`mailto:${c.email}`}>{c.email}</a>
            </li>
            {c.workingHours && (
              <li>
                <Icon name="clock" />
                <span>{c.workingHours}</span>
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}

function SecurityTab({ account }: { account: Account }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  async function revoke() {
    setBusy(true)
    setNotice(null)
    try {
      await revokeOtherSessions()
      setNotice({ tone: 'info', text: 'Diğer cihazlardaki oturumlar kapatıldı.' })
    } catch (err) {
      setNotice({
        tone: 'danger',
        text: networkMessage(err, 'Oturumlar kapatılamadı. Lütfen tekrar deneyin.'),
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="ui-stack">
      <section className="ui-card ui-card__body ui-stack" aria-labelledby="sec-pw">
        <h2 id="sec-pw">Şifre değiştir</h2>
        <PasswordChangeForm
          idPrefix="acc-pw"
          onSubmit={changeAccountPassword}
          successText="Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı."
        />
      </section>
      <section className="ui-card ui-card__body ui-stack" aria-labelledby="sec-sessions">
        <h2 id="sec-sessions">Oturumlar</h2>
        <p className="muted">
          Son girişiniz: {account.lastLoginAt ? formatDateTime(account.lastLoginAt) : '—'}. Başka bir cihazda
          oturumunuzu açık unuttuysanız oradaki oturumları kapatabilirsiniz; bu cihazdaki oturumunuz açık
          kalır.
        </p>
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <div>
          <Button variant="secondary" icon="logout" disabled={busy} onClick={() => void revoke()}>
            {busy ? 'Kapatılıyor…' : 'Diğer cihazlardan çıkış yap'}
          </Button>
        </div>
      </section>
    </div>
  )
}

function PrefsTab({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [granted, setGranted] = useState(account.marketingConsent)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  async function save() {
    setBusy(true)
    setNotice(null)
    try {
      await setMarketingConsent(granted)
      setNotice({ tone: 'info', text: 'Tercihiniz kaydedildi.' })
      onSaved()
    } catch (err) {
      setNotice({ tone: 'danger', text: networkMessage(err, 'Tercih kaydedilemedi. Lütfen tekrar deneyin.') })
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="ui-card ui-card__body ui-stack" aria-labelledby="pref-title">
      <h2 id="pref-title">İletişim tercihleri</h2>
      <p className="muted">
        Sipariş ve hesap bilgilendirmeleri (sipariş onayı, durum değişikliği, şifre) hizmetin parçasıdır ve
        her zaman gönderilir. Aşağıdaki tercih yalnızca kampanya ve duyuru e-postalarını kapsar; istediğiniz
        zaman değiştirebilirsiniz.
      </p>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <Checkbox id="pref-marketing" checked={granted} onChange={setGranted}>
        Kampanya ve duyuru e-postaları almak istiyorum.
      </Checkbox>
      <div>
        <Button disabled={busy || granted === account.marketingConsent} onClick={() => void save()}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>
    </section>
  )
}

export function AccountPage() {
  const { logout } = useAuth()
  const { query } = useRoute()
  const raw = query.get('sekme')
  const tab: Tab = TABS.some((t) => t.id === raw) ? (raw as Tab) : 'ozet'
  const { state, reload } = useLoad<Account>((s) => fetchAccount(s), 'account')
  const account = state.status === 'ready' ? state.data : null
  usePageTitle('Hesabım')

  return (
    <ShopLayout>
      <header className="ui-pagetitle">
        <h1>Hesabım</h1>
        {account && <p className="muted">{account.companyTitle}</p>}
      </header>
      <nav className="ui-tabs" aria-label="Hesap bölümleri">
        <ul>
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="ui-tabs__tab"
                aria-current={t.id === tab ? 'page' : undefined}
                onClick={() => replace(t.id === 'ozet' ? '/hesabim' : `/hesabim?sekme=${t.id}`)}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Hesap bilgileri alınamadı.</ErrorAlert>}
      {account && (
        <div className="ui-tabpanel">
          {tab === 'ozet' && <SummaryTab account={account} />}
          {tab === 'bilgiler' && <InfoTab account={account} onSaved={reload} />}
          {tab === 'adresler' && <AddressesTab account={account} />}
          {tab === 'guvenlik' && <SecurityTab account={account} />}
          {tab === 'tercihler' && <PrefsTab account={account} onSaved={reload} />}
        </div>
      )}
      <div>
        <Button
          variant="secondary"
          icon="logout"
          onClick={async () => {
            await logout()
            replace('/')
          }}
        >
          Çıkış yap
        </Button>
      </div>
    </ShopLayout>
  )
}
