#!/usr/bin/env node
/**
 * import-context-mcp.mjs — importa (opcional, una sola vez) el contexto que ya
 * tenías en el servidor de terceros `context-mcp` (~/.context-mcp) hacia el
 * almacén nuevo, respetando la separación por proyecto.
 *
 * Elegís qué entra:
 *
 *   node tools/import-context-mcp.mjs --list                 # ver qué hay, sin tocar nada
 *   node tools/import-context-mcp.mjs --interactive          # te pregunta proyecto por proyecto
 *   node tools/import-context-mcp.mjs --only personal-tfm,tao-deepwiki
 *   node tools/import-context-mcp.mjs --all --exclude casa-meco
 *   node tools/import-context-mcp.mjs --all --since 2026-10-01
 *   node tools/import-context-mcp.mjs --all --types decision,note --dry-run
 *
 * No borra ni modifica nada del almacén viejo.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { getConfig, getHome, listEntries, slugify, writeEntry } from '../src/store.js';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : null;
};
const listOf = (flag) => {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flag && argv[i + 1]) out.push(...argv[i + 1].split(',').map((s) => slugify(s.trim())).filter(Boolean));
  }
  return out;
};

const dryRun = has('--dry-run');
const onlyList = has('--list');
const interactive = has('--interactive');
const all = has('--all');
const only = new Set([...listOf('--only'), ...(valueOf('--project') ? [slugify(valueOf('--project'))] : [])]);
const exclude = new Set(listOf('--exclude'));
const since = valueOf('--since') ? Date.parse(valueOf('--since')) : null;
const types = new Set(listOf('--types'));
const keepLegacyHandoff = !has('--no-synthetic-handoff');

const legacyHome = valueOf('--home') || join(homedir(), '.context-mcp');

if (!all && !onlyList && !interactive && only.size === 0) {
  console.log('Elegí qué importar:\n');
  console.log('  --list                          ver los proyectos del almacén viejo (no escribe nada)');
  console.log('  --interactive                   te pregunta proyecto por proyecto');
  console.log('  --only personal-tfm,tao-deepwiki  solo esos');
  console.log('  --all [--exclude x,y] [--since 2026-10-01] [--types decision,note]');
  console.log('\nCon --dry-run ves el resultado sin escribir.');
  process.exit(2);
}

if (!existsSync(legacyHome)) {
  console.error(`No existe el almacén viejo: ${legacyHome}`);
  process.exit(1);
}

const cfg = getConfig();
if (cfg.mode === 'off' && !dryRun && !onlyList) {
  console.error('El contexto compartido está en modo `off`. Activá al menos `sharedctx mode readonly` y volvé a intentar.');
  process.exit(2);
}

/* ------------------------------------------------------- leer almacén viejo */

const projectsFile = join(legacyHome, 'projects.json');
let legacyProjects = [];
if (existsSync(projectsFile)) {
  try {
    legacyProjects = JSON.parse(readFileSync(projectsFile, 'utf8')).projects || [];
  } catch (err) {
    console.error(`No pude leer ${projectsFile}: ${err.message}`);
    process.exit(1);
  }
}

const dirs = existsSync(join(legacyHome, 'projects')) ? readdirSync(join(legacyHome, 'projects')) : [];
for (const dir of dirs) {
  if (!legacyProjects.some((p) => p.dataDir === `projects/${dir}`)) {
    legacyProjects.push({ name: dir, dataDir: `projects/${dir}`, rootPath: null });
  }
}

function loadEntries(project) {
  const contextFile = join(legacyHome, project.dataDir, 'context.json');
  if (!existsSync(contextFile)) return null;
  try {
    const entries = JSON.parse(readFileSync(contextFile, 'utf8')).entries || [];
    return entries.filter((e) => (e.status || 'active') === 'active' && e.content);
  } catch {
    return null;
  }
}

const catalogo = legacyProjects
  .map((p) => {
    const entries = loadEntries(p);
    const slug = slugify(p.name);
    const nuevas = entries ? entries.filter((e) => !since || Date.parse(e.createdAt || 0) >= since).length : 0;
    const ultima = entries?.length ? entries.map((e) => e.createdAt).filter(Boolean).sort().at(-1) : null;
    return { project: p, slug, entries, total: entries?.length || 0, seleccionables: nuevas, ultima };
  })
  .filter((c) => c.entries && c.entries.length > 0)
  .sort((a, b) => String(b.ultima).localeCompare(String(a.ultima)));

if (catalogo.length === 0) {
  console.log(`No hay contexto importable en ${legacyHome}.`);
  process.exit(0);
}

if (onlyList) {
  console.log(`Proyectos en el almacén viejo (${legacyHome}):\n`);
  for (const c of catalogo) {
    const ya = listEntries(c.slug).length;
    console.log(`${c.slug.padEnd(28)} ${String(c.total).padStart(4)} entradas   última: ${String(c.ultima).slice(0, 10)}   ya en el nuevo: ${ya}   ${c.project.name}`);
    if (c.project.rootPath) console.log(`${' '.repeat(28)}      ruta: ${c.project.rootPath}`);
  }
  console.log(`\nEjemplos:`);
  console.log(`  node tools\\import-context-mcp.mjs --only ${catalogo[0].slug}`);
  console.log(`  node tools\\import-context-mcp.mjs --interactive`);
  process.exit(0);
}

