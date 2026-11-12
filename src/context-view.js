// Compact, project-scoped views. Relationships are evidence, never inferred policy.
const clip = (value, max) => {
  const s = String(value || '');
  if (s.length <= max) return s;
  let end = max - 1;
  if (/[\uD800-\uDBFF]/.test(s[end - 1])) end--;
  return s.slice(0, end) + '…';
};
const line = value => String(value || '').replace(/[\r\n\t]+/g, ' ');
const norm = value => line(value).trim().toLowerCase();
const fileKey = value => /^[a-z]:[\\/]|^\\\\/i.test(value) ? String(value).replace(/\\/g, '/').toLowerCase() : String(value);

function node(entry, selectedId, size) {
  const body = String(entry.content || '').trim();
  return {
    id: entry.id, type: entry.type,
    role: entry.id === selectedId ? 'selected_handoff' : entry.type === 'handoff' ? 'history' : 'entry',
    title: clip(line(entry.title), 160), date: entry.createdAt,
    ...(size ? { content: clip(body, size), partial: body.length > size } : {}),
  };
}

function links(entries) {
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      const b = entries[j];
      const body = a.content || '';
      const at = body.indexOf(b.id);
      const boundary = at >= 0 && !/[\w-]/.test(body[at - 1] || '') && !/[\w-]/.test(body[at + b.id.length] || '');
      if (boundary || body.includes('[[' + b.title + ']]')) out.push({ from: a.id, to: b.id, kind: 'mentions' });
      if (i > j) continue;
      for (const [field, kind] of [['tags', 'shared_tag'], ['files', 'shared_file']]) {
        const key = field === 'files' ? fileKey : norm;
        const values = new Set((b[field] || []).map(key));
        const evidence = [...new Set((a[field] || []).filter(v => key(v) && values.has(key(v))))].slice(0, 2);
        for (const value of evidence) out.push({ from: a.id, to: b.id, kind, evidence: clip(value, 120) });
      }
    }
  }
  return out;
}

function tree(view) {
  const lines = [
    `project ${view.project.name} | revision ${view.revision}`,
    `pending ${view.pending_count} | offset ${view.page.offset} | returned ${view.page.returned} | total ${view.page.total}`,
  ];
  if (view.archived_entries) lines.push(`archive ${view.archived_entries} | shared_read por ID`);
  for (const role of ['selected_handoff', 'entry', 'history']) {
    const nodes = view.nodes.filter(n => n.role === role);
    if (!nodes.length) continue;
    lines.push('+- ' + role + (role === 'selected_handoff' ? ' (vigencia no verificada)' : role === 'history' ? ' (no es estado vigente)' : ''));
    for (const n of nodes) {
      lines.push(`|  +- ${n.type} ${n.id} | ${(n.date || '').slice(0, 10)} | ${n.title}`);
      if (n.content) lines.push(...n.content.split('\n').map(s => '   ' + s));
      if (n.partial) lines.push('   [Vista parcial: shared_read.]');
    }
  }
  if (view.handoff_omitted) lines.push('[Handoff omitido por presupuesto; shared_read id=handoff.]');
  if (view.page.next_offset !== null) lines.push('next_offset ' + view.page.next_offset);
  if (view.partial) lines.push('[Vista parcial por presupuesto; paginar o ampliar con shared_read.]');
  lines.push('Ampliar: shared_read(id). Grafo: format=graph. Publicar solo a pedido.');
  return lines.join('\n');
}

export function contextView({ project, revision, entries, handoff, mode, includeContent, offset, total, pendingCount, archivedCount = 0, maxChars, format }) {
  const h = mode === 'omit' ? null : handoff;
  let page = [...entries];
  let contentSize = includeContent ? 1200 : 0;
  let handoffSize = mode === 'full' ? (h?.content.length || 0) : 1600;
  let keepHandoff = !!h, edgeBudget = 100, partial = false;
  const build = () => {
    const selected = [...(keepHandoff ? [h] : []), ...page.filter(e => !keepHandoff || e.id !== h.id)];
    const nodes = selected.map(e => node(e, handoff?.id, keepHandoff && e.id === h.id ? handoffSize : contentSize));
    const edges = format === 'graph' ? links(selected) : [];
    return {
      schema: 'sharedctx.context.v1', project: { slug: project.slug, name: clip(line(project.name), 120) }, revision,
      pending_count: pendingCount,
      ...(archivedCount ? { archived_entries: archivedCount } : {}),
      semantics: 'selected_handoff is selected, freshness unverified; history is not current policy; edges are evidence, not dependencies. Expand: shared_read(id).',
      page: { offset, returned: page.length, total, next_offset: entries.length > 0 && offset + page.length < total ? offset + page.length : null },
      nodes, ...(format === 'graph' ? { edges: edges.slice(0, edgeBudget), edges_omitted: Math.max(0, edges.length - edgeBudget) } : {}),
      ...(h && !keepHandoff ? { handoff_omitted: true } : {}), partial: partial || nodes.some(n => n.partial) || edges.length > edgeBudget,
    };
  };
  const serialize = view => format === 'graph' ? JSON.stringify(view) : tree(view);
  let view = build(), result = serialize(view);
  while (result.length > maxChars) {
    partial = true;
    if (handoffSize > 256 || contentSize > 256) { handoffSize = Math.min(handoffSize, 256); contentSize = Math.min(contentSize, 256); }
    else if (handoffSize || contentSize) { handoffSize = 0; contentSize = 0; }
    else if (edgeBudget) edgeBudget = 0;
    else if (page.length) page.pop();
    else if (keepHandoff) keepHandoff = false;
    else {
      // Even hostile/huge project names cannot cause invalid JSON or an oversized reply.
      view = { schema: 'sharedctx.context.v1', revision, partial: true, page: { offset, returned: 0, total, next_offset: offset < total ? offset : null }, retry: 'Increase max_chars or shared_read(id=handoff).' };
      result = format === 'graph' ? JSON.stringify(view) : `revision ${revision}\n[Presupuesto insuficiente. Aumentar max_chars o shared_read(id=handoff).]\nnext_offset ${offset}`;
      return { text: result, partial: true, returned: 0, nextOffset: offset < total ? offset : null };
    }
    view = build(); result = serialize(view);
  }
  return { text: result, partial: view.partial, returned: view.page.returned, nextOffset: view.page.next_offset };
}
