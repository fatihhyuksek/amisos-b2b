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

## Sıradaki adım

**Ürün kataloğu ve Admin ürün/fiyat yönetimi** (GR-URN-001…003, K-14 – K-16, K-30 – K-32, K-40):
- Admin: ürün grupları, ürün ekleme/düzenleme (barkod zorunlu ve tekil, kod, koli içi adedi,
  liste fiyatı, KDV oranı, açıklama, görseller), stok durumu (elle Var/Yok), toplu içe aktarma (Excel).
- Admin: bayiye ürün grubu iskontoları (K-12, K-13).
- Bayi: katalog (grup filtresi, ad/barkod arama, görsel, KDV hariç fiyat, iskonto, stok Var/Yok).

## Sonraki adımlar (sırayla)

1. Fiyat ve iskonto hesaplama (GR-FIY-001…003).
2. Sepet ve ön sipariş (GR-SIP-003…005, 007, 008).
3. Sipariş geçmişi, durumlar ve e-posta bildirimleri (GR-SIP-006, GR-BLD-001).
4. Raporlar ve özet ana sayfa (GR-RAP-001…003).
5. **BizimHesap entegrasyonu — ERTELENDİ, UNUTULMAYACAK** (iş sahibi kararı, 2026-11-14):
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
- Marka kimliği: logo, kurumsal renkler, varsa yazı tipi.

## Notlar

- `.claude/agents/` altındaki ajanlar Claude Code oturumu açılırken yüklenir;
  yeni eklenen ajanlar bir sonraki oturumda kullanılabilir.
- Tüm işler `main` branch'inde. Her yeni adım ayrı bir branch'te yapılır ve PR ile `main`'e alınır.
- Eski Spring Boot iskeleti kaldırıldı (geçmişte `79e180e` commit'inde duruyor).
