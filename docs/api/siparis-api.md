# API Sözleşmesi: Sepet ve Ön Sipariş

Gereksinimler: GR-SIP-003…008, GR-FIY-001…003, GR-BLD-001. Kararlar: K-11, K-13, K-20 – K-22, K-25 – K-27,
K-33, K-36 – K-39, K-41, K-44.
Tüm uçlar `/api` önekli; JSON. Hata gövdesi: `{ statusCode, message, code?, fields? }`; frontend `message`'ı göstermez, `code`'a göre davranır.
Tutarlar metin (`"498.84"`), 2 basamak; yüzdeler metin (`"15.00"`). Hesap yalnızca backend'de yapılır (`money.ts`).
Bayi uçlarında anonim **401**, Admin oturumu **403**. Fiyat içeren hiçbir uç giriş yapmamış kullanıcıya veri dönmez (GR-FIY-001).

## Tutar kuralları (K-11, K-33, K-39)

Satır başına (fiyat sepette saklanmaz, her istekte güncel iskontoyla hesaplanır):

- `unitPrice` = `listPrice × (1 − iskonto/100)`, 2 basamağa yuvarlanmış (bayinin katalogda gördüğü fiyatla aynı).
- `lineNet` = `quantity × unitPrice` (2 basamak). Ekrandaki birim fiyat × adet ile birebir aynıdır.
- `lineGross` = `quantity × listPrice`; `lineDiscount` = `lineGross − lineNet`.
- `lineVat` = `lineNet × vatRate / 100`, satır bazında 2 basamağa yuvarlanır.

Özet (`summary`) satırların toplamıdır: `grossTotal`, `discountTotal`, `netTotal` (= brüt − iskonto), `vatTotal` (KDV ayrı satır, K-33),
`grandTotal` (= net + KDV). Örnek: 12 adet × liste 48.90, %15 iskonto -> `unitPrice` 41.57, `lineNet` **498.84**.

## Cart (sepet görünümü)

```json
{
  "version": "4f53cda18c2baa0c",
  "lines": [
    {
      "productId": "uuid",
      "barcode": "8690000000017", "code": "ZC-1", "name": "Çay Bardağı 6'lı",
      "thumbUrl": "/api/media/<id>/thumb.webp",
      "quantity": 12, "caseQuantity": 6,
      "stock": "in_stock",
      "listPrice": "48.90", "discountPercent": "15.00", "unitPrice": "41.57",
      "lineGross": "586.80", "lineDiscount": "87.96", "lineNet": "498.84",
      "vatRate": "20.00", "lineVat": "99.77"
    }
  ],
  "summary": {
    "grossTotal": "586.80", "discountTotal": "87.96", "netTotal": "498.84",
    "vatTotal": "99.77", "grandTotal": "598.61"
  },
  "warnings": [{ "code": "OUT_OF_STOCK", "productId": "uuid", "name": "..." }],
  "removed": [{ "productId": "uuid", "name": "..." }],
  "adjusted": [{ "productId": "uuid", "name": "...", "from": 10, "to": 12, "caseQuantity": 6 }]
}
```

- `version`: sepetin sürümü (16 hex). Satırların `productId`, `quantity` ve `unitPrice` değerlerinden deterministik hesaplanır; aynı içerik aynı sürümü verir, ürün/miktar/fiyat değişince değişir. Sipariş gönderirken `expectedVersion` olarak geri gönderilir.
- `thumbUrl`: ürünün ilk görseli, yoksa `null` (varsayılan görseli frontend koyar). `discountPercent`: iskonto yoksa `null` (`unitPrice` = `listPrice`).
- `stock`: `in_stock | out_of_stock`; adet dönmez (K-18). `out_of_stock` satırlar sepette tutulur ve `warnings`'a `OUT_OF_STOCK` olarak düşer;
  frontend "Tedarik süresi görüşülecek" uyarısını gösterir (K-20, GR-SIP-003).
