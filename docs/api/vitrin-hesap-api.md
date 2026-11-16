# API Sözleşmesi: Açık Vitrin, Bayi Hesabı, Favoriler, Hızlı Sipariş, Site Ayarları, Admin Araçları

Kararlar: K-66 – K-76. Mevcut sözleşmeleri (katalog, sipariş, banner, bayi hesabı) genişletir.
Hata gövdesi her yerde `{ statusCode, message, code?, fields? }`. Yazma uçları JSON (JsonOnlyGuard).
Tutarlar metin (`"123.45"`). Her yazma işlemi audit_log'a yazılır.

## 1. Açık vitrin (K-66)

`GET /api/catalog/groups`, `GET /api/catalog/products`, `GET /api/catalog/products/:id`, `GET /api/catalog/banners`
artık **oturumsuz da** çalışır (OptionalAuth). Bayi oturumu varsa bugünkü davranış aynen sürer.

- Oturum yoksa **veya Admin oturumu** ise: `listPrice`, `price`, `discountPercent`, `stockStatus`, `vatRate` alanları
  `null` döner (alan adları korunur). Ürün listesi ve detayında üst düzeyde `priceVisible: boolean` alanı.
- `sort=price_asc|price_desc` oturumsuzken **400** değil; isme göre sıralanır (fiyat sızdırılmaz).
- `inStock` filtresi oturumsuzken yok sayılır.
- Bayi oturumunda her ürün öğesine `isFavorite: boolean` eklenir (oturumsuzda `false`).
- Ürün öğelerine ekler: `isFeatured: boolean`, `isNew: boolean` (`createdAt` son 30 gün, sunucu saatine göre).
- Yeni liste parametreleri: `featured=true` (yalnız öne çıkanlar), `new=true` (yalnız son 30 gün).
- Gruplar yanıtında (varsa) grup görseli ve ürün sayısı aynen kalır.

## 2. Site ayarları ve bilgi sayfaları (K-73)

Tablo `site_settings (key text pk, value jsonb, updated_at, updated_by uuid null)`.

### `GET /api/site` (herkese açık)
```json
{
  "announcement": "Toptan satış portalı · Fiyatlar KDV hariçtir",   // null olabilir (şerit gizlenir)
  "contact": { "phone": "0552 492 50 58", "phoneE164": "+905524925058", "whatsappE164": "+905524925058",
               "email": "info@amisosb2b.com", "address": "İSTOÇ Z Blok No: 91", "city": "İstanbul",
               "workingHours": "Hafta içi 09:00 – 18:30, Cumartesi 09:00 – 14:00", "mapUrl": null },
  "pages": [ { "slug": "hakkimizda", "title": "Hakkımızda" }, ... ]   // yalnızca yayımlanmış sayfalar
}
```
Kayıt yoksa varsayılanlar (K-64 bilgileri) döner.

### `GET /api/site/pages/:slug` (herkese açık)
Slug: `hakkimizda | sss | teslimat | kvkk | kullanim-kosullari`. Yanıt `{ slug, title, body, updatedAt }`.
`body` düz metindir; biçim kuralı: boş satır paragraf ayırır, `## ` ile başlayan satır alt başlık, `- ` ile başlayan
satır madde. **HTML yok**; arayüz bunu güvenli biçimde (dangerouslySetInnerHTML olmadan) çizer.
SSS'de her `## ` başlığı soru, altındaki paragraflar cevaptır. Yayımlanmamış/bilinmeyen sayfa **404**.
Varsayılan içerikler sunucuda vardır (KVKK ve koşullar "taslak — hukuk onayı bekliyor" notuyla).

### Admin: `GET /api/admin/site`, `PUT /api/admin/site`
Gövde/yanıt: `{ announcement: string|null (≤160), contact: {...yukarıdaki alanlar; phone/email zorunlu, mapUrl https ile
başlamalı veya null}, pages: [{ slug, title (≤80), body (≤20000), published: boolean }] }`. Bilinmeyen slug **400**.

## 3. Bayi hesabı (K-67, K-68) — DealerGuard

### `GET /api/account`
```json
{ "companyTitle", "taxOffice": null, "taxNumber": null, "contactName", "email", "phone", "city", "district",
  "address", "generalDiscountPercent": "10.00"|null, "memberSince": ISO, "lastLoginAt": ISO|null,
  "marketingConsent": true,
  "stats": { "orderCount": 12, "openOrderCount": 2, "yearNetTotal": "45210.00", "lastOrderAt": ISO|null } }
```
`openOrderCount` = submitted/negotiating/approved/shipped. `yearNetTotal` = bu takvim yılı (Europe/Istanbul),
iptal hariç, KDV hariç net. `memberSince` = onay (reviewedAt) yoksa createdAt.

