# Guía Operativa de Memoria para el Proyecto "Personal - TFM"

Este proyecto utiliza el servidor MCP **`context-mcp-server`** para mantener memoria factual compartida entre **Antigravity**, **Claude Desktop** y **ChatGPT**.

---

## 1. Regla Obligatoria al Iniciar Conversación
Al inicio de cada conversación en este proyecto, DEBES llamar a la herramienta MCP `context`:
- `action`: `"resume"`
- `project`: `"Personal - TFM"`
- `rootPath`: la ruta absoluta de la raíz local del repositorio. En el equipo actual de Manuel es `c:/Users/QsManu-Movil/Documents/ChatGPT/Personal - TFM`; en otro equipo debes detectar y usar la ruta real de ese clon.

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

Esta obligación incluye tareas académicas: revisión o redacción de secciones, búsqueda de bibliografía, recomendación de imágenes o figuras, análisis metodológico, definición de experimentos y tratamiento del feedback del director. El campo `content` debe conservar los hallazgos y propuestas concretas, no limitarse a indicar que la tarea terminó.

Si el usuario pega una sección del TFM para revisarla, guarda como mínimo:
- sección y versión revisadas;
- principales problemas detectados;
- cambios sugeridos o texto propuesto;
- citas pendientes y fuentes recomendadas;
- figuras o imágenes propuestas, con procedencia y condiciones de reutilización;
- decisiones que deben validarse con el director.

---

## 3. Planes de Trabajo (para tareas complejas o multifichero)
Antes de modificar múltiples archivos:
1. Llama a `plan` con `action: "save"`, `name: "slug-del-plan"`, `title: "...", `content: "...", `project: "Personal - TFM"`.
2. Al terminar el plan, llama a `plan` con `action: "update"`, `name: "slug-del-plan"`, `status: "done"`.

---

## 4. Consultas y Grafo
- Para buscar decisiones pasadas antes de preguntar al usuario: herramienta `search` con `query: "..."`.
- Para consultar estructura y símbolos de código: herramientas `codegraph_query`, `codegraph_arch`.
- **Aislamiento**: Trabaja SIEMPRE bajo el contexto `project: "Personal - TFM"` y la raíz local del clon actual. Nunca reutilices la ruta absoluta de otro colaborador.

## 5. Documentos del Proyecto
- Los PDF, documentos Word, presentaciones, datos e imágenes deben mantenerse como archivos del proyecto; `context-mcp` conserva su índice, resumen, procedencia y decisiones relacionadas.
- Consulta `PROJECT_STATE.md` cuando la tarea dependa del alcance, la entrega o las decisiones pendientes. Actualízalo solo después de un cambio verificado.
- Consulta `docs/INDEX.md` antes de trabajar con documentos o fuentes y mantenlo sincronizado cuando se añada o sustituya un archivo.
- Lee únicamente los documentos o páginas relevantes para la tarea actual.
- Al incorporar un archivo, crea una nota con `source: "file"`, ruta, propósito, fecha/versión, resumen y páginas relevantes.
- Para fuentes académicas, conserva DOI o URL estable y páginas que respaldan cada afirmación.
- Para imágenes, conserva fuente original, autor, licencia o condiciones de reutilización, fecha de acceso y pie de figura propuesto.
- Si el archivo no está disponible, no infieras su contenido y solicita acceso.
