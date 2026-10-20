---
id: ctx-tareas
project: Personal - Shared-MCP-Local
title: Tareas pendientes y próximos pasos
type: task
tags: pendientes, tareas
files: D:\Repositories\shared-mcp-local\tools\import-context-mcp.mjs
---
**Hecho en esta ronda (2026-10-19):**

1. **Borrado con aprobación:** `shared_forget` en modo `ask` ya crea un pendiente (`action: "forget"`) que
   aparece en `sharedctx pending` y se aplica con `sharedctx approve <id>`.
2. **Escritura atómica e ids seguros:** temporal + rename con reintentos ante `EBUSY`; `assertSafeId` rechaza
   path traversal y nombres reservados de Windows.
3. **Caché del grafo invalidada por `mtime`:** editar una entrada ya no devuelve duplicados viejos.
4. **Panel:** zoom/pan, botón Centrar, búsqueda en vivo, colores por tipo, Markdown en el detalle,
   exportación Mermaid/PNG y física que duerme cuando el grafo está quieto.
5. **Docs y apps:** Kimi Code reemplaza a Kimchi Studio; README documenta `tools\atajos.ps1` y
   `sharedctx ui --ensure`; instalador con detección de apps (`-ListApps`, `-Apps`, `-ExcludeApps`).
6. **Candado `readonly` coherente:** el CLI (`add`, `handoff`, `note`, `ingest`, `forget`, `approve`) ahora
   también rechaza escribir en modo `readonly`, no solo en `off`.

**Pendiente, en orden:**

1. **Reiniciar las apps** que aún tengan el proceso MCP viejo: Claude Desktop (probar `shared_status` y
   revisar `~\.shared-mcp\dashboard.log` si vuelve a agotar tiempo), Cursor, Antigravity, Kimi Code y
   VS Code. DeepSeek Harness recarga el perfil en caliente.
2. **Decidir la importación** del contexto viejo de `context-mcp` (46 entradas en 11 proyectos):
   ```powershell
   node tools\import-context-mcp.mjs --list
   node tools\import-context-mcp.mjs --interactive
   ```
   Ojo: ahí hay mezcla de personal (`personal-tfm`, `casa-meco`) y laboral (`tao-*`, `internal-*`).
3. **Verificar app por app** que `QSMANU-LOCAL-SHARED-MCP` figura como conectado y que
   `shared_status` detecta el proyecto correcto.
4. **Opcional:** escribir `.sharedctx.json` en cada repo de trabajo para fijar el nombre del proyecto
   (`{ "project": "oat-architecture" }`).
5. **Opcional:** revisar si conviene `sharedctx mode on` para algún proyecto donde aprobar cada
   publicación resulte molesto. Para cortar todo: `sharedctx mode off`.

**Sin hacer a propósito:** no se importó nada del contexto viejo (es decisión del usuario, y hay datos
personales mezclados); no se instaló el arranque automático del panel ni se crearon accesos directos sin
que el usuario lo pidiera.
