// One card spec for every provider. An agent's reply arrives as an ```ephemeral-ui card.v0 fence (Glide),
// an openui-v2 Board/EphemeralCards program (OpenUI Lang: T3, Tern) or an A2UI stream (Google A2UI v0.9/v1.0,
// ./a2ui.js). Each adapter only reads its wire format; all of them end in normalize(), which checks every
// card against card.v0.json ($defs.appInput + RULES) and resolves its app, so the renderer (the kind modules'
// make(), via tools/export-cards.mjs, providers.html or an app gallery) never sees a provider-specific shape.
//
// DOM-free and dependency-free, for the browser and Node (tools/card-spec.mjs wires the files in Node):
//   const S = cardSpec({ card: <card.v0.json>, apps: <data/apps.json>.apps })
//   const spec = await S.fromProgram(text, { createParser })   // OpenUI needs @openuidev/lang-core's createParser
//   spec → { v: 0, title?, summary?, cards: [{ kind, app, input?, title? }] }
//   spec.source (not enumerable) → { provider: "openui" | "a2ui" | "card.v0", ... } (A2UI: version, surfaceId, componentIds)
import { parseA2UI, looksLikeA2UI } from "./a2ui.js";
import { validateGraph } from "./infra-data.js";

export const MAX_CARDS = 12;
export const CARD_KEYS = ["kind", "app", "input", "title"]; // what a card program carries; other card.v0 fields are host-side
// The openui-v2 component library the model may use (the same two containers the A2UI catalog defines).
export const FENCE = { properties: { Board: {}, EphemeralCards: {} }, $defs: {
  Board: { type: "object", properties: { title: { type: "string" }, summary: { type: "string" }, panels: { type: "array", items: {} } }, required: ["title", "summary", "panels"] },
  EphemeralCards: { type: "object", properties: { title: { type: "string" }, cards: { type: "array", items: {} } }, required: ["title", "cards"] } } };
const strip = (text) => String(text).replace(/^\s*```[\w-]*\s*\n|\n```\s*$/g, "");

export function check(v, s, at) { // the JSON Schema subset appInput uses; first problem wins
  const t = Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : v === null ? "null" : typeof v;
  if (s.enum) return s.enum.includes(v) ? null : `${at} must be one of ${s.enum.join("|")}`;
  if (s.type && !(s.type === t || (s.type === "number" && t === "integer"))) return `${at} must be ${s.type}`;
  if (t === "string" && (v.length < (s.minLength ?? 0) || v.length > (s.maxLength ?? Infinity) || (s.pattern && !new RegExp(s.pattern).test(v)))) return `${at} has a bad length or format`;
  if (t === "integer" && (v < (s.minimum ?? -Infinity) || v > (s.maximum ?? Infinity))) return `${at} is out of range`;
  if (t === "array") { if (v.length > (s.maxItems ?? Infinity)) return `${at} has more than ${s.maxItems} items`; for (const [i, x] of v.entries()) { const e = check(x, s.items, `${at}[${i}]`); if (e) return e; } }
  if (t === "object" && s.properties) {
    for (const k of s.required ?? []) if (!(k in v)) return `${at}.${k} is required`;
    for (const [k, x] of Object.entries(v)) { if (!s.properties[k]) return `${at}.${k} is not allowed`; const e = check(x, s.properties[k], `${at}.${k}`); if (e) return e; }
  }
  return null;
}
// infra-architecture: the kind's own validator (unique node ids, known services, edges between existing nodes).
export const RULES = { "infra-architecture": (g) => { try { validateGraph(g); return null; } catch (e) { return e.message; } }, merge: (p) => p.state === "conflict" && p.conflicts < 1 ? "conflict state needs conflicts >= 1" : !["open", "conflict"].includes(p.state) && p.conflicts ? "only open/conflict PRs have conflicts" : p.state === "ready" && p.checks.some((c) => c.status === "fail" || c.status === "running") ? "ready needs every check passed" : p.url && !p.url.endsWith(`/pull/${p.number}`) ? "url does not match number" : null };