### `PATCH /api/account`
Gövde (hepsi isteğe bağlı): `contactName (2–100)`, `phone` (başvurudaki telefon kuralı), `city`, `district`,
`address (≤500)`, `taxOffice (≤100 | null)`, `taxNumber` (`^\d{10}$|^\d{11}$` | null). Firma unvanı/e-posta
gönderilirse **400**. **200** güncel hesap. Audit: `dealer.profile_updated` (değişen alanlar, eski→yeni).

### `POST /api/account/password` (ThrottlerGuard)
`{ currentPassword, newPassword }` — yeni şifre K-53 kuralı. Mevcut şifre yanlışsa **400** `{ code: "WRONG_PASSWORD" }`.
Başarıda bu oturum dışındaki tüm oturumlar kapanır. **204**.

### `POST /api/account/sessions/revoke-others` → **204** (diğer cihazlardan çıkış).

### `PUT /api/account/marketing-consent` `{ granted: boolean }` → consents'e yeni satır (güncel pazarlama metni sürümü). **204**.

### Kayıtlı adresler (K-69)
- `GET /api/account/addresses` → `[{ id, label, carrierName, carrierBranch, address, city, district, isDefault, createdAt }]`
  (varsayılan önce, sonra en yeni).
- `POST /api/account/addresses` gövde `{ label (1–60), carrierName (≤100), carrierBranch (≤100), address (1–500),
  city, district, isDefault? }` → **201**. 20'den fazla **409** `ADDRESS_LIMIT`.
- `PATCH /api/account/addresses/:id` (kısmi) → **200**; `DELETE` → **204**. Başkasının adresi **404**.
- Tek varsayılan: biri varsayılan yapılınca diğerleri kaldırılır. İlk adres otomatik varsayılan.
- Tablo `dealer_addresses`. Sipariş API'si değişmez; arayüz seçilen adresle onay formunu doldurur.

### Başvuru
`POST /api/applications` gövdesine isteğe bağlı `taxOffice`, `taxNumber` (aynı kurallar). Admin bayi detayında görünür.

## 4. Favoriler (K-70) — DealerGuard
- `GET /api/favorites` → `{ items: [katalog ürün öğesi] }` (en son eklenen önce; pasif ürünler listelenmez).
- `PUT /api/favorites/:productId` → **204** (idempotent; pasif/bilinmeyen ürün **404**).
- `DELETE /api/favorites/:productId` → **204** (idempotent).
- Tablo `dealer_favorites (dealer_id, product_id, created_at, pk(dealer_id, product_id))`.

## 5. Hızlı sipariş (K-71) — DealerGuard
`POST /api/cart/quick-add` `{ lines: [{ query: string (barkod veya ürün kodu, kırpılır), quantity: int ≥1 }] }`
(1–200 satır). Her satır ayrı değerlendirilir (kısmi başarı). Aynı ürün birden çok satırda gelirse adetler toplanır.
Adet koli katına **yukarı** yuvarlanır. Sepette varsa adet **eklenir**.
Yanıt **200**:
```json
{ "added": [{ "index": 0, "productId", "name", "barcode", "requested": 5, "quantity": 6, "caseQuantity": 6,
              "outOfStock": false }],
  "errors": [{ "index": 2, "query": "123", "code": "NOT_FOUND" | "INACTIVE" | "INVALID_QUANTITY" }],
  "cart": { ...GET /api/cart yanıtı } }
```
Eşleşme: önce barkod tam eşleşme, sonra kod (büyük/küçük harf duyarsız) tam eşleşme. Tek transaction.

## 6. Fiyat listesi ve bayi sipariş Excel'i (K-72) — DealerGuard
- `GET /api/catalog/price-list.xlsx` → aktif ürünler, grup ve ada göre sıralı. Sütunlar: Barkod, Ürün kodu, Ürün adı,
  Grup, Koli içi, Liste fiyatı, İskonto %, Size özel birim fiyat (KDV hariç), KDV %, Stok (Var/Yok). Barkod/kod metin
  hücresi, para `#,##0.00`. Üstte başlık satırları: "AMİSOS B2B Fiyat Listesi", bayi unvanı, tarih (Europe/Istanbul),
  "Fiyatlar KDV hariçtir". Dosya adı `fiyat-listesi-<YYYY-MM-DD>.xlsx`.
- `GET /api/orders/:id/export.xlsx` → bayinin kendi siparişi (başkasınınki **404**); admin sipariş Excel'iyle aynı
  düzen, iç alanlar (BizimHesap aktarımı) yok. Dosya adı `siparis-<orderNo>.xlsx`.

## 7. Admin araçları (K-74, K-75) — AdminGuard

