/**
 * relations.mjs — pruebas del grafo de entradas y del diagnóstico.
 *
 *   node test/relations.mjs
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
process.env.SHARED_MCP_HOME = mkdtempSync(join(tmpdir(), 'sharedctx-rel-'));
process.env.SHARED_MCP_APP = 'prueba-relaciones';
const home = process.env.SHARED_MCP_HOME;

const store = await import('../src/store.js');
const { buildEntryGraph, insights, relatedEntries, graphToDot, graphToMermaid } = await import('../src/relations.js');

let failures = 0;
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  console.log(`${ok ? 'OK  ' : 'FALLA'}  ${label}${detail && !ok ? `\n      ${detail}` : ''}`);
  if (!ok) failures += 1;
}

/* Datos: un proyecto con relaciones conocidas y otro con problemas a propósito. */

// A y B comparten etiqueta y archivo → deben quedar conectadas.
const a = store.writeEntry({ project: 'Grafo', title: 'Decisión de arquitectura del bus', content: 'Usamos SQS con outbox.', type: 'decision', tags: ['arquitectura'], files: ['D:\\repo\\src\\bus.ts'] });
const b = store.writeEntry({ project: 'Grafo', title: 'Implementación del outbox', content: `Detalle de la implementación. Ver ${a.id} para el contexto.`, type: 'note', tags: ['arquitectura', 'outbox'], files: ['D:\\repo\\src\\bus.ts'] });
// C menciona a B por título completo → relación "menciona".
const c = store.writeEntry({ project: 'Grafo', title: 'Pruebas de integración', content: 'Cubre lo descrito en [[Implementación del outbox]].', type: 'task', tags: ['testing'] });
// D es huérfana: sin tags, sin archivos, sin menciones, contenido distinto.
store.writeEntry({ project: 'Grafo', title: 'Nota suelta', content: 'Algo completamente distinto sobre otra cosa.', type: 'note' });
// E y F son casi el mismo texto → duplicado.
store.writeEntry({ project: 'Grafo', title: 'Estado del despliegue semanal', content: 'El despliegue quedó pendiente de aprobación por el equipo de seguridad y se retoma el lunes.', type: 'note', tags: ['deploy'] });
store.writeEntry({ project: 'Grafo', title: 'Estado del despliegue semanal (copia)', content: 'El despliegue quedó pendiente de aprobación por el equipo de seguridad y se retoma el lunes.', type: 'note', tags: ['deploy'] });
store.writeEntry({ project: 'Grafo', title: 'Handoff', content: 'Vamos por la mitad del bus de eventos.', type: 'handoff', tags: ['handoff'] });

// Proyecto problemático: sin handoff y con un archivo compartido con 'Grafo'.
store.writeEntry({ project: 'Sin Handoff', title: 'Nota del otro proyecto', content: 'Toca el mismo archivo del bus.', type: 'note', files: ['D:\\repo\\src\\bus.ts'] });

/* Grafo */

const g = buildEntryGraph('grafo');
check('el grafo incluye entradas, etiquetas y archivos',
  g.nodes.some((n) => n.kind === 'entry') && g.nodes.some((n) => n.kind === 'tag') && g.nodes.some((n) => n.kind === 'file'),
  JSON.stringify(g.stats));

check('detecta relaciones por etiqueta y por archivo',
  g.stats.byKind.tag > 0 && g.stats.byKind.file > 0,
  JSON.stringify(g.stats.byKind));

check('relaciona la entrada que menciona a otra por su título',
  g.edges.some((e) => e.kind === 'menciona' && [e.source, e.target].includes(`e:${c.id}`)),
  JSON.stringify(g.edges.filter((e) => e.kind === 'menciona')));

check('relaciona la entrada que referencia a otra por su id',
  g.edges.some((e) => e.kind === 'menciona' && [e.source, e.target].includes(`e:${b.id}`) && [e.source, e.target].includes(`e:${a.id}`)));

