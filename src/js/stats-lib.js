// Stats library, layer 1: the /stats dashboard's primitives (omp-stats client/ui + client/charts) as
// plain-DOM kit components. Every component has the same contract (documented in README "Stats
// library" and src/schema/card.v0.json → $defs.statsComponent):
//
//   const c = Lib.X.make(data, opts)      data: the omp-stats JSON (or the slice the primitive draws)
//   c.el                                  root element (also c.el.statsComponent === c)
//   c.spec                                { v: 0, kind, ...state } — enough to re-create the view
//   c.getSelection()                      last select/pin event, or null
//   c.on(type, cb) → off                  type: "select" | "pin" | "brush" | "filter" | "*"
//   c.set?(patch)                         some components accept live updates
//
// Events carry entity ids, never DOM: { v: 0, type, component, ids: {session, entry, span, track,
// tool, model, provider, request, signature, folder, window, account, key}, range?: [t0, t1] (ms epoch),
// filter?: {...}, label }. Every event also bubbles a DOM CustomEvent "stats:event" from c.el, so a
// host bridge (Hermes/T3) can listen once on the document and send the selection to the LLM.
import { h, anim } from "./motion.js";
import { svg, seg } from "./shell.js";

/* ---------------- contract ---------------- */
export function emitter() {
  const m = new Map();
  return {
    on(t, cb) { if (!m.has(t)) m.set(t, new Set()); m.get(t).add(cb); return () => m.get(t)?.delete(cb); },
    emit(t, e) { for (const cb of m.get(t) ?? []) cb(e); },
  };
}
const clean = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v != null && v !== ""));
const ENTITY_ORDER = ["span", "entry", "request", "track", "tool", "model", "provider", "signature", "folder", "window", "account", "key"];
/**
 * Build the wire event. `entities` is the typed id map; `ids` is the same thing flattened to
 * "<type>:<id>" strings (session excluded, it is top-level) so a bridge can join and pass them on.
 */
export function makeEvent(type, component, { entities, ids, range, filter, label, value, part } = {}) {
  const ent = clean(entities ?? (ids && !Array.isArray(ids) ? ids : {}));
  const flat = ENTITY_ORDER.filter((k) => ent[k] != null).map((k) => `${k}:${ent[k]}`);
  const e = clean({ v: 0, type, component, part, session: ent.session, entities: ent, range, filter, label, value });
  e.ids = flat;
  if (ent.tool) e.tool = ent.tool;
  if (ent.span) e.spanId = ent.span;
  e.entities = ent;
  return e;
}
/** Wrap a root element into a stats component. `spec` is merged into c.spec. */
export function comp(kind, el, spec = {}) {
  const ev = emitter();
  let sel = null;
  const fire = (e) => {
    if (e.type === "select" || e.type === "pin") sel = e.type === "select" && !e.ids.length && !e.session && !e.range ? null : e;
    ev.emit(e.type, e); ev.emit("*", e);
  };
  const c = {
    kind, el, spec: { v: 0, kind, ...spec },
    getSelection: () => sel,
    on: (t, cb) => ev.on(t, cb),
    /** Emit an event. `ids` here is the entity map: {session, span, entry, tool, model, ...}. */
    emit(type, { ids, entities, range, filter, label, value } = {}) {
      const e = makeEvent(type, c.kind, { entities: entities ?? ids, range, filter, label, value });
      fire(e);
      el.dispatchEvent(new CustomEvent("stats:event", { bubbles: true, detail: e }));
      return e;
    },
    /** Re-emit the current selection as a pin (the user wants it carried into the next turn). */
    pin() { if (!sel) return null; const e = { ...sel, type: "pin" }; fire(e); el.dispatchEvent(new CustomEvent("stats:event", { bubbles: true, detail: e })); return e; },
    /** Forward a child's events as this component's (DOM events already bubble). extra: {entities, part}. */
    adopt(child, extra = {}) {
      child.on("*", (e) => { fire(makeEvent(e.type, c.kind, { entities: { ...extra.entities, ...e.entities }, range: e.range, filter: e.filter, label: e.label, value: e.value, part: extra.part ?? e.part ?? child.kind })); });
      return child;
    },
  };
  el.statsComponent = c;
  el.dataset.statsKind = kind;
  c.rename = (k) => { c.kind = k; c.spec.kind = k; el.dataset.statsKind = k; return c; };
  return c;
}

/* ---------------- formatters (client/data/formatters.ts) ---------------- */
const LOC = "en-US";
export const fmt = {
  int: (v) => Math.round(v ?? 0).toLocaleString(LOC),
  compact: (v) => (v ?? 0).toLocaleString(LOC, { notation: "compact", maximumFractionDigits: 1 }),
  cost(v, digits) { if (!v) return "$0"; const d = digits ?? (v > 0 && v < 0.01 ? 4 : 2); return "$" + v.toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d }); },
  estCost: (v, unpriced, digits) => (v === 0 && unpriced > 0 ? "N/A" : fmt.cost(v, digits)),
  unitCost: (v) => (v > 0 && v < 0.0001 ? "<$0.0001" : fmt.cost(v)),
  pct: (v, d = 1) => `${((v ?? 0) * 100).toFixed(d)}%`,
  rate(v) { const p = v * 100; if (p > 0 && p < 0.005) return "<0.01%"; return fmt.pct(v, p > 0 && p < 0.1 ? 2 : 1); },
  dur(ms, digits) { if (ms == null) return "-"; const s = ms / 1000; return `${s.toFixed(digits ?? (s < 1 ? 2 : 1))}s`; },
  elapsed(ms) { if (ms < 60_000) return fmt.dur(ms); const m = Math.floor(ms / 60_000); if (m < 60) return `${m}m ${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}s`; return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`; },
  tps: (v) => (v == null ? "-" : v.toFixed(1)),
  bytes(v) { if (v >= 1e9) return `${(v / 1e9).toFixed(1)} GB`; if (v >= 1e6) return `${(v / 1e6).toFixed(1)} MB`; if (v >= 1e3) return `${(v / 1e3).toFixed(1)} KB`; return `${v} B`; },
  time: (t) => new Date(t).toLocaleString(LOC, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
  clock: (t) => new Date(t).toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
  day: (t) => new Date(t).toLocaleDateString(LOC, { month: "short", day: "numeric" }),
  dayUTC: (t) => new Date(t).toLocaleDateString(LOC, { month: "short", day: "numeric", timeZone: "UTC" }),
  folder: (f) => String(f ?? "").replace(/^\/+|\/+$/g, "") || "(root)",
  /** "3h ago" relative to `now` (the fixture's capture time on the public site, Date.now() live). */
  ago(t, now = Date.now()) { const s = Math.max(0, Math.round((now - t) / 1000)); if (s < 45) return "just now"; const m = Math.round(s / 60); if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`; const hh = Math.round(m / 60); if (hh < 24) return `about ${hh} hour${hh === 1 ? "" : "s"} ago`; const d = Math.round(hh / 24); return `${d} day${d === 1 ? "" : "s"} ago`; },
};
/** Whether one request's zero cost is unknown spend (client/data/formatters.ts isUnpricedMessage). */
export const isUnpriced = (m) => m.usage?.totalTokens > 0 && m.usage.cost?.total === 0 && (m.provider === "xai-oauth" || m.costUnpriced === true);
export const msgCost = (m, d) => fmt.estCost(m.usage?.cost?.total ?? 0, isUnpriced(m) ? 1 : 0, d);