- `removed`: bu istekte sepetten **düşürülen** pasif/kaldırılmış (ürün veya grubu pasif) ürünler (GR-SIP-008). Sepetten gerçekten silinirler; bir sonraki istekte listede görünmezler, bu yüzden bayiye hemen gösterilmelidir.
- `adjusted`: koli içi adedi değiştiği için miktarı koli katına yukarı yuvarlanan satırlar (kalıcı olarak güncellenir).
- Sepet boşsa `lines: []`, tüm toplamlar `"0.00"`.

## Sepet uçları (DealerGuard, K-41: kalıcı)

- `GET /api/cart` -> **200** `Cart`.
- `PUT /api/cart/items/:productId` `{ "quantity": 12 }` -> **200** `Cart`. Ekler veya miktarı **değiştirir** (artırmaz).
  - `quantity` tam sayı 0 – 100000. **0 = satırı kaldırır.**
  - Koli katı değilse **400** `{ code: "CASE_MULTIPLE", caseQuantity: 6 }` ve sepet değişmez (GR-SIP-004).
  - Ürün yok, pasif veya grubu pasifse **404** `PRODUCT_NOT_FOUND` (0 gönderilirse yine kaldırılır).
  - Stokta olmayan ürün eklenebilir (K-20).
  - Geçersiz gövde **400** `VALIDATION` + `fields`.
- `DELETE /api/cart/items/:productId` -> **200** `Cart` (satır yoksa da 200).
- `DELETE /api/cart` -> **204**.
- `GET /api/cart/checkout-defaults` -> **200**
  ```json
  { "address": "Örnek Mah. 1. Sk. No:3, Melikgazi / Kayseri",
    "lastCarrier": { "name": "Yurtiçi Kargo", "branch": "Kayseri Şube" } }
  ```
  `address`: başvurudaki açık adres + `ilçe / il` (K-38; bayi değiştirebilir). `lastCarrier`: bayinin son ambar siparişindeki ambar adı ve şubesi, yoksa `null`.

## Ön sipariş gönder (DealerGuard)

`POST /api/orders`
```json
{
  "deliveryMethod": "carrier",
  "deliveryAddress": "Örnek Mah. 1. Sk. No:3, Melikgazi / Kayseri",
  "carrierName": "Yurtiçi Kargo",
  "carrierBranch": "Kayseri Şube",
  "note": "Sabah teslim olursa iyi olur.",
  "expectedTotal": "598.61",
  "expectedVersion": "4f53cda18c2baa0c"
}
```

- `deliveryMethod`: `carrier` (Ambar ile) | `pickup` (Bayi kendisi alır) | `truck` (Tır yüklemesi) (K-36). Zorunlu.
- `carrier` ise `deliveryAddress`, `carrierName`, `carrierBranch` zorunlu (boş/yalnız boşluk olamaz), aksi **400** `VALIDATION` + `fields` (K-38, GR-SIP-007).
  `pickup`/`truck` ise bu üç alan **yok sayılır** (kaydedilmez); sipariş "adres görüşmede belirlenecek" olarak işlenir (K-37).
- `note`: isteğe bağlı, en fazla 1000 karakter.
- `expectedTotal`: bayinin ekranda gördüğü **genel toplam** (`summary.grandTotal`). Zorunlu.
- `expectedVersion`: bayinin ekranda gördüğü sepetin `version` değeri. **Zorunlu** (yoksa 400 `VALIDATION`). Toplam aynı kalsa bile sepet içeriği (ürün, miktar, birim fiyat) farklıysa sipariş oluşmaz.

Sunucu sepeti güncel fiyatla yeniden hesaplar (GR-FIY-001). Sonuçlar:


- **201** `{ "id": "uuid", "orderNo": 1001 }`. Tek transaction'da: sipariş + satır kopyaları (ürün bilgisi, fiyat, iskonto, `outOfStockAtOrder`) +
  durum geçmişi (`submitted`, kaynak sistem) yazılır, sepet boşalır. BizimHesap aktarım durumu `pending`. Ardından arka planda bayiye onay, tüm aktif Admin'lere "Yeni ön sipariş #orderNo" e-postası gider (GR-BLD-001, K-26).
