# API Sözleşmesi: Analitik, Veriye Dayalı Öne Çıkarma, Yönetilebilir Vitrin

Kararlar K-84 – K-87. Hata gövdesi `{ statusCode, message, code?, fields? }`. Admin uçları AdminGuard, yazmalar audit'e.
Tarihler Europe/Istanbul günü (`from`, `to` = YYYY-MM-DD, dahil; varsayılan son 30 gün; en fazla 400 gün). Karşılaştırmalı
metrikler rapor biçiminde: `{ current, previous, percent | null }` (önceki eşit uzunlukta dönem).

## 1. Olay toplama (K-84)
### `POST /api/events` (herkese açık)
- Gövde `{ sessionKey: string(16–64, [A-Za-z0-9_-]), events: [{ type, path, productId?, groupId?, query?, resultCount?,
  quantity?, referrer?, at? }] }` (1–20 olay). `type`: `page_view | product_view | search | add_to_cart`.
  `path` uygulama içi yol (≤300, "/" ile başlar). `referrer` tam URL olabilir; yalnızca host saklanır, kendi alan adımızsa null.
  `at` istemci zamanı yok sayılır; sunucu zamanı kullanılır.
- `Content-Type: application/json` veya `text/plain` (navigator.sendBeacon) kabul edilir; gövde ≤ 16 KB. Yanıt **204**.
- Sunucu ekler: `dealerId` (bayi oturumu varsa), `visitorKey` = sha256(IP + User-Agent + günlük gizli tuz) ilk 32 hex
  (tuz her gün değişir, saklanmaz → günler arası iz yok), `device` (`mobile|tablet|desktop`, UA'dan), `utmSource` (path'ten).
- Admin oturumu varsa veya UA bot ise (bot|crawl|spider|preview|headless vb.) olay kaydedilmez, yine **204**.
- Hız sınırı: IP başına dakikada 120 istek (aşımda **429**).
- Sunucu tarafı olaylar (istemciden gelmez): `login` (bayi girişi), `order_submitted` (orderId, netTotal). Aynı tabloya.
- Tablo `analytics_events (id bigserial, occurred_at, type, session_key, visitor_key, dealer_id null, path, product_id null,
  group_id null, query null, result_count null, quantity null, order_id null, referrer_host null, device, utm_source null)`,
  indeksler `(occurred_at)`, `(type, occurred_at)`, `(dealer_id, occurred_at)`, `(product_id, occurred_at)`.
- Günlük iş: 400 günden eski olayları siler.

## 2. Analitik uçları (K-85)
- `GET /api/admin/analytics/overview?from&to` →
  `{ period, previous, totals: { visitors, sessions, pageViews, dealerVisitors, productViews, searches, addToCarts, orders,
  conversionRate } (her biri karşılaştırmalı; conversionRate = sipariş veren oturum / oturum, yüzde 1 basamak),
  daily: [{ date, visitors, sessions, pageViews, dealerVisitors, orders }],
  funnel: [{ step: "sessions"|"productView"|"addToCart"|"order", sessions }],
  devices: [{ device, sessions, share }], referrers: [{ host | "Doğrudan", sessions }] (ilk 10),
  topPages: [{ path, pageViews, visitors }] (ilk 15), hours: [{ hour 0–23, pageViews }] }`.
  `visitors` = farklı visitorKey (gün içinde), dönem toplamı günlük farklıların toplamıdır (açıklama arayüzde).
- `GET /api/admin/analytics/live` → `{ activeVisitors (son 5 dk farklı session), activeDealers: [{ dealerId, companyTitle,
  path, lastSeenAt }], recent: [{ type, path, productName?, query?, dealerName?, at }] (son 20) }`.
- `GET /api/admin/analytics/products?from&to&sort=views|addToCart|ordered&limit=50` →
  `{ items: [{ productId, name, barcode, thumbUrl, views, uniqueViewers, addToCarts, orderedQuantity, orderCount,
  viewToCartRate }] }` (orderedQuantity sipariş satırlarından, iptal hariç).
