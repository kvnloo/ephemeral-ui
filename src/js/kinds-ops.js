// Ops boards: one composed card per question the owner keeps asking (QUESTION-CATALOG.md in the
// hermes-trace-dashboard ops folder). Each board answers at a glance (headline + stat row), then lets
// him drill in (brush time, pick a lane/host/model/session, filter) and copy the pick back to the chat
// as an @ops reference. Built from the Stats library primitives; data from ops-data.js.
//
//   KINDS_OPS[kind].make(app, rng, input?, opts?) → { el, done, play, spec, board }
//   board = { el, spec, getSelection(), on(type, cb) } (the Stats library component contract)
//
// Read-only: no card writes, restarts, kills or routes anything. Numbers that a source does not
// record are shown as "not measured", never as 0.
import { h } from "./motion.js";
import { shell } from "./shell.js";
import { fmt, StatGrid, TimeChart, Chart, BarList, ShareBar, Table, Segmented, Legend, badge, dot, labelCell, meterCell, keyValues, empty, Sparkline, SERIES, OTHER } from "./stats-lib.js";
import { opsReady, opsComp, opsTray, HOUR, DAYMS, clamp, sum, buckets, bucketOf, bandTone, short } from "./ops-data.js";

const NM = "not measured";
const para = (t, cls = "") => h("p", { class: "ops-p " + cls }, t);
const lead = (t) => h("p", { class: "ops-lead" }, t);
const sec = (t, ...kids) => h("section", { class: "ops-sec" }, h("div", { class: "ops-sh" }, t), ...kids);
const gap = (t) => h("p", { class: "ops-gap" }, h("b", {}, "Not measured: "), t);
const pctTxt = (v) => (v == null ? NM : `${Math.round(v)}%`);
const hrs = (v) => (v == null ? "?" : v >= 48 ? `${(v / 24).toFixed(1)} d` : `${v.toFixed(1)} h`);
const local = (t) => new Date(t).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** Shared frame: shell card, async build against the snapshot, a board component and a context tray. */
function board(a, kind, { title, status }, input, build) {
  const body = h("div", { class: "ops sl-root" }, para("Loading the ops snapshot…", "ops-muted"));
  const el = shell(a, kind, { verb: title, status, body, summary: title, cls: "ops-card" });
  const c = opsComp(kind, el, { board: kind });
  const done = (input ? Promise.resolve(input) : opsReady()).then((d) => {
    const prov = d.provenance === "live-local" ? badge("live · this machine", "ok") : badge("sanitized snapshot", "neutral");
    const node = build(d, c);
    body.replaceChildren(node, opsTray(c, kind.replace(/^ops-/, ""), d.capturedAt), h("div", { class: "ops-prov" }, prov, h("span", {}, ` captured ${local(d.capturedAt)}`)));
    c.spec.capturedAt = d.capturedAt; c.spec.provenance = d.provenance;
    return d;
  }).catch((e) => { body.replaceChildren(para("Snapshot unavailable. Nothing is inferred without it.", "ops-muted")); throw e; });
  return { el, done, board: c, async play() { await done; }, spec: c.spec };
}
const src = (d, name) => d.sources?.[name]?.ok !== false;

/* ================================================================ 1. burn lanes */
function burnBoard(d, c) {
  const b = d.burn;
  if (!b) return empty("No burn-pace history", "burn-pace has not written its posture log on this machine.");
  const now = d.capturedAt;
  const lanes = b.lanes;
  const out = lanes.filter((l) => l.used >= 99.5), throttled = lanes.filter((l) => /throttle|avoid/.test(l.band ?? "")), under = lanes.filter((l) => l.band === "under-burn");
  const ans = [out.length ? `${out.map((l) => l.id).join(" + ")} spent (resets in ${out.map((l) => hrs(l.hoursToReset)).join(" / ")})` : null,
    throttled.length ? `${throttled.map((l) => `${l.id} ${l.pace?.toFixed(1) ?? "?"}× pace`).join(", ")} → throttle` : null,
    under.length ? `${under.map((l) => l.id).join(", ")} under-burned: give them work` : null].filter(Boolean).join(" · ");
  const head = lead(ans || "Every lane is on pace.");
  const grid = StatGrid.make([
    { label: "Posture", value: b.posture.posture ?? "?", hint: b.posture.avoid?.length ? `avoid ${b.posture.avoid.join(", ")}` : "no pool to avoid", tone: b.posture.posture === "RESERVE" ? "warn" : null },
    { label: "Lanes spent", value: `${out.length}/${lanes.length}`, hint: out.length ? "at 100% of the weekly window" : "none at 100%" },
    { label: "Offload to", value: b.posture.offload?.length ? b.posture.offload.join(", ") : (b.freeLane ? "free lane" : "none"), hint: b.posture.offload?.length ? "burn-pace targets" : "no paid target with room" },
    { label: "GitHub API", value: b.github.remaining != null ? `${fmt.int(b.github.remaining)}` : NM, hint: b.github.remaining != null ? `of ${fmt.int(b.github.limit)} · resets in ${Math.round(b.github.minutesToReset ?? 0)} min` : "" },
  ], { min: 130 });
  // lane rows: used % against where a perfect pace would be now
  const rows = h("div", { class: "ops-lanes" }, lanes.map((l) => {
    const ideal = l.hoursToReset != null ? clamp(100 * (1 - l.hoursToReset / 168), 0, 100) : null;
    const row = h("button", { class: "ops-lane", type: "button", "data-key": l.id, onclick: () => { [...rows.children].forEach((r) => r.setAttribute("aria-pressed", r === row ? "true" : "false")); c.emit("select", { entities: { lane: l.id }, label: `${l.id}: ${pctTxt(l.used)} used, ${l.band}, ${hrs(l.hoursToReset)} to reset` }); hist.select(l.id); } },
      h("span", { class: "ops-lane-n" }, l.id),
      h("span", { class: "ops-lane-bar" }, h("i", { style: { width: `${clamp(l.used ?? 0, 0, 100)}%` }, "data-tone": l.used >= 99.5 ? "bad" : bandTone(l.band) }), ideal != null ? h("b", { class: "ops-lane-ideal", style: { left: `${ideal}%` }, title: `on-pace mark: ${Math.round(ideal)}% by now` }) : null),
      h("span", { class: "ops-lane-v" }, pctTxt(l.used)),
      badge(l.band === "unknown" && l.used >= 99.5 ? "spent" : l.band ?? "?", l.used >= 99.5 ? "bad" : bandTone(l.band)),
      h("span", { class: "ops-lane-m" }, `${hrs(l.hoursToReset)} · ${l.pace != null ? l.pace.toFixed(2) + "×" : "pace —"} · ${l.maxAgents ?? 0} agents`));
    return row;
  }));
  // history: used % per lane over the window
  const hist = laneHistory(b, now, c);
  const spentGap = lanes.some((l) => l.used >= 99.5 && l.pace == null) ? gap("pace for a spent lane (burn-pace returns band \"unknown\" and pace null at 100%, so the board says \"spent\" and shows the reset clock instead).") : null;
  return h("div", {}, head, grid.el, sec("Weekly window used, with the on-pace mark (│)", rows), sec("Used % over 14 days · click a lane above or drag across the chart", hist.el), spentGap);
}
function laneHistory(b, now, c) {
  const step = 6 * HOUR, bs = buckets(now - 14 * DAYMS, now, step);
  const ids = Object.keys(b.history);
  const series = ids.map((id, i) => {
    const vals = bs.map(() => null);
    for (const [t, used] of b.history[id]) { const k = Math.floor((t - bs[0]) / step); if (k >= 0 && k < vals.length) vals[k] = used; }
    // burn-pace logs when something runs it; carry a reading forward up to a day so the line stays readable
    for (let i = 1, last = -99; i < vals.length; i++) { if (vals[i] != null) last = i; else if (vals[i - 1] != null && i - last <= 4) vals[i] = vals[i - 1]; }
    return { key: id, label: id, color: SERIES[i % SERIES.length], values: vals, kind: "line" };
  });
  const ch = TimeChart.make({ buckets: bs, bucketMs: step, series }, { kind: "line", stacked: false, height: 170, yMax: 100, format: (v) => `${Math.round(v)}%`, legend: true, references: [{ value: 100, label: "100%" }], tickLabel: (i) => fmt.day(bs[i]) });
  ch.on("brush", (e) => c.emit("brush", { range: e.range, label: `burn history ${e.label}` }));
  ch.on("select", (e) => c.emit("select", { range: e.range, label: `burn at ${e.label}` }));
  return { el: ch.el, select: (id) => { ch.hidden.clear(); for (const s of series) if (s.key !== id) ch.hidden.add(s.key); ch.draw(); } };
}

