# Amisos B2B

Amisos Züccaciye bayi ön sipariş portalı. Gereksinimler: `docs/requirements/bayi-hesabi.md`.

## Teknoloji

| Katman | Teknoloji |
|---|---|
| Backend | Node.js 22+, TypeScript, NestJS 12 (`backend/`) |
| Frontend | React 19, Vite, TypeScript (`frontend/`) |
| Veritabanı | PostgreSQL 17, Drizzle ORM |
| Para hesapları | `decimal.js` (kayan nokta hatası olmadan, 2 basamak standart yuvarlama) |

## Yerelde çalıştırma

**Windows'ta tek tıkla:** Docker Desktop'ı açın, sonra repo kökündeki `baslat.cmd` dosyasına çift tıklayın.
Veritabanını başlatır, eksik paketleri kurar, migration ve geliştirme hesaplarını hazırlar, backend ve
frontend'i iki ayrı pencerede açar (pencereleri kapatmayın). Adres: http://localhost:5180/#/yonetim/giris

Elle çalıştırmak için:

1. Veritabanını başlat:

   ```bash
   docker compose up -d db
   ```

2. Backend:

   ```bash
   cd backend
   cp .env.example .env
   npm install
   npm run db:migrate
   npm run db:seed
   npm run start:dev
   ```

   Kontrol: http://localhost:3100/api/health → `{"status":"ok","database":"up"}`

3. Frontend (ayrı terminalde):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   http://localhost:5180 açılır. `/api` istekleri backend'e yönlendirilir.

## Komutlar

| Yer | Komut | Ne yapar |
|---|---|---|
| backend | `npm test` | Birim testleri |
| backend | `npm run test:e2e` | Uçtan uca testler. Ayrı `amisos_b2b_test` veritabanını kullanır (yoksa oluşturur; `DATABASE_URL` dev DB'yi gösterse bile adına `_test` eklenir, `TEST_DATABASE_URL` ile değiştirilebilir; adında `_test` yoksa çalışmaz). Kullanıcıda CREATEDB yetkisi gerekir (docker-compose'daki `amisos` süper kullanıcıdır) |
| backend | `npm run lint` | Kod denetimi |
| backend | `npm run db:generate` | Şemadan migration üretir |
| backend | `npm run db:migrate` | Migration'ları veritabanına uygular |
| backend | `npm run db:demo` | Geliştirme veritabanına gerçekçi demo verisi üretir: 8 bayi, 25 ürün, ~210 sipariş (son 14 ay, çeşitli durumlar; sabit tohumlu). Tekrar çalıştırılabilir: önce yalnızca demo kayıtlarını (bayi e-postası `@demo.amisos.local`, barkod `869990…`, grup sırası ≥ 9000) siler. `npm run db:demo -- --clear` yalnızca siler. Demo bayi girişi `bayi1@demo.amisos.local` … `bayi8@…` / `Demo1234`. Yalnızca `NODE_ENV=development` |
| backend | `npm run db:seed` | Geliştirme hesaplarını oluşturur/sıfırlar: `admin@amisos.local` / `Admin1234`, `bayi@amisos.local` / `Bayi1234` (yalnızca development) |
| backend | `npm run admin:create -- --email ... --name "..."` | Gerçek Admin hesabı oluşturur (şifreyi gizli sorar) |
| frontend | `npm run build` | Üretim derlemesi |
| frontend | `npm run lint` | Kod denetimi |

## Not

`backend/.npmrc` içindeki `legacy-peer-deps=true`, npm 10'daki bir bağımlılık çözümleme
hatası yüzünden gerekli. npm 11 ve üzerinde kaldırılabilir.
