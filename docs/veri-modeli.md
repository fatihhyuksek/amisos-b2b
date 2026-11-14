# Veri Modeli

Kaynak: `backend/src/database/schema.ts` · Migration: `backend/drizzle/0000_init.sql`, `0002_auth_sessions.sql`
Gereksinimler: `docs/requirements/bayi-hesabi.md`

## Tablolar

| Tablo | İçerik | Kararlar / Gereksinimler |
|---|---|---|
| `admin_users` | Yönetim kullanıcıları (şimdilik tek rol: Admin) | K-42, GR-YON-001 |
| `dealers` | Bayi hesabı: başvuru bilgileri, durum, giriş bilgisi, genel iskonto oranı | K-02 – K-08, K-12, K-35, GR-BAYI-001…008 |
| `auth_tokens` | E-posta doğrulama, şifre sıfırlama, davet bağlantıları (yalnızca özet saklanır) | K-03, K-29, GR-BAYI-007 |
| `sessions` | Sunucu taraflı oturum: token özeti, konu (admin/dealer), bitiş (kayan 7 gün), son görülme | K-29, GR-BAYI-006, GR-BAYI-007 |
| `consents` | KVKK, kullanım koşulları, pazarlama onayları ve metin sürümü | K-45, GR-KVK-001 |
| `product_groups` | Ürün grupları | K-12, K-40 |
| `products` | Ürün: barkod (zorunlu, tekil), kod, koli içi adedi, liste fiyatı, KDV oranı, stok durumu | K-14 – K-16, K-18, K-30 – K-32 |
| `product_images` | Ürün başına birden çok görsel | K-40 |
| `dealer_group_discounts` | Bayiye ürün grubu bazında iskonto | K-12, K-13 |
| `cart_items` | Kalıcı sepet (fiyat tutulmaz, gösterimde hesaplanır) | K-41 |
| `orders` | Ön sipariş: durum, teslimat, KDV hariç toplamlar, BizimHesap aktarım alanları | K-17, K-22, K-25, K-27, K-33, K-36 – K-38 |
| `order_lines` | Sipariş satırı: ürün ve fiyatın sipariş anındaki kopyası, uygulanan iskonto | K-13, K-20, K-21 |
| `order_status_history` | Durum değişiklikleri: kaynak (sistem / Admin / BizimHesap), kim, ne zaman | GR-SIP-006 |
| `audit_log` | Onay, red, pasife alma, koşul değişikliği gibi işlemlerin kaydı | GR-BAYI-002, 006, GR-YON-001 |

## Veritabanında korunan kurallar

Uygulama kodu atlansa bile veritabanı şunlara izin vermez (testler: `backend/test/schema.e2e-spec.ts`):

- Aynı e-posta veya firma unvanıyla ikinci bayi (büyük/küçük harf duyarsız). Reddedilen
  başvurular bu kurala dahil değildir; reddedilen bayi yeniden başvurabilir (K-51).
- Gerekçesiz red.
- Boş veya tekrarlanan barkod; tekrarlanan ürün kodu.
- Koli içi adedi 0; koli katı olmayan sipariş satırı.
- 0–100 aralığı dışında iskonto oranı.
- Ambar ile teslimatta adres, ambar adı veya şubesi eksik sipariş.
- Tutarsız toplamlar (net = brüt − iskonto, genel toplam = net + KDV).
- Kimin yaptığı belli olmayan Admin durum değişikliği.

Durum geçiş kuralları (sırayla ilerleme, İptal) kodda: `backend/src/orders/order-status.ts`.

## Açık sorular

1. **Türkçe karakterlerde tekillik:** Veritabanı `lower()` Türkçe büyük İ/I harflerini
   her zaman doğru küçültmeyebilir. Uygulama, firma unvanı ve e-postayı kaydetmeden önce
   Türkçe kurallarla normalleştirecek (kimlik doğrulama / başvuru adımında).
2. **KDV oranı ürün bazında** tutuluyor; ürün girilirken zorunlu. Varsayılan oran belirlenmedi.
