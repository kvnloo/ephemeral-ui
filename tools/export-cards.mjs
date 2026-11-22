#!/usr/bin/env node
// Export any set of kit cards as ONE self-contained interactive HTML document: the real card modules,
// the host theme from data/themes.json, and only the data the chosen cards read (fetch is shimmed).
// This is the shared artifact every host integration starts from (see INTEGRATION.md):
//   T3 html_render · Hermes desktop artifact pane (```html fence or .html file) · Tern browser page ·
//   Dash / Hermex / hermes-android WebViews.
//
//   node tools/export-cards.mjs --playlist '<site url with #pl=…>' --theme hermes-nous --out cards.html
//   node tools/export-cards.mjs --cards ripple:intent-declare,z0intelligence:intel-value --theme t3-dark --out x.html
//   node tools/export-cards.mjs --program reply.md   (```ephemeral-ui card.v0 fences, the Glide contract)
//   node tools/export-cards.mjs --program reply.openui --theme hermes-nous --host-vars --out x.html   (OPENUI_FROM=<dir with @openuidev/lang-core>/package.json)
//   node tools/export-cards.mjs --program reply.a2ui.jsonl --out x.html   (A2UI v0.9/v1.0 stream, catalog src/schema/a2ui-catalog.v0.json)
//   node tools/export-cards.mjs --catalog-prompt merge,ci   (prints the minimal catalog prompt for those kinds)
//   options: --title <text>  --host-vars (map --h-* onto the host page's own CSS vars, for T3 html_render)
//            --max-bytes <n> (default 512000, T3's html_render limit; fails instead of truncating)
//            --ops-data <file> (ops-* boards: a live ops-snapshot.v0 from tools/ops-collect.py instead of the public fixture)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fromProgram, APP_INPUT, MAX_CARDS } from "./card-spec.mjs";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes(`--${k}`);

// ---- --program: the agent's reply in any provider's format, through the one card spec (tools/card-spec.mjs):
// ```ephemeral-ui card.v0 fences (Glide), an openui-v2 program (T3's EphemeralCards contract, parsed by the real
// @openuidev/lang-core resolved from OPENUI_FROM=<package.json>) or an A2UI v0.9/v1.0 stream (src/js/a2ui.js).
// Every card's input is checked against card.v0.json $defs.appInput, so all three fail the same way.
let source = null;
async function fromProgramFile(text) {
  const spec = await fromProgram(text);
  source = spec.source;
  title ??= spec.title ?? (spec.cards.length === 1 ? spec.cards[0].title : undefined);
  return spec.cards.map((c) => [c.app, c.kind, c.input]);
}
if (arg("catalog-prompt")) { // the minimal catalog text for the kinds in play (the whole catalog costs ~922 input tokens)
  const ks = arg("catalog-prompt").split(",");
  console.log([`Answer with one openui-v2 block: root = Board("<title>", "<one-sentence summary>", [cards])`, `cards = EphemeralCards("<title>", [{kind, app?, input?}, …]) with 1..${MAX_CARDS} cards. Kinds: ${ks.join(", ")}.`,
    ...ks.filter((k) => APP_INPUT[k]).map((k) => `${k} input (real data; omit input for sample data): ${JSON.stringify(APP_INPUT[k])}`),
    "Use only values from the conversation or tool results; never invent data. Cards are read-only."].join("\n"));
  process.exit(0);
}
const out = arg("out"); if (!out) throw Error("--out required");
const maxBytes = +arg("max-bytes", 512000);

// ---- which cards
let title = arg("title"), themeId = arg("theme"), notes = {}, items;
if (arg("playlist")) {
  const raw = new URLSearchParams(new URL(arg("playlist")).hash.slice(1)).get("pl") ?? arg("playlist");
  const b = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const pl = JSON.parse(b);
  items = pl.items.map(([app, kind, note]) => { notes[`${app}/${kind}`] = note || ""; return [app, kind]; });
  title ??= pl.t; themeId ??= pl.th;
} else if (arg("program")) items = await fromProgramFile(fs.readFileSync(arg("program") === "-" ? 0 : arg("program"), "utf8"));
else items = (arg("cards") || "").split(",").filter(Boolean).map((s) => s.split(":"));
if (!items.length) throw Error("no cards: pass --playlist, --program or --cards app:kind,…");
themeId ??= "hermes-nous"; title ??= "ephemeral-ui cards";

