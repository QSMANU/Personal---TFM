#!/usr/bin/env node
/**
 * stdio.js — entrada MCP por stdio (Claude Desktop, Cursor, Codex, VS Code Copilot,
 * Claude Code, Antigravity, Kimi Code).
 *
 * Nada debe escribirse en stdout salvo JSON-RPC: los logs van a stderr.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { endSession, getConfig, getHome, log, registerSession } from './store.js';

process.on('uncaughtException', (err) => log(`uncaughtException: ${err.stack || err.message}`));
process.on('unhandledRejection', (err) => log(`unhandledRejection: ${err?.stack || err}`));

const APP = process.env.SHARED_MCP_APP || 'desconocida';
const server = createServer();
const transport = new StdioServerTransport();

// Claude Desktop y otros clientes pueden cerrar el canal antes de enviar una
// llamada. Dejarlo en el log local evita que un timeout quede sin diagnóstico.
transport.onerror = (err) => log(`stdio transport error · app=${APP} · ${err?.stack || err?.message || err}`);
transport.onclose = () => log(`stdio transport closed · app=${APP}`);

// Heartbeat de sesión: es lo que el panel (`sharedctx ui`) muestra como "conectada ahora".
registerSession({ app: APP, transport: 'stdio' });
const limpiar = () => { endSession(APP); process.exit(0); };
process.on('SIGINT', limpiar);
process.on('SIGTERM', limpiar);
process.on('exit', () => endSession(APP));

await server.connect(transport);
log(`stdio listo · app=${APP} · modo=${getConfig().mode} · almacén=${getHome()}`);
