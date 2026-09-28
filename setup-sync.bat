@echo off
title Configurar Sincronizacion de Memoria IA - TFM
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-sync.ps1"
pause