/* ---------------- palette + ranges (client/data/colors.ts, range.ts, series.ts) ---------------- */
export const SERIES = ["#5ad8e6", "#ed4abf", "#9d7bff", "#f5b54a", "#4ade80", "#5b8cff", "#ff7a59", "#2dd4bf", "#c3e94f", "#fb7185"];
export const OTHER = "#6c6c74";
export const modelKey = (model, provider) => `${model}::${provider}`;
/** Busiest key gets the first hue (ties by key) so a key keeps its hue across a page. */
export const colorLookup = (items) => new Map([...items].sort((a, b) => b.weight - a.weight || String(a.key).localeCompare(String(b.key))).map((x, i) => [x.key, SERIES[i % SERIES.length]]));
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const RANGES = ["1h", "24h", "7d", "30d", "90d", "all"];
export const RANGE_META = { "1h": { label: "1h", window: "the last hour", span: HOUR, bucket: 5 * MIN }, "24h": { label: "24h", window: "the last 24 hours", span: DAY, bucket: HOUR }, "7d": { label: "7d", window: "the last 7 days", span: 7 * DAY, bucket: DAY }, "30d": { label: "30d", window: "the last 30 days", span: 30 * DAY, bucket: DAY }, "90d": { label: "90d", window: "the last 90 days", span: 90 * DAY, bucket: DAY }, all: { label: "All", window: "all time", span: null, bucket: DAY } };
export const bucketWord = (ms) => (ms < HOUR ? "5 minutes" : ms < DAY ? "hour" : "day");
/** Contiguous ascending bucket starts covering `range` (data/range.ts bucketAxis), ending at `now`. */
export function bucketAxis(range, stamps, bucket = RANGE_META[range].bucket, now = Date.now()) {
  const last = Math.floor(now / bucket) * bucket, span = RANGE_META[range].span;
  let first = last;
  if (span != null) first = Math.floor((now - span) / bucket) * bucket;
  else { for (const t of stamps) if (t < first) first = t; first = Math.floor(first / bucket) * bucket; }
  first = Math.max(first, last - 1499 * bucket);
  const out = []; for (let t = first; t <= last; t += bucket) out.push(t); return out;
}
export const tickLabel = (t, bucket) => (bucket < DAY ? new Date(t).toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit", hour12: false }) : fmt.day(t));
export const bucketTitle = (t, bucket) => (bucket < DAY ? (bucket < HOUR ? tickLabel(t, bucket) : `${fmt.day(t)} ${tickLabel(t, bucket)}`) : fmt.day(t));
export function densify(points, buckets, value) { const ix = new Map(buckets.map((b, i) => [b, i])); const out = buckets.map(() => 0); for (const p of points) { const i = ix.get(p.timestamp); if (i !== undefined) out[i] += value(p); } return out; }
/** Long rows → one dense series per key ranked by total; past `limit` folds into "Other (n)". */
export function pivot(points, { buckets, key, label, value, limit = Infinity, colors }) {
  const ix = new Map(buckets.map((b, i) => [b, i])), by = new Map();
  for (const p of points) { const i = ix.get(p.timestamp); if (i === undefined) continue; const k = key(p); if (!by.has(k)) by.set(k, buckets.map(() => 0)); by.get(k)[i] += value(p); }
  const ranked = [...by].map(([k, values]) => ({ k, values, total: values.reduce((a, b) => a + b, 0) })).filter((x) => x.total !== 0).sort((a, b) => b.total - a.total || a.k.localeCompare(b.k));
  const out = ranked.slice(0, limit).map((x, r) => ({ key: x.k, label: label ? label(x.k) : x.k, color: colors?.get(x.k) ?? SERIES[r % SERIES.length], values: x.values }));
  const tail = ranked.slice(limit);
  if (tail.length) { const o = buckets.map(() => 0); for (const x of tail) x.values.forEach((v, i) => (o[i] += v)); out.push({ key: "__other__", label: `Other (${tail.length})`, color: OTHER, values: o }); }
  return out;
}

/* ---------------- tiny pieces (ui/Badge.tsx, Table.tsx cells, Drawer KeyValues) ---------------- */
export const Badge = { label: "Badge", make: (text, { tone = "neutral", mono = false } = {}) => comp("Badge", h("span", { class: `sl-badge${mono ? " mono" : ""}`, "data-tone": tone }, text), { tone }) };
export const badge = (text, tone, mono) => Badge.make(text, { tone, mono }).el;
export const dot = (tone = "neutral", pulse = false) => h("span", { class: "sl-dot" + (pulse ? " pulse" : ""), "data-tone": tone });
export const swatch = (c) => h("span", { class: "sl-sw", style: { background: c } });
export const errorRateTone = (r) => (r >= 0.05 ? "bad" : r >= 0.01 ? "warn" : "ok");
export const mono = (t, cls = "") => h("span", { class: "sl-mono " + cls }, t);
export const num = (t, cls = "") => h("span", { class: "sl-num " + cls }, t);
export const labelCell = (primary, secondary, lead) => h("div", { class: "sl-lc" }, lead ?? null, h("div", { class: "sl-lc-t" }, h("span", { class: "sl-lc-p" }, primary), secondary != null ? h("span", { class: "sl-lc-s" }, secondary) : null));
export const meterCell = (value, max, display, color) => h("div", { class: "sl-meter" }, h("span", { class: "sl-num" }, display), h("div", { class: "sl-meter-t" }, h("i", { style: { width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, background: color ?? null } })));
export const keyValues = (items) => h("dl", { class: "sl-kv" }, items.filter(Boolean).map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v))));
export const sectionLabel = (t, cls = "") => h("div", { class: "sl-seclabel " + cls }, t);
export const empty = (title = "Nothing here yet", hint) => h("div", { class: "sl-empty" }, h("b", {}, title), hint ? h("span", {}, hint) : null);
export const errorState = (msg, onRetry) => h("div", { class: "sl-error", role: "alert" }, h("span", {}, "⚠ ", msg), onRetry ? h("button", { class: "sl-btn ghost sm", type: "button", onclick: onRetry }, "Retry") : null);
export const skeleton = (height = 14, width = "100%") => h("div", { class: "sl-skel", style: { height: `${height}px`, width } });
export const tableSkeleton = (rows = 6) => h("div", { class: "sl-skel-rows" }, Array.from({ length: rows }, (_, i) => skeleton(14, `${92 - ((i * 13) % 30)}%`)));
/** Card frame (ui/Card.tsx): title, description, actions, body, footer. */
export function card({ title, desc, actions, body, footer, flush = false, cls = "" }) {
  return h("section", { class: `sl-card${flush ? " flush" : ""} ${cls}` },
    title != null || desc != null || actions ? h("header", { class: "sl-card-h" }, h("div", { class: "sl-card-t" }, title != null ? h("h3", {}, title) : null, desc != null ? h("p", {}, desc) : null), actions ? h("div", { class: "sl-card-a" }, actions) : null) : null,
    h("div", { class: "sl-card-b" }, body), footer ? h("footer", { class: "sl-card-f" }, footer) : null);
}
/** Load/error/empty switch for one async payload (ui/States.tsx QueryView). */
export function loadInto(slot, promise, render, { skeletonNode = tableSkeleton(), isEmpty, emptyNode } = {}) {
  slot.replaceChildren(skeletonNode);
  const run = () => Promise.resolve(promise).then((d) => { if (d == null || isEmpty?.(d)) slot.replaceChildren(emptyNode ?? empty("Not in this sample", "The public fixture has no payload for this view.")); else slot.replaceChildren(render(d)); }).catch((e) => { slot.replaceChildren(errorState(String(e?.message ?? e), () => loadInto(slot, promise, render, { skeletonNode, isEmpty, emptyNode }))); });
  return run();
}

