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
