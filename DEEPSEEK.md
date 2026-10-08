# Guía Operativa de Memoria para DeepSeek Harness (Personal - TFM)

Esta guía explica cómo **DeepSeek Harness** (la app de escritorio `dsh`) se conecta a la memoria persistente compartida del TFM.

---

## 1. Cómo está configurado

DeepSeek Harness busca automáticamente el archivo **`.mcp.json`** en la raíz de la carpeta del proyecto al abrirla.

Este repositorio ya incluye el archivo [`.mcp.json`](./.mcp.json) configurado:
```json
{
  "mcpServers": {
    "context-mcp": {
      "type": "stdio",
      "command": "cmd.exe",
      "args": ["/c", "npx", "-y", "context-mcp-server@latest"]
    }
  }
}
```

No necesitas configurar nada manualmente. Al abrir la carpeta del TFM en DeepSeek Harness, el servidor MCP arranca automáticamente.

---

## 2. Verificar que MCP está activo

Dentro de DeepSeek Harness, navega a **Settings → Plugins → MCP** (o usa el panel `dsh-mcp-panel` si lo tienes instalado). Deberías ver `context-mcp` conectado con las herramientas `context`, `search`, `plan` y `codegraph_*`.

---

## 3. Instrucciones del proyecto para la sesión

Al iniciar una sesión sobre el TFM en DeepSeek Harness, incluye esto como mensaje de sistema o primer mensaje:

```
Eres el asistente de TFM del proyecto "Personal - TFM".
Al inicio de cada sesión DEBES llamar a la herramienta MCP context con:
  - action: "resume"
  - project: "Personal - TFM"
  - rootPath: "C:\\Users\\QsManu-Movil\\Documents\\ChatGPT\\Personal - TFM"

Al completar cualquier tarea relevante, llama a context con action: "save", project: "Personal - TFM".
Busca siempre decisiones pasadas con la herramienta search antes de preguntar al usuario.
```

---

## 4. Nota sobre el proyecto en `D:\Studies\AI Master\Trabajo Fin de Estudio`

Si abres DeepSeek Harness desde la carpeta de documentos en `D:\`, copia o enlaza simbólicamente el archivo `.mcp.json` desde el repositorio a esa carpeta para que el servidor MCP arranque igualmente.
