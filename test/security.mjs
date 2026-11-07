import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
const home=mkdtempSync(join(tmpdir(),'sharedctx-security-'));
process.env.SHARED_MCP_HOME=home;process.env.SHARED_MCP_APP='security-test';
const store=await import('../src/store.js');
const {startDashboard}=await import('../src/dashboard.js');
store.writeEntry({project:'demo',title:'Fixture',content:'SAFE_MARKER',id:'safe'});
mkdirSync(join(home,'outside','entries'),{recursive:true});
writeFileSync(join(home,'outside','entries','sentinel.md'),'OUTSIDE_MARKER');
const {server,url}=await startDashboard({port:0});const base=new URL(url);base.port=server.address().port;
const req=async (path,headers={},port=server.address().port)=>new Promise((resolve,reject)=>{
 const r=request({hostname:'127.0.0.1',port,path,headers},res=>{let text='';res.setEncoding('utf8');res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,text}))});r.on('error',reject);r.end();
});
let checks=0;const check=(name,value)=>{assert.ok(value,name);checks++;console.log('OK  '+name)};
let child;
try{
 check('panel local responde', (await req('/api/entries?project=demo')).status===200);
 check('panel rechaza Host ajeno',(await req('/api/overview',{host:'attacker.invalid'})).status===403);
 check('panel rechaza Origin ajeno',(await req('/api/overview',{origin:'http://attacker.invalid'})).status===403);
 check('panel rechaza origen de otro puerto',(await req('/api/overview',{origin:'http://127.0.0.1:1'})).status===403);
 check('panel admite origen local correcto',(await req('/api/overview',{origin:base.origin})).status===200);
 for(const path of ['/api/entries?project=..%2Foutside','/api/entrygraph?project=..%5Coutside','/api/insights?project=../outside','/api/related?project=../outside']){
   const r=await req(path);check('contención '+path,r.status===400&&!r.text.includes('OUTSIDE_MARKER'));
 }
 assert.throws(()=>store.projectDir('../outside'));checks++;
 const escape=join(home,'projects','escape');symlinkSync(join(home,'outside'),escape,'junction');
 assert.throws(()=>store.listEntries('escape'));check('junction fuera del proyecto bloqueada',true);
 const destination=join(home,'keep.txt');writeFileSync(destination,'KEEP');
 assert.throws(()=>store.renameSyncSafe(join(home,'missing.tmp'),destination));
 check('reemplazo fallido conserva destino anterior',readFileSync(destination,'utf8')==='KEEP');
 const reservation=createNetServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 child=spawn(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'..','src','http.js'),'--port',String(port)],{env:{...process.env},stdio:['ignore','pipe','pipe'],windowsHide:true});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('HTTP startup timeout')),8000);child.stderr.on('data',d=>{if(String(d).includes('HTTP MCP escuchando')){clearTimeout(timer);resolve()}});child.on('exit',code=>{clearTimeout(timer);reject(Error('HTTP exited '+code))})});
 check('HTTP health local responde',(await req('/health',{},port)).status===200);
 check('HTTP MCP bloquea Host ajeno antes del transporte',(await req('/mcp',{host:'attacker.invalid'},port)).status===403);
 check('HTTP health bloquea Origin ajeno',(await req('/health',{origin:'http://attacker.invalid'},port)).status===403);
}finally{
 if(child){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited;}
 await new Promise(r=>server.close(r));
 // Remove the junction itself, never recursively follow its outside target.
 try{rmSync(join(home,'projects','escape'),{force:true})}catch{}
 rmSync(home,{recursive:true,force:true});
}
console.log(checks+' comprobaciones de seguridad OK.');
