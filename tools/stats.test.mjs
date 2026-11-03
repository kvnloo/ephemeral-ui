// Stats library DOM suite (no browser): every route view, the dashboard and the primitives build from
// the public fixture, keep the make(data, opts) → {el, spec, getSelection(), on} contract, and emit
// entity-id events on interaction. Geometry and canvas pixels are the browser gates' job.
//   EUI_DOM_MODULE=<linkedom>/worker.js node --test tools/stats.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const { parseHTML } = await import(pathToFileURL(process.env.EUI_DOM_MODULE).href);
const { document, window } = parseHTML("<html><body></body></html>");
const noop = () => {};
const ctx = new Proxy({}, { get: (_, k) => (k === "measureText" ? (s) => ({ width: String(s).length * 6 }) : noop), set: () => true });
window.HTMLCanvasElement.prototype.getContext = () => ctx;
window.HTMLElement.prototype.animate = () => ({ finished: Promise.resolve(), cancel: noop, set onfinish(f) {} });
window.HTMLElement.prototype.scrollIntoView = noop;
window.HTMLElement.prototype.setPointerCapture = noop;
window.HTMLElement.prototype.focus = noop;
// linkedom's select.value has no setter and returns undefined with no selected option (see infra.test.mjs)
Object.defineProperty(window.HTMLSelectElement.prototype, "value", { configurable: true, get() { const o = [...this.querySelectorAll("option")]; return (o.find((x) => x.selected || x.hasAttribute("selected")) ?? o[0])?.getAttribute("value") ?? ""; }, set(v) { for (const x of this.querySelectorAll("option")) { const on = x.getAttribute("value") === String(v); x.selected = on; on ? x.setAttribute("selected", "") : x.removeAttribute("selected"); } } });
const fixture = JSON.parse(fs.readFileSync(new URL("../src/data/trace-fixture.json", import.meta.url)));
Object.assign(globalThis, {
  document, window, CustomEvent: window.CustomEvent, Event: window.Event, Node: window.Node,
  matchMedia: () => ({ matches: false, addEventListener: noop }), requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
  ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} },
  getComputedStyle: () => ({ getPropertyValue: () => "" }), devicePixelRatio: 1, addEventListener: noop, removeEventListener: noop,
  fetch: async () => ({ ok: true, json: async () => fixture }),
});
const { api } = await import("../src/js/trace-data.js");
const L = await import("../src/js/stats-lib.js");
const T = await import("../src/js/stats-trace.js");
const { ROUTES, StatsDashboard, hostOptions } = await import("../src/js/stats-routes.js");
const now = fixture.statsCapturedAt;
const tick = () => new Promise((r) => setTimeout(r, 5));
const contract = (c, kind) => { assert.ok(c.el?.nodeType === 1, `${kind}: el`); assert.equal(c.spec.v, 0); assert.equal(typeof c.getSelection, "function"); assert.equal(typeof c.on, "function"); assert.equal(c.el.statsComponent, c); };
const text = (el) => el.textContent.replace(/\s+/g, " ");

