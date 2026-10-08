/**
 * dashboard.mjs — prueba el panel web: endpoints JSON, página HTML y que NO
 * permita escrituras (es solo lectura).
 *
 *   node test/dashboard.mjs
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const home = mkdtempSync(join(tmpdir(), 'sharedctx-dash-'));
process.env.SHARED_MCP_HOME = home;
process.env.SHARED_MCP_APP = 'prueba-panel';

const store = await import('../src/store.js');
const { startDashboard } = await import('../src/dashboard.js');

let failures = 0;
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  console.log(`${ok ? 'OK  ' : 'FALLA'}  ${label}${detail && !ok ? `\n      ${detail}` : ''}`);
  if (!ok) failures += 1;
}

// Datos de prueba: un proyecto con dos entradas y una sesión "viva".
store.saveConfig({ mode: 'ask' });
store.writeEntry({ project: 'Personal - Demo', title: 'Handoff demo', content: 'estado de prueba', type: 'handoff', tags: ['demo'], files: ['D:\\demo\\a.ts'] });
store.writeEntry({ project: 'Personal - Demo', title: 'Decisión demo', content: 'elegimos X', type: 'decision', tags: ['demo', 'decisiones'], files: ['D:\\demo\\a.ts'] });
store.addPending({ project: 'Personal - Demo', title: 'Pendiente demo', content: 'algo por aprobar', type: 'note' });
store.registerSession({ app: 'cursor', transport: 'stdio' });

const { server, url } = await startDashboard({ port: 0 });
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const overview = await (await fetch(`${base}/api/overview`)).json();
  check('overview informa modo, contadores y almacén',
    overview.mode === 'ask' && overview.counts.projects === 1 && overview.counts.entries === 2 && overview.counts.pending === 1 && overview.home === home,
    JSON.stringify(overview.counts));
  check('overview incluye la salud del contexto',
    overview.health && typeof overview.health.score === 'number', JSON.stringify(overview.health));
  check('overview expone el protocolo opt-in que recibe el modelo',
    typeof overview.instructions === 'string' && overview.instructions.includes('NUNCA publiques'));

  const tools = await (await fetch(`${base}/api/tools`)).json();
  check('los métodos MCP se exponen con su esquema', tools.tools.length === 8 && tools.tools.every((t) => t.name && t.inputSchema));

  const apps = await (await fetch(`${base}/api/apps`)).json();
  const cursor = apps.apps.find((a) => a.id === 'cursor');
  check('las apps muestran estado, proyecto actual y sesiones',
    apps.apps.length >= 9 && cursor && cursor.live === true && cursor.sessions.length === 1,
    JSON.stringify({ n: apps.apps.length, live: cursor?.live }));

  const projects = await (await fetch(`${base}/api/projects`)).json();
  check('los proyectos traen actividad de 30 días y desglose por app',
    projects.projects[0].activity.length === 30 && projects.projects[0].byApp['prueba-panel'] === 2,
    JSON.stringify(projects.projects[0].byApp));

  const graph = await (await fetch(`${base}/api/graph`)).json();
  check('el grafo trae nodos de proyecto y de app con sus aristas',
    graph.nodes.some((n) => n.kind === 'project' && n.slug === 'personal-demo') && graph.nodes.some((n) => n.kind === 'app') && graph.edges.length > 0,
    JSON.stringify({ nodes: graph.nodes.length, edges: graph.edges.length }));

  const eg = await (await fetch(`${base}/api/entrygraph?project=personal-demo`)).json();
  check('el grafo de entradas trae entradas, etiquetas y relaciones',
    eg.nodes.some((n) => n.kind === 'entry') && eg.stats.entries === 2 && eg.stats.tags >= 1 && eg.stats.links > 0,
    JSON.stringify(eg.stats));

  const egSinTags = await (await fetch(`${base}/api/entrygraph?project=personal-demo&tags=0&files=0`)).json();
  check('los conmutadores de tags/archivos cambian el grafo',
    egSinTags.stats.links < eg.stats.links || eg.stats.tags === 0,
    JSON.stringify({ con: eg.stats.links, sin: egSinTags.stats.links }));

  const diag = await (await fetch(`${base}/api/insights`)).json();
  check('el diagnóstico trae salud y avisos con acción',
    typeof diag.score === 'number' && Array.isArray(diag.insights) && diag.insights.every((i) => i.title && i.action),
    JSON.stringify({ score: diag.score, n: diag.insights?.length }));

  const related = await (await fetch(`${base}/api/related?project=personal-demo`)).json();
  check('el panel puede pedir el vecindario de una entrada', Array.isArray(related.related));

  const dot = await (await fetch(`${base}/api/dot?project=personal-demo`)).json();
  check('se puede exportar el grafo a DOT', dot.dot.startsWith('digraph'));

  const pending = await (await fetch(`${base}/api/pending`)).json();
  check('los pendientes se listan', pending.pending.length === 1 && pending.pending[0].title === 'Pendiente demo');

  const audit = await (await fetch(`${base}/api/audit?limit=10`)).json();
  check('la auditoría se puede leer', Array.isArray(audit.audit));

  const html = await (await fetch(`${base}/`)).text();
  check('sirve la interfaz HTML', html.includes('QSMANU-LOCAL-SHARED-MCP') && html.includes('/app.js'));

  const js = await fetch(`${base}/app.js`);
  check('sirve los assets estáticos', js.ok && (await js.text()).includes('renderCards'));

  const traversal = await fetch(`${base}/../package.json`);
  check('no permite salir del directorio de la interfaz', traversal.status === 404 || !(await traversal.text()).includes('shared-mcp-local'), String(traversal.status));

  const post = await fetch(`${base}/api/overview`, { method: 'POST' });
  check('rechaza escrituras (solo lectura)', post.status === 405);

  const missing = await fetch(`${base}/api/nope`);
  check('404 en endpoint inexistente', missing.status === 404);
} finally {
  server.closeAllConnections?.();
  server.closeIdleConnections?.();
  await new Promise((resolve) => server.close(resolve));
  rmSync(home, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nTodo OK.' : `\n${failures} prueba(s) fallaron.`);
process.exitCode = failures === 0 ? 0 : 1;
