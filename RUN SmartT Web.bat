@echo off
setlocal
cd /d "%~dp0"
title SmartT Web Launcher

where node >nul 2>nul
if errorlevel 1 (
  echo [SmartT] Node.js was not found. Install Node.js 20 or newer, then run this file again.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [SmartT] npm was not found. Reinstall Node.js with npm, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "apps\website\node_modules\" (
  echo [SmartT] Installing website dependencies...
  pushd "apps\website"
  call npm.cmd install
  if errorlevel 1 (
    popd
    echo [SmartT] Website dependency installation failed.
    pause
    exit /b 1
  )
  popd
)

if not exist "apps\dashboard\node_modules\" (
  echo [SmartT] Installing dashboard dependencies...
  pushd "apps\dashboard"
  call npm.cmd install
  if errorlevel 1 (
    popd
    echo [SmartT] Dashboard dependency installation failed.
    pause
    exit /b 1
  )
  popd
)

echo [SmartT] Starting website on http://localhost:5173
start "SmartT Website" /D "%~dp0apps\website" cmd /k npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort

echo [SmartT] Starting dashboard on http://localhost:5174
start "SmartT Dashboard" /D "%~dp0apps\dashboard" cmd /k npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo [SmartT] Website:  http://localhost:5173
echo [SmartT] Dashboard: http://localhost:5174
echo Close the opened server windows to stop the apps.
echo.
pause
endlocal
