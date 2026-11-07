/**
 * server.js — superficie MCP del contexto compartido.
 *
 * Diez herramientas, sin acceso destructivo a archivos y ninguna capaz de cambiar el modo de
 * consentimiento (eso es solo por CLI). Las descripciones de las herramientas
 * son el contrato de "solo si quiero": le dicen al modelo, explícitamente, que
 * no debe publicar ni leer otro proyecto si el usuario no lo pidió.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  ENTRY_TYPES, MODES, audit, addPending, canRead, countArchivedEntries, deleteEntry, describeGate,
  detectProject, ensureProject, findProjectMatch, getActive, getConfig, getHandoff, getHome,
  getLastProjectForApp, getProject, listEntries, listPending, listProjects, log, readDshWorkspaces,
  readEntry, rememberProjectIdentity, setLastProjectForApp, slugify, suggestProjects,
  touchSession, writeEntry,
} from './store.js';
import { relatedEntries } from './relations.js';
import { integer, revision, excerpt, entryMetadata, bounded, searchEntries } from './retrieval.js';
import { contextView } from './context-view.js';

const SERVER_NAME = 'QSMANU-LOCAL-SHARED-MCP';
const SERVER_VERSION = '0.6.0';

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
4. Si shared_publish o shared_forget responden "pendiente de aprobación", avisale al usuario el id y que
   debe aprobarlo con \`sharedctx approve <id>\` (o \`sharedctx approve all\`).
5. El modo de consentimiento lo cambia únicamente el usuario por CLI; no intentes cambiarlo.
6. Solo si shared_status dice "sin determinar": preguntale al usuario en qué proyecto trabaja y
   fijalo con \`shared_use_project\` (confirm: true), o decile que corra \`sharedctx use "<proyecto>"\`
   una vez para fijarlo en todas las apps.
7. shared_pull conserva markdown breve por defecto; format=tree ofrece árbol y format=graph
   devuelve JSON con relaciones tipadas. selected_handoff significa seleccionado,
   no vigencia comprobada. history no es política vigente. Las aristas son evidencia de relación,
   no dependencias ni reemplazos. Ampliá solo los IDs pertinentes con shared_read; paginá con
   next_offset. No asumas que una vista parcial contiene todas las decisiones.`;

const TOOLS = [
{"name":"shared_read","description":"Lee una entrada concreta por id (o handoff), sin volver a cargar el resto del contexto. Página acotada, revisión y continuidad por offset. Solo proyecto activo salvo autorización explícita.","inputSchema":{"type":"object","properties":{"project":{"type":"string","description":"Proyecto; omitir para usar el activo."},"confirm_cross_project":{"type":"boolean","description":"true solo si el usuario pidió leer otro proyecto."},"max_chars":{"type":"integer","minimum":512,"maximum":20000,"description":"Presupuesto de respuesta en caracteres; defecto 6000."},"offset":{"type":"integer","minimum":0,"description":"Desplazamiento para continuar la lectura o paginar resultados."},"id":{"type":"string","description":"ID de entrada o handoff."},"since_revision":{"type":"string","description":"Revisión de esta entrada recibida previamente: evita repetirla si no cambió."}},"required":["id"],"additionalProperties":false}},
{"name":"shared_search","description":"Busca palabras en títulos, etiquetas, rutas y cuerpos del proyecto. Devuelve IDs y fragmentos breves; usar shared_read para ampliar. No usa modelos ni servicios externos.","inputSchema":{"type":"object","properties":{"project":{"type":"string","description":"Proyecto; omitir para usar el activo."},"confirm_cross_project":{"type":"boolean","description":"true solo si el usuario pidió leer otro proyecto."},"max_chars":{"type":"integer","minimum":512,"maximum":20000,"description":"Presupuesto de respuesta en caracteres; defecto 6000."},"offset":{"type":"integer","minimum":0,"description":"Desplazamiento para continuar la lectura o paginar resultados."},"query":{"type":"string","minLength":2,"maxLength":200,"description":"Palabras a buscar (todas deben aparecer)."},"limit":{"type":"integer","minimum":0,"maximum":20,"description":"Resultados por página; defecto 5."},"type":{"type":"string","enum":["handoff","note","decision","task","bug","question","snippet","reference"]}},"required":["query"],"additionalProperties":false}},
  {
    name: 'shared_status',
    description:
      'Estado del contexto compartido local: modo de consentimiento, proyecto detectado, cantidad de entradas y publicaciones pendientes. Usalo al empezar a trabajar o cuando necesites saber si el usuario habilitó la compartición.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'shared_pull',
    description:
      'Trae contexto breve del proyecto (markdown por defecto); format=tree ofrece árbol y format=graph grafo JSON. IDs para shared_read; historial con type=handoff. Relaciones son evidencia, no dependencias ni vigencia. Usalo al retomar trabajo. Solo proyecto activo salvo pedido explícito (confirm_cross_project).',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Nombre del proyecto. Omitilo para usar el proyecto detectado automáticamente.' },
        format: { type: 'string', enum: ['tree', 'graph', 'markdown'], description: 'markdown breve por defecto; tree: árbol; graph: JSON válido schema sharedctx.context.v1 con aristas tipadas. JSON no garantiza menos tokens.' },
        limit: { type: 'integer', minimum: 0, maximum: 50, description: 'Entradas recientes, filtradas antes del límite (por defecto 3; 0 omite la lista).' },
        offset: { type: 'integer', minimum: 0, description: 'Desplazamiento para paginar entradas.' },
        handoff_mode: { type: 'string', enum: ['brief', 'full', 'omit'], description: 'brief (defecto) es una vista parcial de hasta 1600 caracteres; full solicita el handoff completo dentro del presupuesto; omit lo excluye.' },
        max_chars: { type: 'integer', minimum: 512, maximum: 20000, description: 'Presupuesto de respuesta en caracteres; por defecto 6000. Las vistas parciales lo indican.' },
        since_revision: { type: 'string', description: 'Revisión previamente recibida con los mismos parámetros: evita repetir contenido si no cambió.' },
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
        limit: { type: 'integer', minimum: 0, maximum: 100, description: 'Máximo de entradas (defecto 20).' },
        offset: { type: 'integer', minimum: 0, description: 'Desplazamiento para paginación.' },
        max_chars: { type: 'integer', minimum: 512, maximum: 20000, description: 'Presupuesto de respuesta; defecto 6000.' },
        confirm_cross_project: { type: 'boolean', description: 'true solo si el usuario pidió leer ese otro proyecto.' },
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
        limit: { type: 'integer', minimum: 0, maximum: 20, description: 'Entradas relacionadas, defecto 6.' },
        max_chars: { type: 'integer', minimum: 512, maximum: 20000, description: 'Presupuesto de respuesta; defecto 6000.' },
        confirm_cross_project: { type: 'boolean', description: 'true solo si el usuario pidió leer ese otro proyecto.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'shared_pending',
    description: 'Lista las publicaciones y los borrados que están esperando la aprobación del usuario (modo "ask"). Solo lectura.',
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


function authorizeRead(args, cfg) {
  if (!canRead(cfg)) throw new Error('Contexto compartido desactivado (modo off).');
  const base = resolveProject(null);
  let detected = base;
  if (args.project) {
    if (typeof args.project !== 'string') throw new Error('project debe ser texto.');
    const match = findProjectMatch(args.project, { fuzzyThreshold: 1 });
    detected = match ? { slug: match.slug, name: match.name, source: 'pedido', reliable: true } : { slug: null, reliable: false };
    if (!match) throw new Error('Proyecto inexistente. Consultar shared_list; no se crea ni se adivina al leer.');
  }
  const cross = Boolean(args.project) && detected.slug !== base.slug;
  if (cross && args.confirm_cross_project !== true) {
    audit('pull.crossproject.blocked', { requested: detected.slug, active: base.slug });
    throw new Error('Leer otro proyecto requiere pedido explícito del usuario y confirm_cross_project: true.');
  }
  return { detected, cross };
}

function readOptions(args) {
  return { maxChars: integer(args.max_chars, 6000, 20000, 'max_chars', 512), offset: integer(args.offset, 0, 100000000, 'offset') };
}

function validateArguments(name, args) {
  const schema = TOOLS.find(t => t.name === name)?.inputSchema;
  if (!schema) return;
  for (const key of schema.required || []) if (args[key] === undefined) throw new Error(key + ': argumento requerido.');
  for (const [key, value] of Object.entries(args)) {
    const rule = schema.properties[key];
    if (!rule) throw new Error('Argumento desconocido: ' + key);
    if (rule.type === 'integer') integer(value, 0, rule.maximum ?? 100000000, key, rule.minimum ?? 0);
    else if (rule.type === 'string' && typeof value !== 'string') throw new Error(key + ': se requiere texto.');
    else if (rule.type === 'boolean' && typeof value !== 'boolean') throw new Error(key + ': se requiere boolean.');
    else if (rule.type === 'array' && (!Array.isArray(value) || value.some(v => typeof v !== 'string' || /[\r\n]/.test(v)))) throw new Error(key + ': array de textos sin saltos de línea.');
    if (rule.enum && !rule.enum.includes(value)) throw new Error(key + ': valor inválido.');
    if (typeof value === 'string' && (value.length < (rule.minLength || 0) || value.length > (rule.maxLength || 2000000))) throw new Error(key + ': longitud inválida.');
  }
  if (args.title && /[\r\n]/.test(args.title)) throw new Error('title no admite saltos de línea.');
}

function replyRead(value, maxChars, metadata = {}) {
  return { ...text(bounded(value, maxChars)), _meta: { ...metadata, partial: value.length > maxChars } };
}

/* ------------------------------------------------------------------ server */

