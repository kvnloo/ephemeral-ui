// providers.html: one card program from two providers, drawn by the same kit modules side by side.
// OpenUI Lang goes through the vendored @openuidev/lang-core parser, A2UI through ./a2ui.js; both end in
// ./card-spec.js normalize(), then KINDS[kind].make(app, rng(app + kind), input), the call every host uses.
//   providers.html?openui=<url>&a2ui=<url>#theme=<id>   (defaults: data/providers/merge.openui + merge.a2ui.jsonl)
// window.__providers: { specs, intents: { openui: [], a2ui: [] }, actions: [], check(text) → { ok, provider?, spec?, error? } }
import { createParser } from "../vendor/openui-lang-core.js";
import { cardSpec } from "./card-spec.js";
import { toA2UIAction } from "./a2ui.js";
import { loadThemes } from "./themes.js";
import { loadApps, catalog } from "./shell.js";
import { Run, rng, h } from "./motion.js";

// Programmable kind → module (tools/provider-parity.test.mjs checks this against catalog/catalog.json).
export const KIND_MODULES = {
  "kinds-a": ["inbox", "thread", "approve", "chat", "notify", "slots", "kanban", "triage", "file", "graph", "search", "feed", "frames", "sign", "context"],
  "kinds-b": ["receipt", "metric", "track", "crm", "ride", "route", "boarding", "player", "workout", "home", "merge", "ci", "deploy", "incident", "migrate"],
  "kinds-t": ["trace", "trace-span", "trace-summary", "trace-usage", "trace-tools", "trace-errors", "trace-compare", "trace-frustration"],
  "kinds-i": ["intent-declare", "intent-contract", "intent-work", "intent-proof", "intel-decisions", "intel-value", "intel-context", "intel-health"],
  "kinds-fleet": ["fleet-hosts", "fleet-portfolio", "fleet-factory"],
  "kinds-intel": ["intel-suite"],
};
async function kindDef(kind) {
  const mod = Object.keys(KIND_MODULES).find((m) => KIND_MODULES[m].includes(kind));
  if (!mod) throw Error(`no module draws ${kind}`);
  const m = await import(`./${mod}.js`);
  const def = Object.entries(m).filter(([k]) => /^KINDS_/.test(k)).map(([, v]) => v[kind]).find(Boolean);
  if (!def) throw Error(`${mod}.js has no ${kind}`);
  return def;
}

const get = async (u) => { const r = await fetch(u); if (!r.ok) throw Error(`${u}: HTTP ${r.status}`); return r.text(); };
const q = new URLSearchParams(location.search);
const urls = { openui: q.get("openui") || "data/providers/merge.openui", a2ui: q.get("a2ui") || "data/providers/merge.a2ui.jsonl" };
const P = (window.__providers = { specs: {}, intents: { openui: [], a2ui: [] }, actions: [], errors: [] });

try {
  await loadThemes(); await loadApps();
  const [card, apps] = await Promise.all([get("schema/card.v0.json"), get("data/apps.json")]).then((x) => x.map(JSON.parse));
  const S = cardSpec({ card, apps: apps.apps });
  P.check = (text) => { try { const spec = S.fromProgram(text, { createParser }); return { ok: true, provider: spec.source.provider, spec: JSON.parse(JSON.stringify(spec)) }; } catch (e) { return { ok: false, error: String(e.message || e), code: e.code }; } };
  const stage = document.getElementById("stage");
  for (const [provider, url] of Object.entries(urls)) {
    const text = await get(url);
    const spec = provider === "openui" ? S.fromOpenUI(text, createParser) : S.fromA2UI(text);
    P.specs[provider] = JSON.parse(JSON.stringify(spec));
    const col = h("section", { class: "pv-col", "data-provider": provider }, h("p", { class: "pv-tag" }, provider === "openui" ? "OpenUI Lang" : `A2UI ${spec.source.version}`, h("span", { class: "eu-hint" }, ` · ${url.split("/").pop()}`)),
      h("h2", { class: "pv-title" }, spec.title ?? ""), spec.summary ? h("p", { class: "pv-sum" }, spec.summary) : null);
    const cells = h("div", { class: "pv-cards" });
    col.append(cells); stage.append(col);
    col.addEventListener("eui:intent", (e) => P.intents[provider].push(e.detail));
    for (const [i, c] of spec.cards.entries()) {
      const def = await kindDef(c.kind);
      const k = def.make(catalog.byId[c.app], rng(c.app + c.kind), c.input === undefined ? undefined : structuredClone(c.input));
      const cell = h("div", { class: "pv-cell", "data-kind": c.kind }, k.el);
      if (provider === "a2ui") {
        const sourceComponentId = spec.source.componentIds[i];
        cell.dataset.a2uiComponent = sourceComponentId;
        cell.addEventListener("eui:intent", (e) => P.actions.push(toA2UIAction(e.detail, { version: spec.source.version, surfaceId: spec.source.surfaceId, sourceComponentId })));
      }
      cells.append(cell);
      await Promise.resolve(k.done); k.play?.(new Run())?.catch?.(() => {});
    }
  }
} catch (e) {
  P.errors.push(String(e.message || e));
  document.getElementById("stage").append(h("p", { class: "pv-err" }, `Could not draw: ${e.message || e}`));
}
document.documentElement.dataset.ready = "1";
