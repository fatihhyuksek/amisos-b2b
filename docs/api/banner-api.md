# API Sözleşmesi: Ana Sayfa Kampanya Görselleri (Banner)

Gereksinim: K-65 (kampanya görselleri Admin'den yönetilir), GR-YON-001 (Admin işlemleri kayıtlı). Görseller K-62 görsel kütüphanesinden seçilir.
Tüm uçlar `/api` önekli; JSON. Hata gövdesi: `{ statusCode, message, code?, fields? }`.

## Görsel boyutu

Banner görseli kütüphanedeki mevcut `large` sürümüyle (en fazla 1200 px uzun kenar) gösterilir; yeni boyut üretilmez.
Önerilen yükleme: **3:1 oran, 1200 × 400 px** (masaüstü şerit). Küçük ekranda frontend `object-fit: cover` ile kırpar;
önemli içerik görselin ortasına konmalıdır. Daha geniş görsel yüklenirse uzun kenar 1200 px'e küçülür.

## Banner (Admin)

```json
{
  "id": "uuid", "mediaId": "uuid",
  "title": "Yeni sezon bardaklar",
  "subtitle": "Kasım boyunca %10 ek iskonto" ,
  "linkPath": "/katalog?grup=bardak",
  "imageUrl": "/api/media/<id>/large.webp", "thumbUrl": "/api/media/<id>/thumb.webp",
  "sortOrder": 0, "isActive": true,
  "startsAt": "2026-11-20T00:00:00.000Z", "endsAt": null,
  "createdAt": "ISO", "updatedAt": "ISO"
}
```
`subtitle`, `linkPath`, `startsAt`, `endsAt` boş olabilir (`null`).

- `title`: zorunlu, en fazla 200 karakter; görselin alt metni olarak da kullanılır. `subtitle`: en fazla 300.
- `linkPath`: yalnızca uygulama içi yol; **`/` ile başlamalı**. `//` ile başlayan, şema içeren (`https://…`, `javascript:…`), ters eğik çizgi veya boşluk içeren değerler **400** `VALIDATION` (`fields.linkPath`). Açık yönlendirme yoktur. En fazla 500 karakter. Doğrulama veritabanında da zorunludur.
- `startsAt` / `endsAt`: ISO-8601, ofsetli (ör. `2026-11-20T00:00:00+03:00`). Panel Europe/Istanbul gününü `+03:00` ile göndermelidir. `endsAt > startsAt` olmalıdır.
- `sortOrder` sunucuda yönetilir (yeni banner sona eklenir); değiştirmek için sıralama ucunu kullanın.

### Uçlar (AdminGuard)

- `GET /api/admin/banners` -> **200** `Banner[]` (sortOrder sırasıyla; pasif ve süresi geçmişler dahil).
- `POST /api/admin/banners` `{ mediaId*, title*, subtitle?, linkPath?, isActive? (varsayılan true), startsAt?, endsAt? }` -> **201** `Banner`. Bulunamayan `mediaId` **400** `VALIDATION` (`fields.mediaId`).
- `PATCH /api/admin/banners/:id` — aynı alanlar, kısmi (`null` ile boşaltılabilir) -> **200** `Banner`; olmayan id **404**.
- `DELETE /api/admin/banners/:id` -> **204**; olmayan id **404**.
- `PUT /api/admin/banners/order` `{ ids: ["uuid", …] }` -> **200** `Banner[]`. `ids` tüm banner'ları tam olarak bir kez içermelidir, aksi **400** `VALIDATION` (`fields.ids`).
- Görsel silme: banner'da kullanılan görsel `DELETE /api/admin/media/:id` ile **409** `MEDIA_IN_USE` alır; `Media.usedBy` banner kullanımını da sayar.
- Oluşturma, değiştirme, silme ve sıralama audit_log'a yazılır (`banner.created|updated|deleted|reordered`).

## Bayi (DealerGuard)

`GET /api/catalog/banners` -> **200**
```json
[{ "id": "uuid", "title": "...", "subtitle": "..." , "linkPath": "/katalog", "imageUrl": "...", "thumbUrl": "..." }]
```
Yalnızca `isActive` olan ve şu an `startsAt <= şimdi < endsAt` aralığında olanlar (boş sınır = sınırsız), `sortOrder` sırasıyla. Anonim **401**, Admin oturumu **403**.
