@echo off
rem ---------------------------------------------------------------------------
rem  Boton: Panel de contexto compartido (QSMANU-LOCAL-SHARED-MCP)
rem  Levanta el panel si no esta corriendo (en segundo plano) y abre el navegador.
rem  ASCII a proposito: cmd.exe no lee UTF-8.
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No encuentro "node" en el PATH. Instala Node.js 20 o superior.
  echo.
  pause
  exit /b 1
)

echo.
echo   Levantando el panel del contexto compartido...
node "src\cli.js" ui --ensure --open
if errorlevel 1 (
  echo.
  echo   Algo fallo. Revisa el log:
  echo   %USERPROFILE%\.shared-mcp\dashboard.log
  echo.
  pause
  exit /b 1
)
exit /b 0
