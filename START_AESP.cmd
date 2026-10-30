@echo off
setlocal

rem Works when double-clicked or dragged into CMD from any current directory.
pushd "%~dp0" >nul 2>&1
if errorlevel 1 goto folder_error

where node.exe >nul 2>&1
if errorlevel 1 goto node_error
where npm.cmd >nul 2>&1
if errorlevel 1 goto node_error

if /I "%~1"=="--check" goto check_only

set "AESP_OPEN_BROWSER=true"
echo.
echo AESP - Dang mo frontend va backend...
echo Dia chi: http://127.0.0.1:5173
echo Giu cua so nay khi dung app. Bam Ctrl+C de dung.
echo.
call npm run dev
set "AESP_LAUNCH_EXIT=%ERRORLEVEL%"
if not "%AESP_LAUNCH_EXIT%"=="0" (
  echo.
  echo Chua mo duoc AESP. Xem thong bao loi o tren.
  echo Neu cong dang duoc dung, phien dang chay van duoc giu nguyen.
  pause
)
popd
exit /b %AESP_LAUNCH_EXIT%

:check_only
call npm run dev:check
set "AESP_LAUNCH_EXIT=%ERRORLEVEL%"
popd
exit /b %AESP_LAUNCH_EXIT%

:node_error
echo Chua tim thay Node.js hoac npm trong PATH. Hay cai Node.js roi mo lai CMD.
popd
if /I "%~1"=="--check" exit /b 1
pause
exit /b 1

:folder_error
echo Khong mo duoc thu muc du an chua START_AESP.cmd.
if /I "%~1"=="--check" exit /b 1
pause
exit /b 1
