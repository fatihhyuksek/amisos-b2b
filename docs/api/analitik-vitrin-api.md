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

## Uygulama notları

Alan adları sözleşmedeki gibidir; aşağıdakiler belirsiz noktalarda verilen kararlardır. Testler: `backend/test/analytics.e2e-spec.ts`.

**Olay toplama (K-84)**
- Uç `JsonOnlyGuard` kullanmaz (sendBeacon `text/plain` gönderir). Yerine: yalnızca `application/json` veya `text/plain` (başka tür 415, gövdesiz/türsüz istek `text/plain` sayılır),
  gövde ≤ 16 KB (413; `Content-Length` ve gerçek bayt sayısı kontrol edilir), `SameOriginGuard` (Origin/Sec-Fetch-Site başlığı varsa `APP_URL`/`CORS_ORIGIN` ile aynı olmalı, aksi 403),
  hız sınırı IP başına dakikada 120 (`EVENTS_RATE_LIMIT_PER_MINUTE`, aşımda 429). Bot/Admin kontrolü gövde okunmadan yapılır (204).
- Bot: UA'da `bot|crawl|spider|preview|headless|slurp|scrapy|lighthouse|pingdom|uptime|monitor|facebookexternalhit|curl|wget|python-requests|httpclient|java|go-http-client|axios|node-fetch|postman|phantomjs`
  geçmesi veya UA'nın boş olması. Admin oturumu çerezden sunucuda çözülür. İkisi de yok sayılır, yanıt yine 204.
- Doğrulama kuralları: bir istekteki tek bir geçersiz olay tüm isteği 400 yapar. `type` yalnızca `page_view|product_view|search|add_to_cart` (`login`/`order_submitted` istemciden 400).
  `product_view` ve `add_to_cart` için `productId` (uuid), `search` için `query` (1–100) zorunlu. `path` "/" ile başlar, "//" ve ters eğik çizgi/kontrol karakteri yok, ≤ 300.
  `sessionKey` 16–64 karakter `[A-Za-z0-9_-]`. İsteğe bağlı alanlar `null` da olabilir.
- Gizlilik: `path`'ten sorgu dizesi ve `#parça` ATILIR (şifre sıfırlama gibi bağlantılarda token olabilir); yalnızca `utm_source` (küçük harf, ≤ 50, `[a-z0-9._-]`) ayrı alınır. `referrer` yalnızca host
  (küçük harf, `www.` atılır; kendi alan adı veya `Host` başlığı ise null). `query` kırpılıp boşlukları tekilleştirilip Türkçe küçük harfe çevrilerek saklanır. IP ve ham User-Agent hiçbir yerde saklanmaz.
- Günlük tuz: `analytics_daily_salts (day date PK, salt, created_at)` tablosunda, bellekte önbellekli; yalnızca bugün/dün saklanır, günlük işte eskileri silinir (günler arası eşleştirme geri dönülmez olur).
  Çok örnekli çalışmada tuz ortaktır (`insert ... on conflict do nothing`). Gün sınırı Europe/Istanbul.
- Sunucu olayları: `login` (path `/giris`) bayi girişinden, `order_submitted` (path `/sepet`, `orderId`) sipariş gönderiminden sonra yazılır; hata iş akışını bozmaz. `netTotal` olaya yazılmaz
  (tabloda sütun yok); siparişten okunur (analitik toplamları `orders` tablosundan, iptal hariç). Oturum anahtarı: istekte geçerli `X-Analytics-Session` başlığı varsa o (frontend isteğe bağlı olarak gönderebilir);
  yoksa sipariş için bayinin son 12 saatteki istemci oturumu; yoksa `srv-<rastgele>` (oturum sayımına girmez).
- `dealer_id` FK `on delete cascade` (bayi silinirse olayları da silinir); `product_id`, `group_id`, `order_id` bilerek FK'sizdir (yazma yükü, bağımsız silme). Olay `id` (bigserial) JSON'da sayı döner.
- Günlük iş: her gün 03:30 (Europe/Istanbul), advisory lock ile tek örnekte, 400 günden eski olayları siler (`AnalyticsRecorder.scheduledCleanup`; test ortamında zamanlayıcı yok, `cleanup()` doğrudan çağrılır).

**Analitik (K-85)**
- Dönem: `from`/`to` YYYY-MM-DD; yalnızca `to` verilirse `from = to - 29 gün`; varsayılan son 30 gün (bugün dahil); en fazla 400 gün (aşımda ve `from > to` ise 400, `fields.from`).
  Önceki dönem hemen önceki eşit uzunluktadır. `percent` önceki 0 ise `null`.
