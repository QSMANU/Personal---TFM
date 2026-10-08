/**
 * store.js — almacén local del contexto compartido.
 *
 * Todo vive en disco, en texto plano y por proyecto:
 *
 *   <home>/
 *     config.json                 modo de consentimiento y ajustes
 *     audit.log                   JSONL: quién pidió qué y cuándo
 *     projects/<slug>/
 *       project.json              identidad del proyecto (nombre, raíces conocidas)
 *       handoff.md                nota de traspaso ("dónde quedé")
 *       entries/<id>.md           contexto publicado
 *     pending/<id>.json           publicaciones esperando aprobación humana
 *
 * Reglas de consentimiento (el único lugar del sistema donde se decide):
 *   off       -> no se lee ni se escribe nada compartido
 *   readonly  -> se lee; publicar/olvidar se rechaza
 *   ask       -> se lee; publicar/olvidar queda PENDIENTE de aprobación humana
 *   on        -> se lee; publicar/olvidar se aplica (queda auditado)
 *
 * Cambiar de modo no es una herramienta MCP: el modelo no puede darse permiso
 * a sí mismo. Solo se cambia por CLI (`sharedctx mode`).
 */

import {
  existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync,
  readdirSync, rmSync, statSync, renameSync,
} from 'node:fs';
import { join, resolve, basename, dirname, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export const MODES = ['off', 'readonly', 'ask', 'on'];
export const ENTRY_TYPES = ['handoff', 'note', 'decision', 'task', 'bug', 'question', 'snippet', 'reference'];
export const ACTIVITY_DAYS = 30;

const DEFAULTS = {
  mode: 'ask',            // publicar requiere aprobación humana
  host: '127.0.0.1',
  port: 3111,             // transporte MCP por HTTP
  dashboardPort: 3120,    // panel web (`sharedctx ui`)
  allowCrossProjectRead: false, // leer otro proyecto exige confirmación explícita
  defaultProject: null,
};

/* ------------------------------------------------------------------ paths */

export function getHome() {
  return resolve(process.env.SHARED_MCP_HOME || join(homedir(), '.shared-mcp'));
}

export function getConfigPath() { return join(getHome(), 'config.json'); }
export function getAuditPath() { return join(getHome(), 'audit.log'); }
export function projectsRoot() { return join(getHome(), 'projects'); }
export function pendingRoot() { return join(getHome(), 'pending'); }
export function projectDir(slug) { return join(projectsRoot(), slug); }
export function entriesDir(slug) { return join(projectDir(slug), 'entries'); }
export function handoffPath(slug) { return join(projectDir(slug), 'handoff.md'); }

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/* ----------------------------------------------------------------- config */

export function getConfig() {
  const path = getConfigPath();
  let cfg = { ...DEFAULTS };
  if (existsSync(path)) {
    try {
      cfg = { ...cfg, ...JSON.parse(readFileSync(path, 'utf8')) };
    } catch (err) {
      log(`config ilegible (${err.message}); uso valores por defecto`);
    }
  }
  if (!MODES.includes(cfg.mode)) cfg.mode = DEFAULTS.mode;
  return cfg;
}

export function saveConfig(patch) {
  const cfg = { ...getConfig(), ...patch };
  if (!MODES.includes(cfg.mode)) {
    throw new Error(`modo inválido: ${patch.mode}. Válidos: ${MODES.join(', ')}`);
  }
  ensureDir(getHome());
  writeFileSync(getConfigPath(), `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
  return cfg;
}

/* ------------------------------------------------------------------- logs */

export function log(message) {
  process.stderr.write(`[sharedctx] ${message}\n`);
}

export function audit(action, data = {}) {
  try {
    ensureDir(getHome());
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      action,
      mode: getConfig().mode,
      app: process.env.SHARED_MCP_APP || 'cli',
      pid: process.pid,
      cwd: process.cwd(),
      ...data,
    });
    appendFileSync(getAuditPath(), `${line}\n`, 'utf8');
  } catch {
    /* la auditoría nunca debe romper la operación */
  }
}

export function readAudit(limit = 50) {
  const path = getAuditPath();
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });
}

/* ---------------------------------------------------------------- proyecto */

export function slugify(name) {
  const s = String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'global';
}

/**
 * Directorios que NUNCA son un proyecto: si el servidor se lanza con uno de
 * estos como cwd (típico de apps de escritorio), la detección automática no es
 * confiable y hay que pedir el proyecto explícitamente.
 */
export const NON_PROJECT_DIRS = new Set([
  'windows', 'system32', 'syswow64', 'program-files', 'program-files-x86', 'users',
  'appdata', 'roaming', 'local', 'locallow', 'temp', 'tmp', 'desktop', 'documents',
  'downloads', 'claude', 'cursor', 'antigravity', 'antigravity-ide', 'kimchi-studio',
  'deepseek-harness', 'code', 'node_modules', 'resources', 'app', 'bin', 'public',
  'src', 'dist', 'build', 'out', 'test', 'tests', 'global',
]);

/**
 * Detecta el proyecto activo, en este orden:
 *   1. SHARED_MCP_PROJECT (variable de entorno)
 *   2. .sharedctx.json en el directorio actual o algún ancestro  { "project": "..." }
 *   3. raíz de git (primer ancestro con .git)
 *   4. nombre del directorio actual
 *
 * Devuelve `reliable: false` cuando el único candidato es un directorio de
 * sistema: en ese caso las herramientas piden el proyecto de forma explícita en
 * lugar de inventar uno.
 */
export function detectProject(startDir = process.cwd()) {
  const envProject = process.env.SHARED_MCP_PROJECT;
  if (envProject) return { slug: slugify(envProject), name: envProject, root: startDir, source: 'env', reliable: true };

  let dir = resolve(startDir);
  const seen = [];
  while (true) {
    seen.push(dir);
    const marker = join(dir, '.sharedctx.json');
    if (existsSync(marker)) {
      try {
        const cfg = JSON.parse(readFileSync(marker, 'utf8'));
        if (cfg.project) return { slug: slugify(cfg.project), name: cfg.project, root: dir, source: 'marker', reliable: true };
      } catch { /* marcador inválido: sigo subiendo */ }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const d of seen) {
    if (existsSync(join(d, '.git'))) {
      const name = basename(d);
      const slug = slugify(name);
      return { slug, name, root: d, source: 'git', reliable: !NON_PROJECT_DIRS.has(slug) };
    }
  }

  const cwdName = basename(resolve(startDir));
  if (cwdName) {
    const slug = slugify(cwdName);
    return { slug, name: cwdName, root: resolve(startDir), source: 'cwd', reliable: !NON_PROJECT_DIRS.has(slug) };
  }
  return { slug: 'global', name: 'global', root: resolve(startDir), source: 'fallback', reliable: false };
}

/**
 * Crea (o localiza) el proyecto. Si se pasa `root` y ya existe un proyecto con
 * esa misma raíz, redirige a él: así "Personal - Shared-MCP-Local" (título del
 * workspace de DSH) y "shared-mcp-local" (nombre de la carpeta) son UN proyecto.
 */
export function ensureProject(name, { root = null, aliases = [] } = {}) {
  if (root) {
    const mismo = listProjects().find((p) => (p.roots || []).some((r) => normalizePath(r) === normalizePath(root)));
    if (mismo) name = mismo.name;
  }
  const slug = slugify(name);
  const dir = ensureDir(projectDir(slug));
  ensureDir(entriesDir(slug));
  const metaPath = join(dir, 'project.json');
  let meta = { slug, name: String(name || slug), createdAt: new Date().toISOString(), roots: [], aliases: [] };
  if (existsSync(metaPath)) {
    try { meta = { ...meta, ...JSON.parse(readFileSync(metaPath, 'utf8')) }; } catch { /* reescribo */ }
  }
  meta.slug = slug;
  if (root && !meta.roots.includes(root)) meta.roots.push(root);
  for (const a of aliases) if (a && !meta.aliases.includes(a)) meta.aliases.push(a);
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return meta;
}

export function getProject(slug) {
  const dir = projectDir(slug);
  if (!existsSync(dir)) return null;
  const metaPath = join(dir, 'project.json');
  try { return JSON.parse(readFileSync(metaPath, 'utf8')); } catch { return { slug, name: slug }; }
}

export function listProjects() {
  const root = projectsRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((n) => statSync(join(root, n)).isDirectory())
    .map((slug) => {
      const raw = getProject(slug) || { slug, name: slug };
      const meta = { aliases: [], roots: [], ...raw, slug };
      return { ...meta, entries: listEntries(slug).length, handoff: existsSync(handoffPath(slug)) };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/* --------------------------------------------------- identidad de proyectos */

/** Clave de comparación: sin acentos, sin signos, sin mayúsculas ni espacios. */
export function normalizeName(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizePath(value) {
  return String(value || '').replace(/[\\/]+$/, '').toLowerCase();
}

function isInside(child, parent) {
  const c = normalizePath(child);
  const p = normalizePath(parent);
  return c === p || c.startsWith(`${p}\\`) || c.startsWith(`${p}/`);
}

/** Similitud tipo Dice sobre bigramas (0..1). Sirve para "¿es el mismo proyecto escrito distinto?". */
export function similarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bigrams = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i += 1) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) || 0) + 1);
    }
    return out;
  };
  const A = bigrams(x);
  const B = bigrams(y);
  let hits = 0;
  for (const [g, n] of A) if (B.has(g)) hits += Math.min(n, B.get(g));
  return (2 * hits) / (x.length - 1 + y.length - 1);
}

/**
 * Busca a qué proyecto conocido corresponde un nombre o una ruta.
 * Orden: slug exacto → nombre/alias normalizado → ruta conocida → parecido.
 */
export function findProjectMatch(nameOrPath, { fuzzyThreshold = 0.86 } = {}) {
  if (!nameOrPath) return null;
  const raw = String(nameOrPath).trim();
  if (!raw) return null;
  const projects = listProjects();
  if (projects.length === 0) return null;

  const exact = projects.find((p) => p.slug === slugify(raw));
  if (exact) return { slug: exact.slug, name: exact.name, project: exact, matchedBy: 'slug', similarity: 1 };

  const norm = normalizeName(raw);
  for (const p of projects) {
    const candidates = [p.name, p.slug, ...(p.aliases || [])];
    const hit = candidates.find((c) => normalizeName(c) === norm);
    if (hit) return { slug: p.slug, name: p.name, project: p, matchedBy: hit === p.name ? 'nombre' : 'alias', similarity: 1 };
  }

  if (/[\\/]/.test(raw) || /^[a-zA-Z]:/.test(raw)) {
    const inside = projects
      .filter((p) => (p.roots || []).some((r) => isInside(raw, r)))
      .sort((a, b) => normalizePath(b.roots[0] || '').length - normalizePath(a.roots[0] || '').length);
    if (inside.length) return { slug: inside[0].slug, name: inside[0].name, project: inside[0], matchedBy: 'ruta', similarity: 1 };
  }

  let best = null;
  for (const p of projects) {
    for (const c of [p.name, ...(p.aliases || [])]) {
      const score = similarity(raw, c);
      if (!best || score > best.similarity) best = { slug: p.slug, name: p.name, project: p, matchedBy: 'similar', similarity: score, candidate: c };
    }
  }
  if (best && best.similarity >= fuzzyThreshold) return best;
  return null;
}

/** Sugerencias ordenadas por parecido, para mensajes de error útiles. */
export function suggestProjects(nameOrPath, limit = 3) {
  return listProjects()
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      score: Math.max(similarity(nameOrPath, p.name), similarity(nameOrPath, p.slug), ...(p.aliases || []).map((a) => similarity(nameOrPath, a))),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Registra nombre alternativo y raíz en el proyecto, para que la próxima vez se detecte solo. */
export function rememberProjectIdentity(slug, { aliases = [], roots = [] } = {}) {
  const meta = getProject(slug);
  if (!meta) return null;
  meta.aliases = meta.aliases || [];
  meta.roots = meta.roots || [];
  let dirty = false;
  for (const a of aliases) {
    if (!a) continue;
    const norm = normalizeName(a);
    if (!norm || normalizeName(meta.name) === norm || meta.aliases.some((x) => normalizeName(x) === norm)) continue;
    meta.aliases.push(a);
    dirty = true;
  }
  for (const r of roots) {
    if (!r) continue;
    if (meta.roots.some((x) => normalizePath(x) === normalizePath(r))) continue;
    meta.roots.push(r);
    dirty = true;
  }
  if (dirty) writeFileSync(join(projectDir(slug), 'project.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return meta;
}

/* --------------------------------------------- proyecto activo y por app */

export function getStatePath() { return join(getHome(), 'state.json'); }
export function getActivePath() { return join(getHome(), 'active.json'); }

/** Memoria por herramienta: último proyecto usado en cada app. */
export function getState() {
  try { return JSON.parse(readFileSync(getStatePath(), 'utf8')); } catch { return { lastByApp: {} }; }
}

export function setLastProjectForApp(app, slug) {
  if (!app) return;
  const state = getState();
  state.lastByApp = state.lastByApp || {};
  state.lastByApp[app] = { slug, at: new Date().toISOString() };
  ensureDir(getHome());
  writeFileSync(getStatePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function getLastProjectForApp(app) {
  if (!app) return null;
  const state = getState();
  return state.lastByApp?.[app]?.slug || null;
}

/** Proyecto activo global, elegido por el usuario con `sharedctx use`. */
export function getActive() {
  try {
    const data = JSON.parse(readFileSync(getActivePath(), 'utf8'));
    return data?.slug ? data : null;
  } catch { return null; }
}

export function setActive(project, note = '') {
  const match = findProjectMatch(project);
  const slug = match ? match.slug : slugify(project);
  const name = match ? match.name : project;

  // Si el directorio actual "suena" al mismo proyecto, registramos la ruta y el
  // nombre de la carpeta como alias; así no se crea un proyecto duplicado después.
  const detected = detectProject();
  let root = null;
  let aliases = [];
  if (detected.reliable) {
    const nDetectado = normalizeName(detected.name);
    const nPedido = normalizeName(name);
    const compatible = nDetectado === nPedido || nPedido.includes(nDetectado) || nDetectado.includes(nPedido);
    if (compatible) {
      root = detected.root;
      aliases = [detected.name];
    }
  }

  const meta = ensureProject(name, { root, aliases });
  ensureDir(getHome());
  writeFileSync(getActivePath(), `${JSON.stringify({ slug: meta.slug, name: meta.name, note, at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  return { slug: meta.slug, name: meta.name, matchedBy: match?.matchedBy || 'nuevo', linked: Boolean(root), root };
}

export function clearActive() {
  const p = getActivePath();
  if (existsSync(p)) rmSync(p);
}

/* ------------------------------------------------- workspace de DSH */

/**
 * DeepSeek Harness guarda sus workspaces en ~/.dsh/storages/workspace.json con
 * el `title` que el usuario usa en TODAS las apps (ej. "Personal - Shared-MCP-Local")
 * y el `path` real. Es la señal que permite detectar el proyecto sin preguntar.
 */
export function readDshWorkspaces() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  const file = join(home, 'storages', 'workspace.json');
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const table = data?.tables?.workspaces || {};
    const items = Object.entries(table)
      .map(([id, w]) => ({ id, path: w.path || null, title: w.title || null, updatedAt: w.updatedAt || w.createdAt || null }))
      .filter((w) => w.path || w.title)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (items.length === 0) return null;
    const top = items[0];
    const second = items[1];
    const closeInTime = second && top.updatedAt && second.updatedAt
      && Math.abs(Date.parse(top.updatedAt) - Date.parse(second.updatedAt)) < 3 * 60 * 1000;
    return { items, mostRecent: top, ambiguous: Boolean(closeInTime) };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- sesiones */

export function sessionsDir() { return join(getHome(), 'sessions'); }

/**
 * Cada proceso MCP (una app conectada) deja su heartbeat acá. Sirve para que el
 * panel muestre "apps conectadas ahora" con datos reales, no inferidos.
 */
export function registerSession({ app = null, transport = 'stdio', cwd = process.cwd() } = {}) {
  pruneSessions();
  const id = `${app || 'desconocida'}-${process.pid}`;
  const file = join(ensureDir(sessionsDir()), `${id}.json`);
  const session = {
    id,
    app: app || 'desconocida',
    transport,
    pid: process.pid,
    cwd,
    startedAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };
  try { writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`, 'utf8'); } catch { /* best effort */ }
  return session;
}

export function touchSession(app = null) {
  const id = `${app || process.env.SHARED_MCP_APP || 'desconocida'}-${process.pid}`;
  const file = join(sessionsDir(), `${id}.json`);
  try {
    if (!existsSync(file)) return registerSession({ app });
    const session = JSON.parse(readFileSync(file, 'utf8'));
    session.lastSeen = new Date().toISOString();
    writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
    return session;
  } catch { return null; }
}

export function endSession(app = null) {
  const id = `${app || process.env.SHARED_MCP_APP || 'desconocida'}-${process.pid}`;
  try { rmSync(join(sessionsDir(), `${id}.json`), { force: true }); } catch { /* best effort */ }
}

/** Borra los archivos de sesión de procesos que ya no existen (se llama al registrar). */
export function pruneSessions() {
  const dir = sessionsDir();
  if (!existsSync(dir)) return 0;
  let borrados = 0;
  for (const n of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    try {
      const s = JSON.parse(readFileSync(join(dir, n), 'utf8'));
      let vivo = false;
      try { process.kill(s.pid, 0); vivo = true; } catch { vivo = false; }
      const viejo = Date.now() - Date.parse(s.lastSeen || s.startedAt || 0) > 24 * 3600 * 1000;
      if (!vivo || viejo) { rmSync(join(dir, n), { force: true }); borrados += 1; }
    } catch {
      try { rmSync(join(dir, n), { force: true }); borrados += 1; } catch { /* ignore */ }
    }
  }
  return borrados;
}

/** Sesiones conocidas, marcando cuáles siguen vivas (heartbeat reciente o proceso vivo). */
export function listSessions({ freshMs = 120000 } = {}) {
  const dir = sessionsDir();
  if (!existsSync(dir)) return [];
  const ahora = Date.now();
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => {
      try {
        const s = JSON.parse(readFileSync(join(dir, n), 'utf8'));
        const edad = ahora - Date.parse(s.lastSeen || s.startedAt || 0);
        let procesoVivo = false;
        try { process.kill(s.pid, 0); procesoVivo = true; } catch { procesoVivo = false; }
        return { ...s, ageMs: edad, alive: edad < freshMs || procesoVivo };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
}

/* ------------------------------------------------------------- métricas */

/** Actividad por día (para el gráfico de barras del panel). */
export function activityByDay(slug, days = 30) {
  const desde = Date.now() - days * 86400000;
  const buckets = new Map();
  for (const e of listEntries(slug)) {
    if (!e.createdAt) continue;
    const t = Date.parse(e.createdAt);
    if (Number.isNaN(t) || t < desde) continue;
    const dia = new Date(t).toISOString().slice(0, 10);
    buckets.set(dia, (buckets.get(dia) || 0) + 1);
  }
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dia = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ date: dia, count: buckets.get(dia) || 0 });
  }
  return out;
}

/** Tamaño total del almacén en bytes (para mostrar "cuánto ocupa"). */
export function storeSize() {
  const home = getHome();
  if (!existsSync(home)) return 0;
  let total = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else { try { total += statSync(full).size; } catch { /* ignore */ } }
    }
  };
  try { walk(home); } catch { /* ignore */ }
  return total;
}

/** Resumen por proyecto, con desglose por app y por tipo. */
export function projectSummary(slug) {
  const meta = getProject(slug) || { slug, name: slug, aliases: [], roots: [] };
  const entries = listEntries(slug);
  const porApp = {};
  const porTipo = {};
  for (const e of entries) {
    porApp[e.app] = (porApp[e.app] || 0) + 1;
    porTipo[e.type] = (porTipo[e.type] || 0) + 1;
  }
  const ultima = entries.map((e) => e.createdAt).filter(Boolean).sort().at(-1) || null;
  return {
    slug,
    name: meta.name,
    aliases: meta.aliases || [],
    roots: meta.roots || [],
    createdAt: meta.createdAt || null,
    entries: entries.length,
    byApp: porApp,
    byType: porTipo,
    lastUpdate: ultima,
    handoff: getHandoff(slug) ? { title: getHandoff(slug).title, content: getHandoff(slug).content, createdAt: getHandoff(slug).createdAt } : null,
    activity: activityByDay(slug, 30),
  };
}


/* ------------------------------------------------------------- inbox */

export function inboxDir() { return join(getHome(), 'inbox'); }
export function inboxDoneDir() { return join(getHome(), 'inbox', 'procesados'); }

/**
 * Toma los archivos sueltos de la bandeja y los convierte en entradas.
 * Formato: front-matter opcional (title, project, type, tags, files) + cuerpo.
 * Si no hay `project` en el front-matter, se usa el `project` por defecto.
 */
export function ingestInbox({ defaultProject = null, app = 'inbox', move = true } = {}) {
  const dir = inboxDir();
  if (!existsSync(dir)) return { processed: [], skipped: [] };
  const files = readdirSync(dir).filter((n) => {
    const full = join(dir, n);
    return statSync(full).isFile() && /\.(md|markdown|txt|json)$/i.test(n);
  });

  const processed = [];
  const skipped = [];
  for (const name of files) {
    const full = join(dir, name);
    const raw = readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
    const { content, meta } = parseEntry(raw);
    let project = meta.project || defaultProject;
    let title = meta.title;
    let type = meta.type || 'note';
    let tags = meta.tags ? meta.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    let files_ = meta.files ? meta.files.split(',').map((t) => t.trim()).filter(Boolean) : [];
    let body = content;

    if (name.toLowerCase().endsWith('.json')) {
      try {
        const data = JSON.parse(raw);
        project = data.project || project;
        title = data.title || title;
        type = data.type || type;
        tags = data.tags || tags;
        files_ = data.files || files_;
        body = data.content || body;
      } catch {
        skipped.push({ name, reason: 'JSON ilegible' });
        continue;
      }
    }

    if (!title) title = name.replace(/\.(md|markdown|txt|json)$/i, '').replace(/[_-]+/g, ' ');
    if (!project) {
      skipped.push({ name, reason: 'sin proyecto (agregá "project:" en el encabezado o pasá --project)' });
      continue;
    }
    if (!body.trim()) {
      skipped.push({ name, reason: 'vacío' });
      continue;
    }

    const match = findProjectMatch(project);
    const target = match ? match.name : project;
    const entry = writeEntry({ project: target, title, content: body, type, tags, files: files_, app });
    if (match) rememberProjectIdentity(match.slug, { aliases: [project] });
    processed.push({ name, entry, slug: entry.project, matchedBy: match?.matchedBy || 'nuevo' });

    if (move) {
      ensureDir(inboxDoneDir());
      try { renameSyncSafe(full, join(inboxDoneDir(), `${Date.now()}-${name}`)); } catch { /* si falla, el archivo queda */ }
    }
  }
  return { processed, skipped };
}

function renameSyncSafe(from, to) {
  try {
    rmSync(to, { force: true });
  } catch { /* ignore */ }
  // renameSync importado arriba
  return renameSync(from, to);
}


/* -------------------------------------------------------------- frontmatter */

function serializeEntry(entry) {
  const tags = (entry.tags || []).join(', ');
  const files = (entry.files || []).join(', ');
  const head = [
    '---',
    `id: ${entry.id}`,
    `title: ${entry.title}`,
    `type: ${entry.type}`,
    `project: ${entry.project}`,
    `app: ${entry.app || 'desconocida'}`,
    `createdAt: ${entry.createdAt}`,
    `tags: ${tags}`,
    `files: ${files}`,
    '---',
    '',
  ].join('\n');
  return `${head}${entry.content.trimEnd()}\n`;
}

function parseEntry(rawInput) {
  // Tolerante al BOM: el Bloc de notas y PowerShell guardan UTF-8 con BOM.
  const raw = String(rawInput).replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { content: raw, meta: {} };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(': ');
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 2).trim();
  }
  return { content: match[2], meta };
}

function toEntry(slug, id, raw) {
  const { content, meta } = parseEntry(raw);
  return {
    id,
    project: slug,
    title: meta.title || id,
    type: meta.type || 'note',
    app: meta.app || 'desconocida',
    createdAt: meta.createdAt || null,
    tags: meta.tags ? meta.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    files: meta.files ? meta.files.split(',').map((t) => t.trim()).filter(Boolean) : [],
    content,
    chars: content.length,
  };
}

export function newEntryId() {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    '-',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join('');
  return `${stamp}-${randomUUID().slice(0, 6)}`;
}

/* ---------------------------------------------------------------- entradas */

export function writeEntry({ project, title, content, type = 'note', tags = [], files = [], app = null, id = null, createdAt = null, root = null }) {
  if (!ENTRY_TYPES.includes(type)) {
    throw new Error(`tipo inválido: ${type}. Válidos: ${ENTRY_TYPES.join(', ')}`);
  }
  const meta = ensureProject(project, { root });
  const slug = meta.slug;
  const entry = {
    id: id || newEntryId(),
    project: slug,
    title: String(title || '').trim() || '(sin título)',
    type,
    app: app || process.env.SHARED_MCP_APP || 'desconocida',
    createdAt: createdAt || new Date().toISOString(),
    tags,
    files,
    content: String(content ?? ''),
  };
  writeFileSync(join(entriesDir(slug), `${entry.id}.md`), serializeEntry(entry), 'utf8');

  if (type === 'handoff') {
    writeFileSync(handoffPath(slug), serializeEntry(entry), 'utf8');
  }
  return entry;
}

export function listEntries(slug, { limit = 0, type = null } = {}) {
  const dir = entriesDir(slug);
  if (!existsSync(dir)) return [];
  let entries = readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .map((n) => toEntry(slug, n.replace(/\.md$/, ''), readFileSync(join(dir, n), 'utf8')))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (type) entries = entries.filter((e) => e.type === type);
  return limit > 0 ? entries.slice(0, limit) : entries;
}

export function readEntry(slug, id) {
  const path = join(entriesDir(slug), `${id}.md`);
  if (!existsSync(path)) return null;
  return toEntry(slug, id, readFileSync(path, 'utf8'));
}

export function deleteEntry(slug, id) {
  const path = join(entriesDir(slug), `${id}.md`);
  if (!existsSync(path)) return false;
  rmSync(path);
  const h = handoffPath(slug);
  if (existsSync(h)) {
    const parsed = toEntry(slug, 'handoff', readFileSync(h, 'utf8'));
    if (parsed.id === id) rmSync(h);
  }
  return true;
}

export function getHandoff(slug) {
  const path = handoffPath(slug);
  if (!existsSync(path)) return null;
  return toEntry(slug, 'handoff', readFileSync(path, 'utf8'));
}

/* --------------------------------------------------------------- pendientes */

export function addPending({ project, title, content, type = 'note', tags = [], files = [], app = null, requestedBy = 'mcp' }) {
  const id = newEntryId();
  ensureDir(pendingRoot());
  const item = {
    id,
    project: slugify(project),
    projectName: project,
    title: String(title || '').trim() || '(sin título)',
    type,
    tags,
    files,
    content: String(content ?? ''),
    app: app || process.env.SHARED_MCP_APP || 'desconocida',
    requestedBy,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(pendingRoot(), `${id}.json`), `${JSON.stringify(item, null, 2)}\n`, 'utf8');
  return item;
}

export function listPending() {
  const root = pendingRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((n) => n.endsWith('.json'))
    .map((n) => { try { return JSON.parse(readFileSync(join(root, n), 'utf8')); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function readPending(id) {
  const path = join(pendingRoot(), `${id}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function dropPending(id) {
  const path = join(pendingRoot(), `${id}.json`);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

/** Aprueba pendientes (uno o todos) y los escribe en el proyecto. Solo desde CLI. */
export function approvePending(ids = 'all') {
  const all = listPending();
  const wanted = ids === 'all' ? all : all.filter((p) => ids.includes(p.id));
  const done = [];
  for (const item of wanted) {
    const entry = writeEntry({
      project: item.projectName || item.project,
      title: item.title,
      content: item.content,
      type: item.type,
      tags: item.tags,
      files: item.files,
      app: item.app,
    });
    dropPending(item.id);
    audit('approve', { project: item.project, id: entry.id, pendingId: item.id });
    done.push(entry);
  }
  return done;
}

export function rejectPending(ids = 'all') {
  const all = listPending();
  const wanted = ids === 'all' ? all : all.filter((p) => ids.includes(p.id));
  for (const item of wanted) {
    dropPending(item.id);
    audit('reject', { project: item.project, pendingId: item.id });
  }
  return wanted;
}

/* ------------------------------------------------------------------ gate */

export function canRead(cfg = getConfig()) {
  return cfg.mode !== 'off';
}

export function describeGate(cfg = getConfig()) {
  switch (cfg.mode) {
    case 'off': return 'compartición DESACTIVADA: no se lee ni se escribe contexto compartido.';
    case 'readonly': return 'solo lectura: se puede consultar el contexto del proyecto, pero publicar está bloqueado.';
    case 'ask': return 'consentimiento por publicación: cada publicación queda PENDIENTE hasta que el usuario la apruebe con `sharedctx approve`.';
    case 'on': return 'publicación directa habilitada: lo que se publique se guarda al instante (queda auditado).';
    default: return `modo desconocido: ${cfg.mode}`;
  }
}

export function sameProject(a, b) {
  return slugify(a) === slugify(b);
}

export function relativeHome(path) {
  const home = getHome();
  return path.startsWith(home) ? `.${sep}${path.slice(home.length + 1)}` : path;
}
