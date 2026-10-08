<#
.SYNOPSIS
  Instala el contexto compartido local (sharedctx) en todas las herramientas de AI
  detectadas en esta máquina, con consentimiento explícito por publicación.

.DESCRIPTION
  Para cada app:
    1. hace backup del archivo de configuración,
    2. agrega/actualiza el servidor MCP "sharedctx",
    3. retira el servidor "context-mcp" (salvo -KeepContextMcp),
    4. agrega el bloque de instrucciones opt-in donde la app lea un archivo.

  Todo lo que toca queda registrado en state\install-manifest.json, y se puede
  revertir con:  .\install.ps1 -Restore

.PARAMETER KeepContextMcp
  No retirar el servidor de terceros "context-mcp" de las apps (por defecto se retira;
  los datos en ~\.context-mcp NO se tocan).

.PARAMETER SkipInstructions
  No escribir los bloques de instrucciones en CLAUDE.md / AGENTS.md / GEMINI.md, etc.

.PARAMETER Restore
  Deshace la instalación: restaura el backup MÁS ANTIGUO de cada archivo (el estado
  previo a la primera instalación) y quita los bloques/archivos que agregó el instalador.
  El contexto ya guardado en ~\.shared-mcp NO se toca.

.PARAMETER RestoreLatest
  Como -Restore, pero con el backup MÁS RECIENTE: deshace solo la última corrida.

.PARAMETER DryRun
  Muestra qué haría, sin escribir nada.

.EXAMPLE
  .\install.ps1
  .\install.ps1 -KeepContextMcp
  .\install.ps1 -Restore
  .\install.ps1 -Restore -RestoreLatest
