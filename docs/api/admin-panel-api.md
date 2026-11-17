# API Sözleşmesi: Yönetim Paneli Yenilemesi ve Sosyal Medya

Kararlar: K-77, K-78. Tüm `/api/admin/*` uçları AdminGuard; yazma uçları JSON; her yazma audit'e.
Hata gövdesi `{ statusCode, message, code?, fields? }`. Tutarlar metin.

## 1. Sosyal medya (K-77)
- `GET /api/site` yanıtına `social: { instagram, facebook, youtube, tiktok, linkedin }` (her biri tam `https://` URL veya null).
  Varsayılan: `instagram: "https://www.instagram.com/amisoszuccaciye/"`, diğerleri null.
- `PUT /api/admin/site` gövdesine aynı `social` nesnesi (kısmi olabilir). Doğrulama: null veya `https://` ile başlayan,
  ilgili alan adını içeren URL (instagram.com, facebook.com, youtube.com, tiktok.com, linkedin.com); aksi **400** `fields`.

## 2. Genel arama — `GET /api/admin/search?q=` (q 2–100 karakter)
`{ orders: [{ id, orderNo, dealerName, status, grandTotal, submittedAt }], dealers: [{ id, companyTitle, contactName,
city, status }], products: [{ id, name, barcode, code, thumbUrl, isActive }] }` — her türden en fazla 6, Türkçe harf
duyarsız. Sipariş: numara tam/önek eşleşmesi veya bayi adı; bayi: unvan, yetkili, e-posta, telefon; ürün: ad, barkod, kod.

## 3. Ana sayfa (dashboard) — `GET /api/admin/dashboard`
```json
{
  "sales30d": [{ "date": "2026-10-19", "orderCount": 3, "netTotal": "1234.50" }],   // son 30 gün, bugün dahil, boş günler 0
  "kpis": {
    "monthNet": { "current": "…", "previous": "…", "percent": 12.3 | null },        // bu ay vs geçen ayın aynı günlerine kadar
    "monthOrders": { "current": 30, "previous": 25, "percent": 20.0 | null },
    "averageOrderNet": { "current": "…", "previous": "…", "percent": … },
    "activeDealers": { "current": 9, "orderingThisMonth": 6 }
  },
  "pipeline": [{ "status": "submitted", "count": 7 }, …],                          // iptal ve teslim hariç 4 açık durum
  "attention": {
    "newOrders": 7, "pendingApplications": 0, "overdueApplications": 0, "notTransferred": 26,
    "failedNotifications": 0, "featuredOutOfStock": 1, "inactiveDealers60d": 2
  },
  "recentOrders": [{ "id", "orderNo", "dealer": { "id", "companyTitle" }, "status", "grandTotal", "submittedAt" }], // 8
  "topDealersMonth": [{ "dealerId", "companyTitle", "orderCount", "netTotal" }],    // 5, iptal hariç
  "recentActivity": [{ "id", "createdAt", "actorName", "actionLabel", "entityLabel", "entityType", "entityId" }] // 8, audit
}
```
Tarihler Europe/Istanbul günü; iptal edilen siparişler satış metriklerine dahil değil (rapor kurallarıyla aynı).

## 4. Bildirim merkezi — `GET /api/admin/notifications/feed`
Son 30 günün olayları (en yeni önce, en fazla 30): `{ items: [{ id, type: "order_submitted"|"application_verified"|
"notification_failed"|"order_status_changed", title, body, link, createdAt }], unread: number }`.
`POST /api/admin/notifications/feed/read` `{ until: ISO }` → **204**; okunmamış = `admin_users.notifications_read_at`
sonrası olaylar (Admin başına). `link` uygulama içi yol (`/yonetim/siparisler/<id>` vb.).

