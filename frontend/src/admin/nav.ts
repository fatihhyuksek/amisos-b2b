// K-78: Yönetim menüsü tek kaynak (kenar menü, komut paleti, kırıntı yolu).
import type { IconName } from '../ui/Icon'

export type NavBadge = 'orders' | 'applications' | 'notifications'

export interface NavItem {
  to: string
  label: string
  icon: IconName
  badge?: NavBadge
  /** Komut paletinde ek arama sözcükleri. */
  keywords?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Genel',
    items: [
      { to: '/yonetim', label: 'Ana sayfa', icon: 'home', keywords: 'özet panel dashboard' },
      { to: '/yonetim/siparisler', label: 'Siparişler', icon: 'orders', badge: 'orders' },
      { to: '/yonetim/raporlar', label: 'Raporlar', icon: 'chart', keywords: 'satış analiz' },
    ],
  },
  {
    label: 'Bayiler',
    items: [
      {
        to: '/yonetim/bayiler',
        label: 'Bayiler',
        icon: 'users',
        badge: 'applications',
        keywords: 'başvuru müşteri',
      },
    ],
  },
  {
    label: 'Analitik',
    items: [
      {
        to: '/yonetim/analitik',
        label: 'Trafik',
        icon: 'trendUp',
        keywords: 'ziyaretçi sayfa görüntüleme canlı dönüşüm huni analitik',
      },
      {
        to: '/yonetim/analitik/urunler',
        label: 'Ürün ilgisi',
        icon: 'eye',
        keywords: 'ürün görüntülenme sepete ekleme en çok bakılan',
      },
      {
        to: '/yonetim/analitik/aramalar',
        label: 'Aramalar',
        icon: 'search',
        keywords: 'arama sonuçsuz aranan',
      },
      {
        to: '/yonetim/analitik/bayiler',
        label: 'Bayi etkinliği',
        icon: 'users',
        keywords: 'bayi müşteri etkinlik ilgileniyor sipariş vermedi',
      },
    ],
  },
  {
    label: 'Katalog',
    items: [
      { to: '/yonetim/urunler', label: 'Ürünler', icon: 'boxes', keywords: 'stok barkod' },
      { to: '/yonetim/urun-gruplari', label: 'Ürün grupları', icon: 'grid', keywords: 'kategori iskonto' },
      { to: '/yonetim/gorseller', label: 'Görseller', icon: 'image', keywords: 'medya fotoğraf' },
      { to: '/yonetim/bannerlar', label: 'Kampanya görselleri', icon: 'megaphone', keywords: 'banner' },
    ],
  },
  {
    label: 'Görünüm',
    items: [
      {
        to: '/yonetim/gorunum/ana-sayfa',
        label: 'Ana sayfa düzeni',
        icon: 'panel',
        keywords: 'vitrin bölüm raf sıralama',
      },
      { to: '/yonetim/gorunum/menu', label: 'Menü', icon: 'list', keywords: 'üst menü gezinme vitrin' },
      {
        to: '/yonetim/gorunum/duyurular',
        label: 'Duyurular',
        icon: 'megaphone',
        keywords: 'üst şerit duyuru mesaj',
      },
    ],
  },
  {
    label: 'Site',
    items: [
      {
        to: '/yonetim/site-ayarlari',
        label: 'Site ayarları',
        icon: 'sliders',
        keywords: 'instagram sosyal medya iletişim duyuru',
      },
      {
        to: '/yonetim/bildirimler',
        label: 'Bildirimler',
        icon: 'bell',
        badge: 'notifications',
        keywords: 'e-posta etkinlik bildirim',
      },
      { to: '/yonetim/islem-gecmisi', label: 'İşlem geçmişi', icon: 'history', keywords: 'denetim kayıt' },
    ],
  },
]

export const ALL_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

/** Geçerli yola en uzun eşleşen menü öğesi (/yonetim/analitik, /yonetim/analitik/urunler yolunda Trafik'i seçmesin). */
function best(path: string): { group: string; item: NavItem } | null {
  let found: { group: string; item: NavItem } | null = null
  for (const g of NAV_GROUPS)
    for (const item of g.items) {
      const hit =
        item.to === '/yonetim' ? path === '/yonetim' : path === item.to || path.startsWith(`${item.to}/`)
      if (hit && (!found || item.to.length > found.item.to.length)) found = { group: g.label, item }
    }
  return found
}

export function navMatches(path: string, to: string): boolean {
  return best(path)?.item.to === to
}

/** Geçerli yola ait menü öğesi ve grubu (kırıntı yolu için). */
export function currentNav(path: string): { group: string; item: NavItem } | null {
  return best(path)
}

/** "Yeni" menüsü ve komut paletindeki oluşturma eylemleri. */
export const CREATE_ACTIONS: { label: string; to: string; icon: IconName }[] = [
  { label: 'Ürün', to: '/yonetim/urunler/yeni', icon: 'boxes' },
  { label: 'Bayi daveti', to: '/yonetim/bayiler/yeni', icon: 'users' },
  { label: 'Kampanya görseli', to: '/yonetim/bannerlar?yeni=1', icon: 'megaphone' },
]
