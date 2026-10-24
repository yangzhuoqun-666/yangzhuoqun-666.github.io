@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-github.ps1" %*
if "%~1"=="" pause
endlocal
