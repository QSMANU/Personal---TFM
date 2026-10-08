# Recon MCP — esquemas EXACTOS de configuración (solo lectura)

Fecha: 2026-02 (sesión DSH). Ningún archivo del sistema fue modificado. Todos los temporales están en
`D:\Repositories\shared-mcp-local\.recon\`.

---

## 1) KIMCHI STUDIO

### (a) Rutas exactas

| Rol | Ruta | Estado |
|---|---|---|
| Config global MCP del harness (la que administra la Desktop app) | `C:\Users\QsManu-Movil\.config\kimchi\harness\mcp.json` | **EXISTE** (199 bytes, con `context-mcp`) |
| Config de proyecto (compartida, tipo Claude Code) | `<cwd>\.mcp.json` | no existe en este workspace |
| Config de proyecto "Pi/Kimchi-owned" | `<cwd>\.kimchi\mcp.json` | no existe |
| Caché de descubrimiento de tools | `...\.config\kimchi\harness\mcp-cache.json` | existe |
| Settings del harness | `...\.config\kimchi\harness\settings.json` | existe |
| Trust de proyectos | `...\.config\kimchi\harness\trust.json` | existe |

Evidencia de las rutas (`resources\kimchi-harness\win32-x64\share\kimchi\package.json`):

```json
"piConfig": { "name": "kimchi", "configDir": ".config/kimchi/harness", "mcpProjectConfigDir": ".kimchi" }
```

y en `kimchi.exe` (pi-mcp-adapter 2.34.0 compilado):

```
KIMCHI_CONFIG_PATH = resolve(homedir(), ".config", "kimchi", "config.json");
AGENT_CONFIG_DIR   = resolve(homedir(), ".config", "kimchi", "harness");
```

```
GENERIC_GLOBAL_CONFIG_PATH = join(homedir(), ".config", "mcp", "mcp.json");
PROJECT_CONFIG_NAME    = ".mcp.json"
PROJECT_PI_CONFIG_NAME = "mcp.json"
getProjectConfigPath(cwd)   -> resolve(cwd, ".mcp.json")
getProjectPiConfigPath(cwd) -> resolve(cwd, getMcpProjectConfigDirName(), "mcp.json")   // .kimchi/mcp.json
```

Orden de lectura real (string del panel `/mcp setup`, "later entries win"):

```
0. detected host configs (opt-in lowest-precedence fallback)
1. ~/.config/mcp/mcp.json
2. ~/.agents/mcp.json
3. ~/.agents/mcp/mcp.json
4. <Pi agent dir>/mcp.json
5. configured ancestor root to parent(cwd), farthest first (opt-in)
   per directory: .mcp.json, then <configDir>/mcp.json
