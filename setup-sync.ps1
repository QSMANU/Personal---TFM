<#
.SYNOPSIS
    Script de configuración automática de context-mcp para sincronización de TFM con Git.
#>

$ErrorActionPreference = "Stop"
$ContextMcpVersion = "1.3.0"

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Install-ContextMcpRuntime {
    param([Parameter(Mandatory = $true)][string]$Version)

    if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "No se encontro 'npm' en PATH. Instala Node.js 18 o superior antes de continuar."
    }

    $npmPrefix = (& cmd.exe /d /c npm config get prefix | Select-Object -Last 1).Trim()
    if ([string]::IsNullOrWhiteSpace($npmPrefix)) {
        throw "No se pudo determinar el prefijo global de npm."
    }

    $packageJson = Join-Path $npmPrefix "node_modules\context-mcp-server\package.json"
    $installedVersion = $null
    if (Test-Path -LiteralPath $packageJson) {
        try {
            $installedVersion = (Get-Content -LiteralPath $packageJson -Raw | ConvertFrom-Json).version
        } catch {
            $installedVersion = $null
        }
    }

    if ($installedVersion -ne $Version) {
        Write-Host "[INFO] Instalando context-mcp-server@$Version de forma global..." -ForegroundColor Yellow
        & cmd.exe /d /c npm install --global "context-mcp-server@$Version"
        if ($LASTEXITCODE -ne 0) {
            throw "npm no pudo instalar context-mcp-server@$Version (codigo $LASTEXITCODE)."
        }
    } else {
        Write-Host "[OK] context-mcp-server@$Version ya esta instalado globalmente." -ForegroundColor Green
    }

    $serverCommand = Join-Path $npmPrefix "context-mcp-server.cmd"
    if (!(Test-Path -LiteralPath $serverCommand)) {
        throw "No se encontro el ejecutable esperado: $serverCommand"
    }

    return $serverCommand
}

function Backup-ConfigFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (Test-Path -LiteralPath $Path) {
        $timestamp = Get-Date -Format "yyyyMMddHHmmss"
        $backupPath = "$Path.backup-$timestamp"
        Copy-Item -LiteralPath $Path -Destination $backupPath -Force
        Write-Host "[INFO] Copia de respaldo creada: $backupPath" -ForegroundColor DarkGray
    }
}

function Set-ContextMcpInJsonConfig {
    param(
        [Parameter(Mandatory = $true)][string]$ConfigFile,
        [Parameter(Mandatory = $true)][string]$ClientName,
        [Parameter(Mandatory = $true)][string]$ServerCommand
    )

    $configDir = Split-Path -Parent $ConfigFile
    if (!(Test-Path -LiteralPath $configDir)) {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    }

    $config = [PSCustomObject]@{}
    if (Test-Path -LiteralPath $ConfigFile) {
        $rawConfig = Get-Content -LiteralPath $ConfigFile -Raw
        if (![string]::IsNullOrWhiteSpace($rawConfig)) {
            try {
                $config = $rawConfig | ConvertFrom-Json
            } catch {
                throw "El archivo JSON de $ClientName no es valido. No se modifico: $ConfigFile"
            }
        }
    }

    $mcpServersProperty = $config.PSObject.Properties["mcpServers"]
    if ($null -eq $mcpServersProperty) {
        $config | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value ([PSCustomObject]@{})
    } elseif ($null -eq $config.mcpServers) {
        $config.mcpServers = [PSCustomObject]@{}
    }

    $mcpDefinition = [PSCustomObject]@{
        command = "$env:SystemRoot\System32\cmd.exe"
        args = @("/d", "/c", $ServerCommand)
    }

    $existingServer = $config.mcpServers.PSObject.Properties["context-mcp"]
    if ($null -eq $existingServer) {
        $config.mcpServers | Add-Member -MemberType NoteProperty -Name "context-mcp" -Value $mcpDefinition
    } else {
        $config.mcpServers."context-mcp" = $mcpDefinition
    }

    Backup-ConfigFile -Path $ConfigFile
    Write-Utf8NoBom -Path $ConfigFile -Content ($config | ConvertTo-Json -Depth 20)
    Write-Host "[OK] $ClientName configurado correctamente con context-mcp." -ForegroundColor Green
}