/* ================================================================ 2. model mix */
function modelsBoard(d, c) {
  const now = d.capturedAt, rows = d.av?.modelDays ?? [];
  const harnesses = [...new Set(rows.map((r) => r.harness))];
  const tot = (rs) => { const m = new Map(); for (const r of rs) m.set(r.model, (m.get(r.model) ?? 0) + r.msgs); return [...m].sort((a, b) => b[1] - a[1]); };
  const all = tot(rows), total = sum(all, (x) => x[1]);
  const colors = new Map(all.map(([m], i) => [m, i < 9 ? SERIES[i] : OTHER]));
  const head = lead(all.length ? `${all[0][0]} carries ${fmt.pct(all[0][1] / total, 0)} of assistant turns across ${harnesses.length} harnesses (14 d); top 3 = ${fmt.pct(sum(all.slice(0, 3), (x) => x[1]) / total, 0)}.` : "No model-tagged turns in the window.");
  const shareEl = h("div", {});
  const chartEl = h("div", {});
  const list = h("div", {});
  let scope = "all";
  function draw() {
    const rs = rows.filter((r) => scope === "all" || r.harness === scope);
    const ranked = tot(rs);
    const bs = buckets(now - 13 * DAYMS, now, DAYMS);
    const day = (s) => Date.parse(s + "T00:00:00Z");
    const series = ranked.slice(0, 8).map(([model]) => ({ key: model, label: model, color: colors.get(model) ?? OTHER, values: bs.map((t) => sum(rs.filter((r) => r.model === model && day(r.day) === t), (r) => r.msgs)) }));
    const rest = ranked.slice(8).map((x) => x[0]);
    if (rest.length) series.push({ key: "other", label: `${rest.length} more`, color: OTHER, values: bs.map((t) => sum(rs.filter((r) => rest.includes(r.model) && day(r.day) === t), (r) => r.msgs)) });
    const T = sum(ranked, (x) => x[1]) || 1;
    shareEl.replaceChildren(ShareBar.make(ranked.slice(0, 9).map(([m, v], i) => ({ key: m, label: m, value: v, color: colors.get(m) ?? OTHER })), { height: 10 }).el);
    const ch = TimeChart.make({ buckets: bs, bucketMs: DAYMS, series }, { utc: true, height: 190, legend: true, format: fmt.compact });
    ch.on("select", (e) => c.emit("select", { entities: { scope }, range: e.range, label: `model mix ${scope} on ${e.label}` }));
    ch.on("brush", (e) => c.emit("brush", { range: e.range, label: `model mix ${scope} ${e.label}` }));
    chartEl.replaceChildren(ch.el);
    const bl = BarList.make(ranked.slice(0, 12).map(([m, v], i) => ({ key: m, label: m, value: v, display: `${fmt.int(v)} · ${fmt.pct(v / T, 0)}`, color: colors.get(m) ?? OTHER })));
    bl.on("select", (e) => { const m = e.entities.key; c.emit("select", { entities: m ? { model: m, scope } : {}, label: m ? `${m}: ${fmt.pct((ranked.find((x) => x[0] === m)?.[1] ?? 0) / T, 1)} of turns (${scope})` : "cleared" }); });
    list.replaceChildren(bl.el);
  }
  const byH = new Map(); for (const r of rows) byH.set(r.harness, (byH.get(r.harness) ?? 0) + r.msgs);
  const seg = Segmented.make([{ value: "all", label: "All harnesses" }, ...[...byH].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([x]) => ({ value: x, label: x }))], { name: "scope", size: "sm", onChange: (v) => { scope = v; draw(); } });
  seg.on("filter", (e) => c.emit("filter", { filter: e.filter, label: e.label }));
  draw();
  return h("div", {}, head, seg.el, shareEl, sec("Assistant turns per day, by model (UTC days)", chartEl), sec("Share in the window · click a model", list),
    gap("which model a subagent or delegate ran on when the parent harness does not log it; Hermes turns come from its own state.db because AgentsView stores no model for them."));
}

/* ================================================================ 3. tokens, cache, cost */
function tokensBoard(d, c) {
  const ov = d.stats?.overview?.overall, bym = d.stats?.["model-dashboard"]?.byModel ?? [];
  if (!ov) return empty("The /stats server did not answer", "Start the stats-dashboard plugin's server, then re-collect.");
  const inTok = ov.totalInputTokens, cr = ov.totalCacheReadTokens, cw = ov.totalCacheWriteTokens, out = ov.totalOutputTokens;
  const head = lead(`${fmt.pct(ov.cacheRate, 1)} of prompt tokens were cache reads this week; caching cut the API-equivalent bill by ${fmt.pct(ov.cacheSavings, 0)}. ${fmt.compact(cr)} cached vs ${fmt.compact(inTok)} fresh input tokens.`);
  const grid = StatGrid.make([
    { label: "Cache hit rate", value: fmt.pct(ov.cacheRate, 1), hint: "cache read ÷ all prompt tokens" },
    { label: "Saved by cache", value: fmt.pct(ov.cacheSavings, 0), hint: "vs the same tokens uncached" },
    { label: "API-equivalent", value: fmt.cost(ov.totalCost, 0), hint: "not your subscription drawdown" },
    { label: "Output tokens", value: fmt.compact(out), hint: `${fmt.compact(cw)} cache writes` },
  ], { min: 130 });
  const mix = ShareBar.make([{ key: "cacheRead", label: "cache read", value: cr, color: SERIES[0] }, { key: "input", label: "fresh input", value: inTok, color: SERIES[3] }, { key: "cacheWrite", label: "cache write", value: cw, color: SERIES[2] }, { key: "output", label: "output", value: out, color: SERIES[1] }], { height: 12, selectable: true });
  mix.on("select", (e) => c.emit("select", { entities: { tokens: e.entities.key }, label: `${e.label} tokens: ${fmt.compact(e.value)}` }));
  const legend = Legend.make([["cache read", SERIES[0], cr], ["fresh input", SERIES[3], inTok], ["cache write", SERIES[2], cw], ["output", SERIES[1], out]].map(([l, col, v]) => ({ key: l, label: l, color: col, value: fmt.compact(v) })));
  const ts = d.stats.overview.timeSeries ?? [];
  const ch = TimeChart.make({ buckets: ts.map((r) => r.timestamp), bucketMs: DAYMS, series: [{ key: "cost", label: "API-equivalent $", color: SERIES[4], values: ts.map((r) => r.cost) }, { key: "tokens", label: "tokens", color: SERIES[0], values: ts.map((r) => r.tokens), kind: "line", axis: "right" }] }, { height: 160, format: (v) => fmt.cost(v, 0), formatRight: fmt.compact, legend: true });
  ch.on("select", (e) => c.emit("select", { range: e.range, label: `tokens/cost on ${e.label}` }));
  ch.on("brush", (e) => c.emit("brush", { range: e.range, label: `tokens/cost ${e.label}` }));
  const rows = [...bym].sort((a, b) => b.totalCost - a.totalCost);
  const byKey = new Map(rows.map((r) => [`${r.model}::${r.provider}`, r]));
  const tbl = Table.make(rows, {
     selectable: true,rowKey: (r) => `${r.model}::${r.provider}`, initialSort: { key: "cost", dir: "desc" }, limit: 8, dense: true, pinnable: true,
    label: (r) => `${r.model}: cache ${fmt.pct(r.cacheRate, 0)}, ${fmt.cost(r.totalCost, 0)}`,
    columns: [
      { key: "model", header: "Model", render: (r) => labelCell(r.model, r.provider), sort: (r) => r.model },
      { key: "req", header: "Rows", align: "right", render: (r) => fmt.int(r.totalRequests), sort: (r) => r.totalRequests, title: "usage rows (Hermes records per session × model, not per request)" },
      { key: "cache", header: "Cache hit", align: "right", width: 120, render: (r) => meterCell(r.cacheRate, 1, fmt.pct(r.cacheRate, 0), r.cacheRate < 0.8 ? "var(--h-warning, #f5a524)" : null), sort: (r) => r.cacheRate },
      { key: "saved", header: "Saved", align: "right", render: (r) => fmt.pct(r.cacheSavings, 0), sort: (r) => r.cacheSavings },
      { key: "cost", header: "API-eq. $", align: "right", render: (r) => fmt.cost(r.totalCost, 0), sort: (r) => r.totalCost },
    ],
  });
  for (const t of ["select", "pin"]) tbl.on(t, (e) => { const r = byKey.get(e.entities.key); c.emit(t, r ? { entities: { model: r.model, provider: r.provider }, label: `${r.model}: cache ${fmt.pct(r.cacheRate, 0)}, saved ${fmt.pct(r.cacheSavings, 0)}, ${fmt.cost(r.totalCost, 0)} API-eq.` } : { label: "cleared" }); });
  const low = rows.filter((r) => r.cacheRate < 0.8 && r.totalCost > 1);
  return h("div", {}, head, grid.el, sec("Where the prompt tokens went", mix.el, legend.el), sec("Daily API-equivalent cost and tokens (Hermes, 7 d)", ch.el),
    sec("Per model · low cache hit is highlighted", tbl.el), low.length ? para(`Weak caching: ${low.map((r) => `${r.model} ${fmt.pct(r.cacheRate, 0)}`).join(", ")}. Long stable system prompts and fewer mid-turn tool-schema changes raise it.`) : null,
    gap("cost per verified task (no verifier outcome is joined to usage yet) and subscription drawdown per task. Dollars here are list-price equivalents."));
}

