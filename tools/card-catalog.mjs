#!/usr/bin/env node
// The shared card catalog (catalog/catalog.json): every card kind the kit's modules define, with 1-3
// fixtures each, generated from the modules themselves. Each kind's real make() runs under linkedom and its
// spec becomes the fixture's props, so the catalog cannot list a kind the code lacks or miss one it has.
//
//   node tools/card-catalog.mjs            # rewrite catalog/catalog.json
//   node tools/card-catalog.mjs --check    # exit 1 when catalog/catalog.json is stale (CI, catalog.test.mjs)
//
// Apps consume the file as described in catalog/README.md. Bump catalog/VERSION when kinds or props change.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");
export const CATALOG_FILE = path.join(root, "catalog/catalog.json");
const rel = (f) => path.relative(root, f).split(path.sep).join("/");

// A frozen clock: kinds that stamp "updated 3m ago" or now() must give the same props on every run.
export const FIXED_AT = "2026-11-01T12:00:00.000Z";
const FIXED_MS = Date.parse(FIXED_AT);

// Kinds no app in src/data/apps.json lists, and that no module maps to an app (FLEET_APPS, OPS_APPS,
// INTEL_APPS do for theirs): the app their own tests mount them with.
const OWN_APP = { "cua-action": "cua", "work-dock": "z0", "gev-contacts": "god-s-eye-view", "intel-suite": "glide" /* INTEL_APPS, intel-suite.js */ };
// Card modules by role, for grouping in galleries. A new kinds-*.js lands in "app" until it is named here.
const GROUP = { "kinds-a": "app", "kinds-b": "app", "kinds-3d": "studio", "kinds-c": "studio", "kinds-e": "studio", "kinds-f": "studio", "kinds-p": "studio",
  "kinds-t": "trace", "kinds-i": "intent", "kinds-ops": "ops", "kinds-fleet": "fleet", "kinds-intel": "intel", "kinds-cua": "agent", "kinds-dock": "agent", "kinds-gev": "agent" };
// Fixture files a module's reference renderer reads (fetches) besides apps.json and themes.json.
const DATA = { "kinds-i": ["src/data/intent-snapshot.json"], "kinds-ops": ["src/data/ops-fixture.json"], "kinds-t": ["src/data/trace-fixture.json"] };
const MAX_FIXTURES = 3;
// card.v0 $defs.appInput kinds draw real data from card.input. The catalog adds one input fixture each, built
// from the sample card's own content, so a gallery exercises the data path too (catalog.test.mjs validates it).
const APP_INPUT = {
  merge: { number: 128, title: "Refresh sessions in the auth middleware", state: "conflict", head: "feat/session", base: "main", conflicts: 3,
    checks: [{ name: "Tests", status: "pass", detail: "42 passed" }, { name: "Lint", status: "pass", detail: "passed" }, { name: "Types", status: "pass", detail: "passed" }, { name: "Preview", status: "running", detail: "building" }],
    commits: [{ title: "Refresh sessions in middleware", sha: "3f2c1a9", author: "Ivy", age: "1h", lane: "head" }, { title: "Rotate session keys", sha: "8b04d2e", author: "Sam", age: "2h", lane: "head", conflict: true },
      { title: "Bump deps", sha: "c71e5f0", author: "Theo", age: "3h", lane: "base" }, { title: "Fix cookie SameSite", sha: "e2a9b44", author: "Priya", age: "4h", lane: "base" }] },
};

