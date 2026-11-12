# Ejecutar solo la funcion de edición, aislada del instalador y de las apps reales.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'install.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$fn = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Set-MarkerBlock' }, $true)
Invoke-Expression $fn.Extent.Text
function Backup-Config { param($Path) }
function Read-Utf8Text { param($Path) [System.IO.File]::ReadAllText($Path) }
function Write-Utf8NoBom { param($Path, $Text) [System.IO.File]::WriteAllText($Path, $Text) }
$script:Changes = New-Object System.Collections.ArrayList
$DryRun = $false
$path = Join-Path ([System.IO.Path]::GetTempPath()) ('sharedctx-skill-' + [guid]::NewGuid().ToString('N') + '.md')
try {
  $header = "---`nname: contexto-compartido`ndescription: Prueba`n---`n`n"
  $block = "<!-- sharedctx:begin -->`ncontenido`n<!-- sharedctx:end -->"
  Set-MarkerBlock -Label test -File $path -Block $block -Preamble $header
  $first = Read-Utf8Text $path
  Set-MarkerBlock -Label test -File $path -Block $block -Preamble $header
  if ((Read-Utf8Text $path) -cne $first) { throw 'Reinstalacion modifica cabecera' }
  Write-Utf8NoBom $path ($first + "`nTexto propio")
  Set-MarkerBlock -Label test -File $path -Block ($block.Replace('contenido','nuevo')) -Preamble $header
  $updated = Read-Utf8Text $path
  if (-not $updated.StartsWith($header) -or -not $updated.Contains('Texto propio') -or -not $updated.Contains('nuevo')) { throw 'Se perdio contenido o cabecera' }
  Write-Host 'OK: skill idempotente conserva cabecera y texto del usuario'
} finally { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force } }
