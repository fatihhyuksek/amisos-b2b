// Tasarım sistemi önizlemesi: belirteçler, bileşenler ve ekran taslakları.
// Geliştirmede /tasarim adresinden açılır.
import { useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  OrderStatusBadge,
  Price,
  QuantityStepper,
  StockBadge,
} from '../ui/components'
import type { OrderStatus } from '../ui/orderStatus'
import { formatTRY } from '../ui/format'
import { Icon } from '../ui/Icon'
import { CartDraft } from './CartDraft'
import { CatalogDraft } from './CatalogDraft'
import { ShopDraft } from './ShopDraft'
import { BrandLogo } from '../shop/brand'
import './design.css'

type Theme = 'system' | 'light' | 'dark'
type Tab = 'system' | 'shop' | 'catalog' | 'cart'

const TABS: { id: Tab; label: string }[] = [
  { id: 'system', label: 'Tasarım sistemi' },
  { id: 'shop', label: 'Mağaza bileşenleri' },
  { id: 'catalog', label: 'Eski taslak: Katalog' },
  { id: 'cart', label: 'Taslak: Sepet' },
]

function readInitialTab(): Tab {
  const t = new URLSearchParams(location.search).get('sekme')
  return t === 'shop' || t === 'catalog' || t === 'cart' ? t : 'system'
}

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('theme') as Theme | null) ?? 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* depolama kapalı olabilir */
    }
  }, [theme])
  return [theme, setTheme]
}

const COLORS = [
  ['--color-bg', 'Arka plan'],
  ['--color-surface', 'Yüzey'],
  ['--color-surface-sunken', 'Gömük yüzey'],
  ['--color-border', 'Kenarlık'],
  ['--color-text', 'Metin'],
  ['--color-text-muted', 'İkincil metin'],
  ['--color-accent', 'Birincil (siyah)'],
  ['--color-accent-soft', 'Seçili zemin (krem-altın)'],
  ['--color-accent-strong', 'Seçili metin (koyu bronz)'],
  ['--color-gold', 'Altın (yalnız süs)'],
  ['--color-bronze', 'Bronz (bağlantı)'],
  ['--color-badge-bg', 'İskonto rozeti'],
  ['--color-strip-bg', 'Duyuru şeridi'],
  ['--color-success', 'Başarılı'],
  ['--color-warning', 'Uyarı'],
  ['--color-danger', 'Hata'],
  ['--color-info', 'Bilgi'],
  ['--color-focus', 'Odak'],
]

const STATUSES: OrderStatus[] = ['submitted', 'negotiating', 'approved', 'shipped', 'delivered', 'cancelled']

