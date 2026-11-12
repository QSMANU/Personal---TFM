$ErrorActionPreference = 'Stop'
$module = Join-Path (Split-Path -Parent $PSScriptRoot) 'tools\detect-installed-apps.ps1'
. $module

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("sharedctx-detection-" + [guid]::NewGuid().ToString('N'))
try {
  $profile = Join-Path $tempRoot 'user'
  $appData = Join-Path $profile 'AppData\Roaming'
  $localAppData = Join-Path $profile 'AppData\Local'
  New-Item -ItemType Directory -Force -Path (Join-Path $profile '.cursor') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $profile '.kimi-code') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $profile '.config\opencode') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $appData 'Code\User') | Out-Null
  $storeClaude = Join-Path $localAppData 'Packages\Claude_test\LocalCache\Roaming\Claude\claude_desktop_config.json'
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $storeClaude) | Out-Null
  Set-Content -LiteralPath $storeClaude -Value '{}' -NoNewline

  $commands = @('claude')
  $inventory = @(Get-SharedCtxAppInventory `
    -UserProfile $profile `
    -AppData $appData `
    -LocalAppData $localAppData `
    -InstalledProgramNames @('DeepSeek Harness') `
    -AppxPackageNames @('Claude', 'PerplexityAI.PerplexityApp') `
    -CommandExists { param($name) $name -in $commands })

  function Assert-Installed([string]$id, [bool]$expected) {
    $app = $inventory | Where-Object Id -eq $id
    if (-not $app) { throw "No apareció $id en el inventario" }
    if ($app.Installed -ne $expected) { throw "Esperaba Installed=$expected para $id; fue $($app.Installed)" }
  }

  Assert-Installed 'cursor' $false
  Assert-Installed 'kimi-code' $false
  Assert-Installed 'vscode' $false
  Assert-Installed 'claude-desktop' $true
  Assert-Installed 'claude-code' $true
  Assert-Installed 'dsh' $true
  Assert-Installed 'opencode' $false
  Assert-Installed 'kimchi' $false
  Assert-Installed 'codex' $false
  Assert-Installed 'antigravity' $false
  Assert-Installed 'copilot' $false
  Assert-Installed 'perplexity' $true

  $kimi = $inventory | Where-Object Id -eq 'kimi-code'
  if (-not ($kimi.ResidualConfig -match '\.kimi-code')) { throw 'Kimi no informó la configuración residual' }
  if (($inventory | Where-Object Id -eq 'perplexity').AutoConfigurable) { throw 'Perplexity Windows no se puede autoconfigurar por stdio' }

  $repo = Split-Path -Parent $PSScriptRoot
  function Get-TestConnection([string]$id) {
    Get-SharedCtxAppConnection -Id $id -Repo $repo -UserProfile $profile -AppData $appData -LocalAppData $localAppData
  }
  if ((Get-TestConnection 'vscode').Configured) { throw 'VS Code sin config apareció conectado' }
  $configPath = Join-Path $appData 'Code\User\mcp.json'
  $server = @{ type='stdio'; command=(Get-Command node).Source; args=@((Join-Path $repo 'src\stdio.js')); env=@{ SHARED_MCP_APP='vscode' } }
  function Save-TestServer {
    @{ servers=@{ 'QSMANU-LOCAL-SHARED-MCP'=$server } } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configPath
  }
  Save-TestServer
  if (-not (Get-TestConnection 'vscode').Configured) { throw 'VS Code con configuración válida no pasó' }
  $server.disabled = $true
  Save-TestServer
  if ((Get-TestConnection 'vscode').Configured) { throw 'Servidor deshabilitado apareció válido' }
  $server.Remove('disabled')
  $server.args = @((Join-Path $repo 'missing.js'))
  Save-TestServer
  if ((Get-TestConnection 'vscode').Configured) { throw 'Ruta de servidor incorrecta apareció válida' }
  Set-Content -LiteralPath $configPath -Value '{invalid json'
  if ((Get-TestConnection 'vscode').Configured) { throw 'JSON roto apareció válido' }

  # Claude Desktop actual (Microsoft Store): %LOCALAPPDATA%\Claude-Data\<familia>.
  $claudeDataDir = Join-Path $localAppData 'Claude-Data\claude_test'
  New-Item -ItemType Directory -Force -Path $claudeDataDir | Out-Null
  $claudeCfg = Join-Path $claudeDataDir 'claude_desktop_config.json'
  @{ mcpServers = @{ 'QSMANU-LOCAL-SHARED-MCP' = @{ command=(Get-Command node).Source; args=@((Join-Path $repo 'src\stdio.js')); env=@{ SHARED_MCP_APP='claude-desktop' } } } } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $claudeCfg
  if (-not (Get-TestConnection 'claude-desktop').Configured) { throw 'Claude Desktop (Claude-Data) no se detectó' }

  # Kimchi: misma estructura MCP JSON, identidad independiente.
  $kimchiPath = Join-Path $profile '.config\kimchi\harness\mcp.json'
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $kimchiPath) | Out-Null
  if ((Get-TestConnection 'kimchi').Configured) { throw 'Kimchi sin config aparecio conectado' }
  $kimchiServer = @{ command=(Get-Command node).Source; args=@((Join-Path $repo 'src\stdio.js')); env=@{ SHARED_MCP_APP='kimchi' } }
  function Save-TestKimchi {
    @{ mcpServers=@{ 'QSMANU-LOCAL-SHARED-MCP'=$kimchiServer } } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $kimchiPath
  }
  Save-TestKimchi
  if (-not (Get-TestConnection 'kimchi').Configured) { throw 'Kimchi valido no paso' }
  $kimchiServer.env.SHARED_MCP_APP = 'opencode'
  Save-TestKimchi
  if ((Get-TestConnection 'kimchi').Configured) { throw 'Kimchi acepto identidad incorrecta' }
  $kimchiServer.env.SHARED_MCP_APP = 'kimchi'
  $kimchiServer.disabled = $true
  Save-TestKimchi
  if ((Get-TestConnection 'kimchi').Configured) { throw 'Kimchi deshabilitado aparecio conectado' }

  # OpenCode V2: mcp.servers.sharedctx con command como array y "environment".
  $ocPath = Join-Path $profile '.config\opencode\opencode.json'
  $ocServer = @{ type='local'; command=@((Get-Command node).Source, (Join-Path $repo 'src\stdio.js')); environment=@{ SHARED_MCP_APP='opencode' } }
  function Save-TestOpenCode {
    @{ mcp = @{ servers = @{ sharedctx = $ocServer } } } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ocPath
  }
  if ((Get-TestConnection 'opencode').Configured) { throw 'OpenCode sin config apareció conectado' }
  Save-TestOpenCode
  if (-not (Get-TestConnection 'opencode').Configured) { throw 'OpenCode con configuración válida no pasó' }
  $ocServer.type = 'remote'
  Save-TestOpenCode
  if ((Get-TestConnection 'opencode').Configured) { throw 'OpenCode con tipo incorrecto apareció válido' }
  $ocServer.type = 'local'
  $ocServer.environment.SHARED_MCP_APP = 'otra-app'
  Save-TestOpenCode
  if ((Get-TestConnection 'opencode').Configured) { throw 'OpenCode con SHARED_MCP_APP incorrecto apareció válido' }
  $ocServer.environment.SHARED_MCP_APP = 'opencode'
  $ocServer.command = @((Get-Command node).Source)
  Save-TestOpenCode
  if ((Get-TestConnection 'opencode').Configured) { throw 'OpenCode sin stdio.js apareció válido' }

  if ((Get-TestConnection 'perplexity').Status -ne 'MANUAL') { throw 'Perplexity no informó integración manual' }
  Write-Host 'OK: detección sin falsos positivos por restos, Store y validación de configuración MCP'
} finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
