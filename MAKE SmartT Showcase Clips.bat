@echo off
setlocal

set "REPO_DIR=%~dp0"
set "SCRIPT_PATH=%REPO_DIR%apps\dashboard\scripts\showcase\record-showcase.mjs"

if not exist "%SCRIPT_PATH%" (
  echo Showcase recorder not found:
  echo %SCRIPT_PATH%
  exit /b 1
)

pushd "%REPO_DIR%" >nul
node "%SCRIPT_PATH%" all
set "EXIT_CODE=%ERRORLEVEL%"
popd >nul

if not "%EXIT_CODE%"=="0" (
  echo SmartT showcase recording failed.
  exit /b %EXIT_CODE%
)

echo.
echo SmartT showcase clips recorded:
echo %REPO_DIR%apps\dashboard\output\showcase\01_Website_Tour.webm
echo %REPO_DIR%apps\dashboard\output\showcase\02_Dashboard_Tour.webm
exit /b 0
