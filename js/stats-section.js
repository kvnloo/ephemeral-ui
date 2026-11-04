// "Stats library" section of the site, and the #ask / #ask=<question> / #stats=<component> deep links.
// Boots on its own (no main.js hunk): it waits for main.js's async boot (html.ready), then builds the
// section when it nears the viewport or a deep link targets it. Every demo renders on the sanitized
// fixture through trace-data.js `api()`, which answers with the omp-stats JSON shapes unchanged.
import { h } from "./motion.js";
import { api, ready } from "./trace-data.js";
import * as L from "./stats-lib.js";
import * as T from "./stats-trace.js";
import { ROUTES, StatsDashboard, hostOptions } from "./stats-routes.js";

const AVAILABLE = ["24h", "7d", "30d"];
// "#stats=<component>&range=30d" picks the sample range the demos read (24h, 7d or 30d).
const hashRange = new URLSearchParams(location.hash.slice(1)).get("range");
const RANGE = AVAILABLE.includes(hashRange) ? hashRange : "7d";
// Providers: the sample only has per-account window snapshots for 30d.
const DEMO_RANGE = { providers: "30d" };
let fx = null;
const now = () => fx?.statsCapturedAt ?? Date.now();
const opts = (extra) => hostOptions(api, RANGE, { now: now(), withheld: true, ...extra });
const firstTrace = () => { const s = fx.sessions.find((x) => fx.traces[x.file]) ?? fx.sessions[0]; return fx.traces[s.file]; };
const pickSpan = (tr, kind) => { for (const t of tr.tracks) for (const s of t.spans) if (s.kind === kind) return { span: s, track: t, trace: tr }; return null; };

const ROUTE_DESC = {
  overview: "Totals with sparklines, the Activity chart (Requests · Tokens · Cost), token mix by kind and agent, and the latest requests with their request drawer.",
  models: "Models used, request share over time (Share · Requests, legend toggles), and the model table whose rows expand into latency and throughput charts.",
  providers: "Provider totals (rows expand to token mix), burn by provider (Tokens · Cost · Requests), peak burn hours by local hour, subscription windows and per-account window utilization.",
  costs: "API-equivalent estimate per UTC day by model or billing component, where it went, and the per-model cost table with its split.",
  requests: "The request log: search, status filter with counts, sortable columns, paging and the request drawer.",
  errors: "Failures grouped by normalized signature (rows expand to the latest message and Open latest), by model, and the filtered failure list with chips.",
  traces: "Sessions table with search; open one for its whole trace view. ← Sessions goes back.",
  tools: "Tool calls and errors over time, the per-tool table (select filters the next table) and tool × model breakdown with its select.",
  frustration: "Annoyance rates per model version: judge panel and estimate modal (live hosts only), model-class segments, family legend toggles, size/regex filters, layered bars and the table.",
  projects: "Usage per session folder: top by cost and by requests, and the folder table with search and the temporary-folder toggle.",
  gain: "Tokens snapcompact kept out of context, per day with a running total and per source. The sample recorded none, so it shows the real empty state.",
};

