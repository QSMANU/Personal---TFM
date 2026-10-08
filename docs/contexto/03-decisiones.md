---
id: ctx-decisiones
project: Personal - Shared-MCP-Local
title: Decisiones de diseño (opt-in, 8 herramientas, un proyecto por ruta)
type: decision
tags: decisiones, seguridad, opt-in
files: D:\Repositories\shared-mcp-local\src\server.js
---
**1. El modo de consentimiento NO es una herramienta MCP.**
Se cambia solo por CLI (`sharedctx mode`). Si fuera una herramienta, el modelo podría darse permiso a sí
mismo, que es exactamente lo que se quiere evitar. *Consecuencia:* el asistente nunca puede "activarse"
la compartición; si el usuario quiere publicar directo, lo decide él.

**2. Por defecto `ask`: publicar deja la entrada pendiente.**
`shared_publish` no escribe: crea un pendiente y devuelve el id. Se materializa con
`sharedctx approve <id>`. *Consecuencia:* aunque el modelo publique por error, nada se comparte sin el OK humano.

**3. Superficie mínima: 8 herramientas, ninguna destructiva.**
Sin `read_file`, `write_file`, `delete_file`, `git_push` ni shell — a diferencia del servidor de terceros
que se retiró (`context-mcp-server`), que exponía todo eso a todas las apps y capturaba contexto sola.

**4. Aislamiento por proyecto, no por app.**
Leer otro proyecto exige pedido explícito + `confirm_cross_project: true`, y queda en `audit.log`.
*Consecuencia:* lo personal (`Personal - TFM`, `Personal - Casa Meco`) no se filtra a lo laboral (`OAT - *`).

**5. Un proyecto se identifica por nombre Y por ruta (y se unifican).**
El título del workspace de DSH (`Personal - Shared-MCP-Local`) y la carpeta (`shared-mcp-local`) apuntan al
mismo proyecto: al crear, si la ruta ya está registrada, se redirige y se guarda el otro nombre como alias.
*Motivo:* el usuario quiere el mismo nombre de proyecto en todas las apps sin duplicar contextos.

**6. Cada app recuerda su último proyecto.**
`state.json` guarda `lastByApp`. *Motivo:* apps de escritorio (Claude Desktop) lanzan el servidor desde una
carpeta del sistema y sin esto habría que decirle el proyecto en cada sesión.

**7. Todo local y sin red.**
El transporte HTTP escucha solo en `127.0.0.1` (verificado con `netstat`). Datos en texto plano, sin nube.
