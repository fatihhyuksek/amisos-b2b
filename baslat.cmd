@echo off
REM Amisos B2B gelistirme ortamini baslatir (Windows).
REM Once Docker Desktop acik olmali.
cd /d "%~dp0"
echo Portlar kontrol ediliyor (3100 backend, 5180 frontend)...
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3100,5180 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
  echo.
  echo UYARI: 3100 veya 5180 portu kullaniliyor. Amisos zaten acik olabilir.
  echo Acik "Amisos Backend" ve "Amisos Frontend" pencerelerini kapatip tekrar deneyin.
  pause
  exit /b 1
)
echo Veritabani baslatiliyor...
docker compose up -d db
if errorlevel 1 (
  echo.
  echo HATA: Veritabani baslatilamadi. Docker Desktop acik mi?
  pause
  exit /b 1
)
if not exist "backend\.env" copy "backend\.env.example" "backend\.env" >nul
REM Eski portlari yeni portlara tasir: 3000->3100, 5173->5180, veritabani 5432->5433.
powershell -NoProfile -Command "$f='backend\.env'; (Get-Content $f) -replace '^PORT=3000$','PORT=3100' -replace 'localhost:5173','localhost:5180' -replace 'localhost:5432','localhost:5433' | Set-Content $f"
echo Paketler guncelleniyor (yeni eklenen paketler varsa kurulur)...
cd backend
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo HATA: Backend paketleri kurulamadi. Yukaridaki mesaji okuyun.
  pause
  exit /b 1
)
cd ..\frontend
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo HATA: Frontend paketleri kurulamadi. Yukaridaki mesaji okuyun.
  pause
  exit /b 1
)
cd ..
cd backend
call npm run db:migrate
if errorlevel 1 (
  echo.
  echo HATA: Veritabani guncellenemedi. Yukaridaki mesaji okuyun.
  pause
  exit /b 1
)
call npm run db:seed
if errorlevel 1 (
  echo.
  echo HATA: Gelistirme hesaplari hazirlanamadi. Yukaridaki mesaji okuyun.
  pause
  exit /b 1
)
cd ..
start "Amisos Backend" cmd /k "cd /d %~dp0backend && npm run start:dev"
start "Amisos Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo.
echo Iki pencere acildi (Backend ve Frontend). Onlari KAPATMAYIN.
echo Yaklasik 15 saniye sonra tarayicida acin:
echo   http://localhost:5180/#/yonetim/giris
echo Admin: admin@amisos.local / Admin1234   Bayi: bayi@amisos.local / Bayi1234
pause