/** One demo per component: [name, group, description, build() → component]. */
const DEMOS = [
  ["Dashboard", "App", "The whole /stats app as one component: grouped nav with G-letter jumps, the range picker (keys 1–6), the live chip and every route below. Shortcuts only fire while focus is inside it.", () => StatsDashboard.make({ api, status: fx.api["/api/status"] }, { range: RANGE, available: AVAILABLE, now: now(), withheld: true })],
  ...Object.entries(ROUTES).map(([id, R]) => [R.label, "Routes", ROUTE_DESC[id], async () => { const r = hashRange && AVAILABLE.includes(hashRange) ? hashRange : DEMO_RANGE[id] ?? RANGE; return R.make(await R.load(api, r), opts({ range: r })); }]),
  ["Stat", "Primitives", "One headline number with label, hint, delta and sparkline. selectable emits select; set({value}) flashes live updates.", async () => { const ov = await api(`/api/stats/overview?range=${RANGE}`); const c = L.StatGrid.make([{ label: "Requests", value: L.fmt.int(ov.overall.totalRequests), hint: `${ov.overall.failedRequests} failed`, delta: { change: 0.12 }, spark: ov.timeSeries.map((p) => p.requests), key: "requests" }, { label: "Error rate", value: L.fmt.rate(ov.overall.errorRate), delta: { change: 0.4, good: "down" }, tone: "bad", key: "errorRate" }], { min: 200, selectable: true }); return c.rename("Stat"); }],
  ["StatGrid", "Primitives", "Hairline grid of stats that wraps by a minimum cell width.", async () => { const ov = (await api(`/api/stats/overview?range=${RANGE}`)).overall; return L.StatGrid.make([["Uncached input", ov.totalInputTokens], ["Cache read", ov.totalCacheReadTokens], ["Cache write", ov.totalCacheWriteTokens], ["Output", ov.totalOutputTokens]].map(([label, v]) => ({ label, value: L.fmt.compact(v), key: label })), { min: 140, size: "sm", selectable: true }); }],
  ["Sparkline", "Primitives", "Tiny area/line trend for table cells and stats.", async () => { const t = await api(`/api/stats/tools?range=30d`); const days = new Map(); for (const p of t.series) days.set(p.timestamp, (days.get(p.timestamp) ?? 0) + p.calls); return L.Sparkline.make([...days].sort((a, b) => a[0] - b[0]).map((x) => x[1]), { height: 40 }); }],
  ["ShareBar", "Primitives", "Proportional segments; selectable segments emit select with their key.", async () => { const ov = (await api(`/api/stats/overview?range=${RANGE}`)).overall; return L.ShareBar.make([["input", "Uncached input", ov.totalInputTokens, "#5b8cff"], ["cacheRead", "Cache read", ov.totalCacheReadTokens, "var(--sl-c1)"], ["cacheWrite", "Cache write", ov.totalCacheWriteTokens, "#f5b54a"], ["output", "Output", ov.totalOutputTokens, "var(--sl-c2)"]].map(([key, label, value, color]) => ({ key, label, value, color })), { height: 12, selectable: true }); }],
  ["BarList", "Primitives", "Ranked rows with proportional fills. Clicking a row toggles it and emits select with its entity ids.", async () => { const t = await api(`/api/stats/tools?range=${RANGE}`); return L.BarList.make(t.byTool.slice(0, 8).map((x) => ({ key: x.tool, label: x.tool, value: x.calls })), { ids: (k) => ({ tool: k }) }); }],
  ["Legend", "Primitives", "Series key; with toggle each item hides its series and emits filter {hidden}.", () => L.Legend.make([{ key: "ok", label: "Succeeded", color: "var(--sl-c1)", value: "99.9%" }, { key: "err", label: "Failed", color: "var(--sl-bad)", value: "0.1%" }], { toggle: true })],
  ["Chart", "Primitives", "Categorical SVG chart: stacked or grouped bars, areas, lines, right axis, references, hover tooltip, click-a-slot select, drag brush, legend toggles. On touch: tap shows the tooltip, a second tap selects, a sideways drag scrubs, long-press then drag brushes.", async () => { const p = await api(`/api/stats/providers?range=${RANGE}`); const tok = Array(24).fill(0); for (const x of p.hourly) tok[x.hour] += x.totalTokens; return L.Chart.make({ slots: 24, series: [{ key: "tokens", label: "Tokens", color: "var(--sl-c1)", values: tok }] }, { height: 200, tickLabel: (i) => String(i).padStart(2, "0"), slotIds: (i) => ({ ids: { key: `hour:${i}` }, label: `hour ${i}` }), references: [{ value: Math.max(...tok) * 0.75, label: "75% of peak" }] }); }],
  ["TimeChart", "Primitives", "Chart over time buckets. Hover shows the crosshair tooltip; click selects a bucket's time range; drag across buckets brushes a range; double-click clears. On touch: tap shows the tooltip, a second tap selects, long-press then drag brushes.", async () => { const ov = await api(`/api/stats/overview?range=${RANGE}`), m = L.RANGE_META[RANGE], b = L.bucketAxis(RANGE, ov.timeSeries.map((p) => p.timestamp), m.bucket, now()); return L.TimeChart.make({ buckets: b, bucketMs: m.bucket, series: [{ key: "ok", label: "Succeeded", color: "var(--sl-c1)", values: L.densify(ov.timeSeries, b, (p) => p.requests - p.errors) }, { key: "err", label: "Failed", color: "var(--sl-bad)", values: L.densify(ov.timeSeries, b, (p) => p.errors) }] }, { height: 220, legend: true }); }],
  ["Segmented", "Primitives", "Segmented control; emits filter {name: value}.", () => L.Segmented.make([{ value: "requests", label: "Requests" }, { value: "tokens", label: "Tokens" }, { value: "cost", label: "Cost" }], { name: "metric" })],
  ["RangeControl", "Primitives", "The top bar's 1h · 24h · 7d · 30d · 90d · All. Ranges the data lacks are greyed.", () => L.RangeControl.make(RANGE, { available: AVAILABLE })],
  ["SearchInput", "Primitives", "Debounced filter box; emits filter {search}.", () => L.SearchInput.make("", { placeholder: "Model, provider or project" })],
  ["Table", "Primitives", "Sortable table with search, external filters, selection, expandable detail rows, pinning and paging.", async () => { const rows = await api(`/api/stats/recent?limit=60`); return L.Table.make(rows, { dense: true, limit: 8, initialSort: { key: "time", dir: "desc" }, rowKey: (r) => r.id, ids: (r) => ({ request: r.id, session: r.sessionFile, model: r.model }), label: (r) => `request #${r.id}`, pinnable: true, search: { placeholder: "Model or provider", match: (r, q) => (r.model + r.provider).toLowerCase().includes(q) }, expanded: (r) => L.keyValues([["Stop reason", L.mono(r.stopReason)], ["Duration", L.fmt.dur(r.duration)], ["TTFT", L.fmt.dur(r.ttft)]]), columns: [{ key: "model", header: "Model", render: (r) => L.labelCell(L.mono(r.model), r.provider), sort: (r) => r.model }, { key: "time", header: "When", render: (r) => L.fmt.ago(r.timestamp, now()), sort: (r) => r.timestamp }, { key: "tokens", header: "Tokens", align: "right", render: (r) => L.num(L.fmt.int(r.usage.totalTokens)), sort: (r) => r.usage.totalTokens }, { key: "cost", header: "Cost", align: "right", render: (r) => L.num(L.msgCost(r, 4)), sort: (r) => r.usage.cost.total }] }); }],
  ["Drawer", "Primitives", "Detail sheet: inline in a card (chat-safe) or the dashboard's overlay sheet. Esc and ✕ close; focus returns to the opener.", () => { const d = L.Drawer.make({}, {}); const wrap = h("div", { class: "sl-stack" }, h("div", { class: "sl-tv-bar" }, h("button", { type: "button", class: "sl-btn sm", onclick: () => d.open({ title: "Inline drawer", subtitle: "inside the card", body: L.keyValues([["Opens", "below its trigger"], ["Closes", "Esc or ✕"]]) }) }, "Open inline"), h("button", { type: "button", class: "sl-btn sm", onclick: () => ov.open({ title: "Overlay drawer", subtitle: "the dashboard's side sheet", body: L.keyValues([["Opens", "over a scrim"], ["Closes", "Esc, ✕ or the scrim"]]) }) }, "Open overlay")), d.el); const ov = L.Drawer.make({}, { overlay: true }); const c = L.comp("Drawer", wrap); c.adopt(d); c.adopt(ov); return c; }],
  ["Modal", "Primitives", "Centered dialog (the Frustration judge estimate): Esc, overlay click, ✕ and Cancel close; focus lands on the primary action.", () => { const wrap = h("div", {}); const c = L.comp("Modal", wrap); wrap.append(h("button", { type: "button", class: "sl-btn sm", onclick: () => { const m = L.Modal.make({ title: "Classify with judge", body: L.keyValues([["Messages to judge", "316"], ["Judge model", L.mono("example-judge")], ["Estimated cost", "$0.0420"]]), primary: { label: "Proceed", onClick: () => m.close() } }); c.adopt(m); m.open(); } }, "Open the judge estimate")); return c; }],
  ["JsonBlock", "Primitives", "Collapsible, copyable JSON.", async () => L.JsonBlock.make((await api(`/api/stats/model-dashboard?range=${RANGE}`)).byModel[0], { title: "ModelStats row" })],
  ["Badge", "Primitives", "Tone badges: neutral, ok, warn, bad, info; mono for numbers.", () => { const el = h("div", { class: "sl-tv-bar" }, ...[["OK", "ok"], ["Aborted", "warn"], ["Failed", "bad"], ["0.10%", "bad", true], ["Ready", "info"], ["neutral", "neutral"]].map(([t, tone, m]) => L.badge(t, tone, m))); return L.comp("Badge", el); }],
  ["LiveChip", "Primitives", "Ingest status from /api/status and the /api/events stream: Reconnecting · Syncing n/m · Sync failed · Indexing · Live. The public site shows the sample's state.", () => { const c = L.LiveChip.make(fx.api["/api/status"], { static: true, now: now() }); const states = [{ ...fx.api["/api/status"], sync: { phase: "syncing", current: 412, total: 980 } }, { ...fx.api["/api/status"], sync: { phase: "error", error: "Example failure" } }, { ...fx.api["/api/status"], indexingHours: 40 }, fx.api["/api/status"]]; let i = 0; const wrap = h("div", { class: "sl-tv-bar" }, c.el, h("button", { type: "button", class: "sl-btn ghost sm", onclick: () => c.set(states[i++ % states.length]) }, "Cycle states")); const w = L.comp("LiveChip", wrap); w.adopt(c); return w; }],
  ["RequestDrawer", "Primitives", "/api/request/:id as a sheet: error, timing, tokens, API-equivalent cost, identity and JSON. ⑂ Trace emits select {session, entry}; Pin emits pin.", async () => { const id = Object.keys(fx.api).find((k) => k.startsWith("/api/request/")); return L.RequestDrawer.make(await api(id), { now: now() }); }],
  ["TimelineCanvas", "Trace", "Canvas swimlanes per track and kind. W/S zoom, A/D pan, 0 fit, F focus, , and . step a lane, P pins, Esc clears, shift-drag brushes a time range, click a track header to collapse it. On touch: drag pans, pinch zooms, tap shows a span, double-tap focuses it, long-press then drag brushes.", () => { const tr = firstTrace(); const v = T.createView(tr); const c = T.TimelineCanvas.make(tr, { view: v, collapseDepth: 1 }); return c; }],
  ["Minimap", "Trace", "Density strips for the whole trace plus the viewport brush: drag to move, drag an edge to resize, drag outside for a new window, double-click to fit. Shares its viewport with a timeline.", () => { const tr = firstTrace(); const v = T.createView(tr); const mm = T.Minimap.make(tr, { view: v }); const tl = T.TimelineCanvas.make(tr, { view: v, collapseDepth: 1 }); const wrap = h("div", {}, mm.el, tl.el); const c = L.comp("Minimap", wrap); c.adopt(mm); c.adopt(tl, { part: "timeline" }); return c; }],
  ["SpanDrawer", "Trace", "One span's metrics, error, task, args and journal entry, with Pin and Copy JSON.", () => { const tr = firstTrace(), x = pickSpan(tr, "model") ?? pickSpan(tr, "tool"); return T.SpanDrawer.make(x, { entry: (f, id) => api(`/api/session/entry?file=${f}&id=${id}`), withheld: true }); }],
  ["SummaryStrip", "Trace", "Wall time split into model/tool/idle, then turns, requests, agents, tokens, cost, errors, and a per-track table.", () => T.SummaryStrip.make(firstTrace())],
  ["AggregatesPanel", "Trace", "Per-tool calls, failures, total/avg/max time for one trace; pinnable rows.", () => { const tr = firstTrace(); return T.AggregatesPanel.make(tr.summary.toolStats, { session: tr.file, pinnable: true }); }],
  ["TranscriptList", "Trace", "Every span and marker in order, virtualized at 28px rows.", () => T.TranscriptList.make(firstTrace(), { withheld: true })],
  ["TraceView", "Trace", "The trace page: summary, axis mode (Duration · Turns · Calls), compress idle, span search with ‹ › cycling, zoom, minimap, canvas, span drawer, transcript and tool aggregates on one viewport.", () => T.TraceView.make(firstTrace(), { entry: (f, id) => api(`/api/session/entry?file=${f}&id=${id}`), withheld: true })],
];