#>
[CmdletBinding()]
param(
  [switch]$KeepContextMcp,
  [switch]$SkipInstructions,
  [switch]$Restore,
  [switch]$RestoreLatest,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$StdioJs = Join-Path $Repo 'src\stdio.js'
$CliJs = Join-Path $Repo 'src\cli.js'
$Snippet = Join-Path $Repo 'agents\contexto-compartido.md'
$StateDir = Join-Path $Repo 'state'
$ManifestPath = Join-Path $StateDir 'install-manifest.json'
$Stamp = Get-Date -Format 'yyyyMMddHHmmss'
$ServerName = 'QSMANU-LOCAL-SHARED-MCP'
$Retired = @('context-mcp', 'sharedctx')

$script:Changes = New-Object System.Collections.ArrayList

function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function Backup-Config {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $bak = "$Path.backup-sharedctx-$Stamp"
  Copy-Item -LiteralPath $Path -Destination $bak -Force
  [void]$script:Changes.Add([pscustomobject]@{ ts = (Get-Date).ToString('s'); kind = 'backup'; path = $Path; backup = $bak })
  return $bak
}

function New-ServerJson {
  param([string]$AppId, [switch]$IncludeType)
  $obj = [ordered]@{}
  if ($IncludeType) { $obj['type'] = 'stdio' }
  $obj['command'] = $Node
  $obj['args'] = @($StdioJs)
  $obj['env'] = [ordered]@{ SHARED_MCP_APP = $AppId }
  $tmp = Join-Path $StateDir "server-$AppId.json"
  Write-Utf8NoBom -Path $tmp -Text ($obj | ConvertTo-Json -Depth 8)
  return $tmp
}

function New-CodexServerJson {
  param([string]$AppId)
  $obj = [ordered]@{
    command                      = $Node
    args                         = @($StdioJs)
    default_tools_approval_mode  = 'approve'
    env                          = [ordered]@{ SHARED_MCP_APP = $AppId }
    tools                        = [ordered]@{
      shared_publish = [ordered]@{ approval_mode = 'prompt' }
      shared_forget  = [ordered]@{ approval_mode = 'prompt' }
    }
  }
  $tmp = Join-Path $StateDir "server-$AppId.json"
  Write-Utf8NoBom -Path $tmp -Text ($obj | ConvertTo-Json -Depth 8)
  return $tmp
}

function Invoke-Node {
  param([string[]]$NodeArgs)
  $out = & node @NodeArgs 2>&1
  $code = $LASTEXITCODE
  if ($code -ne 0) { throw "node $($NodeArgs -join ' ') falló:`n$out" }
  return $out
}

function Add-JsonServer {
  param([string]$AppId, [string]$Label, [string]$ConfigPath, [string]$RootKey = 'mcpServers', [switch]$KeepServer, [switch]$IncludeType, [string[]]$RetireList)
  Write-Host "`n== $Label" -ForegroundColor Cyan
  Write-Host "   config: $ConfigPath"
  if ($DryRun) { Write-Host "   (dry-run) agregaría $RootKey.$ServerName"; return }

  if (-not $RetireList) { $RetireList = $Retired }
  Backup-Config -Path $ConfigPath | Out-Null
  $serverJson = New-ServerJson -AppId $AppId -IncludeType:$IncludeType
  $nodeArgs = @((Join-Path $Repo 'tools\merge-mcp-json.mjs'), $ConfigPath, $RootKey, $ServerName, $serverJson)
  if (-not $KeepServer) { $nodeArgs += @('--retire', ($RetireList -join ',')) }
  $out = Invoke-Node -NodeArgs $nodeArgs
  $out | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
  [void]$script:Changes.Add([pscustomobject]@{ ts = (Get-Date).ToString('s'); kind = 'mcp-json'; app = $AppId; path = $ConfigPath; root = $RootKey })
}

function Remove-BloquesMcpDsh {
  param([string]$Text, [string[]]$Nombres)
  $bloques = New-Object System.Collections.ArrayList
  $actual = New-Object System.Collections.ArrayList
  foreach ($l in ($Text -split "`r?`n")) {
    if ($l -match '^-\s' -and $actual.Count -gt 0) {
      [void]$bloques.Add(($actual.ToArray() -join "`r`n"))
      $actual = New-Object System.Collections.ArrayList
    }
    [void]$actual.Add($l)
  }
  if ($actual.Count -gt 0) { [void]$bloques.Add(($actual.ToArray() -join "`r`n")) }

  $conservados = New-Object System.Collections.ArrayList
  $quitados = 0
  foreach ($b in $bloques) {
    $esNuestro = $false
    foreach ($n in $Nombres) {
      if ($b -match "(?m)^\s*serverName:\s*$([regex]::Escape($n))\s*$") { $esNuestro = $true }
    }
    if ($esNuestro) { $quitados++ } else { [void]$conservados.Add($b) }
  }
  return @{ texto = (($conservados.ToArray() -join "`r`n").Trim()); quitados = $quitados }
}

function Add-TomlServer {
  param([string]$AppId, [string]$Label, [string]$ConfigPath, [switch]$KeepServer)
  Write-Host "`n== $Label" -ForegroundColor Cyan
  Write-Host "   config: $ConfigPath"
  if ($DryRun) { Write-Host "   (dry-run) agregaría [mcp_servers.$ServerName]"; return }

  Backup-Config -Path $ConfigPath | Out-Null
  $serverJson = New-CodexServerJson -AppId $AppId
  $nodeArgs = @((Join-Path $Repo 'tools\merge-codex-toml.mjs'), $ConfigPath, $ServerName, $serverJson)
  if (-not $KeepServer) { $nodeArgs += @('--retire', ($Retired -join ',')) }
  $out = Invoke-Node -NodeArgs $nodeArgs
  $out | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
  [void]$script:Changes.Add([pscustomobject]@{ ts = (Get-Date).ToString('s'); kind = 'mcp-toml'; app = $AppId; path = $ConfigPath })
}

function Set-MarkerBlock {
  param([string]$Label, [string]$File, [string]$Block)
  Write-Host "`n== $Label (instrucciones)" -ForegroundColor Cyan
  Write-Host "   archivo: $File"
  if ($DryRun) { Write-Host '   (dry-run) insertaría el bloque sharedctx'; return }

  $begin = '<!-- sharedctx:begin -->'
  $end = '<!-- sharedctx:end -->'
  $existing = ''
  if (Test-Path -LiteralPath $File) { $existing = Get-Content -LiteralPath $File -Raw }
  Backup-Config -Path $File | Out-Null

  if ($existing -and $existing.Contains($begin)) {
    $pattern = [regex]::Escape($begin) + '(?s).*?' + [regex]::Escape($end)
    $new = [regex]::Replace($existing, $pattern, [System.Text.RegularExpressions.MatchEvaluator] { param($m) $Block })
  } elseif ($existing -and $existing.Trim().Length -gt 0) {
    $new = $existing.TrimEnd() + "`r`n`r`n" + $Block + "`r`n"
  } else {
    $new = $Block + "`r`n"
  }

  Write-Utf8NoBom -Path $File -Text $new
  [void]$script:Changes.Add([pscustomobject]@{ ts = (Get-Date).ToString('s'); kind = 'instructions'; path = $File })
  Write-Host '   bloque de instrucciones escrito' -ForegroundColor DarkGray
}

function Get-Backups {
  param([string]$Path)
  return @(Get-ChildItem -Path "$Path.backup-sharedctx-*" -ErrorAction SilentlyContinue | Sort-Object Name)
}

function Remove-BloqueMarcado {
  param([string]$Path)
  $begin = '<!-- sharedctx:begin -->'
  $end = '<!-- sharedctx:end -->'
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  $texto = Get-Content -LiteralPath $Path -Raw
  if (-not $texto.Contains($begin)) { return $false }
  $patron = [regex]::Escape($begin) + '(?s).*?' + [regex]::Escape($end)
  $nuevo = ([regex]::Replace($texto, $patron, '')).TrimEnd() + "`r`n"
  Write-Utf8NoBom -Path $Path -Text $nuevo
  return $true
}

<#
  Deshace la instalación. Por defecto restaura el backup MÁS ANTIGUO de cada
  archivo (el estado previo a la primera instalación); con -Latest restaura el
  más reciente (deshace solo la última corrida).
#>
function Undo-Install {
  param([switch]$Latest)

  $objetivos = @(
    @{ path = (Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'); modo = 'restaurar' },
    @{ path = (Join-Path $env:USERPROFILE '.cursor\mcp.json'); modo = 'restaurar' },
    @{ path = (Join-Path $env:USERPROFILE '.gemini\config\mcp_config.json'); modo = 'restaurar' },
    @{ path = (Join-Path $env:USERPROFILE '.config\kimchi\harness\mcp.json'); modo = 'restaurar' },
    @{ path = (Join-Path $env:USERPROFILE '.codex\config.toml'); modo = 'restaurar' },
    @{ path = (Join-Path $env:APPDATA 'Code\User\mcp.json'); modo = 'borrar-json-nuestro' },
    @{ path = (Join-Path $env:USERPROFILE '.copilot\mcp-config.json'); modo = 'borrar-json-nuestro' },
    @{ path = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop\cordis.patch.yml'); modo = 'restaurar' },
    @{ path = (Join-Path $env:USERPROFILE '.claude\settings.json'); modo = 'restaurar' },
    @{ path = (Join-Path $env:USERPROFILE '.claude\CLAUDE.md'); modo = 'quitar-bloque' },
    @{ path = (Join-Path $env:USERPROFILE '.codex\AGENTS.md'); modo = 'quitar-bloque' },
    @{ path = (Join-Path $env:USERPROFILE '.gemini\GEMINI.md'); modo = 'quitar-bloque' },
    @{ path = (Join-Path $env:USERPROFILE '.cursor\rules\contexto-compartido.mdc'); modo = 'borrar' },
    @{ path = (Join-Path $env:USERPROFILE '.config\kimchi\harness\skills\contexto-compartido\SKILL.md'); modo = 'borrar' },
    @{ path = (Join-Path $env:USERPROFILE '.config\kimchi\harness\skills\contexto-compartido'); modo = 'borrar-dir' }
  )

  $accion = if ($Latest) { 'más reciente' } else { 'más antiguo (estado previo a la primera instalación)' }
  Write-Host "revirtiendo con el backup $accion`n" -ForegroundColor Cyan

  foreach ($o in $objetivos) {
    $baks = Get-Backups -Path $o.path
    switch ($o.modo) {
      'restaurar' {
        if ($baks.Count -gt 0) {
          $elegido = if ($Latest) { $baks[-1] } else { $baks[0] }
          Copy-Item -LiteralPath $elegido.FullName -Destination $o.path -Force
          Write-Host "restaurado  $($o.path)" -ForegroundColor Green
          Write-Host "            desde $($elegido.Name)" -ForegroundColor DarkGray
        } elseif (Test-Path -LiteralPath $o.path) {
          Write-Host "sin backup  $($o.path)  (no lo tocó el instalador)" -ForegroundColor DarkGray
        }
      }
      'restaurar-o-borrar' {
        if ($baks.Count -gt 0) {
          $elegido = if ($Latest) { $baks[-1] } else { $baks[0] }
          Copy-Item -LiteralPath $elegido.FullName -Destination $o.path -Force
          Write-Host "restaurado  $($o.path)" -ForegroundColor Green
        } elseif (Test-Path -LiteralPath $o.path) {
          Remove-Item -LiteralPath $o.path -Force
          Write-Host "borrado     $($o.path)  (lo creó el instalador)" -ForegroundColor Yellow
        }
      }
      'borrar-json-nuestro' {
        # Este archivo NO existía antes de la instalación: si lo creamos nosotros,
        # se borra. Si existía y el usuario tenía otras entradas, se limpian solo las nuestras.
        if (-not (Test-Path -LiteralPath $o.path)) { continue }
        $json = Get-Content -LiteralPath $o.path -Raw | ConvertFrom-Json
        $raiz = if ($json.PSObject.Properties['servers']) { 'servers' } elseif ($json.PSObject.Properties['mcpServers']) { 'mcpServers' } else { $null }
        if (-not $raiz) { Write-Host "sin tocar   $($o.path)  (no tiene estructura MCP)" -ForegroundColor DarkGray; continue }
        $nombres = @($json.$raiz.PSObject.Properties.Name)
        $otros = @($nombres | Where-Object { $_ -ne 'QSMANU-LOCAL-SHARED-MCP' -and $_ -ne 'sharedctx' -and $_ -ne 'context-mcp' })
        if ($otros.Count -eq 0) {
          Remove-Item -LiteralPath $o.path -Force
          Write-Host "borrado     $($o.path)  (solo tenía nuestras entradas)" -ForegroundColor Yellow
        } else {
          foreach ($n in @('QSMANU-LOCAL-SHARED-MCP', 'sharedctx', 'context-mcp')) {
            if ($nombres -contains $n) { $json.$raiz.PSObject.Properties.Remove($n) }
          }
          Write-Utf8NoBom -Path $o.path -Text ($json | ConvertTo-Json -Depth 12)
          Write-Host "limpiado    $($o.path)  (quedaron las entradas del usuario: $($otros -join ', '))" -ForegroundColor Green
        }
      }
      'quitar-bloque' {
        if (Remove-BloqueMarcado -Path $o.path) {
          Write-Host "bloque quitado de  $($o.path)" -ForegroundColor Green
        } else {
          Write-Host "sin bloque  $($o.path)" -ForegroundColor DarkGray
        }
      }
      'borrar' {
        if (Test-Path -LiteralPath $o.path) {
          Remove-Item -LiteralPath $o.path -Force
          Write-Host "borrado     $($o.path)" -ForegroundColor Yellow
        }
      }
      'borrar-dir' {
        if (Test-Path -LiteralPath $o.path) {
          Remove-Item -LiteralPath $o.path -Recurse -Force -ErrorAction SilentlyContinue
        }
      }
    }
  }

  if (-not $Latest) {
    Write-Host "`nEl contexto ya guardado NO se toca: sigue en $env:USERPROFILE\.shared-mcp" -ForegroundColor DarkGray
  }
  Write-Host 'Reiniciá las apps para que tomen la configuración anterior.' -ForegroundColor Cyan
}

function Save-Manifest {
  if ($DryRun -or $script:Changes.Count -eq 0) { return }
  if (-not (Test-Path -LiteralPath $StateDir)) { New-Item -ItemType Directory -Force -Path $StateDir | Out-Null }
  $previous = @()
  if (Test-Path -LiteralPath $ManifestPath) {
    try { $previous = @(Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json) } catch { $previous = @() }
  }
  $all = @($previous) + @($script:Changes)
  Write-Utf8NoBom -Path $ManifestPath -Text ($all | ConvertTo-Json -Depth 6)
}

# ---------------------------------------------------------------- comprobaciones

$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
  Write-Host 'No encontré node en el PATH. Instalá Node.js 20+ y volvé a ejecutar.' -ForegroundColor Red
  exit 1
}
$Node = $NodeCmd.Source
if (-not (Test-Path -LiteralPath $StdioJs)) {
  Write-Host "Falta $StdioJs" -ForegroundColor Red
  exit 1
}

Write-Host "contexto compartido local (sharedctx)" -ForegroundColor Green
Write-Host "  repo:  $Repo"
Write-Host "  node:  $Node"
Write-Host "  modo:  $((& node $CliJs status | Select-Object -First 2) -join ' | ')"
if ($Restore) { Undo-Install -Latest:$RestoreLatest; exit 0 }

foreach ($dir in @($StateDir, (Join-Path $Repo 'node_modules'))) {
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
}

$block = if (Test-Path -LiteralPath $Snippet) { Get-Content -LiteralPath $Snippet -Raw } else { '' }
$keepServer = [bool]$KeepContextMcp

# ----------------------------------------------------------------------- apps

$configured = 0

# Claude Desktop (JSON, mcpServers)
$claudeCfg = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
if (Test-Path -LiteralPath (Join-Path $env:APPDATA 'Claude')) {
  Add-JsonServer -AppId 'claude-desktop' -Label 'Claude Desktop' -ConfigPath $claudeCfg -KeepServer:$keepServer
  $configured++
}

# Cursor (JSON, mcpServers) — nivel usuario; se puede repetir por proyecto en <repo>\.cursor\mcp.json
$cursorCfg = Join-Path $env:USERPROFILE '.cursor\mcp.json'
if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.cursor')) {
  Add-JsonServer -AppId 'cursor' -Label 'Cursor' -ConfigPath $cursorCfg -KeepServer:$keepServer
  $configured++
}

# Antigravity (agente) — comparte el archivo con Gemini
$geminiCfg = Join-Path $env:USERPROFILE '.gemini\config\mcp_config.json'
if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.gemini\config')) {
  Add-JsonServer -AppId 'antigravity' -Label 'Antigravity (agente)' -ConfigPath $geminiCfg -KeepServer:$keepServer
  $configured++
}

# Kimchi Studio (JSON, mcpServers en ~/.config/kimchi/harness/mcp.json)
$kimchiCfg = Join-Path $env:USERPROFILE '.config\kimchi\harness\mcp.json'
if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.config\kimchi\harness')) {
  Add-JsonServer -AppId 'kimchi' -Label 'Kimchi Studio' -ConfigPath $kimchiCfg -KeepServer:$keepServer
  $configured++
}

