# Amisos B2B Tasarım Sistemi

Durum: taslak, nötr palet. Marka kimliği (logo, renk, yazı tipi) gelince güncellenecek.
Önizleme: frontend çalışırken `http://localhost:5180/#/tasarim`

## Dosyalar

| Dosya | İçerik |
|---|---|
| `frontend/src/styles/tokens.css` | Tüm renk, yazı, boşluk, köşe ve gölge değerleri (tek kaynak) |
| `frontend/src/styles/base.css` | Sıfırlama, gövde, başlıklar, odak halkası, erişilebilirlik yardımcıları |
| `frontend/src/styles/components.css` | Bileşen stilleri (`ui-` ön ekli sınıflar) |
| `frontend/src/ui/components.tsx` | React bileşenleri |
| `frontend/src/ui/format.ts` | Türk lirası, sayı ve yüzde biçimlendirme |
| `frontend/src/design/` | Önizleme sayfası ve ekran taslakları (örnek veriyle) |

## İlkeler

1. **Hız önce gelir.** Barkodla arama, koli adımlı miktar, en az tıklamayla sepete ekleme.
   Süs için hız ve okunabilirlikten ödün verilmez.
2. **Önce mobil.** 360 piksel ve üzerinde yatay kaydırma yok. Telefonda katalog sıkışık
   liste görünümünde, masaüstünde kart ızgarasında.
3. **Erişilebilirlik.** WCAG AA kontrast, klavyeyle kullanım, görünür odak halkası,
   en az 44 piksel dokunma alanı, hareket azaltma tercihine uyum.
4. **Açık ve koyu tema.** Sistem tercihi izlenir; kullanıcı elle de seçebilir.
5. **Fiyat dürüstlüğü.** Fiyat her yerde "KDV hariç" etiketli (K-11). İskontolu fiyatta liste
   fiyatı üstü çizili ve oran görünür (K-10). Tutarlar backend'den gelir, arayüz hesaplamaz.
6. **Tek vurgu rengi.** Birincil eylemler `--color-accent` ile. Marka rengi geldiğinde
   yalnızca `--color-accent*` değerleri değişir.

## Renkler

| Belirteç | Kullanım |
|---|---|
| `--color-bg`, `--color-surface`, `--color-surface-sunken` | Sayfa, kart, gömük alan (görsel yeri, tablo başlığı) |
| `--color-border`, `--color-border-strong` | Ayraç; form ve buton kenarı |
| `--color-text`, `--color-text-muted` | Ana metin; açıklama, barkod, yardımcı metin |
| `--color-accent` (+ `-hover`, `-soft`) | Birincil buton, seçili çip, seçili teslimat |
| `--color-success / warning / danger / info` (+ `-soft`) | Durum etiketleri ve uyarı kutuları |
| `--color-focus` | Klavye odak halkası |

Ölçülen kontrastlar (en düşük): açık tema 5,28:1, koyu tema 6,67:1. Hepsi AA (4,5:1) üstünde.

## Durum etiketleri

| Anlam | Etiket | Ton |
|---|---|---|
| Stok (K-18) | Stokta var / Stokta yok | başarılı / uyarı |
| Sipariş (K-25) | Gönderildi · Görüşülüyor · Onaylandı · Sevk edildi · Teslim edildi · İptal | bilgi · uyarı · başarılı · bilgi · başarılı · hata |

## Bileşenler

Button (birincil, ikincil, sade, tehlike; normal/küçük), Badge, StockBadge, OrderStatusBadge,
Price, QuantityStepper (koli adımlı, koli katı değilse uyarı), Field, Alert, EmptyState,
arama kutusu, çip (filtre), seçim kartı (radio), tablo, iskelet (yükleniyor).

## Ekran taslakları

- **Katalog:** arama (ad/barkod), ürün grubu çipleri, ürün kartı (stok, koli, fiyat, iskonto,
  miktar, Ekle).
- **Sepet:** satırlar (miktar, tutar, stokta yok uyarısı), teslimat seçimi (ambar seçilince
  adres, ambar firması, şube), ön sipariş özeti (ara toplam, iskonto, net, KDV, genel toplam).

Sonraki taslaklar ilgili geliştirme adımlarında: başvuru ve giriş, sipariş geçmişi,
Admin onay kuyruğu, ürün/fiyat yönetimi, raporlar ve özet ana sayfa.

## Açık sorular

- Marka kimliği: logo, kurumsal renkler, yazı tipi.
- Ürün görselleri: fotoğraf oranı ve arka plan (beyaz fon önerilir).
