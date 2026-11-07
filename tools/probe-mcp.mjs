// Read-only MCP handshake using the server actually stored in an app's JSON config.
// Soporta raíces anidadas ("mcp.servers" en OpenCode V2) y command como array.
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [configPath, root = 'mcpServers', serverName = 'QSMANU-LOCAL-SHARED-MCP'] = process.argv.slice(2);
const timer = setTimeout(() => {
  console.error('MCP no respondió en 15 segundos');
  process.exit(1);
}, 15_000);
let transport;
let client;
try {
  const config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  const servers = root.split('.').filter(Boolean)
    .reduce((nodo, clave) => (nodo && typeof nodo === 'object' ? nodo[clave] : undefined), config);
  const server = servers?.[serverName];
  if (!server?.command || server.disabled) throw new Error('Servidor ausente o deshabilitado');
  const commandArray = Array.isArray(server.command) ? server.command : null;
  const command = commandArray ? commandArray[0] : server.command;
  const args = commandArray ? commandArray.slice(1) : (server.args || []);
  transport = new StdioClientTransport({
    command, args,
    env: { ...process.env, ...(server.env || server.environment) }, stderr: 'pipe',
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