- Ziyaretçi/oturum/sayfa sayımları yalnızca istemci olaylarından (`page_view|product_view|search|add_to_cart`) gelir; `login`/`order_submitted` sayılmaz. `visitors` günlük farklı `visitor_key` toplamı,
  `sessions` ve `dealerVisitors` dönem boyunca farklı değerlerdir (`daily` satırlarında günlük). `orders` ve sipariş tutarları `orders` tablosundan (iptal hariç, rapor servisiyle ortak `SOLD_ORDERS`).
- `conversionRate`: sipariş veren (iptal edilmemiş) oturum / istemci olayı olan oturum, yüzde 1 basamak. Karşılaştırması da aynı biçimde (`percent` = göreli değişim).
- Huni kümülatiftir ("en az bu adıma ulaşan oturum"): `productView` = ürün inceleyen veya sepete ekleyen veya sipariş veren oturum; `addToCart` = sepete ekleyen veya sipariş veren; `order` = sipariş veren. Böylece değerler azalan sırada olur.
- `devices`/`referrers`: oturumun ilk olayındaki cihaz / oturumdaki ilk dış referrer (yoksa "Doğrudan"). `devices[].share` birimi YÜZDEdir (0–100, 1 ondalık basamak; ör. 40 = %40), payda dönemdeki toplam oturum sayısı. `hours`: İstanbul saati, `page_view` sayısı.
- `live`: `activeVisitors` = son 5 dakikada farklı oturum; `activeDealers` bayi başına son olay; `recent` son 20 olay (sunucu olayları dahil); `productName/query/dealerName` yoksa alan hiç dönmez.
- `products`: `viewToCartRate` = sepete ekleme / inceleme yüzde 1 basamak (inceleme 0 ise 0). `limit` en fazla 200. Hem olayı hem satışı olan ürünler listelenir; `sort=ordered` sipariş adedine göre.
- `searches`: `avgResults` 1 basamak (yoksa 0); `zeroResults` yalnızca `resultCount = 0` olan aramalar.
- `dealers`: `items` ve `interestedNoOrder` öğelerinde ayrıca `phone` (bayinin telefonu) döner. En çok 500 satır (oturum sayısına göre). `interestedNoOrder`: dönemde en az 3 FARKLI ürünü inceleyen/sepete ekleyen ve dönemde (iptal hariç) siparişi olmayan bayiler.
- `GET /api/admin/dealers/:id/activity`: bilinmeyen bayi 404, uuid olmayan 400; imleç `id` (artan kimlik, yani kronolojik) üzerindendir; `limit` ≤ 200.
- Dashboard `traffic` dört alanı da tam sayıdır; gün sınırı İstanbul.

**Öne çıkarma (K-86)**
- `isBestSeller`, `sort=popular` ve `highlights` aynı tanımı kullanır: aktif ürün + aktif grup, son 90 gün iptal hariç sipariş adedi > 0. Rozet ilk 20. Sonuçlar bellekte 10 dakika önbelleklenir
  (`PopularityService`; çok örnekli çalışmada her örnek kendi önbelleğini tutar, en fazla 10 dakika fark olabilir). `sort=popular` önbelleksizdir (canlı alt sorgu).
- `ids=`: virgülle ayrılmış uuid (tekilleştirilir, 1–24; geçersiz/24 üstü 400); verilen sırada döner, pasif ürün/grup atlanır; `total` dönenlerin sayısıdır; `sort`/`pageSize` yok sayılır.
- `highlights?limit=` 1–24 (varsayılan 12). `mostViewed` son 30 gün `product_view` sayısı; `trending` son 7 gün / önceki 7 gün (önceki 0 ise 1 sayılır), son 7 günde en az 5 inceleme. Yalnızca aktif ürünler.
  Yanıtta fiyat/ürün verisi yoktur, yalnızca kimlikler.

**Vitrin (K-87)**
- `GET /api/admin/site/home/default` (Admin): sunucunun varsayılan düzeni (kaydedilmez; arayüzde "Varsayılana dön"). `PUT /api/admin/site` gövdesinde `announcement` VERİLMEZSE duyuruya dokunulmaz (`null` kaldırır).
- Duyuru `link` kuralı: uygulama içi yol ("/" ile başlar, "//" değil) veya `https://` adresi; diğer şemalar (`javascript:`, `http:`) 400. (Bölüm `buttonLink` ise yalnızca uygulama içi yoldur.)
- Depolama: `site_settings` anahtarları `home`, `navigation`, `announcements`. `PUT` gövdeyi bütün olarak değiştirir (kısmi güncelleme yok), `site.updated` audit kaydı yazılır; değişmediyse yazılmaz.
  Boş metin / `null` alandan düşer. Kayıtlı yanıt (admin `GET`) çözülmemiş ayardır.