# Codex / ChatGPT desktop (TOML)
$codexCfg = Join-Path $env:USERPROFILE '.codex\config.toml'
if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.codex')) {
  Add-TomlServer -AppId 'codex' -Label 'Codex / ChatGPT desktop' -ConfigPath $codexCfg -KeepServer:$keepServer
  $configured++
}

# VS Code (Copilot) — nivel usuario: %APPDATA%\Code\User\mcp.json con clave "servers"
# (acá solo se retira la entrada vieja nuestra; no se toca context-mcp si existiera)
$vscodeCfg = Join-Path $env:APPDATA 'Code\User\mcp.json'
if (Test-Path -LiteralPath (Join-Path $env:APPDATA 'Code\User')) {
  Add-JsonServer -AppId 'vscode' -Label 'VS Code (Copilot)' -ConfigPath $vscodeCfg -RootKey 'servers' -IncludeType -RetireList @('sharedctx')
  $configured++
}

# Copilot global (lo lee VS Code 1.140 además del anterior)
$copilotCfg = Join-Path $env:USERPROFILE '.copilot\mcp-config.json'
if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.copilot')) {
  Add-JsonServer -AppId 'copilot' -Label 'Copilot (global)' -ConfigPath $copilotCfg -RootKey 'mcpServers' -IncludeType -RetireList @('sharedctx')
  $configured++
}

