@echo off
rem ---------------------------------------------------------------------------
rem  Boton: Reparar la conexion en las apps (QSMANU-LOCAL-SHARED-MCP)
rem  Vuelve a escribir la config del MCP en Claude Desktop, Cursor, Codex,
rem  Antigravity, Kimchi, VS Code, Copilot y DeepSeek Harness (hace backup).
rem  ASCII a proposito: cmd.exe no lee UTF-8.
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0.."

echo.
echo   Esto vuelve a configurar el contexto compartido en todas las apps
echo   detectadas, con backup de cada archivo. Nada se borra.
echo.
choice /c SN /m "  Continuar"
if errorlevel 2 (
  echo   Cancelado.
  echo.
  pause
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "install.ps1"
echo.
pause
