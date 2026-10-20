# QSMANU-LOCAL-SHARED-MCP — contexto compartido local entre herramientas de AI

Un único contexto **local**, **por proyecto** y **con consentimiento explícito**, que todas tus
herramientas de AI pueden leer y escribir… **solo cuando vos querés**.

- Servidor MCP: **`QSMANU-LOCAL-SHARED-MCP`**
- Comando local: **`sharedctx`**
- Almacén: `C:\Users\QsManu-Movil\.shared-mcp` (texto plano, Markdown + JSON)

Herramientas soportadas: Claude Desktop · Cursor · Codex / ChatGPT desktop · Antigravity (agente e IDE) ·
Kimi Code · VS Code Copilot · Claude Code · DeepSeek Harness · y ChatGPT web por exportación a Markdown.

## Flujo simple: continuar de ChatGPT en Claude Desktop

Sí, es posible. Usá siempre el mismo nombre de proyecto, por ejemplo `Personal - TFM`.

### Caso A: ChatGPT todavía responde

En ChatGPT decí:

> Actualizá el historial del MCP para el proyecto Personal - TFM. Guardá qué hicimos,
> qué decisiones tomamos, qué quedó pendiente y cuál es el próximo paso.

Si el modo es `ask`, ChatGPT te va a indicar que la publicación quedó pendiente. En ese caso,
aprobala desde una consola:

```powershell
sharedctx pending
sharedctx approve <id>
```

Después abrí Claude Desktop y decile:

> Traé el contexto compartido del proyecto Personal - TFM y continuá desde donde quedó.

### Caso B: ChatGPT ya no tiene tokens

No necesitás que ChatGPT haga nada. Copiá primero el último resumen al portapapeles y ejecutá:

```powershell
sharedctx handoff --project "Personal - TFM" --clipboard
```

El comando lee el portapapeles y guarda ese texto como handoff. Luego continuá en Claude Desktop con:

> Traé el contexto compartido del proyecto Personal - TFM y continuá desde donde quedó.

### Qué hace falta y qué no

- Hace falta que ChatGPT y Claude Desktop tengan instalado `QSMANU-LOCAL-SHARED-MCP`.
- Hace falta que ambas usen exactamente `Personal - TFM` como proyecto.
- No hace falta mantener un servidor web ni tener el panel abierto: cada app inicia el MCP local.
- No se transfiere la conversación completa ni se comparten tokens; se comparte el resumen que
  se guardó como handoff.
- El archivo `.sharedctx.json` en la raíz del repositorio fija el proyecto y evita que una app
  elija otro por error.

El resto de este README describe instalación, importación, diagnóstico y opciones avanzadas.

**Casos de uso concretos (personal vs. laboral, app bloqueada, migración selectiva):**
[docs/CASOS-DE-USO.md](docs/CASOS-DE-USO.md)

---

## 1. Cómo funciona (y qué garantiza)

```
              ┌──────────────┐   ┌────────────────┐   ┌──────────────┐
   Claude ────┤              │   │                │   │              │
   Cursor ────┤ QSMANU-      │◄──┤ modo de        │   │ ~/.shared-mcp/
   Codex  ────┤ LOCAL-SHARED-├──►│ consentimiento │──►│ projects/<p>/
   Kimi   ────┤ MCP          │   │ off/ro/ask/on  │   │  handoff.md
   VS Code ───┤ (MCP local)  │   └────────────────┘   │  entries/*.md
   DSH    ────┤ 8 herramientas│                       │ pending/ audit.log
              └──────────────┘                        └──────────────┘
```

**Garantías de diseño**

