#!/usr/bin/env node
/**
 * dashboard.js — panel web local del contexto compartido.
 *
 *   sharedctx ui [--port 3120] [--open]
 *
 * Sirve una interfaz en http://127.0.0.1:<puerto> con el estado real del
 * almacén: modo, proyectos, entradas, handoff, actividad, apps conectadas
 * (por heartbeat de cada proceso MCP), pendientes, auditoría y los métodos MCP
 * expuestos con su esquema.
 *
 * SOLO LECTURA y SOLO LOOPBACK: ninguna ruta modifica datos, y el socket se ata
 * a 127.0.0.1 para que no sea accesible desde la red.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  ACTIVITY_DAYS, audit as logAudit, describeGate, getActive, getConfig, getHome, getState,
  listEntries, listPending, listProjects, listSessions, projectSummary, readAudit, readEntry,
  storeSize, MODES, ENTRY_TYPES, getLastProjectForApp,
} from './store.js';
import { KNOWN_APPS, SERVER_NAME } from './apps.js';
import { TOOLS, SERVER_VERSION, OPT_IN_PROTOCOL } from './server.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(HERE, '..', 'ui');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

/* ------------------------------------------------------------ datos del panel */

function appStatus() {
  const state = getState();
  const sessions = listSessions();
  const audit = readAudit(500);

  return KNOWN_APPS.map((app) => {
    let configured = false;
    let detail = '';
    try {
      if (app.kind === 'cli') {
        configured = existsSync(app.config) && readFileSync(app.config, 'utf8').includes(SERVER_NAME);
        detail = configured ? 'registrado' : 'el CLI no está instalado';
      } else {
        const raw = existsSync(app.config) ? readFileSync(app.config, 'utf8') : '';
        configured = raw.includes(SERVER_NAME);
        const norm = (s) => s.replace(/\//g, '\\').toLowerCase();
        detail = raw.toLowerCase().includes(norm(app.kind === 'dsh-patch' ? 'dsh-mcp-client' : SERVER_NAME.toLowerCase()))
          ? 'configurado'
          : (existsSync(app.config) ? 'sin nuestra entrada' : 'archivo no encontrado');
      }
    } catch (err) {
      detail = `error leyendo config: ${err.message}`;
    }

    const sesiones = sessions.filter((s) => s.app === app.id);
    const activos = audit.filter((a) => a.app === app.id);
    const ultimo = activos.map((a) => a.ts).filter(Boolean).sort().at(-1) || null;
    const proyectos = new Set();
    for (const a of activos) if (a.project) proyectos.add(a.project);
    const actual = getLastProjectForApp(app.id);

    return {
      id: app.id,
      name: app.name,
      kind: app.kind,
      config: app.config,
      instructions: app.instructions,
      notes: app.notes,
      configured,
      detail,
      live: sesiones.some((s) => s.alive),
      sessions: sesiones.map((s) => ({ pid: s.pid, startedAt: s.startedAt, lastSeen: s.lastSeen, alive: s.alive, transport: s.transport })),
      lastActivity: ultimo,
      lastProject: actual,
      projects: [...proyectos],
      actions: activos.length,
    };
  });
}

function graph() {
  const projects = listProjects();
  const audit = readAudit(500);
  const appsCatalogados = appStatus();

  // Apps conocidas + cualquiera que aparezca en los datos (inbox, cli, migraciones…):
  // el grafo tiene que mostrar de dónde vino cada entrada, aunque no sea una app configurada.
  const ids = new Set(appsCatalogados.filter((a) => a.configured || a.lastActivity).map((a) => a.id));
  const normalizar = (id) => String(id || 'desconocida').split('/')[0];
  for (const p of projects) {
    for (const e of listEntries(p.slug)) ids.add(normalizar(e.app));
  }
  for (const a of audit) if (a.app) ids.add(normalizar(a.app));
  if (getState().lastByApp) for (const id of Object.keys(getState().lastByApp)) ids.add(id);

  const nodos = [];
  const aristas = [];
  const mapaApps = new Map(appsCatalogados.map((a) => [a.id, a]));

  for (const p of projects) {
    nodos.push({ id: `p:${p.slug}`, kind: 'project', label: p.name, slug: p.slug, weight: p.entries, lastUpdate: p.lastUpdate || null });
  }

  for (const id of ids) {
    const conocido = mapaApps.get(id);
    const sesion = listSessions().find((s) => s.app === id);
    nodos.push({
      id: `a:${id}`,
      kind: 'app',
      label: conocido ? conocido.name : id,
      appId: id,
      weight: 1,
      live: Boolean(conocido?.live || sesion?.alive),
      configured: Boolean(conocido?.configured),
      external: !conocido,
    });

    // Aristas app → proyecto, con peso = cantidad de contexto aportado + uso registrado.
    const peso = {};
    for (const p of projects) {
      const n = listEntries(p.slug).filter((e) => normalizar(e.app) === id).length;
      if (n) peso[p.slug] = (peso[p.slug] || 0) + n;
    }
    for (const a of audit) {
      if (normalizar(a.app) !== id || !a.project) continue;
      peso[a.project] = (peso[a.project] || 0) + 0.5;
    }
    const actual = conocido?.lastProject || getState().lastByApp?.[id]?.slug;
    if (actual && projects.some((p) => p.slug === actual)) peso[actual] = (peso[actual] || 0) + 0.5;

    for (const [slug, w] of Object.entries(peso)) {
      aristas.push({ source: `a:${id}`, target: `p:${slug}`, weight: w });
    }
  }

  return { nodes: nodos, edges: aristas };
}

function overview() {
  const cfg = getConfig();
  const projects = listProjects();
  const pending = listPending();
  const sessions = listSessions();
  const audit = readAudit(1);
  return {
    server: { name: SERVER_NAME, version: SERVER_VERSION, protocol: 'MCP (stdio + streamable-http)' },
    home: getHome(),
    mode: cfg.mode,
    modeHelp: describeGate(cfg),
    modes: MODES,
    entryTypes: ENTRY_TYPES,
    activeProject: getActive(),
    counts: {
      projects: projects.length,
      entries: projects.reduce((acc, p) => acc + p.entries, 0),
      pending: pending.length,
      sessions: sessions.filter((s) => s.alive).length,
      appsConfigured: appStatus().filter((a) => a.configured).length,
      sizeBytes: storeSize(),
    },
    lastActivity: audit[0]?.ts || null,
    activityDays: ACTIVITY_DAYS,
    generatedAt: new Date().toISOString(),
    instructions: OPT_IN_PROTOCOL,
  };
}

function apiData(pathname, query) {
  switch (pathname) {
    case '/api/overview': return overview();
    case '/api/apps': return { apps: appStatus() };
    case '/api/projects': return { projects: listProjects().map((p) => projectSummary(p.slug)) };
    case '/api/entries': {
      const slug = query.get('project');
      if (!slug) return { entries: [] };
      const limit = Math.min(Number(query.get('limit')) || 100, 500);
      return { project: slug, entries: listEntries(slug, { limit, type: query.get('type') || null }) };
    }
    case '/api/entry': {
      const slug = query.get('project');
      const id = query.get('id');
      const entry = slug && id ? readEntry(slug, id) : null;
      return entry ? { entry } : { error: 'no encontrada' };
    }
    case '/api/pending': return { pending: listPending() };
    case '/api/audit': return { audit: readAudit(Math.min(Number(query.get('limit')) || 100, 500)) };
    case '/api/graph': return graph();
    case '/api/tools': return { tools: TOOLS };
    case '/api/sessions': return { sessions: listSessions() };
    default: return null;
  }
}

/* ------------------------------------------------------------------- server */

export function createDashboardServer() {
  return createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'el panel es de solo lectura' }));
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        const data = apiData(url.pathname, url.searchParams);
        if (data === null) {
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: `ruta desconocida: ${url.pathname}` }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(data, null, 2));
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const file = join(UI_DIR, rel);
    if (!file.startsWith(UI_DIR) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
}

export function startDashboard({ port = 3120, host = '127.0.0.1', open = false } = {}) {
  const server = createDashboardServer();
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const url = `http://${host}:${port}/`;
      logAudit('dashboard.open', { url });
      if (open) {
        try {
          if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
          else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
        } catch { /* si no se puede abrir, la URL igual se imprime */ }
      }
      resolve({ server, url });
    });
  });
}

/* ---------------------------------------------------------------------- CLI */

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esPrincipal) {
  const args = process.argv.slice(2);
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? Number(args[portIdx + 1]) : (getConfig().dashboardPort || 3120);
  const { url } = await startDashboard({ port, open: args.includes('--open') });
  process.stdout.write(`Panel del contexto compartido: ${url}\n`);
  process.stdout.write(`Almacén: ${getHome()} · modo: ${getConfig().mode}\n`);
  process.stdout.write('Ctrl+C para detener.\n');
}
