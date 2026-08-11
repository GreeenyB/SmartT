@echo off
setlocal
cd /d "%~dp0"
title SmartT Local Dashboard

where node >nul 2>nul
if errorlevel 1 (
  echo [SmartT] Node.js was not found.
  echo Install Node.js 20 or newer, then run this file again.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [SmartT] npm was not found.
  echo Reinstall Node.js with npm, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [SmartT] First run: installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo [SmartT] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo [SmartT] Starting local dashboard...
echo Close this window to stop the local server.
echo.
call npm.cmd run dev -- --open

if errorlevel 1 (
  echo.
  echo [SmartT] The local server stopped with an error.
  pause
)
endlocal