| Garantía | Cómo se cumple |
|---|---|
| Nada se comparte automáticamente | No hay hooks, ni captura de conversaciones, ni resúmenes automáticos. Solo se publica si alguien llama a `shared_publish` |
| El modelo no puede darse permiso | El modo de consentimiento **no es una herramienta MCP**: se cambia únicamente por CLI (`sharedctx mode ...`) |
| Vos aprobás cada publicación y cada borrado | Modo `ask` (por defecto): publicar o borrar deja un pendiente en `pending/` hasta que corras `sharedctx approve <id>` |
| Un proyecto no se filtra a otro | Almacén separado por proyecto; leer otro exige `confirm_cross_project` y queda auditado |
| El modelo no puede tocar archivos ni ejecutar nada | 8 herramientas, ninguna de archivos, shell o git; `shared_forget` solo borra una entrada y también pasa por aprobación |
| Todo es auditable | `audit.log` (JSONL) registra cada lectura, publicación, aprobación y cambio de modo |
| Todo queda en tu disco | `~\.shared-mcp`; el servidor HTTP opcional escucha solo en `127.0.0.1` (verificado con netstat) |

**Herramientas MCP expuestas** (nada más):

| Herramienta | Qué hace | Escribe |
|---|---|---|
| `shared_status` | modo, app, proyecto activo y **cómo lo detectó**, pendientes | no |
| `shared_pull` | handoff + últimas entradas del proyecto activo | no |
| `shared_list` | proyectos, entradas, alias y rutas conocidas | no |
| `shared_publish` | publica (con `confirm: true`) | sí, según el modo |
| `shared_pending` | publicaciones esperando tu OK | no |
| `shared_use_project` | fija el proyecto (sesión + memoria de esa app) | solo su estado, no contexto |
| `shared_related` | vecindario de una entrada: las que comparten etiquetas, archivos o contenido | no |
| `shared_forget` | borra una entrada puntual | sí, según el modo |

### 1.1 Detección automática del proyecto

Pensada para tu caso: **el mismo nombre de proyecto en todas las apps**. Cascada, de la señal más fuerte
a la más débil:

1. el nombre que pida explícitamente la herramienta (`project`)
2. el proyecto fijado en la sesión (`shared_use_project`)
3. señales del proceso: `.sharedctx.json`, raíz de git, carpeta actual
4. **workspace de DeepSeek Harness** — lee `~\.dsh\storages\workspace.json` y usa el `title`
   (ej. `Personal - Shared-MCP-Local`) y su `path`
5. **memoria por app** — el último proyecto que usaste en esa herramienta
6. **proyecto activo global** — `sharedctx use "<proyecto>"`, vale para todas las apps

Los nombres se emparejan **ignorando mayúsculas, acentos, espacios y guiones**
(`Personal - Shared-MCP-Local` ≡ `personal-shared-mcp-local`), más alias y rutas que el sistema
aprende solo en cada uso. Si un nombre nuevo comparte la ruta de un proyecto ya conocido, **se unifica**
en vez de duplicarlo. Si nada alcanza, **no inventa**: pregunta.

---

## 2. Estado de tu máquina

| App | Archivo de configuración | Estado |
|---|---|---|
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | ✅ `QSMANU-LOCAL-SHARED-MCP` |
| Cursor | `%USERPROFILE%\.cursor\mcp.json` | ✅ |
| Codex / ChatGPT desktop | `%USERPROFILE%\.codex\config.toml` | ✅ con aprobación extra en `shared_publish` |
| Antigravity (agente **e** IDE) | `%USERPROFILE%\.gemini\config\mcp_config.json` | ✅ (comparten el mismo archivo) |
| Kimi Code | `%USERPROFILE%\.kimi-code\mcp.json` | Desinstalada; quedan archivos residuales que no activan la instalación |
| VS Code (Copilot) | `%APPDATA%\Code\User\mcp.json` (`servers`, `type: stdio`) | ✅ |
| GitHub Copilot CLI | `%USERPROFILE%\.copilot\mcp-config.json` | CLI no detectado; configuración independiente de VS Code |
| Perplexity Windows | Conector remoto desde la app | Instalada; MCP local solo disponible en macOS |
| DeepSeek Harness | `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` | ✅ plugin `dsh-mcp-client` |
| Claude Code | vía `claude mcp add` | CLI no instalado; hooks automáticos ya eliminados |

Dos aclaraciones que salieron de auditar los binarios de cada app:

