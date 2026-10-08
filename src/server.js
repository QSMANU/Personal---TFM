/**
 * server.js — superficie MCP del contexto compartido.
 *
 * Seis herramientas, ninguna destructiva y ninguna capaz de cambiar el modo de
 * consentimiento (eso es solo por CLI). Las descripciones de las herramientas
 * son el contrato de "solo si quiero": le dicen al modelo, explícitamente, que
 * no debe publicar ni leer otro proyecto si el usuario no lo pidió.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  ENTRY_TYPES, MODES, audit, addPending, canRead, deleteEntry, describeGate,
  detectProject, ensureProject, findProjectMatch, getActive, getConfig, getHandoff, getHome,
  getLastProjectForApp, getProject, listEntries, listPending, listProjects, log, readDshWorkspaces,
  readEntry, rememberProjectIdentity, setLastProjectForApp, slugify, suggestProjects,
  touchSession, writeEntry,
} from './store.js';
import { relatedEntries } from './relations.js';

const SERVER_NAME = 'QSMANU-LOCAL-SHARED-MCP';
const SERVER_VERSION = '0.3.0';

export { SERVER_NAME, SERVER_VERSION, TOOLS, OPT_IN_PROTOCOL };

const OPT_IN_PROTOCOL = `Contexto compartido local (QSMANU-LOCAL-SHARED-MCP) entre herramientas de AI.

Este servidor guarda contexto en el disco del usuario, separado POR PROYECTO, para poder
saltar de una herramienta a otra sin perder el hilo. El mismo proyecto suele tener el mismo
nombre en todas las apps, así que la detección es automática: usa el nombre que devuelve
shared_status y NO preguntes en qué proyecto está el usuario salvo que shared_status diga
"sin determinar".

Reglas que debés respetar siempre:
1. NUNCA publiques ni actualices el handoff por iniciativa propia. Solo cuando el usuario lo
   pida explícitamente ("guardá esto en el contexto compartido", "publicá el handoff", etc.).
2. NUNCA leas otro proyecto distinto del proyecto activo, salvo pedido explícito del usuario;
   para eso existe confirm_cross_project y hay que decirlo antes de usarlo.
3. El contexto compartido es un complemento del trabajo, no un registro automático de la
   conversación: publicá resúmenes útiles (decisiones, estado, próximos pasos), no transcripciones.
4. Si shared_publish responde "pendiente de aprobación", avisale al usuario el id y que debe
   aprobarlo con \`sharedctx approve <id>\` (o \`sharedctx approve all\`).
5. El modo de consentimiento lo cambia únicamente el usuario por CLI; no intentes cambiarlo.
6. Solo si shared_status dice "sin determinar": preguntale al usuario en qué proyecto trabaja y
   fijalo con \`shared_use_project\` (confirm: true), o decile que corra \`sharedctx use "<proyecto>"\`
   una vez para fijarlo en todas las apps.`;

const TOOLS = [
  {
    name: 'shared_status',
    description:
      'Estado del contexto compartido local: modo de consentimiento, proyecto detectado, cantidad de entradas y publicaciones pendientes. Usalo al empezar a trabajar o cuando necesites saber si el usuario habilitó la compartición.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'shared_pull',
    description:
      'Lee el contexto compartido del proyecto activo: la nota de traspaso (handoff) y las últimas entradas. Usalo cuando el usuario pida "traé el contexto", "en qué quedamos", "seguí desde donde estaba" o al continuar trabajo hecho en otra herramienta. Es de solo lectura y está limitado al proyecto activo salvo pedido explícito del usuario (confirm_cross_project).',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Nombre del proyecto. Omitilo para usar el proyecto detectado automáticamente.' },
        limit: { type: 'number', description: 'Cantidad máxima de entradas recientes (por defecto 8, máximo 50).' },
        include_content: { type: 'boolean', description: 'Si es true, incluye el cuerpo completo de las entradas (por defecto false: solo títulos y metadata).' },
        type: { type: 'string', enum: ENTRY_TYPES, description: 'Filtra por tipo de entrada.' },
        confirm_cross_project: { type: 'boolean', description: 'Debe ser true solo si el usuario pidió explícitamente leer OTRO proyecto. Queda auditado.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'shared_list',
    description: 'Lista los proyectos con contexto compartido y sus entradas (títulos y metadata, sin cuerpos). Útil para que el usuario elija qué proyecto retomar.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Si se indica, lista las entradas de ese proyecto; si se omite, lista los proyectos.' },
        limit: { type: 'number', description: 'Máximo de entradas a listar (por defecto 20).' },
        type: { type: 'string', enum: ENTRY_TYPES, description: 'Filtra por tipo de entrada.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'shared_publish',
    description:
      'Publica contexto en el almacén compartido para que otras herramientas lo lean. Llamala ÚNICAMENTE cuando el usuario lo pida de forma explícita; nunca por iniciativa propia ni como resumen automático de la conversación. Respeta el modo de consentimiento: en modo "ask" la publicación queda pendiente de aprobación humana.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título corto y descriptivo.' },
        content: { type: 'string', description: 'Contenido en Markdown: estado, decisiones, próximos pasos, rutas relevantes.' },
        type: { type: 'string', enum: ENTRY_TYPES, description: 'Tipo de entrada (por defecto "note"; usá "handoff" para "dónde quedé").' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas libres.' },
        files: { type: 'array', items: { type: 'string' }, description: 'Rutas de archivos relevantes.' },
        project: { type: 'string', description: 'Proyecto destino. Omitilo para usar el detectado.' },
        confirm: { type: 'boolean', description: 'Debe ser true: declara que el usuario pidió esta publicación.' },
      },
      required: ['title', 'content', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'shared_use_project',
    description:
      'Fija el proyecto activo: para esta sesión (en memoria) y como memoria de esta app para las próximas. Usalo cuando el usuario diga en qué proyecto trabaja y la autodetección no coincida o no sea segura, por ejemplo en apps que lanzan el servidor desde otra carpeta. Requiere confirm: true.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Nombre del proyecto a fijar (vacío para volver a la autodetección).' },
        confirm: { type: 'boolean', description: 'Debe ser true.' },
      },
      required: ['confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'shared_related',
    description:
      'Devuelve las entradas del proyecto activo más relacionadas con una entrada (o con el handoff, si no se indica id): las que comparten etiquetas, archivos, se mencionan o tienen contenido parecido. Usala para traer solo el vecindario relevante en vez de todo el contexto. Solo lectura.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Id de la entrada base. Si se omite, se usa el handoff del proyecto.' },
        project: { type: 'string', description: 'Proyecto. Omitilo para usar el detectado.' },
        limit: { type: 'number', description: 'Cuántas entradas relacionadas devolver (por defecto 6, máximo 20).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'shared_pending',
    description: 'Lista las publicaciones que están esperando la aprobación del usuario (modo "ask"). Solo lectura.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'shared_forget',
    description:
      'Elimina una entrada del contexto compartido (por ejemplo si se publicó información equivocada). Requiere que el usuario lo pida explícitamente; en modo "ask" pasa a pendiente de aprobación y en "on" se aplica al instante.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Id de la entrada a eliminar.' },
        project: { type: 'string', description: 'Proyecto de la entrada. Omitilo para usar el detectado.' },
        confirm: { type: 'boolean', description: 'Debe ser true.' },
      },
      required: ['id', 'confirm'],
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ helpers */