function SystemSection() {
  const [qty, setQty] = useState(24)
  return (
    <div className="preview-stack">
      <section className="preview-section">
        <h2>Renkler</h2>
        <p className="muted">
          Logodan: siyah, krem, altın. Altın yalnızca süs; metin ve bağlantı için koyu bronz. Kontrast
          ölçümleri docs/design/README.md içinde.
        </p>
        <ul className="swatches">
          {COLORS.map(([token, name]) => (
            <li key={token}>
              <span className="swatch" style={{ background: `var(${token})` }} />
              <span className="swatch__name">{name}</span>
              <code className="swatch__token">{token}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="preview-section">
        <h2>Yazı</h2>
        <p className="muted">
          Başlık: Playfair Display (serif, 22 px ve üzeri). Gövde: Plus Jakarta Sans. İkisi de OFL,
          @fontsource ile.
        </p>
        <div className="type-scale">
          <p style={{ fontSize: 'var(--font-size-3xl)', fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
            Vitrin başlığı · 36
          </p>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700 }}>Başlık 1 · 28</p>
          <p style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600 }}>Başlık 2 · 22</p>
          <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>Başlık 3 · 18</p>
          <p>Gövde metni · 16 — Bayiler ön siparişlerini buradan verir.</p>
          <p style={{ fontSize: 'var(--font-size-sm)' }} className="muted">
            Küçük metin · 14 — açıklamalar ve yardım metinleri
          </p>
          <p className="num" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
            {formatTRY('1234567.8')} — sayılar hizalı (tabular)
          </p>
        </div>
      </section>

      <section className="preview-section">
        <h2>Köşe ve gölge</h2>
        <div className="row row--top">
          {(
            [
              ['--radius-sm', 'sm · 8'],
              ['--radius-md', 'md · 12'],
              ['--radius-lg', 'lg · 16'],
              ['--radius-xl', 'xl · 24'],
            ] as const
          ).map(([t, l]) => (
            <div key={t} className="radius-sample" style={{ borderRadius: `var(${t})` }}>
              {l}
            </div>
          ))}
          {(['--shadow-sm', '--shadow-md', '--shadow-lg'] as const).map((t) => (
            <div
              key={t}
              className="radius-sample"
              style={{ boxShadow: `var(${t})`, borderColor: 'transparent' }}
            >
              {t.replace('--', '')}
            </div>
          ))}
        </div>
      </section>

      <section className="preview-section">
        <h2>Butonlar</h2>
        <div className="row">
          <Button icon="cart">Sepete ekle</Button>
          <Button variant="secondary">İkincil</Button>
          <Button variant="ghost">Sade</Button>
          <Button variant="danger">Reddet</Button>
          <Button disabled>Pasif</Button>
          <Button size="sm" variant="secondary">
            Küçük
          </Button>
        </div>
      </section>

      <section className="preview-section">
        <h2>Etiketler</h2>
        <div className="row">
          <StockBadge inStock />
          <StockBadge inStock={false} />
          {STATUSES.map((s) => (
            <OrderStatusBadge key={s} status={s} />
          ))}
          <Badge>Beklemede</Badge>
        </div>
      </section>

      <section className="preview-section">
        <h2>Fiyat ve miktar</h2>
        <div className="row row--top">
          <div className="ui-card ui-card__body">
            <p className="muted label-sm">Standart bayi</p>
            <Price value="389.00" />
          </div>
          <div className="ui-card ui-card__body">
            <p className="muted label-sm">Özel müşteri (iskontolu)</p>
            <Price value="41.57" listValue="48.90" discountPercent="15" />
          </div>
          <div className="ui-card ui-card__body">
            <p className="muted label-sm">Koli içi 12 — elle 30 yazmayı deneyin</p>
            <QuantityStepper label="Örnek ürün" value={qty} step={12} onChange={setQty} />
          </div>
        </div>
      </section>

      <section className="preview-section">
        <h2>Form</h2>
        <div className="form-grid">
          <Field label="Firma unvanı" htmlFor="f1" help="Vergi levhasındaki gibi yazın.">
            <input id="f1" className="ui-input" placeholder="Örnek Züccaciye Ltd. Şti." />
          </Field>
          <Field label="E-posta" htmlFor="f2" error="Geçerli bir e-posta adresi girin.">
            <input id="f2" className="ui-input" aria-invalid="true" defaultValue="ornek@" />
          </Field>
          <Field label="İl" htmlFor="f3">
            <select id="f3" className="ui-select" defaultValue="">
              <option value="" disabled>
                Seçin
              </option>
              <option>İstanbul</option>
              <option>Kayseri</option>
            </select>
          </Field>
          <div className="ui-search">
            <Icon name="search" />
            <input className="ui-input" type="search" placeholder="Ürün adı veya barkod" aria-label="Ara" />
          </div>
        </div>
      </section>

      <section className="preview-section">
        <h2>Uyarılar ve boş durum</h2>
        <div className="preview-stack preview-stack--tight">
          <Alert tone="info">Fiyatlar KDV hariçtir. Ödeme ve teslimat görüşmede netleşir.</Alert>
          <Alert tone="warning">Bu ürün stokta yok. Tedarik süresi görüşmede belirlenecek.</Alert>
          <Alert tone="danger">Ön sipariş gönderilemedi. Lütfen tekrar deneyin.</Alert>
          <div className="ui-card">
            <EmptyState title="Sepetiniz boş" action={<Button variant="secondary">Kataloğa git</Button>}>
              Ürün ekledikçe burada görünecek.
            </EmptyState>
          </div>
        </div>
      </section>

      <section className="preview-section">
        <h2>Tablo</h2>
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Sipariş</th>
                <th>Tarih</th>
                <th>Durum</th>
                <th className="num">Tutar (KDV hariç)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="num">#1042</td>
                <td className="num">12.11.2026</td>
                <td>
                  <OrderStatusBadge status="negotiating" />
                </td>
                <td className="num">{formatTRY('5562.24')}</td>
              </tr>
              <tr>
                <td className="num">#1031</td>
                <td className="num">03.11.2026</td>
                <td>
                  <OrderStatusBadge status="delivered" />
                </td>
                <td className="num">{formatTRY('12480.00')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function DesignPreview() {
  const [tab, setTab] = useState<Tab>(readInitialTab)
  const [theme, setTheme] = useTheme()

  return (
    <div className="preview">
      <header className="preview-header">
        <div>
          <h1>
            <BrandLogo size="lg" suffix="Tasarım" />
          </h1>
          <p className="muted">Kimlik: siyah · krem · altın · Playfair Display + Plus Jakarta Sans</p>
        </div>
        <div className="theme-switch" role="group" aria-label="Tema">
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button
              key={t}
              type="button"
              className="ui-chip"
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
            >
              {t === 'system' ? 'Sistem' : t === 'light' ? 'Açık' : 'Koyu'}
            </button>
          ))}
        </div>
      </header>

      <nav className="ui-chips preview-tabs" aria-label="Bölümler">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="ui-chip"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'system' && <SystemSection />}
        {tab === 'shop' && <ShopDraft />}
        {tab === 'catalog' && <CatalogDraft />}
        {tab === 'cart' && <CartDraft />}
      </main>
    </div>
  )
}
