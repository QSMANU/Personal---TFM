/* Panel de QSMANU-LOCAL-SHARED-MCP — JS sin dependencias.
   Dos grafos con el mismo motor: contexto (proyectos↔apps) y entradas (entradas↔tags↔archivos). */

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
const fmtWhen = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '—';
  const diff = (Date.now() - d) / 1000;
  const rel = diff < 60 ? 'hace instantes'
    : diff < 3600 ? `hace ${Math.round(diff / 60)} min`
    : diff < 86400 ? `hace ${Math.round(diff / 3600)} h`
    : `hace ${Math.round(diff / 86400)} d`;
  return `${d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} · ${rel}`;
};

const STATE = { overview: null, apps: [], projects: [], tools: [], pending: [], audit: [], graph: null, insights: null, related: null };
const COLORS = {
  project: '#6ea8fe', app: '#c792ea', appLive: '#3ddc97',
  entry: '#6ea8fe', tag: '#3ddc97', file: '#c792ea',
  tagEdge: 'rgba(61,220,151,.35)', fileEdge: 'rgba(199,146,234,.35)',
  mentionEdge: 'rgba(255,200,87,.6)', similarEdge: 'rgba(255,107,107,.7)',
};

async function get(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/* ================================================================== gráficos */

function makeGraph(canvasId, { onActivate } = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const st = { canvasEl: canvas, nodes: [], edges: [], drag: null, hover: null };

  const pos = (ev) => {
    const r = canvas.getBoundingClientRect();
    const p = ev.touches ? ev.touches[0] : ev;
    return { x: (p.clientX - r.left) * devicePixelRatio, y: (p.clientY - r.top) * devicePixelRatio };
  };

  canvas.onmousedown = (ev) => {
    const { x, y } = pos(ev);
    st.drag = st.nodes.find((n) => Math.hypot(n.x - x, n.y - y) < n.r + 8) || null;
    if (st.drag) canvas.style.cursor = 'grabbing';
  };
  canvas.onmousemove = (ev) => {
    const { x, y } = pos(ev);
    if (st.drag) { st.drag.x = x; st.drag.y = y; st.drag.vx = st.drag.vy = 0; return; }
    st.hover = st.nodes.find((n) => Math.hypot(n.x - x, n.y - y) < n.r + 5) || null;
    canvas.style.cursor = st.hover ? 'pointer' : 'grab';
  };
  canvas.onmouseup = () => { st.drag = null; canvas.style.cursor = 'grab'; };
  canvas.onmouseleave = () => { st.drag = null; st.hover = null; };
  canvas.onclick = () => { if (st.hover && onActivate) onActivate(st.hover); };

  return st;
}

function radiusFor(n) {
  const scale = devicePixelRatio;
  if (n.kind === 'project') return (14 + Math.min(24, Math.sqrt(n.weight || 1) * 7)) * scale;
  if (n.kind === 'app') return 11 * scale;
  if (n.kind === 'tag') return 7 * scale;
  if (n.kind === 'file') return 9 * scale;
  return (7 + Math.min(12, Math.sqrt((n.chars || 400) / 900))) * scale; // entry
}

function setGraphData(st, data) {
  if (!st) return;
  const canvas = st.canvasEl;
  if (!canvas) return;
  const ancho = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
  const W = ancho * devicePixelRatio;
  const H = (Number(canvas.getAttribute('height')) || 520) * devicePixelRatio;
  canvas.width = W;
  canvas.height = H;
  const cx = W / 2; const cy = H / 2;
  const total = Math.max(1, data.nodes.length);

  st.nodes = data.nodes.map((n, i) => ({
    ...n,
    x: cx + Math.cos((i / total) * Math.PI * 2) * Math.min(W, H) * (0.24 + (i % 3) * 0.06) + (Math.random() - 0.5) * 40,
    y: cy + Math.sin((i / total) * Math.PI * 2) * Math.min(W, H) * (0.24 + (i % 3) * 0.06) + (Math.random() - 0.5) * 40,
    vx: 0, vy: 0,
    r: radiusFor(n),
  }));
  st.edges = data.edges
    .map((e) => ({ ...e, a: st.nodes.find((n) => n.id === e.source), b: st.nodes.find((n) => n.id === e.target) }))
    .filter((e) => e.a && e.b);
}

function stepGraph(st) {
  if (!st || st.nodes.length === 0) return;
  const canvas = st.canvasEl;
  const W = canvas.width; const H = canvas.height;
  const cx = W / 2; const cy = H / 2;

  for (let i = 0; i < st.nodes.length; i += 1) {
    const a = st.nodes[i];
    for (let j = i + 1; j < st.nodes.length; j += 1) {
      const b = st.nodes[j];
      let dx = b.x - a.x; let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy || 0.01;
      const min = (a.r + b.r) * 2.6;
      if (d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.07;
        dx *= push; dy *= push;
        a.x -= dx; a.y -= dy; b.x += dx; b.y += dy;
      }
    }
    a.vx += (cx - a.x) * 0.0018;
    a.vy += (cy - a.y) * 0.0018;
  }

  for (const e of st.edges) {
    const dx = e.b.x - e.a.x; const dy = e.b.y - e.a.y;
    const d = Math.hypot(dx, dy) || 1;
    const target = (e.kind === 'tag' || e.kind === 'file' ? 90 : 165) * devicePixelRatio;
    const f = ((d - target) / d) * 0.012 * Math.min(3, e.weight || 1);
    e.a.vx += dx * f; e.a.vy += dy * f;
    e.b.vx -= dx * f; e.b.vy -= dy * f;
  }

  for (const n of st.nodes) {
    if (st.drag === n) continue;
    n.vx *= 0.84; n.vy *= 0.84;
    n.x = Math.max(n.r, Math.min(W - n.r, n.x + n.vx));
    n.y = Math.max(n.r, Math.min(H - n.r, n.y + n.vy));
  }
}

function drawGraph(st) {
  if (!st) return;
  const canvas = st.canvasEl;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const e of st.edges) {
    const color = e.kind === 'tag' ? COLORS.tagEdge
      : e.kind === 'file' ? COLORS.fileEdge
      : e.kind === 'menciona' ? COLORS.mentionEdge
      : e.kind === 'similar' ? COLORS.similarEdge
      : `rgba(110,168,254,${Math.min(0.85, 0.22 + (e.weight || 1) * 0.12)})`;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.min(5, 0.8 + (e.weight || 1) * 0.6) * devicePixelRatio;
    ctx.setLineDash(e.kind === 'similar' ? [5 * devicePixelRatio, 4 * devicePixelRatio] : []);
    ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const n of st.nodes) {
    const hovered = st.hover === n;
    const color = n.kind === 'app' ? (n.live ? COLORS.appLive : COLORS.app)
      : n.kind === 'tag' ? COLORS.tag
      : n.kind === 'file' ? COLORS.file
      : COLORS.entry;

    ctx.beginPath();
    if (n.kind === 'app') {
      ctx.moveTo(n.x, n.y - n.r); ctx.lineTo(n.x + n.r, n.y); ctx.lineTo(n.x, n.y + n.r); ctx.lineTo(n.x - n.r, n.y); ctx.closePath();
    } else if (n.kind === 'tag') {
      const r = n.r;
      ctx.rect(n.x - r, n.y - r, r * 2, r * 2);
    } else if (n.kind === 'file') {
      const r = n.r; const w = r * 1.9; const h = r * 1.4;
      ctx.moveTo(n.x - w / 2 + r * 0.4, n.y - h / 2);
      ctx.lineTo(n.x + w / 2, n.y - h / 2);
      ctx.lineTo(n.x + w / 2, n.y + h / 2);
      ctx.lineTo(n.x - w / 2 + r * 0.4, n.y + h / 2);
      ctx.lineTo(n.x - w / 2, n.y);
      ctx.closePath();
    } else {
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    }
    ctx.fillStyle = `${color}2e`;
    ctx.fill();
    ctx.lineWidth = (hovered ? 3 : 1.6) * devicePixelRatio;
    ctx.strokeStyle = color;
    ctx.stroke();

    if (n.kind === 'project' || n.kind === 'file') {
      ctx.fillStyle = '#cfd6e4';
      ctx.font = `${10 * devicePixelRatio}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      if (n.kind === 'project') ctx.fillText(String(n.weight ?? ''), n.x, n.y + 4 * devicePixelRatio);
    }

    if (n.kind !== 'tag' && n.kind !== 'file') {
      ctx.fillStyle = hovered ? '#fff' : '#9aa3b2';
      ctx.font = `${11 * devicePixelRatio}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      const label = String(n.label || '').length > 30 ? `${String(n.label).slice(0, 28)}…` : String(n.label || '');
      ctx.fillText(label, n.x, n.y + n.r + 13 * devicePixelRatio);
    } else if (hovered) {
      ctx.fillStyle = '#fff';
      ctx.font = `${10 * devicePixelRatio}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, n.y - n.r - 6 * devicePixelRatio);
    }

    if (n.live) {
      ctx.fillStyle = COLORS.appLive;
      ctx.font = `${10 * devicePixelRatio}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('● conectada', n.x, n.y - n.r - 6 * devicePixelRatio);
    }
  }
}

