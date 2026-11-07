#!/usr/bin/env node
/**
 * merge-codex-toml.mjs — escribe un servidor MCP en el config.toml de Codex
 * (ChatGPT desktop / Codex CLI), y opcionalmente retira otro.
 *
 *   node tools/merge-codex-toml.mjs <config.toml> <serverName> <server.json> [--retire a,b]
 *
 * Maneja bloques por tabla: [mcp_servers.<n>] y sus sub-tablas ([...env],
 * [...tools.x], etc.). No usa parser de TOML para no reescribir el archivo
 * entero: solo toca las tablas del servidor.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { stripServerTables } from './toml-tables.mjs';
import { writeAtomicSync } from '../src/store.js';

const [configPath, serverName, serverFile, ...flags] = process.argv.slice(2);
if (!configPath || !serverName || !serverFile) {
  console.error('Uso: merge-codex-toml.mjs <config.toml> <serverName> <server.json> [--retire a,b]');
  process.exit(2);
}

const retireIdx = flags.indexOf('--retire');
const retire = retireIdx !== -1 && flags[retireIdx + 1]
  ? flags[retireIdx + 1].split(',').map((s) => s.trim()).filter(Boolean)
  : [];

const server = JSON.parse(readFileSync(serverFile, 'utf8').replace(/^\uFEFF/, ''));

const tomlString = v => JSON.stringify(String(v));
const tomlKey = v => /^[A-Za-z0-9_-]+$/.test(v) ? v : tomlString(v);
const tomlValue = (v) => {
  if (Array.isArray(v)) return `[${v.map(tomlValue).join(', ')}]`;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return tomlString(v);
};

function buildBlocks(name, cfg) {
  name = tomlKey(name);
  const lines = [`[mcp_servers.${name}]`];
  for (const [key, value] of Object.entries(cfg)) {
    if (key === 'env' || key === 'http_headers' || key === 'tools') continue;
    lines.push(`${tomlKey(key)} = ${tomlValue(value)}`);
  }
  lines.push('');
  for (const table of ['env', 'http_headers']) {
    const entries = cfg[table];
    if (entries && typeof entries === 'object') {
      lines.push(`[mcp_servers.${name}.${table}]`);
      for (const [k, v] of Object.entries(entries)) lines.push(`${tomlKey(k)} = ${tomlValue(v)}`);
      lines.push('');
    }
  }
  if (cfg.tools && typeof cfg.tools === 'object') {
    for (const [tool, opts] of Object.entries(cfg.tools)) {
      lines.push(`[mcp_servers.${name}.tools.${tomlKey(tool)}]`);
      for (const [k, v] of Object.entries(opts || {})) lines.push(`${tomlKey(k)} = ${tomlValue(v)}`);
      lines.push('');
    }
  }
  return lines;
}

let text = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
const targets = [serverName, ...retire];
const before = text;
text = stripServerTables(text, targets);
const removed = before !== text
  ? targets.filter((n) => n !== serverName && before.includes(`[mcp_servers.${n}]`))
  : [];

if (text.length && !text.endsWith('\n')) text += '\n';
text += `${buildBlocks(serverName, server).join('\n').trimEnd()}\n`;

mkdirSync(dirname(configPath), { recursive: true });
writeAtomicSync(configPath, text, 'utf8');

console.log(`[merge-codex-toml] ${configPath}`);
console.log(`  mcp_servers.${serverName}: escrito`);
if (removed.length) console.log(`  retirados: ${removed.join(', ')}`);
