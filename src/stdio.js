#!/usr/bin/env node
/**
 * stdio.js — entrada MCP por stdio (Claude Desktop, Cursor, Codex, VS Code Copilot,
 * Claude Code, Antigravity, Kimchi Studio).
 *
 * Nada debe escribirse en stdout salvo JSON-RPC: los logs van a stderr.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { getConfig, getHome, log } from './store.js';

process.on('uncaughtException', (err) => log(`uncaughtException: ${err.stack || err.message}`));
process.on('unhandledRejection', (err) => log(`unhandledRejection: ${err?.stack || err}`));

const server = createServer();
const transport = new StdioServerTransport();

await server.connect(transport);
log(`stdio listo · app=${process.env.SHARED_MCP_APP || 'desconocida'} · modo=${getConfig().mode} · almacén=${getHome()}`);
