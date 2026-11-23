@echo off
title TwoSpace Backup
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\ts\tools\backup-server.ps1"
echo.
pause