- **Antigravity (agente) y Antigravity IDE comparten `~\.gemini\config\mcp_config.json`.**
  El IDE *no* usa `%APPDATA%\Antigravity IDE\User\mcp.json`; su carpeta `~\.gemini\antigravity-ide\mcp\`
  es solo caché de herramientas descubiertas.
- **Kimi Code** admite además configuración por proyecto en `<repo>\.kimi-code\mcp.json`.

El servidor anterior (`context-mcp-server`, de terceros) quedó **retirado** de las apps porque capturaba
contexto de forma automática y exponía `delete_file`, `write_file` y `git_push` a todas las apps. También se
quitaron los hooks `PreToolUse`/`PostToolUse` que escribían en él desde Claude Code. **Sus datos siguen
intactos** en `C:\Users\QsManu-Movil\.context-mcp` y se importan cuando quieras (paso 7).

Detalle técnico de la auditoría: [docs/mcp-config-recon-report.md](docs/mcp-config-recon-report.md)

---

## 3. Instalación paso a paso

> Todo se ejecuta en una terminal (`Win + X` → *Terminal*).

### Paso 0 — Requisitos

```powershell
node --version    # 20 o superior
```

### Paso 1 — Revisar qué va a hacer (sin escribir nada)

```powershell
cd D:\Repositories\shared-mcp-local
npm install                                        # idempotente
powershell -ExecutionPolicy Bypass -File .\install.ps1 -DryRun
```

El instalador primero hace un barrido de Windows (comandos, ejecutables, configuración existente y
registro de aplicaciones instaladas) y solo configura las herramientas que detecta. Para inspeccionar
el resultado sin escribir nada o acotar la selección:

```powershell
.\install.ps1 -ListApps
.\install.ps1 -VerifyOnly  # revisa configs y prueba MCP sin modificar archivos
.\install.ps1 -Apps cursor,codex,kimi-code -DryRun
.\install.ps1 -ExcludeApps claude-code,dsh
```

`-Apps` también sirve como selección explícita cuando una instalación portable no puede detectarse.

Las carpetas residuales no cuentan como instalación. El instalador revisa al terminar todas las apps
detectadas: valida las entradas JSON y prueba el handshake MCP con esas configuraciones; para TOML
y el perfil YAML comprueba el registro. Esto no confirma una sesión activa dentro de cada aplicación:
reiniciala e invocá `shared_status` para comprobarla. `-VerifyOnly` devuelve código 1 si detecta problemas.
Perplexity Windows aparece como integración manual, porque el MCP local está disponible solo en
[macOS](https://www.perplexity.ai/help-center/en/articles/11502712-local-and-remote-mcps-for-perplexity).

### Paso 2 — Instalar (hace backup de todo)

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Por app: backup → agrega/actualiza el servidor MCP `QSMANU-LOCAL-SHARED-MCP` → retira generaciones
anteriores (`context-mcp`, `sharedctx`) → escribe el bloque de instrucciones opt-in.

- Backups: `<archivo>.backup-sharedctx-<fecha>`
- Manifiesto: `state\install-manifest.json` · log: `state\install-log.txt`
- ¿Conservar el servidor viejo? `.\install.ps1 -KeepContextMcp`

### Paso 3 — Tener `sharedctx` a mano

```powershell
npm link
sharedctx status
```

Sin `npm link`, usá `node D:\Repositories\shared-mcp-local\src\cli.js` en su lugar.

### Paso 4 — Elegir el modo

```powershell
sharedctx mode ask        # (recomendado) cada publicación la aprobás vos
```

| Modo | Lee | Publica | Cuándo |
|---|---|---|---|
| `off` | ✗ | ✗ | No quiero compartir nada ahora |
| `readonly` | ✓ | ✗ | Que lean, pero no escriban |
| `ask` | ✓ | pendiente de tu OK | Uso normal (por defecto) |
| `on` | ✓ | directo | Cuando molesta aprobar |

### Paso 5 — Reiniciar las apps

Cerrá y volvé a abrir Claude Desktop, Cursor, Antigravity, Kimi Code, VS Code y Codex.
**DeepSeek Harness no hace falta**: recarga el perfil en caliente y las herramientas
`mcp__QSMANU-LOCAL-SHARED-MCP__*` aparecen en la sesión en curso.

### Paso 6 — Verificar

Pedile a cada app, en un chat nuevo: «Ejecutá shared_status y decime el modo y el proyecto activo.»
Debe responder `ask`, la app, y el proyecto con **cómo lo detectó**.

### Paso 7 — Elegir qué importar del contexto viejo (opcional)

```powershell
$T = "D:\Repositories\shared-mcp-local\tools\import-context-mcp.mjs"

