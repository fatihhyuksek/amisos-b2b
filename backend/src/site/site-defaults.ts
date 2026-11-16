// Site ayarlarının varsayılanları (K-73). Kayıt yoksa bu değerler döner; Admin panelinden değiştirilince
// site_settings tablosundaki değer geçerli olur. İletişim bilgileri K-64'ten.
// Sayfa gövdesi biçimi: boş satır = paragraf, "## " = alt başlık, "- " = madde. HTML yok.

export const PAGE_SLUGS = ['hakkimizda', 'sss', 'teslimat', 'kvkk', 'kullanim-kosullari'] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

export interface SiteContact {
  phone: string;
  phoneE164: string | null;
  whatsappE164: string | null;
  email: string;
  address: string;
  city: string;
  workingHours: string | null;
  mapUrl: string | null;
}

export interface SitePage {
  slug: PageSlug;
  title: string;
  body: string;
  published: boolean;
}

/** Varsayılan içerikler kod tarafında oluşturulduğu için "güncelleme" zamanı olarak sabit bir tarih döner. */
export const DEFAULTS_UPDATED_AT = '2026-11-16T00:00:00.000Z';

export const DEFAULT_ANNOUNCEMENT = 'Toptan satış portalı · Fiyatlar KDV hariçtir';

export const DEFAULT_CONTACT: SiteContact = {
  phone: '0552 492 50 58',
  phoneE164: '+905524925058',
  whatsappE164: '+905524925058',
  email: 'info@amisosb2b.com',
  address: 'İSTOÇ Z Blok No: 91',
  city: 'İstanbul',
  workingHours: 'Hafta içi 09:00 – 18:30, Cumartesi 09:00 – 14:00',
  mapUrl: null,
};

const DRAFT_NOTE =
  'TASLAK — hukuk onayı bekliyor. Bu metin bilgilendirme amaçlı bir taslaktır; yayın öncesinde hukuk danışmanı tarafından gözden geçirilecektir.';

const HAKKIMIZDA = `Amisos Züccaciye, İstanbul İSTOÇ'ta faaliyet gösteren bir toptan züccaciye firmasıdır. Mutfak eşyaları ve dekorasyon ürünlerinde geniş bir çeşidi perakende satış noktalarına, mağazalara ve kurumsal alıcılara toptan olarak ulaştırıyoruz.

AMİSOS B2B, bayilerimizin ürünleri ve kendilerine özel fiyatları görüp ön sipariş verebildiği toptan sipariş portalıdır. Portal üzerinden ödeme alınmaz; verdiğiniz ön sipariş ekibimiz tarafından incelenir, sizinle görüşülerek netleştirilir.

## Ne sunuyoruz?

- Mutfak eşyaları: tabak, bardak, kupa, tencere, saklama kapları ve günlük kullanım ürünleri
- Dekorasyon ürünleri: vazo, mumluk, çerçeve, sunum ve hediyelik eşyalar
- Koli bazında toptan satış ve bayiye özel iskonto
- Düzenli yenilenen ürün çeşidi

## Nasıl çalışıyoruz?

Ürünlerimizi giriş yapmadan inceleyebilirsiniz. Fiyatları ve stok durumunu görmek ve sipariş vermek için bayi hesabı gerekir. Bayi olmak için başvuru formunu doldurmanız yeterlidir; başvurunuz ekibimiz tarafından değerlendirilir.

Sorularınız için çalışma saatlerimiz içinde telefon veya WhatsApp ile bize ulaşabilirsiniz. Mağazamız ve ofisimiz İSTOÇ Z Blok No: 91 adresindedir.`;

