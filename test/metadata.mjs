import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const home=mkdtempSync(join(tmpdir(),'sharedctx-meta-'));process.env.SHARED_MCP_HOME=home;
const store=await import('../src/store.js');const root=join(home,'repositories');mkdirSync(join(root,'renamed'),{recursive:true});
store.writeEntry({project:'Demo',title:'Original',content:'KEEP EXACTLY\ná 🚀\n',files:['[object Object]','D:\\valid.pdf'],id:'old',type:'handoff',createdAt:'2026-01-01T00:00:00Z'});
store.writeEntry({project:'Demo',title:'Current',content:'CURRENT',id:'current',type:'handoff',createdAt:'2026-02-01T00:00:00Z'});
const pf=join(home,'projects','demo','project.json');const project=JSON.parse(readFileSync(pf));project.roots=[join(home,'missing-old-root')];writeFileSync(pf,JSON.stringify(project));
writeFileSync(join(root,'renamed','.sharedctx.json'),JSON.stringify({project:'Demo'}));
const tool=join(dirname(fileURLToPath(import.meta.url)),'..','tools','repair-metadata.mjs');
const run=apply=>spawnSync(process.execPath,[tool,'--repositories',root,...(apply?['--apply']:[])],{encoding:'utf8',env:{...process.env}});
try{
 const before=store.readEntry('demo','old'),beforeActive=store.getHandoff('demo');
 const dry=run(false);assert.equal(dry.status,0,dry.stderr);assert.equal(store.readEntry('demo','old').files.length,2);
 const applied=run(true);assert.equal(applied.status,0,applied.stderr);const report=JSON.parse(applied.stdout);assert.ok(report.backup);
 const after=store.readEntry('demo','old');assert.equal(after.content,before.content);assert.equal(after.createdAt,before.createdAt);assert.equal(after.id,before.id);
 assert.deepEqual(after.files,['D:\\valid.pdf']);assert.deepEqual(after.unresolvedFiles,['[object Object]']);assert.equal(store.getHandoff('demo').id,beforeActive.id);
 const next=JSON.parse(readFileSync(pf));assert.deepEqual(next.roots,[join(root,'renamed')]);assert.equal(next.historicalRoots.length,1);
 const again=run(true);assert.equal(again.status,0);assert.equal(JSON.parse(again.stdout).changes.length,0);
 assert.equal(store.listPending().length,0);assert.equal(store.getConfig().mode,'ask');assert.equal(readdirSync(join(home,'projects','demo','entries')).length,2);
 console.log('OK  metadata: dry-run, respaldo, conservación de cuerpo/ID/fecha/handoff, raíces, idempotencia y consentimiento.');
}finally{rmSync(home,{recursive:true,force:true})}
