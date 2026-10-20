---
id: ctx-instalacion
project: Personal - Shared-MCP-Local
title: Estado de la instalación en cada app
type: reference
tags: instalacion, apps, configuracion
files: D:\Repositories\shared-mcp-local\state\install-manifest.json
---
Todas apuntan al mismo servidor: `node D:\Repositories\shared-mcp-local\src\stdio.js`
con `SHARED_MCP_APP` distinto en cada una (sirve para la memoria por app y la auditoría).

| App | Archivo | Clave | App-id |
|---|---|---|---|
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` (o `LocalCache\Roaming\Claude\...` si es la versión de Microsoft Store) | `mcpServers` | claude-desktop |
| Cursor | `%USERPROFILE%\.cursor\mcp.json` | `mcpServers` | cursor |
| Antigravity (agente **e** IDE) | `%USERPROFILE%\.gemini\config\mcp_config.json` | `mcpServers` | antigravity |
| Kimi Code | `%USERPROFILE%\.kimi-code\mcp.json` | `mcpServers` | kimi-code |
| Codex / ChatGPT desktop | `%USERPROFILE%\.codex\config.toml` | `[mcp_servers.*]` | codex |
| VS Code (Copilot) | `%APPDATA%\Code\User\mcp.json` | `servers` + `type: stdio` | vscode |
| Copilot global | `%USERPROFILE%\.copilot\mcp-config.json` | `mcpServers` | copilot |
| DeepSeek Harness | `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` | `- insert:` + `dsh-mcp-client` | dsh |

**Particularidades confirmadas leyendo los binarios de cada app:**
- Antigravity IDE **no** usa `%APPDATA%\Antigravity IDE\User\mcp.json`: comparte el archivo del agente.
- Kimi Code admite además configuración por proyecto en `<repo>\.kimi-code\mcp.json`.
- El instalador detecta apps por comando, ruta, ejecutable y registro de Windows; `-ListApps`, `-Apps` y
  `-ExcludeApps` permiten revisar o forzar la selección.
- Codex tiene además `approval_mode = "prompt"` para `shared_publish` y `shared_forget`: doble candado.
- VS Code lee además `%USERPROFILE%\.copilot\mcp-config.json` (config global de Copilot).

**Retirado:** `context-mcp-server` (terceros) de las 5 apps donde estaba, y sus hooks automáticos de
Claude Code. Sus datos siguen en `C:\Users\QsManu-Movil\.context-mcp`, intactos.

**Revisión real del 2026-10-20:** Kimi Code está desinstalada; sus restos no cuentan como instalación.
GitHub Copilot CLI no está detectado. Se repararon las entradas faltantes de VS Code y DeepSeek Harness
(backup del perfil YAML). Claude Desktop, Cursor, Antigravity y VS Code responden al handshake MCP con
8 herramientas; Codex y DeepSeek tienen el registro presente. Confirmar también `shared_status` dentro
de cada app después de recargar. Perplexity está instalada desde Store, pero en Windows requiere
conector remoto; su soporte local está limitado a macOS según su documentación oficial.

El instalador incorpora `-VerifyOnly`, verificación al finalizar y avisos para configuración residual
e integración manual. Las pruebas de detección cubren restos de Kimi, paquetes Store, JSON inválido,
servidor deshabilitado y rutas incorrectas.