function text(value) {
  return { content: [{ type: 'text', text: value }] };
}

function fail(value) {
  return { content: [{ type: 'text', text: value }], isError: true };
}

/**
 * Proyecto fijado a mano para esta sesión del servidor (solo memoria).
 * Sirve para apps que lanzan el proceso desde un cwd que no es el proyecto.
 */
let pinnedProject = null;

const APP = () => process.env.SHARED_MCP_APP || 'desconocida';

/**
 * Resolución del proyecto, de la señal más fuerte a la más débil:
 *   1. argumento `project` de la herramienta
 *   2. proyecto fijado en la sesión (`shared_use_project`)
 *   3. SHARED_MCP_PROJECT / .sharedctx.json / git / cwd  (señales del propio proceso)
 *   4. workspace de DeepSeek Harness (title + path)
 *   5. último proyecto usado por ESTA app
 *   6. proyecto activo global (`sharedctx use`)
 *
 * Nunca crea carpetas: leer el estado no debe ensuciar el almacén.
 */
function resolveProject(explicit, { create = false } = {}) {
  if (explicit) {
    const match = findProjectMatch(explicit);
    let name = match ? match.name : explicit;
    let slug = match ? match.slug : slugify(explicit);
    if (create) {
      // Proyecto pedido a mano: NO se usa la raíz del cwd (podría ser otro proyecto).
      const meta = ensureProject(name);
      name = meta.name; slug = meta.slug;
    }
    return { slug, name, source: match ? `pedido (${match.matchedBy})` : 'pedido', matchedBy: match?.matchedBy || null, reliable: true };
  }

  if (pinnedProject) {
    const match = findProjectMatch(pinnedProject);
    let name = match ? match.name : pinnedProject;
    let slug = match ? match.slug : slugify(pinnedProject);
    if (create) { const meta = ensureProject(name); name = meta.name; slug = meta.slug; }
    return { slug, name, source: 'fijado en la sesión', matchedBy: 'pin', reliable: true };
  }

  const detected = detectProject();
  if (detected.reliable) {
    const match = findProjectMatch(detected.name) || findProjectMatch(detected.root);
    let name = match ? match.name : detected.name;
    let slug = match ? match.slug : detected.slug;
    if (create) {
      const meta = ensureProject(name, { root: detected.root });
      name = meta.name; slug = meta.slug;
    }
    return { slug, name, root: detected.root, source: match ? `ruta/cwd (${match.matchedBy})` : `cwd (${detected.source})`, matchedBy: match?.matchedBy || detected.source, reliable: true, fromEnv: detected.source === 'env' };
  }

  // Apps de escritorio: el workspace de DSH trae el nombre que el usuario usa en todas partes.
  if (APP() === 'dsh') {
    const ws = readDshWorkspaces();
    if (ws && !ws.ambiguous) {
      const top = ws.mostRecent;
      const match = findProjectMatch(top.title) || findProjectMatch(top.path);
      let name = match ? match.name : (top.title || detected.name);
      let slug = match ? match.slug : slugify(name);
      if (create) {
        const meta = ensureProject(name, { root: top.path, aliases: top.title ? [top.title] : [] });
        name = meta.name; slug = meta.slug;
      }
      return { slug, name, root: top.path, source: `workspace de DSH${match ? ` (${match.matchedBy})` : ''}`, matchedBy: match?.matchedBy || 'workspace-dsh', reliable: true };
    }
    if (ws && ws.ambiguous) {
      return { slug: null, name: null, root: detected.root, source: 'workspace de DSH ambiguo', reliable: false, ambiguous: true };
    }
  }

  const sticky = getLastProjectForApp(APP());
  if (sticky && getProject(sticky)) {
    return { slug: sticky, name: getProject(sticky).name, source: `último proyecto usado en ${APP()}`, matchedBy: 'sticky', reliable: true };
  }

  const active = getActive();
  if (active && getProject(active.slug)) {
    return { slug: active.slug, name: active.name, source: 'proyecto activo global (sharedctx use)', matchedBy: 'active', reliable: true };
  }

  // Nada confiable: devolvemos SIN proyecto (no inventamos uno con el cwd del sistema).
  return { slug: null, name: null, root: detected.root, source: detected.source, reliable: false };
}

