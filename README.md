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
3. Configurar automáticamente **Claude Desktop** y **ChatGPT/Codex** con el servidor MCP correspondiente.

---

## 🛠️ Configuración de los Asistentes de IA

Cada asistente cuenta con su propio archivo de directivas:

| Asistente | Archivo de Reglas | ¿Cómo se carga? |
|---|---|---|
| **Claude Desktop** | [`CLAUDE.md`](./CLAUDE.md) | Lectura automática en la raíz del proyecto. |
| **Antigravity** | [`ANTIGRAVITY.md`](./ANTIGRAVITY.md) / [`AGENTS.md`](./AGENTS.md) | Carga automática nativa por jerarquía de reglas. |
| **ChatGPT** | [`CHATGPT.md`](./CHATGPT.md) | Instrucciones del Proyecto en la app de ChatGPT. |

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
3. Para buscar decisiones previas antes de consultar al usuario, utiliza la herramienta MCP search.
4. Mantén todas las notas y planes estrictamente aislados bajo project: "Personal - TFM".
```

---

## 🔄 Flujo de Trabajo Diario

### Cuando trabajes con la IA:
1. Habla con tu asistente habitual (Antigravity, Claude o ChatGPT). La IA recuperará la memoria con `context.resume` y guardará notas con `context.save`.
2. Los cambios se guardarán automáticamente en los archivos de la carpeta `.context/`.

### Al terminar tu sesión de trabajo:
Sube tus avances de código y de memoria de IA a GitHub:
```bash
git add .
git commit -m "docs: avances del TFM y actualización de memoria IA"
git push
```

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
├── AGENTS.md               # Directivas globales para agentes autónomos
├── ANTIGRAVITY.md          # Guía operativa para Antigravity IDE
├── CLAUDE.md               # Directivas automáticas para Claude Desktop / Code
├── CHATGPT.md              # Guía de configuración para ChatGPT
├── setup-sync.bat          # Lanzador de instalación en 1 clic para Windows
├── setup-sync.ps1          # Script PowerShell de enlace y configuración MCP
└── README.md               # Este documento
```
