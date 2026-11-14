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

Dosyalar sunucu diskinde `MEDIA_DIR` (varsayılan `backend/storage/media`, git'e girmez).
Yüklemede iki boyut üretilir (webp): küçük `thumb` (400 px) ve büyük `large` (1200 px, uzun kenar).
Kabul: jpeg, png, webp; dosya başına en fazla 8 MB; istek başına en fazla 50 dosya.

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
- Hatalar: **409** `DUPLICATE_BARCODE` / `DUPLICATE_CODE`; **400** `VALIDATION` + `fields`.
- Ürün silinmez; `isActive: false` ile satıştan kaldırılır (geçmiş siparişler korunur).
- Fiyat değişikliği sonraki ön siparişleri etkiler, eskileri değiştirmez (GR-URN-001).
- Stok elle (K-19 yedek yolu; BizimHesap entegrasyonu ertelendi). Fiyat ve stok değişiklikleri audit_log'a.

### Excel ile toplu yükleme (K-59, K-60)

- `GET /api/admin/products/import-template` → `.xlsx` (başlık satırı + 2 örnek satır + açıklama sayfası).
- `POST /api/admin/products/import?dryRun=true|false` (multipart, alan `file`, `.xlsx`, en fazla 5 MB / 5000 satır)
  → **200** `{ total, created, updated, groupsCreated: ["..."], errors: [{ row, column, message }] }`.
  - `dryRun=true`: hiçbir şey yazılmaz, yalnızca rapor.
  - `dryRun=false`: hata varsa **hiçbir satır yazılmaz** (422 aynı gövdeyle); hata yoksa tek transaction.
- Sütunlar (başlık adları sabit, sıra serbest):

| Sütun | Zorunlu | Not |
|---|---|---|
| Barkod | evet | Eşleşme anahtarı: varsa güncellenir, yoksa eklenir |
| Ürün kodu | hayır | BizimHesap kodu |
| Ürün adı | evet | |
| Ürün grubu | evet | Yoksa otomatik oluşturulur |
| Koli içi adet | evet | Tam sayı ≥ 1 |
| Liste fiyatı (KDV hariç) | evet | "19,99" veya 19.99 |
| KDV oranı | hayır | Boşsa %20 (K-60) |
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
- `GET /api/catalog/groups` → `[{ id, name, productCount }]` (aktif grup, aktif ürünü olan)
- `GET /api/catalog/products?q=&groupId=&page=1&pageSize=24` → `{ items, total, page, pageSize }`;
  yalnızca aktif ürün ve aktif grup; `q` ad, barkod, kodda; tam barkod eşleşmesi en üstte.
- `GET /api/catalog/products/:id` → `CatalogProduct` (pasif ürün **404**)
- Stok adedi hiçbir yerde dönmez (K-18).