## 5. Sipariş iç notları (yalnız Admin)
- `GET /api/admin/orders/:id/notes` → `[{ id, body, createdAt, createdBy: { id, fullName } }]` (en yeni önce)
- `POST /api/admin/orders/:id/notes` `{ body (1–2000) }` → **201**; `DELETE /api/admin/orders/:id/notes/:noteId` → **204**.
- Tablo `order_notes`. Bayiye hiçbir yerde dönmez. Sipariş detayına `internalNoteCount` eklenir.

## 6. Ürün kopyalama — `POST /api/admin/products/:id/duplicate`
Yeni ürün: aynı grup, ad + " (kopya)", açıklama, koli içi, fiyat, KDV, görseller (aynı medya), `isActive: false`,
`isFeatured: false`, stok `out_of_stock`; **barkod ve kod boş olamayacağı için** gövdede zorunlu `{ barcode, code? }`
(tekillik **409** `DUPLICATE_BARCODE` / `DUPLICATE_CODE`). **201** ürün.

## 7. Excel dışa aktarma
- `GET /api/admin/products/export.xlsx?<ürün listesi filtreleri>`: Barkod, Kod, Ad, Grup, Koli içi, Liste fiyatı, KDV %,
  Stok, Durum, Öne çıkan, Görsel sayısı. Barkod/kod metin hücresi. İçe aktarma şablonuyla aynı ilk sütun sırası
  (Barkod, Kod, Ad, Grup, Koli içi, Liste fiyatı, KDV) — çıktı düzenlenip yeniden içe aktarılabilir.
- `GET /api/admin/dealers/export.xlsx?<bayi listesi filtreleri>`: Unvan, Yetkili, E-posta, Telefon, İl, İlçe, Adres,
  Vergi dairesi, Vergi no, Durum, Genel iskonto, Kayıt tarihi, Son giriş, Sipariş sayısı, Son sipariş.

## Uygulama notları

Sözleşmede belirsiz kalan noktalar için alınan kararlar (alan adları değişmedi). Backend: migration `0011_admin_panel`.

- **Sosyal medya:** `PUT /api/admin/site` `social` alanı isteğe bağlıdır; hiç verilmezse mevcut değerler korunur. Verilen
  anahtarlarda `null` veya boş metin alanı kaldırır, verilmeyen anahtar mevcut değerini korur. Alan adı eşleşmesi tam
  ad veya alt alan adıdır (`www.`, `m.` ...); `evilyoutube.com` ve `youtube.com.evil.example` reddedilir. Hata
  alanları `social.instagram` biçimindedir. Depolama: `site_settings` anahtarı `social`; kayıt yoksa varsayılan döner.
- **Arama:** `q` kırpılır, 2–100 karakter (aksi 400). Sipariş numarası önek eşleşir (`#` öneki yok sayılır) veya bayi
  unvanı/yetkilisi eşleşir; bayi telefonunda boşluk/işaretten bağımsız rakam eşleşmesi (en az 3 rakam). Sonuçlar:
  sipariş en yeni önce, bayi unvana göre, ürün (tam barkod eşleşmesi önce) ada göre. İptal edilmiş siparişler de aranır.
  `thumbUrl` ürünün ilk görselinin küçük sürümü, yoksa `null`.
- **Dashboard:**
  - `sales30d`: bugün dahil son 30 İstanbul günü, eskiden yeniye. `kpis.monthNet/monthOrders/averageOrderNet`:
    bu ay 1'inden bugüne, önceki dönem geçen ayın aynı gün numarasına kadar (ay kısaysa son güne kıstırılır).
    `percent`, önceki 0 ise `null`; aksi 1 ondalık, yarım yukarı. Ortalama sipariş = net toplam / sipariş sayısı (0 sipariş = `0.00`).
  - `activeDealers.current` = durumu `active` bayiler; `orderingThisMonth` = bu ay en az bir (iptal dışı) sipariş verenler.
  - `pipeline` sabit sırada `submitted, negotiating, approved, shipped`; tüm zamanlar, sayı yoksa 0.
  - `attention`: `newOrders` = durumu `submitted`; `notTransferred` = sipariş listesindeki "BizimHesap'a girilmemiş" tanımı;
    `featuredOutOfStock` = öne çıkan, aktif ve stokta olmayan ürün; `inactiveDealers60d` = rapor servisindeki "60 gündür
    sipariş vermeyen aktif bayi" sayısı; `overdueApplications` bayi servisindeki iş günü kuralı.
  - `recentOrders` tüm durumları (iptal dahil) gösterir; `topDealersMonth` ve tüm tutarlar iptal hariçtir.
  - `recentActivity`: işlem geçmişinin son 8 kaydı, girişler (`auth.login`, `auth.login_failed`) hariç. `actorName`:
    Admin adı, bayi unvanı; sistem eylemlerinde "Sistem". `entityLabel` çözülemezse `null`.
