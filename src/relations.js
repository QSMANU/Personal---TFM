/**
 * relations.js — convierte las entradas de contexto en un grafo navegable y en
 * un diagnóstico de "qué conviene arreglar" para que el contexto sea más útil.
 *
 * Relaciones que deduce (sin pedir nada extra al usuario):
 *   tag       dos entradas comparten etiqueta (vía nodo de tag)
 *   file      dos entradas referencian el mismo archivo (vía nodo de archivo)
 *   menciona  una entrada nombra a la otra (por id, [[título]] o título exacto)
 *   similar   contenido muy parecido → posible duplicado
 *
 * Los "insights" son el otro producto de esto: detecta contexto huérfano,
 * duplicados, proyectos sin handoff, archivos compartidos entre proyectos y
 * vocabulario de tags inconsistente. Cada uno trae el comando para arreglarlo.
 */

import {
  listEntries, listProjects, listPending, similarity, slugify, getHandoff,
} from './store.js';

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Texto comparable de una entrada: título + comienzo del cuerpo. */
function fingerprint(entry) {
  return `${norm(entry.title)} ${norm(entry.content).slice(0, 400)}`;
}

function extractMentions(entry, others) {
  const out = new Set();
  const contenido = entry.content || '';
  const links = [...contenido.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
  for (const otro of others) {
    if (otro.id === entry.id) continue;
    if (contenido.includes(otro.id)) { out.add(otro.id); continue; }
    if (links.some((l) => norm(l) === norm(otro.title))) { out.add(otro.id); continue; }
    const t = norm(otro.title);
    if (t.length >= 12 && norm(contenido).includes(t)) out.add(otro.id);
  }
  return [...out];
}

/**
 * Grafo de entradas de un proyecto.
 * @returns {{nodes:Array, edges:Array, stats:Object}}
 */
export function buildEntryGraph(slug, { includeTags = true, includeFiles = true, limit = 300, similarityThreshold = 0.6 } = {}) {
  const todas = listEntries(slug);
  const entries = todas.slice(0, limit);
  const nodes = [];
  const edges = [];
  const edgeKey = new Set();

  const addEdge = (source, target, kind, weight = 1) => {
    const key = [source, target].sort().join('|') + kind;
    if (edgeKey.has(key)) return;
    edgeKey.add(key);
    edges.push({ source, target, kind, weight });
  };

  for (const e of entries) {
    nodes.push({
      id: `e:${e.id}`,
      kind: 'entry',
      label: e.title,
      entryId: e.id,
      type: e.type,
      app: e.app,
      createdAt: e.createdAt,
      tags: e.tags,
      files: e.files,
      chars: e.chars,
      project: slug,
    });
  }

  const tags = new Map();
  const files = new Map();
  for (const e of entries) {
    for (const t of e.tags) {
      const id = `t:${norm(t)}`;
      if (!tags.has(id)) tags.set(id, { id, kind: 'tag', label: t, weight: 0 });
      tags.get(id).weight += 1;
      if (includeTags) addEdge(`e:${e.id}`, id, 'tag');
    }
    for (const f of e.files) {
      const id = `f:${norm(f)}`;
      if (!files.has(id)) files.set(id, { id, kind: 'file', label: f.split(/[\\/]/).pop() || f, full: f, weight: 0 });
      files.get(id).weight += 1;
      if (includeFiles) addEdge(`e:${e.id}`, id, 'file');
    }
  }
  if (includeTags) nodes.push(...tags.values());
  if (includeFiles) nodes.push(...files.values());

  // Menciones explícitas entre entradas
  const porId = new Map(entries.map((e) => [e.id, e]));
  for (const e of entries) {
    for (const objetivo of extractMentions(e, entries)) {
      if (porId.has(objetivo)) addEdge(`e:${e.id}`, `e:${objetivo}`, 'menciona', 2);
    }
  }

  // Similitud (posible duplicado). Con muchas entradas se acota a las más recientes.
  const candidatas = entries.length > 400 ? entries.slice(0, 400) : entries;
  const similares = [];
  for (let i = 0; i < candidatas.length; i += 1) {
    for (let j = i + 1; j < candidatas.length; j += 1) {
      const score = similarity(fingerprint(candidatas[i]), fingerprint(candidatas[j]));
      if (score >= similarityThreshold) {
        addEdge(`e:${candidatas[i].id}`, `e:${candidatas[j].id}`, 'similar', score);
        similares.push({ a: candidatas[i].id, b: candidatas[j].id, aTitle: candidatas[i].title, bTitle: candidatas[j].title, score });
      }
    }
  }

  const grados = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    grados.set(e.source, (grados.get(e.source) || 0) + 1);
    grados.set(e.target, (grados.get(e.target) || 0) + 1);
  }
  for (const n of nodes) n.degree = grados.get(n.id) || 0;

  return {
    project: slug,
    nodes,
    edges,
    stats: {
      entries: entries.length,
      tags: tags.size,
      files: files.size,
      links: edges.length,
      byKind: edges.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc; }, {}),
      isolated: nodes.filter((n) => n.kind === 'entry' && n.degree === 0).length,
      duplicates: similares.sort((x, y) => y.score - x.score),
    },
  };
}

