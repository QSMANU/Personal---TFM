<#
.SYNOPSIS
    Script de configuración automática de context-mcp para sincronización de TFM con Git.
#>

$ErrorActionPreference = "Stop"

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
        [Parameter(Mandatory = $true)][string]$ClientName
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
        command = "cmd.exe"
        args = @("/c", "npx", "-y", "context-mcp-server@latest")
    }

    $existingServer = $config.mcpServers.PSObject.Properties["context-mcp"]
    if ($null -eq $existingServer) {
        $config.mcpServers | Add-Member -MemberType NoteProperty -Name "context-mcp" -Value $mcpDefinition
    } else {
        $config.mcpServers."context-mcp" = $mcpDefinition
    }

    Backup-ConfigFile -Path $ConfigFile
    $config | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ConfigFile -Encoding UTF8
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

foreach ($requiredCommand in @("git", "node", "npx")) {
    if (!(Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
        Write-Host "[AVISO] No se encontro '$requiredCommand' en PATH. Instala el requisito antes de usar los asistentes." -ForegroundColor Yellow
    }
}

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
$projectsData | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $projectsJsonPath -Encoding UTF8
Write-Host "[OK] projects.json actualizado con la ruta de este equipo." -ForegroundColor Green

# 4. Configurar Claude Desktop si existe
$claudeConfigDir = Join-Path $env:APPDATA "Claude"
$claudeConfigFile = Join-Path $claudeConfigDir "claude_desktop_config.json"
if (Test-Path $claudeConfigDir) {
    try {
        Set-ContextMcpInJsonConfig -ConfigFile $claudeConfigFile -ClientName "Claude Desktop"
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
        Set-ContextMcpInJsonConfig -ConfigFile $antigravityConfigFile -ClientName "Antigravity"
    } catch {
        Write-Host "[AVISO] No se pudo actualizar mcp_config.json de Antigravity automaticamente: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] Antigravity no parece instalado; se omite su configuracion." -ForegroundColor DarkGray
}

# 6. Configurar Codex / ChatGPT si existe
$codexDir = Join-Path $env:USERPROFILE ".codex"
$codexConfigFile = Join-Path $codexDir "config.toml"
if (Test-Path $codexDir) {
    try {
        $content = ""
        if (Test-Path $codexConfigFile) {
            $content = Get-Content $codexConfigFile -Raw
        }
        $updatedContent = $content
        if ($updatedContent -notmatch "\[mcp_servers\.context-mcp\]") {
            $updatedContent += @"

[mcp_servers.context-mcp]
command = "npx"
args    = ["-y", "context-mcp-server@latest"]
default_tools_approval_mode = "prompt"

[mcp_servers.context-mcp.tools.context]
approval_mode = "approve"

[mcp_servers.context-mcp.tools.search]
approval_mode = "approve"

[mcp_servers.context-mcp.tools.codegraph_query]
approval_mode = "approve"
"@
        }

        $projectSection = "[projects.'$($projectRoot.ToLower())']"
        if ($updatedContent -notmatch [regex]::Escape($projectSection)) {
            $updatedContent += @"

$projectSection
trust_level = "trusted"
"@
        }

        if ($updatedContent -ne $content) {
            Backup-ConfigFile -Path $codexConfigFile
            Set-Content -LiteralPath $codexConfigFile -Value $updatedContent -Encoding UTF8
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
Write-Host "Reinicia los clientes de IA que estuvieran abiertos y verifica context.resume." -ForegroundColor Cyan
Write-Host "Antes de trabajar ejecuta git pull; al terminar guarda, confirma y sube los cambios.`n" -ForegroundColor Green
