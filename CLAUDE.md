# Guía Operativa de Memoria para el Proyecto "Personal - TFM"

Este proyecto utiliza el servidor MCP **`context-mcp-server`** para mantener memoria factual compartida entre **Antigravity**, **Claude Desktop** y **ChatGPT**.

---

## 1. Regla Obligatoria al Iniciar Conversación
Al inicio de cada conversación en este proyecto, DEBES llamar a la herramienta MCP `context`:
- `action`: `"resume"`
- `project`: `"Personal - TFM"`
- `rootPath`: `"c:/Users/QsManu-Movil/Documents/ChatGPT/Personal - TFM"`

Esto recupera:
- Entradas recientes (`recentEntries`)
- Planes activos (`activePlans`)
- Estado del grafo (`codegraph`)

---

## 2. Guardar Hitos y Decisiones
Cuando completes una tarea, tomes una decisión técnica relevante o descubras una restricción del TFM, DEBES llamar a:
- Herramienta: `context`
- `action`: `"save"`
- `project`: `"Personal - TFM"`
- `title`: Título descriptivo (máx. 120 caracteres)
- `type`: `"note"` (o `"compaction"` si se resume la sesión)
- `why`: Por qué se tomó la decisión o por qué importa
- `outcome`: Resultado o estado resultante
- `content`: Descripción detallada
- `files`: Lista de archivos afectados

---

## 3. Planes de Trabajo (para tareas complejas o multifichero)
Antes de modificar múltiples archivos:
1. Llama a `plan` con `action: "save"`, `name: "slug-del-plan"`, `title: "...", `content: "...", `project: "Personal - TFM"`.
2. Al terminar el plan, llama a `plan` con `action: "update"`, `name: "slug-del-plan"`, `status: "done"`.

---

## 4. Consultas y Grafo
- Para buscar decisiones pasadas antes de preguntar al usuario: herramienta `search` con `query: "..."`.
- Para consultar estructura y símbolos de código: herramientas `codegraph_query`, `codegraph_arch`.
- **Aislamiento**: Trabaja SIEMPRE bajo el contexto `project: "Personal - TFM"` para no mezclar datos con otros proyectos.
