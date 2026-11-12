// Reviewed data changes use the same pending/approve gate as publications.
// Old entries remain byte-exact, compressed and readable by ID in their own project.
import { existsSync, readFileSync, mkdirSync, rmSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import {
  getHome, getConfig, getProject, projectDir, entriesDir, handoffPath, pendingRoot,
  containedPath, assertSafeId, newEntryId, serializeEntry, writeAtomicSync, audit,
} from './store.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const snapshot = file => existsSync(file) ? readFileSync(file) : null;
const same = (a, b) => a === null ? b === null : b !== null && a.equals(b);
export function archivePath(project, id) {
  if (assertSafeId(id) !== id) throw new Error('ID debe estar normalizado.');
  const base = projectDir(project);
  return containedPath(base, join(base, 'archive', `${id}.md.gz`));
}
function entryPath(project, id) {
  if (assertSafeId(id) !== id) throw new Error('ID debe estar normalizado.');
  const base = entriesDir(project);
  return containedPath(base, join(base, `${id}.md`));
}
function requireProject(project) {
  projectDir(project);
  if (!getProject(project)) throw new Error('Proyecto existente requerido: ' + project);
}
function validArray(values, name) {
  if (!Array.isArray(values) || values.length > 100 || values.some(v => typeof v !== 'string' || /[\r\n]/.test(v) || v.length > 2000)) throw new Error(name + ': array de textos acotados requerido.');
}

// Prepare every output and check every source before writing anything.
export function prepareMaintenance(plan) {
  if (plan?.version !== 1 || !Array.isArray(plan.changes) || !plan.changes.length || plan.changes.length > 50) throw new Error('Plan de mantenimiento inválido.');
  requireProject(plan.project);
  if (typeof plan.title !== 'string' || !plan.title.trim() || /[\r\n]/.test(plan.title) || plan.title.length > 200) throw new Error('Título de plan inválido.');
  const changes = new Map(), sourceKeys = new Set();
  const stage = (file, after) => {
    if (changes.has(file)) throw new Error('Destino repetido en el plan: ' + file);
    changes.set(file, { file, before: snapshot(file), after });
  };
  const source = change => {
    requireProject(change.project);
    const file = entryPath(change.project, change.id), raw = snapshot(file);
    if (!raw || typeof change.expectedHash !== 'string' || hash(raw) !== change.expectedHash) throw new Error('Fuente cambió o falta: ' + change.project + '/' + change.id);
    const key = change.project + '/' + change.id;
    if (sourceKeys.has(key)) throw new Error('Fuente repetida: ' + key);
    sourceKeys.add(key);
    return { file, raw };
  };
  for (const change of plan.changes) {
    requireProject(change.project);
    if (change.kind === 'move') {
      const { file, raw } = source(change);
      requireProject(change.targetProject);
      if (change.targetProject === change.project) throw new Error('El traslado requiere otro proyecto.');
      const target = entryPath(change.targetProject, change.id);
      if (existsSync(target) || existsSync(archivePath(change.targetProject, change.id))) throw new Error('ID destino ya existe.');
      const h = snapshot(handoffPath(change.project));
      if (h && /(?:^|\n)id: ([^\r\n]+)/.exec(h.toString())?.[1] === change.id) throw new Error('No se traslada el handoff seleccionado.');
      const text = raw.toString('utf8');
      const front = /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/.exec(text);
      if (!front || !front[2].split(/\r?\n/).includes('project: ' + change.project)) throw new Error('Proyecto declarado no coincide.');
      const after = front[1] + front[2].replace(/^project:.*$/m, 'project: ' + change.targetProject) + front[3] + front[4];
      stage(target, Buffer.from(after)); stage(file, null);
    } else if (change.kind === 'archive') {
      const { file, raw } = source(change);
      if (raw.length > 2 * 1024 * 1024) throw new Error('Fuente demasiado grande para historial comprimido.');
      const target = archivePath(change.project, change.id);
      if (existsSync(target)) throw new Error('Histórico destino ya existe.');
      stage(target, gzipSync(raw)); stage(file, null);
    } else if (change.kind === 'publish') {
      const e = change.entry;
      if (!e || typeof e.title !== 'string' || !e.title.trim() || /[\r\n]/.test(e.title) || e.title.length > 200 || typeof e.content !== 'string' || e.content.length > 60000) throw new Error('Ficha consolidada inválida.');
      if (!['reference', 'handoff'].includes(e.type)) throw new Error('Solo reference o handoff para consolidación.');
      validArray(e.tags, 'tags'); validArray(e.files, 'files');
      if (typeof e.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(e.createdAt) || !Number.isFinite(Date.parse(e.createdAt))) throw new Error('Fecha inválida.');
      const file = entryPath(change.project, e.id);
      if (existsSync(file) || existsSync(archivePath(change.project, e.id))) throw new Error('La ficha nueva ya existe.');
      const raw = Buffer.from(serializeEntry({ ...e, project: change.project, app:'codex-curation', unresolvedFiles:[] }));
      stage(file, raw);
      if (e.type === 'handoff') {
        const file = handoffPath(change.project), before = snapshot(file);
        if ((before ? hash(before) : null) !== change.expectedHandoffHash) throw new Error('Handoff seleccionado cambió.');
        stage(file, raw);
      }
    } else throw new Error('Operación desconocida: ' + change.kind);
  }
  // Archiving a selected handoff requires a replacement in this same transaction.
  for (const change of plan.changes.filter(c => c.kind === 'archive')) {
    const path = handoffPath(change.project), raw = snapshot(path);
    if (raw && /(?:^|\n)id: ([^\r\n]+)/.exec(raw.toString())?.[1] === change.id && !changes.has(path)) throw new Error('Falta reemplazo del handoff seleccionado.');
  }
  return [...changes.values()];
}

export function queueMaintenance(plan) {
  if (['off','readonly'].includes(getConfig().mode)) throw new Error('El modo actual no permite mantenimiento.');
  prepareMaintenance(plan);
  const id = newEntryId();
  const item = { id, action:'maintenance', project:plan.project, title:plan.title, type:'maintenance', app:process.env.SHARED_MCP_APP || 'codex', createdAt:new Date().toISOString(), content:'Plan revisable de traslado/consolidación. Conserva originales comprimidos; requiere aprobación explícita.', plan, planHash:hash(JSON.stringify(plan)) };
  writeAtomicSync(containedPath(pendingRoot(), join(pendingRoot(), id+'.json')), JSON.stringify(item,null,2)+'\n');
  audit('maintenance.pending', { id, project:plan.project, operations:plan.changes.length });
  return item;
}

export function applyMaintenance(item) {
  if (['off','readonly'].includes(getConfig().mode)) throw new Error('El modo actual no permite mantenimiento.');
  if (item.planHash !== hash(JSON.stringify(item.plan)) || item.project !== item.plan.project || item.title !== item.plan.title) throw new Error('El plan pendiente fue modificado.');
  const lock = join(getHome(), '.maintenance.lock');
  const fd = openSync(lock, 'wx');
  let manifest, backup;
  try {
    manifest = prepareMaintenance(item.plan);
    backup = containedPath(getHome(), join(getHome(), 'backups', 'maintenance-'+assertSafeId(item.id)));
    if (existsSync(backup)) throw new Error('Ya existe un respaldo para este plan; revisar antes de reintentar.');
    mkdirSync(backup, { recursive:true });
    for (let i=0;i<manifest.length;i++) if (manifest[i].before !== null) writeFileSync(join(backup, i+'.before'), manifest[i].before);
    writeFileSync(join(backup,'manifest.json'),JSON.stringify(manifest.map((m,i)=>({path:relative(getHome(),m.file),before:m.before===null?null:hash(m.before),after:m.after===null?null:hash(m.after),backup:m.before===null?null:i+'.before'})),null,2));
    const written=[];
    try {
      // Write compressed originals/new fichas before removing their active copies.
      const ordered=[...manifest.filter(m=>m.after!==null),...manifest.filter(m=>m.after===null)];
      for (const m of ordered) {
        if (!same(snapshot(m.file),m.before)) throw new Error('Cambio concurrente: '+m.file);
        if (m.after === null) rmSync(m.file); else writeAtomicSync(m.file,m.after,null);
        written.push(m);
      }
    } catch (error) {
      for (const m of written.reverse()) {
        if (!same(snapshot(m.file),m.after)) throw new Error('Se requiere recuperar el respaldo tras un cambio concurrente: '+backup, {cause:error});
        if (m.before===null) rmSync(m.file); else writeAtomicSync(m.file,m.before,null);
      }
      throw error;
    }
    audit('maintenance.approved',{id:item.id,project:item.project,operations:item.plan.changes.length,backup});
    return {id:item.id,project:item.project,title:item.title,action:'maintenance',type:'maintenance',backup};
  } finally { closeSync(fd); rmSync(lock); }
}