/* ================================================================ 4. context pressure */
function contextBoard(d, c) {
  const ss = d.av?.context ?? [], pa = d.av?.perAgent ?? {};
  const now = d.capturedAt;
  const storms = ss.filter((s) => (s.compactions ?? 0) >= 3);
  const ag = Object.entries(pa).filter(([, v]) => v.sessions > 0).sort((a, b) => b[1].compactions - a[1].compactions);
  const tc = sum(ag, ([, v]) => v.compactions), tm = sum(ag, ([, v]) => v.midTask);
  const head = lead(`${fmt.int(tc)} compactions in 14 days, ${fmt.int(tm)} of them mid-task; ${storms.length} session${storms.length === 1 ? "" : "s"} compacted 3+ times (storms). ${ag[0] ? `${ag[0][0]} compacts most.` : ""}`);
  const grid = StatGrid.make([
    { label: "Compactions", value: fmt.int(tc), hint: "14 d, top-level sessions" },
    { label: "Mid-task", value: fmt.int(tm), hint: tc ? `${fmt.pct(tm / tc, 0)} interrupted work` : "" },
    { label: "Storm sessions", value: fmt.int(storms.length), hint: "≥ 3 compactions", tone: storms.length ? "warn" : null },
    { label: "Peak context", value: ss.length ? fmt.compact(Math.max(...ss.map((s) => s.peak ?? 0))) : NM, hint: "largest prompt seen" },
  ], { min: 130 });
  const bl = BarList.make(ag.map(([k, v], i) => ({ key: k, label: `${k} · ${fmt.int(v.sessions)} sessions`, value: v.compactions, display: `${fmt.int(v.compactions)} (${fmt.int(v.midTask)} mid-task)`, color: SERIES[i % 10] })));
  let filt = null;
  bl.on("select", (e) => { filt = e.entities.key ?? null; tbl.refresh(); c.emit("select", { entities: filt ? { harness: filt } : {}, label: filt ? `${filt}: ${fmt.int(pa[filt].compactions)} compactions` : "cleared" }); });
  const step = DAYMS, bs = buckets(now - 13 * DAYMS, now, step);
  const hs = [...new Set(ss.map((s) => s.agent))];
  const ch = TimeChart.make({ buckets: bs, bucketMs: step, series: hs.map((a, i) => ({ key: a, label: a, color: SERIES[i % 10], values: bs.map((t) => sum(ss.filter((s) => s.agent === a && bucketOf(s.endMs, step) === t), (s) => s.compactions)) })) }, { height: 150, legend: true });
  ch.on("brush", (e) => c.emit("brush", { range: e.range, label: `compactions ${e.label}` }));
  ch.on("select", (e) => c.emit("select", { range: e.range, label: `compactions on ${e.label}` }));
  const byId = new Map(ss.map((s) => [s.id, s]));
  const tbl = Table.make(ss, {
     selectable: true,rowKey: (s) => s.id, initialSort: { key: "comp", dir: "desc" }, limit: 8, dense: true, pinnable: true, filter: (s) => !filt || s.agent === filt,
    search: { placeholder: "Filter sessions…", match: (s, q) => `${s.title} ${s.agent}`.toLowerCase().includes(q) },
    columns: [
      { key: "s", header: "Session", wrap: true, render: (s) => labelCell(short(s.title, 48), `${s.agent} · ${fmt.ago(s.endMs, now)}`), sort: (s) => s.endMs },
      { key: "comp", header: "Compact", align: "right", render: (s) => h("span", {}, fmt.int(s.compactions), s.compactions >= 3 ? badge("storm", "warn") : null), sort: (s) => s.compactions ?? 0 },
      { key: "mid", header: "Mid-task", align: "right", render: (s) => fmt.int(s.midTask), sort: (s) => s.midTask ?? 0 },
      { key: "p", header: "Pressure", align: "right", width: 110, render: (s) => (s.pressure == null ? h("span", { class: "ops-muted" }, NM) : meterCell(s.pressure, 1, fmt.pct(s.pressure, 0), s.pressure > 0.85 ? "var(--h-danger, #e5484d)" : null)), sort: (s) => s.pressure ?? -1 },
      { key: "peak", header: "Peak", align: "right", render: (s) => (s.peak ? fmt.compact(s.peak) : "—"), sort: (s) => s.peak ?? 0 },
    ],
  });
  for (const t of ["select", "pin"]) tbl.on(t, (e) => { const s = byId.get(e.entities.key); c.emit(t, s ? { entities: { session: s.id, harness: s.agent }, label: `${short(s.title, 40)}: ${s.compactions} compactions, peak ${fmt.compact(s.peak ?? 0)}` } : { label: "cleared" }); });
  return h("div", {}, head, grid.el, sec("Compactions by harness · click to filter the sessions", bl.el), sec("Compactions per day", ch.el), sec("Sessions with compactions or ≥ 60% context pressure", tbl.el),
    gap("what each compaction dropped (no before/after token count per compaction is recorded) and the effect on the next turn's quality."));
}

