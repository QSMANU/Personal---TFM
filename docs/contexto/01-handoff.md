---
id: ctx-handoff
project: Personal - Shared-MCP-Local
title: Handoff · dónde quedé con QSMANU-LOCAL-SHARED-MCP
type: handoff
tags: handoff, sharedctx, mcp
files: D:\Repositories\shared-mcp-local\README.md, D:\Repositories\shared-mcp-local\install.ps1, D:\Repositories\shared-mcp-local\src\server.js
---
**Estado:** funcionando y verificado en las 8 apps. El proyecto está en `D:\Repositories\shared-mcp-local`.

**Qué es:** un servidor MCP local (`QSMANU-LOCAL-SHARED-MCP`, comando `sharedctx`) que comparte contexto
entre herramientas de AI **solo cuando el usuario lo pide**, separado por proyecto, con todo en texto plano
en `C:\Users\QsManu-Movil\.shared-mcp`.

**Qué quedó hecho:**
1. Servidor MCP con 8 herramientas (`shared_status`, `shared_pull`, `shared_list`, `shared_publish`,
   `shared_pending`, `shared_use_project`, `shared_forget`). Ninguna toca archivos, shell ni git.
2. Consentimiento en 4 modos (`off` / `readonly` / `ask` / `on`), por defecto `ask`: cada publicación
   queda pendiente hasta `sharedctx approve <id>`. El modo **no** es una herramienta MCP.
3. Detección automática de proyecto: workspace de DSH (por el título), ruta/cwd, memoria por app,
   proyecto activo global y alias. Empareja nombres ignorando mayúsculas/acentos/guiones.
4. Instalado en Claude Desktop, Cursor, Codex/ChatGPT desktop, Antigravity (agente e IDE), Kimchi Studio,
   VS Code Copilot (+ Copilot global) y DeepSeek Harness.
5. Publicar sin la app: `--clipboard`, `sharedctx note`, bandeja + `sharedctx ingest`, `--file`.
6. Importación **selectiva** del contexto viejo de `context-mcp` (`--list`, `--interactive`, `--only`,
   `--exclude`, `--since`, `--types`).
7. Reversión completa probada: `install.ps1 -Restore` devuelve las apps al estado previo exacto.
8. **Panel web local** (`sharedctx ui`): grafo de proyectos y apps, apps conectadas por heartbeat real,
   métodos MCP con su esquema, pendientes y auditoría. Solo lectura y solo loopback.

**Verificación:** 51 pruebas en verde (28 de protocolo MCP + 10 de robustez + 13 del panel), más la ida y
vuelta de instalación/reversión probada de verdad.

**Próximo paso concreto:** reiniciar Claude Desktop, Cursor, Antigravity, Kimchi y VS Code para que tomen
el servidor nuevo; después decidir la importación del contexto viejo con
`node tools\import-context-mcp.mjs --interactive`.

**Riesgos a tener presentes:** si una app no puede detectar el proyecto, cae al último usado en esa app o
al proyecto activo global (`sharedctx use`). Para cortar todo: `sharedctx mode off`.
