@echo off
rem ---------------------------------------------------------------------------
rem  Boton: Estado del contexto compartido (QSMANU-LOCAL-SHARED-MCP)
rem  Muestra si el panel esta arriba, el modo, los proyectos y la salud.
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
echo   ==========================================================
echo    Contexto compartido local  -  QSMANU-LOCAL-SHARED-MCP
echo   ==========================================================
echo.
node "src\cli.js" ui --status
echo.
node "src\cli.js" status
echo.
echo   ----------------------------------------------------------
echo    Que conviene arreglar
echo   ----------------------------------------------------------
node "src\cli.js" insights
echo.
echo   ----------------------------------------------------------
echo    Proyectos
echo   ----------------------------------------------------------
node "src\cli.js" projects
echo.
pause