/* ================================================================ 5. tool-call health */
function toolsBoard(d, c) {
  const bt = d.stats?.tools?.byTool ?? [], tr = d.av?.toolResults ?? [];
  let scope = bt.length ? "hermes" : "all";
  const wrap = h("div", {});
  const errs = bt.filter((t) => t.errors > 0).sort((a, b) => b.errors / b.calls - a.errors / a.calls);
  const totalCalls = sum(bt, (t) => t.calls), totalErr = sum(bt, (t) => t.errors), resultChars = sum(bt, (t) => t.resultChars);
  const heavy = [...bt].sort((a, b) => b.resultChars - a.resultChars);
  const head = lead(bt.length ? `${fmt.int(totalCalls)} Hermes tool calls this week, ${fmt.rate(totalErr / Math.max(1, totalCalls))} failed. ${heavy[0]?.tool} returned ${fmt.pct(heavy[0]?.resultChars / Math.max(1, resultChars), 0)} of all tool output (≈ ${fmt.compact(heavy[0]?.resultChars / 4)} tokens back into context).` : "No Hermes tool rows; showing cross-harness results.");
  const grid = StatGrid.make([
    { label: "Calls (7 d)", value: fmt.int(totalCalls), hint: "Hermes /stats" },
    { label: "Failure rate", value: fmt.rate(totalErr / Math.max(1, totalCalls)), hint: `${fmt.int(totalErr)} errors`, tone: totalErr / Math.max(1, totalCalls) > 0.02 ? "warn" : null },
    { label: "Output into context", value: `≈ ${fmt.compact(resultChars / 4)}`, hint: "tokens (chars ÷ 4)" },
    { label: "Latency p50 / p95", value: NM, hint: "no durations recorded" },
  ], { min: 130 });
  function draw() {
    if (scope === "hermes") {
      const byKey = new Map(bt.map((t) => [t.tool, t]));
      const tbl = Table.make(bt, {
         selectable: true,rowKey: (t) => t.tool, initialSort: { key: "calls", dir: "desc" }, limit: 10, dense: true, pinnable: true,
        search: { placeholder: "Filter tools…", match: (t, q) => t.tool.toLowerCase().includes(q) },
        columns: [
          { key: "tool", header: "Tool", render: (t) => labelCell(t.tool, t.lastUsed ? `last ${fmt.ago(t.lastUsed, d.capturedAt)}` : null), sort: (t) => t.tool },
          { key: "calls", header: "Calls", align: "right", render: (t) => fmt.int(t.calls), sort: (t) => t.calls },
          { key: "err", header: "Errors", align: "right", width: 110, render: (t) => meterCell(t.errors / Math.max(1, t.calls), 0.1, `${fmt.int(t.errors)} · ${fmt.rate(t.errors / Math.max(1, t.calls))}`, t.errors / Math.max(1, t.calls) >= 0.05 ? "var(--h-danger, #e5484d)" : null), sort: (t) => t.errors / Math.max(1, t.calls) },
          { key: "out", header: "Out/call", align: "right", render: (t) => fmt.bytes(Math.round(t.resultChars / Math.max(1, t.calls))), sort: (t) => t.resultChars / Math.max(1, t.calls), title: "result characters per call: what each call puts back into context" },
          { key: "share", header: "Output share", align: "right", render: (t) => fmt.pct(t.resultChars / Math.max(1, resultChars), 0), sort: (t) => t.resultChars },
        ],
      });
      for (const ty of ["select", "pin"]) tbl.on(ty, (e) => { const t = byKey.get(e.entities.key); c.emit(ty, t ? { entities: { tool: t.tool, scope: "hermes" }, label: `${t.tool}: ${fmt.int(t.calls)} calls, ${fmt.int(t.errors)} errors, ${fmt.bytes(Math.round(t.resultChars / Math.max(1, t.calls)))}/call` } : { label: "cleared" }); });
      wrap.replaceChildren(tbl.el);
    } else {
      const m = new Map();
      for (const r of tr) { const k = `${r.harness}/${r.tool}`; const x = m.get(k) ?? { key: k, harness: r.harness, tool: r.tool, ok: 0, err: 0 }; if (r.status === "errored") x.err += r.n; else x.ok += r.n; m.set(k, x); }
      const rows = [...m.values()].map((x) => ({ ...x, n: x.ok + x.err, rate: x.err / Math.max(1, x.ok + x.err) })).filter((x) => x.n >= 3).sort((a, b) => b.err - a.err);
      const bl = BarList.make(rows.slice(0, 14).map((x) => ({ key: x.key, label: `${x.harness} · ${x.tool}`, value: x.err, display: `${fmt.int(x.err)} / ${fmt.int(x.n)} · ${fmt.rate(x.rate)}`, color: x.rate >= 0.05 ? "var(--h-danger, #e5484d)" : SERIES[0] })));
      bl.on("select", (e) => { const x = m.get(e.entities.key); c.emit("select", x ? { entities: { harness: x.harness, tool: x.tool }, label: `${x.harness} ${x.tool}: ${x.err} errored of ${x.ok + x.err}` } : { label: "cleared" }); });
      wrap.replaceChildren(rows.length ? bl.el : empty("No tool results in the window", "AgentsView records tool_result_events only for some harnesses."));
    }
  }
  const seg = Segmented.make([...(bt.length ? [{ value: "hermes", label: "Hermes · 7 d" }] : []), { value: "all", label: "All harnesses · errors" }], { name: "scope", size: "sm", value: scope, onChange: (v) => { scope = v; draw(); } });
  seg.on("filter", (e) => c.emit("filter", { filter: e.filter, label: e.label }));
  draw();
  const dead = bt.filter((t) => t.calls <= 2).map((t) => t.tool);
  return h("div", {}, head, grid.el, seg.el, wrap, errs.length ? para(`Most failure-prone: ${errs.slice(0, 3).map((t) => `${t.tool} ${fmt.rate(t.errors / t.calls)}`).join(", ")}.`) : null,
    dead.length ? para(`Rarely used (≤ 2 calls in 7 d): ${dead.slice(0, 8).join(", ")}. Their schemas still cost prompt tokens every turn.`) : null,
    gap("tool latency and retries for Hermes (rows carry counts and sizes only); the All tab counts errored results, not retries."));
}

