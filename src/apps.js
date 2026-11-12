/**
 * apps.js — catálogo de las herramientas de AI soportadas y de dónde lee cada
 * una su configuración MCP. Lo usan el panel (`sharedctx ui`) y el diagnóstico
 * para responder "¿está conectada esta app?".
 *
 * `kind` describe la forma del archivo:
 *   json-mcpServers  { "mcpServers": { "<nombre>": { command, args, env } } }
 *   json-servers     { "servers":     { "<nombre>": { type, command, args } } }   (VS Code)
 *   json-opencode    { "mcp": { "servers": { "<nombre>": { type, command[], environment } } } } (OpenCode)
 *   toml             [mcp_servers.<nombre>]                                       (Codex)
 *   dsh-patch        patch YAML del perfil de DeepSeek Harness
 *   cli              se registra con un comando propio (Claude Code)
 */

import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const H = homedir();
const APPDATA = process.env.APPDATA || join(H, 'AppData', 'Roaming');

export const SERVER_NAME = 'QSMANU-LOCAL-SHARED-MCP';

export const KNOWN_APPS = [
  {
    id: 'claude-desktop', name: 'Claude Desktop', kind: 'json-mcpServers', root: 'mcpServers',
    config: join(APPDATA, 'Claude', 'claude_desktop_config.json'),
    instructions: null,
    notes: 'Lee la config solo al arrancar.',
  },
  {
    id: 'cursor', name: 'Cursor', kind: 'json-mcpServers', root: 'mcpServers',
    config: join(H, '.cursor', 'mcp.json'),
    instructions: join(H, '.cursor', 'rules', 'contexto-compartido.mdc'),
    notes: 'También admite <repo>\\.cursor\\mcp.json por proyecto.',
  },
  {
    id: 'codex', name: 'Codex / ChatGPT desktop', kind: 'toml',
    config: join(H, '.codex', 'config.toml'),
    instructions: join(H, '.codex', 'AGENTS.md'),
    notes: 'Tiene aprobación extra para shared_publish y shared_forget.',
  },
  {
    id: 'antigravity', name: 'Antigravity (agente e IDE)', kind: 'json-mcpServers', root: 'mcpServers',
    config: join(H, '.gemini', 'config', 'mcp_config.json'),
    instructions: join(H, '.gemini', 'GEMINI.md'),
    notes: 'El agente y el IDE comparten este mismo archivo.',
  },
  {
    id: 'kimi-code', name: 'Kimi Code', kind: 'json-mcpServers', root: 'mcpServers',
    config: join(H, '.kimi-code', 'mcp.json'),
    instructions: join(H, '.kimi-code', 'AGENTS.md'),
    notes: 'Configuración global; también admite <repo>\\.kimi-code\\mcp.json.',
  },
  {
    id: 'vscode', name: 'VS Code (Copilot)', kind: 'json-servers', root: 'servers',
    config: join(APPDATA, 'Code', 'User', 'mcp.json'),
    instructions: null,
    notes: 'Cada servidor necesita "type": "stdio".',
  },
  {
    id: 'copilot', name: 'Copilot (global)', kind: 'json-mcpServers', root: 'mcpServers',
    config: join(H, '.copilot', 'mcp-config.json'),
    instructions: null,
    notes: 'Config global de Copilot; VS Code 1.140 también la lee.',
  },
  {
    id: 'claude-code', name: 'Claude Code', kind: 'cli',
    config: join(H, '.claude', 'settings.json'),
    instructions: join(H, '.claude', 'CLAUDE.md'),
    notes: 'Se registra con: claude mcp add --scope user ...',
  },
  {
    id: 'dsh', name: 'DeepSeek Harness', kind: 'dsh-patch',
    config: join(H, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml'),
    instructions: null,
    notes: 'Recarga el perfil en caliente: no hace falta reiniciar.',
  },
  {
    id: 'kimchi', name: 'Kimchi Studio', kind: 'json-mcpServers', root: 'mcpServers',
    config: join(H, '.config', 'kimchi', 'harness', 'mcp.json'),
    instructions: join(H, '.config', 'kimchi', 'harness', 'skills', 'contexto-compartido', 'SKILL.md'),
    notes: 'Reiniciar el cliente MCP después de configurar.',
  },
  {
    id: 'opencode', name: 'OpenCode', kind: 'json-opencode', root: 'mcp.servers', serverName: 'sharedctx',
    config: join(H, '.config', 'opencode', 'opencode.json'),
    instructions: join(H, '.config', 'opencode', 'AGENTS.md'),
    notes: 'V2: command es un array y las variables van en "environment"; recarga la config en caliente.',
  },
];

export function getApp(id) {
  return KNOWN_APPS.find((a) => a.id === id) || null;
}

export function appName(id) {
  return getApp(id)?.name || id;
}

// Valida la configuración local; una sesión viva se informa por separado.
export function jsonAppConfigured(app, config) {
  const root = app.kind === 'json-opencode' ? config?.mcp?.servers : config?.[app.root];
  const server = root?.[app.serverName || SERVER_NAME];
  if (!server || server.disabled === true || server.enabled === false) return false;
  const openCode = app.kind === 'json-opencode';
  if (openCode && server.type !== 'local') return false;
  if (app.id === 'vscode' && server.type !== 'stdio') return false;
  const command = openCode ? server.command : [server.command, ...(Array.isArray(server.args) ? server.args : [])];
  const env = openCode ? server.environment : server.env;
  const entry = fileURLToPath(new URL('./stdio.js', import.meta.url));
  return Array.isArray(command) && command.length === 2
    && command.every(value => typeof value === 'string' && value.length > 0)
    && resolve(command[1]) === resolve(entry)
    && existsSync(command[0]) && existsSync(command[1])
    && env?.SHARED_MCP_APP === app.id;
}
