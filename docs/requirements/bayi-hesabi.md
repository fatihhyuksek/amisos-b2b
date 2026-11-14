# Amisos B2B – Bayi Hesabı ve Ön Sipariş Gereksinimleri

Durum: Taslak · Son güncelleme: 2026-11-14
Kaynak: İş sahibiyle yapılan karar turları (requirements-analyst rolü)

## 1. Kapsam

Amisos Züccaciye bayi portalı **resmi işlem yapmaz**. Bayi portalda yalnızca
**ön sipariş** oluşturur. Ön sipariş Amisos'un kullandığı **BizimHesap**
programına düşer, süreç bayiyle görüşülerek tamamlanır. Portalda ödeme yoktur.

**Roller (şimdilik):** Sistemi tek bir **Admin** yönetir ve her işlemi yapar
(K-42). Bu dokümanda geçen satış temsilcisi, satış yöneticisi ve finans
adımlarının hepsini şu an Admin yerine getirir. Rol adları, ileride ayrı
kullanıcılara dağıtılabilmesi için süreç adımı olarak korunmuştur.

## 2. Onaylanan kararlar

| ID | Konu | Karar |
|---|---|---|
| K-01 | Portalın amacı | Yalnızca ön sipariş oluşturulur, resmi işlem ve ödeme yoktur. Sipariş BizimHesap'a düşer, ardından görüşmeye geçilir. |
| K-02 | Hesap başlatma | Hibrit: aday portaldan başvurur, hesabı satış temsilcisi açar. |
| K-03 | Başvuru kontrolü | Resmi kontrol yok (GİB sorgusu, belge istenmez). Aynı firma veya e-posta ile ikinci başvuru engellenir. Yalnızca e-posta doğrulaması yapılır. |
| K-04 | Hesap onayı | Satış yöneticisi elle onaylar. Başvuru en geç 2 iş gününde sonuçlanır. |
| K-05 | Hesap açılışı | Hesap asgari bilgiyle açılır. |
| K-06 | Ticari koşullar | Satış temsilcisi önerir, finans onaylar. Onaya kadar bayi standart liste fiyatını görür ve ön sipariş verebilir. |
| K-07 | Kullanıcı sayısı | Her bayi hesabının tek kullanıcısı olur. |
| K-08 | Pasife alma | Satış yöneticisi pasife alır, pasif bayi giriş yapamaz. Yönetici tek tıkla yeniden aktif eder. |
| K-09 | Fiyat görünürlüğü | Fiyatlar yalnızca giriş yapmış bayiye görünür. |
| K-10 | Fiyat bağlayıcılığı | Gösterilen fiyat bağlayıcıdır. Normal bayiler liste fiyatını, özel müşteriler iskontolu fiyatı görür. |
| K-11 | KDV | Fiyatlar KDV hariç gösterilir. |
| K-12 | İskonto tanımı | Müşteriye tek oran ve/veya ürün grubuna göre oran tanımlanabilir. |
| K-13 | İskonto önceliği | İkisi de tanımlıysa yüksek olan oran uygulanır, birleştirilmez. |
| K-14 | Ürün/fiyat kaynağı | Ürünler ve fiyatlar portalda yönetilir. BizimHesap'a yalnızca sipariş gider. |
| K-15 | Ürün eşleştirme | BizimHesap ile barkod ve ürün kodu üzerinden eşleşir. Kod yoksa barkod yeterlidir. |
| K-16 | Barkod | Barkod zorunludur. Barkodsuz ürün portala eklenemez. |
| K-17 | Sipariş aktarımı | Öncelik BizimHesap API entegrasyonu. Entegrasyon olmazsa ekibe bildirim gider, sipariş elle girilir. |
| K-18 | Stok gösterimi | Yalnızca "Var / Yok" gösterilir, adet gösterilmez. |
| K-19 | Stok kaynağı | BizimHesap'tan günde 5–6 kez otomatik alınır. Entegrasyon olmazsa yönetim panelinden elle işaretlenir. |
| K-20 | Stokta olmayan ürün | Sepete eklenebilir. "Tedarik süresi görüşülecek" uyarısı gösterilir. |
| K-21 | Sipariş miktarı | Koli içi adedinin katları halinde sipariş verilir. |
| K-22 | Gönderim sonrası | Gönderilen ön sipariş portalda değiştirilemez ve iptal edilemez. Değişiklik görüşmede yapılır. |
| K-23 | Sipariş geçmişi | Bayi geçmiş ön siparişlerini durumlarıyla görür. |
| K-24 | Durum kaynağı | BizimHesap'tan otomatik alınır. Entegrasyon olmazsa ekip elle günceller. |
| K-25 | Durumlar | Gönderildi → Görüşülüyor → Onaylandı → Sevk edildi → Teslim edildi, ayrıca İptal. |
| K-26 | Bildirimler | Ön sipariş gönderilince ekibe ve bayiye e-posta gider. Her durum değişikliğinde bayiye e-posta gider. |
| K-27 | Teslimat adresi | Teslimat ambarla yapılacaksa adres alınır. Değilse adres görüşmede belirlenir. |
| K-28 | Platform | Önce web (bilgisayar ve telefon tarayıcısına uyumlu). Mobil uygulama sonraki aşamada. |
| K-29 | Giriş | E-posta ve şifre ile giriş. Şifre sıfırlama e-postayla yapılır. |
| K-30 | Barkod tekilliği | Barkod tekildir, aynı barkodla iki ürün kaydedilemez. |
| K-31 | "Yok" eşiği | Stoğu 0 veya daha az olan ürün "Yok" görünür. |
| K-32 | Koli içi adedi | Her üründe zorunludur. Tek satılan ürünlerde değer 1'dir. |
| K-33 | KDV satırı | Ön sipariş özetinde KDV ayrı satırda gösterilir. |
| K-34 | Stok güncelleme saatleri | Mesai saatlerinde (08:00–20:00) yaklaşık 2–2,5 saatte bir. |
| K-35 | Başvuru bilgileri | Zorunlu alanlar: firma unvanı, yetkili adı soyadı, e-posta, telefon, il, ilçe, açık adres. Vergi bilgisi istenmez. |
| K-36 | Teslimat şekilleri | Ambar ile, Bayi kendisi alır, Tır yüklemesi. |
| K-37 | Tır yüklemesi adresi | Adres istenmez, görüşmede belirlenir. |
| K-38 | Ambar adresi | Başvurudaki adres otomatik gelir, bayi değiştirebilir. Ayrıca ambar firmasının adı ve şubesi girilir. |
| K-40 | Ürün kataloğu | Ürün grubuna göre listeleme, ad veya barkodla arama, ürün başına birden çok görsel ve açıklama. |
| K-41 | Sepet | Sepet kalıcıdır, çıkış yapılsa da korunur. Geçmiş sipariş "tekrar sipariş ver" ile sepete kopyalanabilir. |
| K-42 | Yönetim rolleri | Şimdilik tek rol: Admin. Her işlemi yapar. |
| K-43 | Ticari koşul adımı | Tek Admin olduğu için şimdilik Admin ticari koşulları doğrudan belirler (öneri + onay tek adım). |
| K-44 | Tekrar sipariş fiyatı | "Tekrar sipariş ver" güncel fiyatı kullanır. |
| K-45 | KVKK ve koşullar | Başvuruda KVKK aydınlatma metni ve kullanım koşulları için zorunlu onay; pazarlama e-postası için ayrı, isteğe bağlı onay. Metinleri iş sahibi / hukuk danışmanı hazırlar. |
| K-46 | Raporlar | En az: tarih aralığına göre ön siparişler, bayi bazında sipariş sayısı ve toplam tutar, en çok sipariş edilen ürünler, Excel'e aktarma. Ek raporlar K-47'de. |
| K-47 | Ek raporlar | Ürün grubu bazında satış; bayi bazında en çok alınan ürünler, son sipariş tarihi ve uzun süredir sipariş vermeyen bayiler; sipariş durumu dağılımı ve ortalama bekleme süresi; stokta "Yok" iken sipariş edilen ürünler. |
| K-48 | Rapor görünümü | Tablo ve Excel'e ek olarak grafikler (aylık sipariş tutarı trendi, ürün grubu dağılımı) ve panel açılışında özet ana sayfa. |
| K-39 | Süreler ve kurallar | Ön sipariş e-postası en geç 5 dk; BizimHesap aktarımı en geç 15 dk; şifre sıfırlama bağlantısı 1 saat geçerli; satır tutarı 2 basamağa standart yuvarlanır; 360 px ve üzeri ekranda yatay kaydırma olmaz. |

