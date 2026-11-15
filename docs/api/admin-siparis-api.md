# API Sözleşmesi: Admin Sipariş Yönetimi

Gereksinimler: GR-SIP-006, GR-BLD-001, GR-YON-001, K-17, K-24, K-25, K-26.
Mevcut uçlar (`GET /api/admin/orders`, `GET /api/admin/orders/:id`) `docs/api/siparis-api.md` içinde;
burada genişletilir. Tüm uçlar AdminGuard; yazma uçları JSON. Hata gövdesi `{ statusCode, message, code?, fields? }`.

## Durumlar ve geçişler (K-25)

`submitted` Gönderildi → `negotiating` Görüşülüyor → `approved` Onaylandı → `shipped` Sevk edildi → `delivered` Teslim edildi.
`cancelled` İptal: `delivered` dışındaki her adımdan. Geri gitme ve adım atlama yok
(kural: `backend/src/orders/order-status.ts`).

## Liste — `GET /api/admin/orders`

Mevcut filtrelere ek: `q` (sipariş numarası tam eşleşme veya bayi firma unvanı/yetkili adı içinde arama,
Türkçe harf duyarsız), `transfer=pending|transferred` (BizimHesap'a girildi mi). Varsayılan sıra en yeni önce.
Öğe: `{ id, orderNo, submittedAt, status, dealer: { id, companyTitle }, lineCount, netTotal, grandTotal,
deliveryMethod, transferStatus, hasOutOfStock }`.

## Özet — `GET /api/admin/orders/summary`

`{ submitted, negotiating, approved, shipped, notTransferred }` — panel ana sayfa kartları için
(`notTransferred`: iptal edilmemiş ve `transferStatus` `transferred` olmayan siparişler).

## Detay — `GET /api/admin/orders/:id`

Mevcut alanlara ek:
- `allowedNextStatuses: OrderStatus[]`
- `history: [{ fromStatus, toStatus, source: system|admin|bizimhesap, changedBy: { id, fullName } | null, note, createdAt }]`
- `transfer: { status, reference: string | null, transferredAt: ISO | null, transferredBy: { id, fullName } | null }`
- `dealer` içinde ek: `city, district, address`.

## Durum değiştir — `POST /api/admin/orders/:id/status`

Gövde `{ status, note? }` (not en fazla 1000 karakter). İptal (`cancelled`) için not **zorunlu** (gerekçe).
- **200** güncel detay. Geçersiz geçiş **409** `{ code: "INVALID_TRANSITION" }`. Aynı anda iki değişiklik için satır kilidi.
- `order_status_history`'ye `source: admin`, `changedBy`, `note` yazılır; audit_log'a da.
- **Bayiye e-posta** (outbox, `order_status_changed`): sipariş no, yeni durum (Türkçe), not (varsa),
  sipariş detay bağlantısı `${APP_URL}/#/siparislerim/<id>` (K-26).
- Not bayiye görünür: bayi sipariş detayındaki durum geçmişinde ve e-postada gösterilir
  (arayüzde "Bayiye görünür not" olarak etiketlenir).

## BizimHesap'a elle giriş (K-17 yedek yolu)

- `POST /api/admin/orders/:id/transfer` `{ reference? }` → BizimHesap'a elle girildi olarak işaretle:
  `transferStatus = transferred`, `transferredAt`, `transferredBy`, `reference` (BizimHesap belge/sipariş no, en fazla 100). **200** detay.
- `DELETE /api/admin/orders/:id/transfer` → işareti geri al (`pending`). **200** detay.
- İkisi de audit_log'a.

## Excel dışa aktarma

- `GET /api/admin/orders/:id/export.xlsx` — tek sipariş: üstte sipariş no, tarih, bayi, teslimat; tablo:
  Barkod, Ürün kodu, Ürün adı, Adet, Koli içi, Liste fiyatı, İskonto %, Birim fiyat (KDV hariç), Net tutar,
  KDV %, KDV, Toplam, Stokta yoktu; altta toplamlar. Barkod ve kod hücreleri **metin** biçiminde.
- `GET /api/admin/orders/export.xlsx?<liste filtreleri>` — liste (en fazla 5000 sipariş): sipariş başına bir satır.
- Dosya adı: `siparis-<orderNo>.xlsx`, `siparisler-<YYYY-MM-DD>.xlsx` (tarih Europe/Istanbul).
- Liste dışa aktarma 5000'den fazla siparişe uyarsa **400** `{ code: "EXPORT_TOO_LARGE" }` (sessiz kesme yok; filtreleri daraltın).
- Liste sütunları: Sipariş no, Tarih, Bayi, Durum, Teslimat, Kalem, KDV hariç toplam, KDV, Genel toplam, BizimHesap (Girildi/Bekliyor), Stokta yok var. Para sütunları sayı, `#,##0.00` biçimli.

## Bayi tarafı etkisi

`GET /api/orders/:id` `history` öğelerine `note` eklenir (Admin notu); `changedBy` bayiye dönmez.

## Uygulama notları

- `q` yalnızca rakamlardan oluşuyorsa sipariş numarasıyla tam eşleşme **veya** firma/yetkili adında arama yapılır.
- `transfer=pending` iptal dahil `transferred` olmayan her siparişi (pending, manual, failed) kapsar.
- Detayda ayrıca eski alanlar korunur: `transferError`, `bizimhesapGuid` (entegrasyon için).
- Bayiye giden e-posta türü outbox'ta `order_status_changed`'dir; not Admin girdisidir ve e-posta günlüğünde tek satıra indirilir.
- Geçiş uçları satır kilidi (`for update`) kullanır; paralel iki istekten biri 409 `INVALID_TRANSITION` alır.
