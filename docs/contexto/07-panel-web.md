---
id: ctx-panel
project: Personal - Shared-MCP-Local
title: Panel web local — sharedctx ui
type: reference
tags: panel, ui, grafo, monitoreo
files: D:\Repositories\shared-mcp-local\src\dashboard.js, D:\Repositories\shared-mcp-local\ui\app.js
---
**Qué es:** una interfaz web local para ver el estado del contexto compartido, sin depender de ninguna IA.

```powershell
sharedctx ui --open          # http://127.0.0.1:3120
sharedctx ui --port 3200
```

**Qué muestra**

| Sección | Contenido |
|---|---|
| Tarjetas | modo de consentimiento, proyectos, entradas, tamaño en disco, apps conectadas **ahora**, pendientes, última actividad |
| Grafo | proyectos (círculos, tamaño = entradas) y apps (rombos) unidos por el contexto que aportó cada una; las conectadas en vivo se marcan en verde. Arrastrable, clic en un proyecto abre sus entradas |
| Proyectos | entradas, última actualización, handoff completo, desglose por app y tipo, actividad de 30 días |
| Apps conectadas | configurada sí/no (leyendo el archivo de cada app), sesiones MCP vivas con pid y transporte, proyecto actual, proyectos con contexto |
| Métodos MCP | las 8 herramientas con descripción y JSON Schema, más el protocolo opt-in que recibe el modelo |
| Pendientes | lo que espera aprobación, con el comando exacto para aprobarlo |
| Auditoría | últimos eventos de `audit.log` |

**Cómo sabe qué apps están conectadas:** cada proceso MCP escribe un heartbeat en
`~\.shared-mcp\sessions\<app>-<pid>.json` al arrancar y en cada llamada a una herramienta. El panel
muestra "conectada ahora" solo si el heartbeat es reciente o el proceso sigue vivo. Los archivos de
sesiones muertas se limpian solos.

**Seguridad:** solo lectura (un `POST` devuelve 405), atado a `127.0.0.1`, sin traversal de rutas fuera
de `ui\`. Se refresca solo cada 5 segundos.

**Decisiones:** el panel **no** aprueba pendientes ni publica nada a propósito: esas acciones siguen
siendo del usuario por CLI, y así la interfaz no puede convertirse en un atajo para compartir sin querer.

**Verificación:** 19 pruebas de API (`node test\dashboard.mjs`) **más 15 pruebas que renderizan la
interfaz de verdad** con jsdom (`node test\ui.mjs`): cargan el panel contra un servidor real, dibujan los
dos grafos, hacen clic en pestañas, abren el grafo de un proyecto y el detalle de una entrada, y fallan si
aparece cualquier error de runtime. Esa red existe porque un canvas mal resuelto rompió el panel sin que
ninguna prueba de API lo detectara. Total del proyecto: **100 pruebas**.

**Publicación idempotente:** este documento se publica con `id: ctx-panel`, así que actualizarlo y volver
a ingestar **actualiza** la entrada en vez de crear otra (y conserva la fecha original).
