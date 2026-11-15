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

### `GET /api/admin/reports/orders?from&to&status=&sort=date|net|grand&dir=asc|desc&page&pageSize`
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

## Uygulama notları (sözleşmeden netleştirmeler)

- **Liste yanıtları:** `dealers`, `dealers/:id/products`, `products`, `groups`, `status`, `out-of-stock`, `inactive-dealers` düz dizi değil, `{ period, (previous, lastYear | dealer | days), items: [...] }` nesnesi döner; satırlar `items` içindedir. `trend` düz dizi, `overview`/`orders`/`today` nesnedir.

- `percent` sayıdır (1 ondalık, ör. `116.7`); `amount` para metriklerinde metin (`"210.00"`), sayı metriklerinde sayıdır.
- `from` yoksa ayın 1'i, `to` yoksa bugün; yalnızca `to` verilirse `from` o ayın 1'idir. `from > to` veya 3 yıldan uzun dönem **400** `VALIDATION` (Excel uçları dahil).
  Geçersiz takvim günü (`2026-02-30`) **400**.
- `orders`: iptal edilen siparişler de listelenir (durum alanıyla); `totals` her zaman iptal hariçtir ve `status` filtresine uyar.
- `dealers`: `lastOrderAt` bayinin dönem dışı dahil iptal edilmemiş SON siparişidir. `dealers/:id/products` bilinmeyen bayide **404**.
- `inactive-dealers`: son siparişi `days` günden **kesin olarak eski** (> days) olanlar; tam 60. gündeki bayi listede yoktur (59 hayır, 60 hayır, 61 evet). Yalnızca iptal edilmiş siparişi olan bayi "hiç sipariş vermemiş" sayılır.
- `status`: tüm 6 durum sabit sırayla döner (`label` Türkçe). Terminal durumlarda (`delivered`, `cancelled`) `averageHoursInStatus` her zaman `null`.
- `trend`: gelecek tarihli siparişler (bugünden sonra) dahil edilmez.
- `today`: `overdueApplications` K-04 iş günü kuralıyla (2 iş günü) hesaplanır.
- Excel: `overview`, `trend`, `orders`, `dealers`, `dealers/:id/products`, `inactive-dealers`, `products`, `groups`, `status`, `out-of-stock`
  uçlarının sonuna `/export.xlsx` eklenir (`today` hariç). Tarih hücreleri gerçek tarih (Europe/Istanbul, `dd.mm.yyyy hh:mm`); `orders` Excel'i dönemin tüm siparişlerini (sayfalamasız) ve iptal hariç toplam satırını içerir.
- Performans: `orders(submitted_at, status)` bileşik indeksi eklendi (migration `0008_report_indexes.sql`).

## Güncellemeler (kod incelemesi)

- `orders`: `sort=date|net|grand` (gönderim tarihi, KDV hariç, genel toplam) ve `dir=asc|desc`; varsayılan `date desc`. Eşitlikte sipariş numarası aynı yönde. Geçersiz değer **400**. Excel çıktısı aynı sıralamayı kullanır.
- `orders/export.xlsx`: sayfalamasız tek sorgu; dönemde `EXPORT_MAX_ORDERS` (varsayılan 5000) üzerinde sipariş varsa **400** `EXPORT_TOO_LARGE`. Alt toplam satırı: etiket "İptal hariç toplam (N sipariş)" Bayi sütununda, tutarlar KDV hariç / genel toplam sütunlarında, `#,##0.00`.
- Karşılaştırmalı Excel sütunları (genel bakış, bayiler, gruplar): dönem, önceki dönem, geçen yıl, **fark (önceki)**, değişim % (önceki), **fark (geçen yıl)**, değişim % (geçen yıl). Sayı metrikleri (sipariş/bayi sayısı) `#,##0`, tutarlar `#,##0.00`.
- Excel dosya adlarındaki tarih (`inactive-dealers`) CLOCK + Europe/Istanbul günüdür.
- `inactive-dealers`: Europe/Istanbul **takvim günü** ile: son sipariş günü < bugün − `days`; `daysSinceLastOrder` takvim günü farkıdır (60 gün + 1 saat önce = 60 → listede yok; 61 takvim günü = listede).
- `groups.sharePercent`: en büyük kalan yöntemiyle toplam tam 100,0; satışı olan grup en az 0,1 gösterilir (farkı en büyük paydan düşer).
- `groups` ve `products` raporları ürünün **bugünkü** grubuna göredir (sipariş anında grup kopyalanmaz; bilinçli kabul).
- `status.averageHoursInStatus`: önce sipariş başına o durumda geçen toplam süre, sonra siparişler arasında ortalama (bir sipariş aynı duruma tekrar girse de tek gözlem sayılır).
- İndeks: `orders (submitted_at) WHERE status <> 'cancelled'` kısmi indeks (migration `0009_report_partial_index.sql`); 0008'deki bileşik indeks kaldırıldı.