const GRAPH_CONTEXT = makeGraph('graph', { onActivate: (n) => n.kind === 'project' && openProject(n.slug) });
const GRAPH_ENTRIES = makeGraph('egraph', { onActivate: (n) => { if (n.kind === 'entry') openEntry(n.project, n.entryId, n.label); } });

function loopGraphs() {
  for (const st of [GRAPH_CONTEXT, GRAPH_ENTRIES]) {
    if (!st.canvasEl) continue;
    if (st.nodes.length) { stepGraph(st); drawGraph(st); }
  }
  requestAnimationFrame(loopGraphs);
}

/* ================================================================== tarjetas */

function renderCards() {
  const o = STATE.overview;
  if (!o) return;
  const appsLive = STATE.apps.filter((a) => a.live);
  const salud = o.health?.score ?? 100;
  const clase = salud >= 85 ? 'good' : salud >= 60 ? 'mid' : 'bad';
  const cards = [
    { k: 'Modo de consentimiento', v: `<span class="badge ${o.mode}">${esc(o.mode)}</span>`, s: o.modeHelp },
    { k: 'Salud del contexto', v: `<span class="score ${clase}">${salud}</span><span class="hint">/100</span>`, s: `${o.health?.warnings || 0} aviso(s) · ${o.health?.tips || 0} sugerencia(s)` },
    { k: 'Proyectos', v: esc(o.counts.projects), s: `${o.counts.entries} entradas · ${fmtBytes(o.counts.sizeBytes)}` },
    { k: 'Apps conectadas', v: `${appsLive.length}/${STATE.apps.length}`, s: appsLive.length ? appsLive.map((a) => a.name).join(', ') : 'ninguna activa ahora' },
    { k: 'Pendientes', v: esc(o.counts.pending), s: o.counts.pending ? 'esperando tu aprobación' : 'nada por aprobar' },
    { k: 'Última actividad', v: o.lastActivity ? esc(fmtWhen(o.lastActivity).split(' · ')[1]) : '—', s: o.lastActivity ? esc(fmtWhen(o.lastActivity).split(' · ')[0]) : 'sin registros' },
  ];
  $('#cards').innerHTML = cards.map((c) => `
    <div class="card">
      <div class="k">${esc(c.k)}</div>
      <div class="v">${c.v}</div>
      <div class="s">${c.s}</div>
    </div>`).join('');
  $('#home-path').textContent = o.home;
  const badge = $('#mode-badge');
  badge.textContent = o.mode;
  badge.className = `badge ${o.mode}`;
  $('#live-dot').className = `dot ${appsLive.length ? 'on' : ''}`;
  $('#stamp').textContent = `actualizado ${new Date(o.generatedAt).toLocaleTimeString('es-AR')}`;
}

