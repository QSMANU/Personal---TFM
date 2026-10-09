#!/usr/bin/env node
/**
 * cli.js — línea de comandos del contexto compartido (`sharedctx`).
 *
 * Es el único lugar donde se cambia el modo de consentimiento y donde se
 * aprueban o rechazan publicaciones. El modelo nunca ejecuta esto: lo ejecuta
 * la persona.
 */

import { parseArgs } from 'node:util';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  MODES, approvePending, audit, clearActive, deleteEntry, describeGate, detectProject, getActive,
  getConfig, getHome, inboxDir, ingestInbox, listEntries, listPending, listProjects, readAudit,
  readEntry, rejectPending, rememberProjectIdentity, saveConfig, setActive, slugify, suggestProjects,
  findProjectMatch, writeEntry,
} from './store.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const OPTIONS = {
  project: { type: 'string', short: 'p' },
  title: { type: 'string', short: 't' },
  type: { type: 'string' },
  tags: { type: 'string' },
  files: { type: 'string' },
  content: { type: 'string', short: 'c' },
  id: { type: 'string' },
  file: { type: 'string', short: 'f' },
  limit: { type: 'string' },
  out: { type: 'string', short: 'o' },
  port: { type: 'string' },
  clipboard: { type: 'boolean' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

const HELP = `sharedctx — contexto compartido local entre herramientas de AI (opt-in)
Servidor MCP: QSMANU-LOCAL-SHARED-MCP

Estado y proyectos
  sharedctx status                          estado, modo, proyecto activo y cómo lo detectó
  sharedctx mode [off|readonly|ask|on]      ver o cambiar el consentimiento
  sharedctx use "<proyecto>"                fija el proyecto activo para TODAS las apps
  sharedctx use --clear                     vuelve a la detección automática
  sharedctx alias <proyecto> "<alias>"      enseña otro nombre para el mismo proyecto
  sharedctx projects                        proyectos, con alias y rutas conocidas
  sharedctx list [proyecto] [--limit N] [--type T]
  sharedctx show <id> [--project P]
  sharedctx audit [--limit N]               historial de accesos y cambios
  sharedctx path                            carpeta del almacén

Publicar (vos, sin depender de ninguna app)
  sharedctx add --title "..." [--project P] [--type note|decision|task|bug|question|handoff]
                [--tags a,b] [--files r1,r2] (--content "texto" | --file -|ruta | --clipboard)
  sharedctx handoff [--project P] (--content "texto" | --file -|ruta | --clipboard)
  sharedctx note [--project P]              abre el Bloc de notas y publica lo que escribas
  sharedctx ingest [--project P]            publica lo que dejaste en <almacén>\\inbox
  sharedctx inbox                           muestra la carpeta de bandeja
  sharedctx forget P <id>                   borrar una entrada

Aprobaciones (modo ask)
  sharedctx pending [--json]                publicaciones esperando tu OK
  sharedctx approve <id|all>                aprobar y publicar
  sharedctx reject <id|all>                 descartar

Integración
  sharedctx ui [--port 3120] [--open]       panel web local: estado, grafo, apps, métodos
  sharedctx export --project P --out DIR    exporta a Markdown (para ChatGPT web)
  sharedctx export --all --out DIR
  sharedctx serve --http [--port 3111]      servidor MCP por HTTP en loopback

Modos
  off       no se lee ni se escribe nada compartido
  readonly  se lee; publicar bloqueado
  ask       se lee; cada publicación queda pendiente de tu aprobación  (por defecto)
  on        se lee; se publica directo (todo queda auditado)
`;

function readStdin() {
  return new Promise((res) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => res(data));
  });
}

/** Lee el portapapeles de Windows sin dependencias. */
function readClipboard() {
  const ps = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], { encoding: 'utf8' });
  if (ps.status !== 0 || !ps.stdout) return null;
  return ps.stdout.replace(/\r?\n$/, '');
}