// ---- kind → module (keys of each top-level KINDS_* object); fail loudly on an unknown kind
const MOD_CSS = { "kinds-3d": "studio.css", "kinds-c": "studio.css", "kinds-e": "studio.css", "kinds-f": "studio.css", "kinds-p": "studio.css", "kinds-t": "trace.css", "kinds-i": "intent.css", "kinds-infra": "infra.css", "kinds-fleet": ["fleet.css", "fleet-hosts.css", "fleet-pm.css", "fleet-factory.css"], "kinds-ops": ["stats.css", "ops.css"] };
const owner = {};
for (const f of fs.readdirSync(path.join(src, "js")).filter((f) => /^kinds-.*\.js$/.test(f))) {
  const s = fs.readFileSync(path.join(src, "js", f), "utf8"); const m = s.match(/export const (KINDS_\w+) = \{([\s\S]*?)\n\};?/) || s.match(/export const (KINDS_\w+) = \{(.*)\};/);
  if (!m) continue;
  for (const k of m[2].matchAll(/(?:^|\n|\{|,)\s*"?([a-z][\w-]*)"?\s*:\s*(?:\{|define\()/g)) owner[k[1]] ??= [f.replace(/\.js$/, ""), m[1]];
}
const themes = JSON.parse(fs.readFileSync(path.join(src, "data/themes.json"), "utf8"));
if (!themes.themes.some((t) => t.id === themeId)) throw Error(`unknown theme ${themeId}; have ${themes.themes.map((t) => t.id).join(", ")}`);
const apps = JSON.parse(fs.readFileSync(path.join(src, "data/apps.json"), "utf8"));
const byId = Object.fromEntries(apps.apps.map((a) => [a.id, a]));
for (const [app, kind] of items) { if (!byId[app]) throw Error(`unknown app ${app}`); if (!owner[kind]) throw Error(`unknown kind ${kind}`); }
const mods = [...new Set(items.map(([, k]) => owner[k][0]))];

// ---- data the cards read: apps (pruned to the used ones), themes, and per-module fixtures
const data = { "data/apps.json": { ...apps, apps: apps.apps.filter((a) => items.some(([id]) => id === a.id)) }, "data/themes.json": themes };
if (mods.includes("kinds-i")) data["data/intent-snapshot.json"] = JSON.parse(fs.readFileSync(path.join(src, "data/intent-snapshot.json"), "utf8"));
if (mods.includes("kinds-ops")) data["data/ops-fixture.json"] = JSON.parse(fs.readFileSync(arg("ops-data") ?? path.join(src, "data/ops-fixture.json"), "utf8"));
if (mods.includes("kinds-t")) data["data/trace-fixture.json"] = JSON.parse(fs.readFileSync(path.join(src, "data/trace-fixture.json"), "utf8"));

const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "eui-export-"));
const J = (p) => JSON.stringify(path.join(src, "js", p));
// --host-vars: kit token -> the host page's own CSS variable (shadcn names: T3 html_render, Hermex HTML reports).
const HOST_VARS = [["bg", "--background"], ["fg", "--foreground"], ["card", "--card"], ["card-solid", "--card"], ["mutedFg", "--muted-foreground"], ["muted", "--muted", "color-mix(in srgb, var(--card) 88%, var(--foreground))"], ["border", "--border"], ["primary", "--primary"], ["primaryFg", "--primary-foreground"], ["success", "--success"], ["warning", "--warning"], ["danger", "--destructive"], ["font", "--font-sans"], ["mono", "--font-mono"]];
// A2UI programs: each card answers its eui:intent with the renderer-to-agent action message for its
// EphemeralCard (window.__a2uiActions, and postMessage({ type: "a2ui:action", message }) to a framing host).
const a2uiWire = source?.provider !== "a2ui" ? "" : `
    const A2UI = ${JSON.stringify({ version: source.version, surfaceId: source.surfaceId, componentIds: source.componentIds })}, sourceComponentId = A2UI.componentIds[idx];
    cell.dataset.a2uiComponent = sourceComponentId;
    cell.addEventListener("eui:intent", (e) => {
      const message = toA2UIAction(e.detail, { version: A2UI.version, surfaceId: A2UI.surfaceId, sourceComponentId });
      (window.__a2uiActions ??= []).push(message);
      if (window.parent && window.parent !== window) window.parent.postMessage({ type: "a2ui:action", message }, "*");
    });`;
const entry = `
const DATA = ${JSON.stringify(data)};
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => { const k = String(u).replace(/^\\.?\\//, "").split("?")[0]; if (k in DATA) return new Response(JSON.stringify(DATA[k]), { headers: { "content-type": "application/json" } }); return realFetch ? realFetch(u) : Promise.reject(Error("offline: " + k)); };
import { loadThemes, state, apply } from ${J("themes.js")};
import { loadApps, catalog } from ${J("shell.js")};
import { Run, rng } from ${J("motion.js")};${source?.provider === "a2ui" ? `\nimport { toA2UIAction } from ${J("a2ui.js")};` : ""}
${mods.map((m, i) => `import { ${owner[Object.keys(owner).find((k) => owner[k][0] === m)][1]} as K${i} } from ${J(m + ".js")};`).join("\n")}
const KINDS = Object.assign({}, ${mods.map((_, i) => `K${i}`).join(", ")});
const ITEMS = ${JSON.stringify(items)}, NOTES = ${JSON.stringify(notes)};
(async () => {
  try { await loadThemes(); } catch (e) { state.themes = DATA["data/themes.json"].themes; }
  const chosen = state.themes.find((t) => t.id === ${JSON.stringify(themeId)}); state.over = {};
  const HOST_VARS = ${JSON.stringify(flag("host-vars") ? HOST_VARS : [])};
  // --host-vars: apply() writes the kit theme (tokens, color-scheme, ink) inline on <html>, beating the host.
  // Follow the host instead: take the same-host kit theme for the host's color-scheme, then rewrite each mapped
  // token as var(<host var>, <fallback>) so host colors win. Re-sync when the host rewrites its theme style live.
  const sync = () => {
    const r = document.documentElement;
    if (HOST_VARS.length) { r.style.removeProperty("color-scheme"); }
    const scheme = HOST_VARS.length ? (getComputedStyle(r).colorScheme.match(/light|dark/) || [chosen.scheme])[0] : chosen.scheme;
    state.base = state.themes.find((t) => t.host === chosen.host && t.scheme === scheme && t.id.startsWith(chosen.id.replace(/-dark$/, ""))) || chosen;
    apply(false);
    for (const [k, v, fb] of HOST_VARS) { const cur = r.style.getPropertyValue("--h-" + k).trim(); r.style.setProperty("--h-" + k, \`var(\${v}, \${fb || cur || "initial"})\`); }
  };
  sync();
  if (HOST_VARS.length) new MutationObserver(sync).observe(document.head, { childList: true, subtree: true, characterData: true });
  await loadApps();
  const grid = document.getElementById("cards");
  const settled = [];
  let failed = 0;
  for (const ${source?.provider === "a2ui" ? "[idx, [app, kind, input]] of ITEMS.entries()" : "[app, kind, input] of ITEMS"}) {
    const c = KINDS[kind].make(catalog.byId[app], rng(app + kind), input);
    const note = NOTES[app + "/" + kind];
    const cell = document.createElement("div"); cell.className = "xc-cell"; cell.dataset.kind = kind;
    if (note) { const n = document.createElement("p"); n.className = "xc-note"; n.textContent = note; cell.append(n); }
    cell.append(c.el); grid.append(cell);${a2uiWire}
    settled.push(Promise.resolve(c.done).then(() => c.play?.(new Run())).catch((e) => { failed++; cell.append(Object.assign(document.createElement("p"), { className: "xc-note", textContent: "Card failed: " + e.message })); }));
  }
  await Promise.all(settled);
  document.documentElement.dataset.ready = "1";
  // A framing host (sandboxed iframe, WebView) can't read this document; one message tells it the cards mounted.
  if (window.parent && window.parent !== window) window.parent.postMessage({ type: "eui:ready", cards: ITEMS.length - failed, failed }, "*");
})();`;
fs.writeFileSync(path.join(dir, "entry.js"), entry);
const esbuild = process.env.ESBUILD || [path.join(root, "node_modules/.bin/esbuild")].find((f) => fs.existsSync(f)) || "esbuild";
const bundle = execFileSync(esbuild, [path.join(dir, "entry.js"), "--bundle", "--format=iife", "--minify", "--log-level=error", "--legal-comments=none"], { encoding: "utf8", maxBuffer: 64 << 20 });
fs.rmSync(dir, { recursive: true });

const css = ["styles.css", ...new Set(mods.flatMap((m) => MOD_CSS[m] ?? []))].map((f) => fs.readFileSync(path.join(src, f), "utf8")).join("\n");
// T3 html_render: frame owns background + exposes its own tokens; plain hosts get the kit theme as is.
const hostVars = flag("host-vars") ? `:root{${HOST_VARS.map(([k, v]) => `--h-${k}:var(${v})`).join(";")}}html,body{background:none!important}` : `html,body{background:var(--h-bg);color:var(--h-fg)}`;
let page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title.replace(/</g, "&lt;")}</title><style>${css}
body{margin:0;padding:12px;font-family:var(--h-font,system-ui)}.xc-head{font:600 15px var(--h-font);margin:0 0 12px}.xc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:14px;align-items:start}.xc-cell{min-width:0}.xc-cell .eu-card{width:100%;max-width:none}.xc-note{margin:0 0 6px;font:12px/1.5 var(--h-font);color:var(--h-mutedFg)}.xc-foot{margin-top:14px;font:11px var(--h-font);color:var(--h-mutedFg)}
${hostVars}</style></head><body><h1 class="xc-head">${title.replace(/</g, "&lt;")}</h1><div id="cards" class="xc-grid"></div><p class="xc-foot">ephemeral-ui · ${items.length} card${items.length === 1 ? "" : "s"} · ${flag("host-vars") ? "host theme" : `theme ${themeId}`} · read-only snapshot data</p><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>`;
const VH = /(?<![\w.+/])(?:\d+(?:\.\d+)?|\.\d+)[sld]?vh(?![\w-])/gi;
if (flag("host-vars")) { page = page.replace(VH, (m) => `${Math.round(parseFloat(m) * 9)}px`); if (VH.test(page)) throw Error("vh units left in a T3 export"); }
const bytes = Buffer.byteLength(page);
if (bytes > maxBytes) throw Error(`export is ${bytes} bytes > --max-bytes ${maxBytes} (drop trace/3D kinds or raise the limit for file-based hosts)`);
fs.writeFileSync(out, page);
console.log(JSON.stringify({ out, bytes, theme: themeId, cards: items.length, modules: mods }));