/* ------------------------------------------------------------- selección */

const MAP_TYPES = new Map([
  ['note', 'note'], ['bug', 'bug'], ['decision', 'decision'], ['task', 'task'],
  ['todo', 'task'], ['question', 'question'], ['snippet', 'snippet'],
  ['reference', 'reference'], ['handoff', 'handoff'], ['summary', 'note'],
]);

let seleccion = catalogo;
if (interactive) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('Proyecto por proyecto: responder s (sí) / n (no) / t (todos) / q (salir)\n');
  seleccion = [];
  for (const c of catalogo) {
    const ya = listEntries(c.slug).length;
    const answer = (await rl.question(
      `¿Importar ${c.project.name} (${c.slug})? ${c.total} entradas, última ${String(c.ultima).slice(0, 10)}${ya ? `, ya hay ${ya}` : ''} [s/n/t/q] `,
    )).trim().toLowerCase();
    if (answer === 'q') break;
    if (answer === 't') { seleccion = seleccion.concat(catalogo.slice(catalogo.indexOf(c))); break; }
    if (answer === 's' || answer === 'si' || answer === 'sí' || answer === 'y') seleccion.push(c);
  }
  rl.close();
  if (seleccion.length === 0) { console.log('\nNo elegiste ningún proyecto: no importé nada.'); process.exit(0); }
} else {
  seleccion = catalogo.filter((c) => {
    if (exclude.has(c.slug)) return false;
    if (only.size > 0) return only.has(c.slug);
    return all;
  });
}

if (seleccion.length === 0) {
  console.log('Ningún proyecto coincidió con la selección. Probá --list para ver los slugs.');
  process.exit(0);
}

console.log(`\n${dryRun ? '[simulación] ' : ''}Proyectos elegidos: ${seleccion.map((c) => c.slug).join(', ')}\n`);

/* --------------------------------------------------------------- importar */

let importedEntries = 0;
let importedProjects = 0;
let skipped = 0;

for (const c of seleccion) {
  const active = c.entries.filter((e) => (!since || Date.parse(e.createdAt || 0) >= since)
    && (types.size === 0 || types.has(MAP_TYPES.get(String(e.type || 'note').toLowerCase()) || 'note')));
  if (active.length === 0) { console.log(`${c.slug.padEnd(28)} (nada que importar con esos filtros)`); continue; }

  const existing = new Set(listEntries(c.slug).map((e) => e.id));
  let nuevos = 0;

  for (const entry of active.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    if (existing.has(entry.id)) { skipped += 1; continue; }
    const partes = [entry.content];
    if (entry.why) partes.push(`**Por qué:** ${entry.why}`);
    if (entry.outcome) partes.push(`**Resultado:** ${entry.outcome}`);

    if (!dryRun) {
      writeEntry({
        id: entry.id,
        project: c.project.name,
        title: entry.title || '(sin título)',
        content: partes.join('\n\n'),
        type: MAP_TYPES.get(String(entry.type || 'note').toLowerCase()) || 'note',
        tags: entry.tags || [],
        files: entry.files || [],
        app: `context-mcp/${entry.source || 'desconocido'}`,
        createdAt: entry.createdAt || null,
      });
    }
    nuevos += 1;
    importedEntries += 1;
  }

  if (keepLegacyHandoff && active.length > 0) {
    const handoffId = `migrado-${c.slug}`;
    if (!existing.has(handoffId)) {
      const ultimas = active.slice(-3).reverse().map((e) => `- ${e.title} (${String(e.createdAt).slice(0, 10)})`);
      const contenido = [
        `Contexto migrado desde \`context-mcp\` (${legacyHome}) el ${new Date().toISOString().slice(0, 10)}.`,
        ``,
        `Últimas entradas migradas de este proyecto:`,
        ...ultimas,
        ``,
        `Total migrado en esta corrida: ${nuevos} entradas. El detalle completo: \`sharedctx list ${c.slug}\`.`,
        c.project.rootPath ? `Raíz original del proyecto: \`${c.project.rootPath}\`` : null,
      ].filter(Boolean).join('\n');
      if (!dryRun) {
        writeEntry({
          id: handoffId,
          project: c.project.name,
          title: `Handoff migrado · ${c.project.name}`,
          content: contenido,
          type: 'handoff',
          tags: ['migracion'],
          app: 'context-mcp/migracion',
          createdAt: null,
        });
      }
    }
  }

  importedProjects += 1;
  console.log(`${dryRun ? '[dry-run] ' : ''}${c.slug.padEnd(28)} ${String(nuevos).padStart(3)} entradas importadas de ${c.total}`);
}

console.log(`\n${dryRun ? 'Simulación: ' : ''}proyectos: ${importedProjects} · entradas: ${importedEntries} · ya existentes/omitidas: ${skipped}`);
console.log(`Destino: ${getHome()}`);
if (dryRun) console.log('Volvé a correrlo sin --dry-run para escribir.');