- **409** `{ code: "PRICE_CHANGED", cart: Cart }`: güncel genel toplam `expectedTotal`'dan farklı, **veya** `version` `expectedVersion`'dan farklı, **veya** sepette `removed`/`adjusted` oluştu.
  Sipariş oluşmaz; frontend güncel `cart`'ı gösterip bayiden yeniden onay ister, onayla yeni `expectedTotal` ile tekrar gönderir.
- **400** `EMPTY_CART`: sepet boş. (Sepetteki tüm ürünler pasif olup düşerse sepet boşalır ama `removed` dolu olduğundan yanıt 409 `PRICE_CHANGED` olur.)
- **400** `VALIDATION`: gövde hatası.

Çift gönderim: aynı bayi için sipariş gönderimi `pg_advisory_xact_lock` ile sıraya konur. Paralel iki istekten biri **201**, diğeri sepet artık boş olduğundan **400** `EMPTY_CART` alır;
yani tek sipariş oluşur. Frontend `EMPTY_CART` alırsa ve az önce gönderim yaptıysa sipariş geçmişine yönlendirmelidir. Gönder düğmesi tıklamada devre dışı bırakılmalıdır.

Gönderilen sipariş değiştirilemez ve iptal edilemez (K-22, GR-SIP-005): bayi uçlarında sipariş için yazma ucu yoktur (`PUT/PATCH/DELETE /api/orders/:id` -> 404/405).

## Sipariş geçmişi (DealerGuard, GR-SIP-006, K-23)

`GET /api/orders?page=1&pageSize=20` -> **200** `{ items, total, page, pageSize }` (pageSize en fazla 100), en yeni önce:
```json
{ "id": "uuid", "orderNo": 1001, "submittedAt": "2026-11-14T09:30:00.000Z", "status": "submitted",
  "netTotal": "498.84", "grandTotal": "598.61", "lineCount": 1 }
```

`GET /api/orders/:id` -> **200** (yalnızca kendi siparişi; başkasının veya olmayan **404**):
```json
{
  "id": "uuid", "orderNo": 1001, "status": "submitted", "submittedAt": "ISO",
  "deliveryMethod": "carrier", "deliveryAddress": "..." , "carrierName": "...", "carrierBranch": "...",
  "note": "..." ,
  "lines": [{
    "lineNo": 1, "productId": "uuid", "barcode": "...", "code": "ZC-1" , "name": "...",
    "quantity": 12, "caseQuantity": 6, "listPrice": "48.90", "discountPercent": "15.00", "unitPrice": "41.57",
    "lineGross": "586.80", "lineDiscount": "87.96", "lineNet": "498.84", "vatRate": "20.00", "lineVat": "99.77",
    "outOfStock": false
  }],
  "summary": { "grossTotal": "...", "discountTotal": "...", "netTotal": "...", "vatTotal": "...", "grandTotal": "..." },
  "history": [{ "fromStatus": null, "toStatus": "submitted", "source": "system", "createdAt": "ISO" }]
}
```
Satırda iskonto yoksa `discountPercent` **`null`** döner (sepet satırıyla aynı; K-10), `unitPrice` = `listPrice`.
`deliveryAddress/carrierName/carrierBranch` yalnızca `carrier` ise dolu, aksi `null` (arayüz "adres görüşmede belirlenecek" yazar). `unitPrice` sipariş anındaki iskontolu birim fiyattır (kopya); ürün fiyatı sonradan değişse de sipariş değişmez.
`status`: `submitted | negotiating | approved | shipped | delivered | cancelled` (K-25). Dahili not ve Admin kimliği bayiye dönmez.

## Tekrar sipariş ver (DealerGuard, K-41, K-44, GR-SIP-008)

