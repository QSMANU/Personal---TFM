#!/usr/bin/env node
// Administrative, reversible repair. No new entries, body edits, approvals or mode changes.
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getHome, getConfig, listProjects, findProjectMatch, listEntries, getHandoff, entriesDir, handoffPath, projectDir, writeAtomicSync, audit } from '../src/store.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const normalize=s=>resolve(s).toLowerCase();
const args=process.argv.slice(2),apply=args.includes('--apply');
const index=args.indexOf('--repositories');
const repositories=index<0?dirname(resolve(dirname(fileURLToPath(import.meta.url)),'..')):resolve(args[index+1]);
const projects=listProjects(), roots=new Map();
function addRoot(name,path){if(!existsSync(path))return;const match=findProjectMatch(name,{fuzzyThreshold:1});if(match){if(!roots.has(match.slug))roots.set(match.slug,[]);roots.get(match.slug).push(resolve(path));}}
if(existsSync(repositories))for(const dir of readdirSync(repositories,{withFileTypes:true}).filter(x=>x.isDirectory())){
 const root=join(repositories,dir.name), marker=join(root,'.sharedctx.json');
 if(existsSync(marker)){
  const meta=JSON.parse(readFileSync(marker,'utf8').replace(/^\uFEFF/,''));
  if(typeof meta.project==='string')addRoot(meta.project,root);
 }
}
addRoot('Personal - AppComunidadVecinos',join(repositories,'AppComunidadVecinos'));
addRoot('Casorio-AyP',join(repositories,'Casorio-AyP'));
addRoot('Repositories',repositories);
const plan=[];
function change(file,after,project,reason){const before=readFileSync(file,'utf8');if(before!==after)plan.push({file,before,after,project,reason});}
function header(raw,key,value){const match=/^(\uFEFF?---\r?\n|---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/.exec(raw);if(!match)throw Error('Entrada sin front-matter válido.');
 const lines=match[2].split(/\r?\n/),newline=match[1].includes('\r\n')?'\r\n':'\n';const i=lines.findIndex(x=>x.startsWith(key+':'));const line=key+': '+JSON.stringify(value);if(i<0)lines.push(line);else lines[i]=line;
 return match[1]+lines.join(newline)+match[3]+match[4];}
for(const p of projects){
 const discovered=roots.get(p.slug)||[];
 if(discovered.length){
  const file=join(projectDir(p.slug),'project.json');const meta=JSON.parse(readFileSync(file,'utf8'));
  const current=meta.roots||[],live=current.filter(existsSync),stale=current.filter(x=>!existsSync(x));
  const merged=[...live];for(const root of discovered)if(!merged.some(r=>normalize(r)===normalize(root)))merged.push(root);
  meta.roots=merged;
  if(stale.length)meta.historicalRoots=[...new Set([...(meta.historicalRoots||[]),...stale])];
  change(file,JSON.stringify(meta,null,2)+'\n',p.slug,'registrar raíces actuales; conservar raíces antiguas como históricas');
 }
 const active=getHandoff(p.slug);
 for(const e of listEntries(p.slug)){
  const invalid=e.files.filter(f=>f==='[object Object]');if(!invalid.length)continue;
  const file=join(entriesDir(p.slug),e.id+'.md');let text=readFileSync(file,'utf8');
  text=header(text,'files',e.files.filter(f=>f!=='[object Object]'));
  text=header(text,'unresolved_files',[...(e.unresolvedFiles||[]),...invalid]);
  change(file,text,p.slug,'aislar '+invalid.length+' referencias irrecuperables sin alterar el cuerpo');
  if(active?.id===e.id)change(handoffPath(p.slug),text,p.slug,'mantener metadata de handoff vigente consistente');
 }
}
const result={apply,changes:plan.map(x=>({file:x.file,project:x.project,reason:x.reason})),backup:null};
if(apply&&plan.length){
 if(['off','readonly'].includes(getConfig().mode))throw Error('El modo actual no permite reparar metadata. No se cambió el modo.');
 const base=resolve(getHome());
 for(const item of plan){const rel=relative(join(base,'projects'),item.file);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Destino fuera de projects.');if(hash(readFileSync(item.file,'utf8'))!==hash(item.before))throw Error('El archivo cambió durante la planificación.');}
 const backup=join(base,'backups','metadata-'+new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(backup,{recursive:true});
 for(const item of plan)writeAtomicSync(join(backup,relative(base,item.file)),item.before);
 writeAtomicSync(join(backup,'manifest.json'),JSON.stringify(plan.map(x=>({path:relative(base,x.file),before:hash(x.before),after:hash(x.after)})),null,2));
 const written=[];
 try{for(const item of plan){if(hash(readFileSync(item.file,'utf8'))!==hash(item.before))throw Error('Cambio concurrente: '+item.file);writeAtomicSync(item.file,item.after);written.push(item);}}
 catch(error){for(const item of written.reverse())if(hash(readFileSync(item.file,'utf8'))===hash(item.after))writeAtomicSync(item.file,item.before);throw error;}
 result.backup=backup;audit('metadata.repair',{files:plan.length,backup});
}
console.log(JSON.stringify(result,null,2));
