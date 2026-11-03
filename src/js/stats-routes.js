// Stats library, layer 2: one composite per omp-stats /stats route (client/routes/*.tsx), assembled
// from the primitives in stats-lib.js and the trace pieces in stats-trace.js. Same contract:
//
//   const c = ROUTES.models.make(data, opts)   data: that route's omp-stats JSON, unchanged
//   c.el · c.spec · c.getSelection() · c.on("select" | "pin" | "brush" | "filter" | "*", cb)
//
// `ROUTES[id].load(api, range)` fetches exactly the payloads a route reads (api(path) → JSON, e.g.
// trace-data.js `api` on the public fixture or `fetch` against a live omp-stats / Hermes /stats
// server), so a host can do `ROUTES[id].make(await ROUTES[id].load(api, range), opts)`.
// Common opts: range, now (reference "now" for relative times and range cut-offs; the fixture's
// capture time on the public site), request(id) → RequestDetails (opens the request drawer),
// trace(file) → SessionTrace, entry(file, id) → entry, highlight {model, tool, folder, request, ...}.
import { h } from "./motion.js";
import {
  comp, fmt, msgCost, isUnpriced, SERIES, OTHER, modelKey, colorLookup, RANGE_META, bucketAxis, bucketWord, densify, pivot,
  badge, dot, swatch, errorRateTone, mono, num, labelCell, meterCell, keyValues, sectionLabel, empty, card, loadInto, tableSkeleton,
  Stat, StatGrid, ShareBar, BarList, Legend, Chart, TimeChart, Segmented, RangeControl, SearchInput, Table, Modal, LiveChip, RequestDrawer,
  requestStatus, REQUEST_STATUS, Sparkline as SparkC,
} from "./stats-lib.js";
import { TraceView } from "./stats-trace.js";

const DAY = 86_400_000;
const conv = (s) => (s.totalInputTokens ?? 0) + (s.totalOutputTokens ?? 0) + (s.totalCacheReadTokens ?? 0) + (s.totalCacheWriteTokens ?? 0);
const sum = (xs) => xs.reduce((n, v) => n + (v ?? 0), 0);
const nulls = (xs) => xs.map((v) => v || null);
const meta = (o) => RANGE_META[o.range] ?? RANGE_META["7d"];
const nowOf = (o) => o.now ?? Date.now();
function quantile(sorted, q) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] : null; }
const C = { primary: "var(--sl-c1)", secondary: "var(--sl-c2)", bad: "var(--sl-bad)" };

/** A route view's root: header, then sections. Children's events are re-emitted as the route's. */
function routeRoot(kind, { title, desc, actions }, o) {
  const el = h("div", { class: "sl-route os sl-root", "data-density": o.density ?? null }, title ? h("header", { class: "sl-route-h" }, h("div", {}, h("h3", {}, title), desc ? h("p", {}, desc) : null), actions ?? null) : null);
  const c = comp(kind, el, { range: o.range ?? null });
  c.add = (...nodes) => { el.append(...nodes.flat().filter(Boolean)); return c; };
  /** Headline stat grids: appended in order, their (selectable) stats report as part "totals". */
  c.stats = (...grids) => { for (const g of grids) { c.adopt(g, { part: "totals" }); el.append(g.el); } return c; };
  return c;
}
/** Inline request drawer bound to opts.request(id); `open(id)` loads and shows /api/request/:id. */
function requestHost(c, o) {
  const dr = RequestDrawer.make(null, { now: o.now, onTrace: o.onTrace });
  c.adopt(dr, { part: "request" });
  return { el: dr.el, open(id) { if (id == null || !o.request) return; Promise.resolve(o.request(id)).then((d) => d && dr.show(d)).catch(() => {}); } };
}
const requestIds = (r) => ({ request: r.id, session: r.sessionFile, entry: r.entryId, model: r.model, provider: r.provider, folder: r.folder });

/* ---------------- Overview (routes/OverviewRoute.tsx) ---------------- */
const AGENT_LABEL = { main: "Main agent", subagent: "Subagents", advisor: "Advisor" };
const AGENT_COLOR = { main: C.primary, subagent: C.secondary, advisor: "#9d7bff" };
const TOKEN_MIX = [{ key: "input", label: "Uncached input", color: "#5b8cff", f: "totalInputTokens" }, { key: "cacheRead", label: "Cache read", color: C.primary, f: "totalCacheReadTokens" }, { key: "cacheWrite", label: "Cache write", color: "#f5b54a", f: "totalCacheWriteTokens" }, { key: "output", label: "Output", color: C.secondary, f: "totalOutputTokens" }];
const recentColumns = (o) => [
  { key: "model", header: "Model", render: (r) => labelCell(r.model, r.provider), sort: (r) => r.model },
  { key: "time", header: "When", render: (r) => h("span", { class: "sl-dim", title: fmt.time(r.timestamp) }, fmt.ago(r.timestamp, nowOf(o))), sort: (r) => r.timestamp },
  { key: "tokens", header: "Tokens", align: "right", render: (r) => num(fmt.int(r.usage.totalTokens)), sort: (r) => r.usage.totalTokens },
  { key: "cost", header: "Cost", align: "right", render: (r) => num(msgCost(r, 4)), sort: (r) => r.usage.cost.total },
  { key: "duration", header: "Duration", align: "right", render: (r) => num(fmt.dur(r.duration)), sort: (r) => r.duration ?? -1 },
  { key: "status", header: "Status", align: "right", render: (r) => (r.errorMessage ? badge("Failed", "bad") : badge("OK", "ok")) },
];
export const OverviewView = {
  label: "Overview", route: "overview",
  /** data: { overview: OverviewStats, recent: MessageStats[] }. */
  make({ overview, recent = [] }, o = {}) {
    const m = meta(o), c = routeRoot("OverviewView", { title: "Overview", desc: `Everything the agent did across your sessions in ${m.window}.` }, o);
    const pts = overview.timeSeries ?? [], buckets = bucketAxis(o.range ?? "7d", pts.map((p) => p.timestamp), m.bucket, nowOf(o));
    const s = { ok: densify(pts, buckets, (p) => p.requests - p.errors), err: densify(pts, buckets, (p) => p.errors), tokens: densify(pts, buckets, (p) => p.tokens), cost: densify(pts, buckets, (p) => p.cost), all: densify(pts, buckets, (p) => p.requests) };
    const ov = overview.overall;
    const big = c.adopt(StatGrid.make([
      { label: "API-equivalent cost", title: "What this usage would cost at public API rates", value: fmt.estCost(ov.totalCost, ov.unpricedRequests), hint: ov.unpricedRequests ? `${fmt.int(ov.unpricedRequests)} unpriced` : null, spark: s.cost, sparkColor: C.secondary, key: "cost", raw: ov.totalCost },
      { label: "Requests", value: fmt.int(ov.totalRequests), hint: `${fmt.int(ov.failedRequests)} failed`, spark: s.all, key: "requests", raw: ov.totalRequests },
      { label: "Conversation tokens", title: "Uncached input + cache reads + cache writes + output", value: fmt.compact(conv(ov)), hint: `${fmt.compact(ov.totalOutputTokens)} output`, spark: s.tokens, key: "tokens", raw: conv(ov) },
      { label: "Cache rate", title: "Cache reads ÷ (uncached input + cache reads)", value: fmt.pct(ov.cacheRate), hint: `${fmt.pct(ov.cacheSavings)} saved`, key: "cacheRate", raw: ov.cacheRate },
      { label: "Error rate", value: fmt.rate(ov.errorRate), hint: `${fmt.int(ov.successfulRequests)} succeeded`, spark: s.err, sparkColor: C.bad, key: "errorRate", raw: ov.errorRate },
    ], { min: 190, selectable: true }), { part: "totals" });
    const small = StatGrid.make([["Uncached input", fmt.compact(ov.totalInputTokens)], ["Cache read", fmt.compact(ov.totalCacheReadTokens)], ["Cache write", fmt.compact(ov.totalCacheWriteTokens)], ["Output", fmt.compact(ov.totalOutputTokens)], ["Premium requests", fmt.int(Math.round(ov.totalPremiumRequests * 100) / 100)], ["Tokens/s", fmt.tps(ov.avgTokensPerSecond)], ["Avg latency", fmt.dur(ov.avgDuration)], ["Avg TTFT", fmt.dur(ov.avgTtft)]].map(([label, value]) => ({ label, value })), { min: 140, size: "sm" });
    const slot = h("div", {});
    const series = (metric) => metric === "requests" ? [{ key: "ok", label: "Succeeded", color: C.primary, values: s.ok }, { key: "err", label: "Failed", color: C.bad, values: s.err }] : metric === "tokens" ? [{ key: "tokens", label: "Tokens", color: C.primary, values: s.tokens }] : [{ key: "cost", label: "API-equivalent", color: C.secondary, values: s.cost }];
    const draw = (metric) => { const ch = TimeChart.make({ buckets, bucketMs: m.bucket, series: series(metric) }, { height: 260, format: metric === "cost" ? (v) => fmt.estCost(v, 0) : fmt.compact }); c.adopt(ch, { part: "activity" }); slot.replaceChildren(ch.el); c.spec.metric = metric; };
    const metric = c.adopt(Segmented.make([{ value: "requests", label: "Requests" }, { value: "tokens", label: "Tokens" }, { value: "cost", label: "Cost" }], { value: o.metric ?? "requests", name: "metric", size: "sm", onChange: draw }), { part: "activity" });
    draw(o.metric ?? "requests");
    const total = conv(ov), mix = ShareBar.make(TOKEN_MIX.map((t) => ({ key: t.key, label: t.label, value: ov[t.f], color: t.color })), { selectable: true });
    const order = ["main", "subagent", "advisor"], agents = order.map((k) => (overview.byAgentType ?? []).find((a) => a.agentType === k)).filter(Boolean), atot = sum(agents.map(conv));
    c.adopt(mix, { part: "tokenMix" });
    const rq = requestHost(c, o);
    const tbl = c.adopt(Table.make(recent.slice(0, 12), { component: "LatestRequests", dense: true, rowKey: (r) => r.id ?? `${r.sessionFile}:${r.entryId}`, ids: requestIds, label: (r) => `request #${r.id} · ${r.model} · ${REQUEST_STATUS[requestStatus(r)].label}`, columns: recentColumns(o) }), { part: "latest" });
    tbl.on("select", (e) => rq.open(e.entities.request));
    c.add(h("div", { class: "sl-stack" }, big.el, small.el),
      h("div", { class: "sl-cols" },
        card({ title: "Activity", desc: `Per ${bucketWord(m.bucket)}`, actions: metric.el, body: slot }),
        card({ title: "Token mix", desc: "Where conversation tokens went", body: h("div", { class: "sl-stack" }, mix.el, Legend.make(TOKEN_MIX.map((t) => ({ key: t.key, label: t.label, color: t.color, value: total > 0 ? fmt.pct(ov[t.f] / total, 0) : "–" }))).el, sectionLabel("By agent"), ShareBar.make(agents.map((a) => ({ key: a.agentType, label: AGENT_LABEL[a.agentType], value: conv(a), color: AGENT_COLOR[a.agentType] }))).el, ...agents.map((a) => h("div", { class: "sl-rowline" }, h("span", {}, swatch(AGENT_COLOR[a.agentType]), AGENT_LABEL[a.agentType], h("span", { class: "sl-num sl-dim" }, `${fmt.int(a.totalRequests)} req`)), h("span", {}, h("span", { class: "sl-num sl-dim" }, fmt.compact(conv(a))), h("span", { class: "sl-num" }, fmt.pct(atot ? conv(a) / atot : 0)))))) })),
      card({ title: [dot("live", true), " Latest requests"], desc: "Most recent model calls across every session. Open a row for its full payload.", actions: [h("button", { type: "button", class: "sl-btn ghost sm", onclick: () => { c.emit("filter", { filter: { section: "requests" }, label: "open all requests" }); o.onNavigate?.("requests"); } }, "All requests →")], body: [tbl.el, rq.el], flush: true }));
    return c;
  },
  load: async (api, range) => ({ overview: await api(`/api/stats/overview?range=${range}`), recent: (await api(`/api/stats/recent?limit=12`)) ?? [] }),
};