node $T --list                       # ver proyectos, entradas, fechas y rutas (no escribe)
node $T --interactive                # te pregunta proyecto por proyecto (s/n/t/q)
node $T --only personal-tfm,oat-architecture
node $T --all --exclude casa-meco
node $T --all --since 2026-10-01 --types decision,handoff
```

Siempre podés simular antes con `--dry-run`. El almacén viejo no se modifica.

### Paso 8 — Revertir todo (si algo no te gusta)

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Restore                  # estado previo a la PRIMERA instalación
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Restore -RestoreLatest   # deshace solo la última corrida
```

`-Restore` restaura el backup más antiguo de cada archivo, quita los bloques de instrucciones y borra los
archivos que creó el instalador. **Probado de ida y vuelta**: la máquina queda exactamente como estaba
(con `context-mcp` de vuelta y sin nada nuestro). **El contexto ya guardado no se toca.**

---

## 4. Panel web local (`sharedctx ui`)

```powershell
sharedctx ui --install       # arranque automático al iniciar sesión + lo arranca ahora
sharedctx ui --status        # ¿está corriendo? ¿tiene arranque automático?
sharedctx ui --uninstall     # quitar el arranque automático
sharedctx ui --open          # arrancarlo a mano y abrir el navegador
sharedctx ui --ensure        # levantarlo en segundo plano y salir (lo usan los accesos directos)
sharedctx ui --port 3200     # otro puerto
```

### Dónde vive cada cosa (importante)

| Pieza | ¿Es un servidor? | Dónde corre |
|---|---|---|
| **El MCP** (`QSMANU-LOCAL-SHARED-MCP`) | **No** | Es un **proceso stdio que arranca cada app cuando la abrís**: Claude Desktop, Cursor, Codex, Kimi, VS Code y DSH lanzan `node src\stdio.js` por su cuenta y lo cierran al salir. No hay nada que hostear ni que mantener levantado |
| Transporte MCP por HTTP | Sí (opcional) | `sharedctx serve --http` → `http://127.0.0.1:3111/mcp`. Solo hace falta si una app no soporta stdio |
| **Panel** (`sharedctx ui`) | Sí | `http://127.0.0.1:3120` (solo loopback). Es lo único que conviene tener siempre arriba |
| Almacén | No | `~\.shared-mcp`: archivos en disco, no un servicio |

### Arranque automático del panel

`sharedctx ui --install` escribe un lanzador y lo registra en el inicio de sesión:

```
~\.shared-mcp\state\run-dashboard.cmd    lanzador (ruta absoluta de node, ASCII puro)
~\.shared-mcp\state\run-dashboard.vbs    lo lanza sin mostrar ventana
~\.shared-mcp\dashboard.log              salida del panel
```

Primero intenta una **tarea programada** de Windows (`schtasks /SC ONLOGON`). Si Windows pide elevación
—como pasa en esta máquina— cae a la **clave `Run` del usuario** (`HKCU\...\CurrentVersion\Run`,
`QSMANU-LOCAL-SHARED-MCP-panel`), que no necesita administrador y arranca igual al iniciar sesión, oculto.
`sharedctx ui --status` dice cuál de las dos quedó activa.

Arrancar dos veces no molesta: si el panel ya responde, el segundo intento sale sin hacer nada.

### Botones en el escritorio (opcional)

Si no querés abrir una consola, creá tres accesos directos con iconos nativos:

```powershell
powershell -ExecutionPolicy Bypass -File tools\atajos.ps1
```

