import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
const home = mkdtempSync(join(tmpdir(), 'sharedctx-views-'));
process.env.SHARED_MCP_HOME = home;
process.env.SHARED_MCP_PROJECT = 'demo';
const store = await import('../src/store.js');
const { createServer } = await import('../src/server.js');
const server = createServer(), client = new Client({ name:'view-test', version:'1' });
const [ct, st] = InMemoryTransport.createLinkedPair();
await server.connect(st); await client.connect(ct);
const call = async args => { const r = await client.callTool({ name:'shared_pull', arguments:args }); return { ...r, text:r.content[0].text }; };
let checks = 0;
const check = (label, value) => { assert.ok(value, label); checks++; console.log('OK  '+label); };
try {
 store.writeEntry({project:'demo',id:'old',title:'Antiguo',type:'handoff',content:'Histórico',createdAt:'2026-01-01T00:00:00Z'});
 store.writeEntry({project:'demo',id:'selected',title:'Seleccionado',type:'handoff',content:'Ver entry-b y [[Decisión B]].\n'+'á 🚀 evidencia\n'.repeat(2000),tags:['común'],createdAt:'2026-02-01T00:00:00Z'});
 for(let i=0;i<15;i++) store.writeEntry({project:'demo',id:i===14?'entry-b':'entry-'+i,title:i===14?'Decisión B':'Nota '+i,type:i===14?'decision':'note',content:'á 🚀 información\n'.repeat(1000),tags:['común'],files:['D:\\corpus, versión\\a.pdf'],createdAt:`2026-03-${String(i+1).padStart(2,'0')}T00:00:00Z`});
 store.addPending({project:'demo',title:'UNAPPROVED_SECRET_TITLE',content:'UNAPPROVED_SECRET_BODY',type:'handoff'});
 store.addPending({project:'private',title:'PRIVATE_PENDING',content:'HIDDEN'});
 store.writeEntry({project:'private',id:'secret',title:'PRIVATE_ENTRY',content:'HIDDEN'});
 const tree = await call({format:'tree'});
 check('árbol distingue handoff seleccionado',tree.text.startsWith('project ')&&tree.text.includes('selected_handoff')&&tree.text.includes('vigencia no verificada'));
 check('defecto conserva markdown breve compatible',(await call({})).text.startsWith('# Contexto compartido'));
 const g = JSON.parse((await call({format:'graph'})).text);
 check('grafo versionado con IDs y sin herramientas nuevas',g.schema==='sharedctx.context.v1'&&(await client.listTools()).tools.length===10&&g.nodes.some(n=>n.id==='entry-b'));
 check('relación tipada conserva dirección de mención',g.edges.some(e=>e.from==='selected'&&e.to==='entry-b'&&e.kind==='mentions'));
 check('etiqueta compartida no declara causalidad',g.edges.some(e=>e.kind==='shared_tag'&&e.evidence==='común')&&g.edges.every(e=>!['depends_on','supersedes'].includes(e.kind)));
 check('solo cuenta pendientes del proyecto sin exponer contenido',g.pending_count===1&&!JSON.stringify(g).includes('SECRET')&&!tree.text.includes('PRIVATE'));
 const rev=g.revision;
 check('cache graph mantiene JSON válido',JSON.parse((await call({format:'graph',since_revision:rev})).text).unchanged===true);
 check('cambio de formato invalida cache',!(await call({format:'tree',since_revision:rev})).text.startsWith('Sin cambios'));
 store.addPending({project:'demo',title:'otro',content:'otro'});
 check('cambio de pendientes invalida cache',JSON.parse((await call({format:'graph',since_revision:rev})).text).pending_count===2);
 const history=JSON.parse((await call({format:'graph',type:'handoff',handoff_mode:'omit'})).text);
 check('historial explícito conserva roles sin duplicar IDs',history.nodes.some(n=>n.id==='old'&&n.role==='history')&&new Set(history.nodes.map(n=>n.id)).size===history.nodes.length);
 for(const format of ['tree','graph','markdown']) {
   const denied=await call({format,project:'private'});
   check(format+' respeta aislamiento',denied.isError&&!denied.text.includes('PRIVATE_ENTRY'));
   check(format+' permite lectura cruzada autorizada',!(await call({format,project:'private',confirm_cross_project:true})).isError);
 }
 const ids=new Set(); let offset=0, loops=0;
 do {
  const r=await call({format:'graph',handoff_mode:'omit',include_content:true,limit:10,offset,max_chars:1800});
  const v=JSON.parse(r.text);
  assert.ok(r.text.length<=1800);
  for(const n of v.nodes) { assert.ok(!ids.has(n.id)); ids.add(n.id); }
  assert.ok(v.edges.every(e=>v.nodes.some(n=>n.id===e.from)&&v.nodes.some(n=>n.id===e.to)));
  assert.ok(v.page.next_offset===null||v.page.next_offset>offset);
  offset=v.page.next_offset; assert.ok(++loops<20);
 } while(offset!==null);
 check('presupuesto pagina sin saltar ni duplicar entradas; aristas cerradas',ids.size===15);
 for(const max_chars of [512,1024,6000,20000]) for(const format of ['tree','graph']) {
  const r=await call({format,max_chars,limit:50,type:'handoff',handoff_mode:'full',include_content:true});
  assert.ok(r.text.length<=max_chars); if(format==='graph') JSON.parse(r.text);
 }
 check('presupuesto mínimo mantiene formatos válidos y Unicode',true);
 store.ensureProject('empty');
 const empty=JSON.parse((await call({format:'graph',project:'empty',confirm_cross_project:true})).text);
 check('proyecto vacío conserva identidad y no inventa nodos',empty.project.slug==='empty'&&empty.nodes.length===0);
 check('formato desconocido se rechaza',(await call({format:'xml'})).isError);
 const files=store.listEntries('demo').length;
 check('consultas no publican ni mueven entradas',files===17&&store.listPending().length===3);
} finally { await client.close(); await server.close(); rmSync(home,{recursive:true,force:true}); }
console.log(checks+' comprobaciones de vistas AI OK.');
