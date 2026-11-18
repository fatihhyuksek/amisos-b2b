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