async function resolveContent(values) {
  if (values.clipboard) {
    const text = readClipboard();
    if (!text || !text.trim()) throw new Error('el portapapeles está vacío');
    return text;
  }
  if (values.content !== undefined) {
    return values.content === '-' ? await readStdin() : values.content;
  }
  if (values.file !== undefined) {
    if (values.file === '-') return await readStdin();
    const p = resolve(values.file);
    if (!existsSync(p)) throw new Error(`no existe el archivo: ${p}`);
    return readFileSync(p, 'utf8');
  }
  return null;
}

function requireWriteMode() {
  const cfg = getConfig();
  if (cfg.mode === 'off') {
    console.error('El contexto compartido está en modo `off`. Activalo primero:\n  sharedctx mode ask      (aprobación por publicación)\n  sharedctx mode readonly (solo lectura)');
    process.exit(2);
  }
  return cfg;
}

function printEntry(entry, { full = false } = {}) {
  console.log(`\n■ ${entry.title}`);
  console.log(`  id: ${entry.id}  ·  tipo: ${entry.type}  ·  app: ${entry.app}  ·  ${entry.createdAt}`);
  if (entry.tags?.length) console.log(`  tags: ${entry.tags.join(', ')}`);
  if (entry.files?.length) console.log(`  archivos: ${entry.files.join(', ')}`);
  if (full) console.log(`\n${entry.content.trim()}\n`);
}

function exportProject(slug, outRoot) {
  const dir = join(outRoot, slug);
  mkdirSync(join(dir, 'entries'), { recursive: true });
  const entries = listEntries(slug);
  for (const e of entries) {
    writeFileSync(join(dir, 'entries', `${e.id}.md`), readFileSync(join(getHome(), 'projects', slug, 'entries', `${e.id}.md`), 'utf8'), 'utf8');
  }
  const handoffTop = listEntries(slug, { type: 'handoff', limit: 1 })[0];
  const index = [
    `# Contexto compartido · ${slug}`,
    ``,
    `Exportado: ${new Date().toISOString()}`,
    ``,
    `## Handoff`,
    ``,
    handoffTop ? handoffTop.content.trim() : '(sin handoff)',
    ``,
    `## Entradas (${entries.length})`,
    ``,
    ...entries.map((e) => `- \`${e.id}\` · ${e.title} · ${e.type} · ${e.createdAt}${e.files.length ? ` · ${e.files.join(', ')}` : ''}`),
    ``,
    `> Todo el detalle está en ./entries/. Este export es para herramientas sin MCP (por ejemplo ChatGPT web).`,
    ``,
  ].join('\n');
  writeFileSync(join(dir, 'INDEX.md'), index, 'utf8');
  return { dir, entries: entries.length };
}

