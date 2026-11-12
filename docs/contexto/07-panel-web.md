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
sharedctx ui --install       # arranque automático al iniciar sesión + lo arranca ahora
sharedctx ui --status        # ¿está corriendo? ¿tiene arranque automático?
sharedctx ui --uninstall     # quitar el arranque automático
sharedctx ui --open          # arrancarlo a mano y abrir el navegador
sharedctx ui --ensure        # levantarlo en segundo plano y salir (accesos directos)
sharedctx ui --port 3200
```

**Botones del escritorio:** `powershell -ExecutionPolicy Bypass -File tools\atajos.ps1` crea tres accesos
directos (panel, estado y reparar conexión) que apuntan a los `.cmd` del repo; se quitan con `-Quitar`.

**Dónde vive cada cosa**

| Pieza | ¿Servidor? | Dónde corre |
|---|---|---|
| El MCP (`QSMANU-LOCAL-SHARED-MCP`) | **No** | Proceso **stdio que arranca cada app** al abrirse y se cierra con ella. No hay nada que hostear |
| Transporte MCP por HTTP | Sí (opcional) | `sharedctx serve --http` → `127.0.0.1:3111/mcp`, solo si una app no soporta stdio |
| Panel (`sharedctx ui`) | Sí | `http://127.0.0.1:3120`, solo loopback. Lo único que conviene tener siempre arriba |
| Almacén | No | `~\.shared-mcp`: archivos, no un servicio |

**Arranque automático:** `--install` escribe `~\.shared-mcp\state\run-dashboard.cmd` (con la ruta absoluta de
node y **ASCII puro**, porque `cmd.exe` no lee UTF-8) y `run-dashboard.vbs` (lo lanza sin ventana), y lo
registra al iniciar sesión. Intenta primero una **tarea programada** (`schtasks /SC ONLOGON`); si Windows
pide elevación, usa la **clave `Run` del usuario** (`HKCU\...\CurrentVersion\Run`), que no necesita
administrador. Arrancar dos veces no rompe nada: si el panel ya responde, el segundo intento sale solo.
Verificado matando el panel y lanzando el `.vbs` como lo haría el logon.

**Qué muestra**

| Sección | Contenido |
|---|---|
| Tarjetas | modo de consentimiento, proyectos, entradas, tamaño en disco, apps conectadas **ahora**, pendientes, última actividad |
| Grafo | proyectos (círculos, tamaño = entradas) y apps (rombos) unidos por el contexto que aportó cada una; las conectadas en vivo se marcan en verde. Arrastrable, zoom con rueda, pan del fondo, botón **Centrar** y **Descargar PNG**; clic en un proyecto abre sus entradas |
| Proyectos | entradas, última actualización, handoff completo, desglose por app y tipo, actividad de 30 días |
| Apps conectadas | configurada sí/no (leyendo el archivo de cada app), sesiones MCP vivas con pid y transporte, proyecto actual, proyectos con contexto |
| Métodos MCP | las 8 herramientas con descripción y JSON Schema, más el protocolo opt-in que recibe el modelo |
| Pendientes | publicaciones **y borrados** que esperan aprobación, con el comando exacto |
| Auditoría | últimos eventos de `audit.log` |

**Cómo sabe qué apps están conectadas:** cada proceso MCP escribe un heartbeat en
`~\.shared-mcp\sessions\<app>-<pid>.json` al arrancar y en cada llamada a una herramienta. El panel
muestra "conectada ahora" solo si el heartbeat es reciente o el proceso sigue vivo. Los archivos de
sesiones muertas se limpian solos.

**Seguridad:** solo lectura (un `POST` devuelve 405), atado a `127.0.0.1`, sin traversal de rutas fuera
de `ui\`. Se refresca solo cada 5 segundos; los canvas **duermen** cuando la física queda quieta y se
despiertan con arrastre, zoom, búsqueda o datos nuevos, para no gastar CPU/GPU en segundo plano.

**Grafo de entradas:** colores por tipo (`handoff` con halo, `decision`, `task`, `bug`, `question`), buscador
en vivo que atenúa lo que no coincide, exportación DOT/Mermaid/PNG y detalle con Markdown renderizado
(sin dependencias) en el panel lateral.

**Decisiones:** el panel **no** aprueba pendientes ni publica nada a propósito: esas acciones siguen
siendo del usuario por CLI, y así la interfaz no puede convertirse en un atajo para compartir sin querer.

**Verificación:** 27 pruebas de API (`node test\dashboard.mjs`) **más 19 pruebas que renderizan la
interfaz de verdad** con jsdom (`node test\ui.mjs`): cargan el panel contra un servidor real, dibujan los
dos grafos, hacen clic en pestañas, abren el grafo de un proyecto y el detalle de una entrada, prueban el
renderizador Markdown y fallan si aparece cualquier error de runtime. Esa red existe porque un canvas mal
resuelto rompió el panel sin que ninguna prueba de API lo detectara.

**Publicación idempotente:** este documento se publica con `id: ctx-panel`, así que actualizarlo y volver
a ingestar **actualiza** la entrada en vez de crear otra (y conserva la fecha original).
