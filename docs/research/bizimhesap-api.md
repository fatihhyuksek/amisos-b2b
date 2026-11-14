# BizimHesap API Araştırması

Tarih: 2026-11-14
Kaynak: Resmî entegrasyon dokümanı, https://apidocs.bizimhesap.com (GitBook, sayfaların
son güncellemesi yaklaşık 7 yıl önce). Bu notlar yalnızca dokümanda yazanlara dayanır;
gerçek bir hesapla test edilmemiştir.

## 1. Dokümanda bulunan servisler

| Servis | Adres | Amaç |
|---|---|---|
| Sipariş / Fatura Ekleme | `https://bizimhesap.com/api/b2b/addinvoice` | Alış veya satış sipariş/faturası ekler |
| Ürün Listesi Alma | `https://bizimhesap.com/api/b2b/products` | Kayıtlı ürünleri getirir |
| Depoların Listesi Alma | `https://bizimhesap.com/api/b2b/warehouses` | Kayıtlı depoları getirir |
| Depo Stoğu Getirme | `https://bizimhesap.com/api/b2b/inventory/{depo-id}` | Bir deponun stoklarını getirir |

Dokümanda bu dört servis dışında servis yok.

## 2. Kimlik doğrulama

- Ürün, depo ve stok servisleri iki başlık (header) ister:
  - `Key`: dokümanda yazan sabit B2B anahtarı.
  - `Token`: hesaba ait token. BizimHesap hesabından alınır.
- `addinvoice` gövdede `FirmID` ister: "BizimHesap tarafından verilecek özel tekil ID".
- Token'ın ve FirmID'nin nasıl alınacağı dokümanda anlatılmıyor. BizimHesap desteğine sorulmalı.

## 3. Sipariş / Fatura Ekleme (`addinvoice`) ayrıntıları

- `InvoiceType`: 3 = Satış, 5 = Alış.
- Müşteri bilgisi: kaynak sistemdeki ID, unvan, adres; vergi dairesi, vergi no, e-posta ve telefon isteğe bağlı.
- Satır bilgisi: kaynak sistemdeki ürün ID'si, ürün adı, barkod (isteğe bağlı), KDV oranı,
  miktar, birim fiyat, brüt, indirim, net, vergi, toplam. Satır notu isteğe bağlı.
- Tutar bilgisi: para birimi (TL, USD, EUR, CHF, GBP), brüt, indirim, net, vergi, toplam.
- Tarih: fatura tarihi, vade, teslimat tarihi (isteğe bağlı).
- Açıklama alanı (`Note`) var.
- Yanıt: `error` boşsa başarılı; `guid` ve kayda ait `url` döner.
- **Önemli:** Gönderilen müşteri veya ürün BizimHesap'ta yoksa **otomatik oluşturulur**.

## 4. Portal kararlarına etkisi

| Konu | Karar | Bulgu | Sonuç |
|---|---|---|---|
| Ön siparişi aktarma | K-17, GR-SIP-001 | `addinvoice` var | **Mümkün görünüyor.** Ancak kaydın BizimHesap'ta "sipariş" mi yoksa "fatura" olarak mı oluştuğu dokümanda net değil. Bu, resmi işlem yapmama kararıyla (K-01) çelişebilir. Test hesabıyla doğrulanmalı. |
| Ürün eşleştirme | K-15, GR-SIP-002 | Satırda kaynak ürün ID'si ve isteğe bağlı barkod var. Ürün yoksa otomatik oluşturuluyor. | **Risk:** Eşleşmeyen ürün BizimHesap'ta yeni ve mükerrer bir ürün olarak açılabilir. Gönderimden önce ürün listesi servisiyle barkod kontrolü yapılmalı. Eşleşmeyen satır gönderilmemeli (GR-SIP-002 ile uyumlu). |
| Bayi eşleştirme | – | Müşteri kaynak ID ile gönderiliyor, yoksa oluşturuluyor | Portal bayi ID'si sabit tutulmalı. Mevcut BizimHesap carisiyle nasıl eşleşeceği test edilmeli. |
| Stok okuma | K-19, GR-URN-002 | Depo listesi ve depo stoğu servisleri var | **Mümkün görünüyor.** Hangi depo(lar)ın esas alınacağına karar verilmeli. |
| Sipariş durumu okuma | K-24, GR-SIP-006 | **Servis yok** | Otomatik durum güncellemesi şimdilik mümkün değil. K-24'teki yedek yol uygulanır: Admin durumu panelden elle günceller. |
| Durum eşlemesi | Açık konu | Durum okunamıyor | Bu açık konu şimdilik geçersiz. |
| KDV hariç fiyat, iskonto | K-11, K-13 | Satırda KDV oranı, indirim ve net ayrı alanlar | Portal hesapladığı iskontoyu ve neti satır bazında gönderebilir. |
| Teslimat bilgisi | K-27, K-36 – K-38 | Ayrı teslimat şekli alanı yok | Teslimat şekli, ambar adı ve şubesi `Note` alanına yazılabilir. |

## 5. Dokümanda olmayanlar ve tutarsızlıklar

- HTTP metotları (GET/POST) yazmıyor.
- Ürün, depo ve stok servislerinin yanıt biçimleri boş. Hangi alanların (barkod, ürün kodu, miktar) döndüğü bilinmiyor.
- Hata kodları, istek sınırı (rate limit), sürümleme ve ücret bilgisi yok.
- Örnek istekte alan adları tablodan farklı (`customers` / `customer`, `DeliveryData` / `deliveryDate`). Sayılar `"2,400.00"` gibi metin olarak yazılmış.
- Bazı adresler `http://` ile verilmiş. `https` kullanılmalı.
- Doküman yaklaşık 7 yıldır güncellenmemiş; servislerin hâlâ aynı çalıştığı doğrulanmalı.

## 6. Önerilen sonraki adımlar

1. BizimHesap desteğinden API erişimi istenmeli: Token, FirmID ve varsa test hesabı.
2. Destekten sorulmalı:
   - `addinvoice` kaydı satış **siparişi** olarak mı, **fatura** olarak mı oluşturuyor? Sadece sipariş oluşturmak için bir seçenek var mı?
   - Sipariş durumunu okumak için bir servis var mı?
   - Ürün ve stok servislerinin yanıt biçimi nedir?
   - İstek sınırı var mı?
3. Token gelince ürün, depo ve stok servisleri okunarak gerçek yanıt biçimleri kaydedilmeli.
4. Test hesabında tek bir deneme siparişi gönderilip BizimHesap'ta nasıl göründüğü kontrol edilmeli.
