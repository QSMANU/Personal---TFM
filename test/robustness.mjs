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
  const bloqueadoRo = cli('add', '--title', 'no', '--content', 'no', '--project', 'x');
  check('mode readonly: el CLI rechaza escribir (exit 2)', bloqueadoRo.code === 2 && /modo `readonly`/.test(bloqueadoRo.out), bloqueadoRo.out.trim());

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

/* 6. Publicar con el mismo id ACTUALIZA en vez de duplicar (documentos idempotentes) */
{
  const v1 = store.writeEntry({ project: 'Docs', id: 'ctx-doc', title: 'Documento v1', content: 'primera versión', type: 'note' });
  const creado = v1.createdAt;
  const antes = store.listEntries('docs').length;
  const v2 = store.writeEntry({ project: 'Docs', id: 'ctx-doc', title: 'Documento v2', content: 'segunda versión', type: 'note' });
  const despues = store.listEntries('docs').length;
  check('republicar el mismo id no crea otra entrada', antes === 1 && despues === 1, `${antes} → ${despues}`);
  check('republicar conserva la fecha original', v2.createdAt === creado, `${v1.createdAt} vs ${v2.createdAt}`);
  check('republicar actualiza el contenido', store.readEntry('docs', 'ctx-doc').content.trim() === 'segunda versión', store.readEntry('docs', 'ctx-doc').content);
  check('writeEntry informa si actualizó', v2.updated === true && v1.updated !== true);

  // Y también por la bandeja, con "id:" en el encabezado.
  const inbox = join(home, 'inbox');
  mkdirSync(inbox, { recursive: true });
  writeFileSync(join(inbox, 'doc-a.md'), '---\nid: ctx-ingest\nproject: Docs\ntitle: Desde bandeja v1\n---\nv1\n', 'utf8');
  store.ingestInbox({ app: 'prueba' });
  writeFileSync(join(inbox, 'doc-b.md'), '---\nid: ctx-ingest\nproject: Docs\ntitle: Desde bandeja v2\n---\nv2\n', 'utf8');
  store.ingestInbox({ app: 'prueba' });
  check('la bandeja respeta el id del encabezado', store.listEntries('docs').length === 2 && store.readEntry('docs', 'ctx-ingest').title === 'Desde bandeja v2');
}

/* 7. El grafo de relaciones refleja las actualizaciones sin duplicar nodos */
{
  const { buildEntryGraph } = await import('../src/relations.js');
  const g = buildEntryGraph('docs');
  check('el grafo del proyecto tiene un nodo por entrada', g.nodes.filter((n) => n.kind === 'entry').length === 2, JSON.stringify(g.stats));
}

/* 8. Los ids que vienen de un modelo no pueden salir de la carpeta del proyecto */
{
  for (const malo of ['../evil', 'a/b', '..', 'CON', '.oculto']) {
    let rechazado = false;
    try { store.assertSafeId(malo); } catch { rechazado = true; }
    check(`rechaza id inseguro "${malo}"`, rechazado);
  }
  check('acepta un id normal con guiones, puntos y guiones bajos', store.assertSafeId('ctx-doc_1.2') === 'ctx-doc_1.2');
}

/* 9. Escritura atómica: sin temporales huérfanos y con el último contenido */
{
  const dir = join(home, 'atomic');
  mkdirSync(dir, { recursive: true });
  const archivo = join(dir, 'config.json');
  store.writeAtomicSync(archivo, '{"a":1}\n', 'utf8');
  store.writeAtomicSync(archivo, '{"a":2}\n', 'utf8');
  check('la escritura atómica deja el último contenido', JSON.parse(readFileSync(archivo, 'utf8')).a === 2);
  check('la escritura atómica no deja archivos .tmp', readdirSync(dir).filter((n) => n.includes('.tmp')).length === 0, readdirSync(dir).join(', '));
}

/* 10. El handoff conserva el id real de su front-matter y se puede borrar */
{
  const h = store.writeEntry({ project: 'Handoff Test', id: 'h-test', title: 'Handoff test', content: 'estado', type: 'handoff' });
  const leido = store.getHandoff('handoff-test');
  check('getHandoff conserva el id real de la entrada', leido && leido.id === h.id, JSON.stringify(leido));
  check('borrar el handoff elimina también handoff.md', store.deleteEntry('handoff-test', h.id) && store.getHandoff('handoff-test') === null);
}

rmSync(home, { recursive: true, force: true });
console.log(failures === 0 ? '\nTodo OK.' : `\n${failures} prueba(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
