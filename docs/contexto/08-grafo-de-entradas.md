---
project: Personal - Shared-MCP-Local
title: Grafo de entradas y diagnóstico del contexto
type: reference
tags: grafo, relaciones, diagnostico, optimizacion
files: D:\Repositories\shared-mcp-local\src\relations.js, D:\Repositories\shared-mcp-local\test\relations.mjs
---
**Qué es:** las entradas de contexto dejan de ser una lista y pasan a ser un **grafo navegable**, con un
diagnóstico que dice qué conviene arreglar para que el MCP rinda más.

**Relaciones que deduce solo (sin pedir nada extra):**

| Relación | De dónde sale |
|---|---|
| `tag` | dos entradas comparten etiqueta |
| `file` | dos entradas referencian el mismo archivo |
| `menciona` | una entrada nombra a otra por id, por `[[título]]` o por título exacto |
| `similar` | contenido muy parecido → posible duplicado (se dibuja en rojo punteado) |

**Diagnóstico (`sharedctx insights` o la pestaña del panel):** salud 0-100 y avisos accionables:
proyectos con entradas pero **sin handoff**, entradas **huérfanas** (sin ninguna relación),
**duplicados**, **archivos compartidos entre proyectos distintos** (contexto partido), contexto escrito
por **una sola app**, entradas con más de 45 días, y pendientes de aprobación olvidados.
Cada aviso trae el comando exacto para resolverlo.

**Cómo lo usa el MCP (la parte importante):** la herramienta nueva **`shared_related`** devuelve el
vecindario de una entrada (o del handoff): las que comparten etiquetas, archivos, se mencionan o tienen
contenido parecido, **con el motivo de cada relación**. Así el modelo puede pedir "solo lo relacionado"
en vez de volcar todo el contexto: menos tokens, menos ruido, mejor respuesta. El panel muestra exactamente
ese mismo vecindario cuando hacés clic en una entrada.

**Comandos**

```powershell
sharedctx insights                          # salud + qué arreglar
sharedctx insights "Personal - TFM" --json  # acotado, en JSON
sharedctx graph "Personal - TFM"            # entradas ordenadas por cantidad de relaciones
sharedctx graph --type dot > contexto.dot   # Graphviz / Obsidian / Gephi
sharedctx graph --type md                   # para pegar en un README
```

En el panel: pestaña **Grafo de entradas** (conmutadores de etiquetas/archivos, selector de proyecto,
exportar DOT, clic para leer la entrada con su vecindario) y bloque **Diagnóstico** con la salud.

**Estado real de este proyecto:** 35 nodos, 37 relaciones (22 por etiqueta, 14 por archivo, 1 duplicado),
0 entradas huérfanas, salud 95/100. El único aviso es que todo el contexto lo escribió `inbox` (o sea, yo
publicando por CLI): cuando alguna app lo haga desde su propia sesión, ese aviso desaparece solo.

**Verificación:** 20 pruebas propias (`node test\relations.mjs`), incluidas "detecta relaciones por
etiqueta y archivo", "marca el par casi idéntico como duplicado", "la entrada sin relaciones queda
aislada" y "cada aviso trae un comando para arreglarlo". Total del proyecto: **79 pruebas**.