export function createServer() {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: OPT_IN_PROTOCOL },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  const handleCall = async (request) => {
    const { name, arguments: args = {} } = request.params;
    const cfg = getConfig();
    // Heartbeat para que el panel muestre esta app como conectada ahora mismo.
    touchSession(APP());

    try {
      validateArguments(name, args);
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
            reliable && countArchivedEntries(detected.slug) ? `- Históricas comprimidas: ${countArchivedEntries(detected.slug)} (lectura explícita con shared_read por ID)` : null,
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
          const { detected, cross } = authorizeRead(args, cfg);
          if (!detected.slug) return text(unknownProjectHint(detected));
          const { maxChars, offset } = readOptions(args);
          const limit = integer(args.limit, 3, 50, 'limit');
          const mode = args.handoff_mode ?? 'brief';
          const format = args.format ?? 'markdown';
          if (!['brief', 'full', 'omit'].includes(mode)) throw new Error('handoff_mode inválido.');
          const handoff = getHandoff(detected.slug);
          const all = listEntries(detected.slug, { type: args.type || null });
          const pendingCount = listPending().filter(p => p.project === detected.slug).length;
          const archivedCount = countArchivedEntries(detected.slug);
          const rev = revision([all, { viewVersion: SERVER_VERSION, limit, offset, mode, format, maxChars, pendingCount, archivedCount, includeContent: args.include_content === true, type: args.type || null }], handoff);
          audit('pull', { project: detected.slug, limit, cross, include_content: args.include_content === true, handoff_mode: mode, format, revision: rev });
          if (args.since_revision === rev) return text(format === 'graph' ? JSON.stringify({ schema: 'sharedctx.context.v1', revision: rev, unchanged: true }) : 'Sin cambios desde revisión ' + rev + '.');
          const eligible = args.type ? all : all.filter(e => e.type !== 'handoff');
          const entries = eligible.slice(offset, offset + limit);
          if (format !== 'markdown') {
            const view = contextView({ project: detected, revision: rev, entries, handoff, mode, includeContent: args.include_content === true, offset, total: eligible.length, pendingCount, archivedCount, maxChars, format });
            return { ...text(view.text), _meta: { project: detected.slug, revision: rev, format, results_returned: view.returned, total_available: eligible.length, next_offset: view.nextOffset, partial: view.partial } };
          }
          const header = '# Contexto compartido · ' + detected.name + '\nRevisión: ' + rev + '\nPágina: offset=' + offset + ', resultados=' + entries.length + ', total=' + eligible.length + '.\n' + (archivedCount ? 'Históricas comprimidas: ' + archivedCount + '; shared_read por ID.\n' : '');
          const h = mode === 'omit' ? '' : handoff ? '## Handoff · id=' + handoff.id + '\n\n' + (mode === 'full' ? handoff.content.trim() : excerpt(handoff.content, 1600)) : '## Handoff\n(todavía no hay nota de traspaso)';
          const rows = entries.map(e => entryMetadata(e) + (args.include_content === true ? '\n' + excerpt(e.content, 1200) : '')).join('\n');
          const next = offset + entries.length < eligible.length && limit ? '\nSiguiente página: offset=' + (offset + entries.length) + '.' : '';
          if (!handoff && !all.length) return text('El proyecto no tiene contexto compartido todavía.');
          return replyRead(header + h + '\n## Últimas entradas (' + entries.length + ')\n' + rows + next + '\nAmpliar una entrada: shared_read con su id. No publicar sin pedido del usuario.', maxChars, { project: detected.slug, revision: rev, results_returned: entries.length, total_available: eligible.length, handoff_mode: mode });
        }

        case 'shared_read': {
          const { detected } = authorizeRead(args, cfg);
          if (!detected.slug) return text(unknownProjectHint(detected));
          const { maxChars, offset } = readOptions(args);
          if (typeof args.id !== 'string') throw new Error('id es obligatorio.');
          const entry = args.id === 'handoff' ? getHandoff(detected.slug) : readEntry(detected.slug, args.id);
          if (!entry) return fail('Entrada inexistente en el proyecto seleccionado.');
          const rev = revision([entry]);
          if (args.since_revision === rev) return text('Sin cambios desde revisión ' + rev + '.');
          const prefix = '# ' + entry.title.slice(0, 80).replace(/[\r\n]/g, ' ') + ' · id=' + entry.id + '\nRevisión: ' + rev + '\nLongitud: ' + entry.content.length + ' caracteres; offset=' + offset + '.\n';
          const archiveLabel = entry.archived ? '[Historial archivado: no es el estado vigente.]\n' : '';
          const footerBudget = 180;
          const count = Math.max(0, maxChars - prefix.length - archiveLabel.length - footerBudget);
          let end = Math.min(entry.content.length, offset + count);
          if (end < entry.content.length && /[\uD800-\uDBFF]/.test(entry.content[end - 1])) end--;
          const chunk = entry.content.slice(offset, end);
          const next = offset + chunk.length < entry.content.length ? '\n[Contenido parcial. Continuar shared_read con id=' + entry.id + ', offset=' + (offset + chunk.length) + '.]' : '\n[Fin de la entrada.]';
          return replyRead(prefix + archiveLabel + chunk + next, maxChars, { project: detected.slug, revision: rev, archived: entry.archived === true, results_returned: 1, next_offset: offset + chunk.length, complete: offset + chunk.length >= entry.content.length });
        }

        case 'shared_search': {
          const { detected } = authorizeRead(args, cfg);
          if (!detected.slug) return text(unknownProjectHint(detected));
          const { maxChars, offset } = readOptions(args);
          const limit = integer(args.limit, 5, 20, 'limit');
          const results = searchEntries(listEntries(detected.slug, { type: args.type || null }), args.query);
          const page = results.slice(offset, offset + limit);
          return replyRead('# Búsqueda · ' + detected.name + '\nTotal=' + results.length + '; offset=' + offset + '.\n' + page.map(r => entryMetadata(r.entry) + '\n  ' + r.snippet).join('\n') + (offset + page.length < results.length && limit ? '\nSiguiente página: offset=' + (offset + page.length) : '') + '\nAmpliar: shared_read con el id.', maxChars);
        }

        case 'shared_list': {
          if (!canRead(cfg)) return fail('Contexto compartido desactivado (modo off).');
          const { maxChars, offset } = readOptions(args);
          const limit = integer(args.limit, 20, 100, 'limit');
          if (args.project) {
            const { detected } = authorizeRead(args, cfg);
            const all = listEntries(detected.slug, { type: args.type || null });
            const page = all.slice(offset, offset + limit);
            return replyRead('# Entradas de ' + detected.name + ' · total=' + all.length + ', offset=' + offset + '\n' + page.map(e => entryMetadata(e)).join('\n') + (offset + page.length < all.length && limit ? '\nSiguiente página: offset=' + (offset + page.length) : ''), maxChars);
          }
          const projects = listProjects();
          return replyRead('# Proyectos con contexto compartido (' + projects.length + ')\n' + projects.slice(offset, offset + limit).map(p => '- **' + p.name + '** (' + p.slug + ') · ' + p.entries + ' entradas' + (p.archivedEntries ? ' · ' + p.archivedEntries + ' históricas comprimidas' : '') + ' · handoff: ' + (p.handoff ? 'sí' : 'no')).join('\n') + (offset + limit < projects.length && limit ? '\nSiguiente página: offset=' + (offset + limit) : ''), maxChars);
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
          const { detected } = authorizeRead(args, cfg);
          if (!detected.slug) return text(unknownProjectHint(detected));
          const limit = integer(args.limit, 6, 20, 'limit');
          const res = relatedEntries(detected.slug, { id: args.id || null, limit });
          audit('related', { project: detected.slug, base: res.base?.id || null });
          if (!res.base) return text(`El proyecto \`${detected.slug}\` no tiene entradas todavía.`);
          if (res.related.length === 0) {
            return text(`Base: **${res.base.title}** (\`${res.base.id}\`).\n\nNo hay entradas relacionadas: ninguna comparte etiquetas, archivos ni contenido parecido. Si querés que sean recuperables después, publicalas con \`tags\` y \`files\`.`);
          }
          return replyRead([
            `# Relacionadas con: ${res.base.title} (\`${res.base.id}\`)`,
            ``,
            res.related.map((r) => `- **${r.title}** · \`${r.id}\` · ${r.type} · ${r.app} · ${r.createdAt}\n  por qué: ${r.razones.join(' · ')}`).join('\n'),
            ``,
            `Para leer alguna completa: shared_read con su id.`,
          ].join('\n'), readOptions(args).maxChars);
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
            const item = addPending({
              action: 'forget',
              type: 'forget',
              project: detected.slug,
              entryId: args.id,
              title: `Borrar: ${entry.title}`,
              app: process.env.SHARED_MCP_APP || null,
            });
            audit('forget.pending', { project: detected.slug, id: args.id, pendingId: item.id });
            return text([
              `Borrado PENDIENTE de aprobación (modo \`ask\`).`,
              ``,
              `- Proyecto: \`${detected.slug}\``,
              `- Id de la entrada: \`${args.id}\``,
              `- Título: ${entry.title}`,
              `- Id pendiente: \`${item.id}\``,
              ``,
              `Decile al usuario que ejecute en su terminal:`,
              ``,
              '```',
              `sharedctx approve ${item.id}`,
              '```',
              ``,
              `(o \`sharedctx approve all\`). La entrada no se eliminará hasta que lo apruebe.`,
            ].join('\n'));
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
      audit('error', { tool: name, message: String(err.message).slice(0, 500) });
      return fail(`Error en ${name}: ${err.message}`);
    }
  };
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const started = performance.now();
    const result = await handleCall(request);
    const value = result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || '';
    const args = request.params.arguments || {};
    audit('response', { tool: request.params.name, response_chars: value.length, response_bytes: Buffer.byteLength(value), duration_ms: Math.round(performance.now() - started), ok: !result.isError, include_content: args.include_content === true, limit: Number.isInteger(args.limit) ? args.limit : null, offset: Number.isInteger(args.offset) ? args.offset : 0, ...result._meta });
    return result;
  });

  return server;
}
