# Guía Operativa de Memoria para Antigravity (Personal - TFM)

Esta guía documenta cómo **Antigravity** (Google DeepMind) interactúa con la memoria persistente del TFM compartida con Claude y ChatGPT.

---

## 1. Conexión MCP en Antigravity

Antigravity lee su configuración de servidores MCP desde `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "context-mcp-server@latest"
      ]
    }
  }
}
```

---

## 2. Descubrimiento Automático de Reglas

A diferencia de otros clientes, **Antigravity descubre y carga automáticamente** las reglas del proyecto al abrir la carpeta de trabajo:
* Carga las directivas desde [`AGENTS.md`](./AGENTS.md) y [`ANTIGRAVITY.md`](./ANTIGRAVITY.md).
* Ejecuta `context.resume` al iniciar cada conversación de forma obligatoria.
* Guarda notas de progreso y decisiones con `context.save` al completar tareas técnicas, documentales o académicas.

Se consideran tareas académicas guardables la revisión o redacción de secciones, búsqueda de bibliografía, selección de imágenes o figuras, diseño metodológico, experimentos, métricas y análisis del feedback del director. La nota debe incluir el resultado sustantivo y permitir que otro asistente continúe el trabajo; no basta con registrar "tarea completada".

---

## 3. Comandos y Herramientas del Grafo de Código
* **`context`**: Gestiona la memoria (`resume`, `save`, `get`, `delete`).
* **`search`**: Busca antecedentes y decisiones en la memoria persistente.
* **`plan`**: Almacena planes de trabajo multifichero (`plan.save`, `plan.update`).
* **`codegraph_query` / `codegraph_arch`**: Analiza símbolos y arquitectura de código sin necesidad de leer archivos completos.

---

## 4. Documentos, PDF e Imágenes
* Mantén los documentos completos como archivos del repositorio. Usa `context-mcp` como índice y memoria factual.
* Consulta `PROJECT_STATE.md` cuando la tarea dependa del alcance o estado actual y `docs/INDEX.md` para localizar fuentes. Mantenlos sincronizados después de cambios verificados.
* Antes de una tarea documental, busca antecedentes con `search` y lee solo los archivos o páginas pertinentes.
* Al añadir un PDF, Word, presentación, dataset o figura, guarda una nota con `source: "file"`, ruta, propósito, versión/fecha, resumen y páginas relevantes.
* Para fuentes académicas, registra DOI o URL estable y qué afirmaciones respalda.
* Para figuras e imágenes, registra fuente original, autor, licencia o condiciones de reutilización, fecha de acceso, pie propuesto y sección de destino.
* No inventes el contenido de archivos no disponibles ni asumas que una imagen puede reutilizarse solo porque aparece en una búsqueda.