$projectRoot = $PSScriptRoot
$contextMcpDir = Join-Path $env:USERPROFILE ".context-mcp"
$projectsDir = Join-Path $contextMcpDir "projects"
$junctionPath = Join-Path $projectsDir "personal_-_tfm"
$targetContextDir = Join-Path $projectRoot ".context"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Configurador de Memoria de IA compartida para el TFM    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Ruta del proyecto: $projectRoot" -ForegroundColor Yellow

foreach ($requiredCommand in @("git", "node", "npm")) {
    if (!(Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
        Write-Host "[AVISO] No se encontro '$requiredCommand' en PATH. Instala el requisito antes de usar los asistentes." -ForegroundColor Yellow
    }
}

$contextMcpCommand = Install-ContextMcpRuntime -Version $ContextMcpVersion
Write-Host "[OK] Runtime MCP estable: $contextMcpCommand" -ForegroundColor Green

# 1. Asegurar directorios
if (!(Test-Path $projectsDir)) {
    New-Item -ItemType Directory -Path $projectsDir -Force | Out-Null
    Write-Host "[OK] Creado directorio: $projectsDir" -ForegroundColor Green
}
if (!(Test-Path -LiteralPath $targetContextDir)) {
    New-Item -ItemType Directory -Path $targetContextDir -Force | Out-Null
    Write-Host "[OK] Creada carpeta de memoria del proyecto: $targetContextDir" -ForegroundColor Green
}

# 2. Crear o reemplazar Junction
if (Test-Path $junctionPath) {
    $item = Get-Item $junctionPath
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        Write-Host "[INFO] El enlace (Junction) ya existía. Eliminando enlace previo..." -ForegroundColor DarkGray
        $item.Delete()
    } else {
        $backup = Join-Path $projectsDir ("personal_-_tfm_backup_" + (Get-Date -Format "yyyyMMddHHmmss"))
        Write-Host "[INFO] Carpeta existente detectada. Moviendo a respaldo: $backup" -ForegroundColor Yellow
        Rename-Item -Path $junctionPath -NewName (Split-Path $backup -Leaf)
    }
}

New-Item -ItemType Junction -Path $junctionPath -Target $targetContextDir | Out-Null
Write-Host "[OK] Enlace Junction creado exitosamente con la carpeta .context de Git." -ForegroundColor Green

# 3. Registrar proyecto en projects.json
$projectsJsonPath = Join-Path $contextMcpDir "projects.json"
$projectsData = @{ projects = @() }

if (Test-Path $projectsJsonPath) {
    try {
        $projectsData = Get-Content $projectsJsonPath -Raw | ConvertFrom-Json
    } catch {
        $projectsData = [PSCustomObject]@{ projects = @() }
    }
}

# Buscar si ya existe Personal - TFM
$found = $false
foreach ($p in $projectsData.projects) {
    if ($p.name -eq "Personal - TFM") {
        $p.rootPath = $projectRoot
        $p.dataDir = "projects/personal_-_tfm"
        $found = $true
        break
    }
}

if (!$found) {
    $newProj = [PSCustomObject]@{
        id = [System.Guid]::NewGuid().ToString()
        name = "Personal - TFM"
        createdAt = (Get-Date).ToString("o")
        dataDir = "projects/personal_-_tfm"
        rootPath = $projectRoot
    }
    $projectsData.projects += $newProj
}

Backup-ConfigFile -Path $projectsJsonPath
Write-Utf8NoBom -Path $projectsJsonPath -Content ($projectsData | ConvertTo-Json -Depth 5)
Write-Host "[OK] projects.json actualizado con la ruta de este equipo." -ForegroundColor Green

