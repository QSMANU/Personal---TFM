// Table-aware editing without reformatting unrelated TOML or reading headers
// inside multiline strings. Used only for MCP server table replacement.
export function tableParts(line) {
  const text = line.trimStart();
  if (!text.startsWith('[')) return null;
  const array = text.startsWith('[['); const start = array ? 2 : 1;
  let quote = null, escaped = false, end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote && !escaped) quote = null; escaped = quote === '"' && c === '\\' && !escaped; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === ']') { end = i; break; }
  }
  if (end < 0 || !new RegExp(array ? '^\\]\\]\\s*(?:#.*)?$' : '^\\]\\s*(?:#.*)?$').test(text.slice(end))) return null;
  const raw = text.slice(start, end), parts = []; let offset = 0;
  while (offset < raw.length) {
    const match = /^\s*("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)\s*(\.|$)/.exec(raw.slice(offset));
    if (!match) return null;
    const key = match[1]; parts.push(key[0] === '"' ? JSON.parse(key) : key[0] === "'" ? key.slice(1, -1) : key);
    offset += match[0].length;
  }
  return parts;
}

function multilineAfter(line, current) {
  let multi = current, quote = null, escaped = false;
  for (let i = 0; i < line.length; i++) {
    if (multi) {
      if (line.startsWith(multi, i) && !escaped) { i += 2; multi = null; }
      escaped = multi === '"""' && line[i] === '\\' && !escaped;
      continue;
    }
    const c = line[i];
    if (quote) { if (c === quote && !escaped) quote = null; escaped = quote === '"' && c === '\\' && !escaped; continue; }
    if (c === '#') break;
    if (line.startsWith('"""', i) || line.startsWith("'''", i)) { multi = line.slice(i, i + 3); i += 2; }
    else if (c === '"' || c === "'") quote = c;
  }
  return multi;
}

export function stripServerTables(text, names) {
  const targets = new Set(names), lines = text.split(/\r?\n/), out = [];
  let dropping = false, multi = null;
  for (const line of lines) {
    const parts = multi ? null : tableParts(line);
    if (parts) dropping = parts[0] === 'mcp_servers' && targets.has(parts[1]);
    if (!dropping) out.push(line);
    multi = multilineAfter(line, multi);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
