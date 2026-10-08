# Casos de uso — contexto compartido entre herramientas de AI

Servidor MCP: **`QSMANU-LOCAL-SHARED-MCP`** · comando local: `sharedctx` · almacén: `C:\Users\QsManu-Movil\.shared-mcp`

Cada proyecto tiene su propio rincón en el almacén. Nada se comparte salvo que vos lo pidas, y en modo
`ask` (el de fábrica) cada publicación espera tu aprobación.

---

## 0. La regla que hace que todo funcione: el mismo nombre en todas partes

El sistema empareja los nombres solo, ignorando mayúsculas, acentos, espacios y guiones:

| Donde escribís | Se resuelve al mismo proyecto |
|---|---|
| `Personal - Shared-MCP-Local` (título del workspace en DSH) | `personal-shared-mcp-local` |
| `Personal - TFM` | `personal-tfm` |
| `OAT - Architecture` | `oat-architecture` |
| `Casa Meco` · `casa meco` · `CASA-MECO` | `casa-meco` |

Además aprende: cuando un proyecto se publica o se lee desde una ruta, esa ruta y ese nombre quedan
registrados como **alias** del proyecto, y la próxima vez la detección es automática.

Si en alguna app el proyecto se llama distinto de verdad, se lo enseñás una vez:

```powershell
sharedctx alias "Personal - TFM" "TFM Master"
```

### Tu organización personal vs. laboral

| Ámbito | Proyectos | Convención sugerida |
|---|---|---|
| Personal | `Personal - TFM`, `Personal - Casa Meco`, `Personal - Shared-MCP-Local` | prefijo `Personal - ` |
| Laboral | `OAT - Architecture`, `OAT - Tickets`, `internal-hr-chatbot`, `tao-*`, `cursor` | prefijo del cliente/equipo (`OAT - `, `tao-`, …) |

El prefijo no es cosmético: hace que en la lista de proyectos y en la detección automática se vea de un
vistazo de qué ámbito es cada cosa, y evita que dos proyectos con nombre genérico (`architecture`) se
confundan entre sí.

```powershell
sharedctx projects      # te muestra todo agrupado por nombre, con alias y rutas
```

---

## 1. Caso base — empezar en una app y seguir en otra

**En Cursor** (media tarde, cierre de jornada):

> Publicá el handoff de este proyecto en el contexto compartido: qué hicimos, qué quedó pendiente y el próximo paso.

Cursor llama a `shared_publish` con `type: "handoff"` y te devuelve un id pendiente. En la terminal:

```powershell
sharedctx pending
sharedctx approve 20261008-171230-a1b2c3
```

**A la mañana siguiente, en Claude Desktop:**

> Traé el contexto compartido del proyecto y seguí desde donde quedó.

Recibe el handoff + las últimas entradas. Si esa app no puede adivinar el proyecto, lo dice y te pide
el nombre una sola vez (o corrés `sharedctx use "Personal - TFM"` y ya vale para todas).

---

## 2. Caso "ya no puedo pedirle nada a la app"

Te quedaste sin turnos, sin contexto, la sesión se cortó o la app se colgó. **No necesitás a la app para
publicar**: el CLI escribe directo en el almacén.

### Opción A — del portapapeles (la más rápida)

Copiás el resumen desde donde esté (el chat, un log, un mail) y una sola línea:

```powershell
sharedctx add --project "Personal - TFM" --title "Estado del capítulo 3" --clipboard
sharedctx handoff --project "OAT - Architecture" --clipboard
```

### Opción B — Bloc de notas, cero sintaxis

```powershell
sharedctx note --project "OAT - Architecture"
```

Abre el Bloc de notas con una plantilla. Escribís, guardás, cerrás: se publica solo.

### Opción C — bandeja de entrada (varios archivos sueltos)

Dejás `.md` / `.txt` / `.json` en la bandeja y los procesás todos juntos:

```powershell
sharedctx inbox          # te dice la ruta: C:\Users\QsManu-Movil\.shared-mcp\inbox
sharedctx ingest         # publica todo lo que haya ahí y lo mueve a inbox\procesados
```

Formato de un archivo de la bandeja (el encabezado es opcional):

```markdown
---
project: OAT - Architecture
title: Decisión sobre el bus de eventos
type: decision
tags: arquitectura, kafka
files: D:\Repositories\oat-architecture\docs\adr-014.md
---
Se descartó Kafka por costo operativo. Se va con SQS + outbox en la base.
Próximo paso: prototipo del outbox con métricas de reintento.
```

### Opción D — desde otra app que sí funciona

> Publicá en el proyecto `OAT - Architecture` esto que te pego: *«...»*