/* ============================================================ grafo de entradas */

let EG = { project: null, tags: true, files: true, stats: null };

async function loadEntryGraph() {
  if (!EG.project && STATE.projects.length) EG.project = STATE.overview?.activeProject?.slug || STATE.projects[0].slug;
  if (!EG.project) return;
  const data = await get(`/api/entrygraph?project=${encodeURIComponent(EG.project)}&tags=${EG.tags ? 1 : 0}&files=${EG.files ? 1 : 0}`);
  setGraphData(GRAPH_ENTRIES, data);
  EG.stats = data.stats;
  const kinds = Object.entries(data.stats.byKind || {}).map(([k, n]) => `${k}: ${n}`).join(' · ');
  $('#eg-stats').textContent = `${data.stats.entries} entradas · ${data.stats.tags} etiquetas · ${data.stats.files} archivos · ${data.stats.links} relaciones (${kinds || 'sin relaciones'}) · ${data.stats.isolated} sin relación · ${data.stats.duplicates.length} posible(s) duplicado(s)`;
}

function renderInsights() {
  const data = STATE.insights;
  if (!data) return;
  const clase = data.score >= 85 ? 'good' : data.score >= 60 ? 'mid' : 'bad';
  const listado = data.insights.length
    ? data.insights.map((i) => `
      <div class="insight ${esc(i.severity)}">
        <h4>${i.severity === 'warn' ? '⚠ ' : i.severity === 'tip' ? '💡 ' : 'ℹ '}${esc(i.title)}</h4>
        <p>${esc(i.detail)}</p>
        ${i.items.length ? `<ul>${i.items.slice(0, 8).map((x) => `<li>${esc(x.label)}${x.ref ? ` <span class="mono">${esc(x.ref)}</span>` : ''}</li>`).join('')}${i.items.length > 8 ? `<li>… y ${i.items.length - 8} más</li>` : ''}</ul>` : ''}
        ${i.action ? `<div><code class="cmd">${esc(i.action)}</code></div>` : ''}
      </div>`).join('')
    : '<p class="hint">Nada para mejorar: el contexto está bien conectado, con handoff y etiquetas.</p>';

  $('#insights').innerHTML = `
    <div class="panel-head">
      <h2>Diagnóstico · salud <span class="score ${clase}">${data.score}</span><span class="hint">/100</span></h2>
      <p class="hint">Qué conviene arreglar para que el contexto rinda más (y el MCP sea más útil): ${esc(data.scope)}.</p>
    </div>
    ${listado}`;
}