- **Bildirim akışı:** yeni tablo yok; olaylar mevcut tablolardan türetilir.
  - `order_submitted`: gönderilen her sipariş (`submittedAt`). `application_verified`: e-postasını doğrulayan, kaynağı
    başvuru olan bayi (`emailVerifiedAt`). `notification_failed`: durumu `failed` e-posta (`createdAt`).
    `order_status_changed`: ilk kayıt hariç durum geçmişi satırları; Adminin kendi yaptığı değişiklik o Admin için
    olay sayılmaz (başka Adminler, sistem ve BizimHesap değişiklikleri sayılır).
  - Öğe `id` değeri `<type>:<kaynak id>`'dir. Okunmamış sayısı 30 günlük pencerenin tamamı üzerinden hesaplanır
    (en fazla 30 öğe dönse de). `notifications_read_at` `null` ise pencerenin tüm olayları okunmamıştır.
  - `POST .../feed/read`: `until` ISO-8601 (saat dilimli); işaret geriye gitmez (`max`), gelecek tarih şu ana kıstırılır.
    `until` anındaki olay dahil okunmuş sayılır (milisaniye hassasiyetinde). Kişisel işaret olduğundan audit'e yazılmaz.
- **Sipariş iç notları:** bayi notlarıyla aynı kurallar (kırpılır, 1–2000, silmeyi herhangi bir Admin yapar). Eylemler
  audit'te `order.note_added` / `order.note_deleted`. `internalNoteCount` yalnızca Admin sipariş detayındadır;
  bayi uçları (liste, detay, Excel) notlara ve sayıya hiç dokunmaz. Sipariş silinirse notlar da silinir (cascade).
- **Ürün kopyalama:** ad 300 karakteri aşacaksa özgün ad kısaltılıp `" (kopya)"` eklenir. `code` verilmezse `null`.
  Stok kaynağı `manual`. Audit: `product.duplicated` (`sourceId`). Kaynak ürün bulunamazsa 404, barkod/kod çakışmasında hiçbir kayıt oluşmaz.
- **Excel:** Ürün Excel'inde sütun başlıkları sözleşmedeki gibidir; içe aktarma bu başlıkları takma ad olarak tanır
  (`Kod`, `Ad`, `Grup`, `Koli içi`, `Liste fiyatı`, `KDV %`) ve `Durum` sütunundaki `Aktif`/`Pasif` değerlerini okur;
  `Öne çıkan` ve `Görsel sayısı` içe aktarmada yok sayılır. Stok `Var`/`Yok`. Tutarlar sayı hücresi, barkod/kod/telefon/vergi no metin.
  Bayi Excel'inde `Sipariş sayısı` ve `Son sipariş` iptal edilen siparişleri saymaz; tarihler İstanbul saatiyle.
  Filtreler liste uçlarıyla aynıdır (`page`/`pageSize` yok sayılır); her iki dışa aktarma da en fazla 20.000 satır,
  aşılırsa 400 `EXPORT_TOO_LARGE`. Dosya adları `urunler-YYYY-AA-GG.xlsx`, `bayiler-YYYY-AA-GG.xlsx`.

