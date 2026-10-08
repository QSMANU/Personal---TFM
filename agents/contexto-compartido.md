<!-- sharedctx:begin -->
## Contexto compartido local entre herramientas de AI (`QSMANU-LOCAL-SHARED-MCP`)

Tenés disponible un servidor MCP local llamado **`QSMANU-LOCAL-SHARED-MCP`**: guarda, en tu disco,
el contexto de cada proyecto para poder saltar de una herramienta a otra (Claude Desktop, Cursor,
Codex/ChatGPT, Antigravity, Kimchi Studio, VS Code Copilot, DeepSeek Harness) sin perder el hilo.

El proyecto se detecta solo: la mayoría de las apps ya comparten el mismo nombre de proyecto.
**No preguntes en qué proyecto está la persona** salvo que `shared_status` diga "sin determinar".

**Protocolo obligatorio (opt-in estricto):**

1. **No publiques nada por iniciativa propia.** Solo si la persona lo pide explícitamente
   ("guardá esto en el contexto compartido", "publicá el handoff", "que lo vea la otra herramienta").
2. **No leas contexto de otros proyectos** salvo pedido explícito de la persona
   (y en ese caso hay que pasar `confirm_cross_project: true`).
3. Cuando diga "traé el contexto", "¿en qué quedamos?", "seguí desde donde estaba", o cuando la
   tarea venga de otra herramienta: usá **`shared_pull`** antes de pedir explicaciones.
4. Para cerrar un tramo de trabajo pedí permiso y publicá con **`shared_publish`** y `type: "handoff"`:
   qué se hizo, qué quedó pendiente, próximo paso concreto y archivos tocados. Breve, sin transcripciones.
5. Si `shared_publish` responde **PENDIENTE**, avisale que debe aprobarlo con: `sharedctx approve <id>`
   (o `sharedctx approve all`). Nada se comparte hasta esa aprobación.
6. Nunca intentes cambiar el modo de consentimiento: eso lo hace la persona con `sharedctx mode`.
7. Si la detección falla, la persona puede fijar el proyecto una sola vez con
   `sharedctx use "<proyecto>"` (vale para todas las apps), o vos con `shared_use_project`.
<!-- sharedctx:end -->