| Botón | Qué hace |
|---|---|
| **QSMANU - Panel de contexto** (`tools\panel.cmd`) | Levanta el panel si hace falta y lo abre |
| **QSMANU - Estado del contexto** (`tools\estado.cmd`) | Modo, proyectos, salud y qué conviene arreglar |
| **QSMANU - Reparar conexión** (`tools\reparar.cmd`) | Vuelve a configurar el MCP en las apps (con backup) |

Los `.cmd` son envoltorios finos sobre `sharedctx ui --ensure` / `sharedctx insights` / `install.ps1`, así que
el escritorio no guarda lógica: si movés o actualizás el repo, los botones siguen funcionando. Para quitarlos:

```powershell
powershell -ExecutionPolicy Bypass -File tools\atajos.ps1 -Quitar
```

Una interfaz **de solo lectura** (y solo loopback) que muestra el estado real del servidor:

| Sección | Qué muestra |
|---|---|
| Tarjetas | modo de consentimiento, **salud del contexto (0-100)**, proyectos, entradas, tamaño en disco, **apps conectadas ahora**, pendientes y última actividad |
| **Grafo de contexto** | proyectos (círculos, tamaño = entradas) y apps (rombos) unidos por el contexto que aportó cada una; las conectadas en este momento se marcan en verde. Arrastrable, con zoom y pan, botón **Centrar**, **Descargar PNG** y detalle al hacer clic |
| **Grafo de entradas** | cada entrada unida a las demás por **etiquetas**, **archivos**, **menciones** (`[[título]]` o id) y **contenido parecido** (los posibles duplicados van en rojo punteado). Colores por tipo (`handoff`, `decision`, `task`, `bug`, `question`), zoom/pan, buscador en vivo, conmutadores de etiquetas/archivos, selector de proyecto, exportación a **DOT**, **Mermaid** y **PNG**, y detalle con Markdown al hacer clic |
| **Diagnóstico** | salud 0-100 y qué conviene arreglar: proyectos sin handoff, entradas huérfanas, duplicados, archivos compartidos entre proyectos, contexto escrito por una sola app, entradas viejas, pendientes olvidados. Cada aviso trae el comando para resolverlo |
| Proyectos | entradas, última actualización, handoff completo, desglose por app y por tipo, y actividad de los últimos 30 días |
| Apps conectadas | estado de configuración leído del archivo de cada app, **sesiones MCP vivas** (heartbeat real con pid y transporte), proyecto actual y proyectos con contexto de esa app |
| Métodos MCP | las 8 herramientas con su descripción y su JSON Schema, más las instrucciones opt-in que recibe el modelo |
| Pendientes | lo que espera tu aprobación, con el comando exacto para aprobarlo |
| Auditoría | últimos eventos de `audit.log` |

El panel no expone ninguna ruta de escritura (probado: `POST` → 405), está atado a `127.0.0.1` y no
permite salir de su carpeta de assets. Se refresca solo cada 5 segundos; los dos grafos **duermen** cuando
la física queda quieta (dejan de pedir frames) y se despiertan al arrastrar, hacer zoom, buscar o recibir
datos nuevos.

**Lo mismo desde la terminal**, sin abrir el navegador:

```powershell
sharedctx insights                          # salud + qué arreglar, con el comando de cada cosa
sharedctx insights "Personal - TFM" --json  # acotado a un proyecto, en JSON
sharedctx graph "Personal - TFM"            # entradas ordenadas por cantidad de relaciones
sharedctx graph --type dot > contexto.dot   # para Graphviz / Obsidian / Gephi
sharedctx graph --type mermaid > contexto.mmd  # para GitHub, PRs u Obsidian
sharedctx graph --type md                   # para pegar en un README
```

---

## 5. Uso diario

**Cerrar un tramo de trabajo** (en la app donde estás):

> Publicá el handoff de este proyecto en el contexto compartido: qué hicimos, qué quedó pendiente y el próximo paso.

