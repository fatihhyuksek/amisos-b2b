# AMİSOS B2B Tasarım Sistemi

Durum: logo ve marka renkleri uygulandı (K-63, K-64, K-65). Sayfa tipleri `docs/design/referans-analizi.md`
içindeki genel hatlara göre kuruldu. Önizleme: frontend çalışırken `#/tasarim`.

## Kimlik

- **Logo:** siyah daire, ince altın halka, krem monogram (`docs/design/brand/amisos-logo-orijinal.webp`).
- **Palet (logodan):** siyah `#000` · krem `#f7f3eb` · altın `#f2c78a`. His: sıcak, zarif, ev (züccaciye: mutfak + dekorasyon).
  - Birincil eylem butonları **siyah** (koyu temada **krem**). Arama "ARA", Sepete ekle, Siparişi tamamla.
  - Zemin beyaz; bölümler sıcak **krem** (özet kartı, bilgi kutusu, alt bilgi, filtre seçimi).
  - **Altın yalnızca süs ve ayrıntı:** başlık altı ince çizgi, ortalı başlık süsü, seçili kategori kutucuğu halkası,
    iskonto rozeti yazısı (siyah zemin üstünde), ikon halkaları, üst şerit ayırıcıları. Beyaz üzerinde metin olarak
    kullanılmaz (1,58:1).
  - Metin ve bağlantı için altından türeyen **koyu bronz** `#8a5a1c` (koyu temada `#e7bd82`).
- **Önceki bakır vurgu kaldırıldı.**

### Yazı tipi kararı

| Rol | Yazı tipi | Paket (exact) | Gerekçe |
|---|---|---|---|
| Başlık (vitrin, ≥ 22 px) | Playfair Display 500/600 | `@fontsource/playfair-display` 5.3.0 | Zarif, yüksek kontrastlı serif; züccaciye/dekorasyon hissini verir. Cormorant Garamond'a göre daha kalın gövdeli, 22–40 px'de daha okunur. Türkçe karakterler (latin-ext) var. |
| Gövde, arayüz, sayılar | Plus Jakarta Sans 400–800 | `@fontsource/plus-jakarta-sans` 5.3.0 | Geometrik sans; küçük boyutta, tablolarda ve fiyatlarda net. Logo yazısı da bu yazı tipinde, geniş harf aralığıyla. |

Serif yalnızca mağaza ve giriş sayfalarındaki `h1`, bölüm başlıkları, kampanya ve mega menü başlığında kullanılır.
Ürün adları, fiyatlar, formlar, tablolar ve Admin paneli sans kalır (okunabilirlik). İkisi de SIL OFL 1.1,
uygulamanın içinden sunulur; harici CDN yok.

### Logo kullanımı

- Türevler `frontend/public/brand/` altında: `logo-64/128/256.webp` ve `.png` (köşeleri saydam, yuvarlak),
  `favicon-32.png`, `apple-touch-icon-180.png` (kare). Üretim: `node frontend/scripts/brand-assets.mjs`
  (sharp, varsayılan olarak `backend/node_modules/sharp`).
- Bileşen: `BrandLogo` (`frontend/src/shop/brand.tsx`): monogram + "AMİSOS" (kalın, geniş aralık) + "B2B" (bronz).
  Boyutlar: `sm` 32 px (Admin, çekmece), `md` 44 px (mağaza başlığı), `lg` 64 px (giriş kartı, alt bilgi).
- Telefonda başlıkta kısa biçim: monogram + "AMİSOS".
- Logonun etrafında en az monogram yarıçapı kadar boşluk; renkleri değiştirilmez, döndürülmez.

## Kontrast ölçümleri (WCAG 2.x)

| Çift | Açık | Koyu |
|---|---|---|
| Metin / zemin | 17,36 | 16,48 |
| Metin / krem bölüm | 15,69 | 14,98 |
| İkincil metin / zemin | 7,02 | 8,71 |
| İkincil metin / krem | 6,34 | 7,92 |
| İkincil metin / hover | 5,81 | 7,03 |
| Birincil buton yazısı / buton (krem/siyah; koyuda siyah/krem) | 16,75 | 17,05 |
| Bronz bağlantı / zemin | 5,90 | 10,78 |
| Bronz bağlantı / krem | 5,33 | 9,80 |
| Bronz / hover zemin | 4,89 | 8,45 |
| Seçili metin / seçili zemin (krem-altın) | 6,77 | 9,37 |
| İskonto rozeti (altın / siyah; koyuda siyah / altın) | 11,75 | 11,96 |
| Stokta yok rozeti (uyarı / yumuşak) | 6,75 | 7,95 |
| Stokta var (başarılı / yumuşak) | 5,42 | 7,02 |
| Hata / yumuşak | 5,75 | 7,06 |
| Bilgi / yumuşak | 5,98 | 7,61 |
| Üst şerit ve alt bant (krem / siyah) | 18,97 | 18,97 |
| Şerit ayırıcı (altın / siyah) | 13,31 | 13,31 |
| WhatsApp butonu (beyaz ikon / yeşil) | 5,32 | 5,32 |
| Odak halkası (siyah; koyuda altın) / zemin | 17,36 | 11,96 |
| Form kenarı / zemin (≥ 3:1) | 3,84 | 4,10 |
| Form kenarı / krem (≥ 3:1) | 3,47 | 3,73 |
| Altın süs çizgisi / beyaz | 1,94 (yalnız süs, bilgi taşımaz) | — |

En düşük metin kontrastı 4,89:1 (bronz / hover zemin); hepsi AA (4,5:1) üstünde.

