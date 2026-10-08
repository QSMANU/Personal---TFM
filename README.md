# QSMANU-LOCAL-SHARED-MCP â€” contexto compartido local entre herramientas de AI

Un Ãºnico contexto **local**, **por proyecto** y **con consentimiento explÃ­cito**, que todas tus
herramientas de AI pueden leer y escribirâ€¦ **solo cuando vos querÃ©s**.

- Servidor MCP: **`QSMANU-LOCAL-SHARED-MCP`**
- Comando local: **`sharedctx`**
- AlmacÃ©n: `C:\Users\QsManu-Movil\.shared-mcp` (texto plano, Markdown + JSON)

Herramientas soportadas: Claude Desktop Â· Cursor Â· Codex / ChatGPT desktop Â· Antigravity (agente e IDE) Â·
Kimchi Studio Â· VS Code Copilot Â· Claude Code Â· DeepSeek Harness Â· y ChatGPT web por exportaciÃ³n a Markdown.

**Casos de uso concretos (personal vs. laboral, app bloqueada, migraciÃ³n selectiva):**
[docs/CASOS-DE-USO.md](docs/CASOS-DE-USO.md)

---

## 1. CÃ³mo funciona (y quÃ© garantiza)

```
              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   Claude â”€â”€â”€â”€â”¤              â”‚   â”‚                â”‚   â”‚              â”‚
   Cursor â”€â”€â”€â”€â”¤ QSMANU-      â”‚â—„â”€â”€â”¤ modo de        â”‚   â”‚ ~/.shared-mcp/
   Codex  â”€â”€â”€â”€â”¤ LOCAL-SHARED-â”œâ”€â”€â–ºâ”‚ consentimiento â”‚â”€â”€â–ºâ”‚ projects/<p>/
   Kimchi â”€â”€â”€â”€â”¤ MCP          â”‚   â”‚ off/ro/ask/on  â”‚   â”‚  handoff.md
   VS Code â”€â”€â”€â”¤ (MCP local)  â”‚   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚  entries/*.md
   DSH    â”€â”€â”€â”€â”¤ 7 herramientasâ”‚                       â”‚ pending/ audit.log
              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**GarantÃ­as de diseÃ±o**

| GarantÃ­a | CÃ³mo se cumple |
|---|---|
| Nada se comparte automÃ¡ticamente | No hay hooks, ni captura de conversaciones, ni resÃºmenes automÃ¡ticos. Solo se publica si alguien llama a `shared_publish` |
| El modelo no puede darse permiso | El modo de consentimiento **no es una herramienta MCP**: se cambia Ãºnicamente por CLI (`sharedctx mode ...`) |
| Vos aprobÃ¡s cada publicaciÃ³n | Modo `ask` (por defecto): lo publicado queda en `pending/` hasta que corras `sharedctx approve <id>` |
| Un proyecto no se filtra a otro | AlmacÃ©n separado por proyecto; leer otro exige `confirm_cross_project` y queda auditado |
| El modelo no puede borrar ni ejecutar nada | 7 herramientas, ninguna de archivos, shell, git ni borrado masivo |
| Todo es auditable | `audit.log` (JSONL) registra cada lectura, publicaciÃ³n, aprobaciÃ³n y cambio de modo |
| Todo queda en tu disco | `~\.shared-mcp`; el servidor HTTP opcional escucha solo en `127.0.0.1` |

**Herramientas MCP expuestas** (nada mÃ¡s):

| Herramienta | QuÃ© hace | Escribe |
|---|---|---|
| `shared_status` | modo, app, proyecto activo y **cÃ³mo lo detectÃ³**, pendientes | no |
| `shared_pull` | handoff + Ãºltimas entradas del proyecto activo | no |
| `shared_list` | proyectos, entradas, alias y rutas conocidas | no |
| `shared_publish` | publica (con `confirm: true`) | sÃ­, segÃºn el modo |
| `shared_pending` | publicaciones esperando tu OK | no |
| `shared_use_project` | fija el proyecto (sesiÃ³n + memoria de esa app) | solo su estado, no contexto |
| `shared_forget` | borra una entrada puntual | sÃ­, segÃºn el modo |

### 1.1 DetecciÃ³n automÃ¡tica del proyecto

Pensada para tu caso: **el mismo nombre de proyecto en todas las apps**. El servidor resuelve el
proyecto con esta cascada, de la seÃ±al mÃ¡s fuerte a la mÃ¡s dÃ©bil:

1. el nombre que pida explÃ­citamente la herramienta (`project`)
2. el proyecto fijado en la sesiÃ³n (`shared_use_project`)
3. seÃ±ales del proceso: `.sharedctx.json`, raÃ­z de git, carpeta actual
4. **workspace de DeepSeek Harness** â€” lee `~\.dsh\storages\workspace.json` y usa el `title`
   (ej. `Personal - Shared-MCP-Local`) y su `path`
5. **memoria por app** â€” el Ãºltimo proyecto que usaste en esa herramienta
6. **proyecto activo global** â€” `sharedctx use "<proyecto>"`, vale para todas las apps

Y los nombres se emparejan **ignorando mayÃºsculas, acentos, espacios y guiones**
(`Personal - Shared-MCP-Local` â‰¡ `personal-shared-mcp-local`), mÃ¡s alias y rutas que el sistema va
aprendiendo solo. Si nada de esto alcanza, **no inventa**: pregunta.

---

## 2. Estado de tu mÃ¡quina

| App | Archivo de configuraciÃ³n | Estado |
|---|---|---|
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | âœ… `QSMANU-LOCAL-SHARED-MCP` |
| Cursor | `%USERPROFILE%\.cursor\mcp.json` | âœ… |
| Codex / ChatGPT desktop | `%USERPROFILE%\.codex\config.toml` | âœ… con aprobaciÃ³n extra en `shared_publish` |
| Antigravity (agente **e** IDE) | `%USERPROFILE%\.gemini\config\mcp_config.json` | âœ… (comparten el mismo archivo) |
| Kimchi Studio | `%USERPROFILE%\.config\kimchi\harness\mcp.json` | âœ… |
| VS Code (Copilot) | `%APPDATA%\Code\User\mcp.json` (`servers`, `type: stdio`) | âœ… |
| Copilot global | `%USERPROFILE%\.copilot\mcp-config.json` | âœ… |
| DeepSeek Harness | `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` | âœ… plugin `dsh-mcp-client` |
| Claude Code | vÃ­a `claude mcp add` | CLI no instalado; hooks automÃ¡ticos ya eliminados |

Dos aclaraciones que salieron de auditar los binarios de cada app:

- **Antigravity (agente) y Antigravity IDE comparten `~\.gemini\config\mcp_config.json`.**
  El IDE *no* usa `%APPDATA%\Antigravity IDE\User\mcp.json`; su carpeta `~\.gemini\antigravity-ide\mcp\`
  es solo cachÃ© de herramientas descubiertas.
- **Kimchi Studio** acepta ademÃ¡s configuraciÃ³n por proyecto (`<repo>\.kimchi\mcp.json`, `<repo>\.mcp.json`)
  y sabe importar la config de otras apps: `{ "mcpServers": {}, "imports": ["claude-desktop", "cursor", "codex", "vscode"] }`.

El servidor anterior (`context-mcp-server`, de terceros) quedÃ³ **retirado** de las apps porque capturaba
contexto de forma automÃ¡tica y exponÃ­a `delete_file`, `write_file` y `git_push` a todas las apps. TambiÃ©n se
quitaron los hooks `PreToolUse`/`PostToolUse` que escribÃ­an en Ã©l desde Claude Code. **Sus datos siguen
intactos** en `C:\Users\QsManu-Movil\.context-mcp` y se importan cuando quieras (paso 7).

Detalle tÃ©cnico de la auditorÃ­a: [docs/mcp-config-recon-report.md](docs/mcp-config-recon-report.md)

---

## 3. InstalaciÃ³n paso a paso

> Todo se ejecuta en una terminal (`Win + X` â†’ *Terminal*).

### Paso 0 â€” Requisitos

```powershell
node --version    # 20 o superior
```

### Paso 1 â€” Revisar quÃ© va a hacer (sin escribir nada)

```powershell
cd D:\Repositories\shared-mcp-local
npm install                                        # idempotente
powershell -ExecutionPolicy Bypass -File .\install.ps1 -DryRun
```

### Paso 2 â€” Instalar (hace backup de todo)

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Por app: backup â†’ agrega/actualiza el servidor MCP `QSMANU-LOCAL-SHARED-MCP` â†’ retira generaciones
anteriores (`context-mcp`, `sharedctx`) â†’ escribe el bloque de instrucciones opt-in.

- Backups: `<archivo>.backup-sharedctx-<fecha>` (10 en la Ãºltima corrida, todos verificados)
- Manifiesto: `state\install-manifest.json` Â· log: `state\install-log.txt`
- Â¿Conservar el servidor viejo? `.\install.ps1 -KeepContextMcp`

### Paso 3 â€” Tener `sharedctx` a mano

```powershell
npm link
sharedctx status
```

Sin `npm link`, usÃ¡ `node D:\Repositories\shared-mcp-local\src\cli.js` en su lugar.

### Paso 4 â€” Elegir el modo

```powershell
sharedctx mode ask        # (recomendado) cada publicaciÃ³n la aprobÃ¡s vos
```

| Modo | Lee | Publica | CuÃ¡ndo |
|---|---|---|---|
| `off` | âœ— | âœ— | No quiero compartir nada ahora |
| `readonly` | âœ“ | âœ— | Que lean, pero no escriban |
| `ask` | âœ“ | pendiente de tu OK | Uso normal (por defecto) |
| `on` | âœ“ | directo | Cuando molesta aprobar |

### Paso 5 â€” Reiniciar las apps

CerrÃ¡ y volvÃ© a abrir Claude Desktop, Cursor, Antigravity, Kimchi Studio, VS Code y Codex.
**DeepSeek Harness no hace falta**: recarga el perfil en caliente y las herramientas
`mcp__QSMANU-LOCAL-SHARED-MCP__*` aparecen en la sesiÃ³n en curso.

### Paso 6 â€” Verificar

Pedile a cada app, en un chat nuevo: Â«EjecutÃ¡ shared_status y decime el modo y el proyecto activo.Â»
Debe responder `ask`, la app, y el proyecto con **cÃ³mo lo detectÃ³**.

### Paso 7 â€” Elegir quÃ© importar del contexto viejo (opcional)

```powershell
$T = "D:\Repositories\shared-mcp-local\tools\import-context-mcp.mjs"