/* ================================================================ 6. hosts & k3s */
function fleetBoard(d, c) {
  const k = d.k3s ?? {}, hst = d.host ?? {}, now = d.capturedAt;
  const nodes = k.nodes ?? [];
  const mem = hst.mem, sl = hst.agentSlice, psi = hst.psi, gpu = hst.gpu;
  const runsD = d.runsDaily ?? [];
  const tight = mem && mem.availMb < 6000;
  const busy = nodes.map((n) => `${n.id} ${n.cpuPct ?? "?"}% cpu / ${n.memPct ?? "?"}% mem`).join(", ");
  const head = lead(`${tight ? `Desktop has ${fmt.compact(mem.availMb / 1024)} GB available with ${fmt.compact(mem.swapUsedMb / 1024)} GB in zram; ` : ""}${busy || "no k3s nodes reachable"}. ${(k.queues ?? []).some((q) => q.pending) ? `${sum(k.queues, (q) => q.pending)} workload${sum(k.queues, (q) => q.pending) === 1 ? "" : "s"} queued.` : "Kueue: nothing pending."}`);
  const grid = StatGrid.make([
    { label: "Desktop RAM free", value: mem ? `${(mem.availMb / 1024).toFixed(1)} GB` : NM, hint: mem ? `of ${(mem.totalMb / 1024).toFixed(0)} GB · zram ${(mem.swapUsedMb / 1024).toFixed(1)} GB` : "", tone: tight ? "warn" : null },
    { label: "Memory pressure", value: psi ? `${psi.memory.some10.toFixed(1)}%` : NM, hint: psi ? `full ${psi.memory.full10.toFixed(1)}% · io ${psi.io.some10.toFixed(0)}%` : "", tone: psi && psi.memory.some10 > 5 ? "warn" : null },
    { label: "Agent slice OOM kills", value: sl ? fmt.int(sl.oom_kill) : NM, hint: sl ? `${fmt.int(sl.currentMb)} MB / ${sl.maxMb ? fmt.int(sl.maxMb) + " MB" : "no cap"}` : "" },
    { label: "GPU", value: gpu ? `${gpu.util}%` : NM, hint: gpu ? `${(gpu.memUsedMb / 1024).toFixed(1)} / ${(gpu.memTotalMb / 1024).toFixed(0)} GB · ${gpu.tempC}°C` : "" },
  ], { min: 130 });
  const nodeRow = (n) => h("button", { class: "ops-node", type: "button", onclick: (e) => { [...e.currentTarget.parentElement.children].forEach((x) => x.setAttribute("aria-pressed", x === e.currentTarget ? "true" : "false")); c.emit("select", { entities: { host: n.id }, label: `${n.id}: ${n.cpuPct ?? "?"}% cpu, ${n.memPct ?? "?"}% mem${n.pressure?.length ? ", " + n.pressure.join("/") : ""}${n.cordoned ? ", cordoned" : ""}` }); } },
    h("span", { class: "ops-node-h" }, dot(n.ready ? (n.pressure?.length || n.cordoned ? "warn" : "ok") : "bad"), h("b", {}, n.id), n.cordoned ? badge("cordoned", "warn") : null, ...(n.pressure ?? []).map((p) => badge(p, "bad")), n.gpu ? badge(`gpu ×${n.gpu}`, "neutral") : null),
    meterCell(n.cpuPct ?? 0, 100, n.cpuPct != null ? `cpu ${n.cpuPct}%` : `cpu ${NM}`), meterCell(n.memPct ?? 0, 100, n.memPct != null ? `mem ${n.memPct}%` : `mem ${NM}`, (n.memPct ?? 0) > 85 ? "var(--h-danger, #e5484d)" : null),
    h("span", { class: "ops-muted" }, `${(k.pods ?? []).filter((p) => p.node === n.id && p.phase === "Running").length} pods running`));
  const nodesEl = h("div", { class: "ops-nodes" }, nodes.length ? nodes.map(nodeRow) : empty("k3s unreachable", "kubectl did not answer from this machine."));
  const q = Table.make(k.queues ?? [], {  selectable: true,rowKey: (x) => x.id, dense: true, columns: [{ key: "q", header: "Kueue queue", render: (x) => labelCell(x.id, x.cohort ? `cohort ${x.cohort}` : null) }, { key: "p", header: "Pending", align: "right", render: (x) => (x.pending ? badge(String(x.pending), "warn") : "0") }, { key: "a", header: "Admitted", align: "right", render: (x) => fmt.int(x.admitted) }], selectable: true });
  q.on("select", (e) => c.emit("select", { entities: e.entities.key ? { queue: e.entities.key } : {}, label: e.entities.key ? `queue ${e.entities.key}` : "cleared" }));
  // fleet-build: runs per day, stacked by outcome, filtered by node
  const bs = buckets(now - 13 * DAYMS, now, DAYMS);
  const nodeIds = [...new Set(runsD.map((r) => r.node))];
  const runsWrap = h("div", {});
  let rnode = "all";
  const drawRuns = () => {
    const rs = runsD.filter((r) => rnode === "all" || r.node === rnode);
    const S = [["ok", "ok", SERIES[4]], ["failed", "failed", "#e5484d"], ["held", "held (exit 75)", SERIES[3]], ["unknown", "no exit line", OTHER]];
    const ch = TimeChart.make({ buckets: bs, bucketMs: DAYMS, series: S.map(([k2, l, col]) => ({ key: k2, label: l, color: col, values: bs.map((t) => sum(rs.filter((r) => r.day === t), (r) => r[k2] ?? 0)) })) }, { utc: true, height: 150, legend: true });
    ch.on("select", (e) => c.emit("select", { entities: rnode !== "all" ? { host: rnode } : {}, range: e.range, label: `fleet-build runs on ${e.label}${rnode !== "all" ? " · " + rnode : ""}` }));
    ch.on("brush", (e) => c.emit("brush", { range: e.range, label: `fleet-build runs ${e.label}` }));
    runsWrap.replaceChildren(ch.el);
  };
  const seg = Segmented.make([{ value: "all", label: "All nodes" }, ...nodeIds.map((n) => ({ value: n, label: n }))], { name: "node", size: "sm", onChange: (v) => { rnode = v; drawRuns(); } });
  drawRuns();
  const rTot = sum(runsD, (r) => (r.ok ?? 0) + (r.failed ?? 0) + (r.held ?? 0) + (r.unknown ?? 0)), rFail = sum(runsD, (r) => r.failed ?? 0), rHeld = sum(runsD, (r) => r.held ?? 0);
  return h("div", {}, head, grid.el, sec("k3s nodes (metrics-server) · click a node", nodesEl), sec("Queues", q.el),
    sec(`fleet-build runs, 14 d · ${fmt.int(rTot)} runs, ${fmt.int(rFail)} failed, ${fmt.int(rHeld)} held for room`, seg.el, runsWrap),
    gap("per-pod memory and GPU share (metrics-server gives node totals only); phone workers report only through their run logs."));
}

/* ================================================================ 7. incident timeline */
/** Units that fail in a quarter of all 30-min buckets, or 100+ times in 48 h, are background noise, not a cause. */
const chronicUnits = (d) => {
  const c = new Map(), n = new Map();
  for (const j of d.journal ?? []) { c.set(j.unit, (c.get(j.unit) ?? 0) + 1); n.set(j.unit, (n.get(j.unit) ?? 0) + (j.n ?? 1)); }
  return new Set([...c.keys()].filter((u) => c.get(u) >= 24 || n.get(u) >= 100));
};
function incidentEvents(d) {
  const ev = [], chronic = chronicUnits(d);
  for (const k of d.kills ?? []) ev.push({ t: k.t, kind: "oom", label: `OOM kill${k.n > 1 ? ` ×${k.n}` : ""} · ${k.comm} (${k.cls}, ${fmt.int(k.anonMb)} MB)`, tone: k.cls === "protected" ? "bad" : "warn", id: `kill:${k.t}`, n: k.n ?? 1 });
  for (const j of d.journal ?? []) ev.push({ t: j.t, kind: j.what === "oom" ? "oom" : "unit", label: `${j.unit} ${j.what === "failed" ? "failed" : j.what === "oom" ? "OOM-killed" : "killed"}${j.n > 1 ? ` ×${j.n}` : ""}`, tone: "warn", id: `unit:${j.unit}`, n: j.n ?? 1, chronic: chronic.has(j.unit) });
  for (const f of d.av?.delegateFailures ?? []) ev.push({ t: f.t, kind: "turn", label: short(f.text.replace(/^Delegated task node:delegated-task:\S*?%3Adelegate-task%3A/, "delegated "), 90), tone: "bad", id: `session:${f.session}`, session: f.session });
  for (const r of d.runs ?? []) if (r.exit != null && r.exit !== 0 && r.exit !== 75) ev.push({ t: r.end ?? r.t, kind: "build", label: `fleet-build on ${r.node} exited ${r.exit}`, tone: "warn", id: `run:${r.node}@${r.t}` });
  return ev.sort((a, b) => b.t - a.t);
}
/** For each failed turn, the OOM kills and unit failures in the 10 minutes before it: the cause chain.
 *  A failed turn with nothing logged before it stays in the list: "cause not recorded" is a finding. */
