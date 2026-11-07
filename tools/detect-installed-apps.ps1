Set-StrictMode -Version Latest

function Get-SharedCtxInstalledProgramNames {
  $names = New-Object System.Collections.Generic.List[string]
  $roots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($root in $roots) {
    Get-ItemProperty -Path $root -ErrorAction SilentlyContinue | ForEach-Object {
      $displayName = $_.PSObject.Properties['DisplayName']
      if ($displayName -and $displayName.Value) { $names.Add([string]$displayName.Value) }
    }
  }
  return @($names | Sort-Object -Unique)
}

function Get-SharedCtxClaudeConfigPath {
  # Claude Desktop guarda la configuración en tres lugares según la versión:
  #   1. %APPDATA%\Claude                            (instalador clásico)
  #   2. %LOCALAPPDATA%\Claude-Data\<familia>        (Microsoft Store actual)
  #   3. %LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude (Store anterior)
  # Se devuelve la primera que exista, o la ruta donde la versión actual la crearía.
  [CmdletBinding()]
  param(
    [string]$AppData = $env:APPDATA,
    [string]$LocalAppData = $env:LOCALAPPDATA
  )
  $classic = Join-Path $AppData 'Claude\claude_desktop_config.json'
  if (Test-Path -LiteralPath $classic) { return $classic }

  $dataRoot = Join-Path $LocalAppData 'Claude-Data'
  if (Test-Path -LiteralPath $dataRoot) {
    $existente = @(Get-ChildItem -Path (Join-Path $dataRoot '*\claude_desktop_config.json') -Force -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending)
    if ($existente.Count -gt 0) { return $existente[0].FullName }
    $familia = @(Get-ChildItem -Path $dataRoot -Directory -Force -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($familia.Count -gt 0) { return (Join-Path $familia[0].FullName 'claude_desktop_config.json') }
  }

  $storeViejo = @(Get-Item -Path (Join-Path $LocalAppData 'Packages\Claude_*\LocalCache\Roaming\Claude\claude_desktop_config.json') -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1)
  if ($storeViejo.Count -gt 0) { return $storeViejo[0].FullName }

  return $classic
}

function Get-SharedCtxAppInventory {
  [CmdletBinding()]
  param(
    [string]$UserProfile = $env:USERPROFILE,
    [string]$AppData = $env:APPDATA,
    [string]$LocalAppData = $env:LOCALAPPDATA,
    [string[]]$InstalledProgramNames,
    [string[]]$AppxPackageNames,
    [scriptblock]$CommandExists = { param($Name) [bool](Get-Command $Name -ErrorAction SilentlyContinue) }
  )

  if (-not $AppData) { $AppData = Join-Path $UserProfile 'AppData\Roaming' }
  if (-not $LocalAppData) { $LocalAppData = Join-Path $UserProfile 'AppData\Local' }
  if ($null -eq $InstalledProgramNames) { $InstalledProgramNames = @(Get-SharedCtxInstalledProgramNames) }
  if ($null -eq $AppxPackageNames) {
    $AppxPackageNames = @(if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
      Get-AppxPackage -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }
    })
  }

  $definitions = @(
    [pscustomobject]@{
      Id='claude-desktop'; Name='Claude Desktop'; Commands=@(); Programs=@('Claude');
      Markers=@(
        (Join-Path $AppData 'Claude'),
        (Join-Path $LocalAppData 'Claude-Data'),
        (Join-Path $LocalAppData 'AnthropicClaude\claude.exe'),
        (Join-Path $LocalAppData 'Packages\Claude_*\LocalCache\Roaming\Claude\claude_desktop_config.json')
      )
    },
    [pscustomobject]@{
      Id='cursor'; Name='Cursor'; Commands=@('cursor'); Programs=@('Cursor');
      Markers=@((Join-Path $UserProfile '.cursor'), (Join-Path $LocalAppData 'Programs\cursor\Cursor.exe'))
    },
    [pscustomobject]@{
      Id='antigravity'; Name='Antigravity (agente e IDE)'; Commands=@('antigravity'); Programs=@('Antigravity');
      Markers=@((Join-Path $UserProfile '.gemini\config'), (Join-Path $UserProfile '.gemini\antigravity-ide'), (Join-Path $LocalAppData 'Programs\antigravity\Antigravity.exe'))
    },
    [pscustomobject]@{
      Id='kimi-code'; Name='Kimi Code'; Commands=@('kimi', 'kimi-code'); Programs=@('Kimi Code');
      Markers=@((Join-Path $UserProfile '.kimi-code'), (Join-Path $LocalAppData 'Programs\Kimi Code\Kimi Code.exe'))
    },
    [pscustomobject]@{
      Id='codex'; Name='Codex / ChatGPT desktop'; Commands=@('codex'); Programs=@('Codex', 'ChatGPT');
      Markers=@((Join-Path $UserProfile '.codex'))
    },
    [pscustomobject]@{
      Id='vscode'; Name='VS Code (Copilot)'; Commands=@('code'); Programs=@('Microsoft Visual Studio Code');
      Markers=@((Join-Path $AppData 'Code\User'), (Join-Path $LocalAppData 'Programs\Microsoft VS Code\Code.exe'))
    },
    [pscustomobject]@{
      Id='copilot'; Name='GitHub Copilot CLI'; Commands=@('copilot'); Programs=@('GitHub Copilot');
      Markers=@((Join-Path $UserProfile '.copilot'))
    },
    [pscustomobject]@{
      Id='claude-code'; Name='Claude Code'; Commands=@('claude'); Programs=@('Claude Code');
      Markers=@((Join-Path $UserProfile '.claude'))
    },
    [pscustomobject]@{
      Id='dsh'; Name='DeepSeek Harness'; Commands=@('dsh'); Programs=@('DeepSeek Harness');
      Markers=@((Join-Path $UserProfile '.dsh\profiles\desktop\cordis.patch.yml'))
    },
    [pscustomobject]@{
      Id='opencode'; Name='OpenCode'; Commands=@('opencode'); Programs=@('OpenCode');
      Markers=@(
        (Join-Path $AppData 'ai.opencode.desktop'),
        (Join-Path $LocalAppData 'Programs\ai.opencode.desktop'),
        (Join-Path $UserProfile '.config\opencode')
      )
    },
    [pscustomobject]@{
      Id='perplexity'; Name='Perplexity'; Commands=@(); Programs=@('Perplexity');
      Markers=@((Join-Path $AppData 'Perplexity'))
    }
  )

  foreach ($definition in $definitions) {
    $evidence = New-Object System.Collections.Generic.List[string]
    $residual = New-Object System.Collections.Generic.List[string]
    foreach ($command in $definition.Commands) {
      if (& $CommandExists $command) { $evidence.Add("comando: $command") }
    }
    foreach ($marker in $definition.Markers) {
      if ($marker.Contains('*')) {
        $found = @(Get-Item -Path $marker -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($found.Count -gt 0) { $residual.Add("config: $($found[0].FullName)") }
      } elseif (Test-Path -LiteralPath $marker) {
        if ($marker -like '*.exe') { $evidence.Add("ejecutable: $marker") }
        else { $residual.Add("config: $marker") }
      }
    }
    $packagePattern = switch ($definition.Id) {
      'claude-desktop' { '^Claude$' }
      'codex' { '^OpenAI\.Codex$' }
      'perplexity' { '^PerplexityAI\.PerplexityApp$' }
      default { '^$' }
    }
    foreach ($package in $AppxPackageNames) {
      if ($package -match $packagePattern) { $evidence.Add("paquete: $package") }
    }
    foreach ($pattern in $definition.Programs) {
      $match = $InstalledProgramNames | Where-Object {
        if ($pattern -eq 'Claude') { $_ -eq 'Claude' } else { $_ -like "*$pattern*" }
      } | Select-Object -First 1
      if ($match) { $evidence.Add("Windows: $match") }
    }
    [pscustomobject]@{
      Id = $definition.Id
      Name = $definition.Name
      Installed = $evidence.Count -gt 0
      Evidence = @($evidence)
      ResidualConfig = @($residual)
      AutoConfigurable = $definition.Id -ne 'perplexity'
    }
  }
}