### Bayi bilgilerini düzenleme
`PATCH /api/admin/dealers/:id` gövde (isteğe bağlı): `companyTitle, contactName, email, phone, city, district, address,
taxOffice, taxNumber`. Unvan/e-posta tekilliği mevcut kurallarla (**409** `DUPLICATE_EMAIL` / `DUPLICATE_COMPANY`).
**200** güncel detay. Audit `dealer.updated`. Detay yanıtına `taxOffice`, `taxNumber` eklenir.

### Bayi iç notları (yalnız Admin görür)
- `GET /api/admin/dealers/:id/notes` → `[{ id, body, createdAt, createdBy: { id, fullName } }]` (en yeni önce)
- `POST /api/admin/dealers/:id/notes` `{ body (1–2000) }` → **201** not. `DELETE /api/admin/dealers/:id/notes/:noteId` → **204**.
- Tablo `dealer_notes`.

### Ürünler
- Ürün oluştur/güncelle gövdesine ve ürün yanıtlarına `isFeatured: boolean` (varsayılan false). Admin ürün listesine
  `featured=true` filtresi.
- `POST /api/admin/products/bulk` `{ ids: uuid[] (1–500), action: "activate"|"deactivate"|"in_stock"|"out_of_stock"|
  "feature"|"unfeature"|"set_group", groupId? (set_group'ta zorunlu, aktif grup) }` → **200** `{ updated: number }`.
  Bilinmeyen id'ler yok sayılır. Stok değişiminde `stockUpdatedAt` güncellenir, `stockSource = manual`. Tek audit kaydı
  (`product.bulk`, ids ve action).

### İşlem geçmişi
`GET /api/admin/audit?page&pageSize(≤100)&entityType&actorType=admin|dealer|system&q&from&to`
→ `{ items: [{ id, createdAt, actor: { type, id, name|null }, action, actionLabel, entityType, entityId,
entityLabel|null, reason, data }], total, page, pageSize }`. En yeni önce. `actionLabel` Türkçe (bilinmeyen eylemde
eylem adının kendisi). `entityLabel`: bayi → firma unvanı, sipariş → "#<orderNo>", ürün → ad (bulunamazsa null).
`q` entityId veya eylem adında arar. `from/to` YYYY-MM-DD Europe/Istanbul.

### Admin hesabı
- `GET /api/admin/account` → `{ id, email, fullName, lastLoginAt }`
- `PATCH /api/admin/account` `{ fullName (2–100) }` → **200**
- `POST /api/admin/account/password` `{ currentPassword, newPassword }` → **204**; kurallar bayi ile aynı
  (`WRONG_PASSWORD`, diğer oturumlar kapanır).

## 8. Demo verisi
`npm run db:demo` artık ürün görselleri (demo görsel kütüphanesi `backend/demo-assets/`), öne çıkan ürünler, 3 kampanya
görseli ve varsayılan site ayarlarını da üretir; `--clear` bunları da siler (yalnızca demo kayıtları).

## Uygulama notları (backend)

Migration: `0010_vitrin_hesap`. Alan adları sözleşmeyle aynıdır; aşağıdakiler belirsiz kalan noktaların netleştirmesidir.

- **Stok alanı adı `stock`**: katalog öğesindeki mevcut alan adı korunur (`stock: "in_stock"|"out_of_stock"|null`); `stockStatus` yoktur.
  Oturumsuz/Admin görünümünde `listPrice, price, discountPercent, stock, vatRate` = `null`. Detay yanıtında `priceVisible` üst düzeydir (öğe alanlarıyla yan yana).
- **Oturumsuzda `stock=in_stock` filtresi yok sayılır** (stok bilgisi sızmasın); `stock=out_of_stock` hâlâ 400. `sort=price_*` bayide bayinin iskontolu fiyatına göre.
- **Admin oturumu** katalogda 403 değil 200 döner, fiyatsız görünümle. `GET /api/catalog/price-list.xlsx` yalnızca bayi (anonim 401, Admin 403).
- `isNew`: `createdAt` son 30 gün (`NEW_PRODUCT_DAYS`). Favoriler `GET /api/favorites` yanıtında `priceVisible` yoktur (her zaman bayi).
- **Audit kapsamı**: favoriler ve hızlı sipariş (sepet işlemleri gibi, yüksek hacimli ve geri alınabilir) audit'e yazılmaz; diğer tüm yazmalar yazılır.
  Eylemler: `dealer.profile_updated, dealer.password_changed, dealer.sessions_revoked, dealer.marketing_consent_changed, dealer.address_added|updated|deleted,
  dealer.updated, dealer.note_added|deleted, product.bulk, site.updated, admin.profile_updated, admin.password_changed`.
