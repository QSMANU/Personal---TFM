/* Panel de QSMANU-LOCAL-SHARED-MCP — JS sin dependencias. */

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

let STATE = { overview: null, apps: [], projects: [], tools: [], pending: [], audit: [], graph: null };
let selected = null;

async function get(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/* ------------------------------------------------------------------ tarjetas */

function renderCards() {
  const o = STATE.overview;
  if (!o) return;
  const appsLive = STATE.apps.filter((a) => a.live);
  const cards = [
    { k: 'Modo de consentimiento', v: o.mode, s: o.modeHelp, cls: `badge ${o.mode}` },
    { k: 'Proyectos', v: o.counts.projects, s: 'con contexto guardado' },
    { k: 'Entradas', v: o.counts.entries, s: `${fmtBytes(o.counts.sizeBytes)} en disco` },
    { k: 'Apps conectadas', v: `${appsLive.length}/${STATE.apps.length}`, s: appsLive.length ? appsLive.map((a) => a.name).join(', ') : 'ninguna activa ahora' },
    { k: 'Pendientes', v: o.counts.pending, s: o.counts.pending ? 'esperando tu aprobación' : 'nada por aprobar' },
    { k: 'Última actividad', v: o.lastActivity ? fmtWhen(o.lastActivity).split(' · ')[1] : '—', s: o.lastActivity ? fmtWhen(o.lastActivity).split(' · ')[0] : 'sin registros' },
  ];
  $('#cards').innerHTML = cards.map((c) => `
    <div class="card">
      <div class="k">${esc(c.k)}</div>
      <div class="v ${c.cls ? '' : ''}">${c.cls ? `<span class="${c.cls}">${esc(c.v)}</span>` : esc(c.v)}</div>
      <div class="s">${esc(c.s)}</div>
    </div>`).join('');
  $('#home-path').textContent = o.home;
  const badge = $('#mode-badge');
  badge.textContent = o.mode;
  badge.className = `badge ${o.mode}`;
  $('#live-dot').className = `dot ${appsLive.length ? 'on' : ''}`;
  $('#stamp').textContent = `actualizado ${new Date(o.generatedAt).toLocaleTimeString('es-AR')}`;
}

/* --------------------------------------------------------------------- grafo */

const G = { nodes: [], edges: [], drag: null, hover: null, t: 0 };

function initGraph(data) {
  const canvas = $('#graph');
  const W = canvas.width = canvas.clientWidth * devicePixelRatio;
  const H = canvas.height = 520 * devicePixelRatio;
  const cx = W / 2;
  const cy = H / 2;

  G.nodes = data.nodes.map((n, i) => ({
    ...n,
    x: cx + Math.cos((i / Math.max(1, data.nodes.length)) * Math.PI * 2) * Math.min(W, H) * 0.3 + (Math.random() - 0.5) * 40,
    y: cy + Math.sin((i / Math.max(1, data.nodes.length)) * Math.PI * 2) * Math.min(W, H) * 0.3 + (Math.random() - 0.5) * 40,
    vx: 0, vy: 0,
    r: (n.kind === 'project' ? 14 + Math.min(22, Math.sqrt(n.weight || 1) * 7) : 11) * devicePixelRatio,
  }));
  G.edges = data.edges
    .map((e) => ({ ...e, a: G.nodes.find((n) => n.id === e.source), b: G.nodes.find((n) => n.id === e.target) }))
    .filter((e) => e.a && e.b);

  const pos = (ev) => {
    const r = canvas.getBoundingClientRect();
    const p = ev.touches ? ev.touches[0] : ev;
    return { x: (p.clientX - r.left) * devicePixelRatio, y: (p.clientY - r.top) * devicePixelRatio };
  };
  canvas.onmousedown = (ev) => {
    const { x, y } = pos(ev);
    G.drag = G.nodes.find((n) => Math.hypot(n.x - x, n.y - y) < n.r + 6) || null;
    if (G.drag) canvas.style.cursor = 'grabbing';
  };
  canvas.onmousemove = (ev) => {
    const { x, y } = pos(ev);
    if (G.drag) { G.drag.x = x; G.drag.y = y; G.drag.vx = G.drag.vy = 0; return; }
    G.hover = G.nodes.find((n) => Math.hypot(n.x - x, n.y - y) < n.r + 4) || null;
    canvas.style.cursor = G.hover ? 'pointer' : 'grab';
  };
  canvas.onmouseup = () => { G.drag = null; canvas.style.cursor = 'grab'; };
  canvas.onmouseleave = () => { G.drag = null; G.hover = null; };
  canvas.onclick = () => {
    if (G.hover && G.hover.kind === 'project') openProject(G.hover.slug);
  };
}

function stepGraph() {
  const canvas = $('#graph');
  if (!canvas || !G.nodes.length) return;
  const W = canvas.width; const H = canvas.height;
  const cx = W / 2; const cy = H / 2;

  for (let i = 0; i < G.nodes.length; i += 1) {
    const a = G.nodes[i];
    for (let j = i + 1; j < G.nodes.length; j += 1) {
      const b = G.nodes[j];
      let dx = b.x - a.x; let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy || 0.01;
      const min = (a.r + b.r) * 3.2;
      if (d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d * 0.06;
        dx *= push; dy *= push;
        a.x -= dx; a.y -= dy; b.x += dx; b.y += dy;
      }
    }
    // gravedad hacia el centro
    a.vx += (cx - a.x) * 0.0016;
    a.vy += (cy - a.y) * 0.0016;
  }

  for (const e of G.edges) {
    const dx = e.b.x - e.a.x; const dy = e.b.y - e.a.y;
    const d = Math.hypot(dx, dy) || 1;
    const target = 150 * devicePixelRatio;
    const f = (d - target) / d * 0.012 * Math.min(3, e.weight || 1);
    e.a.vx += dx * f; e.a.vy += dy * f;
    e.b.vx -= dx * f; e.b.vy -= dy * f;
  }

  for (const n of G.nodes) {
    if (G.drag === n) continue;
    n.vx *= 0.82; n.vy *= 0.82;
    n.x = Math.max(n.r, Math.min(W - n.r, n.x + n.vx));
    n.y = Math.max(n.r, Math.min(H - n.r, n.y + n.vy));
  }
}

function drawGraph() {
  const canvas = $('#graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 1 * devicePixelRatio;
  for (const e of G.edges) {
    const alpha = Math.min(0.85, 0.22 + (e.weight || 1) * 0.12);
    ctx.strokeStyle = `rgba(110,168,254,${alpha})`;
    ctx.lineWidth = Math.min(5, 0.8 + (e.weight || 1) * 0.7) * devicePixelRatio;
    ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
  }

  for (const n of G.nodes) {
    const isProject = n.kind === 'project';
    const hovered = G.hover === n || selected === n.slug;
    ctx.beginPath();
    if (isProject) ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    else {
      const r = n.r;
      ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r, n.y); ctx.lineTo(n.x, n.y + r); ctx.lineTo(n.x - r, n.y); ctx.closePath();
    }
    ctx.fillStyle = isProject ? 'rgba(110,168,254,.22)' : (n.live ? 'rgba(61,220,151,.35)' : 'rgba(199,146,234,.18)');
    ctx.fill();
    ctx.lineWidth = (hovered ? 3 : 1.6) * devicePixelRatio;
    ctx.strokeStyle = isProject ? '#6ea8fe' : (n.live ? '#3ddc97' : '#c792ea');
    ctx.stroke();

    if (isProject) {
      ctx.fillStyle = '#cfd6e4';
      ctx.font = `${11 * devicePixelRatio}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(n.weight ?? ''), n.x, n.y + 4 * devicePixelRatio);
    }

    ctx.fillStyle = hovered ? '#fff' : '#9aa3b2';
    ctx.font = `${11 * devicePixelRatio}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    const label = n.label.length > 34 ? `${n.label.slice(0, 32)}…` : n.label;
    ctx.fillText(label, n.x, n.y + n.r + 14 * devicePixelRatio);
    if (n.live) { ctx.fillStyle = '#3ddc97'; ctx.fillText('● conectada', n.x, n.y - n.r - 6 * devicePixelRatio); }
  }
}

function loopGraph() {
  if (STATE.graph) { stepGraph(); drawGraph(); }
  requestAnimationFrame(loopGraph);
}

/* ---------------------------------------------------------------- proyectos */

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
      <div class="row">
        <span>por app: ${Object.entries(p.byApp).map(([a, n]) => `<span class="pill">${esc(a)}: ${n}</span>`).join(' ') || '—'}</span>
      </div>
      <div class="row"><span>por tipo: ${Object.entries(p.byType).map(([t, n]) => `<span class="pill">${esc(t)}: ${n}</span>`).join(' ') || '—'}</span></div>
      <div class="row"><span>actividad (30 días)</span> ${spark(p.activity)}</div>
      ${p.handoff ? `<div class="handoff">${esc(p.handoff.content.trim())}</div>` : ''}
      <div class="row" style="margin-top:8px"><button onclick="openProject('${esc(p.slug)}')">Ver entradas</button></div>
    </div>`).join('');
}

async function openProject(slug) {
  selected = slug;
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

$('#drawer-close').onclick = () => { $('#drawer').classList.add('hidden'); selected = null; };

/* ---------------------------------------------------------------------- apps */

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

/* ------------------------------------------------------------------- métodos */

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

/* ---------------------------------------------------------------- pendientes */

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

/* ----------------------------------------------------------------- auditoría */

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

/* -------------------------------------------------------------------- carga */

async function refresh() {
  const [overview, apps, projects, tools, pending, audit, graph] = await Promise.all([
    get('/api/overview'), get('/api/apps'), get('/api/projects'), get('/api/tools'),
    get('/api/pending'), get('/api/audit?limit=120'), get('/api/graph'),
  ]);
  STATE = { overview, apps: apps.apps, projects: projects.projects, tools: tools.tools, pending: pending.pending, audit: audit.audit, graph };

  renderCards(); renderProjects(); renderApps(); renderTools(); renderPending(); renderAudit();

  const sameShape = G.nodes.length === graph.nodes.length
    && G.nodes.every((n) => graph.nodes.some((m) => m.id === n.id));
  if (!sameShape) initGraph(graph);
  else {
    G.edges = graph.edges.map((e) => ({ ...e, a: G.nodes.find((n) => n.id === e.source), b: G.nodes.find((n) => n.id === e.target) })).filter((e) => e.a && e.b);
    for (const n of G.nodes) {
      const act = graph.nodes.find((m) => m.id === n.id);
      if (act) { n.weight = act.weight; n.live = act.live; n.label = act.label; }
    }
  }
}

$('#tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-tab]');
  if (!btn) return;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${btn.dataset.tab}`));
});

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
loopGraph();