- `GET /api/admin/analytics/searches?from&to` → `{ top: [{ query, count, avgResults }], zeroResults: [{ query, count,
  lastAt }] }` (sorgular küçük harf/kırpılmış birleştirilir; ilk 50).
- `GET /api/admin/analytics/dealers?from&to` → `{ items: [{ dealerId, companyTitle, city, sessions, lastSeenAt,
  productViews, addToCarts, orders, netTotal }] }` + `interestedNoOrder: [...]` (dönemde ≥3 ürün inceleyip ya da sepete
  ekleyip sipariş vermeyenler).
- `GET /api/admin/dealers/:id/activity?before=<id>&limit=50` → `{ items: [{ id, at, type, path, productId, productName,
  query, resultCount, quantity, orderId, orderNo }], nextBefore | null }` (en yeni önce).
- Admin dashboard (`GET /api/admin/dashboard`) yanıtına `traffic: { todayVisitors, todayPageViews, activeNow,
  yesterdayVisitors }`.

## 3. Veriye dayalı öne çıkarma (K-86)
- Katalog ürün öğesine `isBestSeller: boolean` (son 90 gün, iptal hariç sipariş adedine göre aktif ürünlerde ilk 20;
  satışı olmayan ürün asla). Hesap 10 dakika önbelleklenebilir.
- `GET /api/catalog/products` yeni `sort=popular` (son 90 gün satış adedi azalan, eşitlikte ad); `ids=<uuid,…>` (≤24,
  verilen sırayla döner, pasifler atlanır).
- `GET /api/catalog/highlights?limit=12` (herkese açık) → `{ bestSellers: [productId], mostViewed: [productId],
  trending: [productId] }` (trending: son 7 gün inceleme / önceki 7 gün, en az 5 inceleme). Ürün verisi `ids=` ile alınır
  (fiyat görünürlüğü katalog kurallarıyla).

## 4. Yönetilebilir vitrin (K-87)
`site_settings` içinde:
- `home`: `{ sections: [{ id: string, type, enabled, title?, subtitle?, config }] }` — `type` ve `config`:
  - `hero` {} (kampanya görselleri), `categoryStrip` {}, `trustStrip` {}, `howItWorks` { audience },
  - `campaignStrip` { audience: "all"|"guest"|"dealer", title, text, buttonLabel?, buttonLink? (uygulama içi yol) },
  - `collections` { groupIds: uuid[] (≤4; boşsa en çok ürünlü 4 grup) },
  - `productShelf` { source: "bestSellers"|"mostViewed"|"trending"|"new"|"featured"|"group"|"manual", groupId?,
    productIds? (≤24), limit (4–24), layout: "grid"|"carousel" },
  - `promoPanel` { source (productShelf ile aynı), panelTitle, panelText, buttonLabel, buttonLink },
  - `iconTiles` {}.
  En fazla 20 bölüm; `id` istemci üretir. Bilinmeyen tip **400**.
- `navigation`: `{ items: [{ type: "group"|"featured"|"new"|"bestSellers"|"link", groupId?, label?, href? }] }` (≤12).
  Boşsa varsayılan: aktif gruplar + Öne Çıkanlar + Yeni Ürünler.
- `announcements`: `{ items: [{ text (≤120), link? }] }` (≤5) — üst şeritte döner (eski tek `announcement` alanı ilk öğe
  olarak taşınır, geriye uyumlu okunur).
- Uçlar: `GET /api/site` yanıtına `home`, `navigation`, `announcements`; Admin `GET/PUT /api/admin/site/home`,
  `GET/PUT /api/admin/site/navigation`, `GET/PUT /api/admin/site/announcements`. Varsayılan `home` mevcut ana sayfa
  sırasını üretir (hero, categoryStrip, campaignStrip, collections, productShelf new, iconTiles, promoPanel featured,
  howItWorks guest, trustStrip) + "En çok satanlar" rafı.
- `GET /api/site/home` yanıtında raf/promo bölümleri için çözülmüş `productIds` (sunucu kaynağı hesaplar; boşsa bölüm
  arayüzde gizlenir).
