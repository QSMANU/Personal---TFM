#!/usr/bin/env node
/**
 * stdio.js — entrada MCP por stdio (Claude Desktop, Cursor, Codex, VS Code Copilot,
 * Claude Code, Antigravity, Kimchi Studio).
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

// Heartbeat de sesión: es lo que el panel (`sharedctx ui`) muestra como "conectada ahora".
registerSession({ app: APP, transport: 'stdio' });
const limpiar = () => { endSession(APP); process.exit(0); };
process.on('SIGINT', limpiar);
process.on('SIGTERM', limpiar);
process.on('exit', () => endSession(APP));

await server.connect(transport);
log(`stdio listo · app=${APP} · modo=${getConfig().mode} · almacén=${getHome()}`);
