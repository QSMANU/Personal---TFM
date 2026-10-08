# Guía Operativa de Memoria para Kimchi Studio (Personal - TFM)

Esta guía explica cómo **Kimchi Studio** se conecta a la memoria persistente compartida del TFM.

---

## 1. Cómo está configurado

Kimchi Studio lee su lista de servidores MCP desde:
```
%USERPROFILE%\.config\kimchi\harness\mcp.json
```

El `setup-sync.bat` ya lo configura automáticamente al ejecutarse en cualquier equipo.

La configuración resultante es:
```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "C:\\Windows\\System32\\cmd.exe",
      "args": ["/d", "/c", "npx -y context-mcp-server@latest"]
    }
  }
}
```

---

## 2. Proyectos registrados en Kimchi

| Nombre | Ruta |
|---|---|
| `Personal - TFM` | `C:\Users\...\Documents\ChatGPT\Personal - TFM` (Git repo, con `.context/`) |
| `Personal - TFM (Documentos)` | `D:\Studies\AI Master\Trabajo Fin de Estudio` (documentos Word, PDFs) |

Ambas carpetas están marcadas como **trusted** en Kimchi.

---

## 3. Instrucciones del Proyecto en Kimchi

Al abrir el proyecto **Personal - TFM** en Kimchi Studio y comenzar una sesión, proporciona este contexto inicial en el primer mensaje o como System Prompt del proyecto:

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

## 4. Verificar que MCP está activo

En Kimchi Studio, ve a **Settings → MCP servers and connectors**. Debes ver `context-mcp` en la lista con estado **Connected**.
