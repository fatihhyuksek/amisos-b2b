# AMİSOS B2B Tasarım Sistemi

Durum: mağaza kimliği uygulandı (K-63, K-64, K-65). Logo dosyası gelene kadar yazı logo kullanılır.
Önizleme: frontend çalışırken `http://localhost:5180/#/tasarim` (sekmeler: Tasarım sistemi, Mağaza bileşenleri,
eski Katalog/Sepet taslakları).

## Kimlik

- **Zemin ve metin:** beyaz zemin, sıcak koyu gri metin (`#2b2a28`), sıcak nötr yüzeyler (`#f6f4f1`).
- **Tek vurgu rengi:** kiremit / bakır (`#a3461f`; koyu temada `#e3956b`). Birincil buton, ARA, seçili kategori,
  iskonto rozeti, sepet sayacı, bağlantılar.
- **Yazı tipi:** Plus Jakarta Sans (SIL Open Font License 1.1), npm `@fontsource/plus-jakarta-sans` **5.3.0**
  (exact) ile uygulamanın içinden sunulur; harici CDN yok. Ağırlıklar 400/500/600/700/800. Tarayıcı yalnızca
  gereken alt kümeyi (latin, latin-ext: ğ ş ı İ) indirir.
- **Logo:** `frontend/src/shop/brand.tsx` içindeki `BrandLogo` ("AMİSOS" kalın + "B2B" vurgu renginde).
  Logo dosyası gelince yalnızca bu bileşen değişir. Favicon: vurgu renginde nötr "A" monogramı.
- **İletişim:** `frontend/src/shop/contact.ts` (K-64). Üst şeritte telefon (`tel:`), alt bilgide telefon,
  WhatsApp (`wa.me`), e-posta ve adres.

### Referans siteden alınanlar / alınmayanlar

İş sahibi bayi vitrininin bir referans e-ticaret sitesinin genel hatlarında olmasını istedi; birebir kopya yapılmadı.

| Alınan genel kalıp | Bizdeki karşılığı |
|---|---|
| İnce koyu üst duyuru şeridi | Sabit (dönmeyen) metin: KDV hariç · koli katı · destek telefonu; telefonda kısa |
| Solda logo, ortada hap arama + buton, sağda ikon + metin bağlantılar | Yazı logo; "Ürün adı, barkod, kod" araması (Enter / ARA, barkod okuyucu uyumlu); Siparişlerim, Hesabım (firma adı + menü), Sepetim (sayaç) |
| Altta yatay kategori menüsü | Sığan kadar grup + "Tüm kategoriler" açılır menü; telefonda hamburger çekmece |
| Büyük, yuvarlak köşeli kampanya alanı | Banner carousel (K-65); banner yokken görselsiz duyuru kartı |
| Görselli kategori kutucukları | Grubun ilk görselli ürününün küçük resmi, yoksa ikon |
| Ortalanmış bölüm başlığı + ürün kartları | "Katalogdan ürünler" (bkz. açık sorular: en yeni sıralaması) |
| Ürün kartı: kare görsel, sol üst hap rozet, üst satır, ad, kalın fiyat, sağ alt küçük ikon buton | Rozetler: Stokta yok / %iskonto; üst satır barkod; koli içi adedi; KDV hariç etiketi; 44 px "sepete ekle" |
| Güven şeridi (4 kutu) + çok sütunlu alt bilgi | B2B'ye uyarlanmış dört madde; Bayi işlemleri, Yardım, Yasal, İletişim |