check('marca el par casi idéntico como posible duplicado', g.stats.duplicates.length === 1, JSON.stringify(g.stats.duplicates));

const huerfana = g.nodes.find((n) => n.kind === 'entry' && n.label === 'Nota suelta');
check('la entrada sin relaciones queda aislada', huerfana && huerfana.degree === 0, JSON.stringify(huerfana));
check('cuenta cuántas entradas están aisladas', g.stats.isolated === 1, String(g.stats.isolated));

/* Vecindario (lo que expone la herramienta MCP shared_related) */

const rel = relatedEntries('grafo', { id: a.id, limit: 3 });
check('relatedEntries parte de la entrada pedida', rel.base.id === a.id);
check('el vecindario incluye a la que comparte archivo y etiqueta',
  rel.related.some((r) => r.id === b.id && r.razones.some((x) => x.startsWith('archivos'))),
  JSON.stringify(rel.related));
check('trae el motivo de cada relación', rel.related.every((r) => r.razones.length > 0));

const relHandoff = relatedEntries('grafo', {});
check('sin id, el vecindario parte del handoff', /Handoff/.test(relHandoff.base.title), JSON.stringify(relHandoff.base));

/* Diagnóstico */

const diag = insights();
const ids = diag.insights.map((i) => i.id);
check('detecta el proyecto con entradas y sin handoff', ids.includes('sin-handoff'), ids.join(', '));
check('detecta el archivo compartido entre dos proyectos', ids.includes('archivo-cruzado'), ids.join(', '));
check('detecta las entradas huérfanas', ids.includes('huerfanas'), ids.join(', '));
check('detecta los duplicados', ids.includes('duplicados'), ids.join(', '));
check('detecta el proyecto escrito por una sola app', ids.includes('una-sola-app'), ids.join(', '));
check('la salud baja cuando hay avisos', diag.score < 100 && diag.score >= 0, String(diag.score));
check('cada aviso trae un comando para arreglarlo', diag.insights.every((i) => typeof i.action === 'string' && i.action.length > 0));

const soloGrafo = insights('grafo');
check('el diagnóstico se puede acotar a un proyecto', soloGrafo.scope === 'grafo' && soloGrafo.insights.every((i) => !i.title.includes('Sin Handoff')), JSON.stringify(soloGrafo.scope));

/* Exportación */

const dot = graphToDot(g, 'grafo');
check('exporta DOT válido', dot.startsWith('digraph') && dot.trimEnd().endsWith('}') && dot.includes('->'));

const mermaid = graphToMermaid(g, 'grafo');
check('exporta Mermaid válido', mermaid.startsWith('flowchart TD') && mermaid.includes('-->') && mermaid.includes('["'));
check('Mermaid incluye etiquetas y archivos', mermaid.includes('#arquitectura') && mermaid.includes('bus.ts'));

/* La caché de similitudes no debe devolver un grafo viejo tras editar una entrada. */
{
  const antesDuplicados = g.stats.duplicates.length;
  store.writeEntry({
    project: 'Grafo',
    id: huerfana.entryId,
    title: 'Nota suelta',
    content: 'El despliegue quedó pendiente de aprobación por el equipo de seguridad y se retoma el lunes.',
    type: 'note',
  });
  const g2 = buildEntryGraph('grafo');
  check('la caché de similitudes se invalida al editar una entrada',
    g2.stats.duplicates.length > antesDuplicados,
    `${antesDuplicados} → ${g2.stats.duplicates.length}`);
  check('la entrada editada pasa a ser un posible duplicado',
    g2.stats.duplicates.some((d) => d.a === huerfana.entryId || d.b === huerfana.entryId),
    JSON.stringify(g2.stats.duplicates));
}

rmSync(home, { recursive: true, force: true });
console.log(failures === 0 ? '\nTodo OK.' : `\n${failures} prueba(s) fallaron.`);
process.exitCode = failures === 0 ? 0 : 1;