/* ---------------- Stat / StatGrid / Delta (ui/Stat.tsx) ---------------- */
export function delta({ change, good = "up" } = {}) {
  if (change == null || !Number.isFinite(change)) return h("span", { class: "sl-delta" }, "new");
  const r = Math.abs(change) < 0.0005 ? 0 : change, tone = r === 0 ? null : (r > 0) === (good === "up") ? "good" : "bad", p = Math.abs(r) * 100;
  return h("span", { class: "sl-delta", "data-tone": tone }, `${r > 0 ? "+" : r < 0 ? "−" : "±"}${p >= 100 ? p.toFixed(0) : p.toFixed(1)}%`);
}
export const Stat = {
  label: "Stat",
  make(d, o = {}) {
    const valueEl = h("div", { class: "sl-stat-v" }, d.value);
    const el = h("div", { class: "sl-stat", "data-size": o.size ?? d.size ?? "md", "data-tone": d.tone ?? null, title: d.title ?? null, tabindex: o.selectable ? "0" : null },
      h("div", { class: "sl-stat-l" }, d.label), valueEl,
      d.hint != null || d.delta ? h("div", { class: "sl-stat-f" }, d.delta ? delta(d.delta) : null, d.hint != null ? h("span", { class: "sl-trunc" }, d.hint) : null) : null,
      d.spark && d.spark.length > 1 ? h("div", { class: "sl-stat-s" }, Sparkline.make(d.spark, { color: d.sparkColor, height: 22 }).el) : null);
    const c = comp("Stat", el, { label: String(d.label) });
    if (o.selectable) el.addEventListener("click", () => c.emit("select", { ids: { key: d.key ?? String(d.label) }, label: `${d.label}: ${valueEl.textContent}`, value: d.raw }));
    /** Live update: the value flashes once when it changes (Stat.tsx useChangeFlash). */
    c.set = (patch) => { if (patch.value != null && patch.value !== valueEl.textContent) { valueEl.textContent = patch.value; valueEl.dataset.flash = "1"; setTimeout(() => delete valueEl.dataset.flash, 900); } };
    return c;
  },
};
export const StatGrid = {
  label: "Stat grid",
  make(stats, o = {}) {
    const kids = stats.filter(Boolean).map((s) => (s.el ? s : Stat.make(s, { size: o.size, selectable: o.selectable })));
    const el = h("div", { class: "sl-statgrid", style: { "--min": `${o.min ?? 170}px` } }, kids.map((k) => k.el));
    const c = comp("StatGrid", el, { stats: kids.length });
    kids.forEach((k) => c.adopt(k));
    c.stats = kids;
    return c;
  },
};
export const stats = (cells, min, size) => StatGrid.make(cells, { min, size }).el;