node $T --list                       # ver proyectos, entradas, fechas y rutas (no escribe)
node $T --interactive                # te pregunta proyecto por proyecto (s/n/t/q)
node $T --only personal-tfm,oat-architecture
node $T --all --exclude casa-meco
node $T --all --since 2026-10-01 --types decision,handoff
```

Siempre podÃ©s simular antes con `--dry-run`. El almacÃ©n viejo no se modifica.

### Paso 8 â€” Revertir todo (si algo no te gusta)

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Restore
```

Restaura los backups mÃ¡s recientes de cada archivo tocado.

---

## 4. Uso diario

**Cerrar un tramo de trabajo** (en la app donde estÃ¡s):

> PublicÃ¡ el handoff de este proyecto en el contexto compartido: quÃ© hicimos, quÃ© quedÃ³ pendiente y el prÃ³ximo paso.

```powershell
sharedctx pending            # ver quÃ© espera tu aprobaciÃ³n
sharedctx approve <id>       # o: sharedctx approve all
sharedctx reject all         # o descartar
```

**Retomar en otra app:**

> TraÃ© el contexto compartido del proyecto y seguÃ­ desde donde quedÃ³.

**Si la app ya no te deja pedir nada** (sesiÃ³n cortada, sin turnos, colgada): publicÃ¡s vos, sin la app.

