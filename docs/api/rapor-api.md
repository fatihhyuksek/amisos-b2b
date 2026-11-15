# API Sözleşmesi: Raporlar ve Özet Ana Sayfa

Gereksinimler: GR-RAP-001…003, K-46 – K-50. Tüm uçlar AdminGuard, salt okunur.

## Ortak kurallar

- **Dönem:** `from`, `to` = `YYYY-MM-DD`, ikisi de dahil, Europe/Istanbul günü. Varsayılan: içinde bulunulan ay
  (ayın 1'i → bugün). En fazla 3 yıl.
- **Karşılaştırma (K-49):** `previous` = seçilen dönemden hemen önceki eşit uzunlukta dönem; `lastYear` = geçen
  yılın aynı tarihleri (29 Şubat → 28 Şubat). Karşılaştırmalı her sayısal metrik:
  `{ current, previous, lastYear, changePrev: { amount, percent }, changeYear: { amount, percent } }`
  (`percent` önceki değer 0 ise `null`). Tutarlar metin (`"1234.50"`), sayılar sayı.
- **Hangi siparişler:** iptal edilenler (`cancelled`) satış metriklerine dahil edilmez; tarih = `submitted_at`.
  Tutarlar sipariş anı kopyalarından (order_lines), KDV hariç `net` esas, ayrıca `grandTotal`.
- **Excel:** her rapor ucunun sonuna `/export.xlsx` eklenmiş hali aynı parametrelerle Excel döner
  (dosya adı `rapor-<ad>-<from>-<to>.xlsx`; barkod metin hücresi; para `#,##0.00`; karşılaştırma sütunları dahil).

## Uçlar

### `GET /api/admin/reports/overview?from&to`
`{ period: { from, to }, previous: { from, to }, lastYear: { from, to }, metrics: { orderCount, netTotal, vatTotal,
grandTotal, orderingDealerCount, averageOrderNet } }` (her metrik karşılaştırmalı).

### `GET /api/admin/reports/trend?months=12`
Aylık seri, son `months` ay (en fazla 36), bu ay dahil:
`[{ month: "2026-11", orderCount, netTotal, lastYearNetTotal }]` (grafik için).

### `GET /api/admin/reports/orders?from&to&status=&page&pageSize`
Dönemdeki ön siparişler (GR-RAP-001): `{ items: [{ id, orderNo, submittedAt, dealer: { id, companyTitle }, status,
lineCount, netTotal, grandTotal }], total, page, pageSize, totals: { orderCount, netTotal, grandTotal } }`.
(İptal edilenler `status` filtresiyle görülebilir ama `totals`'a dahil değildir.)

### `GET /api/admin/reports/dealers?from&to`
Bayi bazında: `[{ dealerId, companyTitle, city, orderCount, netTotal (karşılaştırmalı), grandTotal, lastOrderAt }]`,
`netTotal.current` azalan. Dönemde siparişi olmayan bayiler listede yok.

### `GET /api/admin/reports/dealers/:id/products?from&to&limit=10`
Bayinin en çok aldığı ürünler: `[{ productId, barcode, name, groupName, quantity, netTotal }]` (adet azalan).

### `GET /api/admin/reports/inactive-dealers?days=60`
Aktif bayilerden son siparişi `days` günden eski olanlar veya hiç sipariş vermemiş olanlar (K-50; varsayılan 60):
`[{ dealerId, companyTitle, contactName, phone, city, lastOrderAt | null, daysSinceLastOrder | null, approvedAt }]`
(en uzun süredir sipariş vermeyen önce; hiç vermeyenler en üstte).

### `GET /api/admin/reports/products?from&to&sort=quantity|net&limit=50`
En çok sipariş edilen ürünler: `[{ productId, barcode, code, name, groupName, quantity, orderCount, dealerCount,
netTotal }]`.

### `GET /api/admin/reports/groups?from&to`
Ürün grubu bazında satış: `[{ groupId, name, quantity, netTotal (karşılaştırmalı), sharePercent }]`
(`sharePercent` = grubun net payı, 1 basamak). Grafik için de kullanılır.

### `GET /api/admin/reports/status?from&to`
Durum dağılımı ve bekleme (dönemde gönderilen siparişler, iptal dahil):
`[{ status, count, averageHoursInStatus | null }]` — `averageHoursInStatus`: siparişlerin o durumda kaldığı ortalama
süre (durum geçmişinden; hâlâ o durumdaysa şimdiye kadar), 1 basamak.

### `GET /api/admin/reports/out-of-stock?from&to`
Sipariş anında stokta yokken sipariş edilen ürünler (`outOfStockAtOrder`):
`[{ productId, barcode, name, groupName, quantity, orderCount, dealerCount, lastOrderedAt }]` (adet azalan).

### `GET /api/admin/reports/today`
Özet ana sayfa (K-48): `{ today: { orderCount, netTotal }, month: { orderCount, netTotal },
pendingApplications, overdueApplications, newOrders, failedNotifications }`.