const SSS = `## Nasıl bayi olurum?

Sitenin üst bölümündeki "Bayi Başvurusu" bağlantısından başvuru formunu doldurun. Firma unvanınızı, yetkili adınızı, telefon, e-posta ve adres bilgilerinizi girmeniz gerekir; vergi dairesi ve vergi numarası isteğe bağlıdır. E-posta adresinizi doğruladıktan sonra başvurunuz ekibimize iletilir.

Başvurular genellikle 2 iş günü içinde değerlendirilir. Onaylandığında e-posta adresinize şifrenizi belirleyeceğiniz bir bağlantı gönderilir.

## Fiyatlar KDV hariç mi?

Evet. Portalda gösterilen tüm fiyatlar KDV hariçtir. Sepetinizde ve siparişinizde KDV tutarı ayrıca gösterilir; genel toplam KDV dahil tutardır.

## Fiyatları neden göremiyorum?

Fiyat, iskonto ve stok bilgileri yalnızca giriş yapmış bayilere gösterilir. Giriş yapmadan ürünleri, görselleri ve açıklamaları inceleyebilirsiniz. Bayi değilseniz başvuru yapabilirsiniz.

## Ön sipariş nedir? Ödemeyi portalda mı yapıyorum?

Portal üzerinden verdiğiniz sipariş bir ön sipariştir. Ödeme portalda alınmaz. Siparişiniz ekibimize ulaşır, ekibimiz sizinle iletişime geçerek ürünleri, tutarı, teslimatı ve ödeme şeklini netleştirir. Sipariş gönderildikten sonra içeriği sizin tarafınızdan değiştirilemez; değişiklik gerekirse bizimle iletişime geçin.

## Koli katı ne demek?

Ürünler koli bazında satılır. Her ürünün koli içi adedi ürün sayfasında yazar ve sipariş adedi bu sayının katı olmalıdır. Örneğin koli içi 6 olan üründe 6, 12, 18 gibi adetler sipariş verilebilir. Hızlı sipariş ekranında yazdığınız adet koli katına yukarı yuvarlanır ve size bildirilir.

## Hangi teslimat şekilleri var?

Üç teslimat şekli vardır:

- Ambar ile: Ürünler anlaşmalı veya sizin belirttiğiniz ambar/nakliye firmasına teslim edilir. Ambar adı, şube ve adres bilgisini sipariş sırasında girersiniz.
- Bayi kendisi alır: Ürünleri İSTOÇ'taki adresimizden kendiniz teslim alırsınız.
- Tır yüklemesi: Büyük hacimli siparişlerde tır yüklemesi için ekibimizle ayrıca görüşülür.

## Sipariş durumları ne anlama geliyor?

- Gönderildi: Siparişiniz bize ulaştı.
- Görüşülüyor: Ekibimiz sizinle sipariş detaylarını netleştiriyor.
- Onaylandı: Sipariş kesinleşti ve hazırlanıyor.
- Sevk edildi: Ürünler yola çıktı.
- Teslim edildi: Sipariş teslim edildi.
- İptal: Sipariş iptal edildi; iptal gerekçesi sipariş geçmişinde görünür.

Durum değiştikçe e-posta ile bilgilendirilirsiniz.

## İskonto nasıl uygulanıyor?

İskonto bayiye özeldir. Hesabınıza genel bir iskonto oranı ve/veya belirli ürün gruplarına ayrı oranlar tanımlanabilir. Bir ürün için hem genel hem grup oranı varsa yüksek olan uygulanır. Size özel birim fiyatı ürün sayfasında ve sepette görürsünüz; fiyat listesini "Fiyat Listesi" bağlantısından Excel olarak indirebilirsiniz.

## Şifremi unuttum, ne yapmalıyım?

Giriş sayfasındaki "Şifremi unuttum" bağlantısına tıklayın ve kayıtlı e-posta adresinizi yazın. Adresinize 1 saat geçerli bir şifre sıfırlama bağlantısı gönderilir. E-posta gelmediyse gereksiz (spam) klasörünü kontrol edin. Şifreniz en az 8 karakter olmalı; büyük harf, küçük harf ve rakam içermelidir.`;

const TESLIMAT = `Bu sayfa, ön sipariş vermekten teslimata kadar olan süreci özetler.

## Sipariş süreci

- Giriş yapın, ürünleri katalogdan veya hızlı sipariş ekranından sepete ekleyin.
- Sepetinizde adetleri, size özel birim fiyatları ve KDV dahil toplamı kontrol edin.
- Teslimat şeklini seçin, gerekirse sipariş notu ekleyin ve ön siparişi gönderin.
- Ekibimiz siparişinizi inceler ve sizinle iletişime geçer. Durumunu "Siparişlerim" sayfasından takip edebilirsiniz.

Ödeme portalda alınmaz. Ödeme şekli ve vadesi ekibimizle görüşülerek belirlenir.

## Teslimat şekilleri

- Ambar ile: Siparişiniz belirttiğiniz ambar veya nakliye firmasına teslim edilir. Ambar adı, şube ve adres bilgisini sipariş sırasında yazarsınız; sık kullandığınız adresleri hesabınıza kaydedebilirsiniz.
- Bayi kendisi alır: Ürünleri İSTOÇ Z Blok No: 91 adresinden çalışma saatleri içinde teslim alabilirsiniz.
- Tır yüklemesi: Tır ile sevkiyat gerektiren büyük siparişlerde yükleme planı ekibimizle birlikte yapılır.

## Sipariş durumları

Gönderildi, Görüşülüyor, Onaylandı, Sevk edildi, Teslim edildi ve İptal durumları sipariş sayfanızda görünür. Durum değişikliklerinde e-posta ile bilgilendirilirsiniz.

## Stok ve koli

Stokta olmayan ürünler de ön siparişe eklenebilir; bu ürünler sepette ve siparişte ayrıca işaretlenir ve ekibimiz tedarik süresini sizinle paylaşır. Ürünler koli içi adedinin katları olarak sipariş edilir.`;