/**
 * Entradas más relacionadas con una dada (o con el handoff del proyecto).
 * Es lo que expone la herramienta MCP `shared_related`: traer el vecindario
 * justo en vez de todo el contexto.
 */
export function relatedEntries(slug, { id = null, limit = 6 } = {}) {
  const entries = listEntries(slug);
  if (entries.length === 0) return { base: null, related: [] };
  const base = id ? entries.find((e) => e.id === id) : (getHandoff(slug) || entries[0]);
  if (!base) return { base: null, related: [] };

  const baseTags = new Set(base.tags.map(norm));
  const baseFiles = new Set(base.files.map(norm));
  const baseFp = fingerprint(base);

  const puntuados = entries
    .filter((e) => e.id !== base.id)
    // Excluye la copia con el mismo contenido que la base (los handoff viven en
    // entries/ y además en handoff.md: no son "relacionados", son el mismo texto).
    .filter((e) => similarity(baseFp, fingerprint(e)) < 0.97)
    .map((e) => {
      const tagsComunes = e.tags.map(norm).filter((t) => baseTags.has(t));
      const filesComunes = e.files.map(norm).filter((f) => baseFiles.has(f));
      const menciona = (base.content || '').includes(e.id) || (e.content || '').includes(base.id);
      const sim = similarity(baseFp, fingerprint(e));
      const score = tagsComunes.length * 3 + filesComunes.length * 4 + (menciona ? 3 : 0) + sim * 2;
      const razones = [];
      if (tagsComunes.length) razones.push(`tags: ${tagsComunes.join(', ')}`);
      if (filesComunes.length) razones.push(`archivos: ${filesComunes.join(', ')}`);
      if (menciona) razones.push('se mencionan');
      if (sim >= 0.5) razones.push(`contenido parecido (${Math.round(sim * 100)}%)`);
      // Nunca devolvemos una relación sin motivo: si el peso vino solo de una
      // similitud baja, la etiquetamos igual.
      if (razones.length === 0) razones.push(`contenido apenas parecido (${Math.round(sim * 100)}%)`);
      return { entry: e, score, razones };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    base: { id: base.id, title: base.title, type: base.type },
    related: puntuados.map((p) => ({
      id: p.entry.id,
      title: p.entry.title,
      type: p.entry.type,
      app: p.entry.app,
      createdAt: p.entry.createdAt,
      razones: p.razones,
      score: Number(p.score.toFixed(2)),
    })),
  };
}

/* ------------------------------------------------------------- diagnóstico */

const DIAS_VIEJO = 45;

/**
 * Qué conviene arreglar para que el contexto rinda más (y el MCP sea más útil).
 * @returns {{scope:string, score:number, insights:Array}}
 */
export function insights(slug = null) {
  const proyectos = slug ? listProjects().filter((p) => p.slug === slug) : listProjects();
  const salida = [];

  // 1. Proyectos con contexto pero sin handoff: lo primero que lee la próxima app.
  const sinHandoff = proyectos.filter((p) => p.entries > 0 && !p.handoff);
  if (sinHandoff.length) {
    salida.push({
      id: 'sin-handoff', severity: 'warn',
      title: `${sinHandoff.length} proyecto(s) con entradas pero sin handoff`,
      detail: 'El handoff es lo primero que lee otra herramienta al retomar. Sin él, el modelo tiene que adivinar por dónde ibas.',
      items: sinHandoff.map((p) => ({ label: p.name, ref: p.slug })),
      action: slug ? `sharedctx handoff --project "${slug}" --file <archivo.md>` : 'sharedctx handoff --project "<proyecto>" --file <archivo.md>',
    });
  }

  // 2. Proyectos con contexto de una sola app (no se está aprovechando el compartir).
  const unaApp = proyectos.filter((p) => p.entries > 1 && Object.keys(projectAppCount(p.slug)).length === 1);
  if (unaApp.length) {
    salida.push({
      id: 'una-sola-app', severity: 'tip',
      title: `${unaApp.length} proyecto(s) con contexto de una sola herramienta`,
      detail: 'Todo el contexto lo escribió la misma app. Si vas a saltar de herramienta, publicá el handoff desde la otra para validar que se lee bien.',
      items: unaApp.map((p) => ({ label: `${p.name} · ${Object.keys(projectAppCount(p.slug))[0]}`, ref: p.slug })),
      action: 'sharedctx projects',
    });
  }

  // 3. Archivos compartidos entre proyectos distintos: riesgo de contexto partido.
  const porArchivo = new Map();
  for (const p of proyectos) {
    for (const e of listEntries(p.slug)) {
      for (const f of e.files) {
        const k = norm(f);
        if (!porArchivo.has(k)) porArchivo.set(k, new Set());
        porArchivo.get(k).add(p.slug);
      }
    }
  }
  const cruzados = [...porArchivo.entries()].filter(([, set]) => set.size > 1);
  if (cruzados.length) {
    salida.push({
      id: 'archivo-cruzado', severity: 'warn',
      title: `${cruzados.length} archivo(s) referenciados por más de un proyecto`,
      detail: 'El mismo archivo vive en dos contextos separados: o son el mismo proyecto con dos nombres, o el contexto está repartido.',
      items: cruzados.slice(0, 10).map(([f, set]) => ({ label: f, ref: [...set].join(' ↔ ') })),
      action: 'sharedctx alias "<proyecto A>" "<proyecto B>"   (para unificarlos)',
    });
  }

  // 4. Por proyecto: huérfanas, sin tags, duplicados, viejas.
  const detalles = proyectos.map((p) => {
    // Para detectar huérfanas hay que mirar TODAS las relaciones (tags y archivos incluidos).
    const g = buildEntryGraph(p.slug, { includeTags: true, includeFiles: true, limit: 200 });
    const entries = listEntries(p.slug);
    const huerfanas = g.nodes.filter((n) => n.kind === 'entry' && n.degree === 0);
    const sinTags = entries.filter((e) => e.tags.length === 0);
    const viejas = entries.filter((e) => e.type !== 'handoff' && e.createdAt
      && (Date.now() - Date.parse(e.createdAt)) / 86400000 > DIAS_VIEJO);
    // Dos handoffs distintos del mismo proyecto son historia, no un duplicado a limpiar.
    const duplicados = g.stats.duplicates.filter((d) => {
      const a = entries.find((e) => e.id === d.a);
      const b = entries.find((e) => e.id === d.b);
      return !(a?.type === 'handoff' && b?.type === 'handoff');
    });
    return { proyecto: p, huerfanas, sinTags, viejas, duplicados };
  });

  const conHuerfanas = detalles.filter((d) => d.huerfanas.length > 0);
  if (conHuerfanas.length) {
    const total = conHuerfanas.reduce((a, d) => a + d.huerfanas.length, 0);
    salida.push({
      id: 'huerfanas', severity: 'warn',
      title: `${total} entrada(s) sin ninguna relación`,
      detail: 'No comparten etiquetas, ni archivos, ni se mencionan con otras: son las más difíciles de recuperar después. Agregales tags/archivos o publicalas de nuevo agrupadas.',
      items: conHuerfanas.flatMap((d) => d.huerfanas.slice(0, 5).map((n) => ({ label: `${d.proyecto.name} · ${n.label}`, ref: n.entryId }))),
      action: 'sharedctx list "<proyecto>"',
    });
  }

  const duplicados = detalles.flatMap((d) => d.duplicados.slice(0, 3).map((x) => ({ ...x, proyecto: d.proyecto.slug })));
  if (duplicados.length) {
    salida.push({
      id: 'duplicados', severity: 'tip',
      title: `${duplicados.length} par(es) de entradas muy parecidas`,
      detail: 'Probablemente la misma idea publicada dos veces (por ejemplo al reintentar). Unificar deja el contexto más limpio.',
      items: duplicados.map((d) => ({ label: `${Math.round(d.score * 100)}% · ${d.aTitle} ≈ ${d.bTitle}`, ref: `${d.a} / ${d.b}` })),
      action: 'sharedctx forget <proyecto> <id>',
    });
  }

  const sinTags = detalles.reduce((a, d) => a + d.sinTags.length, 0);
  const totalEntradas = detalles.reduce((a, d) => a + d.proyecto.entries, 0);
  if (totalEntradas > 5 && sinTags / totalEntradas > 0.5) {
    salida.push({
      id: 'sin-tags', severity: 'tip',
      title: `${sinTags} de ${totalEntradas} entradas sin etiquetas`,
      detail: 'Las etiquetas son lo que conecta entradas entre sí y entre proyectos: son la diferencia entre buscar y encontrar.',
      items: [],
      action: 'sharedctx add --tags arquitectura,decisiones ...',
    });
  }

  const viejas = detalles.reduce((a, d) => a + d.viejas.length, 0);
  if (viejas > 0) {
    salida.push({
      id: 'viejas', severity: 'info',
      title: `${viejas} entrada(s) con más de ${DIAS_VIEJO} días`,
      detail: 'Revisá si siguen vigentes o si conviene reemplazarlas por un handoff actualizado.',
      items: [],
      action: 'sharedctx list --type note',
    });
  }

  // 5. Pendientes viejos.
  const pendientes = listPending().filter((p) => (Date.now() - Date.parse(p.createdAt)) / 86400000 > 7);
  if (pendientes.length) {
    salida.push({
      id: 'pendientes-viejos', severity: 'warn',
      title: `${pendientes.length} publicación(es) esperando aprobación hace más de una semana`,
      detail: 'Quedaron a medio camino: aprobarlas o descartarlas.',
      items: pendientes.map((p) => ({ label: p.title, ref: p.id })),
      action: 'sharedctx pending',
    });
  }

  const orden = { warn: 0, tip: 1, info: 2 };
  salida.sort((a, b) => orden[a.severity] - orden[b.severity]);
  const descuento = salida.reduce((a, i) => a + (i.severity === 'warn' ? 12 : i.severity === 'tip' ? 5 : 2), 0);

  return {
    scope: slug || 'todos los proyectos',
    score: Math.max(0, 100 - descuento),
    insights: salida,
  };
}

function projectAppCount(slug) {
  const acc = {};
  for (const e of listEntries(slug)) acc[e.app] = (acc[e.app] || 0) + 1;
  return acc;
}

/** Exporta el grafo para otras herramientas (Graphviz, Obsidian, etc.). */
export function graphToDot(graph, title = 'contexto') {
  const esc = (s) => String(s).replace(/"/g, '\\"');
  const colores = { entry: '#6ea8fe', tag: '#3ddc97', file: '#c792ea' };
  const lineas = [`digraph "${esc(title)}" {`, '  graph [bgcolor="#0f1115", fontname="Segoe UI"];', '  node [style=filled, fontcolor="#e6e8ee", fontname="Segoe UI", color="#2a2f3a"];', '  edge [color="#3a4356"];'];
  for (const n of graph.nodes) {
    lineas.push(`  "${esc(n.id)}" [label="${esc(n.label)}", fillcolor="${colores[n.kind] || '#888'}"${n.kind === 'entry' ? '22' : '55'}];`);
  }
  for (const e of graph.edges) {
    const estilo = e.kind === 'similar' ? ' [style=dashed, color="#ff6b6b"]' : e.kind === 'menciona' ? ' [color="#ffc857"]' : '';
    lineas.push(`  "${esc(e.source)}" -> "${esc(e.target)}"${estilo};`);
  }
  lineas.push('}');
  return lineas.join('\n');
}

export { slugify };
