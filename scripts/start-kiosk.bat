@echo off
setlocal enabledelayedexpansion

rem  MAD SHOT'Z — silent-printing kiosk launcher (Windows)
rem
rem  Chrome only honours --kiosk-printing on a *fresh browser process*. Rather
rem  than making the operator close every other window first, this launches into
rem  a dedicated profile directory, which always forks a new process — so the
rem  flag takes effect even with normal browsing open on the same machine.
rem
rem  Usage:  start-kiosk.bat [url]
rem  With no argument it opens BOOTH_URL below — edit that line to change which
rem  booth this machine loads (a local "npm run dev" server, or the hosted app).

set "BOOTH_URL=%~1"
if "%BOOTH_URL%"=="" set "BOOTH_URL=https://madshotz.vercel.app/"

set "PROFILE_DIR=%LOCALAPPDATA%\MadShotz\KioskProfile"

rem  Copied out first: a "(x86)" in the variable name would close the FOR
rem  block's parenthesis early and break the whole loop.
set "PF=%ProgramFiles%"
set "PF86=%ProgramFiles(x86)%"
set "LAD=%LOCALAPPDATA%"

set "BROWSER="
for %%P in (
  "%PF%\Google\Chrome\Application\chrome.exe"
  "%PF86%\Google\Chrome\Application\chrome.exe"
  "%LAD%\Google\Chrome\Application\chrome.exe"
  "%PF%\BraveSoftware\Brave-Browser\Application\brave.exe"
  "%PF86%\BraveSoftware\Brave-Browser\Application\brave.exe"
  "%LAD%\BraveSoftware\Brave-Browser\Application\brave.exe"
  "%PF86%\Microsoft\Edge\Application\msedge.exe"
  "%PF%\Microsoft\Edge\Application\msedge.exe"
) do (
  if not defined BROWSER if exist %%P set "BROWSER=%%~P"
)

if not defined BROWSER (
  echo.
  echo   Could not find Chrome, Brave or Edge in the usual install locations.
  echo   Edit scripts\start-kiosk.bat and add the full path to your browser.
  echo.
  pause
  exit /b 1
)

echo.
echo   Browser : %BROWSER%
echo   URL     : %BOOTH_URL%
echo   Profile : %PROFILE_DIR%
echo.
echo   Printing goes straight to the WINDOWS DEFAULT PRINTER with no dialog.
echo   Set that printer, and its paper size, in Settings ^> Bluetooth ^& devices ^> Printers.
echo   Press Alt+F4 to leave kiosk mode.
echo.

start "" "%BROWSER%" ^
  --kiosk ^
  --kiosk-printing ^
  --user-data-dir="%PROFILE_DIR%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-session-crashed-bubble ^
  --noerrdialogs ^
  --autoplay-policy=no-user-gesture-required ^
  "%BOOTH_URL%"

endlocal
