---
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
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` | claude-desktop |
| Cursor | `%USERPROFILE%\.cursor\mcp.json` | `mcpServers` | cursor |
| Antigravity (agente **e** IDE) | `%USERPROFILE%\.gemini\config\mcp_config.json` | `mcpServers` | antigravity |
| Kimchi Studio | `%USERPROFILE%\.config\kimchi\harness\mcp.json` | `mcpServers` | kimchi |
| Codex / ChatGPT desktop | `%USERPROFILE%\.codex\config.toml` | `[mcp_servers.*]` | codex |
| VS Code (Copilot) | `%APPDATA%\Code\User\mcp.json` | `servers` + `type: stdio` | vscode |
| Copilot global | `%USERPROFILE%\.copilot\mcp-config.json` | `mcpServers` | copilot |
| DeepSeek Harness | `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` | `- insert:` + `dsh-mcp-client` | dsh |

**Particularidades confirmadas leyendo los binarios de cada app:**
- Antigravity IDE **no** usa `%APPDATA%\Antigravity IDE\User\mcp.json`: comparte el archivo del agente.
- Kimchi discrimina por estructura, no por `type`: `command` ⇒ stdio, `url` ⇒ remoto.
- Codex tiene además `approval_mode = "prompt"` para `shared_publish` y `shared_forget`: doble candado.
- VS Code lee además `%USERPROFILE%\.copilot\mcp-config.json` (config global de Copilot).

**Retirado:** `context-mcp-server` (terceros) de las 5 apps donde estaba, y sus hooks automáticos de
Claude Code. Sus datos siguen en `C:\Users\QsManu-Movil\.context-mcp`, intactos.