6. cwd/.mcp.json
7. cwd/<configDir>/mcp.json          // cwd/.kimchi/mcp.json
```

El flag CLI `--mcp-config <path>` existe (`pi.registerFlag("mcp-config", { description: "Path to MCP config file", type: "string" })`)
y es lo que usa la Desktop app para apuntar el harness a `~/.config/kimchi/harness/mcp.json`.

### (b) JSON mínimo válido (nombres de campo reales)

Archivo top-level: `{ "mcpServers": { "<id>": <ServerEntry> }, "imports": [...], "settings": {...} }`.
La discriminación de transporte es **estructural**: `command` ⇒ stdio, `url` ⇒ remoto (SSE/Streamable HTTP).
Un entry con `command` **y** `url` a la vez se rechaza (`unsupported`).

```jsonc
{
  "mcpServers": {
    "local-stdio": {                      // STUDIO
      "command": "npx",                   // requerido, string no vacío
      "args": ["-y", "some-mcp@latest"],
      "env": { "TOKEN": "..." },
      "cwd": "C:\\work",
      "directTools": true,                // boolean | string[]
      "lifecycle": "lazy",                // 'lazy' | 'eager' | 'keep-alive'
      "idleTimeout": 10,
      "exposeResources": true,
      "excludeTools": ["dangerous_tool"],
      "debug": false,
      "disabled": true                    // <-- NO está en el tipo de la Desktop, pero el harness lo usa
    },
    "remote-streamable-http": {           // REMOTO (default del harness)
      "url": "https://mcp.example.com/mcp",     // requerido, http(s)
      "headers": { "X-Api-Key": "..." },
      "auth": "bearer",                   // 'oauth' | 'bearer' | false
      "bearerToken": "...",
      "bearerTokenEnv": "MY_TOKEN_VAR",
      "oauth": {                          // o false
        "grantType": "authorization_code",  // 'authorization_code' | 'client_credentials'
        "clientId": "...",
        "clientSecret": "...",
        "scope": "...",
        "redirectUri": "http://localhost:19876/callback"
      }
    },
    "remote-sse": {
      "url": "https://mcp.example.com/sse",
      "httpTransport": "sse"              // 'streamable-http' (default) | 'sse'
    }
  }
}
```

Campos extra confirmados **solo** en el harness (no en el tipo de la Desktop; pasan por el
`[key: string]: unknown` del tipo):
stdio `pluginDataDir`, `literalEnv`, `inheritEnv`; remoto `httpTransport`, `bearerTokenStore`,
`requestHeadersCommand`, `caFile`, `protocolVersion`; tercer tipo `socket` (transport por socket).
`httpTransport` acepta literalmente `"streamable-http"` (default) y `"sse"`; si se omite, el harness
intenta Streamable HTTP y **cae a SSE** como fallback:

```
let kind = definition.httpTransport ?? "streamable-http";
... if (definition.httpTransport === undefined && kind === "streamable-http" && shouldFallbackToSse(result.error, definition)) { kind = "sse"; continue; }
```

No existe campo `type` ni `transport` en este archivo (sí existen en `mcp.json` de *agent plugins*,
con `type: "stdio"|"streamable-http"|"sse"`, que se traduce a `httpTransport`).

`settings` del archivo: `toolPrefix` (`'server' | 'none' | 'short'`), `idleTimeout`, `directTools`,
`disableProxyTool`, `autoAuth`, `oauthDir`, `warnOnLargeDirectTools`, `oauthCredentialStore`,
`samplingAutoApprove`.
`imports` acepta literalmente: `cursor`, `claude-code`, `claude-desktop`, `codex`, `windsurf`, `vscode`.

### (c) Proyecto y deshabilitado

- **Sí admite servidores por proyecto**: `<cwd>\.mcp.json` (compartido) y `<cwd>\.kimchi\mcp.json`
  (propiedad de Kimchi/Pi), ambos con la **misma** forma `{"mcpServers":{...}}`, y ganan sobre el global.
- **Deshabilitar un servidor**: campo por-entry **`disabled: true`**:
  ```
  function isServerDisabled(definition) { return definition?.disabled === true; }
  ```
  Se gestiona también con `/mcp enable <server>` / `/mcp disable <server>` (+ `/reload`), que escriben
  un override en el archivo de proyecto (`writeProjectServerDisabledOverride(...)` → `{ ...existing, disabled: true }`).
  Mensaje del harness: `Server "X" is disabled. Run /mcp enable X and /reload to enable it.`
- **Tools no disponibles**: `excludeTools: string[]` por servidor, y a nivel global
  `settings.disableProxyTool`, `settings.toolPrefix`, `settings.directTools`.
- **Trust**: `trust.json` guarda rutas de proyecto aprobadas; hay un e2e `mcp-project-trust`
  (los servidores de proyecto requieren confianza).

### (d) Evidencia leída

- `C:\Users\QsManu-Movil\AppData\Local\Programs\kimchi-studio\resources\app.asar` →
  `node_modules/@kimchi/shared/src/types/harnessMcp.ts` (17696 B) y `.test.ts` (3795 B);
  `dist/types/harnessMcp.js` (7677 B).
  Cita: `mirrors the upstream Kimchi harness ServerEntry / McpConfig schema for ~/.config/kimchi/harness/mcp.json`
- `C:\Users\QsManu-Movil\AppData\Local\Programs\kimchi-studio\resources\kimchi-harness\win32-x64\bin\kimchi.exe`
  (125 MB; región volcada a `.recon\kimchi-harness-mcp-region.txt`).
- `...\kimchi-harness\win32-x64\share\kimchi\package.json` (bloque `piConfig`).
- `C:\Users\QsManu-Movil\.config\kimchi\harness\mcp.json` (contenido real, abajo).

Confianza: **CONFIRMADO** (tipos de la Desktop + binario del harness + archivo real en disco).

Nivel "hipótesis": ninguno relevante; sólo que `disabled` no está declarado en el tipo TS de la Desktop
(aunque el harness, que es el cliente real, lo honra).

---

## 2) DEEPSEEK HARNESS — plugin `@deepseek-ai/dsh-mcp-client`

Versión del paquete: **0.2.0-rc.2**.

### (a) Rutas exactas

- Esquema autoritativo (compilado): `C:\Users\QsManu-Movil\AppData\Local\Programs\DeepSeek Harness\resources\app.asar`
  → `dsh/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js` (líneas 776–802).
- Documentación: `.../dsh-mcp-client/README.md` y `README.i18n.yaml`.
- Capa de activación del usuario: `C:\Users\QsManu-Movil\.dsh\profiles\desktop\cordis.patch.yml`
  (raíz del perfil: `cordis.yml` = `[]`; bundles en `package.json`: `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`).

### (b) Esquema EXACTO (transcrito del `Config` compilado)

```js
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const Reconnect = z.object({
  enabled:        z.boolean().default(true),
  initialDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(500),
  maxDelayMs:     z.number().min(1).max(MAX_TIMER_DELAY_MS).default(30000),
  maxAttempts:    z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(10)
});
const Config = z.union([
  z.object({
    transport: z.const("stdio"),
    serverName: z.string().required().pattern(SERVER_NAME_PATTERN),
    command:    z.string().required(),
    args:       z.array(String).default([]),
    env:        z.dict(String).default({}),
    cwd:        z.string().default(""),
    toolCallTimeoutMs:   z.number().default(60000),
    failOnStartupError:  z.boolean().default(false),
    maxInstructionBytes: z.number().step(1).min(1).default(32768),
    reconnect: Reconnect
  }),
  z.object({
    transport: z.const("streamable-http"),
    serverName: z.string().required().pattern(SERVER_NAME_PATTERN),
    url:        z.string().required(),
    headers:    z.dict(String).default({}),
    toolCallTimeoutMs:   z.number().default(60000),
    failOnStartupError:  z.boolean().default(false),
    maxInstructionBytes: z.number().step(1).min(1).default(32768),
    reconnect: Reconnect
  })
]);
```

Notas duras:
- **Sólo dos transportes**: `"stdio"` y `"streamable-http"`. **No hay `sse`.**
- **No hay allowlist/denylist de tools**, ni `disabled`, ni `enabled`, ni `failOnStartupError`+`timeouts` separados.
- Los timeouts de conexión/descubrimiento NO son configurables (los hereda del SDK MCP: 60 s).

### (b2) Forma mínima válida en `cordis.patch.yml`

Tu forma propuesta es **correcta**: la entrada del patch es `- insert:` y su valor es una **lista** de
entries del loader. Evidencia (`applyEntryPatches`):

```
const { id, insert, name, ...overrides } = patch;
if (insert) {
  if (id) { ...target.config.push(...insert); }
  else data.push(...insert);       // <-- sin id: se insertan en la RAIZ del árbol
```

```yaml
- insert:
    - id: mcp-github
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: github
        transport: stdio
        command: npx
        args: ['-y', '@modelcontextprotocol/server-github']
        env:
          GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN
    - id: mcp-web
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: web
        transport: streamable-http
        url: http://localhost:3000/mcp
        headers:
          Authorization: !!js '`Bearer ${process.env.MCP_TOKEN}`'
```

Reglas: `id` de entry único; `serverName` único dentro del mismo registration scope
(dos entries con el mismo `serverName` ⇒ el segundo falla al cargar con error claro);
`serverName` sólo `[A-Za-z0-9_-]{1,32}`.

### Desactivar un servidor

No existe campo `disabled` en el `Config` del plugin. Para **desactivar** se usa el mecanismo del
loader (el propio comentario de cabecera de tu `cordis.patch.yml` lo dice: "id-targeted config
overrides, **disables**, and insert lists"):

```yaml
- id: mcp-github
  disabled: true
```

Evidencia en el loader DSH: `if (fiber.entry.disabled) return; fiber.entry.options.disabled = true;`
y `applyEntryPatches` copia `disabled` como override sobre el entry. Alternativa equivalente: quitar el
entry del patch.

### (c) Nombres de tools y verificación

- Nombres expuestos: **`mcp__<serverName>__<rawName>`** (ej. `mcp__github__create_issue`). En caso de
  colisión/normalización se añade un hash SHA-256 de 12 hex.
- El **README del paquete NO menciona ningún `ping`** ni comando de verificación. El que sí existe está en
  la guía de agente empaquetada en el asar:

```
Replace the endpoint, install the bundle through `plugin_manager`, then call `mcp__demo__ping` or another
newly available `mcp__<serverName>__<tool>` tool to verify the connection.
```

  Es decir: `mcp__demo__ping` es el ejemplo (el server `demo`), no un tool universal; sirve cualquier
  `mcp__<serverName>__<tool>` recién aparecido.

### (d) Evidencia leída

- asar → `dsh/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js` (dump a `.recon\dsh-mcp-client-lib.js`, 838 líneas), `README.md`, `README.i18n.yaml`, `package.json`.
- asar → loader `applyEntryPatches` (offset 13 869 064) y guía con `mcp__demo__ping` (offset 14 755 270).
- `C:\Users\QsManu-Movil\.dsh\profiles\desktop\cordis.patch.yml`, `cordis.yml`, `package.json`, `pnpm-workspace.yaml`.

Confianza: **CONFIRMADO**.

---

## 3) VS CODE

### Versión exacta

- `C:\Users\QsManu-Movil\AppData\Local\Programs\Microsoft VS Code\07f806f999\resources\app\package.json` → `"name": "Code"`, **`"version": "1.140.0"`**, `"distro": "98cdfb6c0c38e1d56be3090cdd57efa145852271"`.
- Confirmado por `Code.exe` → `FileVersion 1.140.0 / ProductVersion 1.140.0`.
- Ojo: `...\Microsoft VS Code\07f806f999\version` contiene `43.7.3`; es el marcador de la carpeta de
  instalación versionada (`product.json` → `"win32VersionedUpdate": true`), **no** la versión del producto.
- La extensión integrada de Copilot es `extensions\copilot` (`"name":"copilot-chat"`, `"version":"0.68.0"`).
- No hay `app.asar`: la app está **desempaquetada** en `...\07f806f999\resources\app\out\vs\workbench\workbench.desktop.main.js` (20 MB).

### (b) Ubicación y esquema

**Usuario / perfil (lo que preguntaste):** `%APPDATA%\Code\User\mcp.json`
`= C:\Users\QsManu-Movil\AppData\Roaming\Code\User\mcp.json` — **NO existe todavía** en este equipo.

Evidencia:
```
mcpResource: n && i?.useDefaultFlags?.mcp ? n.mcpResource : We(e, "mcp.json"),
languageModelsResource: ... We(e, "chatLanguageModels.json"),
settingsResource: ... We(e, "settings.json"),
```
(`We(e, "settings.json")` es el mismo constructor que produce `%APPDATA%\Code\User\settings.json`, que sí existe.)

Claves top-level del archivo (`fromUserMcpServers` / `withProfileMcpServers`):
```js
let a = r.inputs ?? [], c = r.servers ?? {};
...
return { servers: c, inputs: a, sandbox: r.sandbox };
```
⇒ **`servers` (objeto, no array), `inputs` (array), `sandbox`**.

Campos por servidor (normalizador `RU` + `sanitizeServer`):
```js
if (e === "stdio" || (!e && i)) return i ? { type:"stdio", command:i, args:r, env:a, envFile:c, cwd:l, dev:f } : undefined;
if (e === "http" || e === "streamable-http" || e === "sse" || (!e && n))
  return n ? { type:"http", ...(e==="sse"||t==="sse" ? { transport:"sse" } : {}), url:n, headers:u, ...(g?{oauth:g}:{}), dev:f } : undefined;
// e = o.type, t = o.transport ( "sse" | "http" ), g = { clientId } de o.oauth.clientId / o.oauthClientId
```
```js
sanitizeServer(e){ ... return (t.type===void 0 || t.type!=="http" && t.type!=="stdio") && (t.type = t.command ? "stdio" : "http"), t }
```

JSON mínimo:
```jsonc
{
  "servers": {
    "local": { "type": "stdio", "command": "npx", "args": ["-y", "x@latest"], "env": {}, "cwd": "C:\\w", "envFile": ".env" },
    "remote": { "type": "http", "url": "https://mcp.example.com/mcp", "headers": { "Authorization": "Bearer ..." } },
    "remote-sse": { "type": "http", "transport": "sse", "url": "https://mcp.example.com/sse" }
  },
  "inputs": [],
  "sandbox": {}
}
```
Valores literales: `type` ∈ {`"stdio"`, `"http"`, `"streamable-http"`, `"sse"`, `"ws"`(**reconocido y descartado**)}; `transport` ∈ {`"sse"`, `"http"`}; `oauth` = `{ "clientId": "..." }`; también `dev`, `version`, `gallery`.

**Otras ubicaciones que esta versión también lee** (todas con evidencia):
| Fuente | Ruta | Claves |
|---|---|---|
| workspace folder | `<folder>/.vscode/mcp.json` | `servers`,`inputs`,`sandbox`; schema `vscode://schemas/mcp` |
| raíz del workspace | `<root>/.mcp.json` (const `HA=".mcp.json"`) | `mcpServers` **opcional** (envuelto o plano) |
| Copilot global | `%USERPROFILE%\.copilot\mcp-config.json` (`hXt()`: `joinPath(s ?? joinPath(homedir,".copilot"),"mcp-config.json")`) | `mcpServers`; stdio: `type,command,args,env,cwd`; http: `type,url,headers,transport,oauth`; `transport` ∈ {`"http"`,`"sse"`}; `oauth` sólo `clientId` |

Registro del schema (`configuration-editing\package.json`):
`{"fileMatch":"/.vscode/mcp.json","url":"vscode://schemas/mcp"}`; `var a1e = "vscode://schemas/mcp"`.

Definiciones de la API de extensiones (`out\vscode-dts\vscode.d.ts:20420-20510`): sólo
`McpStdioServerDefinition` (`label`,`cwd`,`command`,`args`,`env`,`version`) y
`McpHttpServerDefinition` ("representa un servidor MCP disponible usando el transporte **Streamable HTTP**";
`label`,`uri`,`headers`,`version`) — **sin tipo SSE** en la API.

Archivos existentes: `%APPDATA%\Code\User\settings.json` contiene `"chat.mcp.gallery.enabled": true`
(confirma que el soporte MCP está activo). No hay `mcp.json` ni `~/.copilot/mcp-config.json`.

### (c) Confianza

- Ruta `%APPDATA%\Code\User\mcp.json`: **CONFIRMADO** por código (`mcpResource`) + por el hecho de que el
  mismo generador produce `settings.json`, que existe.
- Claves `servers`/`inputs`/`sandbox`: **CONFIRMADO** por código.
- Campos `type`/`command`/`args`/`env`/`envFile`/`cwd`/`url`/`headers`/`oauth.clientId`/`dev`: **CONFIRMADO** por código.
- `"type": "sse"` **en el archivo de usuario**: **HIPÓTESIS** (el parser hermano `RU` sí lo acepta y lo
  convierte a `{type:"http",transport:"sse"}`, pero `sanitizeServer` del archivo de usuario sólo contempla
  `http`/`stdio`; la API pública sólo expone Streamable HTTP). Forma segura y evidenciada: `"type":"http"` + `"transport":"sse"`.

### (d) Evidencia leída

- `...\Microsoft VS Code\07f806f999\resources\app\package.json`, `product.json`, `version`
- `...\resources\app\out\vs\workbench\workbench.desktop.main.js` (offsets 2 191 700; 4 219 429; 4 888 100–4 888 900; 4 895 936)
- `...\resources\app\out\vscode-dts\vscode.d.ts` (20419–20510)
- `...\resources\app\extensions\configuration-editing\package.json`, `...\extensions\copilot\package.json`
- `C:\Users\QsManu-Movil\AppData\Roaming\Code\User\settings.json`

---

## 4) ANTIGRAVITY IDE

Versiones: `resources\app\package.json` → `"name":"Antigravity IDE"`, `"version":"1.107.0"` (base VS Code fork),
`product.json` → `"applicationName":"antigravity-ide"`, `"ideVersion":"2.5.5"`, `"nameShort":"Antigravity IDE"`.

### (a) Ruta EXACTA (confirmada con archivo real en disco)

```
C:\Users\QsManu-Movil\.gemini\config\mcp_config.json
```

### (b) Esquema EXACTO — docstring embebida en el language server del IDE

`...\resources\app\extensions\antigravity\bin\language_server_windows_x64.exe` (135 MB), cadena literal:

```
## Configuration File (`mcp_config.json`)

MCP servers are defined in a `mcp_config.json` file. The file contains a map of
server identifiers to their respective configurations.

### Location

*   **Global Configuration**: `~/.gemini/config/mcp_config.json` (applies to all sessions).
*   **Plugin Configuration**: `plugins/<plugin_name>/mcp_config.json` (active when the plugin is enabled).

## Configuration Schema

Antigravity supports two transport mechanisms for MCP: **Stdio** (for local
command-line tools) and **SSE** (for remote services).

{ "mcpServers": { "sqlite-helper": { "command": "sqlite-mcp-server", "args": ["/path/to/database.db"],
  "env": { "DB_READONLY": "true" } },
  "remote-service": { "serverUrl": "https://mcp.mycompany.com/sse" } } }

### 1. Stdio Transport (Local)
*   **`command`** (string, required)
*   **`args`** (array of strings, optional)
*   **`env`** (object, optional)

### 2. SSE Transport (Remote)
*   **`serverUrl`** (string, required): The HTTP(S) URL of the remote MCP endpoint.
```

Mensaje de error adicional del binario: `mcpServers field is not a JSON object, got %T`.

JSON mínimo válido (basado en el archivo real + la doc anterior):
```jsonc
{
  "mcpServers": {
    "context-mcp": {
      "command": "C:\\Windows\\System32\\cmd.exe",
      "args": ["/d", "/c", "C:\\Users\\QsManu-Movil\\AppData\\Roaming\\npm\\context-mcp-server.cmd"]
    },
    "remote-service": { "serverUrl": "https://mcp.mycompany.com/sse" }
  }
}
```

Contenido real de `C:\Users\QsManu-Movil\.gemini\config\mcp_config.json` (588 B; hay 3 backups):
```json
{
    "mcpServers":  {
                       "context-mcp":  {
                                           "command":  "C:\\Windows\\System32\\cmd.exe",
                                           "args":  [ "/d", "/c", "C:\\Users\\QsManu-Movil\\AppData\\Roaming\\npm\\context-mcp-server.cmd" ]
                                       }
                   }
}
```

Config de plugin: el workbench calcula `kqt(home) = joinPath(home, ".gemini", <applicationName>, "plugins")`
(`function EXe(){ return [".gemini", gd.ideName] }`, `gd.ideName = Mo.applicationName` = `antigravity-ide`) y
`$writeMcpConfig(e,i,n)` escribe en `...\.gemini\antigravity-ide\plugins\<e>.<i>\mcp_config.json`.
Por eso existe `C:\Users\QsManu-Movil\.gemini\antigravity-ide\` (sin `plugins\` aún) y también
`C:\Users\QsManu-Movil\.gemini\antigravity\...` (perfil de la versión previa).

### Candidatos verificados y descartados

| Candidato | Resultado |
|---|---|
| `%APPDATA%\Antigravity IDE\User\mcp.json` | **NO existe**. El fork VS Code sí tiene el recurso en código (`mcpResource: s.mcpResource : Xn(i,"mcp.json")`), pero el agente de Antigravity no lo usa. |
| `%APPDATA%\Antigravity IDE\User\settings.json` | existe (103 B) y **no** contiene nada de MCP |
| `%USERPROFILE%\.antigravity-ide\` | sólo `argv.json` + `extensions\` (NO MCP) |
| `%USERPROFILE%\.gemini\antigravity-ide\` | datos del agente; subcarpeta `mcp\<server>\*.json` = **caché de tools** descubiertas (p.ej. `tool_registry.json`, `search.json`), no configuración |
| `%USERPROFILE%\.gemini\config\mcp_config.json` | **ES LA CONFIG** ✔ |
| `.gemini\config\projects\*.json` | settings por proyecto, sin claves MCP |

Otros literales vistos en el bundle (contexto distinto, NO el archivo de config):
`Kdu = new Set(["local_servers","remote_servers","mcpServers"])` con entradas `{id|server_id|name, serverName, serverUrl, command, args}` = manifiesto de *plugins/agent-plugins* de Antigravity, no `mcp_config.json`.

### (c) Confianza

- Ruta `~/.gemini/config/mcp_config.json` y clave `mcpServers`: **CONFIRMADO** (docstring del LS + archivo real + backups).
- Campos stdio `command`/`args`/`env`: **CONFIRMADO**.
- Remoto = **SSE** con campo **`serverUrl`** (requerido): **CONFIRMADO** por la docstring del LS.
  No hay evidencia de `url`, `headers`, `type` ni `transport` en este archivo ⇒ **no los uses**.
- No hay evidencia de ningún campo `disabled`/`enabled` a nivel de servidor.

### (d) Evidencia leída

- `C:\Users\QsManu-Movil\.gemini\config\mcp_config.json` (+ 3 `.backup-*`)
- `...\Antigravity IDE\resources\app\extensions\antigravity\bin\language_server_windows_x64.exe` (offset 44 580 693; 44 381 097)
- `...\Antigravity IDE\resources\app\out\vs\workbench\workbench.desktop.main.js` (offsets 5 592 163; 17 136 879; 19 146 500; 6 049 300; 13 764 554; 14 566 351)
- `...\Antigravity IDE\resources\app\product.json`, `resources\app\package.json`, `extensions\antigravity\bin\agentapi.bat`
- `C:\Users\QsManu-Movil\.gemini\antigravity-ide\mcp\context-mcp\*.json` (cachés)

---

## 5) CLI `claude` (Claude Code)

**NO está instalado.**

- `Get-Command claude` → sin resultado (exit 1).
- `cmd /c where claude` → sin resultado.
- `%APPDATA%\npm\claude*` → sin resultado; `%USERPROFILE%\.local\bin` sólo tiene `uv.exe`, `uvw.exe`, `uvx.exe`.
- Búsqueda recursiva de `claude*` en `%LOCALAPPDATA%\Programs`, `%APPDATA%\npm`, `%ProgramFiles`, `~\.bun\bin`,
  `%LOCALAPPDATA%\pnpm` → único resultado: `...\npm\node_modules\context-mcp-server\.claude-plugin` (no es el CLI).
- `claude --version` y `claude mcp list`: **no ejecutables** (no hay binario). No se intentaron.
- Sí existen **restos de configuración** de un uso previo: `C:\Users\QsManu-Movil\.claude.json`,
  `C:\Users\QsManu-Movil\.claude\settings.json` (hooks PreToolUse/PostToolUse de context-mcp),
  `.claude\skills`, `.claude\commands`, `.claude\backups\.claude.json.backup.1790093110019`.

Confianza: **CONFIRMADO** (ausencia).

---

## Resumen de una línea por app

| App | Archivo | Clave raíz | Deshabilitar |
|---|---|---|---|
| Kimchi Studio | `%USERPROFILE%\.config\kimchi\harness\mcp.json` (+ `<cwd>\.mcp.json`, `<cwd>\.kimchi\mcp.json`) | `mcpServers` | `"disabled": true` por entry |
| DeepSeek Harness | `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` | `- insert:` → `id`/`name`/`config` | `- id: <entryId>` + `disabled: true` (no hay campo en el plugin) |
| VS Code 1.140.0 | `%APPDATA%\Code\User\mcp.json` (no existe aún) | `servers` (+`inputs`,`sandbox`) | (no confirmado) |
| Antigravity IDE 2.5.5 | `%USERPROFILE%\.gemini\config\mcp_config.json` | `mcpServers` | (no existe) |
| Claude Code | — no instalado — | — | — |
