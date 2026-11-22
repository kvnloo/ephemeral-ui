// A2UI adapter: Google's A2UI agent-to-renderer stream (https://a2ui.org, v0.9 and v1.0) in, the same
// card program the OpenUI Lang path produces out. The agent names components from the ephemeral-ui A2UI
// catalog (src/schema/a2ui-catalog.v0.json); the kit's own card modules draw them, exactly as they draw an
// openui-v2 Board(... [EphemeralCards(title, [{kind, app?, input?}])]) fence.
//
//   Board          { title, summary, children: ChildList }      = OpenUI Board(title, summary, panels)
//   EphemeralCards { title, children: ChildList }               = OpenUI EphemeralCards(title, cards)
//   EphemeralCard  { kind, app?, title?, input? }               = one {kind, app?, input?} card object
//
// Pure and DOM-free: hosts can run it in a browser or in Node. It only reads the stream; it never writes
// to an app. Card-level checks (kind enum, $defs.appInput, rules) stay in the shared normalizer
// (tools/card-spec.mjs), so a bad A2UI card fails the same way as a bad OpenUI card.
//
//   parseA2UI(text | message[])  -> { version, surfaceId, catalogId, root: { type, title, summary? }, cards: [{ kind, app?, title?, input?, componentId }] }
//   toA2UIAction(eui:intent detail, { version, surfaceId, sourceComponentId }) -> renderer-to-agent `action` message
// Errors are A2UIError with the spec's error codes (VALIDATION_FAILED, INTEGRITY_ERROR) and surfaceId.

export const A2UI_CATALOG_ID = "https://ephemeralui.vercel.app/schema/a2ui-catalog.v0.json";
export const A2UI_VERSIONS = ["v0.9", "v0.9.1", "1.0"];
export const COMPONENTS = { Board: ["title", "summary", "children"], EphemeralCards: ["title", "children"], EphemeralCard: ["kind", "app", "title", "input"] };
const REQUIRED = { Board: ["title", "summary", "children"], EphemeralCards: ["title", "children"], EphemeralCard: ["kind"] };
const MESSAGE_KEYS = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"];
const ID_V1 = /^[\p{XID_Start}_][\p{XID_Continue}]*$/u; // v1.0: component ids follow UAX #31
const MAX_MESSAGES = 200, MAX_COMPONENTS = 64, MAX_DEPTH = 8;

export class A2UIError extends Error {
  constructor(code, message, surfaceId) { super(message); this.name = "A2UIError"; this.code = code; if (surfaceId) this.surfaceId = surfaceId; }
  /** The renderer-to-agent `error` message the spec defines, so a host can hand the failure back to the model. */
  toMessage(version = "1.0") { return { version, error: { code: this.code, message: this.message, ...(this.surfaceId ? { surfaceId: this.surfaceId } : {}) } }; }
}
const fail = (code, msg, sid) => { throw new A2UIError(code, msg, sid); };
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Split a payload into messages: a JSON array, one JSON object, or JSONL (one object per line). */
export function messagesOf(input) {
  if (Array.isArray(input)) return input;
  if (isObj(input)) return [input];
  const text = String(input ?? "").replace(/^\s*```[\w-]*\s*\n|\n```\s*$/g, "").trim();
  if (!text) fail("VALIDATION_FAILED", "empty A2UI payload");
  try { const v = JSON.parse(text); return Array.isArray(v) ? v : [v]; } catch { /* JSONL */ }
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => { try { return JSON.parse(l); } catch (e) { return fail("VALIDATION_FAILED", `line ${i + 1} is not JSON: ${e.message}`); } });
}

/** True when the text looks like an A2UI stream (used by export-cards --program to pick the adapter). */
const V08_KEYS = ["surfaceUpdate", "beginRendering", "dataModelUpdate"];
export function looksLikeA2UI(text) {
  let msgs; try { msgs = messagesOf(text); } catch { return false; }
  return msgs.length > 0 && msgs.every((m) => isObj(m) && [...MESSAGE_KEYS, ...V08_KEYS].some((k) => k in m));
}

