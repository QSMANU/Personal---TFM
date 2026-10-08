/**
 * robustness.mjs — pruebas de robustez que no dependen del protocolo MCP:
 * contenido grande, unicode/emoji, BOM, bandeja y el candado de `mode off`.
 *
 *   node test/robustness.mjs
 */

import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const home = mkdtempSync(join(tmpdir(), 'sharedctx-robust-'));
process.env.SHARED_MCP_HOME = home;
process.env.SHARED_MCP_APP = 'prueba-robustez';

const store = await import('../src/store.js');
let failures = 0;

function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  console.log(`${ok ? 'OK  ' : 'FALLA'}  ${label}${detail && !ok ? `\n      ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const cli = (...args) => {
  const res = spawnSync(process.execPath, [join(ROOT, 'src', 'cli.js'), ...args], {
    env: { ...process.env, SHARED_MCP_HOME: home },
    encoding: 'utf8',
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
};

/* 1. contenido grande (500 KB) por archivo, sin pasar por la línea de comandos */
{
  const grande = 'línea de prueba con acentos, emoji 🚀 y 中文\n'.repeat(12500);
  const entrada = store.writeEntry({ project: 'grande', title: 'Contenido grande', content: grande, type: 'note' });
  const leida = store.readEntry('grande', entrada.id);
  check('contenido de ~500 KB se guarda y se lee completo', leida.content === grande, `${leida.content.length} vs ${grande.length}`);
  check('el archivo en disco coincide en tamaño', readFileSync(join(home, 'projects', 'grande', 'entries', `${entrada.id}.md`), 'utf8').includes(grande));
}

/* 2. unicode, emoji y nombres de proyecto raros */
{
  const e = store.writeEntry({ project: 'Ñandú 中文 🚀', title: 'Título con emoji 🎯', content: 'acentos: áéíóú ñ — 中文 🚀', type: 'note', tags: ['ñandú', '中文'] });
  const leida = store.readEntry(e.project, e.id);
  check('unicode y emoji sobreviven al round-trip', leida.content.includes('🚀') && leida.title.includes('🎯'), leida.title);
  check('el slug del proyecto es seguro para el sistema de archivos', /^[a-z0-9-]+$/.test(e.project), e.project);
}

/* 3. Tolerancia a BOM (Bloc de notas / PowerShell) en la bandeja */
{
  const inbox = join(home, 'inbox');
  mkdirSync(inbox, { recursive: true });
  const conBom = '\uFEFF---\r\nproject: Proyecto BOM\r\ntitle: Con BOM\r\ntype: decision\r\n---\r\nCuerpo con BOM.\r\n';
  writeFileSync(join(inbox, 'nota.md'), conBom, 'utf8');
  const res = store.ingestInbox({ app: 'prueba' });
  check('la bandeja acepta archivos con BOM', res.processed.length === 1 && res.processed[0].entry.project === 'proyecto-bom', JSON.stringify(res.skipped));
  check('el archivo procesado se mueve a inbox/procesados', readFileSync(join(home, 'inbox', 'procesados', readdirSync(join(home, 'inbox', 'procesados'))[0]), 'utf8').includes('Cuerpo con BOM'));
}

/* 4. El candado `mode off` corta también la escritura por CLI */
{
  store.saveConfig({ mode: 'off' });
  const bloqueado = cli('add', '--title', 'no', '--content', 'no', '--project', 'x');
  check('mode off: el CLI rechaza publicar (exit 2)', bloqueado.code === 2 && /modo `off`/.test(bloqueado.out), bloqueado.out.trim());

  store.saveConfig({ mode: 'readonly' });
  const lectura = cli('projects');
  check('mode readonly: leer sigue permitido', lectura.code === 0, lectura.out.trim());

  store.saveConfig({ mode: 'ask' });
  const ok = cli('add', '--title', 'sí', '--content', 'sí', '--project', 'x');
  check('mode ask: el CLI del usuario sí publica', ok.code === 0 && /publicado/.test(ok.out), ok.out.trim());
}

/* 5. Nombres equivalentes y sinónimos no duplican proyectos */
{
  const antes = store.listProjects().length;
  store.writeEntry({ project: 'OAT - Architecture', title: 'a', content: 'a' });
  store.writeEntry({ project: 'oat architecture', title: 'b', content: 'b' });
  const despues = store.listProjects().length;
  check('dos escrituras del mismo proyecto con distinto formato no duplican', despues === antes + 1, `${antes} → ${despues}`);
}

rmSync(home, { recursive: true, force: true });
console.log(failures === 0 ? '\nTodo OK.' : `\n${failures} prueba(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
