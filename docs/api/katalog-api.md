# API Sözleşmesi: Ürün Kataloğu, Görsel Kütüphanesi, İskonto ve Fiyat

Gereksinimler: GR-URN-001…003, GR-FIY-001…003, K-10 – K-16, K-18, K-30 – K-32, K-40, K-59 – K-62.
Tüm uçlar `/api` önekli; JSON (dosya yükleme uçları hariç: `multipart/form-data`).
Hata gövdesi: `{ statusCode, message, code?, fields? }`. Frontend `message`'ı göstermez.
Tutarlar metin (`"19.99"`), KDV hariç, 2 basamak. Yüzdeler metin (`"15.00"`).

## Fiyat kuralı (GR-FIY-001, GR-FIY-002)

Bayiye gösterilen birim fiyat = `liste fiyatı × (1 − iskonto / 100)`, 2 basamağa standart yuvarlanır (K-39).
İskonto = bayinin **genel oranı** ile ürünün **grubuna** tanımlı orandan **yüksek olanı** (K-13);
ikisi de yoksa iskonto yok (standart liste fiyatı, K-10). Hesap yalnızca backend'de, `money.ts` ile.
Giriş yapmamış kullanıcıya hiçbir uçtan fiyat dönmez (401).

## Görsel kütüphanesi (Admin, K-61, K-62)

