@echo off
REM Amisos B2B gelistirme ortamini baslatir (Windows).
REM Once Docker Desktop acik olmali.
cd /d "%~dp0"
echo Eski sunucular kapatiliyor (port 3000 ve 5173)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000,5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
echo Veritabani baslatiliyor...
docker compose up -d db
if errorlevel 1 (
  echo.
  echo HATA: Veritabani baslatilamadi. Docker Desktop acik mi?
  pause
  exit /b 1
)
if not exist "backend\.env" copy "backend\.env.example" "backend\.env" >nul
if not exist "backend\node_modules" (cd backend && call npm install && cd ..)
if not exist "frontend\node_modules" (cd frontend && call npm install && cd ..)
cd backend
call npm run db:migrate
call npm run db:seed
cd ..
start "Amisos Backend" cmd /k "cd /d %~dp0backend && npm run start:dev"
start "Amisos Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo.
echo Iki pencere acildi (Backend ve Frontend). Onlari KAPATMAYIN.
echo Yaklasik 15 saniye sonra tarayicida acin:
echo   http://localhost:5173/#/yonetim/giris
echo Admin: admin@amisos.local / Admin1234   Bayi: bayi@amisos.local / Bayi1234
pause
