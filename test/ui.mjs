/**
 * ui.mjs — ejecuta DE VERDAD el JavaScript del panel (con jsdom) contra el
 * servidor real, sobre un almacén temporal.
 *
 * Existe porque un error de runtime en la interfaz (por ejemplo un canvas mal
 * resuelto) no lo detecta ninguna prueba de API: hay que renderizar la página.
 *
 *   node test/ui.mjs
 */

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const home = mkdtempSync(join(tmpdir(), 'sharedctx-ui-'));
process.env.SHARED_MCP_HOME = home;
process.env.SHARED_MCP_APP = 'prueba-ui';

const store = await import('../src/store.js');
const { startDashboard } = await import('../src/dashboard.js');

let failures = 0;
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  console.log(`${ok ? 'OK  ' : 'FALLA'}  ${label}${detail && !ok ? `\n      ${detail}` : ''}`);
  if (!ok) failures += 1;
}

// Datos con relaciones, para que se dibujen los dos grafos.
store.writeEntry({ project: 'Panel Demo', title: 'Handoff del panel', content: 'Estado del panel de prueba.', type: 'handoff', tags: ['panel'], files: ['D:\\demo\\panel.ts'] });
store.writeEntry({ project: 'Panel Demo', title: 'Decisión sobre el grafo', content: 'El grafo usa fuerzas simples. Ver [[Handoff del panel]].', type: 'decision', tags: ['panel', 'grafo'], files: ['D:\\demo\\panel.ts'] });
store.writeEntry({ project: 'Panel Demo', title: 'Nota suelta', content: 'Sin etiquetas ni archivos ni menciones.', type: 'note' });
store.addPending({ project: 'Panel Demo', title: 'Algo por aprobar', content: 'contenido pendiente', type: 'note' });

const { server } = await startDashboard({ port: 0 });
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const html = readFileSync(join(ROOT, 'ui', 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: false, url: `${base}/` });
  const { window } = dom;

  // Contexto 2D de mentira: jsdom no dibuja, pero el código tiene que poder usarlo.
  const llamadas = { clearRect: 0, fill: 0, stroke: 0, fillText: 0 };
  const ctxFalso = new Proxy({}, {
    get(_t, prop) {
      if (prop in llamadas) return () => { llamadas[prop] += 1; };
      if (prop === 'canvas') return null;
      return () => {};
    },
    set() { return true; },
  });
  window.HTMLCanvasElement.prototype.getContext = () => ctxFalso;
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get: () => 900, configurable: true });
  window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 520 });

  // fetch real contra el servidor del panel; requestAnimationFrame acotado.
  window.fetch = (url, opts) => fetch(new URL(url, base).toString(), opts);
  let frames = 0;
  window.requestAnimationFrame = (cb) => { if (frames < 600) { frames += 1; setTimeout(() => cb(Date.now()), 0); } return frames; };
  window.devicePixelRatio = 1;
  window.URL.createObjectURL = () => 'blob:x';
  window.URL.revokeObjectURL = () => {};

  const errores = [];
  window.addEventListener('error', (e) => errores.push(String(e.error || e.message)));
  window.onerror = (msg) => { errores.push(String(msg)); };

  // Ejecuta el JS del panel dentro de la ventana.
  window.eval(readFileSync(join(ROOT, 'ui', 'app.js'), 'utf8'));

  // Espera a que terminen los fetch y los frames.
  await new Promise((r) => setTimeout(r, 700));

  check('el panel arranca sin errores de runtime', errores.length === 0, errores.join(' | '));
  check('se dibujaron los dos grafos con el contexto 2D',
    llamadas.clearRect >= 2 && llamadas.fillText > 0,
    JSON.stringify(llamadas));

  const cards = window.document.querySelector('#cards');
  check('las tarjetas se completan', cards && /Salud del contexto/.test(cards.textContent), cards?.textContent?.slice(0, 120));
  check('la tarjeta muestra la salud en 0-100', /9\d|100/.test(cards.textContent));

  const egStats = window.document.querySelector('#eg-stats').textContent;
  check('el grafo de entradas informa sus estadísticas', /\d+ entradas .* \d+ relaciones/.test(egStats), egStats);

  const tools = window.document.querySelector('#tools').textContent;
  check('los 8 métodos MCP se listan con su esquema', window.document.querySelectorAll('#tools details').length >= 8);

  const insights = window.document.querySelector('#insights').textContent;
  check('el diagnóstico se renderiza con la salud', /salud/i.test(insights) && insights.length > 40, insights.slice(0, 120));

  const projects = window.document.querySelector('#projects').textContent;
  check('los proyectos se renderizan con su handoff', /Panel Demo/.test(projects) && /Estado del panel de prueba/.test(projects), projects.slice(0, 140));

  const apps = window.document.querySelector('#apps').textContent;
  check('la tabla de apps se renderiza', /DeepSeek Harness/.test(apps) && /Cursor/.test(apps));

  const pending = window.document.querySelector('#pending').textContent;
  check('los pendientes muestran el comando para aprobar', /sharedctx approve/.test(pending), pending.slice(0, 120));

  // Interacción: abrir el grafo de un proyecto y el detalle de una entrada.
  const proj = (await (await fetch(`${base}/api/projects`)).json()).projects[0];
  window.verGrafo(proj.slug);
  await new Promise((r) => setTimeout(r, 400));
  check('la acción "ver grafo" cambia de pestaña y carga el proyecto',
    window.document.querySelector('#tab-entradas').classList.contains('active')
    && window.document.querySelector('#eg-project').value === proj.slug,
    window.document.querySelector('#eg-project').value);

  const entryId = (await (await fetch(`${base}/api/entries?project=${proj.slug}`)).json()).entries[0].id;
  window.openEntry(proj.slug, entryId, 'Prueba');
  await new Promise((r) => setTimeout(r, 400));
  const drawer = window.document.querySelector('#drawer');
  check('se abre el detalle de una entrada con su vecindario',
    !drawer.classList.contains('hidden') && /Relacionadas|Sin entradas relacionadas/.test(drawer.textContent),
    drawer.textContent.slice(0, 160));

  check('la consola no acumula errores tras interactuar', errores.length === 0, errores.join(' | '));

  // Interacción con el canvas: arrastrar y hacer clic no deben romper nada.
  const canvas = window.document.querySelector('#egraph');
  const ev = (tipo, x, y) => canvas.dispatchEvent(new window.MouseEvent(tipo, { clientX: x, clientY: y, bubbles: true }));
  const antesFrames = frames;
  ev('mousedown', 200, 200); ev('mousemove', 320, 260); ev('mouseup', 320, 260);
  ev('mousemove', 100, 100); ev('click', 100, 100); ev('mouseleave', 0, 0);
  await new Promise((r) => setTimeout(r, 200));
  check('arrastrar y hacer clic en el grafo no rompe nada', errores.length === 0, errores.join(' | '));
  check('el bucle de dibujo sigue vivo', frames > antesFrames, `${antesFrames} → ${frames}`);

  dom.window.close();
} finally {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  rmSync(home, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nTodo OK.' : `\n${failures} prueba(s) fallaron.`);
process.exitCode = failures === 0 ? 0 : 1;
