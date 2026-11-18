# API Sözleşmesi: SEO, Fiyatı Girilmemiş Ürün, BizimHesap Ürün ID'si

Kararlar K-79 – K-83. Hata gövdesi `{ statusCode, message, code?, fields? }`. Yazmalar audit'e.

## 1. Fiyatı girilmemiş ürün (K-79)
- `listPrice = 0` olan aktif ürün "fiyat sorunuz" ürünüdür. Katalog öğesine `priceOnRequest: boolean` (oturumsuzda da döner;
  fiyat gizliyken bile true/false bilinir). Bayi oturumunda fiyat alanları `null` değil `"0.00"` gelebilir; arayüz
  `priceOnRequest` ise fiyat yerine "Fiyat için bize ulaşın" gösterir.
- Sepete ekleme (`PUT /api/cart/...`), hızlı sipariş ve sipariş gönderimi bu ürünleri reddeder: **409** `PRICE_NOT_SET`
  (hızlı siparişte satır hatası `PRICE_NOT_SET`). Sepette zaten varsa (fiyat sonradan 0 yapıldıysa) sepet yanıtında satır
  `priceOnRequest: true` ile işaretlenir ve gönderim **409** `PRICE_NOT_SET` verir.
- Fiyat listesi Excel'inde bu ürünlerde fiyat hücreleri boş, Stok yanında "Fiyat sorunuz".
- Admin ürün listesine `priceMissing=true` filtresi; dashboard `attention.priceMissing` (aktif ve fiyatı 0 olan ürün sayısı).

## 2. BizimHesap ürün ID'si (K-80)
- `products.bizimhesap_id text null` (tekil, null hariç). Admin ürün yanıtı/formu `bizimhesapId`. İçe aktarmada isteğe bağlı
  "BizimHesap ID" sütunu (eşleşme yine barkodla; ID yalnızca yazılır/güncellenir). Ürün Excel dışa aktarmasında sütun.

## 3. SEO (K-82)
### Site geneli — `site_settings` içinde `seo`
`GET/PUT /api/admin/site` gövdesine `seo: { siteTitle (≤70), titleTemplate ("%s | AMİSOS B2B", "%s" içermeli), description (≤170),
keywords (≤255, isteğe bağlı), ogImageMediaId (uuid | null), indexable (bool, varsayılan true), googleAnalyticsId
(^G-[A-Z0-9]{4,12}$ | null), googleSiteVerification (≤100 | null), canonicalBaseUrl (https URL | null) }`.
`GET /api/site` yanıtına `seo` (aynı alanlar, `ogImageUrl` çözülmüş).

### Ürün ve grup
- `products`: `slug text` (tekil, boş olamaz; oluştururken addan üretilir: Türkçe karakterler sadeleştirilir, küçük harf,
  tire; çakışmada `-2`, `-3`), `seo_title (≤70) null`, `seo_description (≤170) null`. Admin ürün gövde/yanıtı:
  `slug, seoTitle, seoDescription`. Slug değişince eski slug `product_slug_redirects` tablosunda tutulur (301 için).
- `product_groups`: `slug`, `seo_title`, `seo_description`, `description (≤1000) null` (grup sayfası tanıtım metni).
- Migration mevcut ürün ve gruplara slug üretir.
- Katalog öğelerine `slug`; gruplara `slug`, `description`. `GET /api/catalog/products/by-slug/:slug` (oturumsuz açık; eski
  slug ise `{ redirectTo: "<yeni slug>" }` ile **200**, bilinmeyen **404**). `GET /api/catalog/groups/by-slug/:slug`.

### Sunucu tarafı (canlı ortam için)
- `GET /sitemap.xml`: ana sayfa, katalog, aktif gruplar (`/katalog/<grupSlug>`), aktif ürünler (`/urun/<slug>`), bilgi sayfaları;
  `lastmod`. `indexable=false` ise yalnızca boş urlset. Taban adres `canonicalBaseUrl` yoksa `APP_URL`.
- `GET /robots.txt`: indexable ise `/yonetim`, `/sepet`, `/hesabim`, `/siparislerim`, `/api` disallow + Sitemap satırı; değilse
  `Disallow: /`.