```powershell
sharedctx add --project "Personal - TFM" --title "Estado capÃ­tulo 3" --clipboard
sharedctx handoff --project "OAT - Architecture" --clipboard
sharedctx note --project "OAT - Architecture"     # Bloc de notas con plantilla
sharedctx ingest                                  # publica lo que dejaste en ~\.shared-mcp\inbox
```

**Otros comandos:**

```powershell
sharedctx status                       # modo, app, proyecto y cÃ³mo lo detectÃ³
sharedctx use "OAT - Architecture"     # fija el proyecto para TODAS las apps
sharedctx use --clear                  # vuelve a la detecciÃ³n automÃ¡tica
sharedctx alias "Personal - TFM" "TFM Master"
sharedctx projects                     # proyectos, alias y rutas
sharedctx list casorio-ayp
sharedctx show <id> --project casorio-ayp
sharedctx audit --limit 40
sharedctx export --project casorio-ayp --out "C:\...\ChatGPT\Personal - TFM\.shared"
```

Flujos completos y ejemplos por escenario: [docs/CASOS-DE-USO.md](docs/CASOS-DE-USO.md)

---

## 5. Ajustes finos

**Fijar el proyecto por carpeta** (recomendado en cada repo): `.sharedctx.json` en la raÃ­z:

```json
{ "project": "oat-architecture" }
```

