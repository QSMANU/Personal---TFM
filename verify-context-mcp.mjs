import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const project = "Personal - TFM";
const rootPath = process.cwd();
const home = homedir();
const appData = process.env.APPDATA;

const readText = (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, "");

const jsonClients = [
  ["Claude Desktop", join(appData, "Claude", "claude_desktop_config.json")],
  ["Antigravity", join(home, ".gemini", "config", "mcp_config.json")],
  ["Cursor", join(home, ".cursor", "mcp.json")],
];

function parseCodexConfig(path) {
  const text = readText(path);
  const header = "[mcp_servers.context-mcp]";
  const start = text.indexOf(header);
  if (start < 0) throw new Error("No existe [mcp_servers.context-mcp]");
  const remainder = text.slice(start + header.length).replace(/^\r?\n/, "");
  const nextHeader = remainder.search(/^\[/m);
  const section = nextHeader >= 0 ? remainder.slice(0, nextHeader) : remainder;
  const command = section.match(/^command\s*=\s*["'](.+?)["']\s*$/m)?.[1];
  const argsText = section.match(/^args\s*=\s*\[(.*?)\]\s*$/m)?.[1] ?? "";
  const args = [...argsText.matchAll(/["'](.*?)["']/g)].map((match) => match[1].replaceAll("\\\\", "\\"));
  if (!command) throw new Error("No se pudo leer command en config.toml");
  return { command: command.replaceAll("\\\\", "\\"), args };
}

function waitForMessage(pending, id, timeoutMs = 15000) {
  return Promise.race([
    new Promise((resolve, reject) => pending.set(id, { resolve, reject })),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout esperando respuesta ${id}`)), timeoutMs)),
  ]);
}

async function verifyClient(name, config) {
  const child = spawn(config.command, config.args ?? [], {
    cwd: rootPath,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const pending = new Map();
  let stdoutBuffer = "";
  let stderr = "";

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    for (;;) {
      const newline = stdoutBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        const waiter = pending.get(message.id);
        if (waiter) {
          pending.delete(message.id);
          message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
        }
      } catch {
        // Ignore non-protocol diagnostics; they remain available through stderr.
      }
    }
  });

  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  try {
    const initialized = waitForMessage(pending, 1);
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "context-mcp-verifier", version: "1.0.0" },
    } });
    const initResult = await initialized;
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    const resumed = waitForMessage(pending, 2);
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "context",
      arguments: { action: "resume", project, rootPath },
    } });
    const resumeResult = await resumed;
    const payload = resumeResult?.content?.find((item) => item.type === "text")?.text ?? "";
    if (!payload.includes(`Loaded`) || !payload.includes(project)) {
      throw new Error(`respuesta resume inesperada: ${payload.slice(0, 300)}`);
    }
    console.log(`[OK] ${name}: ${initResult.serverInfo?.name ?? "MCP"} ${initResult.serverInfo?.version ?? ""} + context.resume`);
  } catch (error) {
    throw new Error(`${name}: ${error.message}${stderr ? ` | stderr: ${stderr.trim()}` : ""}`);
  } finally {
    child.kill();
  }
}

const clients = [];
for (const [name, path] of jsonClients) {
  if (!existsSync(path)) throw new Error(`${name}: falta ${path}`);
  const config = JSON.parse(readText(path)).mcpServers?.["context-mcp"];
  if (!config) throw new Error(`${name}: falta mcpServers.context-mcp en ${path}`);
  clients.push([name, config]);
}

const codexPath = join(home, ".codex", "config.toml");
if (!existsSync(codexPath)) throw new Error(`ChatGPT/Codex: falta ${codexPath}`);
clients.push(["ChatGPT/Codex", parseCodexConfig(codexPath)]);

for (const [name, config] of clients) await verifyClient(name, config);
console.log(`[OK] Los ${clients.length} clientes usan la misma memoria del proyecto ${project}.`);