# Solo lectura: no confundir un registro MCP con una conexión viva dentro del cliente.
function Get-SharedCtxAppConnection {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Id,
    [Parameter(Mandatory)][string]$Repo,
    [string]$UserProfile = $env:USERPROFILE,
    [string]$AppData = $env:APPDATA,
    [string]$LocalAppData = $env:LOCALAPPDATA
  )
  $serverName = 'QSMANU-LOCAL-SHARED-MCP'
  $root = 'mcpServers'
  $kind = 'json'
  $relative = switch ($Id) {
    'claude-desktop' { 'AppData\Roaming\Claude\claude_desktop_config.json' }
    'cursor' { '.cursor\mcp.json' }
    'antigravity' { '.gemini\config\mcp_config.json' }
    'kimi-code' { '.kimi-code\mcp.json' }
    'codex' { $kind = 'toml'; '.codex\config.toml' }
    'vscode' { $root = 'servers'; 'AppData\Roaming\Code\User\mcp.json' }
    'copilot' { '.copilot\mcp-config.json' }
    'claude-code' { '.claude.json' }
    'dsh' { $kind = 'yaml'; '.dsh\profiles\desktop\cordis.patch.yml' }
    'opencode' { $kind = 'opencode'; $serverName = 'sharedctx'; '.config\opencode\opencode.json' }
    'perplexity' { '' }
    default { throw "App desconocida: $Id" }
  }
  if ($Id -eq 'perplexity') {
    return [pscustomobject]@{ Configured=$false; Status='MANUAL'; Detail='MCP local solo en macOS; en Windows requiere conector remoto.'; Path=$null }
  }
  $path = Join-Path $UserProfile $relative
  if ($Id -eq 'vscode') { $path = Join-Path $AppData 'Code\User\mcp.json' }
  if ($Id -eq 'claude-desktop') {
    $path = Get-SharedCtxClaudeConfigPath -AppData $AppData -LocalAppData $LocalAppData
  }
  try {
    if (-not (Test-Path -LiteralPath $path -ErrorAction Stop)) { throw "Falta $path" }
    $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    if ($kind -eq 'json') {
      $json = $raw | ConvertFrom-Json -ErrorAction Stop
      $rootProp = $json.PSObject.Properties[$root]
      $serverProp = if ($rootProp) { $rootProp.Value.PSObject.Properties[$serverName] } else { $null }
      if (-not $serverProp) { throw "Sin entrada $root.$serverName en $path" }
      $server = $serverProp.Value
      $command = $server.PSObject.Properties['command']
      $arguments = $server.PSObject.Properties['args']
      if (-not $command -or -not $arguments) { throw 'Faltan command/args en el servidor' }
      if (-not (Test-Path -LiteralPath $command.Value -PathType Leaf)) { throw 'El ejecutable configurado no existe' }
      if (@($arguments.Value).Count -ne 1 -or $arguments.Value[0] -ne (Join-Path $Repo 'src\stdio.js')) { throw 'args no apunta al servidor de este repositorio' }
      if (-not (Test-Path -LiteralPath $arguments.Value[0] -PathType Leaf)) { throw 'No existe stdio.js' }
      $disabled = $server.PSObject.Properties['disabled']
      if ($disabled -and $disabled.Value -eq $true) { throw 'Servidor deshabilitado' }
      $envProp = $server.PSObject.Properties['env']
      if (-not $envProp -or -not $envProp.Value.PSObject.Properties['SHARED_MCP_APP'] -or $envProp.Value.SHARED_MCP_APP -ne $Id) { throw 'SHARED_MCP_APP falta o no coincide' }
      if ($Id -eq 'vscode' -or $Id -eq 'copilot') {
        $typeProp = $server.PSObject.Properties['type']
        $validTypes = if ($Id -eq 'copilot') { @('local', 'stdio') } else { @('stdio') }
        if (-not $typeProp -or $typeProp.Value -notin $validTypes) { throw 'Tipo de transporte incorrecto' }
      }
    } elseif ($kind -eq 'opencode') {
      # OpenCode V2: { "mcp": { "servers": { "sharedctx": { type, command[], environment } } } }
      $json = $raw | ConvertFrom-Json -ErrorAction Stop
      $mcpProp = $json.PSObject.Properties['mcp']
      $serversProp = if ($mcpProp) { $mcpProp.Value.PSObject.Properties['servers'] } else { $null }
      $serverProp = if ($serversProp) { $serversProp.Value.PSObject.Properties[$serverName] } else { $null }
      if (-not $serverProp) { throw "Sin entrada mcp.servers.$serverName en $path" }
      $server = $serverProp.Value
      $typeProp = $server.PSObject.Properties['type']
      if (-not $typeProp -or $typeProp.Value -ne 'local') { throw 'Tipo de transporte incorrecto' }
      $command = $server.PSObject.Properties['command']
      if (-not $command -or @($command.Value).Count -ne 2) { throw 'command debe ser un array [node, stdio.js]' }
      if (-not (Test-Path -LiteralPath $command.Value[0] -PathType Leaf)) { throw 'El ejecutable configurado no existe' }
      if ($command.Value[1] -ne (Join-Path $Repo 'src\stdio.js')) { throw 'command no apunta al servidor de este repositorio' }
      if (-not (Test-Path -LiteralPath $command.Value[1] -PathType Leaf)) { throw 'No existe stdio.js' }
      $disabled = $server.PSObject.Properties['disabled']
      if ($disabled -and $disabled.Value -eq $true) { throw 'Servidor deshabilitado' }
      $envProp = $server.PSObject.Properties['environment']
      if (-not $envProp -or -not $envProp.Value.PSObject.Properties['SHARED_MCP_APP'] -or $envProp.Value.SHARED_MCP_APP -ne $Id) { throw 'SHARED_MCP_APP falta o no coincide' }
    } else {
      if ($kind -eq 'toml') {
        $pattern = '(?m)^\[mcp_servers\.' + [regex]::Escape($serverName) + '\]\s*$'
        if ($raw -notmatch $pattern) { throw 'Sin sección MCP en TOML' }
      } elseif ($raw -notmatch ('(?m)^\s*serverName:\s*' + [regex]::Escape($serverName) + '\s*$') -or $raw -notmatch 'dsh-mcp-client') {
        throw 'Sin plugin MCP en el perfil'
      }
    }
    $status = if ($kind -eq 'json' -or $kind -eq 'opencode') { 'CONFIG VALIDADA' } else { 'REGISTRADA' }
    return [pscustomobject]@{ Configured=$true; Status=$status; Detail=$path; Path=$path }
  } catch {
    return [pscustomobject]@{ Configured=$false; Status='REVISAR'; Detail=$_.Exception.Message; Path=$path }
  }
}