/* ---------------- Models (routes/ModelsRoute.tsx) ---------------- */
function modelColors(models) { return colorLookup(models.map((m) => ({ key: modelKey(m.model, m.provider), weight: m.totalRequests }))); }
export const ModelsView = {
  label: "Models", route: "models",
  /** data: ModelDashboardStats { byModel, modelSeries, modelPerformanceSeries }. */
  make(d, o = {}) {
    const m = meta(o), c = routeRoot("ModelsView", { title: "Models", desc: `Which models did the work in ${m.window}, and how fast they answered.` }, o);
    const models = d.byModel ?? [];
    if (!models.length) return c.add(empty("No model usage in this range", "Pick a wider range."));
    const colors = modelColors(models), perModel = new Map(); for (const x of models) perModel.set(x.model, (perModel.get(x.model) ?? 0) + 1);
    const labelOf = (k) => { const x = models.find((y) => modelKey(y.model, y.provider) === k); return x ? (perModel.get(x.model) > 1 ? `${x.model} · ${x.provider}` : x.model) : k; };
    const buckets = bucketAxis(o.range ?? "7d", d.modelSeries.map((p) => p.timestamp), m.bucket, nowOf(o)), totals = densify(d.modelSeries, buckets, (p) => p.requests);
    const pv = { buckets, key: (p) => modelKey(p.model, p.provider), label: labelOf, value: (p) => p.requests, colors };
    const count = pivot(d.modelSeries, { ...pv, limit: 6 }).map((s) => ({ ...s, values: nulls(s.values) }));
    const share = count.map((s) => ({ ...s, values: s.values.map((v, i) => (v == null ? null : v / totals[i])) }));
    const trends = new Map(pivot(d.modelSeries, pv).map((s) => [s.key, s.values]));
    const swatches = new Map(count.filter((s) => s.key !== "__other__").map((s) => [s.key, s.color]));
    const top = models.reduce((a, b) => (!a || b.totalRequests > a.totalRequests ? b : a), null), tot = { req: sum(models.map((x) => x.totalRequests)), fail: sum(models.map((x) => x.failedRequests)), cost: sum(models.map((x) => x.totalCost)), unpriced: sum(models.map((x) => x.unpricedRequests)) };
    c.stats(StatGrid.make([
      { label: "Models used", value: fmt.int(models.length), hint: `across ${new Set(models.map((x) => x.provider)).size} providers` },
      { label: "Most used", value: top.model, title: `${top.model} (${top.provider})`, hint: `${fmt.pct(top.totalRequests / Math.max(1, tot.req))} of requests · ${top.provider}` },
      { label: "Requests", value: fmt.int(tot.req), hint: `${fmt.int(tot.fail)} failed`, spark: totals },
      { label: "API-equivalent cost", value: fmt.estCost(tot.cost, tot.unpriced), hint: tot.unpriced ? `${fmt.int(tot.unpriced)} unpriced` : null },
    ], { min: 200 }));
    const slot = h("div", {});
    let hidden = new Set();
    const draw = (mode) => { const ch = TimeChart.make({ buckets, bucketMs: m.bucket, series: mode === "share" ? share : count }, { height: 260, hidden: [...hidden], yMax: mode === "share" ? 1 : undefined, format: mode === "share" ? (v) => fmt.pct(v, 0) : fmt.compact, formatTooltip: mode === "share" ? (v) => fmt.pct(v) : fmt.int, showTotal: mode === "requests", legend: { values: (s) => fmt.pct(sum(count.find((x) => x.key === s.key).values) / Math.max(1, sum(totals))) }, ids: () => ({}) }); hidden = ch.hidden; c.adopt(ch, { part: "share" }); slot.replaceChildren(ch.el); c.spec.mode = mode; };
    const mode = c.adopt(Segmented.make([{ value: "share", label: "Share" }, { value: "requests", label: "Requests" }], { value: "share", name: "mode", size: "sm", onChange: draw }), { part: "share" });
    draw("share");
    const perf = new Map(); for (const p of d.modelPerformanceSeries ?? []) { const k = modelKey(p.model, p.provider); if (!perf.has(k)) perf.set(k, []); perf.get(k).push(p); }
    for (const v of perf.values()) v.sort((a, b) => a.timestamp - b.timestamp);
    const maxReq = top.totalRequests;
    const detail = (r) => {
      const k = modelKey(r.model, r.provider), pts = perf.get(k) ?? [], color = swatches.get(k) ?? C.primary;
      const chart = pts.length ? TimeChart.make({ buckets: pts.map((p) => p.timestamp), bucketMs: m.bucket, series: [{ key: "tps", label: "Tokens/s", color, kind: pts.length > 1 ? "line" : "bars", values: pts.map((p) => p.avgTokensPerSecond) }, { key: "ttft", label: "TTFT", color: OTHER, kind: pts.length > 1 ? "line" : "bars", axis: "right", dashed: true, values: pts.map((p) => (p.avgTtft == null ? null : p.avgTtft / 1000)) }] }, { stacked: false, height: 220, format: fmt.compact, formatTooltip: (v) => `${fmt.tps(v)} tok/s`, formatRight: (v) => `${Number(v.toFixed(2))}s`, legend: true, ids: () => ({ model: r.model, provider: r.provider }), tooltipExtra: (i) => h("div", { class: "sl-tip-r tot" }, h("span", { class: "sl-tip-l" }, "Requests"), h("span", { class: "sl-tip-v" }, fmt.int(pts[i].requests))) }) : null;
      if (chart) c.adopt(chart, { part: "performance", entities: { model: r.model, provider: r.provider } });
      return h("div", { class: "sl-detail" }, h("div", { class: "sl-md" }, keyValues([["Error rate", fmt.rate(r.errorRate)], ["Cache rate", fmt.pct(r.cacheRate)], ["Cache savings", fmt.pct(r.cacheSavings)], ["Premium requests", fmt.int(Math.round(r.totalPremiumRequests * 100) / 100)]]), keyValues([["Avg duration", fmt.dur(r.avgDuration)], ["Avg TTFT", fmt.dur(r.avgTtft)], ["Tokens/s", fmt.tps(r.avgTokensPerSecond)]]), keyValues([["Uncached input", fmt.compact(r.totalInputTokens)], ["Cache read", fmt.compact(r.totalCacheReadTokens)], ["Cache write", fmt.compact(r.totalCacheWriteTokens)], ["Output", fmt.compact(r.totalOutputTokens)]])), h("div", { class: "sl-micro" }, `First seen ${fmt.ago(r.firstTimestamp, nowOf(o))} · last seen ${fmt.ago(r.lastTimestamp, nowOf(o))}`), sectionLabel(`Performance per active ${bucketWord(m.bucket)}`), chart?.el ?? empty("No performance samples", "Timing is recorded for streamed responses."));
    };
    const tbl = c.adopt(Table.make(models, { component: "ModelTable", rowKey: (r) => modelKey(r.model, r.provider), initialSort: { key: "requests", dir: "desc" }, limit: 25, expanded: detail, ids: (r) => ({ model: r.model, provider: r.provider }), label: (r) => `model ${r.model} (${r.provider}): ${fmt.int(r.totalRequests)} requests, ${fmt.estCost(r.totalCost, r.unpricedRequests)}, error rate ${fmt.rate(r.errorRate)}`, pinnable: true, selected: o.highlight?.model ? modelKey(o.highlight.model, o.highlight.provider ?? models.find((x) => x.model === o.highlight.model)?.provider) : null, columns: [
      { key: "model", header: "Model", render: (r) => labelCell(mono(r.model), r.provider, swatch(swatches.get(modelKey(r.model, r.provider)) ?? OTHER)), sort: (r) => r.model },
      { key: "requests", header: "Requests", align: "right", render: (r) => meterCell(r.totalRequests, maxReq, fmt.int(r.totalRequests), swatches.get(modelKey(r.model, r.provider)) ?? OTHER), sort: (r) => r.totalRequests },
      { key: "cost", header: "Cost", align: "right", title: "API-equivalent estimate at public rates", render: (r) => num(fmt.estCost(r.totalCost, r.unpricedRequests)), sort: (r) => r.totalCost },
      { key: "tokens", header: "Tokens", align: "right", render: (r) => num(fmt.compact(conv(r))), sort: conv },
      { key: "cache", header: "Cache rate", align: "right", render: (r) => num(fmt.pct(r.cacheRate)), sort: (r) => r.cacheRate },
      { key: "errors", header: "Errors", align: "right", render: (r) => (r.failedRequests ? badge(fmt.rate(r.errorRate), errorRateTone(r.errorRate), true) : h("span", { class: "sl-num sl-dim" }, "–")), sort: (r) => r.errorRate },
      { key: "tps", header: "Tokens/s", align: "right", render: (r) => num(fmt.tps(r.avgTokensPerSecond)), sort: (r) => r.avgTokensPerSecond ?? -1 },
      { key: "ttft", header: "TTFT", align: "right", render: (r) => num(fmt.dur(r.avgTtft)), sort: (r) => r.avgTtft ?? -1 },
      { key: "trend", header: "Trend", width: 112, render: (r) => { const v = trends.get(modelKey(r.model, r.provider)); return v ? Sparkline(v, swatches.get(modelKey(r.model, r.provider)) ?? OTHER) : h("span", { class: "sl-dim" }, "–"); } },
    ] }), { part: "models" });
    c.add(card({ title: "Request share", desc: `Each model's share of requests per ${bucketWord(m.bucket)}`, actions: mode.el, body: slot }), card({ title: "All models", desc: "Click a row for latency and throughput over time; Pin sends it to the agent", body: tbl.el, flush: true }));
    if (o.highlight?.model) tbl.select(modelKey(o.highlight.model, o.highlight.provider ?? models.find((x) => x.model === o.highlight.model)?.provider));
    return c;
  },
  load: (api, range) => api(`/api/stats/model-dashboard?range=${range}`),
};
const Sparkline = (values, color, w = 96) => SparkC.make(values.map((v) => v ?? 0), { color, width: w, height: 22 }).el;

/* ---------------- Costs (routes/CostsRoute.tsx) ---------------- */
const COMPONENTS = [{ key: "costInput", label: "Input", color: "#5b8cff" }, { key: "costOutput", label: "Output", color: C.secondary }, { key: "costCacheRead", label: "Cache read", color: C.primary }, { key: "costCacheWrite", label: "Cache write", color: "#f5b54a" }];
export function costSummary(points) {
  const S = { totalCost: 0, requests: 0, unpricedRequests: 0, activeDays: new Set(points.map((p) => p.timestamp)).size, costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0, models: [] }, by = new Map();
  for (const p of points) { const k = modelKey(p.model, p.provider); if (!by.has(k)) by.set(k, { key: k, model: p.model, provider: p.provider, cost: 0, requests: 0, unpricedRequests: 0, costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0, share: 0 }); for (const t of [by.get(k), S]) { for (const f of ["costInput", "costOutput", "costCacheRead", "costCacheWrite", "requests", "unpricedRequests"]) t[f] += p[f] ?? 0; } by.get(k).cost += p.cost; S.totalCost += p.cost; }
  S.avgDailyCost = S.activeDays ? S.totalCost / S.activeDays : 0;
  S.models = [...by.values()].sort((a, b) => b.cost - a.cost || b.requests - a.requests || a.key.localeCompare(b.key));
  for (const r of S.models) r.share = S.totalCost > 0 ? r.cost / S.totalCost : 0;
  S.topModel = S.models[0]?.cost > 0 ? S.models[0] : null;
  return S;
}
export const CostsView = {
  label: "Costs", route: "costs",
  /** data: CostDashboardStats { costSeries }. Days are UTC, like the server buckets them. */
  make(d, o = {}) {
    const m = meta(o), c = routeRoot("CostsView", { title: "Costs", desc: `What ${m.window} of usage would cost at public API rates. Subscription usage without a public price is counted as unpriced, not free.` }, o);
    const pts = d.costSeries ?? [];
    if (!pts.length) return c.add(empty("No usage in this range", "Pick a wider range."));
    const S = costSummary(pts), colors = modelColors(S.models.map((x) => ({ model: x.model, provider: x.provider, totalRequests: x.requests }))), byKey = new Map(S.models.map((x) => [x.key, x]));
    const buckets = bucketAxis(o.range ?? "7d", pts.map((p) => p.timestamp), DAY, nowOf(o));
    const modelSeries = pivot(pts, { buckets, key: (p) => modelKey(p.model, p.provider), label: (k) => byKey.get(k)?.model ?? k, value: (p) => p.cost, limit: 6, colors }).map((s) => ({ ...s, values: nulls(s.values) }));
    const used = new Set(); for (const s of modelSeries) { if (s.key === "__other__") continue; if (used.has(s.color)) s.color = SERIES.find((x) => !used.has(x)) ?? s.color; used.add(s.color); }
    const sw = new Map(modelSeries.filter((s) => s.key !== "__other__").map((s) => [s.key, s.color]));
    const daily = densify(pts, buckets, (p) => p.cost), unpriced = densify(pts, buckets, (p) => p.unpricedRequests);
    const compSeries = COMPONENTS.map((x) => ({ key: x.key, label: x.label, color: x.color, values: nulls(densify(pts, buckets, (p) => p[x.key])) }));
    const priced = S.requests - S.unpricedRequests, top = S.topModel;
    c.stats(StatGrid.make([
      { label: "API-equivalent estimate", value: fmt.estCost(S.totalCost, S.unpricedRequests), hint: `${fmt.int(S.requests)} requests`, spark: daily, sparkColor: C.secondary },
      { label: "Average per day", title: "Estimate ÷ days with any usage", value: fmt.estCost(S.avgDailyCost, S.unpricedRequests), hint: `over ${S.activeDays} active day${S.activeDays === 1 ? "" : "s"}` },
      { label: "Top model", value: top ? top.model : "–", hint: top ? `${fmt.cost(top.cost)} · ${fmt.pct(top.share)} of estimate` : "Nothing priced yet" },
      { label: "Per priced request", value: priced > 0 ? fmt.unitCost(S.totalCost / priced) : "–", hint: `${fmt.int(priced)} priced` },
      { label: "Unpriced requests", title: "Subscription usage with no public-equivalent price; excluded from the estimate", value: fmt.int(S.unpricedRequests), hint: S.unpricedRequests ? "excluded from the estimate" : "all usage priced" },
    ], { min: 180 }));
    const slot = h("div", {}), desc = h("p", {});
    const draw = (split) => { const series = split === "model" ? modelSeries : compSeries; const ch = Chart.make({ slots: buckets.length, series }, { component: "DailyCost", height: 280, tickLabel: (i) => fmt.dayUTC(buckets[i]), tooltipTitle: (i) => new Date(buckets[i]).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }), slotIds: (i) => ({ ids: {}, range: [buckets[i], buckets[i] + DAY], label: fmt.dayUTC(buckets[i]) }), format: (v) => fmt.cost(v, Number.isInteger(v) ? 0 : 2), formatTooltip: (v) => fmt.cost(v), emptyLabel: "No priced usage in this range", legend: { values: (s) => fmt.cost(sum(s.values)) }, tooltipExtra: (i) => (unpriced[i] > 0 ? h("div", { class: "sl-tip-r tot" }, h("span", { class: "sl-tip-l" }, "Unpriced requests"), h("span", { class: "sl-tip-v" }, fmt.int(unpriced[i]))) : null) }); c.adopt(ch, { part: "daily" }); slot.replaceChildren(ch.el); c.spec.split = split; };
    const split = c.adopt(Segmented.make([{ value: "model", label: "By model" }, { value: "component", label: "By component" }], { value: o.split ?? "model", name: "split", size: "sm", onChange: draw }), { part: "daily" });
    draw(o.split ?? "model");
    const comps = h("div", { class: "sl-stack" }, ShareBar.make(COMPONENTS.map((x) => ({ key: x.key, label: x.label, value: S[x.key], color: x.color })), { height: 10 }).el, h("div", {}, ...COMPONENTS.map((x) => h("div", { class: "sl-comp-row" }, h("span", { class: "sl-rowline" }, h("span", {}, swatch(x.color), x.label)), num(fmt.cost(S[x.key])), h("span", { class: "sl-num sl-dim", style: { textAlign: "right" } }, S.totalCost > 0 ? fmt.pct(S[x.key] / S.totalCost) : "–"))), h("div", { class: "sl-comp-row tot" }, h("span", {}, "Total"), num(fmt.estCost(S.totalCost, S.unpricedRequests)), h("span", {}))), S.unpricedRequests ? h("p", { class: "sl-micro" }, `${fmt.int(S.unpricedRequests)} unpriced subscription requests are not included.`) : null);
    const maxCost = S.models[0]?.cost ?? 0;
    const tbl = c.adopt(Table.make(S.models, { component: "CostTable", rowKey: (r) => r.key, initialSort: { key: "cost", dir: "desc" }, limit: 20, ids: (r) => ({ model: r.model, provider: r.provider }), label: (r) => `cost of ${r.model} (${r.provider}): ${fmt.estCost(r.cost, r.unpricedRequests)}, ${fmt.pct(r.share)} of estimate, ${fmt.int(r.requests)} requests`, pinnable: true, columns: [
      { key: "model", header: "Model", render: (r) => labelCell(mono(r.model), r.provider, swatch(sw.get(r.key) ?? OTHER)), sort: (r) => r.model },
      { key: "requests", header: "Requests", align: "right", render: (r) => num(fmt.int(r.requests)), sort: (r) => r.requests },
      { key: "cost", header: "Estimate", align: "right", render: (r) => meterCell(r.cost, maxCost, fmt.estCost(r.cost, r.unpricedRequests), sw.get(r.key) ?? OTHER), sort: (r) => r.cost },
      { key: "share", header: "Share", align: "right", render: (r) => h("span", { class: "sl-num sl-dim" }, r.cost > 0 ? fmt.pct(r.share) : "–"), sort: (r) => r.share },
      { key: "split", header: "Split", width: 150, render: (r) => (r.cost > 0 ? ShareBar.make(COMPONENTS.map((x) => ({ key: x.key, label: x.label, value: r[x.key], color: x.color }))).el : h("span", { class: "sl-dim" }, "–")) },
      ...COMPONENTS.map((x) => ({ key: x.key, header: x.label, align: "right", render: (r) => num(fmt.cost(r[x.key])), sort: (r) => r[x.key] })),
      { key: "perRequest", header: "Per request", align: "right", render: (r) => num(r.requests > r.unpricedRequests ? fmt.unitCost(r.cost / (r.requests - r.unpricedRequests)) : "–"), sort: (r) => (r.requests > r.unpricedRequests ? r.cost / (r.requests - r.unpricedRequests) : -1) },
      { key: "unpriced", header: "Unpriced", align: "right", render: (r) => (r.unpricedRequests ? h("span", { class: "sl-num tone-warn" }, fmt.int(r.unpricedRequests)) : h("span", { class: "sl-num sl-dim" }, "–")), sort: (r) => r.unpricedRequests },
    ] }), { part: "models" });
    c.add(h("div", { class: "sl-cols" }, card({ title: "Daily estimate", desc: "Per UTC day, stacked by model or billing component", actions: split.el, body: slot }), card({ title: "Where it went", desc: "Estimate by billing component", body: comps })), card({ title: "By model", desc: "Estimate per model with its input, output and cache split", body: tbl.el, flush: true }));
    void desc;
    return c;
  },
  load: (api, range) => api(`/api/stats/costs?range=${range}`),
};