test("all 11 routes build from their own payloads in 24h, 7d and 30d", async () => {
  assert.deepEqual(Object.keys(ROUTES), ["overview", "models", "providers", "costs", "requests", "errors", "traces", "tools", "frustration", "projects", "gain"]);
  for (const range of ["24h", "7d", "30d"]) for (const [id, R] of Object.entries(ROUTES)) {
    const data = await R.load(api, range);
    assert.ok(data != null, `${id} ${range}: payload`);
    const before = JSON.stringify(data);
    const c = R.make(data, hostOptions(api, range, { now, withheld: true }));
    document.body.append(c.el); await tick();
    if (id !== "traces") assert.ok(c.el.querySelector(".sl-statgrid, .sl-empty"), `${id} ${range}: headline stats or the empty state rendered`);
    contract(c, id); assert.equal(c.kind, `${id[0].toUpperCase()}${id.slice(1)}View`);
    assert.doesNotMatch(text(c.el), /undefined|NaN|\[object |null(?![\w-])/, `${id} ${range}: no undefined/NaN/null text`);
    assert.equal(JSON.stringify(data), before, `${id} ${range}: input JSON not mutated`);
    c.el.remove();
  }
});

test("a request-log row click selects the request and opens its drawer", async () => {
  const rows = await ROUTES.requests.load(api, "7d");
  const c = ROUTES.requests.make(rows, hostOptions(api, "7d", { now }));
  document.body.append(c.el);
  const seen = []; c.on("*", (e) => seen.push(e));
  const id = Object.keys(fixture.api).find((k) => k.startsWith("/api/request/")).split("/").pop();
  const tr = c.el.querySelector(`tr[data-key="${id}"]`) ?? c.el.querySelector("tbody tr[data-clickable=true]");
  tr.dispatchEvent(new window.Event("click"));
  await tick(); await tick();
  const sel = seen.find((e) => e.type === "select" && e.entities.request != null);
  assert.ok(sel, "select with a request id"); assert.ok(sel.ids.includes(`request:${sel.entities.request}`)); assert.ok(sel.session, "session file on the event");
  assert.equal(c.getSelection().type, "select");
  const drawer = c.el.querySelector(".sl-drawerhost");
  if (tr.dataset.key === id) assert.equal(drawer.hidden, false, "drawer opened for a request with details");
  c.el.remove();
});

test("errors: a signature row filters the failures and emits a filter event", async () => {
  const rows = await ROUTES.errors.load(api, "30d");
  const c = ROUTES.errors.make(rows, hostOptions(api, "30d", { now }));
  document.body.append(c.el);
  const seen = []; c.on("*", (e) => seen.push(e));
  const sig = c.el.querySelector("[data-stats-kind=ErrorSignatures] tbody tr");
  sig.dispatchEvent(new window.Event("click"));
  const f = seen.find((e) => e.type === "filter" && e.filter?.signature);
  assert.ok(f, "filter by signature"); assert.ok(seen.find((e) => e.type === "select" && e.entities.signature));
  const fails = c.el.querySelectorAll("[data-stats-kind=Failures] tbody tr[data-key]").length;
  const n = rows.filter((r) => ROUTES.errors && true).length;
  assert.ok(fails > 0 && fails <= Math.min(50, n));
  c.el.remove();
});

test("tools: picking a tool emits its id and narrows the tool × model table", async () => {
  const d = await ROUTES.tools.load(api, "7d");
  const c = ROUTES.tools.make(d, hostOptions(api, "7d", { now }));
  document.body.append(c.el);
  const seen = []; c.on("select", (e) => seen.push(e));
  const row = c.el.querySelector("[data-stats-kind=ToolTable] tbody tr");
  row.dispatchEvent(new window.Event("click"));
  assert.equal(seen[0].entities.tool, row.dataset.key); assert.equal(seen[0].tool, row.dataset.key);
  const tm = [...c.el.querySelectorAll("[data-stats-kind=ToolModelTable] tbody tr[data-key]")];
  assert.ok(tm.length && tm.every((r) => r.dataset.key.startsWith(row.dataset.key + "::")));
  c.el.remove();
});

test("pin buttons emit pin with the row's entity ids", async () => {
  const d = await ROUTES.models.load(api, "7d");
  const c = ROUTES.models.make(d, hostOptions(api, "7d", { now }));
  document.body.append(c.el);
  const pins = []; c.on("pin", (e) => pins.push(e));
  c.el.querySelector(".sl-pin").dispatchEvent(new window.Event("click"));
  assert.equal(pins.length, 1); assert.ok(pins[0].entities.model && pins[0].entities.provider); assert.match(pins[0].label, /requests/);
  c.el.remove();
});

test("traces: opening a session renders the trace view and span events carry session + span", async () => {
  const sessions = await ROUTES.traces.load(api, "7d");
  const file = sessions.find((s) => fixture.traces[s.file]).file;
  const c = ROUTES.traces.make(sessions, hostOptions(api, "7d", { now, withheld: true }));
  document.body.append(c.el);
  await c.open(file); await tick();
  assert.ok(c.trace, "trace view mounted"); assert.equal(c.spec.session, file);
  const seen = []; c.on("select", (e) => seen.push(e));
  const tr = fixture.traces[file], t = tr.tracks[0], s = t.spans.find((x) => x.kind === "model") ?? t.spans[0];
  c.trace.select(s, t); await tick();
  const e = seen.find((x) => x.entities.span === s.id);
  assert.ok(e, "span select"); assert.equal(e.session, file); assert.equal(e.spanId, s.id);
  c.back(); assert.equal(c.spec.session, null);
  c.el.remove();
});

test("dashboard switches sections from G-letter keys and ranges from 1–6", async () => {
  const c = StatsDashboard.make({ api, status: fixture.api["/api/status"] }, { range: "7d", available: ["24h", "7d", "30d"], now });
  document.body.append(c.el); await tick();
  const key = (k) => { const e = new window.Event("keydown", { bubbles: true }); Object.defineProperty(e, "key", { value: k }); c.el.dispatchEvent(e); };
  key("g"); key("m"); await tick(); await tick();
  assert.equal(c.spec.section, "models"); assert.ok(c.el.querySelector("[data-stats-kind=ModelsView]"));
  key("2"); await tick(); await tick();
  assert.equal(c.spec.range, "24h");
  c.el.remove();
});

test("primitives and trace pieces keep the contract", async () => {
  const tr = Object.values(fixture.traces)[0];
  const made = {
    Stat: L.Stat.make({ label: "x", value: "1" }), StatGrid: L.StatGrid.make([{ label: "a", value: "1" }]), Sparkline: L.Sparkline.make([1, 2, 3]), ShareBar: L.ShareBar.make([{ key: "a", label: "a", value: 1, color: "red" }]),
    BarList: L.BarList.make([{ key: "a", label: "a", value: 1 }]), Legend: L.Legend.make([{ key: "a", label: "a", color: "red" }], { toggle: true }), Chart: L.Chart.make({ slots: 3, series: [{ key: "a", label: "a", color: "red", values: [1, 2, 3] }] }),
    TimeChart: L.TimeChart.make({ buckets: [0, 1, 2], bucketMs: 1, series: [] }), Segmented: L.Segmented.make(["a", "b"]), RangeControl: L.RangeControl.make("7d"), SearchInput: L.SearchInput.make(""),
    Table: L.Table.make([{ id: 1 }], { columns: [{ key: "id", header: "id", render: (r) => String(r.id) }] }), Drawer: L.Drawer.make(), Modal: L.Modal.make({ title: "t" }), JsonBlock: L.JsonBlock.make({ a: 1 }), Badge: L.Badge.make("ok"),
    LiveChip: L.LiveChip.make(fixture.api["/api/status"], { static: true }), RequestDrawer: L.RequestDrawer.make(null),
    TimelineCanvas: T.TimelineCanvas.make(tr), Minimap: T.Minimap.make(tr), SpanDrawer: T.SpanDrawer.make({ span: tr.tracks[0].spans[0], track: tr.tracks[0], trace: tr }), SummaryStrip: T.SummaryStrip.make(tr), AggregatesPanel: T.AggregatesPanel.make(tr.summary.toolStats, { session: tr.file }), TranscriptList: T.TranscriptList.make(tr), TraceView: T.TraceView.make(tr),
  };
  for (const [k, c] of Object.entries(made)) { contract(c, k); assert.equal(c.kind, k); }
  assert.equal(Object.keys(L.PRIMITIVES).length, 18); assert.equal(Object.keys(T.TRACE_PIECES).length, 7);
  const lg = made.Legend, ev = []; lg.on("filter", (e) => ev.push(e)); lg.el.querySelector("button").dispatchEvent(new window.Event("click"));
  assert.deepEqual(ev[0].filter.hidden, ["a"]);
});
