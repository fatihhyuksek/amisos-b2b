# Referans Analizi ve Tasarım Yönü

İş sahibi, mağaza tarafının bir referans e-ticaret sitesinin **genel hatlarında** olmasını istiyor
(ana sayfa dahil tüm sayfa tipleri). Birebir kopya değil: referansın adı, logosu, görselleri,
kampanya metinleri ve ayırt edici marka renkleri kullanılmaz. Ekran görüntüleri yalnızca geliştirme
sırasında incelendi, repoya konmadı.

## Marka

- Logo: `docs/design/brand/amisos-logo-orijinal.webp` (1254×1254). Siyah daire, ince altın halka,
  krem renkli geometrik monogram.
- Logodan çıkan renkler: siyah `#000000`, krem `#f7f3eb`, altın `#f2c78a`.
- Ürün alanı: züccaciye — mutfak eşyaları ve dekorasyon. His: sıcak, zarif, ev; "premium ama ulaşılabilir".
- Yön: **siyah + krem + altın** üçlüsü. Birincil eylem butonları siyah (referanstaki koyu "Sepete Ekle"
  gibi), zemin beyaz ile sıcak krem bölümler, altın vurgu süs ve ayrıntılarda. Altın beyaz üzerinde
  metin olarak kontrastı yetersizdir; metin/bağlantı için koyu bronz bir ton türetilir ve ölçülür.

## Sayfa tipleri (referanstan alınan genel hatlar)

### Ortak kabuk
- İnce koyu üst şerit; başlıkta solda logo, ortada geniş hap arama + "ARA", sağda ikon+metin bağlantılar.
- Başlık altında yatay kategori menüsü; "Kategoriler" açılır (mega) menüsü.
- Mobil: üst şerit kısa; başlıkta hamburger + logo + ikonlar; arama ayrı satırda tam genişlik.
- Alt bilgi: güven şeridi, çok sütunlu bağlantılar (mobilde akordeon), iletişim ve çalışma saatleri.
- Sağ altta sabit WhatsApp butonu.

### Ana sayfa
- Büyük, yuvarlak köşeli kampanya görselleri (slider); altında görselli kategori kutucukları (yuvarlatılmış kare + etiket).
- Kampanya şeridi (geniş banner), koleksiyon kartları (4 sütun), "Yeni ürünler" ortalanmış başlık + ürün kartları.

### Kategori (liste) sayfası
- Breadcrumb (ev ikonu + "Ana Sayfa > Kategori").
- Üstte görselli **alt kategori kutucukları** ("Tümü" ilk ve seçili).
- Solda **filtre paneli**: daraltılabilir bölümler (ör. ilgili kategoriler — arama kutulu, onay kutuları ve sayıları).
- Liste üstünde **Sıralama** seçici ve **Görünüm** (sütun sayısı) seçici.
- Büyük ürün kartları: kare görsel, sol üstte renkli hap rozet, sağ üstte ikon, alt bilgi.
- Mobil: filtre ve sıralama ekranın altından açılan panellerde.

### Ürün detay sayfası
- Uzun breadcrumb.
- Solda **dikey küçük resim şeridi**, ortada büyük görsel (okları, rozet).
- Sağda: üst satır (marka yerine bizde barkod/kod), büyük başlık, "Ürün Özellikleri" bağlantısı (aşağı kaydırır),
  "Kategorideki Diğer Ürünler" bağlantısı, ayırıcı, büyük fiyat, **miktar seçici + geniş siyah "Sepete Ekle"**,
  açık renkli bilgi kutusu (bizde: koli içi adet ve iskonto bilgisi), "Ayrıcalıklar" kutucukları
  (bizde: KDV hariç net fiyat, koli bazlı sipariş, hızlı destek).
- Altta **akordeonlar**: Ürün özellikleri (tablo: Barkod, Ürün kodu, Koli içi adet, KDV oranı, Grup), Teslimat şekilleri.
- "Tamamlayıcı / benzer ürünler" (aynı gruptan) kaydırmalı ürün şeridi.
- Mobil: görsel tam genişlik, noktalı gösterge; altında bilgi ve geniş buton; akordeonlar.

### Sepet ve sipariş
- Referansın sepet/ödeme akışı tüketiciye yöneliktir; bizde B2B ön sipariş (ödeme yok). Görsel dil
  aynı kalır: sol tarafta satırlar, sağda yapışkan özet kartı, geniş siyah birincil buton.

## B2B'ye özgü farklar
- Fiyatlar her yerde **KDV hariç** etiketiyle; iskontolu fiyatta liste fiyatı üstü çizili.
- Stok yalnızca "Stokta var / Stokta yok".
- Miktar koli adımlı.
- Favoriler, yorumlar, taksit, kargo kampanyası gibi tüketici öğeleri yok.