async function openEntry(slug, id, title) {
  const { entry } = await get(`/api/entry?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(id)}`);
  if (!entry) return;
  const { related } = await get(`/api/related?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(id)}&limit=6`);
  $('#drawer-title').textContent = title || entry.title;
  $('#drawer-body').innerHTML = `
    <div class="tag">${esc(entry.type)} · ${esc(entry.app)} · ${esc(fmtWhen(entry.createdAt))} · <span class="mono">${esc(entry.id)}</span></div>
    ${entry.tags.length ? `<div class="tag">tags: ${esc(entry.tags.join(', '))}</div>` : ''}
    ${entry.files.length ? `<div class="tag">archivos: ${entry.files.map((f) => `<span class="mono">${esc(f)}</span>`).join(', ')}</div>` : ''}
    <pre>${esc(entry.content.trim())}</pre>
    ${related && related.length ? `<h3 style="font-size:13px;margin-top:16px">Relacionadas (así las encontraría el modelo)</h3>${related.map((r) => `
      <div class="entry"><h4>${esc(r.title)}</h4><div class="tag">${esc(r.type)} · ${esc(r.app)} · ${esc(r.razones.join(' · '))}</div></div>`).join('')}` : '<p class="hint" style="margin-top:12px">Sin entradas relacionadas.</p>'}`;
  $('#drawer').classList.remove('hidden');
}

