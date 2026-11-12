<#
  atajos.ps1 — crea (o quita) los botones del escritorio para el contexto compartido.

    powershell -ExecutionPolicy Bypass -File tools\atajos.ps1
    powershell -ExecutionPolicy Bypass -File tools\atajos.ps1 -Quitar

  Cada botón apunta a un .cmd del repo, así que el escritorio no guarda lógica:
  si el repo cambia, los botones siguen funcionando.
#>
[CmdletBinding()]
param(
  [switch]$Quitar,
  [string]$Escritorio
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $Escritorio) { $Escritorio = [Environment]::GetFolderPath('Desktop') }

$botones = @(
  @{ nombre = 'QSMANU - Panel de contexto'; cmd = 'tools\panel.cmd';   icono = "$env:SystemRoot\System32\imageres.dll,109"; desc = 'Abre el panel del contexto compartido (lo levanta si hace falta)' },
  @{ nombre = 'QSMANU - Estado del contexto'; cmd = 'tools\estado.cmd'; icono = "$env:SystemRoot\System32\shell32.dll,167"; desc = 'Modo, proyectos, salud del contexto y que conviene arreglar' },
  @{ nombre = 'QSMANU - Reparar conexion'; cmd = 'tools\reparar.cmd';   icono = "$env:SystemRoot\System32\shell32.dll,71";  desc = 'Vuelve a configurar el MCP en todas las apps (con backup)' }
)

if ($Quitar) {
  $quitados = 0
  foreach ($b in $botones) {
    $lnk = Join-Path $Escritorio "$($b.nombre).lnk"
    if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force; Write-Host "quitado:  $($b.nombre)"; $quitados++ }
  }
  if ($quitados -eq 0) { Write-Host 'No había botones para quitar.' }
  exit 0
}

$shell = New-Object -ComObject WScript.Shell
Write-Host "creando botones en: $Escritorio`n"
foreach ($b in $botones) {
  $destino = Join-Path $Repo $b.cmd
  if (-not (Test-Path -LiteralPath $destino)) { Write-Host "FALTA el script: $destino" -ForegroundColor Yellow; continue }
  $lnk = Join-Path $Escritorio "$($b.nombre).lnk"
  $acceso = $shell.CreateShortcut($lnk)
  $acceso.TargetPath = $destino
  $acceso.WorkingDirectory = $Repo
  $acceso.Description = $b.desc
  $acceso.IconLocation = $b.icono
  $acceso.WindowStyle = 1
  $acceso.Save()
  Write-Host "  creado:  $($b.nombre).lnk" -ForegroundColor Green
}

Write-Host "`nListo. Doble clic en cualquier boton del escritorio."
Write-Host "Para quitarlos:  powershell -ExecutionPolicy Bypass -File tools\atajos.ps1 -Quitar"
