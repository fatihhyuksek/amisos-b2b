# Veri Modeli

Kaynak: `backend/src/database/schema.ts` · Migration: `backend/drizzle/0000_init.sql`, `0002_auth_sessions.sql`, `0004_catalog.sql`, `0005_banners.sql`, `0006_notification_outbox.sql`
Gereksinimler: `docs/requirements/bayi-hesabi.md`

## Tablolar

| Tablo | İçerik | Kararlar / Gereksinimler |
|---|---|---|
| `admin_users` | Yönetim kullanıcıları (şimdilik tek rol: Admin) | K-42, GR-YON-001 |
| `dealers` | Bayi hesabı: başvuru bilgileri, durum, giriş bilgisi, genel iskonto oranı | K-02 – K-08, K-12, K-35, GR-BAYI-001…008 |
| `auth_tokens` | E-posta doğrulama, şifre sıfırlama, davet bağlantıları (yalnızca özet saklanır) | K-03, K-29, GR-BAYI-007 |
| `sessions` | Sunucu taraflı oturum: token özeti, konu (admin/dealer), bitiş (kayan 7 gün), son görülme | K-29, GR-BAYI-006, GR-BAYI-007 |
| `consents` | KVKK, kullanım koşulları, pazarlama onayları ve metin sürümü | K-45, GR-KVK-001 |
| `product_groups` | Ürün grupları; ad tekilliği `name_key` (Türkçe küçültülmüş, boşlukları sadeleştirilmiş ad) ile | K-12, K-40 |
| `products` | Ürün: barkod (zorunlu, tekil), kod, koli içi adedi, liste fiyatı, KDV oranı, stok durumu | K-14 – K-16, K-18, K-30 – K-32 |
| `media` | Görsel kütüphanesi: dosya adı, tür, boyut, genişlik/yükseklik, yükleyen Admin. Dosyalar diskte `MEDIA_DIR/<id>/{thumb,large}.webp` | K-61, K-62 |
| `product_images` | Ürün başına sıralı görseller (`media_id` → `media`, silme kısıtlı; `sort_order`) | K-40, K-62 |
| `dealer_group_discounts` | Bayiye ürün grubu bazında iskonto | K-12, K-13 |
| `banners` | Ana sayfa kampanya görselleri: `media_id` (restrict), başlık, bağlantı (yalnızca uygulama içi yol), sıra, aktiflik, yayın aralığı | K-65 |
| `cart_items` | Kalıcı sepet (fiyat tutulmaz, gösterimde hesaplanır) | K-41 |
| `orders` | Ön sipariş: durum, teslimat, KDV hariç toplamlar, BizimHesap aktarım alanları | K-17, K-22, K-25, K-27, K-33, K-36 – K-38 |
| `order_lines` | Sipariş satırı: ürün ve fiyatın sipariş anındaki kopyası, uygulanan iskonto | K-13, K-20, K-21 |
| `order_status_history` | Durum değişiklikleri: kaynak (sistem / Admin / BizimHesap), kim, ne zaman | GR-SIP-006 |
| `notification_outbox` | E-posta kuyruğu: tür, alıcı, payload (jsonb), durum (pending/sent/failed), deneme sayısı, son hata, sonraki deneme zamanı. Token'lı bağlantı gönderilince veya 24 saat sonra payload'dan silinir | GR-BLD-001, K-17, K-26, K-39 |
| `audit_log` | Onay, red, pasife alma, koşul değişikliği gibi işlemlerin kaydı | GR-BAYI-002, 006, GR-YON-001 |

## Veritabanında korunan kurallar

Uygulama kodu atlansa bile veritabanı şunlara izin vermez (testler: `backend/test/schema.e2e-spec.ts`):

- Aynı e-posta (büyük/küçük harf duyarsız) veya aynı firma unvanıyla ikinci bayi. Unvan tekilliği
  `dealers.company_title_key` sütunundadır: Türkçe yerelle küçültülmüş, iç boşlukları tek boşluğa
  indirilmiş unvan (`companyTitleKey()`, `backend/src/dealers/company-title.ts`; "ÖRNEK ZÜCCACİYE" ile
  "Örnek  Züccaciye" aynı anahtarı üretir, noktalama aynen kalır). Migration 0003 mevcut satırları
  aynı sonucu veren SQL ile doldurur (testle doğrulanır). Reddedilen başvurular bu kurala dahil
  değildir; reddedilen bayi yeniden başvurabilir (K-51).
- 24 saat içinde e-postasını doğrulamayan (`pending_email`) başvurular e-posta/unvanı kilitlemez:
  aynı e-posta/unvanla yeni başvuruda ve günlük temizlikte (consents ve token'larıyla) silinir.
- Gerekçesiz red.
- Boş veya tekrarlanan barkod; tekrarlanan ürün kodu.
- Aynı adla (Türkçe büyük/küçük harf ve boşluk duyarsız) ikinci ürün grubu (`product_groups.name_key`, migration 0004 mevcut satırları aynı SQL ile doldurur).
- Bir ürüne bağlı görselin silinmesi (`product_images.media_id` restrict); aynı görselin aynı ürüne iki kez eklenmesi.
- Banner bağlantısı `/` ile başlamayan, `//` veya şema/ters eğik çizgi/boşluk içeren değer; bitişi başlangıçtan önce olan banner.
- Koli içi adedi 0; koli katı olmayan sipariş satırı.
- 0–100 aralığı dışında iskonto oranı.
- Ambar ile teslimatta adres, ambar adı veya şubesi eksik sipariş.
- Tutarsız toplamlar (net = brüt − iskonto, genel toplam = net + KDV).
- Kimin yaptığı belli olmayan Admin durum değişikliği.

Bildirimler: tüm e-postalar iş transaction'ında `notification_outbox`'a yazılır (transaction geri alınırsa e-posta da yoktur), commit sonrası denenir, başarısızsa dakikada bir çalışan iş (advisory lock) en fazla 8 kez yeniden dener. Migration `0006_notification_outbox.sql`.

Admin sipariş yönetimi: `orders.transfer_reference` (BizimHesap belge no) ve `orders.transferred_by` (elle girişi işaretleyen Admin) migration `0007_order_transfer_manual.sql` ile eklendi. Durum değişikliği satır kilidiyle yapılır, `order_status_history` ve audit_log'a yazılır, bayiye outbox e-postası gider. API: `docs/api/admin-siparis-api.md`.

Raporlar: salt okunur SQL toplamları (`src/reports/`, `docs/api/rapor-api.md`); `orders(submitted_at) WHERE status <> 'cancelled'` kısmi indeksi (migration `0009_report_partial_index.sql`; 0008'deki bileşik indeks kaldırıldı). Demo verisi: `npm run db:demo` (README).

Sepet/sipariş davranışı (şema değişmedi, migration yok): sipariş gönderimi bayi bazında `pg_advisory_xact_lock` ile
sıralanır (çift gönderim tek sipariş); sipariş satırı birim fiyatı saklanmaz, `unit_list_price` ve `discount_percent`'ten
türetilir. API: `docs/api/siparis-api.md`.

Durum geçiş kuralları (sırayla ilerleme, İptal) kodda: `backend/src/orders/order-status.ts`.

## Açık sorular

1. **E-posta tekilliği:** E-posta ASCII kabul edilir (`lower()`); ASCII dışı e-posta adresleri için
   ayrı normalleştirme yok. (Firma unvanı sorunu `company_title_key` ile çözüldü.)
2. **KDV oranı ürün bazında** tutuluyor; ürün girilirken zorunlu. Varsayılan oran belirlenmedi.
