// Read-only MCP handshake using the server actually stored in an app's JSON config.
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [configPath, root = 'mcpServers'] = process.argv.slice(2);
const timer = setTimeout(() => {
  console.error('MCP no respondió en 15 segundos');
  process.exit(1);
}, 15_000);
let transport;
let client;
try {
  const config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  const server = config[root]?.['QSMANU-LOCAL-SHARED-MCP'];
  if (!server?.command || server.disabled) throw new Error('Servidor ausente o deshabilitado');
  transport = new StdioClientTransport({
    command: server.command, args: server.args || [],
    env: { ...process.env, ...server.env }, stderr: 'pipe',
  });
  client = new Client({ name: 'sharedctx-install-check', version: '1.0.0' });
  await client.connect(transport);
  const { tools } = await client.listTools();
  for (const name of ['shared_status', 'shared_pull', 'shared_publish']) {
    if (!tools.some((tool) => tool.name === name)) throw new Error(`Falta la herramienta ${name}`);
  }
  console.log(`MCP responde: ${tools.length} herramientas (proceso de prueba; verificar también en la app).`);
} catch (error) {
  console.error(`Error MCP: ${error.message}`);
  process.exitCode = 1;
} finally {
  try { await client?.close(); } finally {
    await transport?.close();
    clearTimeout(timer);
  }
}