/* ---------------- Requests (routes/RequestsRoute.tsx) ---------------- */
export function summarizeRequests(rows) {
  let failed = 0, aborted = 0, tokens = 0, cost = 0, unpriced = 0, oldest = null; const dur = [], ttft = [];
  for (const r of rows) { const s = requestStatus(r); if (s === "failed") failed++; else if (s === "aborted") aborted++; tokens += r.usage.totalTokens; cost += r.usage.cost.total; if (isUnpriced(r)) unpriced++; if (r.duration != null) dur.push(r.duration); if (r.ttft != null) ttft.push(r.ttft); if (oldest == null || r.timestamp < oldest) oldest = r.timestamp; }
  dur.sort((a, b) => a - b); ttft.sort((a, b) => a - b);
  return { requests: rows.length, failed, aborted, tokens, cost, unpriced, medianDuration: quantile(dur, 0.5), p95Duration: quantile(dur, 0.95), medianTtft: quantile(ttft, 0.5), oldest };
}
const requestColumns = (o) => [
  { key: "model", header: "Model", render: (r) => labelCell(mono(r.model), r.provider), sort: (r) => r.model },
  { key: "time", header: "When", render: (r) => h("span", { class: "sl-dim", title: fmt.time(r.timestamp) }, fmt.ago(r.timestamp, nowOf(o))), sort: (r) => r.timestamp },
  { key: "project", header: "Project", render: (r) => mono(fmt.folder(r.folder), "dim"), sort: (r) => r.folder },
  { key: "input", header: "Input", title: "Uncached input tokens", align: "right", render: (r) => num(fmt.compact(r.usage.input)), sort: (r) => r.usage.input },
  { key: "cache", header: "Cache read", align: "right", render: (r) => h("span", { class: "sl-num", title: `Cache write: ${fmt.int(r.usage.cacheWrite)}` }, fmt.compact(r.usage.cacheRead)), sort: (r) => r.usage.cacheRead },
  { key: "output", header: "Output", align: "right", render: (r) => num(fmt.compact(r.usage.output)), sort: (r) => r.usage.output },
  { key: "cost", header: "Cost", title: "API-equivalent estimate", align: "right", render: (r) => num(msgCost(r, 4)), sort: (r) => r.usage.cost.total },
  { key: "duration", header: "Duration", align: "right", render: (r) => num(fmt.dur(r.duration)), sort: (r) => r.duration ?? -1 },
  { key: "ttft", header: "TTFT", align: "right", render: (r) => h("span", { class: "sl-num sl-dim" }, fmt.dur(r.ttft)), sort: (r) => r.ttft ?? -1 },
  { key: "status", header: "Status", render: (r) => { const s = REQUEST_STATUS[requestStatus(r)]; return h("span", { title: r.errorMessage ?? null }, labelCell(s.label, mono(r.stopReason), dot(s.tone))); }, sort: (r) => requestStatus(r) },
];
export const RequestsView = {
  label: "Requests", route: "requests",
  /** data: MessageStats[] (GET /api/stats/recent?limit=N, newest first). opts.limit: how many were asked for. */
  make(rows, o = {}) {
    const m = meta(o), c = routeRoot("RequestsView", { title: "Requests", desc: `Every model call in ${m.window}, newest first. Open a row for its full payload.` }, o);
    const cutoff = m.span == null ? null : nowOf(o) - m.span, inRange = cutoff == null ? rows : rows.filter((r) => r.timestamp >= cutoff);
    const complete = rows.length < (o.limit ?? 500) || (cutoff != null && inRange.length < rows.length);
    const S = summarizeRequests(inRange), counts = { all: inRange.length, ok: 0, aborted: 0, failed: 0 }; for (const r of inRange) counts[requestStatus(r)]++;
    c.stats(StatGrid.make([
      { label: "Requests", value: fmt.int(S.requests), hint: S.oldest == null ? `none in ${m.window}` : `since ${fmt.ago(S.oldest, nowOf(o))}` },
      { label: "Failed", value: fmt.int(S.failed), hint: `${S.requests ? fmt.rate(S.failed / S.requests) : "–"} · ${fmt.int(S.aborted)} aborted`, tone: S.failed ? "bad" : null },
      { label: "Tokens", value: fmt.compact(S.tokens) },
      { label: "API-equivalent cost", value: fmt.estCost(S.cost, S.unpriced), hint: S.unpriced ? `${fmt.int(S.unpriced)} unpriced` : null },
      { label: "Median duration", value: fmt.dur(S.medianDuration), hint: `p95 ${fmt.dur(S.p95Duration)}` },
      { label: "Median TTFT", value: fmt.dur(S.medianTtft) },
    ], { min: 160 }));
    let status = o.status ?? "all";
    const rq = requestHost(c, o);
    const seg = c.adopt(Segmented.make(["all", "ok", "aborted", "failed"].map((v) => ({ value: v, label: `${v === "all" ? "All" : REQUEST_STATUS[v].label} ${fmt.compact(counts[v])}` })), { value: status, name: "status", size: "sm", label: "Status", onChange: (v) => { status = v; tbl.refresh(); } }), { part: "log" });
    const tbl = c.adopt(Table.make(inRange, { component: "RequestLog", dense: true, limit: 100, initialSort: { key: "time", dir: "desc" }, rowKey: (r) => r.id ?? `${r.sessionFile}:${r.entryId}`, ids: requestIds, label: (r) => `request #${r.id} · ${r.model} · ${REQUEST_STATUS[requestStatus(r)].label}`, pinnable: true, filter: (r) => status === "all" || requestStatus(r) === status, search: { placeholder: "Model, provider or project", match: (r, q) => r.model.toLowerCase().includes(q) || r.provider.toLowerCase().includes(q) || r.folder.toLowerCase().includes(q) }, toolbar: [seg.el], empty: empty(`No requests in ${m.window}`), columns: requestColumns(o) }), { part: "log" });
    tbl.on("select", (e) => rq.open(e.entities.request));
    c.add(card({ title: "Request log", desc: complete ? `${fmt.int(S.requests)} requests in ${m.window}` : `The latest ${fmt.int(S.requests)} requests`, body: [tbl.el, rq.el], flush: true, footer: complete ? null : h("span", {}, `Showing the latest ${fmt.int(rows.length)} requests, back to ${S.oldest == null ? "–" : fmt.time(S.oldest)}. Older requests in ${m.window} are not loaded.`) }));
    if (o.highlight?.request != null) { tbl.select(o.highlight.request); }
    return c;
  },
  load: (api) => api(`/api/stats/recent?limit=500`),
};