**Servidor HTTP** (si alguna app solo acepta MCP remoto, o para compartir un Ãºnico proceso):

```powershell
sharedctx serve --http --port 3111
# MCP:    http://127.0.0.1:3111/mcp
# salud:  http://127.0.0.1:3111/health
```

Kimchi discrimina por estructura, no por `type`: `command` â‡’ stdio, `url` â‡’ remoto
(`"httpTransport": "sse"` si hiciera falta SSE).

**Mover el almacÃ©n** (por ejemplo a otro disco):

```powershell
$env:SHARED_MCP_HOME = 'D:\shared-context'   # y agregalo en el bloque env de cada app
```

---

## 6. SoluciÃ³n de problemas

| SÃ­ntoma | Causa probable | SoluciÃ³n |
|---|---|---|
| La app no muestra `QSMANU-LOCAL-SHARED-MCP` | No se reiniciÃ³ | CerrÃ¡ la app por completo y abrila de nuevo |
| Â«spawn node ENOENTÂ» | `node` fuera del PATH del usuario | PonÃ© la ruta completa `C:\Program Files\nodejs\node.exe` en la entrada MCP |
| El server arranca y muere | Falta `npm install` | `cd D:\Repositories\shared-mcp-local; npm install` |
| `shared_status` dice Â«sin determinarÂ» | La app lanzÃ³ el servidor desde una carpeta del sistema | `sharedctx use "<proyecto>"` una vez, o decile el proyecto al asistente |
| Publica pero Â«no apareceÂ» | Modo `ask`: estÃ¡ pendiente | `sharedctx pending` y `sharedctx approve <id>` |
| DetectÃ³ el proyecto equivocado | Memoria por app desactualizada | `sharedctx use "<proyecto>"` (manda sobre todo) |
| QuerÃ©s ver el historial | â€” | `sharedctx audit --limit 50` |

DiagnÃ³stico del servidor MCP sin abrir ninguna app:

```powershell
node test\mcp-smoke.mjs      # 28 pruebas de punta a punta
```

---

## 7. Estructura del repositorio

```
shared-mcp-local\
  install.ps1                        instalador idempotente con backups, manifiesto y -Restore
  src\store.js                       almacÃ©n, modos, identidad de proyectos, bandeja, auditorÃ­a
  src\server.js                      las 7 herramientas MCP + protocolo opt-in
  src\stdio.js / src\http.js         entradas MCP por stdio y por HTTP (loopback)
  src\cli.js                         `sharedctx`
  tools\merge-mcp-json.mjs           ediciÃ³n quirÃºrgica de configs JSON
  tools\merge-codex-toml.mjs         ediciÃ³n quirÃºrgica del config.toml de Codex
  tools\strip-context-mcp-hooks.mjs  quita hooks de captura automÃ¡tica
  tools\import-context-mcp.mjs       importaciÃ³n selectiva del contexto viejo
  tools\recon\                       utilidades de auditorÃ­a de app.asar
  agents\contexto-compartido.md      bloque de instrucciones que se inyecta en cada app
  docs\CASOS-DE-USO.md               casos de uso por escenario
  docs\mcp-config-recon-report.md    auditorÃ­a de esquemas MCP de cada app
  test\mcp-smoke.mjs                 28 pruebas de humo
  state\                             manifiesto, log y JSON temporales
```

---

## 8. QuÃ© NO hace este servidor (a propÃ³sito)

- No captura conversaciones ni resultados de herramientas por su cuenta.
- No lee ni escribe archivos de tu cÃ³digo: solo su propio almacÃ©n en `~\.shared-mcp`.
- No ejecuta comandos, ni git, ni borrados recursivos.
- No abre puertos a la red: el HTTP opcional escucha solo en `127.0.0.1`.
- No manda nada a internet: todo el trÃ¡fico es entre la app y este proceso local.