/* ================================================================ proyectos */

function spark(activity) {
  const max = Math.max(1, ...activity.map((a) => a.count));
  return `<div class="spark">${activity.map((a) => `<i class="${a.count ? 'on' : ''}" style="height:${Math.max(2, (a.count / max) * 26)}px" title="${a.date}: ${a.count}"></i>`).join('')}</div>`;
}

function renderProjects() {
  const el = $('#projects');
  if (!STATE.projects.length) { el.innerHTML = '<p class="hint">Todavía no hay proyectos con contexto.</p>'; return; }
  el.innerHTML = STATE.projects.map((p) => `
    <div class="proj">
      <h3>${esc(p.name)} <span class="mono">${esc(p.slug)}</span></h3>
      <div class="row">
        <span><b>${p.entries}</b> entradas</span>
        <span>última: ${esc(fmtWhen(p.lastUpdate))}</span>
        <span>handoff: ${p.handoff ? 'sí' : 'no'}</span>
        ${p.aliases.length ? `<span>alias: ${esc(p.aliases.join(' · '))}</span>` : ''}
        ${p.roots.length ? `<span>rutas: ${esc(p.roots.join(' · '))}</span>` : ''}
      </div>
      <div class="row"><span>por app: ${Object.entries(p.byApp).map(([a, n]) => `<span class="pill">${esc(a)}: ${n}</span>`).join(' ') || '—'}</span></div>
      <div class="row"><span>por tipo: ${Object.entries(p.byType).map(([t, n]) => `<span class="pill">${esc(t)}: ${n}</span>`).join(' ') || '—'}</span></div>
      <div class="row"><span>actividad (30 días)</span> ${spark(p.activity)}</div>
      ${p.handoff ? `<div class="handoff">${esc(p.handoff.content.trim())}</div>` : ''}
      <div class="row" style="margin-top:8px">
        <button onclick="openProject('${esc(p.slug)}')">Ver entradas</button>
        <button onclick="verGrafo('${esc(p.slug)}')">Ver grafo</button>
      </div>
    </div>`).join('');
}

async function openProject(slug) {
  const { entries } = await get(`/api/entries?project=${encodeURIComponent(slug)}&limit=200`);
  const proj = STATE.projects.find((p) => p.slug === slug);
  $('#drawer-title').textContent = proj ? proj.name : slug;
  $('#drawer-body').innerHTML = entries.length ? entries.map((e) => `
    <div class="entry">
      <h4>${esc(e.title)}</h4>
      <div class="tag">${esc(e.type)} · ${esc(e.app)} · ${esc(fmtWhen(e.createdAt))} · <span class="mono">${esc(e.id)}</span></div>
      ${e.tags.length ? `<div class="tag">tags: ${esc(e.tags.join(', '))}</div>` : ''}
      ${e.files.length ? `<div class="tag">archivos: ${e.files.map((f) => `<span class="mono">${esc(f)}</span>`).join(', ')}</div>` : ''}
      <pre>${esc(e.content.trim())}</pre>
    </div>`).join('') : '<p class="hint">Sin entradas.</p>';
  $('#drawer').classList.remove('hidden');
}

function verGrafo(slug) {
  EG.project = slug;
  $('#eg-project').value = slug;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'entradas'));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-entradas'));
  loadEntryGraph().catch(() => {});
}

$('#drawer-close').onclick = () => { $('#drawer').classList.add('hidden'); };

/* ====================================================================== apps */

