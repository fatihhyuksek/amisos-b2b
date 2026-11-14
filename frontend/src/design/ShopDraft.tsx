// Önizleme: mağaza vitrin bileşenleri (ürün kartı, kategori kutucuğu, kampanya alanı, rozetler).
// Örnek veriyle çalışır; gerçek ekranlar src/pages/ altında.
import type { CatalogProduct } from '../api'
import { AnnouncementCard, PromoCarousel } from '../shop/PromoCarousel'
import type { Banner } from '../shop/useBanners'
import { ProductCard } from '../ui/catalog'
import { Icon } from '../ui/Icon'
import { products } from './mockData'

function art(fill: string, label: string, w = 1200, h = 400): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${fill}"/><circle cx="${w * 0.78}" cy="${h / 2}" r="${h * 0.32}" fill="#fff" opacity=".7"/><text x="${w * 0.07}" y="${h * 0.55}" font-family="sans-serif" font-size="${h * 0.14}" font-weight="700" fill="#2b2a28">${label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const SAMPLE_BANNERS: Banner[] = [
  { id: 'b1', imageUrl: art('#f2e4da', 'Örnek banner 1'), alt: 'Örnek banner 1', href: '/katalog' },
  { id: 'b2', imageUrl: art('#e3ebe6', 'Örnek banner 2'), alt: 'Örnek banner 2' },
]

const toCatalog = (i: number): CatalogProduct => {
  const m = products[i]
  return {
    id: m.id,
    name: m.name,
    barcode: m.barcode,
    code: null,
    description: null,
    groupId: m.group,
    groupName: m.group,
    caseQuantity: m.caseQuantity,
    stock: m.inStock ? 'in_stock' : 'out_of_stock',
    listPrice: m.listPrice,
    price: m.price,
    discountPercent: m.discountPercent ? `${m.discountPercent}.00` : null,
    vatRate: '20.00',
    images: [],
  }
}

export function ShopDraft() {
  return (
    <div className="preview-stack">
      <section className="preview-section">
        <h2>Kampanya alanı: banner yokken</h2>
        <p className="muted">useBanners() boş döndüğünde sade duyuru kartı gösterilir.</p>
        <AnnouncementCard />
      </section>

      <section className="preview-section">
        <h2>Kampanya alanı: banner carousel (K-65)</h2>
        <p className="muted">
          Otomatik geçiş yok. Oklar, noktalar, ← / → tuşları ve dokunmatik kaydırma. Masaüstü 3:1, telefonda
          4:3.
        </p>
        <PromoCarousel banners={SAMPLE_BANNERS} />
      </section>

      <section className="preview-section">
        <h2>Ürün kartı</h2>
        <p className="muted">
          Rozetler: Stokta yok (uyarı tonu), iskonto (vurgu tonu). Kartın tamamı detaya gider; sağ alttaki
          buton sepet bağlanınca doğrudan ekler.
        </p>
        <ul className="ui-pgrid ui-pgrid--home">
          {[0, 1, 2, 3, 4].map((i) => (
            <ProductCard key={i} product={toCatalog(i)} />
          ))}
        </ul>
      </section>

      <section className="preview-section">
        <h2>Kategori kutucukları ve rozetler</h2>
        <ul className="ui-cattiles">
          {['Bardak', 'Tabak', 'Tencere', 'Saklama'].map((g) => (
            <li key={g}>
              <span className="ui-cattile">
                <span className="ui-cattile__img">
                  <Icon name="boxes" />
                </span>
                <span className="ui-cattile__name">{g}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="row">
          <span className="ui-pill ui-pill--warning">Stokta yok</span>
          <span className="ui-pill ui-pill--accent">%15 iskonto</span>
          <span className="ui-countbadge ui-countbadge--inline">3</span>
          <span className="ui-countbadge ui-countbadge--inline" data-empty="true">
            0
          </span>
        </div>
      </section>
    </div>
  )
}
