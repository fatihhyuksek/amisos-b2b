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
    label: 'Katalog',
    items: [
      { to: '/yonetim/urunler', label: 'Ürünler', icon: 'boxes', keywords: 'stok barkod' },
      { to: '/yonetim/urun-gruplari', label: 'Ürün grupları', icon: 'grid', keywords: 'kategori iskonto' },
      { to: '/yonetim/gorseller', label: 'Görseller', icon: 'image', keywords: 'medya fotoğraf' },
      { to: '/yonetim/bannerlar', label: 'Kampanya görselleri', icon: 'megaphone', keywords: 'banner' },
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

export function navMatches(path: string, to: string): boolean {
  return to === '/yonetim' ? path === '/yonetim' : path === to || path.startsWith(`${to}/`)
}

/** Geçerli yola ait menü öğesi ve grubu (kırıntı yolu için). */
export function currentNav(path: string): { group: string; item: NavItem } | null {
  for (const g of NAV_GROUPS)
    for (const item of g.items) if (navMatches(path, item.to)) return { group: g.label, item }
  return null
}

/** "Yeni" menüsü ve komut paletindeki oluşturma eylemleri. */
export const CREATE_ACTIONS: { label: string; to: string; icon: IconName }[] = [
  { label: 'Ürün', to: '/yonetim/urunler/yeni', icon: 'boxes' },
  { label: 'Bayi daveti', to: '/yonetim/bayiler/yeni', icon: 'users' },
  { label: 'Kampanya görseli', to: '/yonetim/bannerlar?yeni=1', icon: 'megaphone' },
]