```powershell
sharedctx pending            # ver qué espera tu aprobación (publicaciones y borrados)
sharedctx approve <id>       # o: sharedctx approve all
sharedctx reject all         # o descartar
```

Los borrados que pide el modelo (`shared_forget`) usan el mismo circuito: en modo `ask` no borran nada
hasta que aprobás el pendiente.

**Mantener un documento vivo sin duplicarlo:** publicá con un `--id` fijo (o `id:` en el encabezado del
archivo de la bandeja). Republicar con el mismo id **actualiza** la entrada y conserva la fecha original:

```powershell
sharedctx add --id adr-014 --project "OAT - Architecture" --title "ADR-014" --file .\adr-014.md
```

**Retomar en otra app:**

> Traé el contexto compartido del proyecto y seguí desde donde quedó.

**Si la app ya no te deja pedir nada** (sesión cortada, sin turnos, colgada): publicás vos, sin la app.

```powershell
sharedctx add --project "Personal - TFM" --title "Estado capítulo 3" --clipboard
sharedctx handoff --project "OAT - Architecture" --clipboard
sharedctx note --project "OAT - Architecture"     # Bloc de notas con plantilla
sharedctx ingest                                  # publica lo que dejaste en ~\.shared-mcp\inbox
```

**Otros comandos:**

```powershell
sharedctx status                       # modo, app, proyecto y cómo lo detectó
sharedctx use "OAT - Architecture"     # fija el proyecto para TODAS las apps
sharedctx use --clear                  # vuelve a la detección automática
sharedctx alias "Personal - TFM" "TFM Master"
sharedctx projects                     # proyectos, alias y rutas
sharedctx list casorio-ayp
sharedctx show <id> --project casorio-ayp
sharedctx audit --limit 40
sharedctx export --project casorio-ayp --out "C:\...\ChatGPT\Personal - TFM\.shared"
```

Flujos completos y ejemplos por escenario: [docs/CASOS-DE-USO.md](docs/CASOS-DE-USO.md)

---

## 6. Ajustes finos

**Fijar el proyecto por carpeta** (recomendado en cada repo): `.sharedctx.json` en la raíz:

```json
{ "project": "oat-architecture" }
```

Este repo ya lo tiene con `Personal - Shared-MCP-Local`, así cualquier app que abra esta carpeta resuelve
el mismo proyecto que DeepSeek Harness.

**Servidor HTTP** (si alguna app solo acepta MCP remoto, o para compartir un único proceso):

```powershell
sharedctx serve --http --port 3111
# MCP:    http://127.0.0.1:3111/mcp
# salud:  http://127.0.0.1:3111/health
```

Kimi Code usa `mcpServers` con `command`; el transporte HTTP queda para apps que solo aceptan MCP remoto
(`"httpTransport": "sse"` si hiciera falta SSE).

**Mover el almacén** (por ejemplo a otro disco):

```powershell
$env:SHARED_MCP_HOME = 'D:\shared-context'   # y agregalo en el bloque env de cada app
```

---

## 7. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| La app no muestra `QSMANU-LOCAL-SHARED-MCP` | No se reinició | Cerrá la app por completo y abrila de nuevo |
| «spawn node ENOENT» | `node` fuera del PATH del usuario | Poné la ruta completa `C:\Program Files\nodejs\node.exe` en la entrada MCP |
| El server arranca y muere | Falta `npm install` | `cd D:\Repositories\shared-mcp-local; npm install` |
| `shared_status` dice «sin determinar» | La app lanzó el servidor desde una carpeta del sistema | `sharedctx use "<proyecto>"` una vez, o decile el proyecto al asistente |
| Publica pero «no aparece» | Modo `ask`: está pendiente | `sharedctx pending` y `sharedctx approve <id>` |
| Detectó el proyecto equivocado | Memoria por app desactualizada | `sharedctx use "<proyecto>"` (manda sobre todo) |
| `--content` falla con un texto enorme | Límite de ~32 KB de la línea de comandos de Windows | Usá `--file`, `--clipboard` o la bandeja con `sharedctx ingest` |
| Querés ver el historial | — | `sharedctx audit --limit 50` |

