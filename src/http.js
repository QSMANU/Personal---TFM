#!/usr/bin/env node
/**
 * http.js — entrada MCP Streamable HTTP, atada a loopback.
 *
 * Pensada para apps que solo aceptan servidores MCP remotos (Kimchi Studio, por
 * ejemplo) o para compartir el mismo proceso entre varias herramientas.
 *
 *   POST /mcp     JSON-RPC
 *   GET  /mcp     stream SSE de la sesión
 *   GET  /health  estado en texto plano
 *
 * Escucha únicamente en 127.0.0.1: no se expone a la red.
 */

import { createServer as createHttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { getConfig, getHome, log } from './store.js';

const cfg = getConfig();
const portArgIdx = process.argv.indexOf('--port');
const port = portArgIdx !== -1 ? Number(process.argv[portArgIdx + 1]) : cfg.port;
const host = cfg.host || '127.0.0.1';

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { return undefined; }
}

const http = createHttpServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

  if (url.pathname === '/health') {
    const current = getConfig();
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      mode: current.mode,
      home: getHome(),
      app: process.env.SHARED_MCP_APP || 'desconocida',
      pid: process.pid,
    }, null, 2));
    return;
  }

  if (url.pathname !== '/mcp') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No encontrado. Usá /mcp o /health.');
    return;
  }

  // Modo stateless: un servidor nuevo por request; el estado vive en disco.
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    const body = req.method === 'POST' ? await readBody(req) : undefined;
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    log(`error HTTP: ${err.stack || err.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: String(err.message) }, id: null }));
    }
  }
});

http.listen(port, host, () => {
  log(`HTTP MCP escuchando en http://${host}:${port}/mcp · modo=${getConfig().mode} · almacén=${getHome()}`);
});

const shutdown = () => { http.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
