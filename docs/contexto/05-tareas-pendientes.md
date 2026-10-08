---
id: ctx-tareas
project: Personal - Shared-MCP-Local
title: Tareas pendientes y próximos pasos
type: task
tags: pendientes, tareas
files: D:\Repositories\shared-mcp-local\tools\import-context-mcp.mjs
---
**Pendiente, en orden:**

1. **Reiniciar las apps** para que tomen el servidor nuevo: Claude Desktop, Cursor, Antigravity, Kimchi
   Studio y VS Code. (DeepSeek Harness ya está activo: recarga el perfil en caliente.)
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
   publicación resulte molesto.

**Sin hacer a propósito:** no se importó nada del contexto viejo (es decisión del usuario, y hay datos
personales mezclados), y no se publicó nada en su nombre hasta que lo pidió.
