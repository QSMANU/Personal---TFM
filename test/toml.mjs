import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stripServerTables, tableParts } from '../tools/toml-tables.mjs';
const home=mkdtempSync(join(tmpdir(),'sharedctx-toml-'));
const tool=join(dirname(fileURLToPath(import.meta.url)),'..','tools','merge-codex-toml.mjs');
let checks=0;const check=(name,value)=>{assert.ok(value,name);checks++;console.log('OK  '+name)};
try{
 const original=`# keep\nmessage = """\n[mcp_servers.target] # this is a string\nnot a table\n"""\n[mcp_servers.other]\ncommand = "keep"\n[mcp_servers."target"] # trailing comment\ncommand = "old"\n[mcp_servers.'target'.env] # nested\nOLD = "old"\n[other.settings]\nunchanged = true\n`;
 const stripped=stripServerTables(original,['target']);
 check('preserva encabezados dentro de strings multilínea',stripped.includes('[mcp_servers.target] # this is a string'));
 check('retira tablas con claves entrecomilladas y comentarios',!stripped.includes('command = "old"')&&!stripped.includes('OLD ='));
 check('preserva tablas ajenas',stripped.includes('command = "keep"')&&stripped.includes('unchanged = true'));
 check('parsea claves punteadas citadas',JSON.stringify(tableParts('[ mcp_servers . "target" . env ] # ok'))===JSON.stringify(['mcp_servers','target','env']));
 const config=join(home,'config.toml'),server=join(home,'server.json');writeFileSync(config,original);writeFileSync(server,JSON.stringify({command:'node',args:['line\nnext'],env:{'KEY.DOT':'value'}}));
 const run=()=>spawnSync(process.execPath,[tool,config,'target',server],{encoding:'utf8',env:{...process.env,SHARED_MCP_HOME:home}});
 assert.equal(run().status,0);const once=readFileSync(config,'utf8');assert.equal(run().status,0);const twice=readFileSync(config,'utf8');
 check('merge idempotente sin duplicar tablas',once===twice);
 check('escapa saltos y claves de environment',once.includes('"line\\nnext"')&&once.includes('"KEY.DOT" = "value"'));
}finally{rmSync(home,{recursive:true,force:true})}
console.log(checks+' comprobaciones TOML OK.');