/* ---------------- Errors (routes/ErrorsRoute.tsx) ---------------- */
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, PREFIXED_RE = /\b(?:req|msg|call|toolu|chatcmpl|resp|run|gen)[-_][A-Za-z0-9_-]{6,}/g, HEX_RE = /\b[0-9a-f]{12,}\b/gi, NUM_RE = /(?<![\w.-])\d+(?:\.\d+)?/g;
/** Same normalization as view-models.ts errorSignature: ids, hex and numbers (not HTTP statuses) fold. */
export function errorSignature(msg) { if (!msg?.trim()) return "Unknown error"; const n = msg.replace(/\s+/g, " ").trim().replace(UUID_RE, "<id>").replace(PREFIXED_RE, "<id>").replace(HEX_RE, "<hex>").replace(NUM_RE, (x) => (/^[1-5]\d\d$/.test(x) ? x : "N")); return n.length > 180 ? n.slice(0, 179) + "…" : n; }
export function groupErrors(rows) {
  const g = new Map();
  for (const r of rows) { const s = errorSignature(r.errorMessage); if (!g.has(s)) g.set(s, { signature: s, count: 0, firstSeen: r.timestamp, lastSeen: r.timestamp, latest: r, by: new Map() }); const x = g.get(s); x.count++; if (r.timestamp < x.firstSeen) x.firstSeen = r.timestamp; if (r.timestamp > x.lastSeen) { x.lastSeen = r.timestamp; x.latest = r; } const k = modelKey(r.model, r.provider); x.by.set(k, { model: r.model, provider: r.provider, count: (x.by.get(k)?.count ?? 0) + 1 }); }
  return [...g.values()].map(({ by, ...x }) => ({ ...x, models: [...by.values()].sort((a, b) => b.count - a.count || a.model.localeCompare(b.model)) })).sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);
}
export const ErrorsView = {
  label: "Errors", route: "errors",
  /** data: MessageStats[] of failures (GET /api/stats/errors?range=&limit=). */
  make(rows, o = {}) {
    const m = meta(o), c = routeRoot("ErrorsView", { title: "Errors", desc: `Failed model requests in ${m.window}, grouped by error signature. Open a failure for its full payload.` }, o);
    const groups = groupErrors(rows), byModel = new Map(); for (const r of rows) { const k = modelKey(r.model, r.provider); byModel.set(k, { key: k, model: r.model, provider: r.provider, count: (byModel.get(k)?.count ?? 0) + 1 }); }
    const models = [...byModel.values()].sort((a, b) => b.count - a.count || a.model.localeCompare(b.model)), newest = rows.reduce((a, b) => (!a || b.timestamp > a.timestamp ? b : a), null);
    c.stats(StatGrid.make([
      { label: "Failures", value: fmt.int(rows.length), hint: `in ${m.window}` },
      { label: "Signatures", title: "Distinct error messages after normalizing ids and numbers", value: fmt.int(groups.length), hint: groups[0] ? `top: ${fmt.int(groups[0].count)} failures` : null },
      { label: "Affected models", value: fmt.int(models.length), hint: models[0]?.model ?? null },
      { label: "Last failure", value: newest ? fmt.ago(newest.timestamp, nowOf(o)) : "–", hint: newest ? fmt.time(newest.timestamp) : `none in ${m.window}` },
    ], { min: 170 }));
    if (!rows.length) return c.add(empty(`No failures in ${m.window}`, "Every request succeeded or was aborted."));
    const st = { sig: null, model: null };
    const rq = requestHost(c, o);
    const chips = h("div", { class: "sl-card-a" });
    const renderChips = () => chips.replaceChildren(...[st.sig ? h("button", { type: "button", class: "sl-btn sm chip", title: st.sig, onclick: () => { st.sig = null; sigT.clear(); apply(); } }, h("span", { class: "sl-mono" }, st.sig), "✕") : null, st.model ? h("button", { type: "button", class: "sl-btn sm chip", onclick: () => { st.model = null; apply(); } }, h("span", { class: "sl-mono" }, byModel.get(st.model).model), "✕") : null].filter(Boolean));
    const maxG = groups[0]?.count ?? 0;
    const sigT = c.adopt(Table.make(groups, { component: "ErrorSignatures", limit: 12, rowKey: (g) => g.signature, ids: (g) => ({ signature: g.signature, model: g.models[0]?.model, provider: g.models[0]?.provider, request: g.latest.id }), label: (g) => `error "${g.signature}": ${g.count} failures on ${g.models.map((x) => x.model).join(", ")}, last ${fmt.time(g.lastSeen)}`, pinnable: true,
      expanded: (g) => h("div", { class: "sl-detail" }, h("pre", { class: "sl-code bad" }, g.latest.errorMessage ?? "Unknown error"), h("div", { class: "sl-detail-meta" }, h("span", {}, `${fmt.int(g.count)} failures · first ${fmt.time(g.firstSeen)} · last ${fmt.time(g.lastSeen)}`), g.latest.id != null ? h("button", { type: "button", class: "sl-btn sm", onclick: (e) => { e.stopPropagation(); rq.open(g.latest.id); } }, "Open latest ↗") : null), h("div", { class: "sl-detail-tags" }, ...g.models.map((x) => badge(`${x.model} · ${x.provider} · ${fmt.compact(x.count)}`, "neutral", true)))),
      columns: [
        { key: "signature", header: "Signature", wrap: true, render: (g) => h("span", { class: "sl-sig", title: g.latest.errorMessage ?? null }, g.signature), sort: (g) => g.signature },
        { key: "models", header: "Models", render: (g) => labelCell(mono(g.models[0]?.model ?? "–"), g.models.length > 1 ? `+${g.models.length - 1} more` : g.models[0]?.provider), sort: (g) => g.models.length },
        { key: "last", header: "Last seen", render: (g) => h("span", { class: "sl-dim", title: fmt.time(g.lastSeen) }, fmt.ago(g.lastSeen, nowOf(o))), sort: (g) => g.lastSeen },
        { key: "count", header: "Failures", align: "right", width: 120, render: (g) => meterCell(g.count, maxG, fmt.int(g.count), "var(--sl-bad)"), sort: (g) => g.count },
      ] }), { part: "signatures" });
    sigT.on("select", (e) => { st.sig = e.entities.signature ?? null; apply(); });
    const bars = c.adopt(BarList.make(models.slice(0, 12).map((x) => ({ key: x.key, label: h("span", { class: "sl-lc" }, h("span", { class: "sl-mono sl-trunc" }, x.model), h("span", { class: "sl-dim sl-trunc" }, x.provider)), value: x.count, color: "color-mix(in srgb, var(--sl-bad) 60%, transparent)" })), { ids: (k) => ({ model: byModel.get(k).model, provider: byModel.get(k).provider }) }), { part: "byModel" });
    bars.on("select", (e) => { st.model = e.entities.model ? modelKey(e.entities.model, e.entities.provider) : null; apply(); });
    const fails = c.adopt(Table.make(rows, { component: "Failures", dense: true, limit: 50, initialSort: { key: "time", dir: "desc" }, rowKey: (r) => r.id ?? `${r.sessionFile}:${r.entryId}`, ids: requestIds, label: (r) => `failed request #${r.id} · ${r.model} · ${errorSignature(r.errorMessage)}`, pinnable: true,
      filter: (r) => (!st.sig || errorSignature(r.errorMessage) === st.sig) && (!st.model || modelKey(r.model, r.provider) === st.model),
      search: { placeholder: "Message, model or project", match: (r, q) => [r.model, r.provider, r.folder, r.errorMessage ?? ""].some((x) => x.toLowerCase().includes(q)) }, toolbar: [chips],
      columns: [
        { key: "time", header: "When", width: 120, render: (r) => h("span", { class: "sl-dim", title: fmt.time(r.timestamp) }, fmt.ago(r.timestamp, nowOf(o))), sort: (r) => r.timestamp },
        { key: "model", header: "Model", render: (r) => labelCell(mono(r.model), r.provider), sort: (r) => r.model },
        { key: "error", header: "Error", render: (r) => h("span", { class: "sl-errmsg", title: r.errorMessage ?? null }, r.errorMessage ?? "Unknown error"), sort: (r) => r.errorMessage ?? "" },
        { key: "project", header: "Project", render: (r) => mono(fmt.folder(r.folder), "dim"), sort: (r) => r.folder },
        { key: "tokens", header: "Tokens", align: "right", render: (r) => num(fmt.int(r.usage.totalTokens)), sort: (r) => r.usage.totalTokens },
        { key: "cost", header: "Cost", align: "right", render: (r) => num(msgCost(r, 4)), sort: (r) => r.usage.cost.total },
      ] }), { part: "failures" });
    fails.on("select", (e) => rq.open(e.entities.request));
    function apply() { renderChips(); fails.refresh(); c.spec.signature = st.sig; c.spec.model = st.model; c.emit("filter", { filter: { signature: st.sig, model: st.model }, label: [st.sig && `signature "${st.sig}"`, st.model && `model ${byModel.get(st.model)?.model}`].filter(Boolean).join(" + ") || "error filters cleared" }); }
    c.add(h("div", { class: "sl-cols" }, card({ title: "Error signatures", desc: "Same message with ids and counters normalized. Select one to filter the failures below.", body: sigT.el, flush: true }), card({ title: "By model", desc: "Failures per model. Select one to filter.", body: bars.el })), card({ title: "Failures", desc: `${fmt.int(rows.length)} failures, newest first`, body: [fails.el, rq.el], flush: true }));
    return c;
  },
  load: (api, range) => api(`/api/stats/errors?range=${range}&limit=200`),
};

/* ---------------- Tools (routes/ToolsRoute.tsx) ---------------- */
const ATTR = "Tokens and API-equivalent cost of each invoking turn, split evenly across that turn's tool calls";
export const ToolsView = {
  label: "Tools", route: "tools",
  /** data: ToolDashboardStats { byTool, byToolModel, series }. */
  make(d, o = {}) {
    const m = meta(o), c = routeRoot("ToolsView", { title: "Tools", desc: `Which tools were called in ${m.window}, how often they failed, and what they cost.` }, o);
    const byTool = d.byTool ?? [], pts = d.series ?? [];
    let calls = 0, tok = 0, cost = 0; for (const t of byTool) { calls += t.calls; tok += t.totalTokensShare; cost += t.costShare; }
    const rows = byTool.map((t) => ({ ...t, errorRate: t.calls ? t.errors / t.calls : 0, callFraction: calls ? t.calls / calls : 0, avgResultChars: t.calls ? t.resultChars / t.calls : 0 })).sort((a, b) => b.calls - a.calls);
    const colors = colorLookup(byTool.map((t) => ({ key: t.tool, weight: t.calls }))), buckets = bucketAxis(o.range ?? "7d", pts.map((p) => p.timestamp), m.bucket, nowOf(o));
    const callS = pivot(pts, { buckets, key: (p) => p.tool, value: (p) => p.calls, limit: 6, colors }).map((s) => ({ ...s, values: nulls(s.values) })), errS = pivot(pts, { buckets, key: (p) => p.tool, value: (p) => p.errors, limit: 6, colors }).map((s) => ({ ...s, values: nulls(s.values) }));
    const trends = new Map(pivot(pts, { buckets, key: (p) => p.tool, value: (p) => p.calls }).map((s) => [s.key, s.values]));
    const T = { errors: sum(byTool.map((t) => t.errors)), output: sum(byTool.map((t) => t.outputTokensShare)), unpriced: sum(byTool.map((t) => t.unpricedRequestsShare)), result: sum(byTool.map((t) => t.resultChars)), args: sum(byTool.map((t) => t.argsChars)) };
    c.stats(StatGrid.make([
      { label: "Tool calls", value: fmt.int(calls), hint: `${fmt.int(T.errors)} failed`, spark: densify(pts, buckets, (p) => p.calls) },
      { label: "Distinct tools", value: fmt.int(byTool.length), hint: rows[0] ? `Most used: ${rows[0].tool}` : null },
      { label: "Error rate", value: fmt.rate(calls ? T.errors / calls : 0), hint: `${fmt.int(calls - T.errors)} succeeded`, spark: densify(pts, buckets, (p) => p.errors), sparkColor: C.bad },
      { label: "Attributed tokens", title: ATTR, value: fmt.compact(Math.round(tok)), hint: `${fmt.compact(Math.round(T.output))} output` },
      { label: "Attributed cost", title: ATTR, value: fmt.estCost(cost, T.unpriced), hint: T.unpriced ? `${fmt.int(Math.round(T.unpriced))} unpriced requests` : "API-equivalent" },
    ], { min: 190 }), StatGrid.make([{ label: "Result text", value: `${fmt.compact(T.result)} chars` }, { label: "Call arguments", value: `${fmt.compact(T.args)} chars` }, { label: "Avg result per call", value: `${fmt.compact(calls ? Math.round(T.result / calls) : 0)} chars` }, { label: "Avg arguments per call", value: `${fmt.compact(calls ? Math.round(T.args / calls) : 0)} chars` }], { min: 150, size: "sm" }));
    if (!byTool.length) return c.add(empty("No tool calls in this range"));
    const slot = h("div", {}), ttl = h("span", {}, "Calls over time");
    let hidden = [];
    const draw = (metric) => { const ch = TimeChart.make({ buckets, bucketMs: m.bucket, series: metric === "calls" ? callS : errS }, { height: 260, hidden, formatTooltip: fmt.int, emptyLabel: metric === "errors" ? "No tool errors in this range" : undefined, legend: { values: (s) => fmt.compact(sum(s.values)) } }); ch.on("filter", () => (hidden = [...ch.hidden])); c.adopt(ch, { part: "overTime" }); slot.replaceChildren(ch.el); ttl.textContent = metric === "calls" ? "Calls over time" : "Errors over time"; c.spec.metric = metric; };
    const metric = c.adopt(Segmented.make([{ value: "calls", label: "Calls" }, { value: "errors", label: "Errors" }], { value: "calls", name: "metric", size: "sm", onChange: draw }), { part: "overTime" });
    draw("calls");
    const tool = { v: o.highlight?.tool ?? null };
    const tm = (r) => `${r.tool} · ${r.calls} calls · ${fmt.rate(r.errorRate)} errors`;
    const toolT = c.adopt(Table.make(rows, { component: "ToolTable", dense: true, limit: 20, initialSort: { key: "calls", dir: "desc" }, rowKey: (r) => r.tool, selected: tool.v, ids: (r) => ({ tool: r.tool }), label: (r) => `tool ${tm(r)}, ${fmt.compact(r.resultChars)} result chars, ${fmt.estCost(r.costShare, r.unpricedRequestsShare)} attributed`, pinnable: true, columns: [
      { key: "tool", header: "Tool", render: (r) => h("span", { class: "sl-lc" }, swatch(colors.get(r.tool) ?? OTHER), mono(r.tool)), sort: (r) => r.tool },
      { key: "trend", header: "Trend", render: (r) => { const v = trends.get(r.tool); return v && v.length > 1 ? Sparkline(v, colors.get(r.tool) ?? OTHER, 80) : h("span", { class: "sl-dim" }, "–"); } },
      { key: "calls", header: "Calls", align: "right", render: (r) => meterCell(r.calls, rows[0]?.calls ?? 0, fmt.int(r.calls)), sort: (r) => r.calls },
      { key: "errorRate", header: "Errors", align: "right", render: (r) => h("span", { title: `${fmt.int(r.errors)} failed` }, badge(fmt.rate(r.errorRate), r.errors ? errorRateTone(r.errorRate) : "neutral", true)), sort: (r) => r.errorRate },
      { key: "args", header: "Args", align: "right", render: (r) => num(fmt.compact(r.argsChars)), sort: (r) => r.argsChars },
      { key: "result", header: "Result", align: "right", render: (r) => num(fmt.compact(r.resultChars)), sort: (r) => r.resultChars },
      { key: "avgResult", header: "Result / call", align: "right", render: (r) => num(fmt.compact(Math.round(r.avgResultChars))), sort: (r) => r.avgResultChars },
      { key: "tokens", header: "Attr. tokens", align: "right", render: (r) => num(fmt.compact(Math.round(r.totalTokensShare))), sort: (r) => r.totalTokensShare },
      { key: "cost", header: "Attr. cost", align: "right", render: (r) => num(fmt.estCost(r.costShare, r.unpricedRequestsShare)), sort: (r) => r.costShare },
      { key: "lastUsed", header: "Last used", align: "right", render: (r) => h("span", { class: "sl-dim" }, fmt.ago(r.lastUsed, nowOf(o))), sort: (r) => r.lastUsed },
    ] }), { part: "byTool" });
    const sel = h("select", { class: "sl-select", "aria-label": "Filter by tool", onchange: (e) => setTool(e.target.value || null, true) }, h("option", { value: "" }, "All tools"), ...rows.map((r) => r.tool).sort().map((t) => h("option", { value: t }, t)));
    const tmT = c.adopt(Table.make(d.byToolModel ?? [], { component: "ToolModelTable", dense: true, limit: 25, initialSort: { key: "calls", dir: "desc" }, rowKey: (r) => `${r.tool}::${r.model}::${r.provider}`, ids: (r) => ({ tool: r.tool, model: r.model, provider: r.provider }), label: (r) => `${r.tool} on ${r.model}: ${r.calls} calls, ${r.errors} failed`, filter: (r) => !tool.v || r.tool === tool.v, columns: [
      { key: "tool", header: "Tool", render: (r) => h("span", { class: "sl-lc" }, swatch(colors.get(r.tool) ?? OTHER), mono(r.tool)), sort: (r) => r.tool },
      { key: "model", header: "Model", render: (r) => labelCell(mono(r.model), r.provider), sort: (r) => r.model },
      { key: "calls", header: "Calls", align: "right", render: (r) => num(fmt.int(r.calls)), sort: (r) => r.calls },
      { key: "errorRate", header: "Errors", align: "right", render: (r) => badge(fmt.rate(r.calls ? r.errors / r.calls : 0), r.errors ? errorRateTone(r.errors / r.calls) : "neutral", true), sort: (r) => (r.calls ? r.errors / r.calls : 0) },
      { key: "result", header: "Result", align: "right", render: (r) => num(fmt.compact(r.resultChars)), sort: (r) => r.resultChars },
      { key: "tokens", header: "Attr. tokens", align: "right", render: (r) => num(fmt.compact(Math.round(r.totalTokensShare))), sort: (r) => r.totalTokensShare },
      { key: "cost", header: "Attr. cost", align: "right", render: (r) => num(fmt.estCost(r.costShare, r.unpricedRequestsShare)), sort: (r) => r.costShare },
      { key: "lastUsed", header: "Last used", align: "right", render: (r) => h("span", { class: "sl-dim" }, fmt.ago(r.lastUsed, nowOf(o))), sort: (r) => r.lastUsed },
    ] }), { part: "byToolModel" });
    function setTool(t, fromSelect) { tool.v = t; sel.value = t ?? ""; c.spec.tool = t; tmT.refresh(); if (fromSelect) c.emit("filter", { ids: { tool: t ?? undefined }, filter: { tool: t }, label: t ? `tool = ${t}` : "tool filter cleared" }); }
    toolT.on("select", (e) => setTool(e.entities.tool ?? null));
    if (tool.v) setTool(tool.v);
    c.add(card({ title: ttl, desc: `Per ${bucketWord(m.bucket)}, top 6 tools stacked`, actions: metric.el, body: slot }), card({ title: "By tool", desc: `${ATTR}. Select a tool to break it down by model.`, body: toolT.el, flush: true }), card({ title: "By tool and model", desc: "Which models call which tools, and how often those calls fail", actions: [sel], body: tmT.el, flush: true }));
    return c;
  },
  load: (api, range) => api(`/api/stats/tools?range=${range}`),
};

