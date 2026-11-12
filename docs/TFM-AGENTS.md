# Operational Memory Guide for "Personal - TFM"

This project uses **`context-mcp-server`** to maintain factual, persistent, and shared memory between **Antigravity**, **Claude Desktop**, and **ChatGPT**.

---

## 1. Start of Every Session (MANDATORY)
At the very beginning of every turn/session in this project, you MUST invoke the `context` MCP tool:
- `action`: `"resume"`
- `project`: `"Personal - TFM"`
- `rootPath`: the absolute path of the current local repository root. On Manuel's current computer it is `c:/Users/QsManu-Movil/Documents/ChatGPT/Personal - TFM`; on another computer, derive and use that clone's actual path.

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

This includes academic work, not only code or configuration. A save is mandatory after:
- reviewing, drafting, or rewriting a TFM section;
- recommending or selecting sources, figures, tables, datasets, or images;
- defining objectives, methodology, experiments, metrics, scope, or limitations;
- interpreting feedback from the director;
- producing a reusable answer that another client must be able to continue.

The saved `content` must contain enough substance to reconstruct the result. Do not save only a status such as "review completed". Include the main findings, proposed changes, unresolved questions, sources or figure candidates, and the path of every consulted or generated file.

---

## 3. Plans
For multi-step or multi-file work:
- Save plan: `plan` with `action: "save"`, `project: "Personal - TFM"`
- Complete plan: `plan` with `action: "update"`, `status: "done"`

---

## 4. Isolation
ALWAYS enforce `project: "Personal - TFM"` and sandbox under the current local repository root. Never reuse another contributor's absolute Windows path.

## 5. Project Documents and PDFs
- Files in the repository are the source of truth for full documents. `context-mcp` is the index and factual memory, not a binary document store.
- When a task depends on the current scope, delivery, or pending decisions, consult `PROJECT_STATE.md`. Update it only after a verified change in project state.
- For document or source work, consult `docs/INDEX.md` first and keep the catalog synchronized with added, replaced, or deprecated files.
- Before work that depends on prior documents, call `search` and then read only the relevant files or pages. Do not reread every PDF on every turn.
- When a PDF, Word document, presentation, dataset, figure, or other source is added, save a `context` note with `source: "file"`, its path, purpose, provenance, version/date, and a concise summary of the relevant content.
- For academic sources, preserve bibliographic data, DOI or stable URL when available, relevant page numbers, and the claims the source can support.
- For images and figures, record the original source, author/organization, license or reuse conditions, access date, caption proposal, and the section where it may be used. Do not treat an image-search result as permission to reproduce it.
- Never invent a citation, page number, source, result, or document content. If a referenced file is unavailable, state that limitation.
- Do not copy confidential, personal, copyrighted, or licensed material into memory unnecessarily. Store a factual summary and a permitted local path instead.