/** Registra el acierto para que la próxima vez no haga falta preguntar. */
function rememberUsage(resolved, { aliases = [], roots = [] } = {}) {
  if (!resolved?.slug) return;
  try {
    setLastProjectForApp(APP(), resolved.slug);
    // Si el proyecto vino de una variable de entorno, NO reclamamos la carpeta actual:
    // el cwd puede ser de otro proyecto distinto al que la app tiene fijado.
    const raices = resolved.fromEnv ? roots : [resolved.root, ...roots];
    rememberProjectIdentity(resolved.slug, { aliases: [resolved.name, ...aliases], roots: raices });
  } catch { /* el registro es best-effort */ }
}

/** Cuando no hay proyecto confiable, ofrecemos la lista para que elija el usuario. */
function unknownProjectHint(active) {
  const projects = listProjects();
  const lista = projects.length
    ? projects.map((p) => `- \`${p.slug}\` — ${p.name} (${p.entries} entradas)`).join('\n')
    : '(todavía no hay proyectos con contexto compartido)';
  const dsh = APP() === 'dsh' ? readDshWorkspaces() : null;
  return [
    `No pude determinar el proyecto activo (señal usada: ${active.source || 'ninguna'}; cwd: \`${active.root || '?'}\`).`,
    dsh?.ambiguous ? `Hay varios workspaces de DSH recientes, así que no quise adivinar.` : null,
    ``,
    `Proyectos conocidos:`,
    lista,
    ``,
    `Opciones, en orden de comodidad:`,
    `1. Que el usuario corra una vez \`sharedctx use "<proyecto>"\` en su terminal: fija el proyecto activo para TODAS las apps.`,
    `2. \`shared_use_project\` con { project: "<nombre o slug>", confirm: true }: lo fija para esta sesión y esta app.`,
    `3. Pasar \`project\` en cada llamada.`,
    ``,
    `Los nombres con el mismo significado se emparejan solos ("Personal - Shared-MCP-Local" ≡ "personal-shared-mcp-local").`,
  ].filter(Boolean).join('\n');
}

