#!/usr/bin/env node
/**
 * strip-context-mcp-hooks.mjs — quita de un settings.json de Claude Code los hooks
 * que capturaban contexto automáticamente (los del servidor de terceros).
 *
 *   node tools/strip-context-mcp-hooks.mjs <settings.json> [--match context-mcp]
 *
 * Si no queda ningún hook, la clave "hooks" se elimina. Deja el resto intacto.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [settingsPath, ...flags] = process.argv.slice(2);
if (!settingsPath) {
  console.error('Uso: strip-context-mcp-hooks.mjs <settings.json> [--match context-mcp]');
  process.exit(2);
}
const matchIdx = flags.indexOf('--match');
const match = matchIdx !== -1 ? flags[matchIdx + 1] : 'context-mcp';

if (!existsSync(settingsPath)) {
  console.log(`[strip-hooks] ${settingsPath} no existe: nada que hacer`);
  process.exit(0);
}

const raw = readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '');
let settings;
try {
  settings = JSON.parse(raw);
} catch (err) {
  console.error(`[strip-hooks] ${settingsPath} no es JSON válido: ${err.message}`);
  process.exit(1);
}

const hooks = settings.hooks;
if (!hooks || typeof hooks !== 'object') {
  console.log(`[strip-hooks] ${settingsPath}: no hay hooks`);
  process.exit(0);
}

let removed = 0;
const mentions = (entry) => JSON.stringify(entry).includes(match);

for (const event of Object.keys(hooks)) {
  const list = hooks[event];
  if (!Array.isArray(list)) continue;
  const kept = list.filter((group) => {
    const groupHooks = Array.isArray(group?.hooks) ? group.hooks : [];
    const dirty = groupHooks.some(mentions);
    if (dirty) removed += groupHooks.filter(mentions).length;
    group.hooks = groupHooks.filter((h) => !mentions(h));
    return group.hooks.length > 0;
  });
  if (kept.length > 0) hooks[event] = kept;
  else delete hooks[event];
}

if (Object.keys(hooks).length === 0) delete settings.hooks;

writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
console.log(`[strip-hooks] ${settingsPath}: ${removed} hook(s) de "${match}" eliminados`);
