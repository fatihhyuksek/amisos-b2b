# Proje İlerlemesi

Son güncelleme: 2026-11-14

## Tamamlananlar

1. Repo sıfırlandı. PR: fatihhyuksek/amisos-b2b#1
2. Gereksinim analisti ajanı (`.claude/agents/requirements-analyst.md`). PR: #2
3. Gereksinimler: 50 karar, 27 gereksinim (`docs/requirements/bayi-hesabi.md`). PR: #3
4. BizimHesap API araştırması (`docs/research/bizimhesap-api.md`). PR: #3
5. Teknoloji seçimi: NestJS + React (Vite) + PostgreSQL, Drizzle ORM, decimal.js.
6. Proje iskeleti: `backend/`, `frontend/`, `docker-compose.yml`. Branch: `claude/project-skeleton`
7. Geliştirme ajanları: `backend-developer`, `frontend-developer`, `code-reviewer`,
   `test-engineer`, `solution-architect`, `qa-reviewer`, `ui-ux-designer`
   (`.claude/agents/`). Branch: `claude/dev-agents`
8. Veri modeli: 13 tablo, ilk migration, kısıt ve durum geçişi testleri
   (`docs/veri-modeli.md`). Branch: `claude/data-model`
9. Tasarım sistemi (nötr palet): belirteçler, bileşenler, katalog ve sepet taslakları,
   açık/koyu tema (`docs/design/README.md`, önizleme `#/tasarim`). Branch: `claude/design-system`

## Sıradaki adım

**Kimlik doğrulama** (backend-developer + frontend-developer, ardından code-reviewer):
- Bayi ve Admin girişi (e-posta + şifre), e-posta doğrulama, şifre sıfırlama (1 saat geçerli),
  pasif bayinin girişinin engellenmesi (GR-BAYI-006, GR-BAYI-007, K-29, K-39).
- Giriş ve şifre ekranları tasarım sistemine göre; ui-ux-designer görsel denetimi.

## Sonraki adımlar (sırayla)

1. Bayi başvurusu ve Admin onay akışı (GR-BAYI-001…006, 008, GR-KVK-001).
2. Ürün kataloğu ve Admin ürün/fiyat yönetimi (GR-URN-001…003).
3. Fiyat ve iskonto hesaplama (GR-FIY-001…003).
4. Sepet ve ön sipariş (GR-SIP-003…005, 007, 008).
5. Sipariş geçmişi, durumlar ve e-posta bildirimleri (GR-SIP-006, GR-BLD-001).
6. Raporlar ve özet ana sayfa (GR-RAP-001…003).
7. **BizimHesap entegrasyonu — ERTELENDİ, UNUTULMAYACAK** (iş sahibi kararı, 2026-11-14):
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
- Marka kimliği: logo, kurumsal renkler, varsa yazı tipi.

## Notlar

- `.claude/agents/` altındaki ajanlar Claude Code oturumu açılırken yüklenir;
  yeni eklenen ajanlar bir sonraki oturumda kullanılabilir.
- Tüm işler `main` branch'inde. Her yeni adım ayrı bir branch'te yapılır ve PR ile `main`'e alınır.
- Eski Spring Boot iskeleti kaldırıldı (geçmişte `79e180e` commit'inde duruyor).