function renderApps() {
  const el = $('#apps');
  el.innerHTML = `
    <div class="panel-head"><h2>Apps y su configuración</h2>
    <p class="hint">“Conectada ahora” sale del heartbeat real de cada proceso MCP; “configurada” de leer el archivo de config de la app.</p></div>
    <table>
      <thead><tr><th>App</th><th>Estado</th><th>Proyecto actual</th><th>Proyectos con contexto</th><th>Última actividad</th><th>Config</th></tr></thead>
      <tbody>${STATE.apps.map((a) => `
        <tr>
          <td><b>${esc(a.name)}</b><div class="tag">${esc(a.notes || '')}</div></td>
          <td>
            ${a.live ? '<span class="pill live">conectada ahora</span>' : (a.configured ? '<span class="pill ok">configurada</span>' : '<span class="pill bad">sin conectar</span>')}
            <div class="tag">${esc(a.detail)}${a.sessions.length ? ` · ${a.sessions.length} sesión(es)` : ''}</div>
          </td>
          <td>${a.lastProject ? `<span class="mono">${esc(a.lastProject)}</span>` : '—'}</td>
          <td>${a.projects.length ? a.projects.map((p) => `<span class="pill dim">${esc(p)}</span>`).join(' ') : '—'}</td>
          <td class="mono-cell">${esc(fmtWhen(a.lastActivity))}</td>
          <td class="mono-cell">${esc(a.config)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="hint" style="margin-top:12px">Las apps leen su configuración al arrancar. Si una dice “configurada” pero no aparece conectada, cerrala y volvé a abrirla.</p>`;
}

/* =================================================================== métodos */

function renderTools() {
  const el = $('#tools');
  el.innerHTML = `
    <div class="panel-head"><h2>Métodos MCP expuestos</h2>
    <p class="hint">${STATE.tools.length} herramientas, ninguna de archivos, shell, git ni borrado masivo. El modo de consentimiento NO es una de ellas: se cambia por CLI.</p></div>
    ${STATE.tools.map((t) => `
      <details>
        <summary>${esc(t.name)} — ${esc(t.description.split('.')[0])}</summary>
        <p class="hint" style="margin:8px 0">${esc(t.description)}</p>
        <pre>${esc(JSON.stringify(t.inputSchema, null, 2))}</pre>
      </details>`).join('')}
    <details><summary>Instrucciones que recibe el modelo (protocolo opt-in)</summary><pre>${esc(STATE.overview?.instructions || '')}</pre></details>`;
}

/* ================================================================ pendientes */

function renderPending() {
  const el = $('#pending');
  if (!STATE.pending.length) { el.innerHTML = '<div class="panel-head"><h2>Pendientes</h2><p class="hint">Nada esperando aprobación.</p></div>'; return; }
  el.innerHTML = `
    <div class="panel-head"><h2>Pendientes de aprobación (${STATE.pending.length})</h2>
    <p class="hint">El panel es de solo lectura: aprobá desde la terminal con el comando que figura abajo.</p></div>
    ${STATE.pending.map((p) => `
      <div class="proj">
        <h3>${esc(p.title)}</h3>
        <div class="row"><span>proyecto: <span class="mono">${esc(p.project)}</span></span><span>tipo: ${esc(p.type)}</span><span>pedido por: ${esc(p.app)}</span><span>${esc(fmtWhen(p.createdAt))}</span></div>
        <pre class="handoff">${esc(p.content.trim())}</pre>
        <div class="row" style="margin-top:8px"><code class="cmd">sharedctx approve ${esc(p.id)}</code></div>
      </div>`).join('')}`;
}

/* ================================================================= auditoría */

function renderAudit() {
  const el = $('#audit');
  el.innerHTML = `
    <div class="panel-head"><h2>Auditoría (últimos ${STATE.audit.length} eventos)</h2>
    <p class="hint">Cada lectura, publicación, aprobación y cambio de modo queda registrado en <span class="mono">audit.log</span>.</p></div>
    <table>
      <thead><tr><th>Cuándo</th><th>Acción</th><th>App</th><th>Proyecto</th><th>Id</th></tr></thead>
      <tbody>${STATE.audit.map((a) => `
        <tr>
          <td class="mono-cell">${esc(fmtWhen(a.ts))}</td>
          <td>${esc(a.action)}</td>
          <td>${esc(a.app || '')}</td>
          <td class="mono-cell">${esc(a.project || '')}</td>
          <td class="mono-cell">${esc(a.id || a.pendingId || '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

/* ==================================================================== carga */

function renderProjectSelect() {
  const sel = $('#eg-project');
  const actual = EG.project || sel.value;
  sel.innerHTML = STATE.projects.map((p) => `<option value="${esc(p.slug)}">${esc(p.name)} (${p.entries})</option>`).join('');
  if (actual && STATE.projects.some((p) => p.slug === actual)) sel.value = actual;
  EG.project = sel.value || null;
}

async function refresh() {
  const [overview, apps, projects, tools, pending, audit, graph, diagnostics] = await Promise.all([
    get('/api/overview'), get('/api/apps'), get('/api/projects'), get('/api/tools'),
    get('/api/pending'), get('/api/audit?limit=120'), get('/api/graph'), get('/api/insights'),
  ]);
  Object.assign(STATE, { overview, apps: apps.apps, projects: projects.projects, tools: tools.tools, pending: pending.pending, audit: audit.audit, graph, insights: diagnostics });

  renderCards(); renderProjects(); renderApps(); renderTools(); renderPending(); renderAudit(); renderInsights();
  renderProjectSelect();

  const misma = GRAPH_CONTEXT.nodes.length === graph.nodes.length && GRAPH_CONTEXT.nodes.every((n) => graph.nodes.some((m) => m.id === n.id));
  if (!misma) setGraphData(GRAPH_CONTEXT, graph);
  else {
    GRAPH_CONTEXT.edges = graph.edges.map((e) => ({ ...e, a: GRAPH_CONTEXT.nodes.find((n) => n.id === e.source), b: GRAPH_CONTEXT.nodes.find((n) => n.id === e.target) })).filter((e) => e.a && e.b);
    for (const n of GRAPH_CONTEXT.nodes) {
      const act = graph.nodes.find((m) => m.id === n.id);
      if (act) { n.weight = act.weight; n.live = act.live; n.label = act.label; }
    }
  }

  // El grafo de entradas se recalcula cuando cambia el proyecto o los datos.
  await loadEntryGraph();
}

/* ================================================================== eventos */

$('#tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-tab]');
  if (!btn) return;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${btn.dataset.tab}`));
  if (btn.dataset.tab === 'entradas') loadEntryGraph().catch(() => {});
});