function chains(ev) {
  return ev.filter((e) => e.kind === "turn").map((f) => ({ f, causes: ev.filter((e) => e.kind !== "turn" && !e.chronic && e.t <= f.t && e.t >= f.t - 10 * 60_000) }));
}
function incidentsBoard(d, c) {
  const now = d.capturedAt, from = now - 48 * HOUR;
  const ev = incidentEvents(d).filter((e) => e.t >= from);
  const ch = chains(ev);
  const step = 30 * 60_000, bs = buckets(from, now, step);
  const K = [["oom", "OOM kills", "#e5484d"], ["unit", "failed units", SERIES[3]], ["turn", "failed turns/delegates", SERIES[1]], ["build", "failed builds", SERIES[2]]];
  const chart = TimeChart.make({ buckets: bs, bucketMs: step, series: K.map(([k, l, col]) => ({ key: k, label: l, color: col, values: bs.map((t) => sum(ev.filter((e) => e.kind === k && bucketOf(e.t, step) === t), (e) => e.n ?? 1)) })) }, { height: 170, legend: true });
  const list = h("ol", { class: "ops-events" });
  let win = null;
  const drawList = () => {
    const vis = ev.filter((e) => !win || (e.t >= win[0] && e.t < win[1])).slice(0, 60);
    list.replaceChildren(...(vis.length ? vis.map((e) => h("li", {}, h("button", { type: "button", class: "ops-ev", "data-kind": e.kind, onclick: () => c.emit("select", { entities: { [e.id.split(":")[0]]: e.id.split(":").slice(1).join(":") }, range: [e.t - 5 * 60_000, e.t + 60_000], label: `${local(e.t)} ${e.label}` }) }, h("time", {}, local(e.t)), dot(e.tone), h("span", {}, e.label)))) : [h("li", { class: "ops-muted" }, "Nothing in this window.")]));
  };
  chart.on("brush", (e) => { win = e.range ?? null; drawList(); c.emit("brush", { range: e.range, label: `incidents ${e.label}` }); });
  chart.on("select", (e) => { win = e.range ?? null; drawList(); c.emit("select", { range: e.range, label: `incidents at ${e.label}` }); });
  drawList();
  const hourly = d.killsHourly ?? [];
  const k14 = sum(hourly, ([, v]) => sum(Object.values(v))), kProt = sum(hourly, ([, v]) => v.protected ?? 0);
  const units = (d.journalUnits ?? []).slice(0, 8), chronic = chronicUnits(d);
  const oomN = (x) => sum(x.causes.filter((y) => y.kind === "oom"), (y) => y.n ?? 1);
  const killed = ch.filter((x) => oomN(x) > 0), unkilled = ch.filter((x) => !oomN(x));
  const explained = killed;
  const head = lead(ch.length ? `${ch.length} failed turn${ch.length === 1 ? "" : "s"} in 48 h. ${killed.length ? `${killed.map((x) => `${local(x.f.t)} followed ${oomN(x)} OOM kill${oomN(x) === 1 ? "" : "s"}`).join("; ")}.` : "None followed an OOM kill."} ${unkilled.length ? `${unkilled.map((x) => local(x.f.t)).join(", ")}: no OOM kill logged in the 10 min before${unkilled.some((x) => x.causes.length) ? ", only unrelated unit failures" : ""}, so their cause is not recorded.` : ""}` : `${ev.length} incidents in 48 h and no failed turns.`);
  const chainEl = ch.length ? h("div", { class: "ops-chains" }, ch.slice(0, 6).map(({ f, causes }) => h("button", { type: "button", class: "ops-chain", "data-bare": causes.some((y) => y.kind === "oom") ? null : "1", onclick: () => c.emit("select", { entities: { session: f.session }, range: [Math.min(f.t - 10 * 60_000, ...causes.map((x) => x.t)), f.t], label: `${local(f.t)} ${oomN({ causes })} OOM kills, ${causes.filter((y) => y.kind === "unit").length} unit failures in the 10 min before → ${short(f.label, 50)}` }) },
    ...(causes.length ? causes.slice(-4).map((x) => h("span", { class: "ops-link", "data-kind": x.kind }, short(x.label, 40))) : [h("span", { class: "ops-link", "data-kind": "none" }, "nothing logged in the 10 min before")]), h("span", { class: "ops-link", "data-kind": "turn" }, `${local(f.t)} · ${short(f.label, 44)}`)))) : null;
  const grid = StatGrid.make([
    { label: "OOM kills (14 d)", value: fmt.int(k14), hint: `${fmt.int(kProt)} protected-class`, tone: kProt ? "bad" : null, spark: (() => { const by = new Map(); for (const [t, v] of hourly) by.set(bucketOf(t, DAYMS), (by.get(bucketOf(t, DAYMS)) ?? 0) + sum(Object.values(v))); return buckets(now - 13 * DAYMS, now, DAYMS).map((t) => by.get(t) ?? 0); })() },
    { label: "Failed turns (48 h)", value: fmt.int(ch.length), hint: `${explained.length} right after an OOM kill`, tone: unkilled.length ? "warn" : null },
    { label: "Unit failures (48 h)", value: fmt.int(sum(d.journalUnits ?? [], (u) => u.n)), hint: units[0] ? `top: ${units[0].unit} ×${units[0].n}` : "" },
  ], { min: 150 });
  const ub = BarList.make(units.map((u, i) => ({ key: u.unit, label: `${u.unit} (${u.what}${chronic.has(u.unit) ? ", chronic: not counted as a cause" : ""})`, value: u.n, color: chronic.has(u.unit) ? OTHER : SERIES[(i + 3) % 10] })));
  ub.on("select", (e) => c.emit("select", { entities: e.entities.key ? { unit: e.entities.key } : {}, label: e.entities.key ? `unit ${e.entities.key} failing repeatedly` : "cleared" }));
  return h("div", {}, head, grid.el, chainEl ? sec("Failed turns and what was logged in the 10 min before · click to send that window", chainEl) : null, sec("Last 48 h on one axis · drag to narrow the list", chart.el), sec("Events", list), units.length ? sec("Units failing most (48 h)", ub.el) : null,
    gap("when a cgroup OOM happened (agent.slice memory.events are counters with no timestamps; sample them to time a kill) and the ACP error text behind \"Internal error\"."));
}

/* ================================================================ 8. is it still running? */
function aliveState(s, now, kills) {
  const age = now - (s.endMs ?? 0);
  const killed = kills.some((k) => Math.abs(k.t - s.endMs) <= 3 * 60_000);
  if ("endReason" in s) {
    // Hermes state.db: closed sessions carry an end reason; an open one is judged by its last message
    if (s.closedMs) return s.endReason === "ws_orphan_reap" ? { st: "suspect", label: "client went away · reaped", tone: "warn" } : { st: "idle", label: `closed · ${String(s.endReason ?? "ended").replace(/_/g, " ")}`, tone: "neutral" };
    if (age < 5 * 60_000) return { st: "working", label: "working now", tone: "ok" };
    if (s.lastRole === "user") return { st: "suspect", label: killed ? "stopped mid-turn · OOM kill near" : "your message unanswered", tone: "bad" };
    if (s.lastRole === "tool") return { st: age < 30 * 60_000 ? "working" : "suspect", label: age < 30 * 60_000 ? `in a tool call · ${fmt.elapsed(age)} quiet` : `stuck in a tool call? ${fmt.elapsed(age)} quiet${killed ? " · OOM kill near" : ""}`, tone: age < 30 * 60_000 ? "ok" : "bad" };
    if (age > 6 * HOUR) return { st: "suspect", label: killed ? "died without closing · OOM kill near" : "never closed · went quiet", tone: "warn" };
    return { st: "waiting", label: "turn ended · waiting on you", tone: "warn" };
  }
  if (age < 5 * 60_000) return { st: "working", label: "working now", tone: "ok" };
  if (s.lastRole === "user") return killed ? { st: "suspect", label: "stopped mid-turn · OOM kill near", tone: "bad" } : { st: "suspect", label: "your message unanswered", tone: "bad" };
  if ((s.failStreak ?? 0) >= 3) return { st: "suspect", label: `ended after ${s.failStreak} failing tools`, tone: "warn" };
  if (age < 2 * HOUR) return { st: "waiting", label: "turn ended · waiting on you", tone: "warn" };
  return { st: "idle", label: "idle", tone: "neutral" };
}
function aliveBoard(d, c) {
  const now = d.capturedAt, kills = d.kills ?? [];
  const live = (d.hermesLive ?? []).filter((s) => (s.msgs ?? 0) > 0);
  const ss = [...live, ...(d.av?.alive ?? []).filter((s) => !live.length || s.agent !== "hermes")].map((s) => ({ ...s, ...aliveState(s, now, kills) })).sort((a, b) => b.endMs - a.endMs);
  const n = (st) => ss.filter((s) => s.st === st).length;
  const head = lead(`${n("working")} working now, ${n("waiting")} waiting on you, ${n("suspect")} look stopped (unanswered message or failing tools)${ss.find((s) => s.st === "suspect") ? `: newest "${short(ss.find((s) => s.st === "suspect").title, 40)}"` : ""}.`);
  let filt = "all";
  const byId = new Map(ss.map((s) => [s.id, s]));
  const tbl = Table.make(ss, {
     selectable: true,rowKey: (s) => s.id, dense: true, limit: 10, pinnable: true, initialSort: { key: "last", dir: "desc" }, filter: (s) => filt === "all" || s.st === filt,
    columns: [
      { key: "st", header: "State", render: (s) => h("span", { class: "ops-st" }, dot(s.tone, s.st === "working"), s.label), sort: (s) => s.st },
      { key: "s", header: "Session", wrap: true, render: (s) => labelCell(short(s.title ?? s.id, 46), `${s.agent}${s.source ? " · " + s.source : ""}${s.machine ? " · " + s.machine : ""} · ${fmt.int(s.msgs)} msgs`), sort: (s) => s.title ?? "" },
      { key: "last", header: "Last activity", align: "right", render: (s) => fmt.ago(s.endMs, now), sort: (s) => s.endMs },
    ],
    expanded: (s) => keyValues([["Started", local(s.startMs)], ["Last message", `${local(s.endMs)} (${s.lastRole || "?"})`], ["Source", "endReason" in s ? "Hermes state.db (live)" : "AgentsView (synced)"], s.closedMs ? ["Closed", `${local(s.closedMs)} · ${s.endReason}`] : ["Outcome", s.outcome ?? "open"], ["Failing tools at the end", fmt.int(s.failStreak ?? 0)], ["OOM kills ±3 min of the end", fmt.int(kills.filter((k) => Math.abs(k.t - s.endMs) <= 3 * 60_000).length)]]),
  });
  for (const t of ["select", "pin"]) tbl.on(t, (e) => { const s = byId.get(e.entities.key); c.emit(t, s ? { entities: { session: s.id, harness: s.agent }, range: [s.startMs, s.endMs], label: `${short(s.title, 40)} (${s.agent}): ${s.label}, last ${fmt.ago(s.endMs, now)}` } : { label: "cleared" }); });
  const seg = Segmented.make([{ value: "all", label: `All ${ss.length}` }, { value: "working", label: `Working ${n("working")}` }, { value: "waiting", label: `Waiting ${n("waiting")}` }, { value: "suspect", label: `Stopped? ${n("suspect")}` }, { value: "idle", label: `Idle ${n("idle")}` }], { name: "state", size: "sm", onChange: (v) => { filt = v; tbl.refresh(); } });
  seg.on("filter", (e) => c.emit("filter", { filter: e.filter, label: e.label }));
  const byH = new Map(); for (const s of ss) byH.set(s.agent, (byH.get(s.agent) ?? 0) + 1);
  const lag = d.avLastMs ? now - d.avLastMs : null;
  // live = Hermes rows straight from state.db; everything else is as fresh as AgentsView's last sync
  return h("div", {}, head, StatGrid.make([{ label: "AgentsView lag", value: lag == null ? NM : fmt.elapsed(lag), hint: live.length ? "Hermes rows read live; others lag this much" : "newest message it has", tone: lag > 15 * 60_000 ? "warn" : null }, { label: "Working", value: fmt.int(n("working")), tone: "ok" }, { label: "Waiting on you", value: fmt.int(n("waiting")), tone: n("waiting") ? "warn" : null }, { label: "Stopped?", value: fmt.int(n("suspect")), tone: n("suspect") ? "bad" : null }, { label: "Harnesses", value: fmt.int(byH.size), hint: [...byH].map(([k, v]) => `${k} ${v}`).join(" · ") }], { min: 120 }).el,
    seg.el, tbl.el, gap("a heartbeat: \"working\" means a message landed in the last 5 min. A long tool call (build, sleep-poll) looks quiet until it returns, and non-Hermes harnesses are only as fresh as AgentsView's last sync."));
}