function fmtEntry(entry, { includeContent = false } = {}) {
  const head = `- **${entry.title}** · \`${entry.id}\` · ${entry.type} · ${entry.app} · ${entry.createdAt}`;
  const tags = entry.tags.length ? `\n  tags: ${entry.tags.join(', ')}` : '';
  const files = entry.files.length ? `\n  archivos: ${entry.files.map((f) => `\`${f}\``).join(', ')}` : '';
  const body = includeContent ? `\n\n${entry.content.trim()}` : '';
  return `${head}${tags}${files}${body}`;
}

/* ------------------------------------------------------------------ server */

export function createServer() {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: OPT_IN_PROTOCOL },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const cfg = getConfig();
    // Heartbeat para que el panel muestre esta app como conectada ahora mismo.
    touchSession(APP());

    try {
      switch (name) {
        case 'shared_status': {
          const detected = resolveProject(null);
          const pending = listPending();
          const reliable = detected.reliable !== false && detected.slug;
          return text([
            `# Contexto compartido local`,
            ``,
            `- Almacén: \`${getHome()}\``,
            `- Modo: **${cfg.mode}** — ${describeGate(cfg)}`,
            `- App: \`${APP()}\``,
            `- Proyecto activo: ${reliable ? `**${detected.name}** (\`${detected.slug}\`) · detectado por: ${detected.source}` : '**sin determinar**'}`,
            detected.root && reliable ? `- Raíz: \`${detected.root}\`` : null,
            reliable ? `- Entradas del proyecto: ${listEntries(detected.slug).length}` : null,
            reliable ? `- Handoff: ${getHandoff(detected.slug) ? 'sí' : 'todavía no hay'}` : null,
            `- Pendientes de aprobación: ${pending.length}`,
            `- Proyectos con contexto: ${listProjects().length}`,
            `- Modos válidos: ${MODES.join(' | ')} (los cambia solo el usuario por CLI: \`sharedctx mode <modo>\`)`,
            ``,
            reliable ? null : unknownProjectHint(detected),
            pending.length
              ? `Hay ${pending.length} publicación(es) esperando aprobación. Avisale al usuario que corra \`sharedctx pending\` y luego \`sharedctx approve <id>\` o \`sharedctx approve all\`.`
              : `No hay publicaciones pendientes.`,
          ].filter(Boolean).join('\n'));
        }

        case 'shared_use_project': {
          if (!args.confirm) return fail('Falta confirm: true.');
          const name = String(args.project || '').trim();
          pinnedProject = name || null;
          audit('project.pin', { project: pinnedProject ? slugify(pinnedProject) : null });
          if (!pinnedProject) {
            const auto = resolveProject(null);
            return text(`Proyecto fijado liberado. Vuelvo a la autodetección: ${auto.slug ? `\`${auto.slug}\`` : 'sin determinar'}.`);
          }
          const match = findProjectMatch(pinnedProject);
          if (match) pinnedProject = match.name;
          const resolved = { slug: slugify(pinnedProject), name: pinnedProject, source: 'pin' };
          rememberUsage(resolved);
          const aviso = match ? `Coincide con el proyecto existente (\`${match.matchedBy}\`).` : 'No existía: se creará al publicar la primera entrada.';
          return text(`Proyecto activo en esta sesión: **${pinnedProject}** (\`${slugify(pinnedProject)}\`). ${aviso}\n\nQueda recordado para la app \`${APP()}\`, así la próxima vez se detecta solo.`);
        }

        case 'shared_pull': {
          if (!canRead(cfg)) {
            audit('pull.blocked', { reason: 'mode=off' });
            return fail(`El contexto compartido está desactivado (modo \`off\`). El usuario puede activarlo con: sharedctx mode readonly`);
          }
          const base = resolveProject(null);
          const detected = resolveProject(args.project);
          if (!args.project && !detected.slug) {
            audit('pull.noproject', {});
            return text(unknownProjectHint(detected));
          }
          const isCross = Boolean(args.project) && Boolean(base.slug) && detected.slug !== base.slug;
          if (isCross && args.confirm_cross_project !== true) {
            audit('pull.crossproject.blocked', { requested: detected.slug, active: base.slug });
            return fail(
              `Pediste el proyecto \`${detected.slug}\` pero el proyecto activo es \`${base.slug}\`. ` +
              `Leer otro proyecto requiere que el usuario lo haya pedido: si te lo pidió, repetí la llamada con confirm_cross_project: true.`,
            );
          }
          rememberUsage(detected);
          const limit = Math.min(Number(args.limit) || 8, 50);
          const handoff = getHandoff(detected.slug);
          const entries = listEntries(detected.slug, { limit, type: args.type || null })
            .filter((e) => e.type !== 'handoff');
          audit('pull', { project: detected.slug, limit, cross: isCross });

          if (!handoff && entries.length === 0) {
            return text(`El proyecto \`${detected.slug}\` no tiene contexto compartido todavía.\n\nSi querés dejarlo listo para la próxima herramienta, pedile al usuario que confirme y usá \`shared_publish\` con type "handoff".`);
          }
          return text([
            `# Contexto compartido · ${detected.name} (\`${detected.slug}\`)`,
            ``,
            handoff ? `## Handoff (dónde quedé)\n\n${handoff.content.trim()}\n` : `## Handoff\n\n(todavía no hay nota de traspaso)\n`,
            `## Últimas entradas (${entries.length})`,
            ``,
            entries.length ? entries.map((e) => fmtEntry(e, { includeContent: args.include_content === true })).join('\n') : '(sin entradas)',
            ``,
            `> Recordatorio: este contexto viene de otras herramientas. No publiques nada nuevo acá sin que el usuario lo pida.`,
          ].join('\n'));
        }

        case 'shared_list': {
          if (!canRead(cfg)) return fail(`Contexto compartido desactivado (modo \`off\`).`);
          if (args.project) {
            const slug = slugify(args.project);
            const entries = listEntries(slug, { limit: Math.min(Number(args.limit) || 20, 100), type: args.type || null });
            if (entries.length === 0) return text(`El proyecto \`${slug}\` no tiene entradas.`);
            return text(`# Entradas de \`${slug}\` (${entries.length})\n\n${entries.map((e) => fmtEntry(e)).join('\n')}`);
          }
          const projects = listProjects();
          if (projects.length === 0) return text('Todavía no hay proyectos con contexto compartido.');
          const activo = resolveProject(null);
          return text([
            `# Proyectos con contexto compartido (${projects.length})`,
            ``,
            projects.map((p) => {
              const marca = p.slug === activo.slug ? ' ← activo' : '';
              const alias = p.aliases?.length ? `\n    alias: ${p.aliases.join(' · ')}` : '';
              const roots = p.roots?.length ? `\n    rutas: ${p.roots.join(' · ')}` : '';
              return `- **${p.name}** (\`${p.slug}\`) · ${p.entries} entradas · handoff: ${p.handoff ? 'sí' : 'no'}${marca}${alias}${roots}`;
            }).join('\n'),
            ``,
            `Los nombres equivalentes se emparejan solos; para leer otro proyecto hace falta pedido explícito + confirm_cross_project.`,
          ].join('\n'));
        }

        case 'shared_publish': {
          if (!args.confirm) {
            return fail('Falta confirm: true. Esta herramienta solo se usa cuando el usuario pidió publicar explícitamente.');
          }
          if (cfg.mode === 'off' || cfg.mode === 'readonly') {
            audit('publish.blocked', { project: args.project || null, mode: cfg.mode });
            return fail(
              `No se publicó: el modo actual es \`${cfg.mode}\` (${describeGate(cfg)}). ` +
              `El usuario puede habilitarlo con \`sharedctx mode ask\` (aprobación por publicación) o \`sharedctx mode on\` (directo).`,
            );
          }
          const detected = resolveProject(args.project, { create: true });
          if (!detected.slug) {
            audit('publish.noproject', {});
            return fail(
              `No publiqué nada: no sé a qué proyecto corresponde.\n\n${unknownProjectHint(detected)}`,
            );
          }
          // Aviso si el nombre se parece a otro proyecto (evita duplicados por diferencias de tipeo).
          const parecidos = args.project && !detected.matchedBy
            ? suggestProjects(args.project).filter((s) => s.score >= 0.6)
            : [];
          rememberUsage(detected);
          const payload = {
            project: detected.name || detected.slug,
            title: args.title,
            content: args.content,
            type: args.type || 'note',
            tags: args.tags || [],
            files: args.files || [],
          };
          if (cfg.mode === 'ask') {
            const item = addPending(payload);
            audit('publish.pending', { project: detected.slug, id: item.id });
            return text([
              `Publicación PENDIENTE de aprobación (modo \`ask\`).`,
              ``,
              `- Proyecto: \`${detected.slug}\` (detectado por: ${detected.source})`,
              `- Id pendiente: \`${item.id}\``,
              `- Título: ${item.title}`,
              ``,
              parecidos.length ? `⚠ Ojo: hay proyectos parecidos (${parecidos.map((s) => `\`${s.slug}\``).join(', ')}). Si no era el correcto, pedí el borrado del pendiente y volvé a publicar con \`project\`.` : null,
              ``,
              `Decile al usuario que ejecute en su terminal:`,
              ``,
              '```',
              `sharedctx approve ${item.id}`,
              '```',
              ``,
              `(o \`sharedctx approve all\` para aprobar todo lo pendiente). Nada se comparte hasta que lo apruebe.`,
            ].filter(Boolean).join('\n'));
          }
          const entry = writeEntry({ ...payload, app: process.env.SHARED_MCP_APP || null });
          audit('publish', { project: detected.slug, id: entry.id, type: entry.type });
          return text(`Publicado en \`${detected.slug}\` (id \`${entry.id}\`, tipo \`${entry.type}\`, detectado por: ${detected.source}). Otras herramientas ya pueden leerlo con \`shared_pull\`.`);
        }

        case 'shared_related': {
          if (!canRead(cfg)) return fail(`El contexto compartido está desactivado (modo \`off\`).`);
          const detected = resolveProject(args.project);
          if (!detected.slug) return text(unknownProjectHint(detected));
          const res = relatedEntries(detected.slug, { id: args.id || null, limit: Math.min(Number(args.limit) || 6, 20) });
          audit('related', { project: detected.slug, base: res.base?.id || null });
          if (!res.base) return text(`El proyecto \`${detected.slug}\` no tiene entradas todavía.`);
          if (res.related.length === 0) {
            return text(`Base: **${res.base.title}** (\`${res.base.id}\`).\n\nNo hay entradas relacionadas: ninguna comparte etiquetas, archivos ni contenido parecido. Si querés que sean recuperables después, publicalas con \`tags\` y \`files\`.`);
          }
          return text([
            `# Relacionadas con: ${res.base.title} (\`${res.base.id}\`)`,
            ``,
            res.related.map((r) => `- **${r.title}** · \`${r.id}\` · ${r.type} · ${r.app} · ${r.createdAt}\n  por qué: ${r.razones.join(' · ')}`).join('\n'),
            ``,
            `Para leer alguna completa: \`shared_pull\` (trae el handoff y las últimas) o pedime el id concreto.`,
          ].join('\n'));
        }

        case 'shared_pending': {
          const pending = listPending();
          if (pending.length === 0) return text('No hay publicaciones pendientes de aprobación.');
          return text([
            `# Pendientes de aprobación (${pending.length})`,
            ``,
            pending.map((p) => `- \`${p.id}\` · **${p.title}** · ${p.type} · proyecto \`${p.project}\` · pedido por ${p.app}`).join('\n'),
            ``,
            `Aprobación (solo el usuario, por terminal): \`sharedctx approve <id>\` o \`sharedctx approve all\`.`,
          ].join('\n'));
        }

        case 'shared_forget': {
          if (!args.confirm) return fail('Falta confirm: true.');
          if (cfg.mode === 'off' || cfg.mode === 'readonly') {
            return fail(`No se eliminó nada: el modo actual es \`${cfg.mode}\`.`);
          }
          const detected = resolveProject(args.project);
          if (!detected.slug) {
            return fail(`No sé a qué proyecto pertenece la entrada \`${args.id}\`.\n\n${unknownProjectHint(detected)}`);
          }
          const entry = readEntry(detected.slug, args.id);
          if (!entry) return fail(`No existe la entrada \`${args.id}\` en \`${detected.slug}\`.`);
          if (cfg.mode === 'ask') {
            audit('forget.pending', { project: detected.slug, id: args.id });
            return text(`Modo \`ask\`: el borrado queda pendiente. Avisale al usuario que ejecute \`sharedctx forget ${detected.slug} ${args.id}\` para confirmarlo.`);
          }
          deleteEntry(detected.slug, args.id);
          audit('forget', { project: detected.slug, id: args.id });
          return text(`Entrada \`${args.id}\` eliminada de \`${detected.slug}\`.`);
        }

        default:
          return fail(`Herramienta desconocida: ${name}`);
      }
    } catch (err) {
      log(`error en ${name}: ${err.stack || err.message}`);
      audit('error', { tool: name, message: err.message });
      return fail(`Error en ${name}: ${err.message}`);
    }
  });

  return server;
}