## 3. Gereksinimler

### Bayi hesabı

**GR-BAYI-001 · Hibrit başvuru** · Öncelik: Yüksek · Kararlar: K-02
- Aday portaldan başvuru gönderebilir. Başvuru tek başına hesap oluşturmaz.
- Satış temsilcisi hesabı başvurudan ya da başvuru olmadan davetle açar.
- Kabul: Temsilci onayı olmadan aktif hesap oluşma oranı %0'dır.
- Kabul: Başvuru gönderilince sorumlu ekibe en geç 5 dakika içinde bildirim gider.

**GR-BAYI-002 · Yönetici onayı** · Öncelik: Yüksek · Kararlar: K-04
- Durumlar: Başvuru → Satış yöneticisi onayı → Aktif / Reddedildi.
- Kabul: Onaysız hesabın ön sipariş denemelerinin %100'ü engellenir.
- Kabul: Başvuruların %100'ü 2 iş günü içinde sonuçlanır. Süre dolmadan yöneticiye hatırlatma gider.
- Kabul: Her onay ve redde işlemi yapan, zaman ve (ret ise) gerekçe kaydedilir.

**GR-BAYI-003 · Ticari koşullar** · Öncelik: Yüksek · Kararlar: K-05, K-06
- Kabul: Finans onayı olmadan önerilen koşullar bayiye yansımaz.
- Kabul: Onaya kadar bayi standart liste fiyatıyla ön sipariş verebilir.
- Kabul: Onaydan sonraki ilk ön sipariş yeni koşullarla oluşur. Önceki siparişlerin fiyatı değişmez.