/* ================================================================ 9. why was it slow? */
function slowBoard(d, c) {
  const now = d.capturedAt;
  const alive = new Map((d.av?.alive ?? []).map((s) => [s.id, s]));
  const ss = (d.av?.slow ?? []).filter((s) => s.msgs > 4).map((s) => ({ ...s, wall: (s.end ?? 0) - (s.start ?? 0), title: s.title ?? alive.get(s.id)?.title ?? s.id, agent: s.agent ?? alive.get(s.id)?.agent ?? "" }));
  const top = [...ss].sort((a, b) => b.working - a.working);
  const W = sum(ss, (s) => s.working), U = sum(ss, (s) => s.waiting), R = sum(ss, (s) => s.reply);
  const stallN = sum(ss, (s) => s.stalls.length);
  const head = lead(`Across ${ss.length} sessions (48 h): agents worked ${fmt.elapsed(W)}, first replies took ${fmt.elapsed(R)}, and they waited on you ${fmt.elapsed(U)}. ${stallN} stalls (one step > 10 min) are the usual "why is it slow" answer.`);
  const byId = new Map(ss.map((s) => [s.id, s]));
  const detail = h("div", { class: "ops-slowd" }, para("Pick a session to see its stalls.", "ops-muted"));
  const tbl = Table.make(top, {
     selectable: true,rowKey: (s) => s.id, dense: true, limit: 8, pinnable: true, initialSort: { key: "work", dir: "desc" },
    columns: [
      { key: "s", header: "Session", wrap: true, render: (s) => labelCell(short(s.title, 42), `${s.agent} · ${fmt.int(s.msgs)} msgs · ${fmt.ago(s.end, now)}`), sort: (s) => s.title },
      { key: "split", header: "Working · reply · waiting on you", width: 210, render: (s) => ShareBar.make([{ key: "w", label: "working", value: s.working, color: SERIES[0] }, { key: "r", label: "reply", value: s.reply, color: SERIES[3] }, { key: "u", label: "waiting on you", value: s.waiting, color: OTHER }], { height: 8 }).el },
      { key: "work", header: "Working", align: "right", render: (s) => fmt.elapsed(s.working), sort: (s) => s.working },
      { key: "p95", header: "Step p50/p95", align: "right", render: (s) => `${fmt.elapsed(s.stepP50 ?? 0)} / ${fmt.elapsed(s.stepP95 ?? 0)}`, sort: (s) => s.stepP95 ?? 0 },
      { key: "st", header: "Stalls", align: "right", render: (s) => (s.stalls.length ? badge(String(s.stalls.length), "warn") : "0"), sort: (s) => s.stalls.length },
    ],
  });
  for (const t of ["select", "pin"]) tbl.on(t, (e) => {
    const s = byId.get(e.entities.key);
    if (s) detail.replaceChildren(s.stalls.length ? h("ol", { class: "ops-events" }, s.stalls.map(([t0, g]) => h("li", {}, h("button", { type: "button", class: "ops-ev", "data-kind": "stall", onclick: () => c.emit("select", { entities: { session: s.id }, range: [t0, t0 + g], label: `stall ${fmt.elapsed(g)} at ${local(t0)} in ${short(s.title, 30)}` }) }, h("time", {}, local(t0)), dot("warn"), h("span", {}, `one step took ${fmt.elapsed(g)}`))))) : para("No step over 10 min: the time went into many normal steps.", "ops-muted"),
      para(s.agent === "hermes" ? "For span-level detail, paste the reference and ask \"why was this slow?\": trace_query draws the session's timeline." : "Span-level traces exist only for Hermes and omp sessions.", "ops-muted"));
    c.emit(t, s ? { entities: { session: s.id, harness: s.agent }, range: [s.start, s.end], label: `${short(s.title, 40)}: working ${fmt.elapsed(s.working)}, waiting ${fmt.elapsed(s.waiting)}, ${s.stalls.length} stalls` } : { label: "cleared" });
  });
  const share = ShareBar.make([{ key: "working", label: "agent working", value: W, color: SERIES[0] }, { key: "reply", label: "first reply", value: R, color: SERIES[3] }, { key: "waiting", label: "waiting on you", value: U, color: OTHER }], { height: 12, selectable: true });
  share.on("select", (e) => c.emit("select", { entities: { phase: e.entities.key }, label: `${e.label}: ${fmt.elapsed(e.value)} over ${ss.length} sessions` }));
  return h("div", {}, head, share.el, Legend.make([["agent working", SERIES[0], W], ["first reply", SERIES[3], R], ["waiting on you", OTHER, U]].map(([l, col, v]) => ({ key: l, label: l, color: col, value: fmt.elapsed(v) }))).el,
    sec("Sessions by agent working time · pick one", tbl.el), sec("Stalls", detail), gap("which tool or model call made a step slow (AgentsView keeps tool results inside the assistant message, so a step is tool + next model call). trace_query splits it for Hermes."));
}

