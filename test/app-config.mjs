import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { getApp, jsonAppConfigured, SERVER_NAME } from '../src/apps.js';
const stdio = fileURLToPath(new URL('../src/stdio.js', import.meta.url));
for (const id of ['kimchi', 'opencode', 'vscode']) {
  const app = getApp(id);
  const server = id === 'opencode'
    ? { type: 'local', command: [process.execPath, stdio], environment: { SHARED_MCP_APP: id } }
    : { type: 'stdio', command: process.execPath, args: [stdio], env: { SHARED_MCP_APP: id } };
  const config = id === 'opencode' ? { mcp: { servers: { sharedctx: server } } } : { [app.root]: { [SERVER_NAME]: server } };
  assert.equal(jsonAppConfigured(app, config), true);
  for (const flag of ['disabled', 'enabled']) {
    server[flag] = flag === 'disabled';
    assert.equal(jsonAppConfigured(app, config), false);
    delete server[flag];
  }
  (server.environment || server.env).SHARED_MCP_APP = 'other';
  assert.equal(jsonAppConfigured(app, config), false);
  assert.equal(jsonAppConfigured(app, { notes: SERVER_NAME }), false);
}
const dir = mkdtempSync(join(tmpdir(), 'sharedctx-config-'));
try {
  const configPath = join(dir, 'config.json'), serverPath = join(dir, 'server.json');
  writeFileSync(serverPath, JSON.stringify({ command: process.execPath, args: [stdio] }));
  const merge = root => spawnSync(process.execPath, ['tools/merge-mcp-json.mjs', configPath, root, 'sharedctx', serverPath], { encoding: 'utf8' });
  for (const original of [{ mcp: [] }, { mcp: { servers: false } }, { mcp: null }]) {
    const bytes = JSON.stringify(original); writeFileSync(configPath, bytes);
    assert.notEqual(merge('mcp.servers').status, 0);
    assert.equal(readFileSync(configPath, 'utf8'), bytes);
  }
  writeFileSync(configPath, '{"theme":"dark","mcp":{"servers":{"other":{"url":"https://example.com"}}}}');
  assert.equal(merge('mcp.servers').status, 0);
  const first = readFileSync(configPath, 'utf8');
  assert.equal(JSON.parse(first).theme, 'dark');
  assert.equal(JSON.parse(first).mcp.servers.other.url, 'https://example.com');
  assert.equal(merge('mcp.servers').status, 0);
  assert.equal(readFileSync(configPath, 'utf8'), first);
  assert.notEqual(merge('__proto__.servers').status, 0);
  assert.equal(readFileSync(configPath, 'utf8'), first);
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('OK: estados de conectores y edición JSON sin pérdida, idempotente');