const KVKK = `${DRAFT_NOTE}

## Veri sorumlusu

Amisos Züccaciye (İSTOÇ Z Blok No: 91, İstanbul), bayi başvurusu ve bayi hesabı kapsamında paylaştığınız kişisel verilerin 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusudur.

## İşlenen veriler

- Kimlik ve iletişim bilgileri: yetkili adı, telefon, e-posta
- Firma bilgileri: firma unvanı, adres, il ve ilçe, vergi dairesi ve vergi numarası
- İşlem bilgileri: sipariş geçmişi, sepet, favori ürünler, kayıtlı teslimat adresleri
- Kullanım bilgileri: giriş zamanı ve oturum kayıtları

## İşleme amaçları

Verileriniz bayilik başvurusunun değerlendirilmesi, hesabınızın yönetilmesi, ön siparişlerin alınması ve takibi, size özel fiyatlandırma ve iskonto uygulanması, iletişim ve bilgilendirme ile yasal yükümlülüklerin yerine getirilmesi amaçlarıyla işlenir. Pazarlama iletişimi yalnızca açık onayınız varsa yapılır ve onayınızı hesabınızdan istediğiniz zaman geri alabilirsiniz.

## Aktarım ve saklama

Verileriniz yasal zorunluluklar dışında üçüncü kişilerle paylaşılmaz. Sipariş ve muhasebe süreçleri için gerekli olduğu ölçüde iş ortaklarımıza ve yazılım hizmet sağlayıcılarımıza aktarılabilir. Verileriniz ilgili mevzuatta öngörülen süreler boyunca saklanır.

## Haklarınız

KVKK'nın 11. maddesi uyarınca verilerinizin işlenip işlenmediğini öğrenme, düzeltilmesini veya silinmesini isteme, işlemeye itiraz etme gibi haklara sahipsiniz. Taleplerinizi info@amisosb2b.com adresine iletebilirsiniz.`;

const KULLANIM_KOSULLARI = `${DRAFT_NOTE}

## Kapsam

Bu koşullar AMİSOS B2B toptan sipariş portalının kullanımını düzenler. Portalı kullanarak bu koşulları kabul etmiş sayılırsınız.

## Bayi hesabı

- Hesap yalnızca ticari amaçla, firmanız adına kullanılabilir.
- Hesap bilgilerinizin doğruluğundan ve şifrenizin gizliliğinden siz sorumlusunuz.
- Başvuru, ekibimizin onayına tabidir; onay vermeme veya hesabı pasife alma hakkımız saklıdır.

## Fiyat ve sipariş

- Fiyatlar KDV hariçtir ve yalnızca giriş yapmış bayilere gösterilir. Bayiye özel fiyat ve iskontolar gizlidir, üçüncü kişilerle paylaşılamaz.
- Portal üzerinden verilen sipariş bir ön sipariştir; ödeme alınmaz. Sipariş, ekibimizin onayıyla kesinleşir.
- Fiyat, stok ve ürün bilgileri önceden haber verilmeden değişebilir. Sipariş gönderildikten sonra sipariş anındaki fiyatlar geçerlidir.
- Ürünler koli içi adedinin katları olarak sipariş edilir.

## Sorumluluk

Portalın kesintisiz çalışması için gayret gösterilir; ancak bakım veya teknik sorunlar nedeniyle oluşabilecek kesintilerden doğan dolaylı zararlardan sorumluluk kabul edilmez.

## Değişiklikler

Bu koşullar güncellenebilir. Güncel metin bu sayfada yayımlanır.

## İletişim

Sorularınız için info@amisosb2b.com adresine yazabilirsiniz.`;

/** Sayfa sırası, menü ve alt bilgide gösterim sırasıdır. */
export const DEFAULT_PAGES: Record<PageSlug, SitePage> = {
  hakkimizda: { slug: 'hakkimizda', title: 'Hakkımızda', body: HAKKIMIZDA, published: true },
  sss: { slug: 'sss', title: 'Sıkça Sorulan Sorular', body: SSS, published: true },
  teslimat: { slug: 'teslimat', title: 'Teslimat ve Sipariş Süreci', body: TESLIMAT, published: true },
  kvkk: { slug: 'kvkk', title: 'KVKK Aydınlatma Metni', body: KVKK, published: true },
  'kullanim-kosullari': {
    slug: 'kullanim-kosullari',
    title: 'Kullanım Koşulları',
    body: KULLANIM_KOSULLARI,
    published: true,
  },
};