**GR-BAYI-004 · Başvuru kontrolü** · Öncelik: Orta · Kararlar: K-03
- Kabul: Aynı firma unvanı veya aynı e-posta ile ikinci başvuru %100 engellenir.
- Kabul: E-postası doğrulanmamış başvuru onay listesine düşmez.

**GR-BAYI-008 · Başvuru formu** · Öncelik: Yüksek · Kararlar: K-35
- Kabul: Firma unvanı, yetkili adı soyadı, e-posta, telefon, il, ilçe ve açık adres alanlarından biri boşsa başvuru gönderilemez.
- Kabul: E-posta ve telefon biçimi doğrulanır. Geçersiz biçimde başvuru gönderilemez.

**GR-KVK-001 · KVKK ve kullanım koşulları onayı** · Öncelik: Yüksek · Kararlar: K-45
- Kabul: KVKK aydınlatma metni ve kullanım koşulları onay kutuları işaretlenmeden başvuru gönderilemez.
- Kabul: Pazarlama e-postası onayı ayrı ve isteğe bağlıdır, varsayılan olarak işaretsiz gelir. Onay vermeyen bayiye pazarlama e-postası gönderilmez.
- Kabul: Her onay, metnin sürümü ve onay zamanıyla kaydedilir.

**GR-BAYI-005 · Tek kullanıcı** · Öncelik: Orta · Kararlar: K-07
- Kabul: Her bayi hesabına tam olarak bir e-posta (giriş bilgisi) bağlanır.
- Kabul: Bir e-posta birden fazla bayiye bağlanamaz.

**GR-BAYI-006 · Pasife alma ve yeniden aktif etme** · Öncelik: Orta · Kararlar: K-08
- Kabul: Pasif bayinin giriş denemelerinin %100'ü reddedilir. Açık oturumu en geç sonraki işleminde sonlanır.
- Kabul: Pasife alınınca sipariş geçmişi silinmez.
- Kabul: Yönetici tek işlemle yeniden aktif eder. Bayi geçmişiyle birlikte tekrar giriş yapar.
- Kabul: Her iki işlemde işlemi yapan, zaman ve gerekçe kaydedilir.

**GR-BAYI-007 · Giriş ve şifre** · Öncelik: Yüksek · Kararlar: K-29
- Kabul: Giriş e-posta ve şifre ile yapılır.
- Kabul: Şifre sıfırlama bağlantısı yalnızca kayıtlı e-postaya gönderilir ve 1 saat sonra geçersiz olur.

### Fiyat

**GR-FIY-001 · Fiyat görünürlüğü ve bağlayıcılık** · Öncelik: Yüksek · Kararlar: K-09, K-10
- Kabul: Giriş yapmamış kullanıcıya hiçbir sayfada ve veri çağrısında fiyat dönmez. Güvenlik testiyle doğrulanır.
- Kabul: Özel müşteri iskontolu fiyatı, diğer bayiler standart liste fiyatını görür.
- Kabul: Ön siparişteki birim fiyat ekrandaki fiyatla birebir aynıdır ve BizimHesap'a aynı fiyatla aktarılır (fark %0).

**GR-FIY-002 · İskonto hesaplama** · Öncelik: Yüksek · Kararlar: K-12, K-13
- Her üründe müşteri oranı ile ürün grubu oranı karşılaştırılır, yüksek olan uygulanır.
- Kabul: Genel oranı %10, mutfak grubu oranı %15 olan müşteri mutfak ürünlerinde %15, diğerlerinde %10 iskonto alır. Test senaryolarının %100'ü doğru sonuç verir.
- Kabul: Satır tutarı 2 ondalık basamağa standart yuvarlamayla (0,005 → 0,01) yuvarlanır. Toplam, yuvarlanmış satır tutarlarının toplamıdır.

