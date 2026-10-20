---
id: ctx-grafo
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
sharedctx graph --type mermaid > contexto.mmd  # GitHub, PRs, Obsidian
sharedctx graph --type md                   # para pegar en un README
```

En el panel: pestaña **Grafo de entradas** (conmutadores de etiquetas/archivos, selector de proyecto,
buscador en vivo, exportar DOT/Mermaid/PNG, clic para leer la entrada con su vecindario y Markdown) y bloque
**Diagnóstico** con la salud.

**Rendimiento:** el cálculo de similitudes es cuadrático, así que se memoiza por proyecto con una firma de
`id + mtime + tamaño`. Editar una entrada invalida la caché (aunque conserve `id` y `createdAt`) y el panel
puede refrescar cada 5 s sin recalcular todo si nada cambió.

**Estado real de este proyecto:** cambia con cada publicación; se consulta en vivo con
`sharedctx insights "Personal - Shared-MCP-Local"` o en la pestaña del panel. La salud y los avisos se
calculan sobre las entradas actuales, no sobre una foto fija.

**Verificación:** pruebas propias (`node test\relations.mjs`), incluidas "detecta relaciones por etiqueta
y archivo", "marca el par casi idéntico como duplicado", "la entrada sin relaciones queda aislada",
"exporta Mermaid válido" y "la caché se invalida al editar una entrada".