# Antigravity IDE: comparte el MISMO archivo que el agente de Antigravity
# (~/.gemini/config/mcp_config.json), ya configurado arriba. No tiene archivo propio.

# Claude Code — se quitan los hooks de captura automática del servidor viejo
$claudeSettings = Join-Path $env:USERPROFILE '.claude\settings.json'
if (-not $KeepContextMcp -and (Test-Path -LiteralPath $claudeSettings)) {
  Write-Host "`n== Claude Code (hooks de captura automática)" -ForegroundColor Cyan
  Write-Host "   archivo: $claudeSettings"
  if ($DryRun) {
    Write-Host '   (dry-run) quitaría los hooks que llaman a context-mcp'
  } else {
    Backup-Config -Path $claudeSettings | Out-Null
    $hookOut = Invoke-Node -NodeArgs @((Join-Path $Repo 'tools\strip-context-mcp-hooks.mjs'), $claudeSettings)
    $hookOut | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
    [void]$script:Changes.Add([pscustomobject]@{ ts = (Get-Date).ToString('s'); kind = 'claude-hooks'; app = 'claude-code'; path = $claudeSettings })
  }
}

# Claude Code (CLI) — usa su propio comando para no pelear con el formato interno
$claudeCli = Get-Command claude -ErrorAction SilentlyContinue
if ($claudeCli) {
  Write-Host "`n== Claude Code" -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host "   (dry-run) claude mcp add --scope user $ServerName ..."
  } else {
    & $claudeCli.Source mcp remove --scope user $ServerName 2>$null | Out-Null
    $addOut = & $claudeCli.Source mcp add --scope user $ServerName -e "SHARED_MCP_APP=claude-code" -- $Node $StdioJs 2>&1
    Write-Host "   $addOut" -ForegroundColor DarkGray
    [void]$script:Changes.Add([pscustomobject]@{ ts = (Get-Date).ToString('s'); kind = 'claude-cli'; app = 'claude-code'; path = 'claude mcp add --scope user' })
    $configured++
  }
} else {
  Write-Host "`n== Claude Code" -ForegroundColor Cyan
  Write-Host "   el CLI ``claude`` no está instalado: se omite (si lo instalás, corré: claude mcp add --scope user $ServerName -e SHARED_MCP_APP=claude-code -- <node> <stdio.js>)" -ForegroundColor Yellow
}