// JSON Pointer (RFC 6901) read and write on a surface data model.
const tokens = (p, sid) => { if (p === undefined || p === "" || p === "/") return []; if (typeof p !== "string" || !p.startsWith("/")) fail("VALIDATION_FAILED", `path ${JSON.stringify(p)} is not a JSON Pointer`, sid); return p.slice(1).split("/").map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~")); };
function getAt(model, p, sid) { let v = model; for (const t of tokens(p, sid)) { if (v == null || typeof v !== "object" || !(t in v)) return undefined; v = v[t]; } return v; }
function setAt(model, p, value, sid) {
  const ts = tokens(p, sid);
  if (!ts.length) { if (value !== null && !isObj(value)) fail("VALIDATION_FAILED", "the root data model must be an object", sid); return value === null ? {} : structuredClone(value); }
  const root = structuredClone(model); let v = root;
  for (const t of ts.slice(0, -1)) { if (!isObj(v[t]) && !Array.isArray(v[t])) v[t] = {}; v = v[t]; }
  const last = ts.at(-1);
  if (value === null) { if (Array.isArray(v)) v.splice(+last, 1); else delete v[last]; } else v[last] = structuredClone(value);
  return root;
}

/** Resolve one dynamic value: a literal, or a data binding ({"path"} in v0.9, {"@path"} in v1.0). Function calls are not accepted. */
function resolve(v, model, version, sid, at) {
  if (!isObj(v)) return v;
  const key = version === "1.0" ? "@path" : "path", other = version === "1.0" ? "path" : "@path", call = version === "1.0" ? "@call" : "call";
  if (call in v) fail("VALIDATION_FAILED", `${at}: function calls are not allowed in ephemeral-ui cards (cards are read-only data)`, sid);
  if (Object.keys(v).length === 1 && other in v && typeof v[other] === "string") fail("VALIDATION_FAILED", `${at}: A2UI ${version} binds data with "${key}", not "${other}"`, sid);
  if (Object.keys(v).length === 1 && key in v) {
    const got = getAt(model, v[key], sid);
    if (got === undefined) fail("VALIDATION_FAILED", `${at}: data binding ${v[key]} is not in the data model`, sid);
    return structuredClone(got);
  }
  return v;
}

/**
 * Apply an A2UI stream and return the one surface it leaves on screen, as a card program. Fails closed:
 * unknown message, version or catalog; update before create; duplicate surface; unknown component; missing,
 * duplicate or cyclic children; unresolved bindings; v1.0 `theme`; v0.8 messages.
 */
export function parseA2UI(input) {
  const msgs = messagesOf(input);
  if (!msgs.length || msgs.length > MAX_MESSAGES) fail("VALIDATION_FAILED", `need 1..${MAX_MESSAGES} messages, got ${msgs.length}`);
  const surfaces = new Map(), deleted = new Set();
  let version = null, wire = null;
  for (const [i, m] of msgs.entries()) {
    const at = `message ${i + 1}`;
    if (!isObj(m)) fail("VALIDATION_FAILED", `${at} is not an object`);
    if (V08_KEYS.some((k) => k in m)) fail("VALIDATION_FAILED", `${at}: A2UI v0.8 messages are not supported; send v0.9 or v1.0 (createSurface / updateComponents / updateDataModel)`);
    if (!A2UI_VERSIONS.includes(m.version)) fail("VALIDATION_FAILED", `${at}: version must be one of ${A2UI_VERSIONS.join(", ")}, got ${JSON.stringify(m.version)}`);
    const v = m.version === "1.0" ? "1.0" : "v0.9";
    if (version && version !== v) fail("VALIDATION_FAILED", `${at}: mixes A2UI ${version} and ${v} in one stream`);
    version = v; wire ??= m.version;
    const keys = Object.keys(m).filter((k) => k !== "version");
    if (keys.length !== 1 || !MESSAGE_KEYS.includes(keys[0])) fail("VALIDATION_FAILED", `${at} must hold exactly one of ${MESSAGE_KEYS.join(", ")} (got ${keys.join(", ") || "none"})`);
    const type = keys[0], body = m[type];
    if (!isObj(body) || typeof body.surfaceId !== "string" || !body.surfaceId) fail("VALIDATION_FAILED", `${at}: ${type}.surfaceId is required`);
    const sid = body.surfaceId;
    if (type === "createSurface") {
      if (surfaces.has(sid) || deleted.has(sid)) fail("INTEGRITY_ERROR", `${at}: surface ${sid} already exists`, sid);
      if (body.catalogId !== A2UI_CATALOG_ID) fail("VALIDATION_FAILED", `${at}: catalogId must be ${A2UI_CATALOG_ID} (the ephemeral-ui A2UI catalog), got ${JSON.stringify(body.catalogId)}`, sid);
      if (v === "1.0" && "theme" in body) fail("VALIDATION_FAILED", `${at}: a v1.0 createSurface must not carry theme; cards take the host's theme`, sid);
      if (v !== "1.0" && (body.components || body.dataModel)) fail("VALIDATION_FAILED", `${at}: components and dataModel in createSurface are v1.0 only`, sid);
      const s = { id: sid, catalogId: body.catalogId, components: new Map(), model: {} };
      surfaces.set(sid, s);
      if (body.dataModel !== undefined) s.model = setAt({}, "/", body.dataModel, sid);
      if (body.components !== undefined) addComponents(s, body.components, v, at);
      continue;
    }
    const s = surfaces.get(sid);
    if (!s) fail("INTEGRITY_ERROR", `${at}: ${type} for surface ${sid} before its createSurface`, sid);
    if (type === "updateComponents") addComponents(s, body.components, v, at);
    else if (type === "updateDataModel") { if (!("value" in body)) fail("VALIDATION_FAILED", `${at}: updateDataModel.value is required`, sid); s.model = setAt(s.model, body.path, body.value, sid); }
    else { surfaces.delete(sid); deleted.add(sid); }
  }
  if (surfaces.size !== 1) fail("VALIDATION_FAILED", surfaces.size ? `the stream leaves ${surfaces.size} surfaces; send one per card program` : "the stream leaves no surface to render");
  const [s] = surfaces.values();
  return { version: wire, surfaceId: s.id, catalogId: s.catalogId, ...tree(s, version) };
}

function addComponents(s, list, v, at) {
  if (!Array.isArray(list) || !list.length) fail("VALIDATION_FAILED", `${at}: components must be a non-empty array`, s.id);
  for (const [j, c] of list.entries()) {
    const ca = `${at} components[${j}]`;
    if (!isObj(c) || typeof c.id !== "string" || !c.id) fail("VALIDATION_FAILED", `${ca}: id is required`, s.id);
    if (v === "1.0" ? !ID_V1.test(c.id) : c.id.length > 120) fail("VALIDATION_FAILED", `${ca}: id ${JSON.stringify(c.id)} is not a valid component id`, s.id);
    if (typeof c.component !== "string" || !COMPONENTS[c.component]) fail("VALIDATION_FAILED", `${ca}: component ${JSON.stringify(c.component)} is not in the ephemeral-ui catalog (${Object.keys(COMPONENTS).join(", ")})`, s.id);
    const catId = v === "1.0" ? c["@catalogId"] : undefined;
    if (catId !== undefined && catId !== A2UI_CATALOG_ID) fail("VALIDATION_FAILED", `${ca}: @catalogId ${catId} is not the ephemeral-ui catalog`, s.id);
    for (const k of Object.keys(c)) if (!["id", "component", ...COMPONENTS[c.component], ...(v === "1.0" ? ["@catalogId", "@accessibility", "@metadata"] : ["accessibility"])].includes(k)) fail("VALIDATION_FAILED", `${ca}: ${c.component}.${k} is not allowed`, s.id);
    s.components.set(c.id, c); // a later definition replaces the earlier one in full (spec: updateComponents)
  }
  if (s.components.size > MAX_COMPONENTS) fail("VALIDATION_FAILED", `surface ${s.id} has more than ${MAX_COMPONENTS} components`, s.id);
}

function tree(s, v) {
  const rootId = "root";
  if (!s.components.has(rootId)) fail("VALIDATION_FAILED", `surface ${s.id} has no component with id "root"`, s.id);
  const seen = new Set();
  const node = (id, depth, at) => {
    const c = s.components.get(id);
    if (!c) fail("VALIDATION_FAILED", `${at}: child ${JSON.stringify(id)} is not a component on surface ${s.id}`, s.id);
    if (seen.has(id)) fail("INTEGRITY_ERROR", `${at}: component ${id} appears twice (cycle or shared child)`, s.id);
    if (depth > MAX_DEPTH) fail("VALIDATION_FAILED", `${at}: tree is deeper than ${MAX_DEPTH}`, s.id);
    seen.add(id);
    for (const k of REQUIRED[c.component]) if (!(k in c)) fail("VALIDATION_FAILED", `${at}: ${c.component}.${k} is required`, s.id);
    const props = {};
    for (const k of COMPONENTS[c.component]) if (k !== "children" && k in c) props[k] = resolve(c[k], s.model, v, s.id, `${c.component} ${id}.${k}`);
    for (const k of ["title", "summary", "kind", "app"]) if (k in props && typeof props[k] !== "string") fail("VALIDATION_FAILED", `${c.component} ${id}.${k} must be a string`, s.id);
    let kids = [];
    if ("children" in c) {
      if (!Array.isArray(c.children)) fail("VALIDATION_FAILED", `${c.component} ${id}.children must be an array of component ids (templates are not supported)`, s.id);
      kids = c.children.map((k, i) => (typeof k === "string" ? node(k, depth + 1, `${c.component} ${id}.children[${i}]`) : fail("VALIDATION_FAILED", `${c.component} ${id}.children[${i}] must be a component id`, s.id)));
    }
    return { id, type: c.component, props, kids };
  };
  const root = node(rootId, 0, "root");
  const unused = [...s.components.keys()].filter((k) => !seen.has(k));
  if (unused.length) fail("VALIDATION_FAILED", `components not reachable from root: ${unused.join(", ")}`, s.id);
  if (root.type === "EphemeralCard") fail("VALIDATION_FAILED", "root must be a Board or EphemeralCards, not a bare EphemeralCard", s.id);
  // Same shape rules as the OpenUI path: a Board holds EphemeralCards panels, which hold EphemeralCard cards.
  const panels = root.type === "Board" ? root.kids : [root];
  for (const p of panels) if (p.type !== "EphemeralCards") fail("VALIDATION_FAILED", `Board ${root.id} children must be EphemeralCards, got ${p.type} ${p.id}`, s.id);
  const cards = panels.flatMap((p) => p.kids.map((c) => (c.type === "EphemeralCard" ? { ...c.props, componentId: c.id } : fail("VALIDATION_FAILED", `EphemeralCards ${p.id} children must be EphemeralCard, got ${c.type} ${c.id}`, s.id))));
  return { root: { type: root.type, title: root.props.title, ...(root.type === "Board" ? { summary: root.props.summary } : {}) }, cards };
}

/**
 * The renderer-to-agent `action` message for a card's eui:intent detail (src/js/loop.js). The context carries
 * the same typed fields the OpenUI hosts read from eui:intent, so both providers see one interaction.
 */
export function toA2UIAction(detail, { version = "1.0", surfaceId, sourceComponentId }) {
  if (!detail?.action || !surfaceId || !sourceComponentId) throw new A2UIError("VALIDATION_FAILED", "toA2UIAction needs detail.action, surfaceId and sourceComponentId");
  const context = { kind: detail.kind, app: detail.app, ids: detail.ids ?? [], entities: detail.entities ?? {}, ...(detail.text ? { text: detail.text } : {}) };
  return { version, action: { name: detail.action, surfaceId, sourceComponentId, timestamp: new Date(detail.at ?? Date.now()).toISOString(), userMessage: detail.label, context } };
}