- `GET /api/account`: `orderCount` iptaller dahil tüm siparişler; `openOrderCount` ve `yearNetTotal` sözleşmedeki gibi. `PATCH /api/account` bilinmeyen alanı (ör. `companyTitle`, `email`) 400 `VALIDATION` ile reddeder. `taxOffice`/`taxNumber` boş metin = `null`.
- `POST /api/account/password`: yeni şifre K-53; mevcut şifre yanlışsa 400 `WRONG_PASSWORD`. IP başına hız sınırı (429) vardır. Admin için aynı kurallar.
- **Adresler**: `carrierName, carrierBranch, city, district` isteğe bağlı (boş metin kabul, varsayılan `""`); `label` 1–60, `address` 1–500 zorunlu. Varsayılan adres silinirse kalan en yeni adres varsayılan olur. `PATCH {isDefault:false}` varsayılanı kaldırır (varsayılansız kalabilir).
- **Hızlı sipariş**: `quantity` tipi sayı olmalı (değilse 400); geçersiz/≤0/ondalık adet satır hatası `INVALID_QUANTITY`. Sepet üst sınırı (100 000) aşılırsa o ürün de `INVALID_QUANTITY` ile reddedilir. Aynı ürün birden çok satırda gelirse `added` içinde tek kayıt, `index` ilk satırın indeksi, `requested` toplamdır. Boş `query` = `NOT_FOUND`. Başarılı yanıt 200.
- **Site**: `PUT /api/admin/site` gövdesindeki `pages` yalnızca değişen sayfaları içerebilir (gönderilmeyenler korunur); `announcement: null` şeridi gizler. `contact.phoneE164`/`whatsappE164` verilmezse telefondan türetilir, `null` verilirse gizlenir. Admin yanıtındaki sayfalara `updatedAt` eklenir; varsayılan içeriğin `updatedAt` değeri sabittir (`2026-11-16T00:00:00.000Z`). Yanıtlar `Vary: Cookie` taşır.
- **Bayi PATCH (Admin)**: unvan tekilliği Türkçe büyük/küçük harf duyarsız; çakışmada 409 `DUPLICATE_EMAIL` / `DUPLICATE_COMPANY`. Gövde boşsa/değişiklik yoksa audit yazılmaz, güncel detay döner. Notlar `POST` yanıtı not nesnesidir.
- **Toplu işlem**: `updated` = bulunan ürün sayısı (değeri zaten aynı olanlar dahil). `set_group` pasif/bilinmeyen grupta 400 `VALIDATION` (`fields.groupId`). Yanıt 200.
- **İşlem geçmişi**: `entityLabel` ayrıca kampanya (başlık), ürün grubu (ad) ve Admin (ad) için de döner. `actor.name`: Admin adı, bayi firma unvanı, sistem `null`. `pageSize` varsayılan 50. `from/to` dahil (gün sonuna kadar).
- Başvuru (`POST /api/applications`) `taxOffice`/`taxNumber` kabul eder; Admin bayi detayında `taxOffice`, `taxNumber` döner (başvuru e2e'si mail kuyruğu nedeniyle yok, şema birim testi var).

### İnceleme düzeltmeleri
- **Sayfa sürümü**: `GET /api/site/pages/:slug` yanıtına `version` (tamsayı, ilk sürüm 1) eklendi; admin sayfa öğelerinde de var. Sayfa gövdesi her değiştiğinde 1 artar. Yeni KVKK/koşul onayları (başvuru, davet kabulü) `consents.documentVersion` alanına o anki sürümü `v<N>` olarak yazar; pazarlama onayı sabit `taslak-1` kalır.
- `site.updated` audit verisi: `{ changes: { "<anahtar>": { previous, next } } }`, yalnızca değişen anahtarlar (`announcement`, `contact`, `page:<slug>`). Değişiklik yoksa yazma ve audit olmaz.
- **Admin e-posta değişikliği**: bayinin kullanılmamış davet, şifre sıfırlama ve e-posta doğrulama bağlantıları geçersiz olur; `emailVerifiedAt` korunur (Admin güvenilir kaynak). Davet bekleyen (şifresiz) aktif bayiye yeni adrese davet otomatik gönderilir; `pending_email` bayiye yeni doğrulama e-postası gider.
- **Şifre değiştirme** (bayi ve admin): mevcut şifre denemeleri hesap bazında sayılır, giriş eşiğiyle aynı sınır (dakikada `AUTH_RATE_LIMIT_PER_MINUTE`); kilitliyken 429. Başarıda kullanılmamış şifre sıfırlama bağlantıları geçersiz olur.
- **Hızlı sipariş eşleşmesi**: barkod ve kod karşılaştırması büyük/küçük harf duyarsız (SQL `lower()`). Önce aktif barkod eşleşmesi, yoksa aktif kod eşleşmesi. Bir anahtar birden çok aktif ürüne uyarsa satır hatası `AMBIGUOUS`. Yalnızca pasif ürün uyuyorsa `INACTIVE`. Hata kodları: `NOT_FOUND | INACTIVE | INVALID_QUANTITY | AMBIGUOUS`.
