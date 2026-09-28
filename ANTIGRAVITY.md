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
* Guarda notas de progreso y decisiones con `context.save` al completar tareas técnicas o de documentación.

---

## 3. Comandos y Herramientas del Grafo de Código
* **`context`**: Gestiona la memoria (`resume`, `save`, `get`, `delete`).
* **`search`**: Busca antecedentes y decisiones en la memoria persistente.
* **`plan`**: Almacena planes de trabajo multifichero (`plan.save`, `plan.update`).
* **`codegraph_query` / `codegraph_arch`**: Analiza símbolos y arquitectura de código sin necesidad de leer archivos completos.
