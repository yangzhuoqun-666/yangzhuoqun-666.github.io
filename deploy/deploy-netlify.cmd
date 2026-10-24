@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-netlify.ps1" %*
if "%~1"=="" pause
endlocal