let env = null;
/** linkedom with the stubs the export check uses (Web Animations, canvas, observers) and a fixed clock. */
export async function setup() {
  if (env) return env;
  const { parseHTML } = await import(process.env.EUI_DOM_MODULE ? pathToFileURL(process.env.EUI_DOM_MODULE).href : "linkedom");
  const { document, window } = parseHTML("<!doctype html><html><head></head><body><div id=cards></div><div id=pinslot></div></body></html>");
  const El = window.HTMLElement.prototype.__proto__;
  El.animate = function () { return { finished: Promise.resolve(), cancel() {}, pause() {}, play() {}, finish() {}, reverse() {}, currentTime: 0, onfinish: null }; };
  El.getAnimations ??= () => [];
  El.getBoundingClientRect ??= () => ({ x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 200, width: 320, height: 200 });
  const ctx = new Proxy({}, { get: (t, k) => (k === "measureText" ? () => ({ width: 10 }) : /^(create|get)/.test(k) ? () => ctx : k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  if (window.HTMLCanvasElement) window.HTMLCanvasElement.prototype.getContext = () => ctx;
  const noop = () => {};
  const observer = class { observe() {} unobserve() {} disconnect() {} };
  Object.assign(globalThis, {
    document, window, CustomEvent: window.CustomEvent, addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
    location: new URL("http://localhost/"), localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }), requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    IntersectionObserver: observer, ResizeObserver: observer, MutationObserver: observer, getComputedStyle: () => ({ getPropertyValue: () => "" }),
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800, ProgressEvent: globalThis.ProgressEvent ?? class extends Event { constructor(t, o = {}) { super(t); Object.assign(this, o); } },
  });
  for (const m of ["warn", "error"]) { const o = console[m]; console[m] = (...a) => (/^THREE\./.test(String(a[0])) ? undefined : o(...a)); } // no WebGL here
  const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [FIXED_MS])); } static now() { return FIXED_MS; } };
  globalThis.fetch = async (u) => {
    const url = new URL(typeof u === "string" ? u : u.url ?? String(u), "http://localhost/");
    const f = url.protocol === "file:" ? fileURLToPath(url) : path.join(src, decodeURIComponent(url.pathname));
    if (!f.endsWith(".json")) return new Promise(() => {}); // meshes and media never arrive: props, not paint
    if (!f.startsWith(src) || !fs.existsSync(f)) throw Error(`offline: ${u}`);
    return new Response(fs.readFileSync(f), { headers: { "content-type": "application/json" } });
  };
  const imp = (f) => import(pathToFileURL(path.join(src, "js", f)).href);
  const { loadApps, catalog } = await imp("shell.js");
  const { rng } = await imp("motion.js");
  const { state } = await imp("themes.js");
  state.themes = JSON.parse(fs.readFileSync(path.join(src, "data/themes.json"), "utf8")).themes;
  state.base = state.themes.find((t) => t.id === "t3-light"); state.over = {};
  await loadApps();
  env = { document, catalog, rng, imp };
  return env;
}

/** Every KINDS_* export of src/js/kinds-*.js, in file order: kind → { module, exportName, def }; plus the *_APPS maps. */
export async function kinds() {
  const { imp } = await setup();
  const list = new Map(), owners = {};
  for (const f of fs.readdirSync(path.join(src, "js")).filter((f) => /^kinds-.*\.js$/.test(f)).sort()) {
    const m = await imp(f);
    for (const [name, v] of Object.entries(m)) {
      if (/^[A-Z]+_APPS$/.test(name)) Object.assign(owners, v);
      if (!/^KINDS_[A-Z0-9_]+$/.test(name) || !v || typeof v !== "object") continue;
      for (const [k, def] of Object.entries(v)) if (typeof def?.make === "function" && !list.has(k)) list.set(k, { module: f.replace(/\.js$/, ""), exportName: name, def });
    }
  }
  return { list, owners };
}

/** The kinds src/js/main.js puts on the site (its KINDS spread). */
function siteKinds(list) {
  const main = fs.readFileSync(path.join(src, "js/main.js"), "utf8");
  const spread = main.match(/export const KINDS = \{([^}]*)\}/)[1].match(/KINDS_\w+/g);
  return new Set([...list].filter(([, v]) => spread.includes(v.exportName)).map(([k]) => k));
}

/** Data documents for the kinds that render only validated data (fleet.v0, intel.v0): their own authored examples. */
async function examples() {
  const { imp } = await setup();
  const fleet = await imp("fleet-data.js"), intel = await imp("intel-data.js");
  return {
    "fleet-hosts": { at: FIXED_AT, hosts: fleet.HOSTS },
    "fleet-portfolio": { at: FIXED_AT, portfolios: fleet.PORTFOLIOS },
    "fleet-factory": { at: FIXED_AT, ...fleet.FACTORY },
    "intel-suite": { ...structuredClone(intel.INTEL_DEMO), at: FIXED_AT },
  };
}

/** Mount one fixture with the reference renderer, the way an app's gallery mounts it natively. */
export async function render(fixture, def) {
  const { catalog, rng, document } = await setup();
  const a = catalog.byId[fixture.card.app] || { id: fixture.card.app, name: fixture.card.app, hex: null };
  const c = def.make(a, rng(fixture.seed), fixture.card.input === undefined ? undefined : structuredClone(fixture.card.input));
  await Promise.resolve(c.done);
  document.getElementById("cards").append(c.el);
  return c;
}

