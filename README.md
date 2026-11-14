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

1. Veritabanını başlat:

   ```bash
   docker compose up -d db
   ```

2. Backend:

   ```bash
   cd backend
   cp .env.example .env
   npm install
   npm run start:dev
   ```

   Kontrol: http://localhost:3000/api/health → `{"status":"ok","database":"up"}`

3. Frontend (ayrı terminalde):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   http://localhost:5173 açılır. `/api` istekleri backend'e yönlendirilir.

## Komutlar

| Yer | Komut | Ne yapar |
|---|---|---|
| backend | `npm test` | Birim testleri |
| backend | `npm run test:e2e` | Uçtan uca testler (çalışan PostgreSQL gerekir) |
| backend | `npm run lint` | Kod denetimi |
| backend | `npm run db:generate` | Şemadan migration üretir |
| backend | `npm run db:migrate` | Migration'ları veritabanına uygular |
| frontend | `npm run build` | Üretim derlemesi |
| frontend | `npm run lint` | Kod denetimi |

## Not

`backend/.npmrc` içindeki `legacy-peer-deps=true`, npm 10'daki bir bağımlılık çözümleme
hatası yüzünden gerekli. npm 11 ve üzerinde kaldırılabilir.
