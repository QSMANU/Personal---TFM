# Trabajo Fin de Máster (TFM)

**Autores:** Manuel Di Nucci & Pablo Siegrist  
**Modalidad:** Trabajo Fin de Máster Grupal  
**Repositorio:** [https://github.com/QSMANU/Personal---TFM](https://github.com/QSMANU/Personal---TFM)

---

## 🧠 Sistema de Memoria Compartida para IAs (MCP + Git)

Este proyecto está integrado con **`context-mcp-server`**, un sistema de memoria persistente y factual para asistentes de Inteligencia Artificial (**Antigravity**, **Claude Desktop** y **ChatGPT**).

Toda la memoria (decisiones técnicas, directivas del TFM, estado del proyecto y resúmenes de sesión) se guarda en la carpeta [`.context/`](./.context) dentro de este repositorio. Esto permite que **ambos autores compartan el mismo contexto y avances de IA en tiempo real** utilizando Git (`push` / `pull`).

---

## 🚀 Guía de Instalación Rápida

### 1. Requisitos Previos
* [Git](https://git-scm.com/) instalado en Windows.
* [Node.js](https://nodejs.org/) (versión 18 o superior) instalado.

### 2. Clonar el Repositorio
```bash
git clone https://github.com/QSMANU/Personal---TFM.git
cd Personal---TFM
```

### 3. Configurar en 1 Clic
Haz **doble clic en el archivo [`setup-sync.bat`](./setup-sync.bat)** (o ejecuta `.\setup-sync.bat` en la terminal).

El script automatizado se encargará de:
1. Enlazar la carpeta `.context/` de Git con la base de datos local de `context-mcp`.
2. Registrar el proyecto `Personal - TFM` en tu equipo.
3. Configurar automáticamente **Claude Desktop**, **Antigravity** y **ChatGPT/Codex** con el servidor MCP cuando detecte cada cliente.
4. Crear copias de respaldo de las configuraciones existentes antes de modificarlas.

Después de ejecutarlo, reinicia los clientes que estuvieran abiertos y comprueba que pueden llamar a `context.resume` para el proyecto `Personal - TFM`.

---

## 🛠️ Configuración de los Asistentes de IA

Cada asistente cuenta con su propio archivo de directivas:

| Asistente | Archivo de Reglas | ¿Cómo se carga? |
|---|---|---|
| **Claude Code** | [`CLAUDE.md`](./CLAUDE.md) | Lectura desde la raíz del proyecto. |
| **Claude Desktop** | [`CLAUDE.md`](./CLAUDE.md) | Copiar las reglas en las instrucciones del Proyecto y habilitar el MCP. |
| **Antigravity** | [`ANTIGRAVITY.md`](./ANTIGRAVITY.md) / [`AGENTS.md`](./AGENTS.md) | Carga automática nativa por jerarquía de reglas. |
| **ChatGPT/Codex sobre esta carpeta** | [`AGENTS.md`](./AGENTS.md) / [`CHATGPT.md`](./CHATGPT.md) | Codex carga `AGENTS.md`; `CHATGPT.md` documenta la configuración. |
| **Proyecto de ChatGPT web/escritorio** | [`CHATGPT.md`](./CHATGPT.md) | Copiar las reglas en las Instrucciones del Proyecto y añadir los documentos necesarios. |

### Instrucción Maestra para ChatGPT y Claude (Project Instructions)
Si creas un Proyecto llamado **Personal - TFM** en la web o app de ChatGPT / Claude, pega este bloque en **Instrucciones del Proyecto**:

```markdown
Reglas de memoria compartida para el proyecto "Personal - TFM":
1. Al inicio de cada conversación, llama obligatoriamente a la herramienta MCP context con:
   - action: "resume"
   - project: "Personal - TFM"
   - rootPath: "<Ruta absoluta a la carpeta del TFM en tu disco>"
2. Al completar cualquier hito, decisión o tarea, llama a la herramienta MCP context con:
   - action: "save"
   - project: "Personal - TFM"
   - type: "note"
   - title: "<título breve>"
   - why: "<por qué importa>"
   - outcome: "<resultado alcanzado>"
   - content: "<detalles>"
3. Esto incluye revisiones y redacciones académicas, bibliografía, imágenes, metodología, experimentos y feedback. Guarda suficiente contenido para reconstruir el resultado.
4. Para buscar decisiones previas antes de consultar al usuario, utiliza la herramienta MCP search.
5. Mantén todas las notas y planes estrictamente aislados bajo project: "Personal - TFM".
6. Trata los PDF y demás archivos como fuentes de verdad. Guarda en el MCP su ruta, resumen, procedencia, versión y páginas relevantes.
7. Para imágenes y figuras, registra fuente, autor, licencia, fecha de acceso, pie sugerido y sección de destino.
8. Consulta PROJECT_STATE.md para conocer el alcance vigente y docs/INDEX.md para localizar los documentos disponibles. Actualízalos únicamente después de cambios verificados.
```

---

## 📚 Documentos, Fuentes e Imágenes

`context-mcp` no sustituye el almacenamiento de archivos ni conserva automáticamente el texto completo de una conversación. El sistema utiliza dos capas:

1. **Repositorio**: contiene los PDF, documentos, borradores, datos, figuras y demás artefactos permitidos.
2. **Memoria MCP**: contiene resúmenes, decisiones, procedencia, citas relevantes, páginas consultadas y rutas a esos archivos.

No es necesario leer todos los PDF al iniciar una conversación. El asistente debe recuperar la memoria con `context.resume`, buscar antecedentes con `search` y abrir únicamente los documentos o páginas que necesite para la tarea.

[`PROJECT_STATE.md`](./PROJECT_STATE.md) contiene el estado vigente en formato legible por personas. [`docs/INDEX.md`](./docs/INDEX.md) funciona como catálogo de fuentes. El MCP conserva el historial, los hallazgos y las decisiones; estos dos archivos permiten comprobar rápidamente qué está vigente sin depender de una búsqueda semántica.

Estructura recomendada cuando se incorporen los documentos:

```text
├── docs/
│   ├── normativa/          # Reglamento, guía, plantilla y rúbrica
│   ├── tfm/                # Borradores y entregas de la memoria
│   ├── fuentes/            # Artículos y documentos que puedan almacenarse legalmente
│   └── reuniones/          # Actas y feedback del director
├── assets/
│   └── figures/            # Figuras propias o reutilizables con su procedencia
└── notes/
    └── reviews/            # Revisiones extensas que deban conservarse íntegramente
```

No deben subirse materiales con restricciones de licencia, datos personales innecesarios ni información confidencial sin autorización. En esos casos se guarda una referencia bibliográfica y un resumen permitido, no el archivo completo.

---

## 🔄 Flujo de Trabajo Diario

### Cuando trabajes con la IA:
1. Ejecuta `git pull` antes de empezar, con el árbol de trabajo limpio.
2. Habla con tu asistente habitual (Antigravity, Claude o ChatGPT). La IA recuperará la memoria con `context.resume` y guardará notas con `context.save`.
3. Los cambios se guardarán automáticamente en los archivos de la carpeta `.context/`.

### Al terminar tu sesión de trabajo:
Sube tus avances de código y de memoria de IA a GitHub:
```bash
git add .
git commit -m "docs: avances del TFM y actualización de memoria IA"
git pull --rebase
git push
```

No trabajéis simultáneamente durante mucho tiempo sin sincronizar: `.context/context.json` es compartido y puede generar conflictos si ambos autores añaden memoria sobre versiones antiguas. Haced commits pequeños y frecuentes. Ante un conflicto, no descartéis ninguna entrada sin revisar sus identificadores y fechas.

### Cuando tu compañero empiece a trabajar:
Descarga las últimas notas y código:
```bash
git pull
```
Al abrir su asistente, su IA sabrá inmediatamente todas las decisiones y avances que realizaste.

---

## 📁 Estructura del Repositorio

```text
├── .context/               # Base de datos compartida de la memoria de la IA
│   ├── context.json        # Notas, decisiones e hitos del TFM
│   └── summary.json        # Resúmenes acumulados y compacciones
├── assets/figures/         # Figuras e imágenes con procedencia y licencia
├── docs/
│   ├── INDEX.md            # Catálogo documental y estado de cada fuente
│   ├── normativa/          # Normativa oficial sin modificar
│   ├── tfm/                # Propuesta, memoria y entregas
│   ├── fuentes/            # Fuentes que puedan almacenarse legalmente
│   └── reuniones/          # Actas y feedback del director
├── notes/reviews/          # Revisiones académicas extensas
├── PROJECT_STATE.md        # Alcance, foco, decisiones y pendientes vigentes
├── AGENTS.md               # Directivas globales para agentes autónomos
├── ANTIGRAVITY.md          # Guía operativa para Antigravity IDE
├── CLAUDE.md               # Directivas automáticas para Claude Desktop / Code
├── CHATGPT.md              # Guía de configuración para ChatGPT
├── setup-sync.bat          # Lanzador de instalación en 1 clic para Windows
├── setup-sync.ps1          # Script PowerShell de enlace y configuración MCP
└── README.md               # Este documento
```
