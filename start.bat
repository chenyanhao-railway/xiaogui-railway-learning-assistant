@echo off
cd /d "%~dp0"
echo Starting Xiao Gui...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22 or newer, then try again.
  pause
  exit /b 1
)
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173'"
node server.mjs
pause