export function cardSpec({ card, apps }) {
  const APP_INPUT = card.$defs.appInput, KINDS_ENUM = card.properties.kind.enum;
  const CARD_V0_KEYS = new Set([...Object.keys(card.properties), "title"]);
  const appIds = new Set(apps.map((a) => a.id));

  /** The provider-neutral card program. Throws on the first bad card; never fills in data. */
  function normalize({ title, summary, cards }, source = { provider: "card.v0" }) {
    const tag = `${source.provider}:`;
    if (!Array.isArray(cards) || !cards.length || cards.length > MAX_CARDS) throw Error(`${tag} need 1..${MAX_CARDS} cards, got ${Array.isArray(cards) ? cards.length : typeof cards}`);
    const out = cards.map((c, i) => {
      const at = `cards[${i}]`;
      if (!c || typeof c !== "object" || Array.isArray(c)) throw Error(`${tag} ${at} must be an object`);
      if (!KINDS_ENUM.includes(c.kind)) throw Error(`${tag} ${at}.kind ${c.kind} is not a card.v0 kind`);
      for (const k of Object.keys(c)) if (!CARD_V0_KEYS.has(k)) throw Error(`${tag} ${at}.${k} is not a card.v0 field (cards carry ${CARD_KEYS.join(", ")})`);
      const app = c.app ?? apps.find((a) => a.kinds?.includes(c.kind))?.id ?? (c.kind.startsWith("trace") ? "omp-stats" : null);
      if (typeof app !== "string" || !appIds.has(app)) throw Error(`${tag} ${at}.app ${app} is not a catalog app`);
      if (c.input !== undefined && !c.kind.startsWith("trace")) {
        if (!APP_INPUT[c.kind]) throw Error(`${tag} ${at} ${c.kind} draws sample data and takes no input (input kinds: ${Object.keys(APP_INPUT).filter((k) => k !== "description")})`);
        const e = check(c.input, APP_INPUT[c.kind], `${at}.input`) ?? RULES[c.kind]?.(c.input);
        if (e) throw Error(`${tag} ${e}`);
      }
      if (c.title !== undefined && (typeof c.title !== "string" || c.title.length > 200)) throw Error(`${tag} ${at}.title must be a string up to 200 chars`);
      return { kind: c.kind, app, ...(c.input !== undefined ? { input: structuredClone(c.input) } : {}), ...(c.title !== undefined ? { title: c.title } : {}) };
    });
    for (const [k, v] of [["title", title], ["summary", summary]]) if (v !== undefined && (typeof v !== "string" || v.length > 400)) throw Error(`${tag} ${k} must be a string up to 400 chars`);
    const spec = { v: 0, ...(title !== undefined ? { title } : {}), ...(summary !== undefined ? { summary } : {}), cards: out };
    Object.defineProperty(spec, "source", { value: source, enumerable: false });
    return spec;
  }

  /** ```ephemeral-ui fences (Glide's contract): one card.v0 object per fence. Null when there is none. */
  function fromFences(text) {
    const fences = [...String(text).matchAll(/```ephemeral-ui[^\n]*\n([\s\S]*?)\n```/g)];
    if (!fences.length) return null;
    const cards = fences.map((m, i) => { try { return JSON.parse(m[1]); } catch (e) { throw Error(`card.v0: ephemeral-ui fence ${i + 1} is not JSON: ${e.message}`); } });
    const pick = (c) => (c && typeof c === "object" && !Array.isArray(c) ? Object.fromEntries(CARD_KEYS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]])) : c);
    return normalize({ title: cards.length === 1 && typeof cards[0]?.title === "string" ? cards[0].title : undefined, cards: cards.map(pick) }, { provider: "card.v0" });
  }

  /** An openui-v2 program, parsed by the real @openuidev/lang-core (pass its createParser). */
  function fromOpenUI(text, createParser) {
    if (typeof createParser !== "function") throw Error("openui: pass @openuidev/lang-core's createParser");
    const source = strip(text);
    const parse = (rt) => createParser(FENCE, rt).parse(source);
    let r = parse("Board"); if (r.root?.typeName !== "Board") r = parse("EphemeralCards");
    const bad = r.meta.incomplete ? "program is incomplete" : r.meta.unresolved.length ? `unresolved: ${r.meta.unresolved}` : r.meta.errors.length ? JSON.stringify(r.meta.errors[0]) : !r.root ? "no root" : null;
    if (bad) throw Error(`openui: ${bad}`);
    const isBoard = r.root.typeName === "Board";
    const panels = isBoard ? r.root.props.panels.filter((p) => p?.typeName === "EphemeralCards") : [r.root]; // other Board panels are not cards
    return normalize({ title: r.root.props.title, ...(isBoard ? { summary: r.root.props.summary } : {}), cards: panels.flatMap((p) => p.props.cards) }, { provider: "openui", root: r.root.typeName });
  }

  /** An A2UI stream (JSONL, JSON array, one message, or parsed messages) through ./a2ui.js. */
  function fromA2UI(input) {
    const s = parseA2UI(input);
    return normalize({ title: s.root.title, summary: s.root.summary, cards: s.cards.map(({ componentId, ...c }) => c) },
      { provider: "a2ui", version: s.version, surfaceId: s.surfaceId, root: s.root.type, componentIds: s.cards.map((c) => c.componentId) });
  }

  /** Pick the adapter from the text itself: ephemeral-ui fences, then A2UI messages, then OpenUI Lang. */
  function fromProgram(text, { createParser } = {}) {
    return fromFences(text) ?? (looksLikeA2UI(text) ? fromA2UI(text) : fromOpenUI(text, createParser));
  }

  return { normalize, fromFences, fromOpenUI, fromA2UI, fromProgram, APP_INPUT, KINDS_ENUM };
}