**GR-FIY-003 · KDV gösterimi** · Öncelik: Orta · Kararlar: K-11
- Kabul: Ürün listesinde ve sepette birim fiyatlar KDV hariç gösterilir.

### Yönetim

**GR-YON-001 · Tek Admin rolü** · Öncelik: Yüksek · Kararlar: K-42
- Kabul: Admin hesap onayı, pasife alma/aktif etme, ticari koşullar, ürün/fiyat/stok ve sipariş durumu işlemlerinin tamamını yapabilir.
- Kabul: Bayi kullanıcısı yönetim paneline hiçbir yoldan erişemez (%100 engellenir).
- Kabul: Admin işlemleri kimin yaptığı ve zamanla kaydedilir, böylece ileride roller ayrıldığında geçmiş izlenebilir.

**GR-RAP-001 · Raporlar** · Öncelik: Orta · Kararlar: K-46
- Kabul: Admin tarih aralığına göre ön sipariş listesini; bayi bazında sipariş sayısını ve KDV hariç toplam tutarı; en çok sipariş edilen ürünleri görür.
- Kabul: Her rapor Excel'e aktarılabilir ve aktarılan dosyadaki toplamlar ekrandakiyle birebir aynıdır.
- Açık: Dönem karşılaştırması olup olmayacağı.

**GR-RAP-002 · Ek raporlar** · Öncelik: Orta · Kararlar: K-47
- Kabul: Ürün grubu bazında seçilen dönemde satılan adet ve KDV hariç tutar gösterilir.
- Kabul: Her bayi için en çok alınan ürünler ve son sipariş tarihi gösterilir. Son siparişi `<gün>` günden eski olan bayiler ayrı listelenir.
- Kabul: Her sipariş durumundaki sipariş sayısı ve o durumda ortalama bekleme süresi gösterilir.
- Kabul: Sipariş anında stokta "Yok" olan ürünler, sipariş adedi ve bayi sayısıyla listelenir.

**GR-RAP-003 · Grafikler ve özet ana sayfa** · Öncelik: Orta · Kararlar: K-48
- Kabul: Aylık sipariş tutarı trend grafiği ve ürün grubu dağılım grafiği, aynı dönemin tablo verisiyle birebir tutarlıdır.
- Kabul: Admin paneli açılınca bugünkü ve bu ayki sipariş sayısı ile tutarı ve bekleyen başvuru sayısı gösterilir.

### Ürün ve stok

**GR-URN-001 · Ürün kaydı** · Öncelik: Yüksek · Kararlar: K-14, K-15, K-16
- Ürünler, ürün grupları ve liste fiyatları portal yönetim panelinden yönetilir.
- Kabul: Barkodu boş ürün kaydedilemez (panelde ve toplu içe aktarımda %100).
- Kabul: Liste fiyatı değişikliği kayıttan sonraki ön siparişlerde geçerli olur, önceki siparişler değişmez.

**GR-URN-003 · Ürün kataloğu** · Öncelik: Yüksek · Kararlar: K-40
- Kabul: Bayi ürünleri ürün grubuna göre listeler; ürün adı veya barkodla arar. Tam barkodla arama tek ve doğru ürünü getirir.
- Kabul: Ürüne birden çok görsel ve bir açıklama eklenebilir. Görseli olmayan ürün varsayılan görselle gösterilir.

**GR-URN-002 · Stok gösterimi** · Öncelik: Orta · Kararlar: K-18, K-19
- Kabul: Bayi yalnızca "Var" / "Yok" görür, adede hiçbir yoldan ulaşamaz.
- Kabul: Stok BizimHesap'tan günde en az 5 kez güncellenir.
- Kabul: Entegrasyon devre dışıyken stok durumu panelden elle değiştirilir ve bayi ekranına hemen yansır.

### Sipariş

**GR-SIP-001 · BizimHesap aktarımı** · Öncelik: Yüksek · Kararlar: K-01, K-17
- Kabul: Ön siparişlerin %100'ü BizimHesap'ta en geç 15 dakika içinde görünür. Mükerrer kayıt %0.
- Kabul: Aktarım başarısızsa ekibe bildirim gider, sipariş "elle girilecek" durumunda bekler. Bildirimsiz kalan sipariş olmaz.
- Önkoşul: BizimHesap API'sinin varlığı ve yetenekleri teknik olarak doğrulanmalı.