/* ---------------- section ---------------- */
let built = null;
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** "#stats=<name>": a route id (models), a component kind (ModelsView, Table, TimelineCanvas) or Dashboard. */
function demoIndex(name) {
  if (!name) return 0;
  const n = norm(name), ids = Object.keys(ROUTES);
  const r = ids.findIndex((id) => id === n || norm(ROUTES[id].label) + "view" === n);
  if (r >= 0) return 1 + r;
  if (n === "statsdashboard") return 0;
  return DEMOS.findIndex(([label]) => norm(label) === n);
}
async function build() {
  if (built) return built;
  const sec = document.getElementById("stats");
  if (!sec) return null;
  built = (async () => {
    fx = await ready();
    const tabs = h("div", { class: "sl-lib-tabs", role: "tablist", "aria-label": "Stats library components" });
    const stage = h("div", { class: "sl-lib-demo", id: "stats-demo", tabindex: "-1" });
    const log = h("pre", { class: "sl-ev-list", "aria-live": "polite" }), sel = h("span", {}, "no selection");
    const copy = h("button", { type: "button", class: "sl-btn ghost sm", onclick: async () => { try { await navigator.clipboard.writeText(log.textContent); copy.textContent = "Copied"; } catch { copy.textContent = "Copy failed"; } setTimeout(() => (copy.textContent = "Copy"), 1400); } }, "Copy");
    const evbox = h("div", { class: "sl-ev" }, h("div", { class: "sl-ev-h" }, h("b", {}, "Events → agent"), h("span", {}, "select · pin · brush · filter, as the host bridge receives them"), h("span", { class: "sl-grow" }), h("span", {}, "selection: ", sel), copy, h("button", { type: "button", class: "sl-btn ghost sm", onclick: () => (log.textContent = "") }, "Clear")), log);
    const root = h("div", { class: "sl-lib os sl-root" }, tabs, stage, evbox);
    // sticky bars inside a component (the dashboard's top bar) sit below the site's own sticky header
    const hdr = document.querySelector("header.top");
    if (hdr && typeof ResizeObserver === "function") new ResizeObserver(() => root.style.setProperty("--sl-sticky-top", `${hdr.offsetHeight}px`)).observe(hdr);
    sec.querySelector(".sl-lib-mount")?.replaceWith(root) ?? sec.append(root);
    let cur = null, curI = -1, groups = new Set();
    const btns = DEMOS.map(([label, group], i) => { const kids = []; if (!groups.has(group)) { groups.add(group); kids.push(h("span", { class: "sl-lib-grp" }, group)); } const b = h("button", { type: "button", class: "sl-lib-tab", role: "tab", "aria-pressed": "false", onclick: () => show(i, { hash: true }) }, label); kids.push(b); tabs.append(...kids); return b; });
    stage.addEventListener("stats:event", (e) => { const d = e.detail; log.textContent = (JSON.stringify(d) + "\n" + log.textContent).split("\n").slice(0, 40).join("\n"); const s = cur?.getSelection(); sel.textContent = s ? s.label ?? s.ids.join(", ") : "no selection"; });
    async function show(i, { hash = false } = {}) {
      if (i === curI) return cur;
      curI = i;
      btns.forEach((b, j) => b.setAttribute("aria-pressed", j === i ? "true" : "false"));
      const [label, group, desc, make] = DEMOS[i];
      const head = h("div", { class: "sl-lib-head" }, h("h3", {}, label, " ", h("code", {}, group === "Routes" ? `ROUTES.${Object.keys(ROUTES)[i - 1]}` : group === "Trace" ? `stats-trace.js · ${label}` : group === "App" ? "StatsDashboard" : `stats-lib.js · ${label}`)), h("a", { href: `#stats=${encodeURIComponent(group === "Routes" ? Object.keys(ROUTES)[i - 1] : label)}`, onclick: (e) => { e.preventDefault(); setHash(label, i); } }, "link"));
      const slot = h("div", {});
      stage.replaceChildren(head, h("p", { class: "sl-lib-desc" }, desc), slot);
      L.loadInto(slot, Promise.resolve().then(make), (c) => { cur = c; return c.el; }, { skeletonNode: L.tableSkeleton(6) });
      if (hash) setHash(label, i);
      return cur;
    }
    function setHash(label, i) { const p = new URLSearchParams(location.hash.slice(1)); p.delete("ask"); p.set("stats", DEMOS[i][1] === "Routes" ? Object.keys(ROUTES)[i - 1] : label); history.replaceState(null, "", "#" + p.toString().replace(/=$/, "")); }
    new IntersectionObserver(([en], io) => { if (en.isIntersecting) { io.disconnect(); if (curI < 0) show(0); } }, { rootMargin: "300px" }).observe(sec);
    return { show, stage, current: () => cur };
  })();
  return built;
}