/* ---------------- Sparkline, ShareBar, BarList, Legend (client/charts) ---------------- */
export const Sparkline = {
  label: "Sparkline",
  make(values, o = {}) {
    const W = o.width ?? 160, H = o.height ?? 28, color = o.color ?? "var(--sl-c1)";
    const mx = Math.max(0, ...values), n = values.length;
    let d = "";
    for (let i = 0; i < n; i++) { const x = n > 1 ? (i * W) / (n - 1) : W / 2, y = mx > 0 ? H - 2 - (values[i] / mx) * (H - 4) : H - 2; d += `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }
    const el = svg("svg", { class: "sl-spark", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", width: o.width ? W : null, height: H, "aria-hidden": "true" }, n && o.area !== false ? svg("path", { d: `${d}L${W},${H}L0,${H}Z`, fill: color, opacity: ".16" }) : null, n ? svg("path", { d, fill: "none", stroke: color, "stroke-width": "1.5", "vector-effect": "non-scaling-stroke" }) : null);
    return comp("Sparkline", el, { points: n });
  },
};
export const ShareBar = {
  label: "Share bar",
  make(segments, o = {}) {
    const tot = segments.reduce((n, s) => n + Math.max(0, s.value), 0);
    const el = h("div", { class: "sl-share", style: { height: `${o.height ?? 8}px` }, role: "img" }, tot > 0 ? segments.filter((s) => s.value > 0).map((s) => h("i", { style: { flexGrow: s.value / tot, background: s.color }, title: `${s.label}: ${((s.value / tot) * 100).toFixed(1)}%`, "data-key": s.key, onclick: o.selectable ? () => c.emit("select", { ids: { key: s.key }, label: s.label, value: s.value }) : null })) : null);
    const c = comp("ShareBar", el, { segments: segments.length });
    return c;
  },
};
export const BarList = {
  label: "Bar list",
  /** items: [{key, label, value, display?, color?}]; opts.ids(key) → event ids; clicking a row toggles it. */
  make(items, o = {}) {
    const top = o.max ?? Math.max(0, ...items.map((i) => i.value));
    let picked = o.selected ?? null;
    const rows = items.map((it) => h(o.selectable === false ? "div" : "button", { class: "sl-barlist-row", type: "button", "data-key": it.key, "aria-pressed": it.key === picked ? "true" : "false", onclick: o.selectable === false ? null : () => pick(it) },
      h("span", { class: "sl-barlist-fill", style: { width: `${top > 0 ? Math.max(0.5, (it.value / top) * 100) : 0}%`, background: it.color ?? "var(--sl-c1)" } }),
      h("span", { class: "sl-barlist-l" }, it.label), h("span", { class: "sl-barlist-v" }, it.display ?? fmt.int(it.value))));
    const el = h("div", { class: "sl-barlist" }, rows);
    const c = comp("BarList", el, { items: items.length });
    function pick(it) { picked = picked === it.key ? null : it.key; rows.forEach((r) => r.setAttribute("aria-pressed", r.dataset.key === picked ? "true" : "false")); c.spec.selected = picked; c.emit(o.event ?? "select", { ids: picked ? (o.ids?.(it.key) ?? { key: it.key }) : {}, label: picked ? `${typeof it.label === "string" ? it.label : it.key}: ${it.display ?? fmt.int(it.value)}` : "cleared", value: picked ? it.value : null }); }
    return c;
  },
};
export const Legend = {
  label: "Legend",
  /** items: [{key, label, color, value?}]; with opts.toggle the items become buttons that hide series. */
  make(items, o = {}) {
    const hidden = new Set(o.hidden ?? []);
    const el = h("div", { class: "sl-legend" }, items.map((it) => h(o.toggle ? "button" : "span", { class: "sl-legend-i", type: o.toggle ? "button" : null, "data-key": it.key, "data-off": hidden.has(it.key) ? "true" : "false", title: it.label, onclick: o.toggle ? () => flip(it.key) : null }, swatch(it.color), h("span", { class: "sl-trunc" }, it.label), it.value != null ? h("span", { class: "sl-legend-v" }, it.value) : null)));
    const c = comp("Legend", el, { hidden: [...hidden] });
    function flip(k) { hidden.has(k) ? hidden.delete(k) : hidden.add(k); el.querySelectorAll(".sl-legend-i").forEach((b) => (b.dataset.off = hidden.has(b.dataset.key) ? "true" : "false")); c.spec.hidden = [...hidden]; o.onToggle?.(hidden); c.emit("filter", { filter: { hidden: [...hidden] }, label: `${hidden.size} series hidden` }); }
    c.hidden = hidden;
    return c;
  },
};

/* ---------------- Chart / TimeChart (charts/Chart.tsx, TimeChart.tsx) ---------------- */
export function niceScale(max, n = 4) {
  if (!(max > 0)) return { max: 1, ticks: [0] };
  const rough = max / n, mag = 10 ** Math.floor(Math.log10(rough)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag, top = Math.ceil(max / step) * step;
  const ticks = []; for (let t = 0; t <= top + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
  return { max: top, ticks };
}
/**
 * SVG chart over categorical slots: stacked/grouped bars, stacked areas, lines, right axis, hatching,
 * reference lines, hover cursor + tooltip, click-a-slot (select), drag-across-slots (brush), and an
 * optional toggleable legend. data: { slots, series: [{key,label,color,values,kind?,axis?,pattern?,dashed?,tooltip?}] }.
 * opts: kind, stacked, height, format, formatRight, formatTooltip, yMax, yMaxRight, references, tickLabel(i),
 * tooltipTitle(i), tooltipExtra(i) → node, showTotal, emptyLabel, legend (bool | {values}), slotIds(i) → {ids, range, label}.
 */
export const Chart = {
  label: "Chart",
  make(data, o = {}) {
    const { slots, series } = data;
    const kind = o.kind ?? "bars", stacked = o.stacked ?? true, H = o.height ?? 220;
    const hidden = new Set(o.hidden ?? []);
    const plot = h("div", { class: "sl-chart", style: { height: `${H}px` } });
    const tip = h("div", { class: "sl-chart-tip", hidden: true });
    plot.append(tip);
    const legend = o.legend ? Legend.make(series.map((s) => ({ key: s.key, label: s.label, color: s.color, value: o.legend.values ? o.legend.values(s) : null })), { toggle: true, hidden, onToggle: () => draw() }) : null;
    const el = h("div", { class: "sl-chartwrap" }, plot, legend?.el ?? null);
    const c = comp(o.component ?? "Chart", el, { slots, series: series.map((s) => s.key) });
    if (legend) c.adopt(legend);
    let hover = null, brush = null, drag = null, geo = null;
    const fmtL = o.format ?? fmt.compact, fmtR = o.formatRight ?? fmtL, fmtT = o.formatTooltip ?? fmtL;
    function layout() {
      const vis = series.filter((s) => !hidden.has(s.key));
      const left = vis.filter((s) => s.axis !== "right"), right = vis.filter((s) => s.axis === "right");
      const stackable = (s) => stacked && (s.kind ?? kind) !== "line";
      const bases = new Map(), tops = Array(slots).fill(0); let lmax = 0;
      for (const s of left) { if (stackable(s)) { bases.set(s.key, tops.slice()); for (let i = 0; i < slots; i++) tops[i] += s.values[i] ?? 0; } else for (let i = 0; i < slots; i++) lmax = Math.max(lmax, s.values[i] ?? 0); }
      for (const t of tops) lmax = Math.max(lmax, t);
      let rmax = 0; for (const s of right) for (let i = 0; i < slots; i++) rmax = Math.max(rmax, s.values[i] ?? 0);
      for (const r of o.references ?? []) if (r.axis === "right") rmax = Math.max(rmax, r.value); else lmax = Math.max(lmax, r.value);
      return { vis, left, right, bases, stackable, ls: niceScale(o.yMax ?? lmax), rs: right.length ? niceScale(o.yMaxRight ?? rmax) : null, empty: vis.every((s) => s.values.every((v) => !v)) };
    }
    function draw() {
      const W = Math.max(120, plot.clientWidth || 600), L = layout();
      const ll = L.ls.ticks.map((t) => fmtL(t)), rl = L.rs?.ticks.map((t) => fmtR(t)) ?? [];
      const padL = Math.max(28, Math.max(0, ...ll.map((s) => s.length * 6.3)) + 12), padR = L.rs ? Math.max(28, Math.max(...rl.map((s) => s.length * 6.3)) + 12) : 8, PT = 10, PB = 24;
      const pw = Math.max(0, W - padL - padR), ph = H - PT - PB, sw = slots ? pw / slots : 0;
      const yl = (v) => PT + ph - (v / L.ls.max) * ph, yr = (v) => PT + ph - (v / (L.rs?.max ?? 1)) * ph, cx = (i) => padL + (i + 0.5) * sw;
      geo = { padL, sw, slots, W };
      const g = svg("svg", { width: W, height: H, role: "img" });
      const defs = svg("defs");
      for (const s of L.vis.filter((s) => s.pattern === "hatch")) defs.append(svg("pattern", { id: `sl-h-${c.uid}-${cssId(s.key)}`, width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, svg("rect", { width: 5, height: 5, fill: s.color, "fill-opacity": ".14" }), svg("rect", { width: 1.6, height: 5, fill: s.color })));
      g.append(defs);
      const grid = svg("g", { class: "sl-grid" }); for (const t of L.ls.ticks) grid.append(svg("line", { x1: padL, x2: padL + pw, y1: yl(t), y2: yl(t) })); g.append(grid);
      const ax = svg("g", { class: "sl-axis" });
      L.ls.ticks.forEach((t, i) => ax.append(svg("text", { x: padL - 8, y: yl(t), dy: "0.32em", "text-anchor": "end" }, ll[i])));
      L.rs?.ticks.forEach((t, i) => ax.append(svg("text", { x: padL + pw + 8, y: yr(t), dy: "0.32em", "text-anchor": "start" }, rl[i])));
      const every = Math.max(1, Math.ceil(slots / Math.max(1, Math.floor(pw / 68))));
      for (let i = 0; i < slots; i += every) ax.append(svg("text", { x: cx(i), y: H - 6, "text-anchor": "middle" }, (o.tickLabel ?? String)(i)));
      g.append(ax);
      if (brush) g.append(svg("rect", { class: "sl-brush", x: padL + Math.min(brush[0], brush[1]) * sw, y: PT, width: (Math.abs(brush[1] - brush[0]) + 1) * sw, height: ph }));
      if (hover != null) g.append(svg("rect", { class: "sl-cursor", x: padL + hover * sw, y: PT, width: sw, height: ph }));
      const fillOf = (s) => (s.pattern === "hatch" ? `url(#sl-h-${c.uid}-${cssId(s.key)})` : s.color);
      for (const s of L.vis.filter((s) => (s.kind ?? kind) === "area")) {
        const y = s.axis === "right" ? yr : yl, base = L.bases.get(s.key), top = (i) => (base?.[i] ?? 0) + (s.values[i] ?? 0);
        const line = path(slots, cx, (i) => y(top(i))), floor = Array.from({ length: slots }, (_, j) => slots - 1 - j).map((i) => `L${cx(i).toFixed(1)},${y(base?.[i] ?? 0).toFixed(1)}`).join("");
        g.append(svg("path", { d: `${line}${floor}Z`, fill: fillOf(s), "fill-opacity": s.pattern ? 1 : 0.2 }), svg("path", { class: "sl-line", d: line, stroke: s.color }));
      }
      const bars = L.vis.filter((s) => (s.kind ?? kind) === "bars"), grouped = bars.filter((s) => !L.stackable(s) || s.axis === "right");
      const bw = Math.max(1, Math.min(56, sw * (sw > 6 ? 0.72 : 0.9)));
      for (const s of bars) {
        const y = s.axis === "right" ? yr : yl, base = L.bases.get(s.key), gi = grouped.indexOf(s), sub = gi >= 0 ? bw / grouped.length : bw;
        const gg = svg("g", {});
        s.values.forEach((v, i) => { if (!v) return; const b = gi >= 0 ? 0 : base?.[i] ?? 0, y0 = y(b), y1 = y(b + v); gg.append(svg("rect", { class: "sl-bar" + (hover === i ? " on" : ""), x: cx(i) - bw / 2 + (gi >= 0 ? gi * sub : 0), y: Math.min(y0, y1), width: Math.max(1, sub - (gi >= 0 && grouped.length > 1 ? 1 : 0)), height: Math.max(v > 0 ? 1 : 0, Math.abs(y0 - y1)), fill: fillOf(s) })); });
        g.append(gg);
      }
      for (const s of L.vis.filter((s) => (s.kind ?? kind) === "line")) {
        const y = s.axis === "right" ? yr : yl, at = (i) => (s.values[i] == null ? null : y(s.values[i]));
        g.append(svg("path", { class: "sl-line", d: path(slots, cx, at), stroke: s.color, "stroke-dasharray": s.dashed ? "4 3" : null }));
        s.values.forEach((_, i) => { const yi = at(i); if (yi == null || (i > 0 && at(i - 1) != null) || (i < slots - 1 && at(i + 1) != null)) return; g.append(svg("circle", { cx: cx(i), cy: yi, r: 2.5, fill: s.color })); });
      }
      for (const r of o.references ?? []) { const y = r.axis === "right" ? yr(r.value) : yl(r.value); const rg = svg("g", { class: "sl-axis" }, svg("line", { x1: padL, x2: padL + pw, y1: y, y2: y, class: "sl-ref" })); if (r.label) rg.append(svg("text", { x: padL + pw - 4, y: y - 5, "text-anchor": "end" }, r.label)); g.append(rg); }
      g.append(svg("line", { class: "sl-base", x1: padL, x2: padL + pw, y1: yl(0), y2: yl(0) }));
      const hit = svg("rect", { x: padL, y: PT, width: pw, height: ph, fill: "transparent", style: `cursor:${o.slotIds ? "pointer" : "crosshair"};touch-action:pan-y` });
      g.append(hit);
      plot.querySelector("svg")?.remove();
      plot.prepend(g);
      plot.querySelector(".sl-chart-empty")?.remove();
      if (L.empty) plot.append(h("div", { class: "sl-chart-empty" }, o.emptyLabel ?? "No data in this range"));
      // tooltip
      if (hover != null && !L.empty) {
        const rows = L.vis.filter((s) => s.tooltip !== false).map((s) => ({ s, v: s.values[hover] })).filter((r) => r.v != null && (r.v !== 0 || L.vis.length === 1)).sort((a, b) => (L.vis.length > 1 ? b.v - a.v : 0));
        const total = rows.filter((r) => r.s.axis !== "right").reduce((n, r) => n + r.v, 0), withTotal = o.showTotal ?? (stacked && L.left.length > 1);
        tip.replaceChildren(h("div", { class: "sl-tip-t" }, (o.tooltipTitle ?? o.tickLabel ?? String)(hover)), ...rows.map(({ s, v }) => h("div", { class: "sl-tip-r" }, swatch(s.color), h("span", { class: "sl-tip-l" }, s.label), h("span", { class: "sl-tip-v" }, s.axis === "right" ? fmtR(v) : fmtT(v)))), ...(withTotal && rows.length > 1 ? [h("div", { class: "sl-tip-r tot" }, h("span", { class: "sl-tip-l" }, "Total"), h("span", { class: "sl-tip-v" }, fmtT(total)))] : []), ...(o.tooltipExtra ? [o.tooltipExtra(hover)].filter(Boolean) : []));
        tip.hidden = false;
        const x = cx(hover), off = Math.min(sw / 2, 24) + 8;
        Object.assign(tip.style, x > W / 2 ? { right: `${W - x + off}px`, left: "auto", top: `${PT}px` } : { left: `${x + off}px`, right: "auto", top: `${PT}px` });
      } else tip.hidden = true;
    }
    const slotAt = (e) => { const b = plot.getBoundingClientRect(); if (!geo) return null; const i = Math.floor((e.clientX - b.left - geo.padL) / geo.sw); return i >= 0 && i < slots ? i : null; };
    plot.addEventListener("pointermove", (e) => { const i = slotAt(e); if (drag && i != null) { brush = [drag.i0, i]; drag.moved = drag.moved || i !== drag.i0; } if (i !== hover || drag) { hover = i; draw(); } });
    plot.addEventListener("pointerleave", () => { hover = null; if (!drag) draw(); });
    plot.addEventListener("pointerdown", (e) => { const i = slotAt(e); if (i == null || e.pointerType === "touch") return; drag = { i0: i, moved: false }; plot.setPointerCapture(e.pointerId); });
    plot.addEventListener("pointerup", (e) => {
      const d = drag; drag = null; const i = slotAt(e) ?? hover;
      if (d?.moved && brush) { const a = Math.min(...brush), b = Math.max(...brush), s0 = o.slotIds?.(a), s1 = o.slotIds?.(b); c.spec.brush = [a, b]; c.emit("brush", { ids: s0?.ids, range: s0?.range && s1?.range ? [s0.range[0], s1.range[1]] : undefined, filter: { slots: [a, b] }, label: `${(o.tooltipTitle ?? o.tickLabel ?? String)(a)} → ${(o.tooltipTitle ?? o.tickLabel ?? String)(b)}` }); draw(); return; }
      if (i == null) return;
      if (e.pointerType === "touch" && hover !== i) { hover = i; draw(); return; }
      brush = null;
      const s = o.slotIds?.(i) ?? { ids: { key: String(i) }, label: (o.tooltipTitle ?? o.tickLabel ?? String)(i) };
      c.spec.selected = i; c.emit("select", s); draw();
    });
    plot.addEventListener("dblclick", () => { brush = null; delete c.spec.brush; c.emit("brush", { filter: { slots: null }, label: "brush cleared" }); draw(); });
    c.uid = Math.random().toString(36).slice(2, 7);
    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }).observe(plot);
    addEventListener("theme", () => requestAnimationFrame(draw));
    requestAnimationFrame(draw);
    c.draw = draw; c.hidden = hidden;
    c.setBrush = (a, b) => { brush = a == null ? null : [a, b]; draw(); };
    return c;
  },
};
function path(n, x, y) { let d = "", pen = false; for (let i = 0; i < n; i++) { const yi = y(i); if (yi == null) { pen = false; continue; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${yi.toFixed(1)}`; pen = true; } return d; }
const cssId = (k) => String(k).replace(/[^a-zA-Z0-9_-]/g, "_");
export const TimeChart = {
  label: "Time chart",
  /** data: { buckets: [ms], bucketMs, series }; select → that bucket's time range, brush → the dragged range. */
  make(data, o = {}) {
    const { buckets, bucketMs } = data;
    return Chart.make({ slots: buckets.length, series: data.series }, { component: "TimeChart", tickLabel: (i) => (o.utc ? fmt.dayUTC(buckets[i]) : tickLabel(buckets[i], bucketMs)), tooltipTitle: (i) => (o.utc ? new Date(buckets[i]).toLocaleDateString(LOC, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : bucketTitle(buckets[i], bucketMs)), slotIds: (i) => ({ ids: o.ids?.(i) ?? {}, range: [buckets[i], buckets[i] + bucketMs], label: bucketTitle(buckets[i], bucketMs) }), ...o });
  },
};

/* ---------------- Segmented / SearchInput / Range (ui/Segmented.tsx, SearchInput.tsx, app/Shell.tsx) ---------------- */
export const Segmented = {
  label: "Segmented",
  /** options: [{value, label, title?}] (or strings); emits filter {value}. */
  make(options, o = {}) {
    const opts = options.map((x) => (typeof x === "string" ? { value: x, label: x } : x));
    let value = o.value ?? opts[0]?.value;
    const s = seg(opts.map((x) => x.label), (i) => { value = opts[i].value; c.spec.value = value; o.onChange?.(value); c.emit("filter", { filter: { [o.name ?? "value"]: value }, label: `${o.name ?? "value"} = ${value}` }); }, Math.max(0, opts.findIndex((x) => x.value === value)));
    s.classList.add("sl-seg"); if (o.size === "sm") s.classList.add("sm");
    s.setAttribute("aria-label", o.label ?? o.name ?? "Options");
    [...s.querySelectorAll("button")].forEach((b, i) => opts[i].title && (b.title = opts[i].title));
    const c = comp("Segmented", s, { value, name: o.name ?? "value" });
    c.select = (v) => { const i = opts.findIndex((x) => x.value === v); if (i >= 0) s.go(i); };
    c.value = () => value;
    return c;
  },
};
export const RangeControl = {
  label: "Segmented range",
  /** The topbar range picker: 1h · 24h · 7d · 30d · 90d · All. opts.available greys ranges the data lacks. */
  make(range = "24h", o = {}) {
    const avail = o.available ? new Set(o.available) : null;
    const c = Segmented.make(RANGES.map((r, i) => ({ value: r, label: RANGE_META[r].label, title: `${RANGE_META[r].window} (${i + 1})${avail && !avail.has(r) ? " · not in this sample" : ""}` })), { value: range, name: "range", label: "Time range", onChange: o.onChange, size: o.size });
    c.rename("RangeControl");
    if (avail) [...c.el.querySelectorAll("button")].forEach((b, i) => !avail.has(RANGES[i]) && b.classList.add("sl-na"));
    return c;
  },
};
export const SearchInput = {
  label: "Search input",
  make(value = "", o = {}) {
    const inp = h("input", { class: "sl-input", type: "search", placeholder: o.placeholder ?? "Filter…", value, "aria-label": o.placeholder ?? "Filter", style: o.width ? { width: `${o.width}px` } : null });
    const el = h("label", { class: "sl-search" }, h("span", { "aria-hidden": "true" }, "⌕"), inp);
    const c = comp("SearchInput", el, { value });
    let t = 0;
    inp.addEventListener("input", () => { c.spec.value = inp.value; o.onInput?.(inp.value); clearTimeout(t); t = setTimeout(() => c.emit("filter", { filter: { search: inp.value }, label: inp.value ? `search "${inp.value}"` : "search cleared" }), 350); });
    c.value = () => inp.value; c.input = inp;
    c.set = (v) => { inp.value = v; inp.dispatchEvent(new Event("input")); };
    return c;
  },
};

/* ---------------- Table (ui/Table.tsx) ---------------- */
/**
 * Sortable data table with optional search, selection, expanded detail rows, pinning and paging.
 * columns: [{key, header, render(row) → node|string, sort?(row), align?, width?, wrap?, title?}]
 * opts: rowKey(row), ids(row) → event ids, label(row), initialSort {key, dir}, limit, dense, empty,
 * search {placeholder, match(row, q)}, expanded(row) → node|null, expandOnSelect, selectable, pinnable,
 * selected (row key), toolbar (extra nodes), filter(row) (external predicate; call c.refresh()).
 */
export const Table = {
  label: "Table",
  make(rows, o = {}) {
    const cols = o.columns;
    const key = o.rowKey ?? ((r) => r.id ?? r.key);
    const st = { sort: o.initialSort ?? null, shown: o.limit ?? Infinity, q: "", sel: o.selected ?? null, open: null };
    const search = o.search ? SearchInput.make("", { placeholder: o.search.placeholder, width: o.search.width, onInput: (v) => { st.q = v.trim().toLowerCase(); st.shown = o.limit ?? Infinity; render(); } }) : null;
    const count = h("span", { class: "sl-micro" });
    const thead = h("thead"), tbody = h("tbody"), more = h("div", { class: "sl-table-more" });
    const table = h("table", { class: "sl-table" + (o.dense ? " dense" : "") }, thead, tbody);
    const wrap = h("div", { class: "sl-table-wrap" }, table);
    const bar = search || o.toolbar ? h("div", { class: "sl-table-bar" }, search?.el ?? null, ...(o.toolbar ?? []), h("span", { class: "sl-grow" }), count) : null;
    const el = h("div", { class: "sl-tablebox" }, bar, wrap, more);
    const c = comp(o.component ?? "Table", el, { sort: st.sort, rows: rows.length });
    if (search) c.adopt(search);
    const view = () => { let r = rows; if (o.filter) r = r.filter(o.filter); if (st.q && o.search) r = r.filter((x) => o.search.match(x, st.q)); const col = st.sort && cols.find((x) => x.key === st.sort.key); if (col?.sort) { const d = st.sort.dir === "asc" ? 1 : -1; r = [...r].sort((a, b) => { const va = col.sort(a), vb = col.sort(b); return typeof va === "number" && typeof vb === "number" ? (va - vb) * d : String(va).localeCompare(String(vb)) * d; }); } return r; };
    function header() {
      thead.replaceChildren(h("tr", {}, ...cols.map((col) => { const s = st.sort?.key === col.key ? st.sort.dir : null; return h("th", { "data-align": col.align ?? "left", "data-sortable": col.sort ? "true" : "false", style: col.width ? { width: typeof col.width === "number" ? `${col.width}px` : col.width } : null, title: col.title ?? null, "aria-sort": s === "asc" ? "ascending" : s === "desc" ? "descending" : null, onclick: col.sort ? () => { st.sort = st.sort?.key === col.key ? { key: col.key, dir: st.sort.dir === "asc" ? "desc" : "asc" } : { key: col.key, dir: col.align === "right" ? "desc" : "asc" }; c.spec.sort = st.sort; c.emit("filter", { filter: { sort: st.sort }, label: `sort ${st.sort.key} ${st.sort.dir}` }); render(); } : null }, col.header, s ? h("span", { class: "sl-sort" }, s === "asc" ? " ↑" : " ↓") : null); }), o.pinnable ? h("th", { style: { width: "44px" } }) : null));
    }
    function render() {
      header();
      const all = view(), vis = all.length > st.shown ? all.slice(0, st.shown) : all;
      count.textContent = st.q || o.filter ? `${fmt.int(all.length)} of ${fmt.int(rows.length)}` : "";
      if (!all.length) { tbody.replaceChildren(h("tr", {}, h("td", { colspan: cols.length + (o.pinnable ? 1 : 0), class: "sl-td-empty" }, rows.length ? empty("No rows match", "Clear the search or the filters.") : (o.empty ?? empty())))); more.replaceChildren(); return; }
      const kids = [];
      for (const r of vis) {
        const k = key(r), clickable = o.selectable !== false && (o.selectable || o.expanded || o.ids);
        const tr = h("tr", { "data-key": String(k), "data-selected": st.sel === k ? "true" : "false", "data-clickable": clickable ? "true" : "false", tabindex: clickable ? "0" : null, onclick: clickable ? () => pick(r) : null, onkeydown: clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(r); } } : null },
          ...cols.map((col) => { const v = col.render(r); return h("td", { "data-align": col.align ?? "left", "data-wrap": col.wrap ? "true" : "false" }, v); }),
          o.pinnable ? h("td", { "data-align": "right" }, h("button", { type: "button", class: "sl-pin", title: "Pin this row: it goes back to the agent as context", "aria-label": "Pin row", onclick: (e) => { e.stopPropagation(); st.sel = k; c.emit("pin", { ids: o.ids?.(r) ?? { key: String(k) }, label: o.label?.(r) ?? String(k) }); render(); } }, "Pin")) : null);
        kids.push(tr);
        const detail = o.expanded && st.open === k ? o.expanded(r) : null;
        if (detail) kids.push(h("tr", { class: "sl-tr-detail" }, h("td", { colspan: cols.length + (o.pinnable ? 1 : 0), "data-wrap": "true" }, detail)));
      }
      tbody.replaceChildren(...kids);
      more.replaceChildren(...(o.limit && all.length > o.limit ? [h("span", { class: "sl-micro" }, `${fmt.int(vis.length)} of ${fmt.int(all.length)}`), all.length > st.shown ? h("button", { type: "button", class: "sl-btn ghost sm", onclick: () => { st.shown += o.limit * 4; render(); } }, "Show more") : null, st.shown > o.limit ? h("button", { type: "button", class: "sl-btn ghost sm", onclick: () => { st.shown = o.limit; render(); } }, "Show fewer") : null].filter(Boolean) : []));
    }
    function pick(r) {
      const k = key(r), off = st.sel === k && (o.expanded ? st.open === k : true);
      st.sel = off ? null : k; st.open = o.expanded ? (st.open === k ? null : k) : null;
      c.spec.selected = st.sel;
      render();
      c.emit("select", off ? { ids: {}, label: "cleared" } : { ids: o.ids?.(r) ?? { key: String(k) }, label: o.label?.(r) ?? String(k) });
    }
    render();
    c.refresh = render;
    c.setRows = (r) => { rows = r; c.spec.rows = r.length; render(); };
    c.select = (k) => { const r = rows.find((x) => key(x) === k); if (r && st.sel !== k) pick(r); };
    /** Drop the selection and any open detail row without emitting (the caller already knows). */
    c.clear = () => { st.sel = null; st.open = null; c.spec.selected = null; render(); };
    c.search = search;
    return c;
  },
};

/* ---------------- Drawer, Modal, JsonBlock (ui/Drawer.tsx, Modal.tsx, JsonBlock.tsx) ---------------- */
/**
 * Detail sheet. Inline by default (inside the card, so it works in a chat bubble); opts.overlay renders
 * the dashboard's right-side glass sheet over a scrim. Esc and ✕ close it; focus returns to the opener.
 */
export const Drawer = {
  label: "Drawer",
  make({ title, subtitle, actions, body } = {}, o = {}) {
    const titleEl = h("h4", { class: "sl-drawer-t" }), subEl = h("div", { class: "sl-drawer-s" }), actEl = h("div", { class: "sl-drawer-a" }), bodyEl = h("div", { class: "sl-drawer-b" });
    const close = h("button", { type: "button", class: "sl-btn ghost icon", "aria-label": "Close", onclick: () => c.close() }, "✕");
    const panel = h("div", { class: "sl-drawer os-drawer" + (o.overlay ? " overlay" : ""), role: "dialog", "aria-modal": o.overlay ? "true" : null, tabindex: "-1", style: o.width ? { "--dw": `${o.width}px` } : null }, h("header", { class: "sl-drawer-h" }, h("div", { class: "sl-drawer-ts" }, titleEl, subEl), actEl, close), bodyEl);
    const scrim = o.overlay ? h("div", { class: "sl-scrim", onclick: () => c.close() }) : null;
    const el = h("div", { class: "sl-drawerhost", hidden: true }, scrim, panel);
    const c = comp(o.component ?? "Drawer", el, {});
    let opener = null;
    const onKey = (e) => { if (e.key === "Escape" && !el.hidden) { e.preventDefault(); c.close(); } };
    c.open = (content = {}) => {
      titleEl.replaceChildren(content.title ?? title ?? ""); subEl.replaceChildren(...[content.subtitle ?? subtitle].filter((x) => x != null)); actEl.replaceChildren(...[content.actions ?? actions].flat().filter(Boolean)); bodyEl.replaceChildren(...[content.body ?? body].flat().filter(Boolean));
      if (el.hidden) { opener = document.activeElement; el.hidden = false; if (o.overlay) document.body.append(el); addEventListener("keydown", onKey); anim(panel, o.overlay ? [{ transform: "translateX(24px)", opacity: 0 }, { transform: "none", opacity: 1 }] : [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { spring: "snappy" }); }
      panel.focus({ preventScroll: true });
      if (!o.overlay && o.scroll !== false) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      c.spec.open = true;
      return c;
    };
    c.close = () => { if (el.hidden) return; el.hidden = true; removeEventListener("keydown", onKey); c.spec.open = false; o.onClose?.(); opener?.focus?.({ preventScroll: true }); };
    c.isOpen = () => !el.hidden;
    c.body = bodyEl;
    if (body || title) c.open({});
    return c;
  },
};
export const Modal = {
  label: "Modal",
  /** Centered dialog: Esc, overlay click, ✕ and Cancel close; focus lands on the primary action. */
  make({ title, body, primary, cancelLabel = "Cancel" } = {}, o = {}) {
    const prim = primary ? h("button", { type: "button", class: "sl-btn primary", disabled: primary.disabled ?? false, onclick: () => { primary.onClick?.(); c.emit("select", { ids: { key: primary.id ?? "primary" }, label: primary.label }); } }, primary.label) : null;
    const cancel = h("button", { type: "button", class: "sl-btn", onclick: () => c.close() }, cancelLabel);
    const box = h("div", { class: "sl-modal", role: "dialog", "aria-modal": "true", "aria-label": typeof title === "string" ? title : "Dialog" }, h("div", { class: "sl-modal-h" }, h("h4", {}, title), h("button", { type: "button", class: "sl-btn ghost icon sm", "aria-label": "Close", onclick: () => c.close() }, "✕")), h("div", { class: "sl-modal-b" }, body), h("div", { class: "sl-modal-f" }, cancel, prim));
    const el = h("div", { class: "sl-modal-ov", onclick: (e) => e.target === el && c.close() }, box);
    const c = comp("Modal", el, { title: typeof title === "string" ? title : null });
    let opener = null;
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); c.close(); } };
    c.open = () => { opener = document.activeElement; (o.host ?? document.body).append(el); addEventListener("keydown", onKey); anim(box, [{ opacity: 0, transform: "translateY(-6px) scale(.98)" }, { opacity: 1, transform: "none" }], { spring: "snappy" }); (prim && !prim.disabled ? prim : cancel).focus(); c.spec.open = true; return c; };
    c.close = () => { el.remove(); removeEventListener("keydown", onKey); c.spec.open = false; o.onClose?.(); opener?.focus?.({ preventScroll: true }); };
    c.setPrimary = (patch) => { if (!prim) return; if (patch.label) prim.textContent = patch.label; if ("disabled" in patch) prim.disabled = !!patch.disabled; };
    return c;
  },
};
export const JsonBlock = {
  label: "JSON block",
  make(data, o = {}) {
    const json = JSON.stringify(data, null, 2);
    let collapsed = o.collapsed ?? false;
    const pre = h("pre", { class: "sl-code", hidden: collapsed }, h("code", {}, json));
    const tog = h("button", { type: "button", class: "sl-btn ghost sm", "aria-expanded": collapsed ? "false" : "true", onclick: () => { collapsed = !collapsed; pre.hidden = collapsed; tog.setAttribute("aria-expanded", collapsed ? "false" : "true"); tog.firstChild.textContent = collapsed ? "▸ " : "▾ "; } }, h("span", {}, collapsed ? "▸ " : "▾ "), o.title ?? "JSON");
    const copy = h("button", { type: "button", class: "sl-btn ghost sm", onclick: async () => { try { await navigator.clipboard.writeText(json); copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1500); } catch { copy.textContent = "Copy failed"; } } }, "Copy");
    const el = h("div", { class: "sl-json" }, h("div", { class: "sl-json-h" }, tog, copy), pre);
    return comp("JsonBlock", el, { title: o.title ?? "JSON", bytes: json.length });
  },
};

/* ---------------- LiveChip (app/LiveChip.tsx + data/live.tsx) ---------------- */
/**
 * Ingest status chip: Reconnecting · Syncing n/m · Sync failed · Indexing Nh left · Live (ago).
 * data: LiveStatus (/api/status). opts.events: an /api/events URL to stream (EventSource) — the live
 * host path; opts.onSync() runs on click (POST /api/sync live). c.set(status) feeds it by hand.
 */
export const LiveChip = {
  label: "Live chip",
  make(status, o = {}) {
    const el = h("button", { type: "button", class: "sl-live" });
    const c = comp("LiveChip", el, {});
    let cur = status, connected = o.connected ?? true, now = o.now ?? Date.now();
    function render() {
      const s = cur?.sync ?? { phase: "idle", current: 0, total: 0, lastSyncedAt: null };
      let body, title;
      if (!connected) { body = [dot("warn"), h("span", {}, "Reconnecting")]; title = "Lost the live connection to the stats server; retrying"; }
      else if (s.phase === "syncing") { body = [h("span", { class: "sl-spin" }, "↻"), h("span", {}, "Syncing"), s.total > 0 ? h("span", { class: "sl-live-n" }, `${fmt.int(s.current)}/${fmt.int(s.total)}`) : null]; title = "Ingesting session files"; }
      else if (s.phase === "error") { body = [dot("bad"), h("span", {}, "Sync failed")]; title = `${s.error ?? "Sync failed"} — click to retry`; }
      else if ((cur?.indexingHours ?? 0) > 24) { body = [h("span", { class: "sl-spin" }, "↻"), h("span", {}, "Indexing"), h("span", { class: "sl-live-n" }, `${fmt.int(cur.indexingHours)}h left`)]; title = "Building hourly rollups; older ranges fill in as it goes"; }
      else { body = [dot("live", !o.static), h("span", {}, o.static ? "Sample" : "Live"), s.lastSyncedAt != null ? h("span", { class: "sl-live-n" }, fmt.ago(s.lastSyncedAt, now).replace(/^about /, "")) : null]; title = o.static ? "Public sample: a snapshot, not a live stream" : "Click to sync session files now"; }
      el.replaceChildren(...body.filter(Boolean)); el.title = title; el.disabled = s.phase === "syncing";
      c.spec.phase = s.phase; c.spec.version = cur?.version ?? null;
    }
    el.addEventListener("click", () => { o.onSync?.(); c.emit("filter", { filter: { sync: "requested" }, label: "sync requested" }); });
    c.set = (s) => { const v = cur?.version; cur = s; now = o.now && !o.live ? o.now : Date.now(); render(); if (v != null && s.version !== v) o.onVersion?.(s.version); };
    c.setConnected = (b) => { connected = b; render(); };
    if (o.events && typeof EventSource !== "undefined") { const es = new EventSource(o.events); es.onopen = () => c.setConnected(true); es.onerror = () => c.setConnected(false); es.onmessage = (e) => c.set(JSON.parse(e.data)); c.close = () => es.close(); }
    render();
    return c;
  },
};

/* ---------------- RequestDrawer (ui/RequestDrawer.tsx) ---------------- */
export const requestStatus = (r) => (r.stopReason === "aborted" ? "aborted" : r.stopReason === "error" || r.errorMessage ? "failed" : "ok");
export const REQUEST_STATUS = { ok: { label: "OK", tone: "ok" }, aborted: { label: "Aborted", tone: "warn" }, failed: { label: "Failed", tone: "bad" } };
/** Body of the request sheet: error, timing, tokens, API-equivalent cost, identity, then JSON blocks. */
export function requestBody(d) {
  const u = d.usage, st = requestStatus(d), tps = d.duration > 0 && u.output > 0 ? (u.output * 1000) / d.duration : null;
  const { messages, output, ...row } = d;
  return [
    d.errorMessage ? h("section", { class: "sl-reqerr", "data-tone": st === "aborted" ? "warn" : "bad", role: "note" }, h("div", { class: "sl-seclabel" }, st === "aborted" ? "Aborted" : "Error"), h("pre", {}, d.errorMessage)) : null,
    h("section", {}, sectionLabel("Timing"), keyValues([["Started", fmt.time(d.timestamp)], ["Duration", fmt.dur(d.duration)], ["Time to first token", fmt.dur(d.ttft)], ["Output tokens/s", fmt.tps(tps)]])),
    h("section", {}, sectionLabel("Tokens"), keyValues([["Uncached input", fmt.int(u.input)], ["Cache read", fmt.int(u.cacheRead)], ["Cache write", fmt.int(u.cacheWrite)], ["Output", fmt.int(u.output)], ["Total", fmt.int(u.totalTokens)], ["Premium requests", fmt.int(Math.round((u.premiumRequests ?? 0) * 100) / 100)]])),
    h("section", {}, sectionLabel("API-equivalent cost"), keyValues([["Total", msgCost(d, 4)], ["Input", fmt.cost(u.cost.input, 4)], ["Cache read", fmt.cost(u.cost.cacheRead, 4)], ["Cache write", fmt.cost(u.cost.cacheWrite, 4)], ["Output", fmt.cost(u.cost.output, 4)]])),
    h("section", {}, sectionLabel("Identity"), keyValues([["Request id", d.id ?? "–"], ["Entry id", mono(d.entryId)], ["Stop reason", mono(d.stopReason)], ["API", mono(d.api)], ["Project", mono(fmt.folder(d.folder))]]), h("div", { class: "sl-kv-file" }, h("span", {}, "Session file"), mono(d.sessionFile))),
    output != null ? JsonBlock.make(output, { title: "Output message" }).el : null,
    JsonBlock.make(messages ?? [], { title: "Session entry", collapsed: true }).el,
    JsonBlock.make(row, { title: "Stats row", collapsed: true }).el,
  ].filter(Boolean);
}
export const RequestDrawer = {
  label: "Request drawer",
  /** data: RequestDetails (/api/request/:id). "Trace" emits select {session, entry} (open it in the trace view). */
  make(d, o = {}) {
    const dr = Drawer.make({}, { overlay: o.overlay, width: 620, component: "RequestDrawer", onClose: o.onClose });
    const c = dr;
    c.show = (d) => {
      const st = REQUEST_STATUS[requestStatus(d)];
      const ids = { request: d.id, session: d.sessionFile, entry: d.entryId, model: d.model, provider: d.provider };
      c.spec.request = d.id;
      dr.open({ title: mono(d.model), subtitle: h("span", {}, `${d.provider} · `, h("span", { title: fmt.time(d.timestamp) }, fmt.ago(d.timestamp, o.now))), actions: [h("button", { type: "button", class: "sl-btn ghost sm", title: "Open this request's session in the trace view", onclick: () => { c.emit("select", { ids: { session: d.sessionFile, entry: d.entryId, request: d.id }, label: `trace of request #${d.id}` }); o.onTrace?.(d); } }, "⑂ Trace"), h("button", { type: "button", class: "sl-btn ghost sm", onclick: () => c.emit("pin", { ids, label: `request #${d.id} · ${d.model} · ${st.label}` }) }, "Pin"), badge(st.label, st.tone)], body: requestBody(d) });
      c.emit("select", { ids, label: `request #${d.id} · ${d.model} · ${st.label}` });
      return c;
    };
    if (d) c.show(d);
    return c;
  },
};

/** Registry of primitives (the "Stats library" section lists these). */
export const PRIMITIVES = { Stat, StatGrid, Sparkline, ShareBar, BarList, Legend, Chart, TimeChart, Segmented, RangeControl, SearchInput, Table, Drawer, Modal, JsonBlock, Badge, LiveChip, RequestDrawer };