Diagnóstico del servidor MCP sin abrir ninguna app:

```powershell
npm test                     # 134 pruebas (36 protocolo + 27 robustez + 24 relaciones + 27 panel + 19 interfaz + 1 detección)
node test\mcp-smoke.mjs      # protocolo MCP punta a punta
node test\robustness.mjs     # contenido grande, unicode, BOM, candados, ids y escritura atómica
node test\relations.mjs      # grafo de entradas, diagnóstico y exportaciones
node test\dashboard.mjs      # panel web: endpoints, solo lectura, assets
node test\ui.mjs             # renderiza la interfaz de verdad (jsdom) y busca errores de runtime
```

`test\ui.mjs` carga el panel en jsdom contra un servidor real, dibuja los dos grafos con un canvas de
prueba, hace clic en las pestañas, abre el grafo de un proyecto y el detalle de una entrada, y falla si
aparece **cualquier** error de runtime en la consola. Es la red que atrapa los bugs que no se ven desde
la API (por ejemplo, un canvas mal resuelto).

El panel también sirve para diagnosticar: si una app figura **configurada** pero no **conectada ahora**,
es que todavía no se reinició (o el proceso MCP se cayó y el log de la app lo dice).

---

## 8. Estructura del repositorio

```
shared-mcp-local\
  install.ps1                        instalador idempotente: backups, manifiesto, -Restore, -DryRun
  .sharedctx.json                    fija el nombre del proyecto para cualquier app que abra esta carpeta
  src\store.js                       almacén, modos, identidad de proyectos, bandeja, sesiones, auditoría
  src\server.js                      las 8 herramientas MCP + protocolo opt-in
  src\relations.js                   grafo de entradas (tags/archivos/menciones/similitud) + diagnóstico
  src\stdio.js / src\http.js         entradas MCP por stdio y por HTTP (loopback)
  src\dashboard.js                   panel web local (API JSON + estáticos, solo lectura)
  src\cli.js                         `sharedctx`
  src\apps.js                        catálogo de apps y de dónde lee cada una su config MCP
  ui\index.html · app.js · style.css interfaz del panel (sin dependencias ni build)
  tools\merge-mcp-json.mjs           edición quirúrgica de configs JSON
  tools\merge-codex-toml.mjs         edición quirúrgica del config.toml de Codex
  tools\strip-context-mcp-hooks.mjs  quita hooks de captura automática
  tools\import-context-mcp.mjs       importación selectiva del contexto viejo
  tools\atajos.ps1                   crea/quita los accesos directos del escritorio
  tools\panel.cmd · estado.cmd · reparar.cmd   botones finos sobre sharedctx/install.ps1
  tools\recon\                       utilidades de auditoría de app.asar
  agents\contexto-compartido.md      bloque de instrucciones que se inyecta en cada app
  docs\CASOS-DE-USO.md               casos de uso por escenario
  docs\mcp-config-recon-report.md    auditoría de esquemas MCP de cada app
  docs\contexto\*.md                 las entradas de este proyecto publicadas en el contexto
  test\install-detection.ps1         1 prueba del barrido de apps instaladas
  test\mcp-smoke.mjs                 36 pruebas de protocolo MCP
  test\robustness.mjs                27 pruebas de robustez (ids, atomicidad, publicación idempotente)
  test\relations.mjs                 24 pruebas del grafo de entradas y el diagnóstico
  test\dashboard.mjs                 27 pruebas del panel (API)
  test\ui.mjs                        19 pruebas que renderizan la interfaz en jsdom
  state\                             manifiesto, log y JSON temporales (ignorado por git)
```

---

## 9. Qué NO hace este servidor (a propósito)

- No captura conversaciones ni resultados de herramientas por su cuenta.
- No lee ni escribe archivos de tu código: solo su propio almacén en `~\.shared-mcp`.
- No ejecuta comandos, ni git, ni borrados recursivos.
- No abre puertos a la red: el HTTP opcional escucha solo en `127.0.0.1`.
- No manda nada a internet: todo el tráfico es entre la app y este proceso local.