/* ---------------- Projects (routes/ProjectsRoute.tsx) ---------------- */
const TEMP_RE = /^\/?-?(?:private-)?(?:tmp|var-folders)(?:[-/]|$)/;
export const ProjectsView = {
  label: "Projects", route: "projects",
  /** data: FolderStats[] (GET /api/stats/folders). */
  make(folders, o = {}) {
    const m = meta(o), c = routeRoot("ProjectsView", { title: "Projects", desc: `Usage by session folder in ${m.window}.` }, o);
    let tot = { req: 0, fail: 0, cost: 0, unpriced: 0, tok: 0, inp: 0, cr: 0 };
    for (const f of folders) { tot.req += f.totalRequests; tot.fail += f.failedRequests; tot.cost += f.totalCost; tot.unpriced += f.unpricedRequests; tot.tok += conv(f); tot.inp += f.totalInputTokens; tot.cr += f.totalCacheReadTokens; }
    const rows = folders.map((f) => ({ ...f, conversationTokens: conv(f), requestShare: tot.req ? f.totalRequests / tot.req : 0, costShare: tot.cost ? f.totalCost / tot.cost : 0, temporary: TEMP_RE.test(f.folder) }));
    const tempN = rows.filter((r) => r.temporary).length;
    c.stats(StatGrid.make([
      { label: "Folders", value: fmt.int(rows.length), hint: tempN ? `${tempN} temporary` : null },
      { label: "Requests", value: fmt.int(tot.req), hint: `${fmt.int(tot.fail)} failed` },
      { label: "API-equivalent cost", value: fmt.estCost(tot.cost, tot.unpriced), hint: tot.unpriced ? `${fmt.int(tot.unpriced)} unpriced` : null },
      { label: "Conversation tokens", value: fmt.compact(tot.tok) },
      { label: "Cache rate", title: "Cache reads ÷ (uncached input + cache reads), across every folder", value: fmt.pct(tot.inp + tot.cr ? tot.cr / (tot.inp + tot.cr) : 0) },
    ], { min: 170 }));
    if (!rows.length) return c.add(empty("No project folders in this range"));
    const colors = colorLookup(rows.map((r) => ({ key: r.folder, weight: r.totalRequests })));
    const fid = (k) => ({ folder: k });
    const byCost = c.adopt(BarList.make([...rows].sort((a, b) => b.totalCost - a.totalCost).slice(0, 8).map((r) => ({ key: r.folder, label: h("span", { class: "sl-mono" }, fmt.folder(r.folder)), value: r.totalCost, display: `${fmt.estCost(r.totalCost, r.unpricedRequests)} · ${fmt.pct(r.costShare, 0)}`, color: colors.get(r.folder) })), { ids: fid }), { part: "topByCost" });
    const byReq = c.adopt(BarList.make([...rows].sort((a, b) => b.totalRequests - a.totalRequests).slice(0, 8).map((r) => ({ key: r.folder, label: h("span", { class: "sl-mono" }, fmt.folder(r.folder)), value: r.totalRequests, display: `${fmt.int(r.totalRequests)} · ${fmt.pct(r.requestShare, 0)}`, color: colors.get(r.folder) })), { ids: fid }), { part: "topByRequests" });
    let showTemp = false;
    const maxR = Math.max(...rows.map((r) => r.totalRequests)), maxC = Math.max(...rows.map((r) => r.totalCost));
    const tbl = c.adopt(Table.make(rows, { component: "FolderTable", limit: 25, initialSort: { key: "requests", dir: "desc" }, rowKey: (r) => r.folder, ids: fid, label: (r) => `project ${fmt.folder(r.folder)}: ${fmt.int(r.totalRequests)} requests, ${fmt.estCost(r.totalCost, r.unpricedRequests)}`, pinnable: true, filter: (r) => showTemp || !r.temporary, search: { placeholder: "Filter folders", match: (r, q) => r.folder.toLowerCase().includes(q) },
      toolbar: tempN ? [h("label", { class: "sl-check", title: "Session folders under /tmp or /var/folders" }, h("input", { type: "checkbox", onchange: (e) => { showTemp = e.target.checked; tbl.refresh(); c.emit("filter", { filter: { temporary: showTemp }, label: `temporary folders ${showTemp ? "shown" : "hidden"}` }); } }), `Include temporary (${tempN})`)] : [],
      columns: [
        { key: "folder", header: "Folder", render: (r) => h("span", { class: "sl-lc" }, swatch(colors.get(r.folder) ?? OTHER), mono(fmt.folder(r.folder))), sort: (r) => r.folder },
        { key: "requests", header: "Requests", align: "right", render: (r) => meterCell(r.totalRequests, maxR, fmt.int(r.totalRequests), colors.get(r.folder)), sort: (r) => r.totalRequests },
        { key: "cost", header: "Cost", align: "right", render: (r) => meterCell(r.totalCost, maxC, fmt.estCost(r.totalCost, r.unpricedRequests), colors.get(r.folder)), sort: (r) => r.totalCost },
        { key: "tokens", header: "Tokens", align: "right", render: (r) => h("span", { class: "sl-num", title: fmt.int(r.conversationTokens) }, fmt.compact(r.conversationTokens)), sort: (r) => r.conversationTokens },
        { key: "cache", header: "Cache rate", align: "right", render: (r) => num(fmt.pct(r.cacheRate)), sort: (r) => r.cacheRate },
        { key: "errors", header: "Errors", align: "right", render: (r) => (r.failedRequests ? badge(fmt.rate(r.errorRate), errorRateTone(r.errorRate), true) : h("span", { class: "sl-num sl-dim" }, "–")), sort: (r) => r.errorRate },
        { key: "last", header: "Last active", align: "right", render: (r) => h("span", { class: "sl-dim" }, fmt.ago(r.lastTimestamp, nowOf(o))), sort: (r) => r.lastTimestamp },
      ] }), { part: "folders" });
    c.add(h("div", { class: "sl-cols even" }, card({ title: "Top by cost", desc: "Share of API-equivalent cost", body: byCost.el }), card({ title: "Top by requests", desc: "Share of all requests", body: byReq.el })), card({ title: "Folders", desc: `${fmt.int(rows.length)} folders`, body: tbl.el, flush: true }));
    return c;
  },
  load: (api, range) => api(`/api/stats/folders?range=${range}`),
};

/* ---------------- Gain (routes/GainRoute.tsx) ---------------- */
export const GainView = {
  label: "Gain", route: "gain",
  /** data: GainDashboardStats { overall, bySource, timeSeries [{date, snapcompact}], project, projects }. opts.onProject(p) reloads. */
  make(d, o = {}) {
    const m = meta(o), scope = d.project ? ` for ${d.project}` : "";
    const sel = (d.projects ?? []).length ? h("select", { class: "sl-select", "aria-label": "Project", onchange: (e) => { const p = e.target.value || null; c.emit("filter", { ids: { folder: p ?? undefined }, filter: { project: p }, label: p ? `project ${p}` : "all projects" }); o.onProject?.(p); } }, h("option", { value: "" }, "All projects"), ...d.projects.map((p) => h("option", { value: p, selected: p === d.project }, p))) : null;
    const c = routeRoot("GainView", { title: "Gain", desc: `Tokens snapcompact kept out of context${scope} in ${m.window}.`, actions: sel }, o);
    const ov = d.overall;
    if (!ov?.savedTokens && !ov?.hits) return c.add(empty(`No savings recorded${scope} in ${m.window}`, "Gain counts tokens that snapcompact kept out of context; this source recorded none in range."));
    c.stats(StatGrid.make([{ label: "Saved tokens", value: fmt.compact(ov.savedTokens) }, { label: "Saved bytes", value: fmt.bytes(ov.savedBytes) }, { label: "Reduction", title: "Saved bytes ÷ original bytes, when the original size is known", value: ov.reductionPercent == null ? "–" : `${ov.reductionPercent.toFixed(1)}%` }, { label: "Hits", value: fmt.int(ov.hits) }, { label: "Saved per hit", value: ov.hits ? fmt.compact(Math.round(ov.savedTokens / ov.hits)) : "–" }], { min: 160 }));
    const pts = (d.timeSeries ?? []).map((p) => ({ ...p, timestamp: Date.parse(`${p.date}T00:00:00Z`) })), buckets = bucketAxis(o.range ?? "7d", pts.map((p) => p.timestamp), DAY, nowOf(o));
    const daily = densify(pts, buckets, (p) => p.snapcompact); let run = 0; const cum = daily.map((v) => (run += v));
    const ch = c.adopt(TimeChart.make({ buckets, bucketMs: DAY, series: [{ key: "daily", label: "Saved per day", color: C.primary, values: daily }, { key: "cumulative", label: "Cumulative", color: C.secondary, kind: "line", axis: "right", values: cum }] }, { utc: true, height: 240, stacked: false, legend: true }), { part: "savings" });
    const src = Object.entries(d.bySource ?? {}).map(([source, v]) => ({ source, ...v, share: ov.savedTokens ? v.savedTokens / ov.savedTokens : 0 }));
    const tbl = c.adopt(Table.make(src, { component: "GainSources", rowKey: (r) => r.source, ids: (r) => ({ key: r.source }), label: (r) => `source ${r.source}: ${fmt.compact(r.savedTokens)} tokens saved`, columns: [{ key: "source", header: "Source", render: (r) => mono(r.source) }, { key: "saved", header: "Saved tokens", align: "right", render: (r) => meterCell(r.savedTokens, ov.savedTokens, fmt.compact(r.savedTokens)), sort: (r) => r.savedTokens }, { key: "share", header: "Share", align: "right", render: (r) => num(fmt.pct(r.share)) }, { key: "hits", header: "Hits", align: "right", render: (r) => num(fmt.int(r.hits)), sort: (r) => r.hits }, { key: "bytes", header: "Saved bytes", align: "right", render: (r) => num(fmt.bytes(r.savedBytes)), sort: (r) => r.savedBytes }] }), { part: "bySource" });
    c.add(card({ title: "Savings over time", desc: "Tokens saved per UTC day, with the running total", body: ch.el }), card({ title: "By source", desc: "Savings per subsystem", body: tbl.el, flush: true }));
    return c;
  },
  load: (api, range) => api(`/api/stats/gain?range=${range}`),
};

