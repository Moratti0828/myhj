@echo off
title Moyun Huajing Launcher
cd /d "%~dp0"

if not exist "frontend\dist\index.html" (
  echo.
  echo [ERROR] frontend\dist\index.html not found.
  echo Build the frontend first:
  echo     cd frontend
  echo     npm install
  echo     npm run build
  echo.
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo.
  echo [ERROR] server dependencies missing.
  echo Run: cd server ^&^& npm install
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting Moyun Huajing...
echo   URL: http://127.0.0.1:3000
echo   Close the "Moyun Huajing - Server" window to stop.
echo.

start "Moyun Huajing - Server" "%~dp0server\run-server.bat"
timeout /t 3 >nul
start "" "http://127.0.0.1:3000"
exit