## Belirteçler

`frontend/src/styles/tokens.css` tek kaynak. Yeni: `--color-gold`, `--color-gold-line`, `--color-bronze`,
`--color-badge-bg`, `--color-badge-text`, `--color-whatsapp`, `--font-serif`. `--color-accent*` artık
birincil eylem (siyah/krem) anlamında.
Köşe: 8 / 12 / 16 / 24 / hap. Gölge: sm / md / lg (sıcak, düşük yoğunluk). Boşluk: 4 px ızgara.

## Sayfa tipleri

| Sayfa | Yapı |
|---|---|
| **Kabuk** | Siyah üst şerit (altın ayırıcılar, telefon). Başlık: logo, hap arama + siyah ARA, Siparişlerim, Hesabım (menü), Sepetim (sayaç). Altın ince çizgi. Kategori menüsü + **mega menü** ("Tüm kategoriler": görselli, çok sütunlu, sayılı). Telefonda hamburger çekmece, arama ayrı satırda. Alt bilgi: güven şeridi (telefonda 2 sütun), krem sütunlar (telefonda **akordeon**), siyah alt bant. **Sabit WhatsApp butonu** sağ altta (wa.me, "WhatsApp ile yazın (yeni sekmede açılır)" etiketi); sepet bildirimi onun üstünde açılır; telefonda alt bant WhatsApp butonu kadar boşluk bırakır. |
| **Ana sayfa** `/` | Büyük, yuvarlak köşeli banner carousel (K-65; banner yoksa krem duyuru kartı), görselli kategori kutucukları, krem "Bayilere özel hızlı sipariş" bilgi şeridi, "Yeni ürünler" (sort=newest). |
| **Kategori** `/katalog?grup=&q=&sirala=yeni` | Ev ikonlu breadcrumb, serif başlık + sonuç sayısı, görselli **alt kategori kutucukları** ("Tümü" ilk, logo), solda **daraltılabilir filtre paneli** (Kategoriler: arama kutulu, sayılı), **Sıralama** (Ada göre / En yeni) ve **Görünüm** (3/4 sütun, tercih saklanır), büyük kartlar. Telefonda "Filtrele" ve "Sırala" alttan açılan panelde (`<dialog>`). |
| **Ürün detayı** `/urun/:id` | Breadcrumb; solda **dikey küçük resim şeridi** + büyük görsel (oklar, klavye); telefonda tam genişlik görsel + noktalar + kaydırma. Sağda barkod/kod üst satırı, serif başlık, "Ürün özellikleri" (aşağı kaydırıp açar) ve "Kategorideki diğer ürünler", altın ayırıcı, büyük fiyat + stok, miktar + **geniş siyah Sepete ekle** (sepet işlevi korunur), krem bilgi kutusu (koli içi + iskonto), Ayrıcalıklar (Net fiyat / Koli bazlı / Hızlı destek). Altta akordeonlar (Ürün özellikleri tablosu: Barkod, Ürün kodu, Koli içi adet, KDV oranı, Grup; Teslimat şekilleri) ve "Benzer ürünler" kaydırmalı şerit. |
| **Sepet / Onay / Siparişlerim / Sipariş detayı / Hesabım** | Solda satırlar, sağda **yapışkan krem özet kartı** (üstte altın çizgi), geniş siyah birincil buton. |
| **Giriş / başvuru / davet / şifre** | Krem zemin, beyaz kart, üstte büyük logo, serif başlık, siyah buton. |
| **Admin** | Aynı belirteçler; başlıkta küçük logo + "Yönetim", altın ince çizgi; seçili menü krem-altın zeminde. |

## Referanstan alınan / alınmayan

Alınan genel kalıplar `referans-analizi.md`'de. Alınmayanlar: referansın adı, logosu, görselleri, metinleri, ayırt
edici renkleri, özel yazı tipi, favori/yorum/taksit/kargo kampanyası gibi tüketici öğeleri, dönen şerit metni.

## Erişilebilirlik ve davranış

360 px'de yatay kaydırma yok (ölçüldü: 360/390/1440, açık ve koyu). Tüm dokunma hedefleri ≥ 44 px (satır içi metin
bağlantıları hariç). Odak halkası her yerde görünür; mega menü ve Hesabım Esc ile kapanır ve odağı geri verir;
alttan panel ve çekmece yerel modal `<dialog>`. `prefers-reduced-motion`'da geçiş ve kayma animasyonları kapanır.
Görseller sabit oranlı (1:1 kart ve galeri, 3:1 banner); yerleşim kayması yok.

## Açık sorular

- **Stok süzgeci:** katalog ucunda `stock` süzgeci yok; "Stokta var" filtresi istemcide yapılmadı (sayfalı listede
  yanlış sonuç verir). Backend `stock=in_stock` desteklerse filtre paneline eklenir.
- **Çoklu kategori seçimi:** uç tek `groupId` alıyor; filtre tek seçimli (radyo). Çoklu seçim istenirse uç değişmeli.
- **Grup kapak görseli:** `thumbUrl` gelmiyorsa ikon gösterilir; gruplara bilinçli kapak görseli seçimi istenebilir.
- **Logo dosyası:** vektörel (SVG) sürüm gelirse keskinlik ve boyut için tercih edilir.
- **Yasal ve yardım metinleri** (KVKK, kullanım koşulları, sipariş nasıl verilir) hâlâ "Metin hazırlanıyor".
- **Çalışma saatleri:** bilgi yok; alt bilgide gösterilmiyor.