async function main() {
  const { values, positionals } = parseArgs({ args: process.argv.slice(2), options: OPTIONS, allowPositionals: true, strict: false });
  const [command = 'status', ...rest] = positionals;

  if (values.help || command === 'help') { console.log(HELP); return; }

  switch (command) {
    case 'status': {
      const cfg = getConfig();
      const detected = detectProject();
      const active = getActive();
      const match = findProjectMatch(detected.name);
      const slug = match ? match.slug : detected.slug;
      const pending = listPending();
      const entries = listEntries(slug);
      console.log(`almacén        ${getHome()}`);
      console.log(`servidor MCP   QSMANU-LOCAL-SHARED-MCP`);
      console.log(`modo           ${cfg.mode}  →  ${describeGate(cfg)}`);
      console.log(`proyecto       ${match ? match.name : detected.name} (${slug}) · detectado vía ${match ? `coincidencia por ${match.matchedBy}` : detected.source}`);
      console.log(`raíz           ${detected.root}`);
      console.log(`activo global  ${active ? `${active.name} (${active.slug})${active.note ? ` · ${active.note}` : ''}` : '(no fijado — usá: sharedctx use "<proyecto>")'}`);
      console.log(`entradas       ${entries.length}`);
      console.log(`handoff        ${listEntries(slug, { type: 'handoff', limit: 1 }).length ? 'sí' : 'no'}`);
      console.log(`pendientes     ${pending.length}`);
      console.log(`proyectos      ${listProjects().length}`);
      return;
    }

    case 'use': {
      if (process.argv.includes('--clear')) {
        clearActive();
        audit('active.clear', {});
        console.log('Proyecto activo global borrado: vuelvo a la detección automática por app.');
        return;
      }
      const wanted = values.project || rest.join(' ').trim();
      if (!wanted) {
        const active = getActive();
        if (!active) {
          console.log('No hay proyecto activo global. Uso: sharedctx use "Personal - Shared-MCP-Local"');
          const detected = detectProject();
          console.log(`(en esta carpeta se detecta: ${detected.name} · ${detected.slug})`);
          return;
        }
        console.log(`proyecto activo: ${active.name} (${active.slug}) · desde ${active.at}`);
        return;
      }
      const result = setActive(wanted, 'fijado con sharedctx use');
      audit('active.set', { project: result.slug, matchedBy: result.matchedBy });
      console.log(`proyecto activo global → ${result.name} (${result.slug}) · ${result.matchedBy}`);
      if (result.matchedBy === 'nuevo') {
        const sugerencias = suggestProjects(wanted).filter((s) => s.score >= 0.5 && s.score < 1);
        if (sugerencias.length) {
          console.log(`ojo: hay proyectos parecidos: ${sugerencias.map((s) => `${s.slug} (${Math.round(s.score * 100)}%)`).join(', ')}`);
        }
      }
      console.log('Todas las apps que no puedan detectar el proyecto por sí solas usarán este.');
      return;
    }

    case 'alias': {
      const [project, ...aliasParts] = rest;
      const alias = values.title || aliasParts.join(' ').trim();
      if (!project || !alias) {
        console.error('Uso: sharedctx alias <proyecto> "<otro nombre>"');
        process.exit(2);
      }
      const match = findProjectMatch(project);
      if (!match) {
        console.error(`No encontré el proyecto "${project}". Mirá: sharedctx projects`);
        process.exit(1);
      }
      rememberProjectIdentity(match.slug, { aliases: [alias] });
      audit('alias.add', { project: match.slug, alias });
      console.log(`alias agregado: "${alias}" → ${match.name} (${match.slug})`);
      return;
    }

    case 'mode': {
      const next = rest[0];
      if (!next) {
        const cfg = getConfig();
        console.log(`modo actual: ${cfg.mode} → ${describeGate(cfg)}`);
        console.log(`modos: ${MODES.join(' | ')}`);
        return;
      }
      if (!MODES.includes(next)) {
        console.error(`Modo inválido: ${next}. Válidos: ${MODES.join(', ')}`);
        process.exit(2);
      }
      audit('mode.change', { to: next, from: getConfig().mode });
      saveConfig({ mode: next });
      console.log(`modo → ${next}  (${describeGate(getConfig())})`);
      return;
    }

    case 'path': case 'home': {
      console.log(getHome());
      return;
    }

    case 'projects': {
      const projects = listProjects();
      if (projects.length === 0) { console.log('Todavía no hay proyectos.'); return; }
      const active = getActive();
      for (const p of projects) {
        const marca = active?.slug === p.slug ? '  ← activo' : '';
        console.log(`${p.slug.padEnd(30)} ${String(p.entries).padStart(4)} entradas   handoff: ${p.handoff ? 'sí' : 'no '}   ${p.name}${marca}`);
        if (p.aliases?.length) console.log(`${' '.repeat(30)}      alias: ${p.aliases.join(' · ')}`);
        if (p.roots?.length) console.log(`${' '.repeat(30)}      rutas: ${p.roots.join(' · ')}`);
      }
      return;
    }

    case 'list': {
      const requested = values.project || rest[0] || detectProject().name;
      const match = findProjectMatch(requested);
      const slug = match ? match.slug : slugify(requested);
      const entries = listEntries(slug, { limit: Number(values.limit) || 0, type: values.type || null });
      if (entries.length === 0) { console.log(`Sin entradas en ${slug}.`); return; }
      console.log(`# ${match ? match.name : slug} (${slug}) — ${entries.length}`);
      if (match && match.matchedBy !== 'slug') console.log(`# (emparejado por ${match.matchedBy}: "${requested}")`);
      for (const e of entries) printEntry(e);
      return;
    }

    case 'show': {
      const id = rest[0];
      if (!id) { console.error('Falta el id.'); process.exit(2); }
      const requested = values.project || detectProject().name;
      const match = findProjectMatch(requested);
      const slug = match ? match.slug : slugify(requested);
      const entry = readEntry(slug, id);
      if (!entry) { console.error(`No existe ${id} en ${slug}.`); process.exit(1); }
      printEntry(entry, { full: true });
      return;
    }

    case 'inbox': {
      console.log(inboxDir());
      return;
    }

    case 'ingest': {
      requireWriteMode();
      const project = values.project || null;
      const res = ingestInbox({ defaultProject: project, app: 'inbox' });
      if (res.processed.length === 0 && res.skipped.length === 0) {
        console.log(`No hay archivos en ${inboxDir()}.`);
        console.log('Dejá ahí un .md/.txt/.json y volvé a correr `sharedctx ingest`.');
        return;
      }
      for (const p of res.processed) {
        console.log(`${p.updated ? 'actualizado' : 'publicado'} ${p.entry.id} → ${p.slug} · ${p.entry.title} (desde ${p.name}${p.matchedBy !== 'nuevo' ? `, emparejado por ${p.matchedBy}` : ', proyecto nuevo'})`);
      }
      for (const s of res.skipped) console.log(`omitido  ${s.name} · ${s.reason}`);
      return;
    }

    case 'note': {
      requireWriteMode();
      const project = values.project || detectProject().name;
      const match = findProjectMatch(project);
      const target = match ? match.name : project;
      const file = join(tmpdir(), `sharedctx-nota-${Date.now()}.md`);
      const plantilla = [
        '---',
        `project: ${target}`,
        `type: ${values.type || 'note'}`,
        `title: `,
        'tags: ',
        'files: ',
        '---',
        '',
        '# Escribí acá qué se hizo, qué quedó pendiente y el próximo paso.',
        '# Guardá y cerrá el Bloc de notas: se publica automáticamente.',
        '',
      ].join('\r\n');
      writeFileSync(file, plantilla, 'utf8');
      console.log(`Abriendo el Bloc de notas para el proyecto "${target}"…`);
      spawnSync('notepad.exe', [file], { stdio: 'inherit' });
      const raw = readFileSync(file, 'utf8');
      const body = raw.split(/\r?\n/).filter((l) => !l.startsWith('#')).join('\n').trim();
      if (!body.replace(/---[\s\S]*?---/, '').trim()) {
        rmSync(file, { force: true });
        console.log('Nota vacía: no publiqué nada.');
        return;
      }
      writeFileSync(file, raw, 'utf8');
      const res = ingestInbox({ defaultProject: target, app: 'cli-note', move: false });
      const done = res.processed.find((p) => p.name === file.split('\\').pop());
      rmSync(file, { force: true });
      if (res.processed.length) {
        for (const p of res.processed) console.log(`publicado ${p.entry.id} → ${p.slug} · ${p.entry.title}`);
      } else {
        console.log('No se publicó nada.');
      }
      return;
    }

    case 'audit': {
      for (const row of readAudit(Number(values.limit) || 40)) {
        console.log(`${row.ts || '?'}  ${String(row.action).padEnd(26)} ${row.app || ''}  ${row.project || ''} ${row.id || row.pendingId || ''}`);
      }
      return;
    }

    case 'graph': {
      const { buildEntryGraph, graphToDot } = await import('./relations.js');
      const requested = values.project || rest[0] || detectProject().name;
      const match = findProjectMatch(requested);
      const slug = match ? match.slug : slugify(requested);
      const g = buildEntryGraph(slug, {
        includeTags: !process.argv.includes('--no-tags'),
        includeFiles: !process.argv.includes('--no-files'),
        limit: Number(values.limit) || 300,
      });
      const formato = values.type || 'text';
      if (formato === 'json') { console.log(JSON.stringify(g, null, 2)); return; }
      if (formato === 'dot') { console.log(graphToDot(g, slug)); return; }
      if (formato === 'md') {
        console.log(`# Grafo de contexto · ${match ? match.name : slug}\n`);
        console.log(`- Entradas: ${g.stats.entries} · etiquetas: ${g.stats.tags} · archivos: ${g.stats.files} · relaciones: ${g.stats.links}`);
        console.log(`- Por tipo: ${Object.entries(g.stats.byKind).map(([k, n]) => `${k}: ${n}`).join(', ') || 'sin relaciones'}`);
        console.log(`- Sin ninguna relación: ${g.stats.isolated}`);
        console.log(`\n## Entradas\n`);
        for (const n of g.nodes.filter((x) => x.kind === 'entry')) {
          console.log(`- **${n.label}** (\`${n.entryId}\`) · ${n.type} · ${n.app} · ${n.degree} relación(es)`);
        }
        if (g.stats.duplicates.length) {
          console.log(`\n## Posibles duplicados\n`);
          for (const d of g.stats.duplicates) console.log(`- ${Math.round(d.score * 100)}% · ${d.aTitle} ≈ ${d.bTitle}`);
        }
        return;
      }
      console.log(`# ${match ? match.name : slug}`);
      console.log(`entradas: ${g.stats.entries} · etiquetas: ${g.stats.tags} · archivos: ${g.stats.files} · relaciones: ${g.stats.links}`);
      console.log(`por tipo: ${Object.entries(g.stats.byKind).map(([k, n]) => `${k}: ${n}`).join(', ') || 'sin relaciones'}`);
      console.log(`sin ninguna relación: ${g.stats.isolated}`);
      const ordenadas = g.nodes.filter((x) => x.kind === 'entry').sort((a, b) => b.degree - a.degree);
      console.log('\nEntradas por cantidad de relaciones:');
      for (const n of ordenadas) {
        console.log(`  ${String(n.degree).padStart(3)}  ${n.label.slice(0, 60).padEnd(62)} ${n.type.padEnd(10)} ${n.id ?? n.entryId}`);
      }
      if (g.stats.duplicates.length) {
        console.log('\nPosibles duplicados:');
        for (const d of g.stats.duplicates) console.log(`  ${Math.round(d.score * 100)}%  ${d.aTitle} ≈ ${d.bTitle}`);
      }
      return;
    }

    case 'insights': case 'diagnostico': {
      const { insights } = await import('./relations.js');
      const requested = values.project || rest[0] || null;
      const match = requested ? findProjectMatch(requested) : null;
      const data = insights(match ? match.slug : null);
      if (values.json) { console.log(JSON.stringify(data, null, 2)); return; }
      console.log(`salud del contexto: ${data.score}/100  (${data.scope})\n`);
      if (data.insights.length === 0) { console.log('Nada para mejorar.'); return; }
      const icono = { warn: '⚠', tip: '💡', info: 'ℹ' };
      for (const i of data.insights) {
        console.log(`${icono[i.severity] || '·'} ${i.title}`);
        console.log(`   ${i.detail}`);
        for (const x of i.items.slice(0, 5)) console.log(`     · ${x.label}${x.ref ? `  [${x.ref}]` : ''}`);
        if (i.items.length > 5) console.log(`     · … y ${i.items.length - 5} más`);
        if (i.action) console.log(`   arreglo: ${i.action}`);
        console.log('');
      }
      return;
    }

    case 'pending': {
      const pending = listPending();
      if (values.json) { console.log(JSON.stringify(pending, null, 2)); return; }
      if (pending.length === 0) { console.log('No hay publicaciones pendientes.'); return; }
      console.log(`${pending.length} publicación(es) esperando tu aprobación:\n`);
      for (const p of pending) {
        console.log(`■ ${p.title}   [${p.id}]`);
        console.log(`  proyecto: ${p.project}  ·  tipo: ${p.type}  ·  pedido por: ${p.app}  ·  ${p.createdAt}`);
        const preview = p.content.trim().split('\n').slice(0, 6).join('\n    ');
        console.log(`    ${preview}${p.content.trim().split('\n').length > 6 ? '\n    …' : ''}\n`);
      }
      console.log('Aprobar:  sharedctx approve <id>   |   todo: sharedctx approve all');
      console.log('Descartar: sharedctx reject <id>   |   todo: sharedctx reject all');
      return;
    }

    case 'approve': {
      const target = rest[0] || 'all';
      const done = approvePending(target === 'all' ? 'all' : [target]);
      if (done.length === 0) { console.log('No había nada que aprobar con ese id.'); return; }
      for (const e of done) console.log(`aprobado y publicado: ${e.id}  (${e.title}) → proyecto ${e.project}`);
      return;
    }

    case 'reject': {
      const target = rest[0] || 'all';
      const done = rejectPending(target === 'all' ? 'all' : [target]);
      console.log(`descartadas: ${done.length}`);
      return;
    }

    case 'forget': {
      requireWriteMode();
      const [project, id] = rest;
      if (!project || !id) { console.error('Uso: sharedctx forget <proyecto> <id>'); process.exit(2); }
      const match = findProjectMatch(project);
      const slug = match ? match.slug : slugify(project);
      const ok = deleteEntry(slug, id);
      audit('forget.cli', { project: slug, id, ok });
      console.log(ok ? `borrada ${id} de ${slug}` : `no existe ${id} en ${slug}`);
      return;
    }

    case 'add': {
      requireWriteMode();
      const content = await resolveContent(values);
      if (content === null) { console.error('Falta --content, --file o --clipboard.'); process.exit(2); }
      if (!values.title) { console.error('Falta --title.'); process.exit(2); }
      const auto = detectProject();
      const requested = values.project || auto.name;
      const match = findProjectMatch(requested);
      const project = match ? match.name : requested;
      const entry = writeEntry({
        project,
        root: values.project ? null : auto.root,
        id: values.id || null,
        title: values.title,
        content,
        type: values.type || 'note',
        tags: values.tags ? values.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
        files: values.files ? values.files.split(',').map((s) => s.trim()).filter(Boolean) : [],
        app: 'cli',
      });
      audit('publish.cli', { project: entry.project, id: entry.id, type: entry.type });
      if (match && match.matchedBy !== 'slug') console.log(`(emparejado con "${match.name}" por ${match.matchedBy})`);
      if (!match) {
        const sugerencias = suggestProjects(requested).filter((s) => s.score >= 0.5 && s.score < 1);
        if (sugerencias.length) console.log(`ojo: hay proyectos parecidos: ${sugerencias.map((s) => s.slug).join(', ')}`);
      }
      console.log(`${entry.updated ? 'actualizado' : 'publicado'} ${entry.id} en ${entry.project} (${entry.type})`);
      return;
    }

    case 'handoff': {
      requireWriteMode();
      const content = await resolveContent(values);
      if (content === null) { console.error('Falta --content, --file o --clipboard.'); process.exit(2); }
      const auto = detectProject();
      const requested = values.project || auto.name;
      const match = findProjectMatch(requested);
      const project = match ? match.name : requested;
      const entry = writeEntry({
        project,
        root: values.project ? null : auto.root,
        title: values.title || `Handoff · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        content,
        type: 'handoff',
        tags: values.tags ? values.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
        files: values.files ? values.files.split(',').map((s) => s.trim()).filter(Boolean) : [],
        app: 'cli',
      });
      audit('handoff.cli', { project: entry.project, id: entry.id });
      if (match && match.matchedBy !== 'slug') console.log(`(emparejado con "${match.name}" por ${match.matchedBy})`);
      console.log(`handoff actualizado en ${entry.project} (${entry.id})`);
      return;
    }

    case 'export': {
      const out = resolve(values.out || join(process.cwd(), 'shared-context-export'));
      mkdirSync(out, { recursive: true });
      if (!values.project && !rest[0] && !process.argv.includes('--all')) {
        console.error('Indicá --project P o --all.');
        process.exit(2);
      }
      const slugs = process.argv.includes('--all')
        ? listProjects().map((p) => p.slug)
        : [(() => { const m = findProjectMatch(values.project || rest[0]); return m ? m.slug : slugify(values.project || rest[0]); })()];
      for (const slug of slugs) {
        const res = exportProject(slug, out);
        console.log(`exportado ${slug}: ${res.entries} entradas → ${res.dir}`);
      }
      return;
    }

    case 'serve': {
      const script = join(HERE, process.argv.includes('--http') ? 'http.js' : 'stdio.js');
      const args = [script];
      if (values.port) args.push('--port', String(values.port));
      const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
      child.on('exit', (code) => process.exit(code ?? 0));
      return;
    }

    case 'ui': case 'dashboard': case 'panel': {
      const dash = await import('./dashboard.js');
      const port = Number(values.port) || getConfig().dashboardPort || 3120;

      if (process.argv.includes('--status')) {
        const corriendo = await dash.panelRunning(port);
        const tarea = dash.taskStatus();
        console.log(`panel:         ${corriendo ? `CORRIENDO en ${corriendo.url}` : 'detenido'}`);
        console.log(`arranque auto: ${tarea.installed ? `instalado vía ${tarea.method}${tarea.name ? ` ("${tarea.name}")` : ''}` : 'NO instalado'}`);
        if (!tarea.installed) console.log('               instalalo con:  sharedctx ui --install');
        return;
      }

      if (process.argv.includes('--install')) {
        const res = dash.installAutostart({ port });
        if (!res.ok) { console.error(`No pude registrar el arranque automático: ${res.error}`); process.exit(1); }
        console.log(`arranque automático instalado vía ${res.method}`);
        if (res.nota) console.log(`nota: ${res.nota}`);
        console.log(`lanzador: ${res.cmd}`);
        console.log(`log:      ${res.log}`);
        const corriendo = await dash.panelRunning(port);
        if (corriendo) {
          console.log(`el panel ya estaba corriendo en ${corriendo.url}`);
        } else {
          const arranque = dash.runTaskNow();
          await new Promise((r) => setTimeout(r, 1800));
          const ahora = await dash.panelRunning(port);
          console.log(ahora
            ? `panel arrancado ahora (${arranque.via}): ${ahora.url}`
            : `todavía no responde (${arranque.error || 'sin detalle'}); revisá ${res.log}`);
        }
        return;
      }

      if (process.argv.includes('--uninstall')) {
        const res = dash.uninstallAutostart();
        console.log(res.ok ? `arranque automático quitado (${res.task} · ${res.runKey})` : `no había nada registrado`);
        return;
      }

      const ya = await dash.panelRunning(port);
      if (ya) {
        console.log(`El panel ya está corriendo en ${ya.url}`);
        if (process.argv.includes('--open')) spawn('cmd', ['/c', 'start', '', ya.url], { detached: true, stdio: 'ignore' }).unref();
        return;
      }
      const { url, server } = await dash.startDashboard({ port, open: process.argv.includes('--open') });
      console.log(`Panel del contexto compartido: ${url}`);
      console.log(`Almacén: ${getHome()} · modo: ${getConfig().mode}`);
      console.log('Ctrl+C para detener.  (para que arranque solo:  sharedctx ui --install)');
      const cerrar = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 800); };
      process.on('SIGINT', cerrar);
      process.on('SIGTERM', cerrar);
      return;
    }

    case 'install': {
      const ps = join(HERE, '..', 'install.ps1');
      if (!existsSync(ps)) { console.error(`No encuentro install.ps1 en ${ps}`); process.exit(1); }
      const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps, ...rest], { stdio: 'inherit' });
      child.on('exit', (code) => process.exit(code ?? 0));
      return;
    }

    default:
      console.error(`Comando desconocido: ${command}\n`);
      console.log(HELP);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
