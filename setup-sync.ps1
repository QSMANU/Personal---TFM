<#
.SYNOPSIS
    Script de configuración automática de context-mcp para sincronización de TFM con Git.
#>

$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$contextMcpDir = Join-Path $env:USERPROFILE ".context-mcp"
$projectsDir = Join-Path $contextMcpDir "projects"
$junctionPath = Join-Path $projectsDir "personal_-_tfm"
$targetContextDir = Join-Path $projectRoot ".context"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Configurador de Memoria de IA compartida para el TFM    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Ruta del proyecto: $projectRoot" -ForegroundColor Yellow

# 1. Asegurar directorios
if (!(Test-Path $projectsDir)) {
    New-Item -ItemType Directory -Path $projectsDir -Force | Out-Null
    Write-Host "[OK] Creado directorio: $projectsDir" -ForegroundColor Green
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

$projectsData | ConvertTo-Json -Depth 5 | Set-Content $projectsJsonPath -Encoding UTF8
Write-Host "[OK] projects.json actualizado con la ruta de este equipo." -ForegroundColor Green

# 4. Configurar Claude Desktop si existe
$claudeConfigDir = Join-Path $env:APPDATA "Claude"
$claudeConfigFile = Join-Path $claudeConfigDir "claude_desktop_config.json"
if (Test-Path $claudeConfigDir) {
    try {
        $claudeConfig = @{ mcpServers = @{} }
        if (Test-Path $claudeConfigFile) {
            $claudeConfig = Get-Content $claudeConfigFile -Raw | ConvertFrom-Json
            if (!$claudeConfig.mcpServers) {
                $claudeConfig | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value ([PSCustomObject]@{})
            }
        }
        $mcpObj = [PSCustomObject]@{
            command = "cmd.exe"
            args = @("/c", "npx", "-y", "context-mcp-server@latest")
        }
        $claudeConfig.mcpServers | Add-Member -MemberType NoteProperty -Name "context-mcp" -Value $mcpObj -Force
        $claudeConfig | ConvertTo-Json -Depth 10 | Set-Content $claudeConfigFile -Encoding UTF8
        Write-Host "[OK] Claude Desktop configurado correctamente con context-mcp." -ForegroundColor Green
    } catch {
        Write-Host "[AVISO] No se pudo actualizar claude_desktop_config.json automáticamente: $_" -ForegroundColor Yellow
    }
}

# 5. Configurar Codex / ChatGPT si existe
$codexDir = Join-Path $env:USERPROFILE ".codex"
$codexConfigFile = Join-Path $codexDir "config.toml"
if (Test-Path $codexDir) {
    try {
        $content = ""
        if (Test-Path $codexConfigFile) {
            $content = Get-Content $codexConfigFile -Raw
        }
        if ($content -notmatch "\[mcp_servers\.context-mcp\]") {
            $block = @"

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

[projects.'$($projectRoot.ToLower())']
trust_level = "trusted"
"@
            Add-Content -Path $codexConfigFile -Value $block
            Write-Host "[OK] ChatGPT/Codex configurado correctamente con context-mcp." -ForegroundColor Green
        }
    } catch {
        Write-Host "[AVISO] No se pudo actualizar .codex/config.toml automáticamente: $_" -ForegroundColor Yellow
    }
}

Write-Host "`nTodo listo! La memoria de la IA ahora lee y escribe directamente desde Git." -ForegroundColor Cyan
Write-Host "Cada vez que hagas git pull o git push, las notas de la IA se actualizaran entre vosotros.`n" -ForegroundColor Green
