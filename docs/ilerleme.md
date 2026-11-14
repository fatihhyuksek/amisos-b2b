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

## Sıradaki adım

**Veri modeli** (backend-developer, ardından code-reviewer):
- Tablolar: bayi (başvuru ve hesap durumları), Admin kullanıcı, ürün grubu, ürün
  (barkod tekil, koli içi adedi), liste fiyatı, bayi iskontosu (genel oran ve ürün grubu
  oranı), ön sipariş ve satırları, sipariş durum geçmişi, KVKK onay kayıtları,
  işlem kaydı (audit).
- İlgili gereksinimler: GR-BAYI-001…008, GR-URN-001, GR-FIY-001…002, GR-SIP-004…008,
  GR-KVK-001, GR-YON-001.
- Çıktı: Drizzle şeması, ilk migration, şema testleri.

## Sonraki adımlar (sırayla)

1. Tasarım sistemi ve ana ekran taslakları (ui-ux-designer). Frontend ekranları bu
   sisteme göre yapılır ve her ekran ui-ux-designer tarafından görsel olarak denetlenir.
2. Kimlik doğrulama: bayi ve Admin girişi, e-posta doğrulama, şifre sıfırlama (GR-BAYI-007).
3. Bayi başvurusu ve Admin onay akışı (GR-BAYI-001…006, 008, GR-KVK-001).
4. Ürün kataloğu ve Admin ürün/fiyat yönetimi (GR-URN-001…003).
5. Fiyat ve iskonto hesaplama (GR-FIY-001…003).
6. Sepet ve ön sipariş (GR-SIP-003…005, 007, 008).
7. Sipariş geçmişi, durumlar ve e-posta bildirimleri (GR-SIP-006, GR-BLD-001).
8. BizimHesap entegrasyonu: sipariş aktarımı ve stok (GR-SIP-001…002, GR-URN-002).
9. Raporlar ve özet ana sayfa (GR-RAP-001…003).

## İş sahibinden beklenenler

- BizimHesap desteğinden API token'ı, FirmID ve test hesabı.
- KVKK aydınlatma metni ve kullanım koşulları metinleri.
- Stokta esas alınacak BizimHesap deposu.
- Marka kimliği: logo, kurumsal renkler, varsa yazı tipi.

## Notlar

- `.claude/agents/` altındaki ajanlar Claude Code oturumu açılırken yüklenir;
  yeni eklenen ajanlar bir sonraki oturumda kullanılabilir.
- PR'ların birleştirme sırası: #1, sonra diğerleri.