/* ---------------- Frustration (routes/FrustrationRoute.tsx) ---------------- */
const MIN_MESSAGES = 50, MIN_JUDGED = 0.5;
const FR_LAYERS = [{ key: "angry", label: "Angry at assistant", alpha: 1 }, { key: "assistant", label: "At assistant, not angry", alpha: 0.62 }, { key: "other", label: "Annoyed at other targets", alpha: 0.3 }];
const layerCount = (r, k) => (k === "angry" ? r.angry : k === "assistant" ? r.atAssistant - r.angry : r.annoyed - r.atAssistant);
const mostlyRegex = (r) => r.messages > 0 && r.judged / r.messages < MIN_JUDGED;
const familyKey = (r) => `${r.modelClass}::${r.family ?? "unclassified"}`;
export const FrustrationView = {
  label: "Frustration", route: "frustration",
  /** data: FrustrationDashboardStats { overall, byModel, judgeAvailable, job }. opts.estimate(range) / opts.judge(range) / opts.cancel() drive the judge when the host has one. */
  make(d, o = {}) {
    const m = meta(o), c = routeRoot("FrustrationView", { title: "Frustration", desc: `How often your messages sound annoyed, per model version, in ${m.window}.` }, o);
    const ov = d.overall, pct = (x) => (ov.messages ? fmt.pct(x / ov.messages) : "–");
    c.stats(StatGrid.make([{ label: "User messages", value: fmt.int(ov.messages) }, { label: "Judge coverage", title: "Messages with a cached judge verdict; the rest use regex signals", value: pct(ov.judged), hint: `${fmt.int(ov.judged)} judged` }, { label: "Annoyed", value: pct(ov.annoyed), hint: `${fmt.int(ov.annoyed)} messages` }, { label: "At assistant", value: pct(ov.atAssistant), hint: `${fmt.int(ov.atAssistant)} messages` }, { label: "Angry", value: pct(ov.angry), hint: `${fmt.int(ov.angry)} messages`, tone: ov.angry ? "bad" : null }], { min: 160 }));
    // judge panel + estimate modal
    const avail = d.judgeAvailable && !!o.estimate, running = d.job?.state === "running";
    const hint = "Judging needs the omp host process: open the dashboard with omp stats and configure a judge model. Until then messages are classified by regex signals.";
    const openEstimate = () => {
      const body = h("div", { class: "sl-stack" }, h("p", { class: "sl-dim" }, "Quoting…"));
      const md = Modal.make({ title: "Classify with judge", body, primary: { label: "Proceed", disabled: true, onClick: () => { Promise.resolve(o.judge?.(o.range)).then(() => md.close()); } } });
      c.adopt(md, { part: "judge" }); md.open();
      Promise.resolve(o.estimate(o.range)).then((q) => { body.replaceChildren(keyValues([["Messages to judge", fmt.int(q.messages ?? 0)], ["Judge model", mono(q.judge ?? "–")], ["Estimated cost", fmt.cost(q.cost ?? 0, 4)]])); md.setPrimary({ disabled: !q.available || !q.messages }); }).catch((e) => body.replaceChildren(h("p", { class: "bad" }, String(e?.message ?? e))));
    };
    const job = d.job ?? { state: "idle" };
    c.add(card({ title: ["Judge classification ", badge(running ? `Running ${job.done}/${job.total}` : avail ? "Ready" : "Unavailable", running ? "info" : avail ? "ok" : "neutral")], desc: "Cached LLM verdicts replace the regex heuristics; unjudged messages fall back to regex signals.", actions: [h("button", { type: "button", class: "sl-btn sm primary", disabled: !avail || running, title: !avail ? hint : running ? "A judge run is in progress" : "Quote the cost of judging every unjudged message in range", onclick: openEstimate }, "✦ Classify with judge")], body: h("div", { class: "sl-judge" }, running ? [h("span", {}, `${fmt.int(job.done)} of ${fmt.int(job.total)} judged`), h("button", { type: "button", class: "sl-btn sm", onclick: () => o.cancel?.() }, "Cancel")] : job.finishedAt ? `Last run judged ${fmt.int(job.done)} messages (${fmt.int(job.failed)} failed), ${fmt.cost(job.cost ?? 0, 4)}` : avail ? "No judge run yet." : hint) }));
    const models = d.byModel ?? [];
    if (!models.length) return c.add(card({ title: "Frustration by model version", body: empty("No user messages in this range", "Try a longer range.") }));
    // family colors in order of appearance
    const fam = new Map(); for (const r of models) if (!fam.has(familyKey(r))) fam.set(familyKey(r), SERIES[fam.size % SERIES.length]);
    const classes = new Map(); for (const r of models) classes.set(r.modelClass, (classes.get(r.modelClass) ?? 0) + r.messages);
    const st = { cls: [...classes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "*", hidden: new Set(), small: false, regex: false, sel: null };
    const bars = h("div", { class: "sl-fr-bars" }), legendSlot = h("div", {}), tableSlot = h("div", {});
    const inClass = () => (st.cls === "*" ? models : models.filter((r) => r.modelClass === st.cls));
    const visible = () => inClass().filter((r) => !st.hidden.has(familyKey(r))).filter((r) => (st.small || r.messages >= MIN_MESSAGES) && !(st.regex && mostlyRegex(r)));
    const idsOf = (r) => ({ model: r.models?.[0] ?? r.key, key: r.key });
    const smallL = h("span", {}), regexL = h("span", {});
    function render() {
      const fams = new Map(); for (const r of inClass()) { const k = familyKey(r); fams.set(k, { key: k, label: st.cls === "*" ? `${r.modelClass} · ${r.family ?? "unclassified"}` : r.family ?? "unclassified", messages: (fams.get(k)?.messages ?? 0) + r.messages }); }
      const lg = Legend.make([...fams.values()].map((f) => ({ key: f.key, label: f.label, color: fam.get(f.key), value: fmt.int(f.messages) })), { toggle: true, hidden: st.hidden, onToggle: (hs) => { st.hidden = new Set(hs); render(); } });
      c.adopt(lg, { part: "families" }); legendSlot.replaceChildren(lg.el);
      const pre = inClass().filter((r) => !st.hidden.has(familyKey(r)));
      smallL.textContent = `Include < ${MIN_MESSAGES} messages (${pre.filter((r) => r.messages < MIN_MESSAGES).length})`; regexL.textContent = `Hide mostly regex (${pre.filter(mostlyRegex).length})`;
      const rows = visible(), max = Math.max(0.0001, ...rows.map((r) => (r.messages ? r.annoyed / r.messages : 0)));
      bars.replaceChildren(...(rows.length ? rows.map((r) => { let x = 0; const segs = FR_LAYERS.map((L) => { const w = r.messages ? layerCount(r, L.key) / r.messages / max : 0; const s = h("i", { class: mostlyRegex(r) ? "regex" : "", style: { left: `${x * 100}%`, width: `${Math.max(0, w) * 100}%`, background: fam.get(familyKey(r)), opacity: L.alpha }, title: `${L.label}: ${fmt.pct(r.messages ? layerCount(r, L.key) / r.messages : 0)}` }); x += Math.max(0, w); return s; }); return h("button", { type: "button", class: "sl-fr-row", "aria-pressed": st.sel === r.key ? "true" : "false", onclick: () => { st.sel = st.sel === r.key ? null : r.key; render(); c.emit("select", st.sel ? { ids: idsOf(r), label: `${r.label}: ${fmt.pct(r.annoyed / Math.max(1, r.messages))} annoyed (${r.annoyed}/${r.messages}), ${r.angry} angry${mostlyRegex(r) ? ", mostly regex" : ""}` } : { ids: {}, label: "cleared" }); } }, h("span", { class: "sl-trunc", title: r.key }, r.label), h("span", { class: "sl-fr-track" }, ...segs), h("span", { class: "sl-num", style: { textAlign: "right" } }, fmt.pct(r.messages ? r.annoyed / r.messages : 0))); }) : [empty("No model versions match the filters")]));
      const t = Table.make(rows, { component: "FrustrationTable", dense: true, rowKey: (r) => r.key, selected: st.sel, ids: idsOf, label: (r) => `${r.label}: ${r.messages} messages, ${fmt.pct(r.annoyed / Math.max(1, r.messages))} annoyed`, pinnable: true, initialSort: { key: "messages", dir: "desc" }, empty: empty("No model versions match the filters"), columns: [
        { key: "model", header: "Model version", render: (r) => h("span", { class: "sl-lc", title: r.key }, swatch(fam.get(familyKey(r))), r.label, mostlyRegex(r) ? badge("regex", "warn") : null), sort: (r) => r.label },
        { key: "messages", header: "Messages", align: "right", render: (r) => num(fmt.int(r.messages)), sort: (r) => r.messages },
        { key: "judged", header: "Judged", align: "right", render: (r) => num(fmt.pct(r.messages ? r.judged / r.messages : 0, 0)), sort: (r) => (r.messages ? r.judged / r.messages : 0) },
        { key: "annoyed", header: "Annoyed", align: "right", render: (r) => h("span", { class: "sl-num", title: `${fmt.int(r.annoyed)} messages` }, fmt.pct(r.messages ? r.annoyed / r.messages : 0)), sort: (r) => (r.messages ? r.annoyed / r.messages : 0) },
        { key: "assistant", header: "At assistant", align: "right", render: (r) => h("span", { class: "sl-num", title: `${fmt.int(r.atAssistant)} messages` }, fmt.pct(r.messages ? r.atAssistant / r.messages : 0)), sort: (r) => (r.messages ? r.atAssistant / r.messages : 0) },
        { key: "angry", header: "Angry", align: "right", render: (r) => h("span", { class: r.angry ? "sl-num tone-bad" : "sl-num", title: `${fmt.int(r.angry)} messages` }, fmt.pct(r.messages ? r.angry / r.messages : 0)), sort: (r) => (r.messages ? r.angry / r.messages : 0) },
        { key: "first", header: "First seen", align: "right", render: (r) => h("span", { class: "sl-dim" }, fmt.day(r.firstSeen)), sort: (r) => r.firstSeen },
      ] });
      c.adopt(t, { part: "table" }); tableSlot.replaceChildren(t.el);
      Object.assign(c.spec, { modelClass: st.cls, hidden: [...st.hidden], includeSmall: st.small, hideRegex: st.regex, selected: st.sel });
    }
    const cls = c.adopt(Segmented.make([{ value: "*", label: "All", title: "Every model class" }, ...[...classes].map(([k, n]) => ({ value: k, label: k, title: `${fmt.int(n)} messages` }))], { value: st.cls, name: "modelClass", size: "sm", label: "Model class", onChange: (v) => { st.cls = v; render(); } }), { part: "class" });
    const chk = (label, key) => h("label", { class: "sl-check" }, h("input", { type: "checkbox", onchange: (e) => { st[key] = e.target.checked; render(); c.emit("filter", { filter: { [key === "small" ? "includeSmall" : "hideRegex"]: e.target.checked }, label: `${label.textContent} ${e.target.checked ? "on" : "off"}` }); } }), label);
    const key = h("div", { class: "sl-fr-key" }, ...FR_LAYERS.map((L) => h("span", {}, h("i", { style: { background: "var(--sl-c1)", opacity: L.alpha } }), L.label)), h("span", {}, h("i", { class: "", style: { background: "repeating-linear-gradient(45deg, var(--sl-c1) 0 2px, transparent 2px 5px)" } }), "Mostly regex (under 50% judged)"));
    render();
    c.add(card({ title: "Frustration by model version", desc: "Share of user messages per model version. Each bar reaches the annoyed rate; the subsets aimed at the assistant stack inside it.", actions: [cls.el], body: h("div", { class: "sl-stack" }, legendSlot, h("div", { class: "sl-tv-bar" }, chk(smallL, "small"), chk(regexL, "regex")), key, bars) }), card({ title: "Model versions", desc: "Rates are shares of user messages; rows follow the chart filters.", body: tableSlot, flush: true }));
    return c;
  },
  load: (api, range) => api(`/api/stats/frustration?range=${range}`),
};

/* ---------------- Providers (routes/ProvidersRoute.tsx) ---------------- */
const P_MIX = [{ key: "totalInputTokens", label: "Uncached input", color: "#5b8cff" }, { key: "totalCacheReadTokens", label: "Cache read", color: C.primary }, { key: "totalCacheWriteTokens", label: "Cache write", color: "#f5b54a" }, { key: "totalOutputTokens", label: "Output", color: C.secondary }];
const UTIL_STEPS = [5 * 60_000, 15 * 60_000, 3_600_000, 3 * 3_600_000, 6 * 3_600_000, DAY];
export const ProvidersView = {
  label: "Providers", route: "providers",
  /** data: { stats: ProviderDashboardStats, windows: ProviderWindowStats, accounts?: ProviderWindowStats for one provider }. opts.windows(provider) loads that provider's per-account series. */
  make({ stats, windows, accounts }, o = {}) {
    const m = meta(o), c = routeRoot("ProvidersView", { title: "Providers", desc: `Burn, reliability and subscription headroom per provider over ${m.window}.` }, o);
    const providers = stats?.providers ?? [], pts = stats?.series ?? [];
    const colors = colorLookup(providers.map((p) => ({ key: p.provider, weight: p.totalTokens }))), buckets = bucketAxis(o.range ?? "7d", pts.map((p) => p.timestamp), m.bucket, nowOf(o));
    const T = { req: sum(providers.map((p) => p.totalRequests)), fail: sum(providers.map((p) => p.failedRequests)), tok: sum(providers.map((p) => p.totalTokens)), cost: sum(providers.map((p) => p.totalCost)), unpriced: sum(providers.map((p) => p.unpricedRequests)) };
    const top = providers.reduce((a, b) => (!a || b.totalTokens > a.totalTokens ? b : a), null);
    c.stats(StatGrid.make([{ label: "Providers", value: fmt.int(providers.length), hint: top ? `most tokens: ${top.provider}` : null }, { label: "Requests", value: fmt.int(T.req), hint: `${fmt.int(T.fail)} failed`, spark: densify(pts, buckets, (p) => p.requests) }, { label: "Tokens", value: fmt.compact(T.tok), spark: densify(pts, buckets, (p) => p.totalTokens) }, { label: "API-equivalent cost", value: fmt.estCost(T.cost, T.unpriced), hint: T.unpriced ? `${fmt.int(T.unpriced)} unpriced` : null, spark: densify(pts, buckets, (p) => p.cost), sparkColor: C.secondary }, { label: "Error rate", value: fmt.rate(T.req ? T.fail / T.req : 0) }], { min: 170 }));
    if (!providers.length) return c.add(empty("No requests in this range"));
    const maxR = Math.max(...providers.map((p) => p.totalRequests)), maxT = Math.max(...providers.map((p) => p.totalTokens));
    const totals = c.adopt(Table.make(providers, { component: "ProviderTotals", rowKey: (p) => p.provider, initialSort: { key: "tokens", dir: "desc" }, ids: (p) => ({ provider: p.provider }), label: (p) => `provider ${p.provider}: ${fmt.int(p.totalRequests)} requests, ${fmt.compact(p.totalTokens)} tokens, ${fmt.estCost(p.totalCost, p.unpricedRequests)}`, pinnable: true,
      expanded: (p) => { const tot = sum(P_MIX.map((x) => p[x.key])); return h("div", { class: "sl-stack" }, ShareBar.make(P_MIX.map((x) => ({ key: x.key, label: x.label, value: p[x.key], color: x.color }))).el, Legend.make(P_MIX.map((x) => ({ key: x.key, label: x.label, color: x.color, value: `${fmt.compact(p[x.key])} · ${tot ? fmt.pct(p[x.key] / tot, 0) : "–"}` }))).el); },
      columns: [
        { key: "provider", header: "Provider", render: (p) => h("span", { class: "sl-lc" }, swatch(colors.get(p.provider) ?? OTHER), mono(p.provider)), sort: (p) => p.provider },
        { key: "requests", header: "Requests", align: "right", render: (p) => meterCell(p.totalRequests, maxR, fmt.int(p.totalRequests)), sort: (p) => p.totalRequests },
        { key: "errors", header: "Error rate", align: "right", render: (p) => { const r = p.totalRequests ? p.failedRequests / p.totalRequests : 0; return badge(fmt.rate(r), p.failedRequests ? errorRateTone(r) : "neutral", true); }, sort: (p) => (p.totalRequests ? p.failedRequests / p.totalRequests : 0) },
        { key: "models", header: "Models", align: "right", render: (p) => num(fmt.int(p.models)), sort: (p) => p.models },
        { key: "tokens", header: "Tokens", align: "right", render: (p) => meterCell(p.totalTokens, maxT, fmt.compact(p.totalTokens), colors.get(p.provider)), sort: (p) => p.totalTokens },
        { key: "share", header: "Share", align: "right", render: (p) => h("span", { class: "sl-num sl-dim" }, fmt.pct(T.tok ? p.totalTokens / T.tok : 0)), sort: (p) => p.totalTokens },
        { key: "cost", header: "Cost", align: "right", render: (p) => h("span", { class: "sl-num", title: p.unpricedRequests ? `${fmt.int(p.unpricedRequests)} unpriced` : null }, fmt.estCost(p.totalCost, p.unpricedRequests)), sort: (p) => p.totalCost },
        { key: "tps", header: "Tokens/s", align: "right", render: (p) => num(fmt.tps(p.avgTokensPerSecond)), sort: (p) => p.avgTokensPerSecond ?? -1 },
        { key: "premium", header: "Premium", align: "right", render: (p) => num(fmt.int(Math.round(p.totalPremiumRequests * 100) / 100)), sort: (p) => p.totalPremiumRequests },
      ] }), { part: "totals" });
    // burn by provider
    const burn = h("div", {});
    const series = (metric) => pivot(pts, { buckets, key: (p) => p.provider, value: metric === "tokens" ? (p) => p.totalTokens : metric === "cost" ? (p) => p.cost : (p) => p.requests, limit: 6, colors }).map((s) => ({ ...s, values: nulls(s.values) }));
    const drawBurn = (metric) => { const f = metric === "cost" ? (v) => fmt.cost(v, 0) : fmt.compact; const ch = TimeChart.make({ buckets, bucketMs: m.bucket, series: series(metric) }, { height: 260, format: f, formatTooltip: metric === "cost" ? (v) => fmt.cost(v) : fmt.int, emptyLabel: "No provider activity in this range", legend: { values: (s) => f(sum(s.values)) } }); c.adopt(ch, { part: "burn" }); burn.replaceChildren(ch.el); c.spec.burn = metric; };
    const burnSeg = c.adopt(Segmented.make([{ value: "tokens", label: "Tokens" }, { value: "cost", label: "Cost", title: "API-equivalent estimate" }, { value: "requests", label: "Requests" }], { value: "tokens", name: "burn", size: "sm", onChange: drawBurn }), { part: "burn" });
    drawBurn("tokens");
    // peak burn hours (local hour of day)
    const peakSlot = h("div", {}), peakDesc = h("span", {}, "Tokens by local hour of day");
    const drawPeak = (prov) => {
      const tok = Array(24).fill(0), out = Array(24).fill(0), req = Array(24).fill(0);
      for (const p of stats.hourly ?? []) { if (prov && p.provider !== prov) continue; tok[p.hour] += p.totalTokens; out[p.hour] += p.outputTokens; req[p.hour] += p.requests; }
      let peak = 0; for (let i = 1; i < 24; i++) if (tok[i] > tok[peak]) peak = i;
      const has = tok[peak] > 0, hl = (x) => `${String(x).padStart(2, "0")}:00`;
      peakDesc.textContent = has ? `Tokens by local hour of day; peak at ${hl(peak)}` : "Tokens by local hour of day";
      const ch = Chart.make({ slots: 24, series: [{ key: "tokens", label: "Tokens", color: "color-mix(in srgb, var(--sl-c1) 55%, transparent)", values: tok.map((v, i) => (has && i === peak ? null : v)) }, { key: "peak", label: "Tokens (peak hour)", color: C.primary, values: tok.map((v, i) => (has && i === peak ? v : null)) }] }, { component: "PeakHours", height: 220, tickLabel: (i) => String(i).padStart(2, "0"), tooltipTitle: (i) => `${hl(i)}–${hl((i + 1) % 24)}`, slotIds: (i) => ({ ids: { provider: prov ?? undefined, key: `hour:${i}` }, label: `hour ${hl(i)}${prov ? ` · ${prov}` : ""}: ${fmt.compact(tok[i])} tokens, ${fmt.int(req[i])} requests` }), tooltipExtra: (i) => h("div", {}, h("div", { class: "sl-tip-r" }, h("span", { class: "sl-tip-l" }, "Output"), h("span", { class: "sl-tip-v" }, fmt.compact(out[i]))), h("div", { class: "sl-tip-r" }, h("span", { class: "sl-tip-l" }, "Requests"), h("span", { class: "sl-tip-v" }, fmt.int(req[i])))) });
      c.adopt(ch, { part: "peakHours" }); peakSlot.replaceChildren(ch.el);
    };
    const peakSel = h("select", { class: "sl-select", "aria-label": "Provider", onchange: (e) => { drawPeak(e.target.value || null); c.emit("filter", { ids: { provider: e.target.value || undefined }, filter: { peakProvider: e.target.value || null }, label: `peak hours: ${e.target.value || "all providers"}` }); } }, h("option", { value: "" }, "All providers"), ...providers.map((p) => h("option", { value: p.provider }, p.provider)));
    drawPeak(null);
    // subscription windows
    const ins = windows?.windowInsights ?? [];
    const util = h("div", {}), utilDesc = h("span", {}, "Recorded limit utilization per account");
    let acc = accounts ?? null;
    const winIds = (w) => ({ provider: w.provider, window: w.windowKey });
    const winT = c.adopt(Table.make(ins, { component: "WindowInsights", rowKey: (w) => `${w.provider}::${w.windowKey}`, initialSort: { key: "burned", dir: "desc" }, ids: winIds, label: (w) => `${w.windowLabel} (${w.provider}): ${w.fractionConsumed.toFixed(2)} windows burned, peak ${fmt.pct(w.peakConcurrentFraction, 0)}, ${w.accounts} accounts, needs ${w.idealAccounts}${w.exhaustedEvents ? `, ${w.exhaustedEvents} exhaustions` : ""}`, pinnable: true, empty: empty("No usage snapshots in this range", "Snapshots are recorded when the agent fetches subscription usage."),
      columns: [
        { key: "window", header: "Window", render: (w) => labelCell(w.windowLabel, w.provider, swatch(colors.get(w.provider) ?? OTHER)), sort: (w) => w.windowLabel },
        { key: "accounts", header: "Accounts", align: "right", render: (w) => num(fmt.int(w.accounts)), sort: (w) => w.accounts },
        { key: "cycles", header: "Resets", align: "right", render: (w) => num(fmt.int(w.cycles)), sort: (w) => w.cycles },
        { key: "burned", header: "Windows burned", align: "right", render: (w) => num(w.fractionConsumed.toFixed(2)), sort: (w) => w.fractionConsumed },
        { key: "perWindow", header: "Tokens / window", align: "right", render: (w) => (w.estTokensPerWindow != null ? num(fmt.compact(w.estTokensPerWindow)) : h("span", { class: "sl-dim", title: "Too little of the window was consumed to extrapolate" }, "–")), sort: (w) => w.estTokensPerWindow ?? -1 },
        { key: "peak", header: "Peak utilization", align: "right", render: (w) => meterCell(w.peakConcurrentFraction, w.accounts, fmt.pct(w.peakConcurrentFraction, 0), w.accounts && w.peakConcurrentFraction / w.accounts >= 0.9 ? "var(--sl-bad)" : undefined), sort: (w) => w.peakConcurrentFraction },
        { key: "ideal", header: "Accounts needed", align: "right", render: (w) => (w.idealAccounts > w.accounts ? h("span", { class: "sl-num tone-warn" }, `${fmt.int(w.idealAccounts)} · have ${fmt.int(w.accounts)}`) : h("span", { class: "sl-num sl-dim" }, fmt.int(w.idealAccounts))), sort: (w) => w.idealAccounts - w.accounts },
        { key: "exhausted", header: "Exhaustions", align: "right", render: (w) => (w.exhaustedEvents ? badge(`${fmt.int(w.exhaustedEvents)} exhausted`, "bad") : h("span", { class: "sl-num sl-dim" }, "–")), sort: (w) => w.exhaustedEvents },
      ] }), { part: "windows" });
    const pickDefault = () => ins.reduce((a, b) => (!a || b.fractionConsumed > a.fractionConsumed ? b : a), null);
    let picked = pickDefault();
    function drawUtil() {
      if (!picked) { util.replaceChildren(empty("No usage snapshots in this range")); return; }
      const series = (acc?.usageSeries ?? []).filter((s) => s.provider === picked.provider && s.windowKey === picked.windowKey);
      if (!series.length) { utilDesc.textContent = `${picked.windowLabel}: used fraction per account`; util.replaceChildren(acc ? empty("No snapshots for this window", "Pick another window above.") : empty("Per-account series not loaded", o.windows ? "Loading…" : "This view needs /api/stats/provider-windows?provider=<id>.")); return; }
      const all = series.flatMap((s) => s.points.map((p) => p.timestamp)), t0 = Math.min(...all), t1 = Math.max(...all);
      const step = UTIL_STEPS.find((s) => (t1 - t0) / s <= 180) ?? DAY, first = Math.floor(t0 / step) * step, n = Math.floor((t1 - first) / step) + 1, bk = Array.from({ length: n }, (_, i) => first + i * step);
      const cl = colorLookup(series.map((s) => ({ key: s.accountKey, weight: s.points.length })));
      const ser = series.map((s) => { const v = Array(n).fill(null); for (const p of s.points) { const i = Math.floor((p.timestamp - first) / step); v[i] = Math.max(v[i] ?? 0, p.usedFraction); } return { key: s.accountKey, label: s.accountLabel, color: cl.get(s.accountKey), kind: "line", values: v }; });
      utilDesc.textContent = `${picked.windowLabel} used fraction per account, ${fmt.time(t0)} – ${fmt.time(t1)}`;
      const ch = TimeChart.make({ buckets: bk, bucketMs: step, series: ser }, { stacked: false, height: 220, yMax: 1, format: (v) => fmt.pct(v, 0), formatTooltip: (v) => fmt.pct(v, 0), references: [{ value: 0.9, label: "90%" }], legend: true, ids: () => ({ provider: picked.provider, window: picked.windowKey }) });
      c.adopt(ch, { part: "utilization", entities: { provider: picked.provider, window: picked.windowKey } });
      const rows = series.map((s) => { const last = s.points.reduce((a, b) => (!a || b.timestamp >= a.timestamp ? b : a), null); return { s, last, peak: Math.max(...s.points.map((p) => p.usedFraction)) }; });
      const at = Table.make(rows, { component: "AccountTable", dense: true, rowKey: (r) => r.s.accountKey, ids: (r) => ({ provider: picked.provider, window: picked.windowKey, account: r.s.accountKey }), label: (r) => `${r.s.accountLabel} on ${picked.windowLabel}: latest ${fmt.pct(r.last?.usedFraction ?? 0, 0)}${r.last?.exhausted ? " (exhausted)" : ""}, peak ${fmt.pct(r.peak, 0)}`, columns: [
        { key: "account", header: "Account", render: (r) => h("span", { class: "sl-lc" }, swatch(cl.get(r.s.accountKey)), mono(r.s.accountLabel)) },
        { key: "latest", header: "Latest", align: "right", render: (r) => (r.last?.exhausted ? badge("exhausted", "bad") : num(fmt.pct(r.last?.usedFraction ?? 0, 0))), sort: (r) => r.last?.usedFraction ?? -1 },
        { key: "peak", header: "Peak", align: "right", render: (r) => num(fmt.pct(r.peak, 0)), sort: (r) => r.peak },
        { key: "samples", header: "Samples", align: "right", render: (r) => num(fmt.int(r.s.points.length)), sort: (r) => r.s.points.length },
        { key: "seen", header: "Last sample", align: "right", render: (r) => h("span", { class: "sl-dim" }, r.last ? fmt.ago(r.last.timestamp, nowOf(o)) : "–") },
      ] });
      c.adopt(at, { part: "accounts" });
      util.replaceChildren(ch.el, at.el);
    }
    async function choose(w) { picked = w ?? pickDefault(); c.spec.window = picked ? `${picked.provider}::${picked.windowKey}` : null; if (picked && o.windows && !(acc?.usageSeries ?? []).some((s) => s.provider === picked.provider)) { drawUtil(); acc = await o.windows(picked.provider); } drawUtil(); }
    winT.on("select", (e) => choose(e.entities.window ? ins.find((w) => w.provider === e.entities.provider && w.windowKey === e.entities.window) : null));
    choose(picked);
    c.add(card({ title: "Provider totals", desc: T.unpriced ? `Cost is an API-equivalent estimate and excludes ${fmt.int(T.unpriced)} unpriced subscription requests. Select a row for its token mix.` : "Cost is an API-equivalent estimate. Select a row for its token mix.", body: totals.el, flush: true }),
      h("div", { class: "sl-cols even" }, card({ title: "Burn by provider", desc: `Per ${bucketWord(m.bucket)}, top 6 providers stacked`, actions: burnSeg.el, body: burn }), card({ title: "Peak burn hours", desc: peakDesc, actions: [peakSel], body: peakSlot })),
      card({ title: "Subscription windows", desc: "What one usage window buys you and how many accounts peak demand needs. Select a row to chart it.", body: winT.el, flush: true }),
      card({ title: "Window utilization", desc: utilDesc, body: util }));
    return c;
  },
  async load(api, range) { const stats = await api(`/api/stats/providers?range=${range}`), windows = await api(`/api/stats/provider-windows?range=${range}`); const top = (windows?.windowInsights ?? []).reduce((a, b) => (!a || b.fractionConsumed > a.fractionConsumed ? b : a), null); return { stats, windows, accounts: top ? await api(`/api/stats/provider-windows?range=${range}&provider=${top.provider}`) : null }; },
};

/* ---------------- Traces (routes/TracesRoute.tsx + traces/TraceView.tsx) ---------------- */
export const TracesView = {
  label: "Traces", route: "traces",
  /** data: SessionSummary[] (GET /api/sessions). opts.trace(file) → SessionTrace, opts.entry(file, id), opts.session opens one directly. */
  make(sessions, o = {}) {
    const c = routeRoot("TracesView", { title: "Traces", desc: "Recent sessions with subagent activity folded in. Open one to inspect its timeline." }, o);
    const listSlot = h("div", {}), viewSlot = h("div", { hidden: true });
    const tbl = c.adopt(Table.make(sessions, { component: "SessionTable", rowKey: (s) => s.file, initialSort: { key: "started", dir: "desc" }, ids: (s) => ({ session: s.file }), label: (s) => `session ${s.title ?? s.file}: ${s.requests} requests, ${s.toolCalls} tool calls, ${s.subagents} subagents`, search: { placeholder: "Title, project or model", match: (s, q) => [s.title ?? "", s.folder ?? "", ...(s.models ?? [])].some((x) => x.toLowerCase().includes(q)) }, empty: empty("No sessions found", "Run a sync to index recent activity."),
      columns: [
        { key: "title", header: "Session", render: (s) => labelCell(s.title ?? s.file, h("span", { class: "sl-mono" }, fmt.folder(s.folder))), sort: (s) => s.title ?? s.file },
        { key: "started", header: "Started", render: (s) => h("span", { class: "sl-dim", title: fmt.time(s.startedAt) }, fmt.ago(s.startedAt, nowOf(o))), sort: (s) => s.startedAt },
        { key: "dur", header: "Duration", align: "right", render: (s) => num(s.endedAt ? fmt.elapsed(s.endedAt - s.startedAt) : "–"), sort: (s) => (s.endedAt ?? s.startedAt) - s.startedAt },
        { key: "req", header: "Requests", align: "right", render: (s) => num(fmt.int(s.requests)), sort: (s) => s.requests },
        { key: "tools", header: "Tool calls", align: "right", render: (s) => num(fmt.int(s.toolCalls)), sort: (s) => s.toolCalls },
        { key: "agents", header: "Subagents", align: "right", render: (s) => num(fmt.int(s.subagents)), sort: (s) => s.subagents },
        { key: "tokens", header: "Tokens", align: "right", render: (s) => num(s.totalTokens ? fmt.compact(s.totalTokens) : "not recorded"), sort: (s) => s.totalTokens },
        { key: "cost", header: "Cost", align: "right", render: (s) => num(s.totalTokens || s.costTotal ? fmt.estCost(s.costTotal, s.unpricedRequests) : "N/A"), sort: (s) => s.costTotal },
        { key: "models", header: "Models", render: (s) => h("span", { class: "sl-mono sl-dim", title: (s.models ?? []).join("\n") }, [...new Set(s.models ?? [])].join(", ")) },
      ] }), { part: "sessions" });
    listSlot.append(card({ title: "Sessions", desc: `${fmt.int(sessions.length)} sessions`, body: tbl.el, flush: true }));
    let view = null;
    const back = () => { viewSlot.hidden = true; listSlot.hidden = false; viewSlot.replaceChildren(); view = null; c.spec.session = null; c.emit("select", { ids: {}, label: "back to sessions" }); };
    async function open(file) {
      if (!o.trace) return;
      viewSlot.hidden = false; listSlot.hidden = true; viewSlot.replaceChildren(tableSkeleton(8));
      const tr = await Promise.resolve(o.trace(file)).catch(() => null);
      if (!tr) { viewSlot.replaceChildren(h("div", { class: "sl-stack" }, h("button", { type: "button", class: "sl-btn ghost sm", onclick: back }, "← Sessions"), empty("Trace not available", "This sample only carries traces for a few sessions."))); return; }
      view = TraceView.make(tr, { layers: o.layers, entry: o.entry, withheld: o.withheld, onBack: back });
      c.adopt(view, { part: "trace" }); viewSlot.replaceChildren(view.el); c.spec.session = file; c.trace = view;
      if (o.highlight?.span) { const hit = tr.tracks.flatMap((t) => t.spans.map((s) => ({ s, t }))).find(({ s }) => s.id === o.highlight.span); if (hit) view.select(hit.s, hit.t); }
    }
    tbl.on("select", (e) => e.entities.session && open(e.entities.session));
    c.add(listSlot, viewSlot);
    c.open = open; c.back = back;
    if (o.session) open(o.session);
    return c;
  },
  load: (api) => api(`/api/sessions?limit=100`),
};

/* ---------------- registry + dashboard (app/Shell.tsx, app/nav.ts) ---------------- */
export const ROUTES = { overview: OverviewView, models: ModelsView, providers: ProvidersView, costs: CostsView, requests: RequestsView, errors: ErrorsView, traces: TracesView, tools: ToolsView, frustration: FrustrationView, projects: ProjectsView, gain: GainView };
export const NAV = [{ heading: "Usage", items: [["overview", "o"], ["models", "m"], ["providers", "p"], ["costs", "c"]] }, { heading: "Activity", items: [["requests", "r"], ["errors", "e"], ["traces", "t"]] }, { heading: "Insights", items: [["tools", "l"], ["frustration", "f"], ["projects", "j"], ["gain", "g"]] }];
/** Options every route needs from a host api(path): request drawer, trace and entry loaders, provider windows. */
export function hostOptions(api, range, extra = {}) {
  return { range, request: (id) => api(`/api/request/${id}`), trace: (f) => api(`/api/session/trace?file=${encodeURIComponent(f)}`), entry: (f, id) => api(`/api/session/entry?file=${encodeURIComponent(f)}&id=${encodeURIComponent(id)}`), windows: (p) => api(`/api/stats/provider-windows?range=${range}&provider=${p}`), ...extra };
}
/**
 * The whole /stats app as one component: grouped nav with G-letter jumps, the 1h…All range picker
 * (keys 1–6), the live chip and the active route. Shortcuts only fire while focus is inside it, so a
 * chat host keeps its own keys. data: { api(path) → JSON, status?: LiveStatus }. opts: section,
 * range, available (ranges the data has), now, withheld, liveEvents (an /api/events URL).
 */
export const StatsDashboard = {
  label: "Stats dashboard",
  make({ api, status } = {}, o = {}) {
    const st = { section: ROUTES[o.section] ? o.section : "overview", range: o.range ?? "7d" };
    const body = h("div", { class: "sl-dash-body" }), title = h("b", {});
    const navBtns = new Map();
    const side = h("nav", { class: "sl-dash-side", "aria-label": "Stats sections" }, ...NAV.map((g) => h("div", { class: "sl-dash-grp" }, h("span", {}, g.heading), ...g.items.map(([id, key]) => { const b = h("button", { type: "button", class: "sl-dash-nav", onclick: () => go(id) }, ROUTES[id].label, h("kbd", {}, `G ${key.toUpperCase()}`)); navBtns.set(id, b); return b; }))), h("div", { class: "sl-dash-keys" }, "1–6 range · G + letter jumps · Esc closes"));
    const range = RangeControl.make(st.range, { available: o.available, size: "sm", onChange: (r) => { st.range = r; render(); } });
    const live = LiveChip.make(status ?? null, { static: !o.liveEvents, now: o.now, events: o.liveEvents, onSync: o.onSync, onVersion: () => render() });
    const el = h("div", { class: "sl-dash os sl-root", tabindex: "-1" }, side, h("div", { class: "sl-dash-main" }, h("div", { class: "sl-dash-top" }, title, h("span", { class: "sl-grow" }), range.el, live.el), body));
    const c = comp("StatsDashboard", el, { section: st.section, range: st.range });
    c.adopt(range, { part: "range" }); c.adopt(live, { part: "live" });
    let cur = null, gArmed = 0;
    function render() {
      const R = ROUTES[st.section];
      title.textContent = R.label; navBtns.forEach((b, id) => b.setAttribute("aria-current", id === st.section ? "page" : "false"));
      Object.assign(c.spec, { section: st.section, range: st.range });
      loadInto(body, R.load(api, st.range), (d) => { cur = R.make(d, hostOptions(api, st.range, { now: o.now, withheld: o.withheld, layers: o.layers, session: st.section === "traces" ? o.session : undefined, onTrace: (req) => { o.session = req.sessionFile; go("traces"); }, onNavigate: go })); c.adopt(cur, { part: st.section }); return cur.el; }, { isEmpty: (d) => d == null });
    }
    function go(id) { if (!ROUTES[id]) return; st.section = id; render(); c.emit("filter", { filter: { section: id }, label: `section ${id}` }); }
    el.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.closest?.("canvas")) return;
      const k = e.key.toLowerCase();
      if (gArmed && Date.now() - gArmed < 1200) { gArmed = 0; const hit = NAV.flatMap((g) => g.items).find(([, key]) => key === k); if (hit) { e.preventDefault(); go(hit[0]); } return; }
      if (k === "g") { gArmed = Date.now(); return; }
      const i = Number(k) - 1; if (i >= 0 && i < 6) { e.preventDefault(); range.select(["1h", "24h", "7d", "30d", "90d", "all"][i]); }
    });
    c.go = go; c.route = () => cur;
    render();
    return c;
  },
};