- `home` doğrulama: bölüm `id` 1–64 `[A-Za-z0-9_-]` ve benzersiz; ≤ 20 bölüm; `title` ≤ 80, `subtitle` ≤ 160; bilinmeyen tip ve eksik/geçersiz `config` 400 (`code: VALIDATION`).
  `productShelf`: `limit` 4–24 (varsayılan 12), `layout` varsayılan `grid`, `source=group` için `groupId`, `source=manual` için ≥1 `productIds` (≤ 24). `promoPanel` aynı kaynak alanları + `limit` (varsayılan 8),
  `panelTitle` ≤ 80, `panelText` ≤ 240, `buttonLabel` ≤ 30, `buttonLink` uygulama içi yol. `campaignStrip`: `audience` (varsayılan `all`), `title` ≤ 80, `text` ≤ 240, `buttonLabel` ≤ 30, `buttonLink` uygulama içi yol.
  `howItWorks.audience` varsayılan `guest`. `collections.groupIds` ≤ 4. Bağlantılar "/" ile başlayan yol olmalıdır ("//", `javascript:` vb. reddedilir).
- Varsayılan `home` (kayıt yokken): hero, categoryStrip, campaignStrip(all), collections, productShelf `shelf-new` (new, 5), productShelf `shelf-best` "En çok satanlar" (bestSellers, 5), iconTiles,
  promoPanel `promo-featured` (featured, 8, "Öne çıkan ürünler"), howItWorks(guest), trustStrip. Frontend'in `DEFAULT_SECTIONS` değerleriyle aynı sırada.
- `GET /api/site/home`: yalnızca AÇIK bölümler. Raf/promo bölümlerine `productIds` (çözülmüş, en çok `limit` adet; aktif ürün+grup; `manual` verilen sıra korunur, pasif/bilinmeyen elenir; `new` = son 30 gün,
  yeniden eskiye; `featured` ve `group` ada göre), `collections` bölümünde `config.groupIds` çözülmüş (seçilen aktif gruplar; boşsa en çok aktif ürünlü 4 grup). Aynı kaynak için tek sorgu; fiyat alanı yok.
  `GET /api/site` yanıtındaki `home` kapalı bölümleri çıkarılmış, ÇÖZÜLMEMİŞ ayardır.
- `navigation`: `{ items, isDefault }` döner (`isDefault` sözleşmeye ek alandır). Kayıtlı öğe yoksa varsayılan: aktif gruplar (en çok 10, sıra/ad) + `featured` ("Öne Çıkanlar") + `new` ("Yeni Ürünler"), `label` dolu.
  `GET /api/site`'ta grup öğelerine `label` (verilmediyse grup adı) eklenir ve pasif/silinmiş gruplar düşer; admin `GET` düşürmez. `group` için `groupId`, `link` için `label` (≤ 30) + `href` (yol veya https) zorunlu;
  öğeye yalnızca türüne ait alanlar saklanır.
- `announcements`: `text` 1–120, `link` (yol veya https) isteğe bağlı, ≤ 5 öğe. Eski `announcement` geriye uyumlu: `announcements` yazılmamışsa eski değer (yoksa varsayılan metin) tek öğe olarak okunur (120'ye kırpılır);
  `PUT /api/admin/site/announcements` hem yeni anahtarı hem eski `announcement` alanını (ilk öğenin metni / null) yazar; `GET /api/site` yanıtında `announcement` = ilk öğenin metni (yoksa null);
  eski `PUT /api/admin/site` ile `announcement` değişirse ilk öğenin metni güncellenir, diğer öğeler ve ilk öğenin bağlantısı korunur.
- KVKK varsayılan sayfasına "Ziyaret istatistikleri ve işlem kaydı" paragrafı eklendi (çerezsiz, IP saklanmaz, günlük tuz, bayi işlem kaydı, 400 gün); TASLAK notu korunur. Veritabanında özel metin kaydedilmişse
  değişmez (varsayılan yalnızca kayıt yokken geçerlidir).

**Geliştirme aracı**: `npm run db:analitik-ornek` (yalnızca `NODE_ENV=development`) son 30 günlük örnek olay üretir (`session_key` öneki `sample-`); `-- --clear` yalnızca örnekleri siler.