# DeepSeek Harness — plugin oficial dsh-mcp-client insertado en el patch del perfil
$dshPatch = Join-Path $env:USERPROFILE '.dsh\profiles\desktop\cordis.patch.yml'
if (Test-Path -LiteralPath $dshPatch) {
  Write-Host "`n== DeepSeek Harness" -ForegroundColor Cyan
  Write-Host "   patch: $dshPatch"
  $patchText = Get-Content -LiteralPath $dshPatch -Raw
  $marcaIni = '# >>> sharedctx / QSMANU-LOCAL-SHARED-MCP (generado por install.ps1)'
  $marcaFin = '# <<< sharedctx / QSMANU-LOCAL-SHARED-MCP'
  $marcaLegacy = '# Contexto compartido local (opt-in)'
  $otroMcp = ($patchText -match 'dsh-mcp-client') -and -not ($patchText -match [regex]::Escape($marcaIni)) -and -not ($patchText -match [regex]::Escape($marcaLegacy))

  if ($otroMcp) {
    Write-Host '   ya hay OTRO servidor MCP declarado a mano: no toco el archivo (revisalo vos).' -ForegroundColor Yellow
  } elseif ($DryRun) {
    Write-Host "   (dry-run) insertaría/actualizaría el plugin @deepseek-ai/dsh-mcp-client (stdio → $StdioJs)"
  } else {
    Backup-Config -Path $dshPatch | Out-Null
    # En YAML con comillas simples la barra invertida es literal: no se escapa.
    $insert = @(
      $marcaIni,
      '- insert:',
      '    - id: sharedctx-mcp',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      "        serverName: $ServerName",
      '        transport: stdio',
      "        command: '$Node'",
      '        args:',
      "          - '$StdioJs'",
      '        env:',
      '          SHARED_MCP_APP: dsh',
      '        failOnStartupError: true',
      '        toolCallTimeoutMs: 30000',
      $marcaFin
    ) -join "`r`n"

    if ($patchText.Contains($marcaIni)) {
      # Regeneración normal: reemplazo el bloque marcado.
      $patron = [regex]::Escape($marcaIni) + '(?s).*?' + [regex]::Escape($marcaFin)
      $patchText = [regex]::Replace($patchText, $patron, [System.Text.RegularExpressions.MatchEvaluator] { param($m) $insert })
      $accion = 'actualizado'
    } else {
      $accion = 'insertado'
    }

    # Limpieza de generaciones anteriores de este mismo servidor (por serverName).
    $limpio = Remove-BloquesMcpDsh -Text $patchText -Nombres @('sharedctx', 'context-mcp')
    if ($limpio.quitados -gt 0) {
      $patchText = $limpio.texto
      $accion = "$accion + $($limpio.quitados) bloque(s) anterior(es) eliminado(s)"
    }

    if (-not $patchText.Contains($marcaIni)) {
      $patchText = $patchText.TrimEnd() + "`r`n`r`n" + $insert
    }
    Write-Utf8NoBom -Path $dshPatch -Text ($patchText.TrimEnd() + "`r`n")
    [void]$script:Changes.Add([pscustomobject]@{ ts = (Get-Date).ToString('s'); kind = 'dsh-plugin'; app = 'dsh'; path = $dshPatch })
    Write-Host "   plugin $accion (serverName: $ServerName)" -ForegroundColor DarkGray
    $configured++
  }
}

