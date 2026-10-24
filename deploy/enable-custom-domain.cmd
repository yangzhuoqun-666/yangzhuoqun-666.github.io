@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0enable-custom-domain.ps1" %*
if "%~1"=="" pause
endlocal