**GR-SIP-002 · Ürün eşleştirme** · Öncelik: Yüksek · Kararlar: K-15
- Kabul: Her satır BizimHesap'a barkod ve (varsa) ürün koduyla gönderilir.
- Kabul: Eşleşmeyen satır varsa sipariş eksik aktarılmaz. Bildirimde eşleşmeyen barkod yazılır.

**GR-SIP-003 · Stokta olmayan ürüne ön sipariş** · Öncelik: Orta · Kararlar: K-20
- Kabul: "Yok" ürün sepete eklenebilir. Sepette ve özette satır bazında uyarı görünür.
- Kabul: Bu satırlar BizimHesap'a "stokta yok" bilgisiyle aktarılır.

**GR-SIP-004 · Koli katı** · Öncelik: Yüksek · Kararlar: K-21
- Kabul: Koli içi 12 olan üründe 12, 24, 36… kabul edilir. 10 veya 13 girilirse sepet kaydedilmez ve uyarı gösterilir.

**GR-SIP-008 · Kalıcı sepet ve tekrar sipariş** · Öncelik: Orta · Kararlar: K-41
- Kabul: Bayi çıkış yapıp tekrar girdiğinde sepet içeriği aynen korunur.
- Kabul: "Tekrar sipariş ver" geçmiş siparişin satırlarını güncel fiyat ve stok durumuyla sepete ekler. Artık satılmayan ürünler eklenmez ve bayiye listelenir.

**GR-SIP-005 · Gönderim sonrası kilit** · Öncelik: Yüksek · Kararlar: K-22
- Kabul: Gönderilmiş ön siparişte düzenleme ve iptal %100 engellenir (ekranda ve veri çağrılarında).

**GR-SIP-006 · Sipariş geçmişi ve durum** · Öncelik: Orta · Kararlar: K-23, K-24, K-25
- Kabul: Bayi yalnızca kendi siparişlerini görür. Başka bayinin siparişine erişim %100 engellenir.
- Kabul: Her siparişte içerik, tarih, KDV hariç toplam ve güncel durum gösterilir.
- Kabul: Durum yalnızca tanımlı sırayla ilerler. İptal, Teslim edildi dışındaki her adımdan seçilebilir. Geçersiz geçiş %100 reddedilir.
- Kabul: Her durum değişikliği zaman ve kaynakla (BizimHesap / kullanıcı) kaydedilir.

**GR-SIP-007 · Teslimat şekli ve adres** · Öncelik: Orta · Kararlar: K-27, K-36, K-37, K-38
- Kabul: Ön siparişte teslimat şekli seçilmeden sipariş gönderilemez. Seçenekler: Ambar ile, Bayi kendisi alır, Tır yüklemesi.
- Kabul: "Ambar ile" seçilirse başvurudaki adres otomatik doldurulur, bayi değiştirebilir. Adres, ambar firması adı ve şubesi boşsa sipariş gönderilemez.
- Kabul: "Bayi kendisi alır" ve "Tır yüklemesi" seçilirse adres istenmez, siparişte "adres görüşmede belirlenecek" bilgisi yer alır.

### Bildirim ve platform

**GR-BLD-001 · E-posta bildirimleri** · Öncelik: Orta · Kararlar: K-26
- Kabul: Ön sipariş gönderildikten sonra en geç 5 dakika içinde ekibe ve bayiye e-posta gider.
- Kabul: Her durum değişikliğinde bayiye e-posta gider. Gönderilemeyen e-postalar kaydedilir ve yeniden denenir.

**GR-PLT-001 · Web öncelikli platform** · Öncelik: Yüksek · Kararlar: K-28
- Kabul: Portal güncel masaüstü ve mobil tarayıcılarda 360 piksel ve üzeri genişlikte yatay kaydırma olmadan kullanılabilir.
- Mobil uygulama bu aşamanın kapsamı dışındadır.

## 4. Onay bekleyen varsayımlar

V-01 – V-05 onaylandı ve K-30 – K-34 olarak kararlara taşındı. Yok. V-06 ve V-07 onaylandı ve K-43, K-44 olarak kararlara taşındı.

## 5. Açık konular

- BizimHesap API araştırması: sipariş aktarımı, stok ve durum okumanın mümkün olup olmadığı (GR-SIP-001, GR-URN-002, GR-SIP-006).
- BizimHesap sipariş durumlarının portaldaki altı duruma eşlenmesi.
- Raporlarda dönem karşılaştırması (önceki dönem / geçen yıl).
- "Uzun süredir sipariş vermeyen bayi" için gün eşiği.
- KVKK aydınlatma metni ve kullanım koşulları metinlerinin hazırlanması (iş sahibi / hukuk).
