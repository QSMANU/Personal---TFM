---
id: ctx-handoff
project: Personal - Shared-MCP-Local
title: Handoff · dónde quedé con QSMANU-LOCAL-SHARED-MCP
type: handoff
tags: handoff, sharedctx, mcp
files: D:\Repositories\shared-mcp-local\README.md, D:\Repositories\shared-mcp-local\install.ps1, D:\Repositories\shared-mcp-local\src\server.js
---
**Estado:** funcionando. Ronda de mejora cerrada el **2026-10-19** (código, panel y documentación).
El proyecto está en `D:\Repositories\shared-mcp-local`.

**Qué es:** un servidor MCP local (`QSMANU-LOCAL-SHARED-MCP`, comando `sharedctx`) que comparte contexto
entre herramientas de AI **solo cuando el usuario lo pide**, separado por proyecto, con todo en texto plano
en `C:\Users\QsManu-Movil\.shared-mcp`.

**Qué quedó hecho:**
1. Servidor MCP con 8 herramientas (`shared_status`, `shared_pull`, `shared_list`, `shared_publish`,
   `shared_related`, `shared_pending`, `shared_use_project`, `shared_forget`). Ninguna toca archivos,
   shell ni git.
2. Consentimiento en 4 modos (`off` / `readonly` / `ask` / `on`), por defecto `ask`: publicar **y borrar**
   quedan pendientes hasta `sharedctx approve <id>`. El modo **no** es una herramienta MCP.
3. Detección automática de proyecto: workspace de DSH (por el título), ruta/cwd, memoria por app,
   proyecto activo global y alias. Empareja nombres ignorando mayúsculas/acentos/guiones.
4. Instalado en Claude Desktop (incluida la variante Microsoft Store), Cursor, Codex/ChatGPT desktop,
   Antigravity (agente e IDE), **Kimi Code**, VS Code Copilot (+ Copilot global) y DeepSeek Harness.
5. Publicar sin la app: `--clipboard`, `sharedctx note`, bandeja + `sharedctx ingest`, `--file`.
6. Importación **selectiva** del contexto viejo de `context-mcp` (`--list`, `--interactive`, `--only`,
   `--exclude`, `--since`, `--types`).
7. Reversión completa probada: `install.ps1 -Restore` devuelve las apps al estado previo exacto.
8. **Panel web local** (`sharedctx ui`): grafos de proyectos/apps y de entradas, apps conectadas por
   heartbeat real, métodos MCP, pendientes y auditoría. Zoom/pan, búsqueda en vivo, colores por tipo,
   Markdown en el detalle, exportación DOT/Mermaid/PNG y física que duerme cuando está quieto.
9. **Robustez:** escrituras atómicas con reintentos ante `EBUSY`, ids validados contra path traversal y
   nombres reservados, y caché de similitudes invalidada por `mtime`.

**Verificación:** suite completa en verde (protocolo MCP, robustez, relaciones, panel y detección de apps),
más la ida y vuelta de instalación/reversión probada de verdad.

**Próximo paso concreto:** reiniciar las apps que tengan el proceso MCP viejo (Claude Desktop, Cursor,
Antigravity, Kimi Code y VS Code) y verificar `shared_status`; después decidir la importación del contexto
viejo con `node tools\import-context-mcp.mjs --interactive`.

**Riesgos a tener presentes:** si una app no puede detectar el proyecto, cae al último usado en esa app o
al proyecto activo global (`sharedctx use`). Para cortar todo: `sharedctx mode off`.