# -------------------------------------------------------------- instrucciones

if (-not $SkipInstructions -and $block) {
  $claudeMd = Join-Path $env:USERPROFILE '.claude\CLAUDE.md'
  if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.claude')) { Set-MarkerBlock -Label 'Claude Code (CLAUDE.md)' -File $claudeMd -Block $block }

  $agentsMd = Join-Path $env:USERPROFILE '.codex\AGENTS.md'
  if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.codex')) { Set-MarkerBlock -Label 'Codex (AGENTS.md)' -File $agentsMd -Block $block }

  $geminiMd = Join-Path $env:USERPROFILE '.gemini\GEMINI.md'
  if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.gemini')) { Set-MarkerBlock -Label 'Antigravity/Gemini (GEMINI.md)' -File $geminiMd -Block $block }

  $cursorRule = Join-Path $env:USERPROFILE '.cursor\rules\contexto-compartido.mdc'
  if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.cursor')) {
    $mdc = "---`r`ndescription: Contexto compartido local entre herramientas (opt-in)`r`nalwaysApply: true`r`n---`r`n`r`n" + $block + "`r`n"
    Write-Host "`n== Cursor (regla global)" -ForegroundColor Cyan
    Write-Host "   archivo: $cursorRule"
    if (-not $DryRun) {
      Backup-Config -Path $cursorRule | Out-Null
      Write-Utf8NoBom -Path $cursorRule -Text $mdc
      [void]$script:Changes.Add([pscustomobject]@{ ts = (Get-Date).ToString('s'); kind = 'instructions'; path = $cursorRule })
    }
  }

  $kimchiSkill = Join-Path $env:USERPROFILE '.config\kimchi\harness\skills\contexto-compartido\SKILL.md'
  if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.config\kimchi\harness')) {
    Write-Host "`n== Kimchi Studio (skill)" -ForegroundColor Cyan
    Write-Host "   archivo: $kimchiSkill"
    if (-not $DryRun) {
      Write-Utf8NoBom -Path $kimchiSkill -Text ("# Contexto compartido local`r`n`r`n" + $block + "`r`n")
      [void]$script:Changes.Add([pscustomobject]@{ ts = (Get-Date).ToString('s'); kind = 'instructions'; path = $kimchiSkill })
    }
  }
}

Save-Manifest

Write-Host "`n----------------------------------------------" -ForegroundColor Green
if ($DryRun) {
  Write-Host 'Simulación terminada: no se escribió nada.' -ForegroundColor Yellow
} else {
  Write-Host "Listo. Apps configuradas: $configured" -ForegroundColor Green
  Write-Host "Manifiesto: $ManifestPath"
  Write-Host "`nSiguientes pasos:" -ForegroundColor Cyan
  Write-Host '  1) Cerrá y volvé a abrir cada aplicación (leen la config al arrancar).'
  Write-Host '  2) Elegí el modo de consentimiento:  sharedctx mode ask     (recomendado)'
  Write-Host '                                       sharedctx mode readonly  (solo leer)'
  Write-Host '                                       sharedctx mode on        (publicar directo)'
  Write-Host '                                       sharedctx mode off       (no compartir nada)'
  Write-Host '  3) Verificá el estado:               sharedctx status'
}