export const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
export const propsOf = (spec) => sortKeys(JSON.parse(JSON.stringify(spec)));

export async function build() {
  const { catalog } = await setup();
  const card = JSON.parse(fs.readFileSync(path.join(src, "schema/card.v0.json"), "utf8"));
  const programmable = new Set(card.properties.kind.enum), appInput = card.$defs.appInput;
  const { list, owners } = await kinds(), site = siteKinds(list), data = await examples();
  const apps = JSON.parse(fs.readFileSync(path.join(src, "data/apps.json"), "utf8")).apps;
  const entries = [];
  for (const [kind, { module, exportName, def }] of list) {
    const listed = apps.filter((a) => a.kinds?.includes(kind)).slice(0, MAX_FIXTURES).map((a) => a.id);
    const ids = listed.length ? listed : [owners[kind] ?? OWN_APP[kind]];
    if (!ids[0]) throw Error(`${kind}: no app lists it; name its app in OWN_APP`);
    const input = data[kind] ? "data" : appInput[kind] ? "appInput" : "none";
    if (input === "appInput" && !APP_INPUT[kind]) throw Error(`${kind}: card.v0 lists an appInput for it; add an APP_INPUT fixture`);
    const plan = input === "data"
      ? [{ id: `${kind}/${ids[0]}`, app: ids[0], state: "example", input: data[kind] }, { id: `${kind}/${ids[0]}/unavailable`, app: ids[0], state: "unavailable" }]
      : ids.map((app) => ({ id: `${kind}/${app}`, app, state: "sample" }));
    if (input === "appInput") plan.splice(MAX_FIXTURES - 1, Infinity, { id: `${kind}/${ids[0]}/input`, app: ids[0], state: "input", input: APP_INPUT[kind] });
    const fixtures = [];
    for (const p of plan) {
      const fx = { id: p.id, state: p.state, seed: p.app + kind, card: { kind, app: p.app } };
      if (p.input !== undefined) fx.card.input = p.input;
      const c = await render(fx, def);
      if (c.spec?.kind !== kind) throw Error(`${fx.id}: spec.kind is ${c.spec?.kind}`);
      fx.props = propsOf(c.spec);
      c.el.remove();
      fixtures.push(fx);
    }
    entries.push({ kind, label: def.label, group: GROUP[module] ?? "app", module: `src/js/${module}.js`, export: exportName,
      site: site.has(kind), programmable: programmable.has(kind), input, data: DATA[module] ?? [],
      apps: ids.map((id) => ({ id, name: catalog.byId[id]?.name ?? id, inCatalog: !!catalog.byId[id] })), fixtures });
  }
  const version = fs.readFileSync(path.join(root, "catalog/VERSION"), "utf8").trim();
  return {
    $schema: "./catalog.schema.json",
    $comment: "Generated by tools/card-catalog.mjs from src/js/kinds-*.js. Do not edit; run `node tools/card-catalog.mjs`.",
    v: 0, version, generatedAt: FIXED_AT,
    renderer: { modules: "src/js/kinds-*.js", call: "KINDS[kind].make(app, rng(fixture.seed), fixture.card.input)", apps: "src/data/apps.json", themes: "src/data/themes.json", cardSchema: "src/schema/card.v0.json" },
    count: { kinds: entries.length, fixtures: entries.reduce((n, e) => n + e.fixtures.length, 0) },
    kinds: entries,
  };
}

export const serialize = (c) => JSON.stringify(c, null, 1) + "\n";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = serialize(await build());
  if (process.argv.includes("--check")) {
    const cur = fs.existsSync(CATALOG_FILE) ? fs.readFileSync(CATALOG_FILE, "utf8") : "";
    if (cur !== text) { console.error(`${rel(CATALOG_FILE)} is stale: run node tools/card-catalog.mjs`); process.exit(1); }
    console.log(`${rel(CATALOG_FILE)} is up to date`);
  } else {
    fs.mkdirSync(path.dirname(CATALOG_FILE), { recursive: true });
    fs.writeFileSync(CATALOG_FILE, text);
    const c = JSON.parse(text);
    console.log(`wrote ${rel(CATALOG_FILE)}: ${c.count.kinds} kinds, ${c.count.fixtures} fixtures, version ${c.version}`);
  }
  process.exit(0); // cards leave timers (loops, tickers) behind
}