/* ================================================================ 10. routing lanes */
function routingBoard(d, c) {
  const lanes = (d.dispatch ?? []).map((x) => ({ ...x, okRate: x.ok / Math.max(1, x.n), kinds: (x.kinds ?? []).join(", ") })).sort((a, b) => b.n - a.n);
  const rows = { length: sum(lanes, (l) => l.n) };
  const fast = lanes.filter((l) => l.okRate >= 0.8 && l.p50 != null && l.n >= 5).sort((a, b) => a.p50 - b.p50);
  const flaky = lanes.filter((l) => l.okRate < 0.8 && l.n >= 5);
  const last = Math.max(0, ...lanes.map((l) => l.last ?? 0));
  const head = lead(lanes.length ? `${fast[0] ? `${fast[0].lane} is the fastest reliable lane (p50 ${fmt.dur(fast[0].p50 * 1000)}, ${fmt.pct(fast[0].okRate, 0)} ok)` : "No lane is both fast and reliable"}${flaky.length ? `; ${flaky.map((l) => `${l.lane} ${fmt.pct(l.okRate, 0)} ok`).join(", ")} fail often` : ""}. Newest dispatch ${fmt.ago(last, d.capturedAt)}.` : "The dispatch ledger is empty.");
  const byKey = new Map(lanes.map((l) => [l.lane, l]));
  const tbl = Table.make(lanes, {
     selectable: true,rowKey: (l) => l.lane, dense: true, pinnable: true, initialSort: { key: "n", dir: "desc" },
    columns: [
      { key: "lane", header: "Lane", render: (l) => labelCell(l.lane, short(l.kinds, 36)), sort: (l) => l.lane },
      { key: "n", header: "Jobs", align: "right", render: (l) => fmt.int(l.n), sort: (l) => l.n },
      { key: "ok", header: "OK", align: "right", width: 100, render: (l) => meterCell(l.okRate, 1, fmt.pct(l.okRate, 0), l.okRate < 0.8 ? "var(--h-warning, #f5a524)" : null), sort: (l) => l.okRate },
      { key: "rl", header: "429s", align: "right", render: (l) => (l.rl ? badge(String(l.rl), "warn") : "0"), sort: (l) => l.rl },
      { key: "p50", header: "p50 / p95", align: "right", render: (l) => (l.p50 == null ? NM : `${fmt.dur(l.p50 * 1000)} / ${fmt.dur(l.p95 * 1000)}`), sort: (l) => l.p50 ?? 1e9 },
      { key: "usd", header: "$", align: "right", render: (l) => fmt.cost(l.usd), sort: (l) => l.usd },
    ],
  });
  for (const t of ["select", "pin"]) tbl.on(t, (e) => { const l = byKey.get(e.entities.key); c.emit(t, l ? { entities: { lane: l.lane }, label: `${l.lane}: ${l.n} jobs, ${fmt.pct(l.okRate, 0)} ok, p50 ${l.p50 == null ? NM : fmt.dur(l.p50 * 1000)}, ${l.rl} rate-limited` } : { label: "cleared" }); });
  const bl = BarList.make(fast.slice(0, 8).map((l, i) => ({ key: l.lane, label: l.lane, value: l.p50, display: fmt.dur(l.p50 * 1000), color: SERIES[i % 10] })));
  bl.on("select", (e) => c.emit("select", { entities: e.entities.key ? { lane: e.entities.key } : {}, label: e.entities.key ? `lane ${e.entities.key} (fast + reliable)` : "cleared" }));
  return h("div", {}, head, StatGrid.make([{ label: "Dispatches", value: fmt.int(rows.length), hint: `${lanes.length} lanes` }, { label: "OK", value: fmt.pct(sum(lanes, (l) => l.ok) / Math.max(1, rows.length), 0) }, { label: "Rate-limited", value: fmt.int(sum(lanes, (l) => l.rl)) }, { label: "TTFT · tok/s", value: NM, hint: "no per-call timing" }], { min: 120 }).el,
    fast.length ? sec("Fast and reliable (≥ 80% ok, ≥ 5 jobs) · seconds per job, p50", bl.el) : null, sec("Every lane in the dispatch ledger", tbl.el),
    gap("time to first token and tokens/s per call: the ledger stores whole-job seconds. Free-lane quota left is only seen as an error."));
}

/* ================================================================ 11. what we measure (and don't) */
function sourcesBoard(d, c) {
  const s = Object.entries(d.sources ?? {});
  const okN = s.filter(([, v]) => v.ok).length;
  const head = lead(`${okN} of ${s.length} sources answered for this snapshot; ${d.gaps.length} numbers you ask about are not measured anywhere yet.`);
  const tbl = Table.make(d.gaps, {
     selectable: true,rowKey: (g) => g.metric, dense: true, pinnable: true,
    columns: [{ key: "m", header: "Not measured yet", wrap: true, render: (g) => labelCell(g.metric, g.why) }, { key: "o", header: "Owner", render: (g) => badge(g.owner, "neutral") }, { key: "b", header: "Board", render: (g) => g.board }],
  });
  for (const t of ["select", "pin"]) tbl.on(t, (e) => { const g = d.gaps.find((x) => x.metric === e.entities.key); c.emit(t, g ? { entities: { gap: g.metric.replace(/[^\w]+/g, "-").slice(0, 40), owner: g.owner }, label: `gap: ${g.metric} (owner ${g.owner})` } : { label: "cleared" }); });
  const list = h("div", { class: "ops-srcs" }, s.map(([n, v]) => h("span", { class: "ops-src", "data-ok": v.ok ? "1" : "0", title: v.error ?? "" }, dot(v.ok ? "ok" : "bad"), n, v.rows != null ? h("small", {}, ` ${fmt.compact(v.rows)}`) : null)));
  return h("div", {}, head, sec("Sources read for this snapshot (read-only)", list), sec("Gaps · pick one to ask the owning repo for it", tbl.el));
}

/** A board kind: the playlist and export tools read the keys of KINDS_OPS, so each entry is `"kind": define(...)`. */
const define = (kind, label, verb, status, fn) => ({ label, verb: () => verb, make: (a, r, input) => board(a, kind, { title: verb, status }, input, fn) });
export const KINDS_OPS = {
  "ops-burn": define("ops-burn", "Ops · subscription burn lanes", "Am I on pace for every subscription?", "Capacity", burnBoard),
  "ops-alive": define("ops-alive", "Ops · is it still running?", "Is my agent still running, and why did it stop?", "Liveness", aliveBoard),
  "ops-incidents": define("ops-incidents", "Ops · incident timeline", "What broke, and what caused it?", "Incidents", incidentsBoard),
  "ops-fleet": define("ops-fleet", "Ops · hosts and k3s", "Where is there room to run work?", "Resources", fleetBoard),
  "ops-slow": define("ops-slow", "Ops · why was it slow?", "Why was this session slow?", "Latency", slowBoard),
  "ops-models": define("ops-models", "Ops · model mix", "Which models am I actually using?", "Models", modelsBoard),
  "ops-tokens": define("ops-tokens", "Ops · tokens, cache and cost", "Is prompt caching working, and what does it cost?", "Tokenomics", tokensBoard),
  "ops-context": define("ops-context", "Ops · context pressure", "Where is context running out?", "Context", contextBoard),
  "ops-tools": define("ops-tools", "Ops · tool-call health", "Which tools fail or flood the context?", "Tools", toolsBoard),
  "ops-routing": define("ops-routing", "Ops · routing lanes", "Which lane is fast and reliable right now?", "Routing", routingBoard),
  "ops-sources": define("ops-sources", "Ops · what we measure", "What can't we see yet?", "Gaps", sourcesBoard),
};
/** Which catalog app each board shows under (all exist in the public catalog). */
export const OPS_APPS = { "ops-burn": "z0intelligence", "ops-alive": "hermes-agent", "ops-incidents": "prometheus", "ops-fleet": "k3s", "ops-slow": "omp-stats", "ops-models": "omp-stats", "ops-tokens": "omp-stats", "ops-context": "hermes-agent", "ops-tools": "hermes-agent", "ops-routing": "z0intelligence", "ops-sources": "grafana" };
