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
   - Açık sorular (iş sahibi): oturum süresi, şifre kuralı, pasif bayi mesajı,
     e-posta sağlayıcısı, e-posta doğrulama süresi (24 saat).

## Sıradaki adım

**Bayi başvurusu ve Admin onay akışı** (GR-BAYI-001…006, 008, GR-KVK-001):
- Başvuru formu (K-35), KVKK/koşul/pazarlama onayları, e-posta doğrulama e-postası.
- Admin onay kuyruğu: onay/red (gerekçe), 2 iş günü hatırlatması, pasife alma/aktif etme.
- Davetle hesap açma ve ilk şifre belirleme (`invitation` token).
- Ticari koşullar (genel ve grup iskontosu) Admin tarafından.

## Sonraki adımlar (sırayla)

1. Ürün kataloğu ve Admin ürün/fiyat yönetimi (GR-URN-001…003).
2. Fiyat ve iskonto hesaplama (GR-FIY-001…003).
3. Sepet ve ön sipariş (GR-SIP-003…005, 007, 008).
4. Sipariş geçmişi, durumlar ve e-posta bildirimleri (GR-SIP-006, GR-BLD-001).
5. Raporlar ve özet ana sayfa (GR-RAP-001…003).
6. **BizimHesap entegrasyonu — ERTELENDİ, UNUTULMAYACAK** (iş sahibi kararı, 2026-11-14):
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
- E-posta sağlayıcısı (şifre sıfırlama ve doğrulama e-postaları için).
- Marka kimliği: logo, kurumsal renkler, varsa yazı tipi.

## Notlar

- `.claude/agents/` altındaki ajanlar Claude Code oturumu açılırken yüklenir;
  yeni eklenen ajanlar bir sonraki oturumda kullanılabilir.
- Tüm işler `main` branch'inde. Her yeni adım ayrı bir branch'te yapılır ve PR ile `main`'e alınır.
- Eski Spring Boot iskeleti kaldırıldı (geçmişte `79e180e` commit'inde duruyor).