Dosyalar sunucu diskinde `MEDIA_DIR` (varsayılan `storage/media`, backend çalışma dizinine göre; git'e girmez).
Yüklemede iki boyut üretilir (webp): küçük `thumb` (400 px) ve büyük `large` (1200 px, uzun kenar).
Kabul: jpeg, png, webp (tür dosya içeriğinden saptanır, uzantıya bakılmaz); dosya başına en fazla 8 MB;
istek başına en fazla **20** dosya, görsel başına en fazla 40 megapiksel (aşan görsel `errors`'a düşer).
Dosya sayısı aşılırsa **413** `{ code: "TOO_MANY_FILES" }`, 8 MB aşılırsa **413** `{ code: "FILE_TOO_LARGE" }` (tüm istek reddedilir).
Dosya başına izolasyon: diske/veritabanına yazılamayan dosya `errors`'a düşer, diğerleri kaydedilir.
Multipart uçlar (yükleme, Excel) çapraz kaynak isteğini reddeder: `Sec-Fetch-Site` varsa `same-origin`/`none`, `Origin` varsa APP_URL/CORS_ORIGIN olmalı; aksi **403** (başlık yoksa serbest).
EXIF yönlendirmesi uygulanır, tüm metadata atılır.

`Media`:
```json
{ "id": "uuid", "filename": "8690000000017.jpg", "url": "/api/media/<id>/large.webp",
  "thumbUrl": "/api/media/<id>/thumb.webp", "width": 1200, "height": 900, "size": 123456,
  "usedBy": 2, "createdAt": "ISO" }
```

- `POST /api/admin/media` (multipart, alan adı `files`) → **201** `{ items: Media[], errors: [{ filename, message }] }`
  (geçersiz dosyalar diğerlerini engellemez).
- `GET /api/admin/media?q=&unused=true&page=1&pageSize=40` → `{ items, total, page, pageSize }`; `q` dosya adında arar.
- `DELETE /api/admin/media/:id` → **204**; bir ürüne bağlıysa **409** `{ code: "MEDIA_IN_USE" }`.
- `GET /api/media/:id/thumb.webp`, `GET /api/media/:id/large.webp` — herkese açık (görseller gizli değil),
  uzun süreli önbellek başlığı.

## Ürün grupları (Admin)

`ProductGroup`: `{ id, name, sortOrder, isActive, productCount }`
- `GET /api/admin/product-groups` → `ProductGroup[]` (sortOrder, ad sırasıyla)
- `POST /api/admin/product-groups` `{ name, sortOrder? }` → **201**; aynı ad (Türkçe büyük/küçük harf duyarsız) **409** `DUPLICATE_GROUP`
- `PATCH /api/admin/product-groups/:id` `{ name?, sortOrder?, isActive? }` → **200** `ProductGroup`
- `DELETE /api/admin/product-groups/:id` → **204**; ürünü varsa **409** `GROUP_NOT_EMPTY`

## Ürünler (Admin)

`AdminProduct`:
```json
{
  "id": "uuid", "groupId": "uuid", "groupName": "Bardak",
  "barcode": "8690000000017", "code": "ZC-1" | null, "name": "Çay Bardağı 6'lı",
  "description": "..." | null, "caseQuantity": 12, "listPrice": "48.90", "vatRate": "20.00",
  "stockStatus": "in_stock | out_of_stock", "isActive": true,
  "images": [{ "mediaId": "uuid", "url": "...", "thumbUrl": "...", "sortOrder": 0 }],
  "createdAt": "ISO", "updatedAt": "ISO"
}
```
- `GET /api/admin/products?q=&groupId=&stock=in_stock|out_of_stock&active=true|false&page=1&pageSize=20`
  → `{ items, total, page, pageSize }`; `q` ad, barkod veya kodda arar; tam barkod eşleşmesi en üstte.
- `GET /api/admin/products/:id`
- `POST /api/admin/products` → **201** `AdminProduct`. Alanlar: `groupId`*, `barcode`*, `code`, `name`*,
  `description`, `caseQuantity`* (≥1), `listPrice`* (≥0), `vatRate` (varsayılan "20", 0–99.99),
  `stockStatus` (varsayılan `in_stock`), `isActive` (varsayılan true), `mediaIds` (sıralı, isteğe bağlı).
- `PATCH /api/admin/products/:id` — aynı alanlar, kısmi. `mediaIds` verilirse görseller bu sırayla değiştirilir.
- Hatalar: **409** `DUPLICATE_BARCODE` / `DUPLICATE_CODE`; **400** `VALIDATION` + `fields` (bulunamayan `groupId`/`mediaIds` dahil).
- Ürün silinmez; `isActive: false` ile satıştan kaldırılır (geçmiş siparişler korunur).
- Fiyat değişikliği sonraki ön siparişleri etkiler, eskileri değiştirmez (GR-URN-001).
- Stok elle (K-19 yedek yolu; BizimHesap entegrasyonu ertelendi). Fiyat ve stok değişiklikleri audit_log'a.

### Excel ile toplu yükleme (K-59, K-60)

- `GET /api/admin/products/import-template` → `.xlsx` (başlık satırı + 2 örnek satır + açıklama sayfası).
- `POST /api/admin/products/import?dryRun=true|false` (multipart, alan `file`, `.xlsx`, en fazla 5 MB / 5000 satır)
  → **200** `{ total, created, updated, unchanged, warnings, groupsCreated: ["..."], errors: [{ row, column, message }] }`
  (`row` Excel satır numarası, başlık satırı = 1). `updated` yalnızca gerçekten değişen mevcut ürünlerdir; barkodu eşleşip hiçbir alanı değişmeyenler `unchanged` sayısındadır. Hata olmayan uyarılar `warnings: [{ row, message }]` ile döner (ör. ürün pasif gruba düşüyor: "Ürün grubu pasif; ürün katalogda görünmez.").
  Dosya açıldığında 50 MB'ı aşıyorsa **400** `VALIDATION` `fields.file`. Hata listesi 1000'i aşarsa ilk 1000 döner ve `truncated: true` eklenir.
  Dosya `.xlsx` değilse veya yoksa **400** `VALIDATION` (`fields.file`); 413: 5 MB üstü. 5000 satır aşılırsa `errors: [{ row: 1, column: "Dosya", ... }]`.
  - `dryRun=true`: hiçbir şey yazılmaz, yalnızca rapor.
  - `dryRun=false`: hata varsa **hiçbir satır yazılmaz** (422 aynı gövdeyle, ek olarak `code: "IMPORT_INVALID"`); hata yoksa tek transaction.
  - Mevcut üründe boş hücre: Ürün kodu, Açıklama, KDV oranı, Stok, Aktif değişmez; Boş KDV oranı yeni üründe %20 olur (K-60), mevcutta değişmez. KDV hücresi yüzde biçimliyse (`%`) değer ×100 okunur (0,2 → 20); biçimsiz 0 < değer < 1 hatadır ("KDV oranını yüzde olarak yazın, ör. 20."). Barkod/kod sayı hücresiyse: barkod yalnızca güvenli tam sayı ve 8 veya 13 haneliyse kabul edilir (baştaki sıfır kaybı şüphesi; aksi hata, sütunu Metin biçimine çevirin), ürün kodu güvenli tam sayı olmalı. Barkodu `ORNEK` ile başlayan satır (şablon örnekleri) hatadır.
  - Başlıklar Türkçe harf, büyük/küçük harf, boşluk ve noktalamaya duyarsız eşlenir; "Liste fiyatı" kısa adı da kabul edilir.
- Sütunlar (başlık adları sabit, sıra serbest):

| Sütun | Zorunlu | Not |
|---|---|---|
| Barkod | evet | Eşleşme anahtarı: varsa güncellenir, yoksa eklenir |
| Ürün kodu | hayır | BizimHesap kodu |
| Ürün adı | evet | |
| Ürün grubu | evet | Yoksa otomatik oluşturulur |
| Koli içi adet | evet | Tam sayı ≥ 1 |
| Liste fiyatı (KDV hariç) | evet | "19,99" veya 19.99 |
| KDV oranı | hayır | Boşsa yeni üründe %20 (K-60), mevcut üründe değişmez |
| Açıklama | hayır | |
| Stok | hayır | "Var" / "Yok"; boşsa yeni üründe Var, mevcut üründe değişmez |
| Aktif | hayır | "Evet" / "Hayır"; boşsa yeni üründe Evet, mevcutta değişmez |

- Dosya içinde aynı barkod iki kez → hata. Barkod başka üründe kod çakışması → hata.

## Bayi grup iskontoları (Admin, K-12, K-13)

- `GET /api/admin/dealers/:id/group-discounts` → `[{ groupId, groupName, discountPercent }]`
- `PUT /api/admin/dealers/:id/group-discounts` `{ items: [{ groupId, discountPercent: "15" }] }` → **204**;
  listeyi tamamen değiştirir (boş liste = hepsini kaldır). 0 < oran < 100, en fazla 2 ondalık.
  Yalnızca `pending_approval`, `active`, `passive` bayide (diğerlerinde **409** `INVALID_STATE`). Audit'e önceki/yeni.

## Bayi kataloğu (DealerGuard, GR-URN-003, GR-FIY-001)

`CatalogProduct`:
```json
{
  "id": "uuid", "name": "...", "barcode": "...", "code": "..." | null, "description": "..." | null,
  "groupId": "uuid", "groupName": "...", "caseQuantity": 12,
  "stock": "in_stock | out_of_stock",
  "listPrice": "48.90", "price": "41.57", "discountPercent": "15.00" | null, "vatRate": "20.00",
  "images": [{ "url": "...", "thumbUrl": "..." }]
}
```
- `GET /api/catalog/groups` → `[{ id, name, productCount, thumbUrl }]` (aktif grup, aktif ürünü olan).
  `thumbUrl: string | null`: grubun aktif ürünleri içinde, ürün adı sırasıyla ilk görselli ürünün ilk görselinin (sort_order) thumb adresi; görselli aktif ürünü yoksa `null`. Tek sorguda hesaplanır.
- `GET /api/catalog/products?q=&groupId=&stock=in_stock&sort=name|newest&page=1&pageSize=24` → `{ items, total, page, pageSize }`;
  `stock=in_stock`: yalnızca stokta olanlar (parametre yoksa hepsi; başka değer **400**). `/api/catalog/groups` `productCount` değerini etkilemez.
  `sort`: `name` (varsayılan; ad, Türkçe harf duyarsız) veya `newest` (oluşturulma tarihi yeniden eskiye); başka değer **400**. Tam barkod eşleşmesi her iki sıralamada da en üstte kalır.
  Yalnızca aktif ürün ve aktif grup; `q` ad, barkod, kodda. `q` aktif bir ürünün barkoduyla birebir eşleşiyorsa **yalnızca o ürün** döner (`total: 1`).
- `GET /api/catalog/products/:id` → `CatalogProduct` (pasif ürün **404**)
- Stok adedi hiçbir yerde dönmez (K-18).
- Arama (`q`): ad Türkçe harf ve büyük/küçük harf duyarsız ("ÇAY" = "cay"); barkod ve kod harf duyarsız alt dizi eşleşmesi.
