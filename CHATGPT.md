# Guía Operativa de Memoria para ChatGPT (Personal - TFM)

Esta guía explica cómo conectar y utilizar **ChatGPT** (aplicación de escritorio de Windows o interfaz web) con la memoria persistente del TFM compartida con Claude y Antigravity.

---

## 1. Conexión de ChatGPT al Servidor MCP (`context-mcp`)

### Si utilizas la App de Escritorio de Windows / Codex
El script `setup-sync.bat` ya añade automáticamente la configuración necesaria a tu archivo `%USERPROFILE%\.codex\config.toml`:

```toml
[mcp_servers.context-mcp]
command = "npx"
args    = ["-y", "context-mcp-server@latest"]
default_tools_approval_mode = "prompt"

[mcp_servers.context-mcp.tools.context]
approval_mode = "approve"

[mcp_servers.context-mcp.tools.search]
approval_mode = "approve"

[mcp_servers.context-mcp.tools.codegraph_query]
approval_mode = "approve"
```

---

## 2. Instrucciones para el Proyecto de ChatGPT

En la app o web de ChatGPT, crea o abre el Proyecto llamado **Personal - TFM**. En el panel de **Instrucciones del Proyecto** (Project Instructions), copia el siguiente bloque:

```markdown
Reglas obligatorias de memoria para el proyecto "Personal - TFM":
1. Al inicio de cada conversación, llama obligatoriamente a la herramienta MCP context con:
   - action: "resume"
   - project: "Personal - TFM"
   - rootPath: "<Ruta absoluta a la carpeta del TFM en tu ordenador>"
2. Al completar cualquier tarea, hito o decisión técnica, llama a la herramienta MCP context con:
   - action: "save"
   - project: "Personal - TFM"
   - type: "note"
   - title: "<título descriptivo de máximo 120 caracteres>"
   - why: "<motivo o justificación de la decisión>"
   - outcome: "<resultado o estado alcanzado>"
   - content: "<explicación detallada>"
3. Considera tarea guardable toda revisión o redacción académica, búsqueda de fuentes o imágenes, decisión metodológica, diseño de experimento y análisis de feedback. Guarda contenido suficiente para reconstruir la respuesta, no solo el estado de finalización.
4. Para consultar decisiones pasadas antes de preguntar al usuario, utiliza la herramienta MCP search.
5. Mantén todas las consultas y notas bajo el identificador project: "Personal - TFM".
6. Trata los PDF y demás documentos como fuentes de verdad del proyecto. Guarda en context-mcp su ruta, resumen, versión, procedencia y páginas relevantes; no intentes almacenar el binario completo como memoria.
7. Para imágenes o figuras, registra fuente original, autor, licencia o condiciones de reutilización, fecha de acceso, pie sugerido y sección de destino.
8. Consulta PROJECT_STATE.md para conocer el alcance vigente y docs/INDEX.md para localizar documentos. Actualízalos únicamente cuando exista un cambio verificado.
```

---

## 3. ¿Cómo funciona la sincronización con tu compañero?
Cualquier nota que ChatGPT guarde mediante `context.save` se escribirá de forma inmediata en el archivo local `.context/context.json`. Al hacer `git push`, tu compañero podrá verla tras hacer `git pull`.

En Codex trabajando sobre esta carpeta, `AGENTS.md` se carga como instrucción del repositorio. En un Proyecto de ChatGPT web o de escritorio sin acceso directo a la carpeta, estas reglas deben copiarse en las Instrucciones del Proyecto y los documentos pertinentes deben añadirse al proyecto o ponerse a disposición mediante una integración autorizada.