$('#eg-project').onchange = (ev) => { EG.project = ev.target.value; loadEntryGraph().catch(() => {}); };
$('#eg-tags').onchange = (ev) => { EG.tags = ev.target.checked; loadEntryGraph().catch(() => {}); };
$('#eg-files').onchange = (ev) => { EG.files = ev.target.checked; loadEntryGraph().catch(() => {}); };
$('#eg-dot').onclick = async () => {
  const { dot } = await get(`/api/dot?project=${encodeURIComponent(EG.project || '')}`);
  const blob = new Blob([dot], { type: 'text/vnd.graphviz' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${EG.project || 'contexto'}.dot`;
  a.click();
  URL.revokeObjectURL(a.href);
};

$('#refresh').onclick = () => refresh().catch((e) => console.error(e));

let timer = null;
function setAuto(on) {
  if (timer) clearInterval(timer);
  timer = on ? setInterval(() => refresh().catch(() => {}), 5000) : null;
}
$('#auto').onchange = (ev) => setAuto(ev.target.checked);

refresh().then(() => setAuto(true)).catch((err) => {
  document.body.insertAdjacentHTML('afterbegin', `<p style="padding:16px;color:#ff6b6b">Error cargando el panel: ${esc(err.message)}</p>`);
});
loopGraphs();
