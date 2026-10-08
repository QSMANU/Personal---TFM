/**
 * Prueba de humo de punta a punta del servidor MCP (stdio), usando un almacén
 * temporal para no tocar el contexto real.
 *
 *   node test/mcp-smoke.mjs
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const home = mkdtempSync(join(tmpdir(), 'sharedctx-test-'));

const env = { ...process.env, SHARED_MCP_HOME: home, SHARED_MCP_APP: 'prueba', SHARED_MCP_PROJECT: 'proyecto-demo' };
let failures = 0;

function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  console.log(`${ok ? 'OK  ' : 'FALLA'}  ${label}${detail && !ok ? `\n      ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const cli = (...args) => {
  const res = spawnSync(process.execPath, [join(ROOT, 'src', 'cli.js'), ...args], { env, encoding: 'utf8' });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
};

const client = new Client({ name: 'prueba', version: '1.0.0' }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'src', 'stdio.js')], env });
await client.connect(transport);

try {
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  check('expone exactamente las 8 herramientas previstas', tools.length === 8, tools.join(', '));
  check('no expone ninguna herramienta destructiva de archivos/git',
    !tools.some((t) => /file|git|delete_dir|exec|shell/i.test(t)), tools.join(', '));
  check('no expone ninguna herramienta para cambiar el modo de consentimiento',
    !tools.some((t) => /mode|consent|permission/i.test(t)), tools.join(', '));

  const status = await client.callTool({ name: 'shared_status', arguments: {} });
  check('shared_status arranca en modo ask', status.content[0].text.includes('**ask**'), status.content[0].text);

  const pin = await client.callTool({ name: 'shared_use_project', arguments: { project: 'proyecto-demo', confirm: true } });
  check('shared_use_project fija el proyecto', /Proyecto activo en esta sesión/.test(pin.content[0].text), pin.content[0].text);

  const sinConfirm = await client.callTool({ name: 'shared_publish', arguments: { title: 'x', content: 'y' } });
  check('shared_publish sin confirm es rechazado', sinConfirm.isError === true);

  const propuesta = await client.callTool({
    name: 'shared_publish',
    arguments: { title: 'Decisión de prueba', content: 'Usamos SQLite en vez de Postgres.', type: 'decision', confirm: true },
  });
  check('en modo ask la publicación queda pendiente', /PENDIENTE/.test(propuesta.content[0].text), propuesta.content[0].text);

  const antes = await client.callTool({ name: 'shared_pull', arguments: {} });
  check('shared_pull NO muestra lo pendiente', !antes.content[0].text.includes('Decisión de prueba'), antes.content[0].text);

  const aprobado = cli('approve', 'all');
  check('el usuario aprueba por CLI', aprobado.code === 0 && /aprobado/.test(aprobado.out), aprobado.out);

  const despues = await client.callTool({ name: 'shared_pull', arguments: {} });
  check('tras aprobar, shared_pull lo muestra', despues.content[0].text.includes('Decisión de prueba'), despues.content[0].text);

  const handoff = await client.callTool({
    name: 'shared_publish',
    arguments: { title: 'Handoff', content: 'Quedé en la migración de la tabla users.', type: 'handoff', confirm: true },
  });
  check('handoff publicable', /PENDIENTE|Publicado/.test(handoff.content[0].text));
  cli('approve', 'all');
  const pull2 = await client.callTool({ name: 'shared_pull', arguments: {} });
  check('el handoff aparece en la cabecera', /migración de la tabla users/.test(pull2.content[0].text), pull2.content[0].text);

  const ajeno = await client.callTool({ name: 'shared_pull', arguments: { project: 'otro-proyecto' } });
  check('leer otro proyecto sin confirmación es rechazado', ajeno.isError === true, ajeno.content[0].text);

  cli('mode', 'readonly');
  const bloqueado = await client.callTool({ name: 'shared_publish', arguments: { title: 'n', content: 'c', confirm: true } });
  check('en readonly no se puede publicar', bloqueado.isError === true, bloqueado.content[0].text);

  cli('mode', 'off');
  const apagado = await client.callTool({ name: 'shared_pull', arguments: {} });
  check('en off no se puede leer', apagado.isError === true, apagado.content[0].text);

  const statusOff = await client.callTool({ name: 'shared_status', arguments: {} });
  check('shared_status sigue disponible en off', statusOff.isError !== true);

  cli('mode', 'on');
  const directo = await client.callTool({ name: 'shared_publish', arguments: { title: 'Directo', content: 'ok', confirm: true } });
  check('en on se publica directo', /Publicado/.test(directo.content[0].text), directo.content[0].text);

  const exp = cli('export', '--project', 'proyecto-demo', '--out', join(home, 'export'));
  check('export a Markdown funciona (para ChatGPT web)', exp.code === 0 && /exportado/.test(exp.out), exp.out);

  const rel = await client.callTool({ name: 'shared_related', arguments: { limit: 5 } });
  check('shared_related devuelve el vecindario del handoff', !rel.isError && /Relacionadas con/.test(rel.content[0].text), rel.content[0].text);
  check('el vecindario explica el motivo de cada relación', /por qué:/.test(rel.content[0].text), rel.content[0].text);
} finally {
  await client.close().catch(() => {});
}

// Segunda sesión: cwd de sistema, app NUEVA (sin historial) → no debe inventar proyecto.
{
  const env2 = { ...env, SHARED_MCP_APP: 'app-sin-historial' };
  delete env2.SHARED_MCP_PROJECT;
  const client2 = new Client({ name: 'prueba-sin-proyecto', version: '1.0.0' }, { capabilities: {} });
  await client2.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, 'src', 'stdio.js')],
    env: env2,
    cwd: 'C:\\Windows\\System32',
  }));
  const pull = await client2.callTool({ name: 'shared_pull', arguments: {} });
  check('app nueva + cwd de sistema: no inventa proyecto', /No pude determinar el proyecto/.test(pull.content[0].text), pull.content[0].text);
  const pub = await client2.callTool({ name: 'shared_publish', arguments: { title: 't', content: 'c', confirm: true } });
  check('app nueva + cwd de sistema: shared_publish se niega', pub.isError === true, pub.content[0].text);
  await client2.close().catch(() => {});
}

// Tercera sesión: la MISMA app ya usada recuerda su proyecto (menos preguntas).
{
  const env3 = { ...env };
  delete env3.SHARED_MCP_PROJECT;
  const client3 = new Client({ name: 'prueba-sticky', version: '1.0.0' }, { capabilities: {} });
  await client3.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, 'src', 'stdio.js')],
    env: env3,
    cwd: 'C:\\Windows\\System32',
  }));
  const status = await client3.callTool({ name: 'shared_status', arguments: {} });
  check('la app recuerda su último proyecto', /último proyecto usado en prueba/.test(status.content[0].text), status.content[0].text);
  const pull = await client3.callTool({ name: 'shared_pull', arguments: {} });
  check('y el pull funciona sin preguntar nada', /Decisión de prueba/.test(pull.content[0].text), pull.content[0].text);
  await client3.close().catch(() => {});
}

// Cuarta sesión: DeepSeek Harness detecta el proyecto por el TÍTULO del workspace.
{
  const dshHome = join(home, 'dsh-home');
  mkdirSync(join(dshHome, 'storages'), { recursive: true });
  mkdirSync(join(dshHome, 'profiles', 'desktop'), { recursive: true });
  writeFileSync(join(dshHome, 'storages', 'workspace.json'), JSON.stringify({
    tables: {
      workspaces: {
        aaa: { path: 'D:\\Repos\\otro-viejo', title: 'Otro', updatedAt: '2026-01-01T00:00:00.000Z' },
        bbb: { path: 'D:\\Repositories\\shared-mcp-local', title: 'Personal - Shared-MCP-Local', updatedAt: new Date().toISOString() },
      },
    },
  }), 'utf8');

  // El proyecto ya existe con otro nombre: el workspace debe emparejarse solo (alias/ruta).
  cli('add', '--project', 'proyecto-demo', '--title', 'Nota previa', '--content', 'contenido previo');

  const env4 = { ...env, SHARED_MCP_APP: 'dsh', DSH_HOME: dshHome };
  delete env4.SHARED_MCP_PROJECT;
  const client4 = new Client({ name: 'prueba-dsh', version: '1.0.0' }, { capabilities: {} });
  await client4.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, 'src', 'stdio.js')],
    env: env4,
    cwd: join(dshHome, 'profiles', 'desktop'),
  }));
  const status = await client4.callTool({ name: 'shared_status', arguments: {} });
  check('DSH detecta el proyecto por el título del workspace',
    /Personal - Shared-MCP-Local/.test(status.content[0].text) && /workspace de DSH/.test(status.content[0].text),
    status.content[0].text);
  await client4.close().catch(() => {});
}

// Quinta sesión: nombres equivalentes ("Personal - X" ≡ "personal-x") no duplican proyecto.
{
  cli('use', 'proyecto-demo');
  const env5 = { ...env, SHARED_MCP_APP: 'app-nueva-activo' };
  delete env5.SHARED_MCP_PROJECT;
  const client5 = new Client({ name: 'prueba-activo', version: '1.0.0' }, { capabilities: {} });
  await client5.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, 'src', 'stdio.js')],
    env: env5,
    cwd: 'C:\\Windows\\System32',
  }));
  const status = await client5.callTool({ name: 'shared_status', arguments: {} });
  check('sin señal propia, cae al proyecto activo global (sharedctx use)',
    /proyecto activo global/.test(status.content[0].text), status.content[0].text);
  const raro = await client5.callTool({ name: 'shared_pull', arguments: { project: 'Proyecto Demo', confirm_cross_project: true } });
  check('nombres con distinto formato apuntan al mismo proyecto',
    /proyecto-demo/.test(raro.content[0].text) && !/No pude determinar/.test(raro.content[0].text), raro.content[0].text);
  await client5.close().catch(() => {});
}

// Sexta: unificación por ruta — el título de DSH y la carpeta del repo son UN proyecto.
{
  process.env.SHARED_MCP_HOME = home;
  const store = await import('../src/store.js');
  const raiz = 'D:\\Repos\\prueba-unificacion';
  store.ensureProject('shared-mcp-local', { root: raiz });
  const meta = store.ensureProject('Personal - Shared-MCP-Local', { root: raiz, aliases: ['Personal - Shared-MCP-Local'] });
  check('dos nombres con la misma raíz son un solo proyecto', meta.slug === 'shared-mcp-local', `slug=${meta.slug}`);
  const m = store.findProjectMatch('Personal - Shared-MCP-Local');
  check('el título de DSH queda como alias del proyecto', m?.slug === 'shared-mcp-local', JSON.stringify(m));
  const cuantos = store.listProjects().filter((p) => p.slug === 'shared-mcp-local' || p.slug === 'personal-shared-mcp-local').length;
  check('no se duplicó el proyecto', cuantos === 1, `proyectos=${cuantos}`);
}

rmSync(home, { recursive: true, force: true });

console.log(failures === 0 ? '\nTodo OK.' : `\n${failures} prueba(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
