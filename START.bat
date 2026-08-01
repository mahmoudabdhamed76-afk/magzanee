@echo off
chcp 65001 >nul
title Makhzoni - Local Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Download Node.js 22 or newer from https://nodejs.org
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -v') do set NODEV=%%a
set NODEV=%NODEV:v=%
if %NODEV% LSS 22 (
  echo.
  echo   Node.js 22 or newer is required. Found: 
  node -v
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting Makhzoni...
echo   Open: http://localhost:8080
echo   Press Ctrl+C to stop.
echo.
start "" http://localhost:8080
node server.js
pause