Alınmayanlar: referansın adı, logosu, görselleri, kampanya metinleri, marka renkleri (bizim vurgu daha kırmızı-toprak
tonunda ve tek renk), özel yazı tipi, dönen duyuru metni, otomatik kayan slider, favori/karşılaştırma ikonları,
sosyal medya ve dil/para birimi seçimi, sohbet balonu.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `frontend/src/styles/tokens.css` | Tüm renk, yazı, boşluk, köşe ve gölge değerleri (tek kaynak), açık + koyu tema |
| `frontend/src/styles/base.css` | Sıfırlama, gövde, başlıklar, odak halkası, hareket azaltma |
| `frontend/src/styles/components.css` | Genel bileşenler (`ui-` ön ekli) |
| `frontend/src/styles/catalog.css` | Admin katalog, görsel kütüphanesi, raporlar |
| `frontend/src/styles/shop.css` | Mağaza kabuğu ve vitrin: şerit, başlık, hap arama, kategori menüsü, çekmece, kampanya, kutucuklar, ürün kartı, katalog, ürün detayı, alt bilgi |
| `frontend/src/pages/ShopLayout.tsx` | Mağaza kabuğu |
| `frontend/src/pages/HomePage.tsx` · `CatalogPage.tsx` · `ProductDetailPage.tsx` | Bayi ana sayfası (`/`), katalog (`/katalog?q=&grup=`), ürün detayı (`/urun/:id`) |
| `frontend/src/shop/` | `BrandLogo`, `contact.ts`, `useBanners` + `PromoCarousel`, `cartCount` (sepet sayacı bağlamı), `useCatalogGroups` |
| `frontend/src/ui/catalog.tsx` | `ProductImage`, `ProductCard`, `ProductCardSkeleton`, `ErrorAlert` |
| `frontend/src/design/` | Önizleme sayfası ve taslaklar |

## İlkeler

1. **Hız önce gelir.** Başlıktaki arama her sayfada; barkod okuyucu Enter gönderir, tam barkod tek ürünü getirir
   (GR-URN-003). Kartın tamamı tıklanabilir; sepete ekleme butonu kartta (sepet bağlanınca tek tık).
