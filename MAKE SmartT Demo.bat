@echo off
setlocal

set "ROOT=%~dp0"
set "DASHBOARD=%ROOT%apps\dashboard"
set "RAW_VIDEO=%DASHBOARD%\output\demo\SmartT_BKI_Demo_Raw.webm"

echo SmartT BKI demo raw capture
echo Dashboard: %DASHBOARD%
echo.

pushd "%DASHBOARD%" >nul
call npm.cmd run demo:record
set "RESULT=%ERRORLEVEL%"
popd >nul

if not "%RESULT%"=="0" (
  echo.
  echo SmartT demo recording failed. See:
  echo %DASHBOARD%\output\demo\demo-run.json
  exit /b %RESULT%
)

echo.
echo SmartT raw demo video:
echo %RAW_VIDEO%
exit /b 0