/* ---------------- deep links ---------------- */
/** Scroll to an element and keep it there while layout above it shifts (images, the reel, sections that
 *  other modules fill in after boot) for up to 5 s; the first wheel, touch, key or pointer press lets go. */
function settleScroll(el, { block = "start" } = {}) {
  if (!el) return;
  const pin = () => el.scrollIntoView({ block, behavior: "instant" });
  if (typeof ResizeObserver !== "function") return pin();
  const kinds = ["wheel", "touchstart", "keydown", "pointerdown"];
  const ro = new ResizeObserver(pin);
  const stop = () => { ro.disconnect(); clearTimeout(timer); for (const k of kinds) removeEventListener(k, stop, true); };
  const timer = setTimeout(stop, 5000);
  for (const k of kinds) addEventListener(k, stop, { capture: true, passive: true });
  ro.observe(document.body);
  pin();
}
export async function followHash() {
  const raw = location.hash.slice(1);
  if (!raw) return;
  const p = new URLSearchParams(raw);
  if (p.has("ask")) {
    const sec = document.getElementById("ask"); if (!sec) return;
    const q = p.get("ask");
    if (q) { const input = sec.querySelector("#askq"), form = sec.querySelector("#askform"); if (input && form) { input.value = q; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true })); } }
    settleScroll(sec);
    if (!q) sec.querySelector("#askq")?.focus({ preventScroll: true });
    return;
  }
  if (p.has("stats")) {
    const lib = await build(); if (!lib) return;
    const i = demoIndex(p.get("stats"));
    await lib.show(i < 0 ? 0 : i);
    const target = p.get("stats") ? lib.stage : document.getElementById("stats");
    settleScroll(target);
    if (p.get("stats")) { lib.stage.dataset.flash = "1"; setTimeout(() => delete lib.stage.dataset.flash, 1300); lib.stage.focus({ preventScroll: true }); }
  }
}
function whenBooted() {
  const r = document.documentElement;
  if (r.classList.contains("ready")) return Promise.resolve();
  return new Promise((res) => { const mo = new MutationObserver(() => { if (r.classList.contains("ready")) { mo.disconnect(); res(); } }); mo.observe(r, { attributes: true, attributeFilter: ["class"] }); });
}
whenBooted().then(() => { build(); followHash(); });
addEventListener("hashchange", () => followHash());
window.__stats = { DEMOS, ROUTES, build, followHash, lib: L, trace: T };