- `SERVE_FRONTEND_DIR` (ortam değişkeni, isteğe bağlı; canlıda `frontend/dist`) verilirse backend vitrini sunar: `/api`, `/media`,
  `/sitemap.xml`, `/robots.txt` dışındaki GET isteklerinde `index.html` döner ve `<head>` içine sayfaya özel
  `<title>`, meta description, canonical, Open Graph/Twitter etiketleri, `robots` (indexable değilse noindex), GA4 ve Search
  Console doğrulama etiketleri ve JSON-LD (ürün: `Product` ad, görsel, sku=barkod, marka "Amisos", **fiyat yok**;
  ana sayfa: `Organization` + `WebSite` SearchAction) yerleştirilir. Eski ürün slug'ında **301**. Statik dosyalar (assets)
  doğrudan sunulur, uzun önbellek.
- Geliştirmede (vite) vitrin `history` yönlendirmesiyle çalışır; vite zaten tüm yolları `index.html`'e düşürür.

## 4. Bildirim birleştirme (K-83)
Backend değişikliği yok; arayüz `/yonetim/bildirimler` sayfasında "Etkinlikler" (feed) ve "E-posta gönderimleri" (mevcut outbox) sekmeleri.

## Uygulama notları

Alan adları yukarıdaki sözleşmeyle aynıdır; aşağıdakiler belirsiz noktalarda alınan kararlardır.

**Fiyatı girilmemiş ürün (K-79)**
- Sepete ekleme `PUT /api/cart/items/:productId` 409 gövdesi: `{ statusCode, code: "PRICE_NOT_SET", message, productId, name }`. `quantity: 0` (kaldırma) serbest.
- Hızlı sipariş (`POST /api/cart/quick-add`) satır hatası: `{ index, query, code: "PRICE_NOT_SET" }`; diğer satırlar eklenir.
- Sipariş gönderimi 409: `{ code: "PRICE_NOT_SET", message, products: [{ productId, name }], cart }`. Bu kontrol `PRICE_CHANGED` kontrolünden önce yapılır.
- Sepet satırında `priceOnRequest: boolean` (diğer satır alanları aynı; fiyatlar `"0.00"`). Tekrar sipariş (`POST /api/orders/:id/reorder`) fiyatı 0 olan ürünü
  `skipped` içine `reason: "PRICE_NOT_SET"` ile koyar.
- Katalog öğesi: `priceOnRequest`, ayrıca `slug`, `seoTitle`, `seoDescription`, `groupSlug` döner. `price_asc` / `price_desc` sıralamasında fiyatsız ürünler her iki yönde sona düşer.
- Admin `priceMissing=true` = aktif ve liste fiyatı 0 (dashboard sayısıyla aynı tanım; pasifler dahil değil). Ürün Excel dışa aktarması aynı filtreyi kullanır.
- Fiyat listesi Excel'inde fiyat/iskonto hücreleri boş, Stok hücresi "Fiyat sorunuz"; KDV % yazılı kalır.

**BizimHesap ID (K-80)**
- Admin ürün gövdesi/yanıtı `bizimhesapId` (≤100, boş = null). Çakışma: 409 `DUPLICATE_BIZIMHESAP_ID`. Ürün kopyalamada ID kopyalanmaz.
- İçe aktarma başlığı "BizimHesap ID" (takma ad: "BizimHesap Ürün ID"); boşsa mevcut üründe değişmez; dosya içinde veya başka üründe kullanılan ID satır hatasıdır.
  Dışa aktarma sütunu son sütundur (ilk 7 sütun şablonla aynı sırada kalır); şablonda "Ürün kodu"ndan sonra gelir.

