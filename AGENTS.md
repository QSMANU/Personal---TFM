# Operational Memory Guide for "Personal - TFM"

This project uses **`context-mcp-server`** to maintain factual, persistent, and shared memory between **Antigravity**, **Claude Desktop**, and **ChatGPT**.

---

## 1. Start of Every Session (MANDATORY)
At the very beginning of every turn/session in this project, you MUST invoke the `context` MCP tool:
- `action`: `"resume"`
- `project`: `"Personal - TFM"`
- `rootPath`: `"c:/Users/QsManu-Movil/Documents/ChatGPT/Personal - TFM"`

---

## 2. Save Triggers (MANDATORY)
Call `context` with `action: "save"` after completing any task, making key decisions, or noting discoveries:
- `project`: `"Personal - TFM"`
- `type`: `"note"` (or `"compaction"` for full session summaries)
- `title`: Short descriptive title (up to 120 chars)
- `why`: Rationale
- `outcome`: State or results achieved
- `content`: Full description
- `files`: Affected files

---

## 3. Plans
For multi-step or multi-file work:
- Save plan: `plan` with `action: "save"`, `project: "Personal - TFM"`
- Complete plan: `plan` with `action: "update"`, `status: "done"`

---

## 4. Isolation
ALWAYS enforce `project: "Personal - TFM"` and sandbox under `c:/Users/QsManu-Movil/Documents/ChatGPT/Personal - TFM`.
