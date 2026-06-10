@echo off
setlocal
chcp 65001 >nul
set "PYTHONUTF8=1"
set "APPDIR=%~dp0"
set "WORKSPACE=%APPDIR%workspace"
set "SERVICE=%APPDIR%app\scripts\run_service.py"
set "PORT=8876"
set "URL=http://127.0.0.1:%PORT%/"

if not exist "%WORKSPACE%" mkdir "%WORKSPACE%"
if not exist "%WORKSPACE%\generated" mkdir "%WORKSPACE%\generated"
del "%WORKSPACE%\generated\report-data.json" >nul 2>nul
del "%WORKSPACE%\generated\report-data.js" >nul 2>nul

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  start "Order Analytics Service" /min python "%SERVICE%" --workspace "%WORKSPACE%" --port %PORT% --no-open
)

powershell -NoProfile -Command "for ($i = 0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 1" >nul 2>nul
if errorlevel 1 (
  echo Order analytics service did not start.
  echo Try running this command manually:
  echo python "%SERVICE%" --workspace "%WORKSPACE%" --port %PORT% --no-open
  pause
  exit /b 1
)

start "" "%URL%"
