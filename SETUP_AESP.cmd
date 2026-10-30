@echo off
setlocal
pushd "%~dp0" >nul 2>&1
if errorlevel 1 exit /b 1
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 LTS first: https://nodejs.org/
  popd
  pause
  exit /b 1
)
node scripts/setup.mjs --install --speech --models
set "AESP_SETUP_EXIT=%ERRORLEVEL%"
echo.
echo Read REQUIREMENTS.md and docs/GETTING_STARTED.md for database and API settings.
popd
pause
exit /b %AESP_SETUP_EXIT%
