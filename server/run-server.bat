@echo off
title Moyun Huajing - Server
cd /d "%~dp0"
set SPA_DIR=frontend/dist
node server.js
echo.
echo Server stopped. Press any key to close.
pause >nul