# 4. Configurar Claude Desktop si existe
$claudeConfigDir = Join-Path $env:APPDATA "Claude"
$claudeConfigFile = Join-Path $claudeConfigDir "claude_desktop_config.json"
if (Test-Path $claudeConfigDir) {
    try {
        Set-ContextMcpInJsonConfig -ConfigFile $claudeConfigFile -ClientName "Claude Desktop" -ServerCommand $contextMcpCommand
    } catch {
        Write-Host "[AVISO] No se pudo actualizar claude_desktop_config.json automáticamente: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] Claude Desktop no parece instalado; se omite su configuracion." -ForegroundColor DarkGray
}

# 5. Configurar Antigravity si existe
$antigravityHome = Join-Path $env:USERPROFILE ".gemini"
$antigravityConfigFile = Join-Path $antigravityHome "config\mcp_config.json"
if (Test-Path -LiteralPath $antigravityHome) {
    try {
        Set-ContextMcpInJsonConfig -ConfigFile $antigravityConfigFile -ClientName "Antigravity" -ServerCommand $contextMcpCommand
    } catch {
        Write-Host "[AVISO] No se pudo actualizar mcp_config.json de Antigravity automaticamente: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] Antigravity no parece instalado; se omite su configuracion." -ForegroundColor DarkGray
}

# 6. Configurar Cursor si existe
$cursorDir = Join-Path $env:USERPROFILE ".cursor"
$cursorConfigFile = Join-Path $cursorDir "mcp.json"
if (Test-Path -LiteralPath $cursorDir) {
    try {
        Set-ContextMcpInJsonConfig -ConfigFile $cursorConfigFile -ClientName "Cursor" -ServerCommand $contextMcpCommand
    } catch {
        Write-Host "[AVISO] No se pudo actualizar mcp.json de Cursor automaticamente: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] Cursor no parece instalado; se omite su configuracion." -ForegroundColor DarkGray
}

# 7. Configurar Codex / ChatGPT si existe
$codexDir = Join-Path $env:USERPROFILE ".codex"
$codexConfigFile = Join-Path $codexDir "config.toml"
if (Test-Path $codexDir) {
    try {
        $content = ""
        $hasUtf8Bom = $false
        if (Test-Path $codexConfigFile) {
            $content = Get-Content $codexConfigFile -Raw
            $bytes = [System.IO.File]::ReadAllBytes($codexConfigFile)
            $hasUtf8Bom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
        }
        $serverPathToml = $contextMcpCommand.Replace("\", "\\")
        $cmdPathToml = "$env:SystemRoot\System32\cmd.exe".Replace("\", "\\")
        $serverBlock = @"
[mcp_servers.context-mcp]
command = "$cmdPathToml"
args    = ["/d", "/c", "$serverPathToml"]
default_tools_approval_mode = "prompt"
"@
        $serverPattern = '(?ms)^\[mcp_servers\.context-mcp\]\r?\n.*?(?=^\[|\z)'
        if ($content -match $serverPattern) {
            $updatedContent = [regex]::Replace($content, $serverPattern, "$serverBlock`r`n")
        } else {
            $updatedContent = $content + @"

[mcp_servers.context-mcp]
command = "$cmdPathToml"
args    = ["/d", "/c", "$serverPathToml"]
default_tools_approval_mode = "prompt"
"@
        }

        foreach ($toolName in @("context", "search", "codegraph_query")) {
            $toolSection = "[mcp_servers.context-mcp.tools.$toolName]"
            if ($updatedContent -notmatch [regex]::Escape($toolSection)) {
                $updatedContent += @"

$toolSection
approval_mode = "approve"
"@
            }
        }

        $projectSection = "[projects.'$($projectRoot.ToLower())']"
        if ($updatedContent -notmatch [regex]::Escape($projectSection)) {
            $updatedContent += @"

$projectSection
trust_level = "trusted"
"@
        }

        if ($updatedContent -ne $content -or $hasUtf8Bom) {
            Backup-ConfigFile -Path $codexConfigFile
            Write-Utf8NoBom -Path $codexConfigFile -Content $updatedContent
            Write-Host "[OK] ChatGPT/Codex configurado correctamente con context-mcp." -ForegroundColor Green
        } else {
            Write-Host "[OK] ChatGPT/Codex ya estaba configurado." -ForegroundColor Green
        }
    } catch {
        Write-Host "[AVISO] No se pudo actualizar .codex/config.toml automáticamente: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] ChatGPT/Codex no parece instalado; se omite su configuracion." -ForegroundColor DarkGray
}

Write-Host "`nTodo listo! La memoria de la IA ahora lee y escribe directamente desde Git." -ForegroundColor Cyan

# 8. Configurar Kimchi Studio si existe
$kimchiHarnessDir = Join-Path $env:USERPROFILE ".config\kimchi\harness"
$kimchiMcpFile   = Join-Path $kimchiHarnessDir "mcp.json"
$kimchiTrustFile = Join-Path $kimchiHarnessDir "trust.json"
$kimchiDesktopDir = Join-Path $env:USERPROFILE ".config\kimchi\desktop"
$kimchiProjectsFile = Join-Path $kimchiDesktopDir "projects.json"

if (Test-Path -LiteralPath $kimchiHarnessDir) {
    try {
        # --- mcp.json ---
        $kimchiMcp = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
        if (Test-Path -LiteralPath $kimchiMcpFile) {
            try { $kimchiMcp = (Get-Content -LiteralPath $kimchiMcpFile -Raw) | ConvertFrom-Json } catch {}
        }
        if (-not $kimchiMcp.PSObject.Properties["mcpServers"]) {
            $kimchiMcp | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value ([PSCustomObject]@{})
        }
        $kimchiMcpDef = [PSCustomObject]@{
            command = "$env:SystemRoot\System32\cmd.exe"
            args    = @("/d", "/c", "npx -y context-mcp-server@latest")
        }
        if ($kimchiMcp.mcpServers.PSObject.Properties["context-mcp"]) {
            $kimchiMcp.mcpServers."context-mcp" = $kimchiMcpDef
        } else {
            $kimchiMcp.mcpServers | Add-Member -MemberType NoteProperty -Name "context-mcp" -Value $kimchiMcpDef
        }
        Backup-ConfigFile -Path $kimchiMcpFile
        Write-Utf8NoBom -Path $kimchiMcpFile -Content ($kimchiMcp | ConvertTo-Json -Depth 10)

        # --- trust.json ---
        $trustData = [PSCustomObject]@{}
        if (Test-Path -LiteralPath $kimchiTrustFile) {
            try { $trustData = (Get-Content -LiteralPath $kimchiTrustFile -Raw) | ConvertFrom-Json } catch {}
        }
        if (-not $trustData.PSObject.Properties["$projectRoot"]) {
            $trustData | Add-Member -MemberType NoteProperty -Name $projectRoot -Value $true
        }
        Write-Utf8NoBom -Path $kimchiTrustFile -Content ($trustData | ConvertTo-Json -Depth 5)

        # --- projects.json ---
        if (Test-Path -LiteralPath $kimchiDesktopDir) {
            $kimchiProjects = [PSCustomObject]@{ version = 2; projects = @() }
            if (Test-Path -LiteralPath $kimchiProjectsFile) {
                try { $kimchiProjects = (Get-Content -LiteralPath $kimchiProjectsFile -Raw) | ConvertFrom-Json } catch {}
            }
            $alreadyRegistered = $kimchiProjects.projects | Where-Object { $_.folderPath -eq $projectRoot }
            if (-not $alreadyRegistered) {
                $newEntry = [PSCustomObject]@{
                    id         = "personal-tfm-$(([System.Environment]::MachineName).ToLower())"
                    name       = "Personal - TFM"
                    repository = "https://github.com/QSMANU/Personal---TFM"
                    folderPath = $projectRoot
                    createdAt  = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
                    updatedAt  = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
                }
                $kimchiProjects.projects += $newEntry
                Write-Utf8NoBom -Path $kimchiProjectsFile -Content ($kimchiProjects | ConvertTo-Json -Depth 10)
            }
        }

        Write-Host "[OK] Kimchi Studio configurado correctamente con context-mcp." -ForegroundColor Green
    } catch {
        Write-Host "[AVISO] No se pudo configurar Kimchi Studio automaticamente: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] Kimchi Studio no parece instalado; se omite su configuracion." -ForegroundColor DarkGray
}

# 9. DeepSeek Harness — ya usa .mcp.json en la raiz del proyecto (incluido en el repo)
$deepseekInstalled = Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA "Programs\DeepSeek Harness")
if ($deepseekInstalled) {
    $mcpJsonDst = Join-Path $projectRoot ".mcp.json"
    if (-not (Test-Path -LiteralPath $mcpJsonDst)) {
        $mcpJsonContent = @'
{
  "mcpServers": {
    "context-mcp": {
      "type": "stdio",
      "command": "cmd.exe",
      "args": ["/c", "npx", "-y", "context-mcp-server@latest"]
    }
  }
}
'@
        Write-Utf8NoBom -Path $mcpJsonDst -Content $mcpJsonContent
    }
    Write-Host "[OK] DeepSeek Harness configurado (.mcp.json presente en la raiz del proyecto)." -ForegroundColor Green
} else {
    Write-Host "[INFO] DeepSeek Harness no parece instalado; se omite su configuracion." -ForegroundColor DarkGray
}

Write-Host "Reinicia los clientes de IA que estuvieran abiertos y verifica context.resume." -ForegroundColor Cyan
Write-Host "Antes de trabajar ejecuta git pull; al terminar guarda, confirma y sube los cambios.`n" -ForegroundColor Green
