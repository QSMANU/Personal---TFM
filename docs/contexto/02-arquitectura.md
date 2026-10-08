---
id: ctx-arquitectura
project: Personal - Shared-MCP-Local
title: Arquitectura y mapa de archivos
type: reference
tags: arquitectura, sharedctx
files: D:\Repositories\shared-mcp-local\src\store.js, D:\Repositories\shared-mcp-local\src\server.js, D:\Repositories\shared-mcp-local\src\cli.js
---
**Dónde está cada cosa**

| Ruta | Qué es |
|---|---|
| `src\store.js` | almacén en disco: modos, identidad de proyectos (alias/rutas/similitud), bandeja, auditoría |
| `src\server.js` | las 7 herramientas MCP + el protocolo opt-in que se inyecta como *instructions* |
| `src\stdio.js` / `src\http.js` | transportes: stdio (todas las apps) y Streamable HTTP en loopback |
| `src\cli.js` | comando `sharedctx` (modo, aprobaciones, bandeja, export, alias, use) |
| `install.ps1` | instalador idempotente: backups, manifiesto, `-Restore`, `-DryRun`, `-KeepContextMcp` |
| `agents\contexto-compartido.md` | bloque de instrucciones que se inyecta en CLAUDE.md/AGENTS.md/GEMINI.md/Cursor/Kimchi |
| `docs\CASOS-DE-USO.md` | casos de uso por escenario (personal vs laboral, app bloqueada, ChatGPT web) |
| `docs\mcp-config-recon-report.md` | auditoría de los esquemas MCP reales de cada app, con evidencia |
| `docs\contexto\*.md` | **las entradas publicadas en este mismo contexto** (fuente versionada) |
| `test\mcp-smoke.mjs` / `test\robustness.mjs` | 28 + 10 pruebas |

**Almacén de datos** (`C:\Users\QsManu-Movil\.shared-mcp`)

```
config.json      modo de consentimiento (off|readonly|ask|on), host y puerto
active.json      proyecto activo global (sharedctx use)
state.json       último proyecto usado por cada app
audit.log        JSONL: quién leyó/publicó/aprobó y cuándo
pending\<id>.json  publicaciones esperando aprobación
projects\<slug>\project.json   nombre, alias y rutas conocidas
projects\<slug>\handoff.md     nota de traspaso
projects\<slug>\entries\*.md   contexto publicado (front-matter + Markdown)
inbox\           archivos sueltos para publicar con `sharedctx ingest`
```

**Por qué así:** texto plano y por proyecto = auditable, greppable, sin base de datos que se corrompa,
y compatible con herramientas que no hablan MCP (se exporta a Markdown para ChatGPT web).
