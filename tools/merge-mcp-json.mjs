#!/usr/bin/env node
/**
 * merge-mcp-json.mjs — inserta (o actualiza) un servidor MCP dentro de un JSON
 * de configuración, y opcionalmente retira otros servidores.
 *
 *   node tools/merge-mcp-json.mjs <config.json> <rootKey> <serverName> <server.json> [--retire a,b]
 *
 * `rootKey` acepta una ruta con puntos para configuraciones anidadas, por
 * ejemplo `mcp.servers` (OpenCode V2).
 *
 * Mantiene el resto del archivo intacto a nivel de datos (se reescribe con
 * formato estable de 2 espacios). Siempre conviene tener backup: lo hace el
 * instalador.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [configPath, rootKey, serverName, serverFile, ...flags] = process.argv.slice(2);
if (!configPath || !rootKey || !serverName || !serverFile) {
  console.error('Uso: merge-mcp-json.mjs <config.json> <rootKey> <serverName> <server.json> [--retire a,b]');
  process.exit(2);
}

const retireIdx = flags.indexOf('--retire');
const retire = retireIdx !== -1 && flags[retireIdx + 1]
  ? flags[retireIdx + 1].split(',').map((s) => s.trim()).filter(Boolean)
  : [];

const server = JSON.parse(readFileSync(serverFile, 'utf8').replace(/^\uFEFF/, ''));

let config = {};
let existed = false;
if (existsSync(configPath)) {
  const raw = readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '').trim();
  if (raw) {
    existed = true;
    try {
      config = JSON.parse(raw);
    } catch (err) {
      console.error(`El JSON existente no se puede parsear (${configPath}): ${err.message}`);
      process.exit(1);
    }
  }
}

if (typeof config !== 'object' || config === null || Array.isArray(config)) {
  console.error(`La raíz de ${configPath} no es un objeto JSON.`);
  process.exit(1);
}

// rootKey puede ser una ruta con puntos: "mcp.servers" (OpenCode V2).
const ruta = rootKey.split('.').filter(Boolean);
let contenedor = config;
for (const clave of ruta.slice(0, -1)) {
  if (typeof contenedor[clave] !== 'object' || contenedor[clave] === null || Array.isArray(contenedor[clave])) {
    contenedor[clave] = {};
  }
  contenedor = contenedor[clave];
}

const hoja = ruta.at(-1);
if (typeof contenedor[hoja] !== 'object' || contenedor[hoja] === null || Array.isArray(contenedor[hoja])) {
  contenedor[hoja] = {};
}

const removed = [];
for (const name of retire) {
  if (Object.prototype.hasOwnProperty.call(contenedor[hoja], name)) {
    delete contenedor[hoja][name];
    removed.push(name);
  }
}

const action = Object.prototype.hasOwnProperty.call(contenedor[hoja], serverName) ? 'actualizado' : 'agregado';
contenedor[hoja][serverName] = server;

mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

console.log(`[merge-mcp-json] ${configPath}`);
console.log(`  archivo: ${existed ? 'existente' : 'nuevo'}`);
console.log(`  ${rootKey}.${serverName}: ${action}`);
if (removed.length) console.log(`  retirados: ${removed.join(', ')}`);