**Slug ve SEO (K-82)**
- Slug biçimi `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤100 (otomatik üretilen ≤80). Ürün/grup oluştururken `slug` verilmezse addan üretilir; çakışmada `-2`, `-3`. Elle verilen slug çakışırsa
  409 `DUPLICATE_SLUG`. Ad değişince slug otomatik değişmez. Otomatik üretim, başka ürünlerin eski (yönlendirme) slug'larını da kullanmaz; elle verilen slug başka bir ürünün eski slug'ıyla
  çakışırsa canlı slug kazanır ve o yönlendirme silinir. Slug'ı eskisine geri almak yönlendirmeyi siler.
- Grup slug'ı değişince eski adres için yönlendirme YOKTUR (sözleşmede yalnızca ürün için tanımlı).
- `GET /api/catalog/products/by-slug/:slug`: aktif ürün (aktif grupta) için normal katalog öğesi (fiyat kuralları `GET /api/catalog/products/:id` ile aynı); eski slug ise `200 { redirectTo }`;
  bilinmeyen veya pasif ürün 404. `GET /api/catalog/groups/by-slug/:slug` (aktif grup; içinde ürün olmasa da): `{ id, name, slug, description, seoTitle, seoDescription, productCount, thumbUrl }`.
  `GET /api/catalog/groups` öğelerine de `slug, description, seoTitle, seoDescription` eklendi. Admin grup listesi/yanıtı `slug, seoTitle, seoDescription, description` döner.
- Site `seo`: `PUT /api/admin/site` içinde isteğe bağlı ve KISMİ (verilmeyen alan korunur, isteğe bağlı alanlarda `null` kaldırır). `canonicalBaseUrl` yalnızca `https://alanadi` (yol/sorgu yok, sondaki `/` atılır).
  `ogImageMediaId` var olan bir görsel olmalı (aksi 400, `fields["seo.ogImageMediaId"]`). Yanıtlarda `ogImageMediaId` ve çözülmüş `ogImageUrl` (`/api/media/<id>/large.webp`) birlikte döner.
  Varsayılan: siteTitle "AMİSOS B2B Toptan Züccaciye", titleTemplate "%s | AMİSOS B2B", indexable true.
- Express katmanı (`applyPublicSeo`, `main.ts`'de çağrılır): `/sitemap.xml` ve `/robots.txt` her zaman (SERVE_FRONTEND_DIR olmasa da; `/api` önekli değil) sunulur. Sitemap'e sözleşmedekilere ek olarak
  `/iletisim` ve `/basvuru` girer. `robots.txt` `Allow: /api/media/` içerir (ürün görselleri `/api/media` altından sunulduğundan, `Disallow: /api` görselleri engellemesin diye).
- Vitrin sunumu (`SERVE_FRONTEND_DIR`): `/api` ve `/media` dışındaki, uzantısız GET/HEAD istekleri index.html döner; uzantılı yollar statik dosyadır (`assets/` altı 1 yıl immutable, diğerleri 1 saat). Sayfa durumu:
  `/`, `/katalog`, `/katalog/<aktifGrup>`, `/urun/<aktifÜrün>`, yayımlı bilgi sayfaları, `/iletisim`, `/basvuru` 200 + indexlenebilir; eski ürün slug'ı 301 `/urun/<yeni>`; bilinmeyen/pasif ürün veya grup,
  bozuk kodlama, yayımlanmamış bilgi sayfası 404 (+ noindex, canonical yok; gövde yine index.html, istemci "bulunamadı" gösterir); `/yonetim`, `/sepet`, `/hesabim`, `/siparislerim`, `/giris` ve tanımsız diğer yollar
  200 + `noindex,nofollow` (indexlenmesi istenen yeni herkese açık yollar `backend/src/seo/seo.service.ts` içindeki `STATIC_PUBLIC` listesine eklenmeli). `indexable=false` iken her sayfa noindex.
  Sorgu dizesi canonical'a girmez. Ana sayfa JSON-LD'si `/katalog?q={search_term_string}` arama hedefini kullanır.
- Güvenlik: tüm dinamik değerler HTML özniteliği/metni olarak kaçışlanır; JSON-LD'de `<`, `>`, `&`, U+2028/2029 unicode kaçışına çevrilir (`</script>` kırılır); index.html'e yerleştirmede
  `$&` gibi değiştirme dizileri yorumlanmaz. Fiyat, KDV, iskonto, stok hiçbir meta/JSON-LD alanına girmez (`offers` yok). GA kimliği yalnızca `^G-[A-Z0-9]{4,12}$` ise yazılır.
- Veritabanı: `products.slug` / `product_groups.slug` `NOT NULL DEFAULT ''` + BEFORE INSERT tetikleyicisi (boş slug'a addan tekil slug üretir; eski betikler ve doğrudan SQL de çalışsın diye). Uygulama slug'ı açıkça yazar.