2. **Önce mobil.** 360 piksel ve üzerinde sayfa yatay kaymaz (ölçüldü: 360, 390, 1440 px'de `scrollWidth = clientWidth`).
   Telefonda katalog 2 sütun kart; kategori kutucukları ve grup çipleri yalnızca kendi şeritlerinde yatay kayar.
3. **Erişilebilirlik.** WCAG AA kontrast; görünür odak halkası; "İçeriğe geç"; tüm dokunma hedefleri en az 44 px;
   açılır menüler Esc ile kapanır ve odağı geri verir; çekmece yerel `<dialog>` (modal); hareket azaltma tercihinde
   geçiş ve kayma animasyonları kapanır.
4. **Açık ve koyu tema.** Sistem tercihi izlenir; önizlemeden elle seçilebilir.
5. **Fiyat dürüstlüğü.** Fiyat her yerde "KDV hariç" etiketli (GR-FIY-003). İskontoda liste fiyatı üstü çizili,
   oran rozet olarak görünür (K-10). Tutarlar backend'den gelir, arayüz hesaplamaz. Stok yalnızca Var / Yok (GR-URN-002).
6. **Sabit oranlı görseller.** Kart ve galeri 1:1, kategori kutucuğu 1:1, banner 3:1 (telefonda 4:3): yerleşim kayması yok.

## Belirteçler

| Grup | Değerler |
|---|---|
| Köşe | `--radius-sm` 8 · `--radius-md` 12 (buton, alan) · `--radius-lg` 16 (kart) · `--radius-xl` 24 (kampanya) · `--radius-full` (hap) |
| Gölge | `--shadow-sm` · `--shadow-md` (kart hover) · `--shadow-lg` (açılır menü, çekmece); sıcak gri, düşük yoğunluk |
| Yazı | 12 / 14 / 16 / 18 / 22 / 28 / 36 px; ağırlık 400–800 |
| Boşluk | 4 px ızgara: `--space-1` … `--space-16` |
| Genişlik | Mağaza `--shop-max` 86rem; Admin `--content-max` 76rem |

## Kontrast ölçümleri (WCAG 2.x oranı)

| Çift | Açık | Koyu |
|---|---|---|
| Metin / zemin | 14,34 | 15,76 |
| Metin / gömük yüzey | 13,06 | 16,28 |
| İkincil metin / zemin | 6,29 | 8,29 |
| İkincil metin / gömük yüzey | 5,73 | 8,56 |
| İkincil metin / hover yüzey | 5,43 | 6,86 |
| İkincil metin / yumuşak vurgu (duyuru kartı) | 5,44 | 6,49 |
| Vurgu üstü metin / vurgu (buton, ARA, iskonto rozeti) | 6,08 | 7,71 |
| Vurgu üstü metin / vurgu hover | 7,98 | 9,22 |
| Vurgu (bağlantı) / zemin | 6,08 | 7,68 |
| Vurgu metni / yumuşak vurgu (seçili kategori) | 6,73 | 7,93 |
| Başarılı / yumuşak (Stokta var) | 5,42 | 7,02 |
| Uyarı / yumuşak (Stokta yok) | 6,75 | 7,95 |
| Hata / yumuşak | 5,75 | 7,06 |
| Bilgi / yumuşak | 5,98 | 7,61 |
| Şerit metni / şerit zemini | 12,73 | 15,55 |
| Odak halkası / zemin (≥ 3:1) | 5,73 | 7,70 |
| Form kenarı / yüzey (≥ 3:1) | 3,69 | 3,54 |

En düşük metin kontrastı açık temada 5,26 (vurgu / yumuşak vurgu), koyu temada 6,49; hepsi AA (4,5:1) üstünde.
Form ve buton kenarı `--color-border-strong` artık 3:1 üstünde (önceki nötr palette 1,9:1 idi).

## Durum etiketleri

| Anlam | Etiket | Ton |
|---|---|---|
| Stok (K-18) | Stokta var / Stokta yok | başarılı / uyarı; kartta yalnız "Stokta yok" hap rozeti |
| İskonto (K-10) | %15 iskonto | vurgu (dolu hap) |
| Sipariş (K-25) | Gönderildi · Görüşülüyor · Onaylandı · Sevk edildi · Teslim edildi · İptal | bilgi · uyarı · başarılı · bilgi · başarılı · hata |

## Bileşenler

Genel: Button, Badge, StockBadge, OrderStatusBadge, Price (`size="lg"`, `hideDiscount`), QuantityStepper
(koli adımlı, `disabled`), Field, Alert, EmptyState, çip, tablo, iskelet, Modal.

Mağaza:
- **ShopLayout:** duyuru şeridi, başlık, kategori menüsü (ölçerek sığdırır; sığmayanlar "Tüm kategoriler"de),
  mobil çekmece, alt bilgi. Yasal ve yardım metinleri yokken "Metin hazırlanıyor" diyaloğu açılır.
- **Sepet sayacı:** `CartCountContext` (varsayılan 0). Sepet bağlanınca uygulama bir Provider ile sarılır.
- **PromoCarousel (K-65):** `useBanners()` tek veri kaynağı; şimdilik boş liste → `AnnouncementCard`.
  Banner: `{ id, imageUrl, mobileImageUrl?, alt, href? }`. Otomatik geçiş yok; oklar, noktalar (44 px),
  ← / → tuşları, dokunmatik kaydırma; görünmeyen slaytlar `inert`.
- **ProductCard:** `onAdd` verilmezse "sepete ekle" butonu ürün detayına gider.
- **Ürün detayı:** 1:1 galeri (oklar, sayaç, küçük resimler, klavye), fiyat kutusu, koli içi ve KDV oranı,
  pasif sepete ekleme alanı ("Sepet yakında açılacak").
- **Yer tutucu sayfalar:** `/sepet`, `/siparislerim` ("Bu bölüm hazırlanıyor"), `/hesabim` (bayi adı, e-posta, Çıkış).

## Açık sorular

- **Logo dosyası:** gelirse SVG tercih edilir (açık ve koyu zemin sürümleri).
- **Banner yönetimi (K-65):** Admin ekranı ve uç (ör. `GET /api/catalog/banners`, Admin CRUD) tanımlanmalı;
  önerilen görsel oranları 3:1 masaüstü, 4:3 mobil; alternatif metin zorunlu; yayın tarih aralığı ve sıra
  istenip istenmediği.
- **"Yeni ürünler":** katalog ucunda en yeni sıralaması yok (ad sırası). `sort=newest` gibi bir parametre gelirse
  ana sayfa bölümü "Yeni ürünler" başlığıyla en yeni 10 ürünü gösterir; şimdilik başlık "Katalogdan ürünler".
- **Grup kapak görseli:** kategori kutucukları için grup başına ayrı istek atılıyor (en fazla 12). Gruba kapak
  görseli alanı ya da `GET /api/catalog/groups` yanıtına `thumbUrl` eklenmesi önerilir.
- **Yasal ve yardım metinleri:** KVKK aydınlatma metni, kullanım koşulları, "Sipariş nasıl verilir", "Teslimat
  şekilleri" metinleri ve sayfaları.
- **Çalışma saatleri:** alt bilgide gösterilmesi istenirse.
- **Ürün görselleri:** önerilen oran 1:1, beyaz/açık fon (kart ve galeri 1:1, `contain`).