`POST /api/orders/:id/reorder` (gövde yok; yalnızca kendi siparişi, aksi **404**) -> **200**
```json
{
  "cart": { "...": "Cart" },
  "added": [{ "productId": "uuid", "name": "...", "quantity": 12 }],
  "skipped": [{ "productId": "uuid", "name": "...", "barcode": "...", "reason": "INACTIVE" }],
  "adjusted": [{ "productId": "uuid", "name": "...", "from": 10, "to": 12, "caseQuantity": 6 }]
}
```
- Satırlar **güncel fiyat** ve stokla sepete eklenir (K-44); sepetteki aynı ürünün miktarına **eklenir** (toplanır).
- Pasif/kaldırılmış (ürün veya grubu pasif) ürünler eklenmez, `skipped`'te `reason: "INACTIVE"` ile döner. (Koli içi adedi tek başına 100000'i aşan üründe `reason: "QUANTITY_LIMIT"`.)
- Toplanan miktar satır sınırını (100000) aşarsa, sınırı aşmayan en büyük koli katına kırpılır ve `adjusted`'ta bildirilir (`from` istenen, `to` kırpılan).
- Ürünün koli içi adedi değiştiyse ve miktar yeni koli katı değilse miktar yukarı yuvarlanır; `adjusted`'ta `from` (eski miktar + sepetteki), `to` (yeni) döner.
- `cart.removed/adjusted` bu isteğin kendi `adjusted` listesinden ayrıdır (sepette önceden kalmış satırların düzeltmesi).

## Admin sipariş okuma (AdminGuard)

Durum güncelleme sonraki adımdır; bu uçlar salt okunurdur.

`GET /api/admin/orders?status=&dealerId=&from=2026-11-01&to=2026-11-30&page=1&pageSize=20` -> `{ items, total, page, pageSize }`, en yeni önce.
`from`/`to` `YYYY-MM-DD`, **Europe/Istanbul** günü olarak, ikisi de dahil. Öğe:
```json
{ "id": "uuid", "orderNo": 1001, "submittedAt": "ISO", "status": "submitted",
  "dealer": { "id": "uuid", "companyTitle": "..." }, "deliveryMethod": "carrier",
  "transferStatus": "pending", "netTotal": "...", "grandTotal": "...", "lineCount": 1 }
```
`GET /api/admin/orders/:id` -> bayi detayındaki tüm alanlar + `dealer { id, companyTitle, contactName, email, phone }`,
`transferStatus`, `transferError`, `bizimhesapGuid`, `transferredAt`; `history` öğelerinde ek olarak `changedBy` (Admin id) ve `note`. Olmayan id **404**.

## Bildirimler (outbox, GR-BLD-001, AdminGuard)

Tüm e-postalar (sipariş, başvuru, davet, ret, şifre sıfırlama, doğrulama, hatırlatma) önce iş transaction'ında `notification_outbox`'a yazılır,
commit sonrası bir kez denenir; başarısızsa dakikada bir çalışan iş 1, 5, 15, 60 dk (sonra 60 dk) aralıkla en fazla 8 denemeye kadar yeniden dener,
ardından `failed` olur ve log'a error yazılır. Token içeren e-postalarda bağlantı gönderilince (veya `failed` ise 24 saat sonra) payload'dan silinir.

- `GET /api/admin/notifications?status=pending|sent|failed&page=1&pageSize=20` -> `{ items, total, page, pageSize }`, en yeni önce.
  Öğe: `{ id, kind, recipient, status, attempts, lastError, nextAttemptAt, createdAt, sentAt }` (payload ve bağlantılar dönmez).
  `kind`: `order_confirmation | new_order_team | new_application | invitation | rejection | password_reset | email_verification | approval_reminder`.
- `POST /api/admin/notifications/:id/retry` -> **200** güncel öğe (sayacı sıfırlar, hemen bir kez dener). Zaten gönderilmişse **409** `ALREADY_SENT`;
  bağlantısı silinmiş token'lı e-posta **409** `PAYLOAD_EXPIRED`; olmayan id **404**.
