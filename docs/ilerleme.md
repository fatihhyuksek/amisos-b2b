# Proje İlerlemesi

Son güncelleme: 2026-11-14

## Tamamlananlar

1. Repo sıfırlandı; eski Spring Boot kaldırıldı.
2. Gereksinimler: 51 karar, 27 gereksinim (`docs/requirements/bayi-hesabi.md`).
3. BizimHesap API araştırması (`docs/research/bizimhesap-api.md`).
4. Teknoloji seçimi: NestJS + React (Vite) + PostgreSQL, Drizzle ORM, decimal.js.
5. Proje iskeleti: `backend/`, `frontend/`, `docker-compose.yml`.
6. Ajanlar (`.claude/agents/`): requirements-analyst, solution-architect, backend-developer,
   frontend-developer, ui-ux-designer, code-reviewer, qa-reviewer, test-engineer.
7. Veri modeli (`docs/veri-modeli.md`).
8. Tasarım sistemi, nötr palet (`docs/design/README.md`, önizleme `#/tasarim`).
   (1–8: PR fatihhyuksek/amisos-b2b#4)
9. Kimlik doğrulama (branch `claude/auth`):
   - Backend: `/api/auth/*` (bayi/Admin girişi, çıkış, `me`, şifre sıfırlama, e-posta doğrulama),
     `sessions` tablosu, argon2id, sunucu taraflı oturum (httpOnly çerez, 7 gün kayan,
     30 gün mutlak), IP + e-posta bazlı hız sınırı, `TRUST_PROXY`, AdminGuard/DealerGuard,
     audit kaydı, `npm run admin:create`.
   - Frontend: `/giris`, `/yonetim/giris`, `/sifremi-unuttum`, `/sifre-sifirla`,
     `/eposta-dogrula`, korumalı karşılama sayfaları.
   - Kod incelemesi yapıldı; bulgular düzeltildi.
   - İş sahibi kararları: K-52 (oturum 7/30 gün), K-53 (şifre: 8 karakter, büyük/küçük harf,
     rakam), K-54 (pasif bayiye açık mesaj), K-55 (doğrulama 24 saat), K-56 (gönderen
     onay@amisosb2b.com). PR: fatihhyuksek/amisos-b2b#5

10. Bayi başvurusu ve Admin onay akışı (branch `claude/dealer-onboarding`):
   - Başvuru formu (K-35), KVKK/koşul/pazarlama onayları (sürümlü), e-posta doğrulama,
     doğrulanmamış başvurunun 24 saat sonra düşmesi.
   - Admin: ana sayfa özeti, bayi listesi (filtre, arama, sayfalama), bayi detayı (onay, ret
     gerekçesi, pasife alma, aktif etme, daveti yeniden gönderme, genel iskonto, onaylar, geçmiş),
     davetle bayi oluşturma.
   - Davetle şifre belirleme + KVKK/koşul onayı (K-57); tek tıkla yeniden aktif etme (K-58).
   - E-postalar: doğrulama, davet, ret, yeni başvuru bildirimi (doğrulamada), günlük hatırlatma
     (yaklaşan + gecikmiş, Türkiye saati).
   - Ürün grubu iskontoları katalog adımına bırakıldı.

11. Ürün kataloğu ve fiyatlandırma (branch `claude/catalog`):
   - Admin: ürünler (filtre, hızlı stok Var/Yok), ürün formu, ürün grupları, görsel kütüphanesi
     (toplu yükleme, kütüphaneden seçme), Excel şablonu ve içe aktarma (kontrol + hep-ya-hiç),
     bayiye ürün grubu iskontoları.
   - Bayi: katalog (grup, ad/barkod arama, iskontolu KDV hariç fiyat, stok Var/Yok), ürün detayı.
   - Fiyat: genel ve grup iskontosundan yüksek olan (K-13), 2 basamak yuvarlama; sipariş satırı
     için `dealerLineNet` hazır (miktar × yuvarlanmış birim fiyat).
   - Kararlar: K-59 – K-62.

12. Sepet, ön sipariş, mağaza tasarımı ve kampanya görselleri (branch `claude/cart`):
   - Sepet (koli katı, canlı fiyat, stokta yok uyarısı), ön sipariş onayı (teslimat şekli, ambar
     alanları), fiyat/içerik değişince yeniden onay (expectedTotal + expectedVersion), çift
     gönderim koruması, Siparişlerim ve tekrar sipariş ver.
   - E-posta kuyruğu (outbox): tüm e-postalar kayda yazılır, gönderilemezse tekrar denenir; Admin
     "Bildirimler" sayfası.
   - Mağaza tasarımı: logo, siyah-krem-altın kimlik, referans sitenin tüm sayfa tiplerinin genel
     hatları (`docs/design/referans-analizi.md`), WhatsApp butonu, iletişim bilgileri (K-63, K-64).
   - Kampanya görselleri (banner) Admin'den yönetilir (K-65).
   - Katalog: en yeni sıralaması, stok filtresi, grup görselleri.
   - e2e testleri ayrı `_test` veritabanı kullanır.

13. Admin sipariş yönetimi (branch `claude/admin-orders`):
   - Sipariş listesi (durum sekmeleri, arama, tarih, bayi, BizimHesap'a girilmedi filtresi, Excel),
     detay (bayi iletişim, satırlar, KDV ayrı toplamlar), durum değiştirme (bayiye görünür not,
     iptalde zorunlu gerekçe, bayiye e-posta), durum geçmişi.
   - BizimHesap'a elle giriş (K-17 yedek yolu): satırları kopyala, sipariş Excel'i, "girildi"
     işareti (referans, kim, ne zaman); geri alma "elle girilecek" yapar (mükerrer aktarım yok).
   - Admin ana sayfa sipariş kartları; bayi detayında son siparişler; bayi tarafında "Amisos notu".

## Sıradaki adım

**Raporlar ve özet ana sayfa** (GR-RAP-001…003, K-46 – K-50):
- Tarih aralığına göre ön siparişler; bayi bazında sipariş sayısı ve tutar; en çok sipariş edilen
  ürünler; ürün grubu bazında satış; bayi bazında en çok alınan ürünler, son sipariş tarihi, 60 gündür
  sipariş vermeyen bayiler; durum dağılımı ve ortalama bekleme; stokta yokken sipariş edilen ürünler.
- Grafikler (aylık tutar trendi, grup dağılımı), önceki dönem ve geçen yıl karşılaştırması, Excel.

## Sonraki adımlar (sırayla)

1. **BizimHesap entegrasyonu — ERTELENDİ, UNUTULMAYACAK** (iş sahibi kararı, 2026-11-14):
   - Ön sipariş aktarımı (`addinvoice`) ve ürün eşleştirme (GR-SIP-001, GR-SIP-002).
   - Stok "Var/Yok" bilgisini günde 5–6 kez çekme (GR-URN-002, K-19, K-34).
   - Önkoşullar: API token'ı, FirmID, test hesabı; kaydın sipariş mi fatura mı
     oluştuğunun doğrulanması; stokta esas alınacak depo (`docs/research/bizimhesap-api.md`).
   - Veri modelinde hazır alanlar: `orders.transfer_status`, `bizimhesap_guid`,
     `transfer_error`, `transferred_at`; `products.stock_source`.
   - O zamana kadar: siparişler `transfer_status = pending` kalır, ekip e-postayla
     haberdar olur ve BizimHesap'a elle girer; stok ve durum Admin panelinden elle güncellenir.

## İş sahibinden beklenenler

- BizimHesap desteğinden API token'ı, FirmID ve test hesabı.
- KVKK aydınlatma metni ve kullanım koşulları metinleri.
- Stokta esas alınacak BizimHesap deposu (BizimHesap adımında).
- onay@amisosb2b.com e-posta adresinin kurulması ve SMTP bilgileri (K-56).
- Logo dosyası (şimdilik yazı logo "AMİSOS B2B", K-63).

## Notlar

- `.claude/agents/` altındaki ajanlar Claude Code oturumu açılırken yüklenir;
  yeni eklenen ajanlar bir sonraki oturumda kullanılabilir.
- Tüm işler `main` branch'inde. Her yeni adım ayrı bir branch'te yapılır ve PR ile `main`'e alınır.
- Eski Spring Boot iskeleti kaldırıldı (geçmişte `79e180e` commit'inde duruyor).