Sirve cuando una app quedó inutilizable pero tenés otra a mano (o una sesión nueva).

### Opción E — pegar un archivo entero

```powershell
sharedctx add --project "Personal - TFM" --title "Borrador capítulo 3" --file .\capitulo3.md
Get-Content log.txt | sharedctx handoff --project "OAT - Architecture" --file -
```

---

## 3. Caso ChatGPT web (que no soporta MCP)

ChatGPT web no habla MCP, así que se comparte por carpeta:

```powershell
sharedctx export --project "Personal - TFM" --out "C:\Users\QsManu-Movil\Documents\ChatGPT\Personal - TFM\.shared"
```

Genera `INDEX.md` + `entries\*.md`, en texto plano, listos para que ChatGPT los lea dentro del proyecto.
Al revés (lo que produjo ChatGPT) lo traés con `sharedctx note` o pegando el texto con `--clipboard`.

---

## 4. Personal y laboral en la misma máquina, sin mezclarse

* **Un proyecto nunca ve a otro.** `shared_pull` solo mira el proyecto activo; leer otro exige pedido
  explícito y `confirm_cross_project: true`, y queda grabado en `audit.log`.
* **Cortar todo de raíz** cuando estás con datos de un cliente:

```powershell
sharedctx mode off          # no se lee ni se escribe nada compartido
sharedctx mode ask          # volver al modo normal
```

* **Solo lectura** para demos o cuando no querés que nada se escriba:

```powershell
sharedctx mode readonly
```

* **Auditoría** de qué se compartió y quién lo leyó:

```powershell
sharedctx audit --limit 50
```

---

## 5. Caso "no sé en qué proyecto estoy"

```powershell
sharedctx status        # dice el proyecto, la app y CÓMO lo detectó
```

Salidas típicas y qué hacer:

| Lo que dice | Significado | Acción |
|---|---|---|
| `detectado por: workspace de DSH` | DeepSeek Harness usó el título de tu workspace | nada, es correcto |
| `detectado por: ruta/cwd` | la app abrió la carpeta del proyecto | nada, es correcto |
| `detectado por: último proyecto usado en cursor` | memoria por app | revisá que sea el que querés |
| `detectado por: proyecto activo global` | usaste `sharedctx use` | `sharedctx use --clear` para desactivarlo |
| `sin determinar` | la app abrió el servidor desde una carpeta del sistema | fijalo una vez: `sharedctx use "<proyecto>"` |

---

## 6. Caso migración selectiva del contexto viejo

Lo que tenías en `~\.context-mcp` se importa **eligiendo**:

```powershell
node D:\Repositories\shared-mcp-local\tools\import-context-mcp.mjs --list
node D:\Repositories\shared-mcp-local\tools\import-context-mcp.mjs --interactive
node D:\Repositories\shared-mcp-local\tools\import-context-mcp.mjs --only personal-tfm,oat-architecture
node D:\Repositories\shared-mcp-local\tools\import-context-mcp.mjs --all --exclude casa-meco
node D:\Repositories\shared-mcp-local\tools\import-context-mcp.mjs --all --since 2026-10-01 --types decision,handoff
```

Nada del almacén viejo se modifica. Con `--dry-run` ves el resultado antes de escribir.

---

## 7. Caso equipo/cliente: publicar decisiones, no conversaciones

Lo que vale la pena compartir entre herramientas es corto y verificable:

```markdown
---
project: OAT - Architecture
title: ADR-014 · Bus de eventos
type: decision
---
**Decidido:** SQS + patrón outbox. Kafka descartado por costo operativo.
**Pendiente:** prototipo de outbox con métricas de reintento (due: viernes).
**Archivos:** docs/adr-014.md, src/outbox/index.ts
**Próximo paso:** medir reintentos con carga sintética de 1k msg/min.
```

Tipos disponibles: `handoff`, `note`, `decision`, `task`, `bug`, `question`, `snippet`, `reference`.

---

## 8. Prompts listos para copiar y pegar

| Querés… | Pegá esto en la app |
|---|---|
| Retomar trabajo | «Traé el contexto compartido y decime en qué quedamos.» |
| Cerrar jornada | «Publicá el handoff: qué se hizo, qué falta y el próximo paso.» |
| Guardar una decisión | «Publicá como `decision` en el contexto compartido: …» |
| Ver pendientes | «¿Hay publicaciones esperando mi aprobación en el contexto compartido?» |
| Otro proyecto | «Leé el contexto del proyecto `OAT - Architecture` (te lo pido explícitamente).» |
| Fijar proyecto | «Estoy trabajando en `Personal - TFM`, fijalo para esta sesión.» |
