import { createHash } from 'node:crypto';

export function integer(value, fallback, max, name, min = 0) {
  const n = value === undefined ? fallback : value;
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name}: entero entre ${min} y ${max}.`);
  return n;
}

export function revision(entries, handoff = null) {
  return createHash('sha256').update(JSON.stringify([handoff, entries].map(x => x)))
    .digest('hex').slice(0, 20);
}

export function excerpt(value, size) {
  const text = String(value || '').trim();
  if (text.length <= size) return text;
  let end = size;
  if (end && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return text.slice(0, end) + '\n[Vista parcial; leer completa con shared_read. No asumir que contiene todas las decisiones.]';
}

export function entryMetadata(entry, { verbose = false } = {}) {
  const title = excerpt(entry.title.replace(/[\r\n]+/g, ' '), 220);
  const head = `- **${title}** · \`${entry.id}\` · ${entry.type}`;
  const tags = entry.tags.length ? ` · tags: ${entry.tags.slice(0, 8).join(', ')}` : '';
  const files = verbose && entry.files.length ? `\n  archivos: ${entry.files.slice(0, 5).join(', ')}` : '';
  const unresolved = entry.unresolvedFiles?.length ? ` · referencias pendientes: ${entry.unresolvedFiles.length}` : '';
  return `${head}${tags}${files}${unresolved}`;
}

// Apply a hard, explicit budget even when metadata or an entry is unusually large.
export function bounded(text, maxChars) {
  if (text.length <= maxChars) return text;
  const footer = '\n[Respuesta parcial por max_chars; continuar con shared_read (offset) o paginación.]';
  let end = maxChars - footer.length;
  if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return text.slice(0, end) + footer;
}

const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function searchEntries(entries, query) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200) throw new Error('query: texto de 2 a 200 caracteres.');
  const terms = [...new Set(normalize(query).match(/[\p{L}\p{N}_-]+/gu) || [])];
  if (!terms.length) throw new Error('query debe contener palabras.');
  return entries.map(entry => {
    const title = normalize(entry.title), tags = normalize(entry.tags.join(' '));
    const body = normalize(entry.content), files = normalize(entry.files.join(' '));
    if (!terms.every(t => title.includes(t) || tags.includes(t) || body.includes(t) || files.includes(t))) return null;
    const score = terms.reduce((s, t) => s + (title.includes(t) ? 6 : 0) + (tags.includes(t) ? 4 : 0) + (body.includes(t) ? 1 : 0) + (files.includes(t) ? 2 : 0), 0);
    const at = Math.max(0, body.indexOf(terms[0]));
    return { entry, score, snippet: entry.content.slice(Math.max(0, at - 60), at + 260).replace(/\s+/g, ' ') };
  }).filter(Boolean).sort((a, b) => b.score - a.score || String(b.entry.createdAt).localeCompare(String(a.entry.createdAt)));
}
