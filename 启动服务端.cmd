@echo off
title TwoSpace Server + Tunnel
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\ts\server\start-all.ps1"
echo.
echo Window can be closed - server and tunnel keep running in background.
pause
