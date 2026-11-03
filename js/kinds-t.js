// Trace cards: omp /stats views as ephemeral cards. Each kind takes the JSON an omp-stats endpoint
// returns (see src/schema/card.v0.json → $defs.traceInput) and renders it in the host theme with the
// dashboard's own visual language: hairline stat grids, tabular numbers, the cyan/amber/pink span
// palette, segmented range toggles. Every card is interactive inline.
//
//   make(app, rng, input?, opts?)  input: API payload (fixture default when omitted)
//                                  opts:  { layers: Set<"spans"|"tokens"|"cost"|"errors"|"subagents"|"transcript">,
//                                           range, sort, focusTool, onSpan(span, track, trace) }
import { h, anim, stagger } from "./motion.js";
import { shell, seg, svg } from "./shell.js";
import { ready, api, fInt, fCompact, fCost, fPct, fRate, fDur, fElapsed, fClock, fDay, fDayUTC, SERIES, OTHER, colorMap, allSpans, toolLatency, trackCost, groupErrors, spanErrors, timeScale } from "./trace-data.js";

export const ALL_LAYERS = ["spans", "tokens", "cost", "errors", "subagents", "transcript"];
const DEFAULT_LAYERS = new Set(["spans", "tokens", "cost", "errors", "subagents"]);
const lay = (o) => o?.layers ?? DEFAULT_LAYERS;
const LANE = { turn: "Input", model: "Model", tool: "Tools", subagent: "Agents", background: "Bg" };

/* ---------------- shared bits ---------------- */
function stat(label, value, foot, cls = "") { return h("div", { class: "os-stat " + cls }, h("div", { class: "os-sl" }, label), h("div", { class: "os-sv" }, value), foot != null ? h("div", { class: "os-sf" }, foot) : null); }
const statGrid = (cells, min) => h("div", { class: "os-grid", style: min ? { "--min": `${min}px` } : null }, cells.filter(Boolean));
const panel = (title, desc, body, actions) => h("section", { class: "os-panel" }, h("div", { class: "os-ph" }, h("div", {}, h("div", { class: "os-pt" }, title), desc ? h("div", { class: "os-pd" }, desc) : null), actions ? h("div", { class: "os-pa" }, actions) : null), body);
const sw = (c) => h("i", { class: "os-sw", style: { background: c } });
const mono = (t, cls = "") => h("span", { class: "os-mono " + cls }, t);
function spark(values, color, w = 160, hgt = 26) {
  if (values.length < 2) return null;
  const mx = Math.max(...values, 1e-9);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, hgt - 2 - (v / mx) * (hgt - 4)]);
  const d = "M" + pts.map((p) => p.map((x) => x.toFixed(1)).join(" ")).join(" L");
  return svg("svg", { class: "os-spark", viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: "none" }, svg("path", { d: `${d} L${w} ${hgt} L0 ${hgt}Z`, fill: color, opacity: ".16" }), svg("path", { d, fill: "none", stroke: color, "stroke-width": "1.5", "vector-effect": "non-scaling-stroke" }));
}
/** One card whose body fills in once the fixture (or a passed payload) is ready. */
function traceCard(a, kind, head, build, specExtra = {}) {
  const body = h("div", { class: "os" }, h("div", { class: "os-load" }, "Loading trace…"));
  const el = shell(a, kind, { ...head, body, cls: "k-trace" });
  let built = null;
  const done = ready().then(async (d) => { built = await build(d); body.replaceChildren(built.node); return built; }).catch((e) => { body.replaceChildren(h("div", { class: "os-empty" }, "Trace data unavailable")); console.error(e); });
  el.traceReady = done;
  return { el, done, async play() { const b = await done; if (b?.play) b.play(); else if (b?.node) stagger(b.node.querySelectorAll(".os-stat, .os-panel"), { gap: 40, y: 6 }); }, spec: { kind, app: a.id, ...specExtra } };
}
const latestTrace = (d, pred = () => true) => d.sessions.filter(pred).map((s) => d.traces[s.file]).filter(Boolean)[0];

/* ---------------- span drawer (traces/SpanDrawer.tsx) ---------------- */
export function spanDrawer(span, track, trace, entries, { onClose, onTrack } = {}) {
  const e = span.entryId ? entries?.[`${track.file}#${span.entryId}`]?.message : null;
  const m = [["Duration", fDur(span.end - span.start) + (span.unterminated ? " · unterminated" : "")], ["Start", fClock(span.start)], ["Track", track.label]];
  if (span.kind === "model") {
    const noUsage = span.tokens == null && !e?.usage;
    m.push(["Tokens", noUsage ? "not recorded" : fInt(span.tokens ?? e.usage.totalTokens)], ["Cost", noUsage ? "N/A" : "$" + (span.cost ?? e?.usage?.cost?.total ?? 0).toFixed(4)], ["TTFT", fDur(span.ttft ?? e?.ttft ?? null)], ["Model", span.model ?? e?.model ?? "-"]);
    if (e?.usage) m.push(["Input / output / cached", `${fInt(e.usage.input)} / ${fInt(e.usage.output)} / ${fInt(e.usage.cacheRead)}`]);
    if (e?.provider) m.push(["Provider", e.provider]);
    if (e?.stopReason) m.push(["Stop reason", e.stopReason]);
  }
  if (span.kind === "tool") { m.push(["Tool", span.label]); if (span.resultChars != null) m.push(["Result", `${fInt(span.resultChars)} chars`]); }
  if (span.kind === "subagent") { m.push(["Agent", span.label]); if (span.model) m.push(["Model", span.model]); }
  const kids = [h("div", { class: "os-dm" }, m.map(([k, v]) => h("div", {}, h("div", { class: "os-sl" }, k), h("div", { class: "os-mono" }, v))))];
  if (span.isError) kids.push(h("div", { class: "os-dsec" }, h("div", { class: "os-sl bad" }, "Error"), h("pre", { class: "os-pre bad" }, span.errorKind ?? e?.errorMessage ?? "failed")));
  if (span.kind === "tool" && span.detail) kids.push(h("div", { class: "os-dsec" }, h("div", { class: "os-sl" }, "Args"), h("pre", { class: "os-pre" }, span.detail)));
  if (span.kind === "tool") kids.push(h("div", { class: "os-dsec" }, h("div", { class: "os-sl" }, "Result excerpt"), h("pre", { class: "os-pre dim" }, span.resultChars != null ? `‹${fInt(span.resultChars)} chars of tool output, withheld from the public fixture›` : "‹tool output withheld›")));
  if (span.kind === "subagent" && span.detail) kids.push(h("div", { class: "os-dsec" }, h("div", { class: "os-sl" }, "Task"), h("pre", { class: "os-pre" }, span.detail), span.childTrackId && onTrack ? h("button", { class: "os-btn", type: "button", onclick: () => onTrack(span.childTrackId) }, "Open child track ", mono(span.childTrackId)) : null));
  return h("div", { class: "os-drawer", "data-kind": span.kind }, h("div", { class: "os-dh" }, h("div", {}, h("b", {}, span.label), h("span", { class: `os-kchip k-${span.kind}` }, span.kind)), onClose ? h("button", { class: "os-x", type: "button", "aria-label": "Close span", onclick: onClose }, "✕") : null), ...kids);
}

/* ---------------- summary strip (traces/SummaryStrip.tsx) ---------------- */
function summaryNode(trace, o) {
  const L = lay(o), s = trace.summary, w = Math.max(1, s.wallMs);
  const errs = allSpans(trace).filter(({ s: x }) => x.isError).length;
  const cells = [
    stat("Wall time", fElapsed(s.wallMs), `${fClock(trace.startedAt)} start`),
    stat("Model time", fElapsed(s.modelMs), `${fPct(s.modelMs / w)} of wall`),
    stat("Tool time", fElapsed(s.toolMs), `${fPct(s.toolMs / w)} of wall`),
    stat("Idle", fElapsed(s.idleMs), `${fPct(s.idleMs / w)} of wall`),
    stat("Requests", fInt(s.requests), `${fInt(s.toolCalls)} tool calls`),
    L.has("subagents") ? stat("Agents", fInt(s.subagents), `${trace.tracks.length - 1} child tracks`) : null,
    L.has("tokens") ? stat("Tokens", s.totalTokens ? fCompact(s.totalTokens) : "-", s.totalTokens ? null : "not recorded") : null,
    L.has("cost") ? stat("Cost", s.totalTokens || s.costTotal ? fCost(s.costTotal) : "N/A", s.unpricedRequests ? `${s.unpricedRequests} unpriced` : null) : null,
    L.has("errors") ? stat("Errors", fInt(errs), `${fRate(errs / Math.max(1, s.requests + s.toolCalls))} of calls`, errs ? "bad" : "") : null,
  ];
  const out = h("div", { class: "os-sum" }, statGrid(cells, 104));
  if (L.has("subagents") && trace.tracks.length > 1) {
    const rows = trackCost(trace);
    const mx = Math.max(...rows.map((r) => (L.has("cost") && r.cost ? r.cost : r.modelMs)), 1e-9);
    out.append(h("table", { class: "os-table dense" }, h("thead", {}, h("tr", {}, h("th", {}, "Track"), h("th", { class: "r" }, "Req"), h("th", { class: "r" }, "Tools"), h("th", { class: "r" }, "Model time"), L.has("cost") ? h("th", { class: "r" }, "Cost") : null, h("th", {}, ""))),
      h("tbody", {}, rows.map((r) => h("tr", {}, h("td", {}, h("span", { class: "os-tn" }, r.track.label), r.track.model ? mono(" " + r.track.model, "dim") : null), h("td", { class: "r os-mono" }, fInt(r.requests)), h("td", { class: "r os-mono" }, fInt(r.tools)), h("td", { class: "r os-mono" }, fElapsed(r.modelMs)), L.has("cost") ? h("td", { class: "r os-mono" }, r.cost || trace.summary.totalTokens ? fCost(r.cost) : "N/A") : null, h("td", { class: "os-barc" }, h("i", { class: "os-bar " + (r.track.id === "main" ? "os-b1" : "os-b2"), style: { width: `${((L.has("cost") && r.cost ? r.cost : r.modelMs) / mx) * 100}%` } })))))));
  }
  return out;
}

/* ---------------- timeline (traces/TimelineCanvas.tsx + Minimap.tsx) ---------------- */
function readPalette(el) {
  const cs = getComputedStyle(el);
  const v = (n, f) => cs.getPropertyValue(n).trim() || f;
  return { turn: v("--os-turn", "#a0a0a8"), model: v("--os-model", "#5ad8e6"), tool: v("--os-tool", "#f5a524"), subagent: v("--os-agent", "#ed4abf"), background: v("--os-bg", "#46464c"), bad: v("--os-bad", "#ff6166"), badSoft: v("--os-bad-soft", "rgba(255,97,102,.13)"), ink1: v("--os-ink-1", "#ededef"), ink2: v("--os-ink-2", "#a0a0a8"), ink3: v("--os-ink-3", "#6c6c74"), grid: v("--os-line-1", "rgba(127,127,127,.12)"), band: v("--os-band", "rgba(127,127,127,.05)"), focus: v("--os-focus", "#5ad8e6"), inv: v("--os-inv", "#0a0a0b"), sans: v("--h-font", "system-ui"), mono: v("--h-mono", "ui-monospace") };
}

export function timeline(trace, entries, o = {}) {
  const L = lay(o);
  const st = { compress: o.compress ?? true, sel: null, collapsed: new Set(), filter: o.focusTool ?? "", view: null, hover: null };
  let sc = timeScale(trace, st.compress);
  st.view = [...sc.domain];
  const root = h("div", { class: "os-tl" });
  const legend = h("div", { class: "os-legend" }, ["turn", "model", "tool", "subagent", "background"].map((k) => h("span", {}, h("i", { class: `os-lg k-${k}` }), k === "turn" ? "Input" : k === "subagent" ? "Agent" : k === "background" ? "Background" : LANE[k].replace("Tools", "Tool"))));
  const search = h("input", { class: "os-search", type: "search", placeholder: "Filter spans…", value: st.filter, oninput: (e) => { st.filter = e.target.value.trim().toLowerCase(); draw(); } });
  const compress = h("label", { class: "os-check" }, h("input", { type: "checkbox", checked: st.compress, onchange: (e) => { st.compress = e.target.checked; sc = timeScale(trace, st.compress); st.view = [...sc.domain]; draw(); } }), "Compress idle");
  const zoom = (f, cx = 0.5) => { const [a, b] = st.view, w = b - a, nw = Math.min(sc.domain[1] - sc.domain[0], Math.max(400, w * f)); const c = a + w * cx; let na = c - nw * cx; na = Math.max(sc.domain[0], Math.min(sc.domain[1] - nw, na)); st.view = [na, na + nw]; draw(); };
  const tools = h("div", { class: "os-tlbar" }, h("div", { class: "os-zoom" }, h("button", { type: "button", "aria-label": "Zoom out", onclick: () => zoom(1.6) }, "−"), h("button", { type: "button", "aria-label": "Zoom in", onclick: () => zoom(1 / 1.6) }, "+"), h("button", { type: "button", onclick: () => { st.view = [...sc.domain]; draw(); } }, "Fit")), compress, search, h("span", { class: "grow" }), legend);
  const mini = h("canvas", { class: "os-mini", "aria-label": "Trace minimap: drag to scrub" });
  const cv = h("canvas", { class: "os-cv", "aria-label": "Trace timeline: drag to pan, click a span to inspect" });
  const tip = h("div", { class: "os-tip", hidden: true });
  const drawerSlot = h("div", { class: "os-dslot" });
  const transcript = L.has("transcript") ? h("div", { class: "os-tx" }) : null;
  root.append(tools, mini, h("div", { class: "os-cvwrap" }, cv, tip), drawerSlot, ...(transcript ? [transcript] : []));

  const tracks = trace.tracks.filter((t) => t.id === "main" || L.has("subagents"));
  function rows() {
    const out = [];
    for (const t of tracks) {
      out.push({ type: "head", t, hgt: 24 });
      if (st.collapsed.has(t.id)) continue;
      for (const k of ["turn", "model", "tool", "subagent", "background"]) if (t.spans.some((s) => s.kind === k)) out.push({ type: "lane", t, k, hgt: 20 });
      if (L.has("cost") && t.spans.some((s) => s.cost)) out.push({ type: "cost", t, hgt: 22 });
      out.push({ type: "gap", hgt: 8 });
    }
    return out;
  }
  let geo = null, P = null;
  const RULER = 20;
  function draw() {
    const W = Math.max(280, root.clientWidth || 600);
    const G = W < 520 ? 82 : 150;
    const rs = rows();
    const H = RULER + rs.reduce((n, r) => n + r.hgt, 0) + 4;
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = `${H}px`;
    P = readPalette(root);
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const [v0, v1] = st.view, X = (t) => G + ((sc.toU(t) - v0) / (v1 - v0)) * (W - G - 6);
    geo = { W, G, X, rs, hits: [], heads: [] };
    // ruler
    c.font = `10px ${P.mono}`; c.fillStyle = P.ink3; c.strokeStyle = P.grid; c.lineWidth = 1;
    const nT = Math.max(2, Math.floor((W - G) / 110));
    for (let i = 0; i <= nT; i++) {
      const u = v0 + ((v1 - v0) * i) / nT, x = G + ((W - G - 6) * i) / nT, t = sc.toT(u);
      c.beginPath(); c.moveTo(x + 0.5, RULER - 4); c.lineTo(x + 0.5, H); c.stroke();
      const lbl = i === 0 ? fClock(t) : `+${Math.floor((t - trace.startedAt) / 60000)}:${String(Math.floor(((t - trace.startedAt) % 60000) / 1000)).padStart(2, "0")}`;
      if (i < nT || W > 400) { c.textAlign = i === nT ? "right" : "left"; c.fillText(lbl, x + (i === nT ? -2 : 3), 12); }
    }
    // idle bridges
    for (const g of sc.gaps) { const x = G + ((g.uMid - v0) / (v1 - v0)) * (W - G - 6); if (x < G || x > W) continue; c.fillStyle = P.band; c.fillRect(x - 6, RULER, 12, H - RULER); c.fillStyle = P.ink3; c.textAlign = "center"; c.fillText("⋯", x, RULER + 10); }
    // turn bands on main
    const turns = trace.tracks[0].spans.filter((s) => s.kind === "turn");
    turns.forEach((s, i) => { if (i % 2) { c.fillStyle = P.band; const a = Math.max(G, X(s.start)), b = Math.min(W, X(s.end)); if (b > a) c.fillRect(a, RULER, b - a, H - RULER); } });
    // rows
    let y = RULER;
    const maxTok = Math.max(1, ...allSpans(trace).map(({ s }) => s.tokens ?? 0));
    const q = st.filter;
    for (const r of rs) {
      if (r.type === "head") {
        c.font = `600 12px ${P.sans}`; c.fillStyle = P.ink1; c.textAlign = "left";
        const caret = st.collapsed.has(r.t.id) ? "▸ " : "▾ ";
        c.fillText(clip(c, caret + r.t.label, G - 10), 4, y + 16);
        if (W > 520 && r.t.model) { const lw = c.measureText(caret + r.t.label).width; c.font = `10.5px ${P.mono}`; c.fillStyle = P.ink3; c.fillText(clip(c, r.t.model, G - 14 - lw), 8 + lw, y + 16); }
        geo.heads.push({ y0: y, y1: y + r.hgt, t: r.t });
        for (const m of r.t.markers) { const x = X(m.time); if (x < G || x > W) continue; c.fillStyle = P.ink1; c.beginPath(); c.moveTo(x, y + 8); c.lineTo(x + 4, y + 12); c.lineTo(x, y + 16); c.lineTo(x - 4, y + 12); c.fill(); geo.hits.push({ x0: x - 5, x1: x + 5, y0: y + 6, y1: y + 18, marker: m, t: r.t }); }
      } else if (r.type === "lane") {
        c.font = `11px ${P.sans}`; c.fillStyle = P.ink3; c.textAlign = "left"; c.fillText(LANE[r.k], 16, y + 14);
        for (const s of r.t.spans) {
          if (s.kind !== r.k) continue;
          let x0 = X(s.start), x1 = X(s.end);
          if (x1 < G || x0 > W - 3) continue;
          x0 = Math.max(G, x0); x1 = Math.min(W - 2, Math.max(x0 + 1.5, x1));
          let hh = r.hgt - 4, yy = y + 2;
          if (L.has("tokens") && s.kind === "model" && s.tokens) { hh = Math.max(5, (r.hgt - 4) * Math.sqrt(s.tokens / maxTok)); yy = y + 2 + (r.hgt - 4 - hh); }
          const dim = q && !`${s.label} ${s.kind} ${s.errorKind ?? ""}`.toLowerCase().includes(q);
          c.globalAlpha = dim ? 0.18 : 1;
          const err = s.isError && L.has("errors");
          c.fillStyle = err ? P.bad : P[s.kind];
          roundRect(c, x0, yy, x1 - x0, hh, Math.min(2.5, (x1 - x0) / 2)); c.fill();
          if (err) { c.fillStyle = P.badSoft; c.fillRect(x0, y, x1 - x0, r.hgt); }
          if (x1 - x0 > 46 && hh > 12) { c.font = `10.5px ${P.sans}`; c.fillStyle = s.kind === "background" || s.kind === "turn" ? P.ink1 : P.inv; c.fillText(clip(c, s.label, x1 - x0 - 6), x0 + 4, yy + hh - 5); }
          if (st.sel === s) { c.strokeStyle = P.focus; c.lineWidth = 2; roundRect(c, x0 - 1.5, y + 0.5, x1 - x0 + 3, r.hgt - 1, 3); c.stroke(); c.lineWidth = 1; }
          c.globalAlpha = 1;
          geo.hits.push({ x0: x0 - 1, x1: x1 + 1, y0: y, y1: y + r.hgt, s, t: r.t });
        }
      } else if (r.type === "cost") {
        c.font = `11px ${P.sans}`; c.fillStyle = P.ink3; c.textAlign = "left"; c.fillText("Cost", 16, y + 14);
        const ms = r.t.spans.filter((s) => s.kind === "model" && s.cost).sort((a, b) => a.end - b.end);
        const total = ms.reduce((n, s) => n + s.cost, 0) || 1;
        let acc = 0; c.beginPath(); c.moveTo(Math.max(G, X(trace.startedAt)), y + r.hgt - 3);
        for (const s of ms) { acc += s.cost; c.lineTo(Math.min(W - 2, Math.max(G, X(s.end))), y + r.hgt - 3 - (acc / total) * (r.hgt - 6)); }
        c.strokeStyle = P.subagent; c.lineWidth = 1.5; c.stroke(); c.lineWidth = 1;
        c.font = `10px ${P.mono}`; c.fillStyle = P.ink2; c.textAlign = "right"; c.fillText(fCost(total), W - 4, y + 10);
      }
      y += r.hgt;
    }
    drawMini();
  }
  function drawMini() {
    const W = Math.max(280, root.clientWidth || 600), H = 36, dpr = Math.min(2, devicePixelRatio || 1);
    mini.width = W * dpr; mini.height = H * dpr; mini.style.height = `${H}px`;
    const c = mini.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const D = sc.domain, X = (t) => ((sc.toU(t) - D[0]) / (D[1] - D[0] || 1)) * W;
    const lanes = { turn: 0, model: 1, tool: 2, subagent: 3, background: 3 };
    for (const { s } of allSpans({ tracks })) { const x0 = X(s.start), x1 = Math.max(x0 + 1, X(s.end)); c.fillStyle = s.isError && L.has("errors") ? P.bad : P[s.kind]; c.globalAlpha = s.kind === "turn" ? 0.45 : 0.85; c.fillRect(x0, 3 + lanes[s.kind] * 8, x1 - x0, 6); }
    c.globalAlpha = 1;
    const b0 = ((st.view[0] - D[0]) / (D[1] - D[0])) * W, b1 = ((st.view[1] - D[0]) / (D[1] - D[0])) * W;
    c.fillStyle = "rgba(127,127,127,.18)"; c.fillRect(0, 0, b0, H); c.fillRect(b1, 0, W - b1, H);
    c.strokeStyle = P.focus; c.lineWidth = 1.5; c.strokeRect(b0 + 0.75, 0.75, Math.max(2, b1 - b0 - 1.5), H - 1.5);
  }
  // minimap scrub: drag the brush, or drag elsewhere to draw a new window
  let mdrag = null;
  mini.addEventListener("pointerdown", (e) => {
    const r = mini.getBoundingClientRect(), D = sc.domain, u = D[0] + ((e.clientX - r.left) / r.width) * (D[1] - D[0]);
    const full = st.view[1] - st.view[0] >= (D[1] - D[0]) * 0.98;
    mdrag = !full && u >= st.view[0] && u <= st.view[1] ? { mode: "move", off: u - st.view[0] } : { mode: "new", u0: u };
    mini.setPointerCapture(e.pointerId);
  });
  mini.addEventListener("pointermove", (e) => {
    if (!mdrag) return;
    const r = mini.getBoundingClientRect(), D = sc.domain, u = D[0] + (Math.max(0, Math.min(r.width, e.clientX - r.left)) / r.width) * (D[1] - D[0]);
    if (mdrag.mode === "move") { const w = st.view[1] - st.view[0]; const a = Math.max(D[0], Math.min(D[1] - w, u - mdrag.off)); st.view = [a, a + w]; }
    else { const a = Math.min(mdrag.u0, u), b = Math.max(mdrag.u0, u); if (b - a > (D[1] - D[0]) / 200) st.view = [a, b]; }
    draw();
  });
  mini.addEventListener("pointerup", () => (mdrag = null));
  mini.addEventListener("dblclick", () => { st.view = [...sc.domain]; draw(); });
  // canvas: drag to pan, click to inspect, ctrl/⌘-wheel to zoom
  let pdrag = null;
  cv.addEventListener("pointerdown", (e) => { pdrag = { x: e.clientX, v: [...st.view], moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (pdrag) {
      const dx = e.clientX - pdrag.x;
      if (Math.abs(dx) > 3) pdrag.moved = true;
      if (pdrag.moved) { const w = pdrag.v[1] - pdrag.v[0], du = (-dx / (geo.W - geo.G)) * w, D = sc.domain; const a = Math.max(D[0], Math.min(D[1] - w, pdrag.v[0] + du)); st.view = [a, a + w]; draw(); }
      return;
    }
    const hit = hitAt(x, y);
    if (hit) { tip.hidden = false; tip.textContent = hit.marker ? `${hit.marker.kind.replace("_", " ")} · ${hit.marker.label}` : `${hit.s.label} · ${fDur(hit.s.end - hit.s.start)}${hit.s.tokens ? ` · ${fCompact(hit.s.tokens)} tok` : ""}${hit.s.isError ? " · error" : ""}`; tip.style.left = `${Math.min(x + 12, geo.W - 180)}px`; tip.style.top = `${y + 14}px`; cv.style.cursor = "pointer"; }
    else { tip.hidden = true; cv.style.cursor = "grab"; }
  });
  cv.addEventListener("pointerleave", () => (tip.hidden = true));
  cv.addEventListener("pointerup", (e) => {
    const moved = pdrag?.moved; pdrag = null;
    if (moved) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < geo.G) { const hd = geo.heads.find((q) => y >= q.y0 && y < q.y1); if (hd) { st.collapsed.has(hd.t.id) ? st.collapsed.delete(hd.t.id) : st.collapsed.add(hd.t.id); draw(); } return; }
    const hit = hitAt(x, y);
    if (hit?.s) select(hit.s, hit.t); else { st.sel = null; drawerSlot.replaceChildren(); draw(); }
  });
  cv.addEventListener("wheel", (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const r = cv.getBoundingClientRect(); zoom(e.deltaY > 0 ? 1.25 : 0.8, Math.max(0, Math.min(1, (e.clientX - r.left - geo.G) / (geo.W - geo.G)))); }, { passive: false });
  function hitAt(x, y) { let best = null; for (const q of geo?.hits ?? []) if (x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1 && (!best || (q.x1 - q.x0) < (best.x1 - best.x0))) best = q; return best; }
  function select(s, t, { reveal = false } = {}) {
    st.sel = s;
    if (reveal) { const u0 = sc.toU(s.start), u1 = sc.toU(s.end); const w = st.view[1] - st.view[0]; if (u0 < st.view[0] || u1 > st.view[1]) { const D = sc.domain; const want = Math.max(w, (u1 - u0) * 3); const a = Math.max(D[0], Math.min(D[1] - want, (u0 + u1) / 2 - want / 2)); st.view = [a, a + want]; } }
    if (!tracks.includes(t)) { tracks.push(t); }
    st.collapsed.delete(t.id);
    draw();
    const d = spanDrawer(s, t, trace, entries, { onClose: () => { st.sel = null; drawerSlot.replaceChildren(); draw(); }, onTrack: (id) => { const ct = trace.tracks.find((x) => x.id === id); if (ct) { if (!tracks.includes(ct)) tracks.push(ct); st.collapsed.delete(id); const ss = ct.spans; st.view = [sc.toU(Math.min(...ss.map((q) => q.start))), sc.toU(Math.max(...ss.map((q) => q.end)))]; draw(); } } });
    drawerSlot.replaceChildren(d);
    anim(d, [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { spring: "snappy" });
    o.onSelect?.(s, t);
  }
  if (transcript) {
    const list = allSpans({ tracks }).sort((a, b) => a.s.start - b.s.start);
    const ol = h("ol", { class: "os-txl" });
    const more = h("button", { class: "os-btn", type: "button" }, "");
    let n = 0;
    const add = (k) => { for (const { s, t } of list.slice(n, n + k)) ol.append(h("li", { onclick: () => select(s, t, { reveal: true }) }, h("span", { class: `os-kchip k-${s.kind}` }, s.kind), h("b", {}, s.label), h("span", { class: "os-txd" }, s.kind === "tool" ? s.detail ?? "" : s.kind === "model" ? (s.tokens == null ? "usage not recorded" : `${fCompact(s.tokens)} tok · ${fCost(s.cost ?? 0)}`) : s.kind === "turn" ? "‹user message withheld›" : s.detail ?? ""), h("span", { class: "os-mono dim" }, t.id === "main" ? "" : t.label + " "), h("span", { class: "os-mono dim r" }, fDur(s.end - s.start)))); n += k; more.textContent = n < list.length ? `Show ${Math.min(40, list.length - n)} more of ${list.length - n}` : "End of transcript"; more.disabled = n >= list.length; };
    more.onclick = () => add(40);
    add(24);
    transcript.append(h("div", { class: "os-ph" }, h("div", {}, h("div", { class: "os-pt" }, "Transcript"), h("div", { class: "os-pd" }, "Every span in order; click to inspect. Message text is withheld in the public fixture."))), ol, more);
  }
  const ro = new ResizeObserver(() => draw());
  ro.observe(root);
  addEventListener("theme", () => requestAnimationFrame(draw));
  return { node: root, draw, select, state: st, tracks };
}
function clip(c, s, w) { if (w <= 8) return ""; if (c.measureText(s).width <= w) return s; let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.measureText(s.slice(0, m) + "…").width <= w) lo = m; else hi = m - 1; } return lo ? s.slice(0, lo) + "…" : ""; }
function roundRect(c, x, y, w, hh, r) { w = Math.max(0, w); hh = Math.max(0, hh); r = Math.max(0, Math.min(r, w / 2, hh / 2)); c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, hh, r); else c.rect(x, y, w, hh); }

/* ---------------- usage breakdown (routes/CostsRoute.tsx, ModelsRoute, ProvidersRoute) ---------------- */
/** Round axis maximum and step (1/2/2.5/5 × 10^n), like the dashboard's chart ticks. */
function niceTicks(mx, n = 3) { const raw = mx / n, p = 10 ** Math.floor(Math.log10(raw || 1)), step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p; return { max: step * n, step }; }
const DAY = 86_400_000;
/** Contiguous day buckets ending at `end` (the dashboard shows empty days too). */
export function dayBuckets(points, end, days) { const anchor = Math.max(...points.map((p) => p.timestamp)); const last = anchor + Math.floor((end - anchor) / DAY) * DAY; const first = Math.min(last - (days - 1) * DAY, ...points.map((p) => p.timestamp)); const out = []; for (let t = first; t <= last; t += DAY) out.push(t); return out; }
/** UTC-midnight buckets are labelled in UTC ("Per UTC day"), local-midnight buckets in local time. */
const dayLabel = (t) => (t % DAY === 0 ? fDayUTC(t) : fDay(t));
function stackedBars(points, keyOf, valOf, colors, { fmtY = fCost, bucketLabel = dayLabel, buckets: fixed } = {}) {
  const buckets = fixed ?? [...new Set(points.map((p) => p.timestamp))].sort((a, b) => a - b);
  if (!points.length) return h("div", { class: "os-empty" }, "No usage in this range");
  const W = 520, H = 150, padL = 36, padB = 18;
  const tot = buckets.map((b) => points.filter((p) => p.timestamp === b).reduce((n, p) => n + valOf(p), 0));
  const mx = niceTicks(Math.max(...tot, 1e-9)).max;
  const bw = Math.min(46, ((W - padL) / buckets.length) * 0.62);
  const g = svg("svg", { class: "os-chart", viewBox: `0 0 ${W} ${H}`, role: "img" });
  for (let i = 0; i <= 3; i++) { const y = 6 + ((H - padB - 6) * i) / 3; g.append(svg("line", { x1: padL, x2: W, y1: y, y2: y, class: "os-gl" }), svg("text", { x: padL - 4, y: y + 3, class: "os-ax", "text-anchor": "end" }, fmtY((mx * (3 - i)) / 3, 0))); }
  buckets.forEach((b, i) => {
    const cx = padL + ((W - padL) * (i + 0.5)) / buckets.length;
    let y = H - padB;
    const ps = points.filter((p) => p.timestamp === b).sort((p, q) => valOf(q) - valOf(p));
    for (const p of ps) { const hh = (valOf(p) / mx) * (H - padB - 6); if (hh < 0.3) continue; y -= hh; const r = svg("rect", { x: cx - bw / 2, y, width: bw, height: hh, fill: colors.get(keyOf(p)) ?? OTHER, class: "os-barr" }); r.append(svg("title", {}, `${keyOf(p)} · ${fmtY(valOf(p))}`)); g.append(r); }
    if (buckets.length <= 10 || i % Math.ceil(buckets.length / 8) === 0) g.append(svg("text", { x: cx, y: H - 4, class: "os-ax", "text-anchor": "middle" }, bucketLabel(b)));
  });
  return g;
}
function usageNode(d, o, card) {
  const VIEWS = ["models", "providers", "components", "agents"];
  const st = { range: o.range ?? "7d", view: typeof o.view === "string" ? Math.max(0, VIEWS.indexOf(o.view)) : o.view ?? 0 };
  const root = h("div", {});
  const ranges = ["24h", "7d", "30d"];
  const render = async () => {
    const [stats, prov] = await Promise.all([api(`/api/stats?range=${st.range}`), api(`/api/stats/providers?range=${st.range}`)]);
    const L = lay(o), ov = stats?.overall;
    if (!ov || !ov.totalRequests) { body.replaceChildren(h("div", { class: "os-empty" }, `No requests in the last ${st.range}. The sample ends ${fDay(d.generatedAt)}; try 7d.`)); return; }
    const days = [...new Set(stats.costSeries.map((p) => p.timestamp))].length || 1;
    const top = [...stats.byModel].sort((a, b) => b.totalCost - a.totalCost)[0];
    const spk = [...new Set(stats.timeSeries.map((p) => p.timestamp))].sort().map((t) => stats.timeSeries.filter((p) => p.timestamp === t).reduce((n, p) => n + (L.has("cost") ? p.cost : p.tokens), 0));
    const head = statGrid([
      L.has("cost") ? stat("API-equivalent estimate", fCost(ov.totalCost), [`${fInt(ov.totalRequests)} requests`, spark(spk, "var(--os-agent)", 140, 22)]) : stat("Tokens", fCompact(ov.totalInputTokens + ov.totalOutputTokens + ov.totalCacheReadTokens + ov.totalCacheWriteTokens), [`${fInt(ov.totalRequests)} requests`, spark(spk, "var(--os-model)", 140, 22)]),
      L.has("cost") ? stat("Average per day", fCost(ov.totalCost / days), `over ${days} active day${days === 1 ? "" : "s"}`) : stat("Cache rate", fPct(ov.cacheRate), `${fPct(ov.cacheSavings)} input saved`),
      stat("Top model", top?.model ?? "-", top && L.has("cost") ? `${fCost(top.totalCost)} · ${fPct(top.totalCost / (ov.totalCost || 1))} of estimate` : top ? `${fInt(top.totalRequests)} requests` : null),
      L.has("errors") ? stat("Error rate", fRate(ov.errorRate), `${fInt(ov.failedRequests)} failed`, ov.failedRequests ? "bad" : "") : stat("Avg TTFT", fDur(ov.avgTtft), `${(ov.avgTokensPerSecond ?? 0).toFixed(1)} tok/s`),
    ], 120);
    const metric = (p) => (L.has("cost") ? p.cost : p.requests);
    const days8 = (pts) => (st.range === "24h" || !pts.length ? undefined : dayBuckets(pts, d.generatedAt, st.range === "7d" ? 8 : 31));
    const views = [
      () => { const cm = colorMap(stats.byModel.map((m) => [m.model, m.totalRequests])); return [panel(L.has("cost") ? "Daily estimate" : "Daily requests", "Per UTC day, stacked by model", stackedBars(stats.costSeries, (p) => p.model, metric, cm, { fmtY: L.has("cost") ? fCost : (v) => fCompact(v), buckets: days8(stats.costSeries) })), modelTable(stats.byModel, cm, L)]; },
      () => { const cm = colorMap(prov.providers.map((p) => [p.provider, p.totalRequests])); return [panel("By provider", "Tokens and estimate per provider", stackedBars(prov.series, (p) => p.provider, (p) => (L.has("cost") ? p.cost : p.totalTokens), cm, { fmtY: L.has("cost") ? fCost : (v) => fCompact(v), buckets: days8(prov.series) })), providerTable(prov.providers, cm, L)]; },
      () => [componentPanel(stats.costSeries, ov)],
      () => [agentPanel(stats.byAgentType, L)],
    ];
    body.replaceChildren(head, ...views[st.view]());
    stagger(body.querySelectorAll(".os-stat"), { gap: 30, y: 4 });
    card.spec.range = st.range; card.spec.view = ["models", "providers", "components", "agents"][st.view];
  };
  const body = h("div", { class: "os-stack" });
  root.append(h("div", { class: "os-toolbar" }, seg(ranges, (i) => { st.range = ranges[i]; render(); }, ranges.indexOf(st.range)), h("span", { class: "grow" }), seg(["Models", "Providers", "Components", "Agents"], (i) => { st.view = i; render(); }, st.view)), body);
  render();
  return { node: root };
}
function modelTable(rows, cm, L) {
  const total = rows.reduce((n, r) => n + r.totalCost, 0) || 1;
  const sorted = [...rows].sort((a, b) => (L.has("cost") ? b.totalCost - a.totalCost : b.totalRequests - a.totalRequests)).slice(0, 8);
  return panel("By model", L.has("cost") ? "Estimate per model with its input, output and cache split" : "Requests and tokens per model", h("div", { class: "os-tw" }, h("table", { class: "os-table" }, h("thead", {}, h("tr", {}, h("th", {}, "Model"), h("th", { class: "r" }, "Requests"), L.has("cost") ? h("th", { class: "r" }, "Estimate") : null, L.has("cost") ? h("th", {}, "Share") : null, L.has("tokens") ? h("th", { class: "r" }, "Tokens") : null, L.has("errors") ? h("th", { class: "r" }, "Errors") : null)),
    h("tbody", {}, sorted.map((m) => { const tok = m.totalInputTokens + m.totalOutputTokens + m.totalCacheReadTokens + m.totalCacheWriteTokens; return h("tr", {}, h("td", {}, sw(cm.get(m.model)), h("span", { class: "os-mono" }, m.model), h("div", { class: "os-sub" }, m.provider)), h("td", { class: "r os-mono" }, fInt(m.totalRequests)), L.has("cost") ? h("td", { class: "r os-mono" }, fCost(m.totalCost)) : null, L.has("cost") ? h("td", { class: "os-barc" }, h("i", { class: "os-bar", style: { width: `${(m.totalCost / total) * 100}%`, background: cm.get(m.model) } }), h("span", { class: "os-mono dim" }, fPct(m.totalCost / total))) : null, L.has("tokens") ? h("td", { class: "r os-mono" }, fCompact(tok)) : null, L.has("errors") ? h("td", { class: "r os-mono" + (m.failedRequests ? " bad" : "") }, fInt(m.failedRequests)) : null); })))));
}
function providerTable(rows, cm, L) {
  return panel("Providers", "Local request stats per provider", h("div", { class: "os-tw" }, h("table", { class: "os-table" }, h("thead", {}, h("tr", {}, h("th", {}, "Provider"), h("th", { class: "r" }, "Requests"), h("th", { class: "r" }, "Models"), L.has("tokens") ? h("th", { class: "r" }, "Tokens") : null, L.has("cost") ? h("th", { class: "r" }, "Estimate") : null, L.has("errors") ? h("th", { class: "r" }, "Failed") : null)),
    h("tbody", {}, [...rows].sort((a, b) => b.totalTokens - a.totalTokens).map((p) => h("tr", {}, h("td", {}, sw(cm.get(p.provider)), h("span", { class: "os-mono" }, p.provider)), h("td", { class: "r os-mono" }, fInt(p.totalRequests)), h("td", { class: "r os-mono" }, fInt(p.models)), L.has("tokens") ? h("td", { class: "r os-mono" }, fCompact(p.totalTokens)) : null, L.has("cost") ? h("td", { class: "r os-mono" }, p.totalCost === 0 && p.unpricedRequests ? "N/A" : fCost(p.totalCost)) : null, L.has("errors") ? h("td", { class: "r os-mono" + (p.failedRequests ? " bad" : "") }, fInt(p.failedRequests)) : null))))));
}
function componentPanel(series, ov) {
  const parts = [["Input", "costInput", "#5b8cff"], ["Output", "costOutput", "#ed4abf"], ["Cache read", "costCacheRead", "#2dd4bf"], ["Cache write", "costCacheWrite", "#f5b54a"]].map(([l, k, c]) => [l, series.reduce((n, p) => n + p[k], 0), c]);
  const tot = parts.reduce((n, p) => n + p[1], 0) || 1;
  return panel("Where it went", "Estimate by billing component", h("div", {}, h("div", { class: "os-split" }, parts.map(([l, v, c]) => h("i", { style: { width: `${(v / tot) * 100}%`, background: c }, title: l }))), h("ul", { class: "os-list" }, parts.map(([l, v, c]) => h("li", {}, sw(c), h("span", {}, l), h("span", { class: "grow" }), h("span", { class: "os-mono" }, fCost(v)), h("span", { class: "os-mono dim w5" }, fPct(v / tot)))), h("li", { class: "tot" }, h("b", {}, "Total"), h("span", { class: "grow" }), h("b", { class: "os-mono" }, fCost(ov.totalCost)), h("span", { class: "w5" })))));
}
function agentPanel(rows, L) {
  const tok = (r) => r.totalInputTokens + r.totalOutputTokens + r.totalCacheReadTokens + r.totalCacheWriteTokens;
  const tt = rows.reduce((n, r) => n + tok(r), 0) || 1, tc = rows.reduce((n, r) => n + r.totalCost, 0) || 1;
  return panel("By agent type", "Main agent vs task subagents vs advisor, tokens and estimate", h("ul", { class: "os-list" }, rows.map((r, i) => h("li", { class: "col" }, h("div", { class: "row" }, sw(SERIES[i]), h("b", {}, r.agentType), h("span", { class: "grow" }), h("span", { class: "os-mono" }, `${fInt(r.totalRequests)} req`), L.has("cost") ? h("span", { class: "os-mono w7" }, fCost(r.totalCost)) : null), h("div", { class: "os-split thin" }, h("i", { style: { width: `${(tok(r) / tt) * 100}%`, background: SERIES[i] } })), h("div", { class: "os-sub" }, `${fCompact(tok(r))} tokens · ${fPct(tok(r) / tt)} of tokens${L.has("cost") ? ` · ${fPct(r.totalCost / tc)} of estimate` : ""}`)))));
}

/* ---------------- tools (routes/ToolsRoute.tsx + span latency) ---------------- */
function toolsNode(d, o, card) {
  const st = { range: o.range ?? "7d", sort: o.sort ?? "calls", open: o.focusTool ?? null };
  const traces = o.traces ?? Object.values(d.traces);
  const lat = new Map(toolLatency(traces).map((r) => [r.tool, r]));
  const root = h("div", {});
  const body = h("div", { class: "os-stack" });
  const render = async () => {
    const L = lay(o);
    const scoped = o.scope === "trace";
    const data = scoped ? { byTool: [...lat.values()].map((r) => ({ tool: r.tool, calls: r.calls, errors: r.errors, costShare: 0, totalTokensShare: 0 })), series: [] } : o.input && st.range === (o.range ?? "7d") ? o.input : await api(`/api/stats/tools?range=${st.range}`);
    const rows = data.byTool.map((t) => ({ ...t, rate: t.errors / Math.max(1, t.calls), lat: lat.get(t.tool) }));
    for (const [k, r] of lat) if (!rows.some((x) => x.tool === k)) rows.push({ tool: k, calls: r.calls, errors: r.errors, rate: r.errors / r.calls, costShare: 0, totalTokensShare: 0, lat: r, traceOnly: true });
    const key = { calls: (r) => r.calls, errors: (r) => r.errors, rate: (r) => r.rate, p95: (r) => r.lat?.p95 ?? -1, cost: (r) => r.costShare }[st.sort];
    rows.sort((a, b) => key(b) - key(a) || b.calls - a.calls);
    const calls = data.byTool.reduce((n, t) => n + t.calls, 0), errs = data.byTool.reduce((n, t) => n + t.errors, 0);
    const days = [...new Set(data.series.map((p) => p.timestamp))].sort();
    const cm = colorMap(rows.map((r) => [r.tool, r.calls]));
    const head = statGrid([
      stat("Tool calls", fInt(calls), [`${fInt(errs)} failed`, spark(days.map((t) => data.series.filter((p) => p.timestamp === t).reduce((n, p) => n + p.calls, 0)), "var(--os-model)", 140, 22)]),
      stat("Distinct tools", fInt(data.byTool.length), `Most used: ${[...data.byTool].sort((a, b) => b.calls - a.calls)[0]?.tool ?? "-"}`),
      L.has("errors") ? stat("Error rate", fRate(errs / Math.max(1, calls)), `${fInt(calls - errs)} succeeded`, errs ? "bad" : "") : null,
      scoped ? stat("Tool time", fElapsed([...lat.values()].reduce((n, r) => n + r.totalMs, 0)), "all tracks") : L.has("cost") ? stat("Attributed cost", fCost(data.byTool.reduce((n, t) => n + t.costShare, 0)), "API-equivalent") : L.has("tokens") ? stat("Attributed tokens", fCompact(data.byTool.reduce((n, t) => n + t.totalTokensShare, 0)), "per call share") : null,
    ], 120);
    const th = (k, label, cls = "r") => h("th", { class: cls + " sortable" + (st.sort === k ? " on" : ""), onclick: () => { st.sort = k; render(); } }, label, st.sort === k ? " ↓" : "");
    const mxCalls = Math.max(...rows.map((r) => r.calls), 1);
    const tbody = h("tbody", {});
    for (const r of rows.slice(0, 14)) {
      const tr = h("tr", { class: "click" + (st.open === r.tool ? " sel" : ""), onclick: () => { st.open = st.open === r.tool ? null : r.tool; render(); } },
        h("td", {}, sw(cm.get(r.tool)), h("span", { class: "os-mono" }, r.tool), r.traceOnly && !scoped ? h("span", { class: "os-sub" }, " traced only") : null),
        h("td", { class: "r os-mono" }, fInt(r.calls), h("i", { class: "os-mbar", style: { width: `${(r.calls / mxCalls) * 100}%` } })),
        L.has("errors") ? h("td", { class: "r os-mono" + (r.errors ? " bad" : "") }, fInt(r.errors)) : null,
        L.has("errors") ? h("td", { class: "os-barc" }, h("i", { class: "os-bar badbar", style: { width: `${Math.min(100, r.rate * 400)}%` } }), h("span", { class: "os-mono dim" }, fRate(r.rate))) : null,
        h("td", { class: "r os-mono" }, r.lat ? fDur(r.lat.p50) : "-"),
        h("td", { class: "r os-mono" }, r.lat ? fDur(r.lat.p95) : "-"),
        L.has("cost") && !scoped ? h("td", { class: "r os-mono" }, fCost(r.costShare)) : null);
      tbody.append(tr);
      if (st.open === r.tool) {
        const spans = (r.lat?.spans ?? []).sort((a, b) => (b.s.isError - a.s.isError) || (b.s.end - b.s.start) - (a.s.end - a.s.start)).slice(0, 8);
        tbody.append(h("tr", { class: "os-exp" }, h("td", { colspan: 7 }, spans.length ? h("ul", { class: "os-spans" }, spans.map(({ s, t, trace }) => h("li", { onclick: (e) => { e.stopPropagation(); openSpan(s, t, trace); } }, h("span", { class: `os-kchip k-tool${s.isError ? " err" : ""}` }, s.isError ? s.errorKind ?? "error" : "ok"), h("span", { class: "os-mono" }, fDur(s.end - s.start)), h("span", { class: "os-txd" }, s.detail ?? ""), h("span", { class: "os-mono dim" }, `${trace.title.split(" · ")[0]} · ${t.label}`), h("span", { class: "os-go" }, "Open span →")))) : h("div", { class: "os-sub" }, "No spans for this tool in the traced sessions; counts come from /api/stats/tools."))));
      }
    }
    const tbl = h("div", { class: "os-tw" }, h("table", { class: "os-table" }, h("thead", {}, h("tr", {}, h("th", {}, "Tool"), th("calls", "Calls"), L.has("errors") ? th("errors", "Errors") : null, L.has("errors") ? th("rate", "Failure rate", "") : null, h("th", { class: "r" }, "p50"), th("p95", "p95"), L.has("cost") && !scoped ? th("cost", "Attr. cost") : null)), tbody));
    let chart = null;
    if (!scoped && data.series.length) {
      const top = new Set([...data.byTool].sort((a, b) => b.calls - a.calls).slice(0, 6).map((t) => t.tool));
      const pts = []; const acc = new Map();
      for (const p of data.series) { const k = top.has(p.tool) ? p.tool : "Other"; const key = `${p.timestamp}|${k}`; if (!acc.has(key)) { acc.set(key, { timestamp: p.timestamp, tool: k, calls: 0, errors: 0 }); pts.push(acc.get(key)); } acc.get(key).calls += p.calls; acc.get(key).errors += p.errors; }
      const ccm = new Map(cm); ccm.set("Other", OTHER);
      const legend = h("div", { class: "os-legend os-chartlg" }, [...top, ...(pts.some((p) => p.tool === "Other") ? ["Other"] : [])].map((k) => h("span", {}, h("i", { class: "os-lg", style: { background: ccm.get(k) } }), k, h("span", { class: "os-mono dim" }, " " + fCompact(pts.filter((p) => p.tool === k).reduce((n, p) => n + p.calls, 0))))));
      chart = panel("Calls over time", "Per day, top 6 tools stacked", h("div", {}, stackedBars(pts, (p) => p.tool, (p) => (st.metric === "errors" ? p.errors : p.calls), ccm, { fmtY: (v) => fCompact(v), bucketLabel: fDay, buckets: dayBuckets(pts, d.generatedAt, st.range === "7d" ? 8 : 31) }), legend), seg(["Calls", "Errors"], (i) => { st.metric = i ? "errors" : "calls"; render(); }, st.metric === "errors" ? 1 : 0));
    }
    body.replaceChildren(head, ...(chart ? [chart] : []), panel("By tool", scoped ? `Calls, failures and latency from the spans of ${traces[0].title.split(" · ")[0]}. Select a tool for its spans.` : `Counts for the last ${st.range} from /api/stats/tools; p50/p95 from spans of ${traces.length} traced session${traces.length === 1 ? "" : "s"}. Select a tool for its spans.`, tbl), slot);
    toolbar.hidden = scoped;
    card.spec.range = st.range; card.spec.sort = st.sort; card.spec.focusTool = st.open;
  };
  const slot = h("div", { class: "os-dslot" });
  function openSpan(s, t, trace) { if (o.onSpan) return o.onSpan(s, t, trace); slot.replaceChildren(spanDrawer(s, t, trace, d.entries, { onClose: () => slot.replaceChildren() })); slot.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  const toolbar = h("div", { class: "os-toolbar" }, seg(["7d", "30d"], (i) => { st.range = ["7d", "30d"][i]; render(); }, st.range === "30d" ? 1 : 0));
  root.append(toolbar, body);
  render();
  return { node: root };
}

/* ---------------- errors (routes/ErrorsRoute.tsx + span failures) ---------------- */
function errorsNode(d, o, card) {
  const st = { tab: o.tab === "spans" || o.tab === 1 ? 1 : 0, range: o.range ?? "30d", open: null };
  const traces = o.traces ?? Object.values(d.traces);
  const root = h("div", {});
  const body = h("div", { class: "os-stack" });
  const slot = h("div", { class: "os-dslot" });
  function openSpan(s, t, trace) { if (o.onSpan) return o.onSpan(s, t, trace); slot.replaceChildren(spanDrawer(s, t, trace, d.entries, { onClose: () => slot.replaceChildren() })); slot.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  const findSpan = (e) => { for (const tr of traces) for (const t of tr.tracks) if (t.file === e.sessionFile || (t.id === "main" && tr.file === e.sessionFile)) { const s = t.spans.find((x) => x.entryId === e.entryId); if (s) return { s, t, trace: tr }; } return null; };
  const render = async () => {
    if (st.tab === 0) {
      const list = await api(`/api/stats/errors?range=${st.range}`);
      const groups = groupErrors(list);
      const byModel = [...list.reduce((m, e) => m.set(e.model, (m.get(e.model) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
      const mx = groups[0]?.n ?? 1;
      const head = statGrid([stat("Failures", fInt(list.length), `latest ${list.length} loaded`), stat("Signatures", fInt(groups.length), groups[0] ? `top: ${groups[0].n} failures` : null), stat("Affected models", fInt(byModel.length), byModel[0]?.[0] ?? "-"), stat("Last failure", list[0] ? fDay(list[0].timestamp) : "-", list[0] ? fClock(list[0].timestamp) : null)], 120);
      const tbody = h("tbody", {});
      for (const g of groups) {
        const ms = [...g.models.keys()];
        tbody.append(h("tr", { class: "click" + (st.open === g.sig ? " sel" : ""), onclick: () => { st.open = st.open === g.sig ? null : g.sig; render(); } }, h("td", { class: "os-mono os-sig" }, g.sig), h("td", {}, h("span", { class: "os-mono" }, ms[0]), ms.length > 1 ? h("div", { class: "os-sub" }, `+${ms.length - 1} more`) : null), h("td", { class: "os-sub nowrap" }, fDay(g.last)), h("td", { class: "r os-mono" }, fInt(g.n)), h("td", { class: "os-barc w80" }, h("i", { class: "os-bar badbar", style: { width: `${(g.n / mx) * 100}%` } }))));
        if (st.open === g.sig) tbody.append(h("tr", { class: "os-exp" }, h("td", { colspan: 5 }, h("ul", { class: "os-spans" }, g.items.slice(0, 8).map((e) => { const f = findSpan(e); return h("li", { onclick: f ? () => openSpan(f.s, f.t, f.trace) : null, class: f ? "" : "nolink" }, h("span", { class: "os-mono dim" }, `${fDay(e.timestamp)} ${fClock(e.timestamp)}`), h("span", { class: "os-mono" }, e.model), h("span", { class: "os-sub" }, e.provider), h("span", { class: "os-mono dim" }, `${fInt(e.usage.totalTokens)} tok`), f ? h("span", { class: "os-go" }, "Jump to span →") : h("span", { class: "os-sub" }, e.folder)); })))));
      }
      body.replaceChildren(head, panel("Error signatures", "Same message with ids and counters normalized. Messages are reduced to their error kind in the public fixture.", h("div", { class: "os-tw" }, h("table", { class: "os-table" }, h("thead", {}, h("tr", {}, h("th", {}, "Signature"), h("th", {}, "Models"), h("th", {}, "Last seen"), h("th", { class: "r" }, "Failures"), h("th", {}, ""))), tbody))), slot);
    } else {
      const groups = traces.flatMap((trace) => spanErrors(trace).map((g) => ({ ...g, trace })));
      const merged = new Map();
      for (const g of groups) { const m = merged.get(g.sig) ?? { sig: g.sig, n: 0, items: [] }; m.n += g.n; m.items.push(...g.items.map((x) => ({ ...x, trace: g.trace }))); merged.set(g.sig, m); }
      const rows = [...merged.values()].sort((a, b) => b.n - a.n);
      const mx = rows[0]?.n ?? 1, total = rows.reduce((n, r) => n + r.n, 0);
      const head = statGrid([stat("Failed spans", fInt(total), `${traces.length} traced sessions`, total ? "bad" : ""), stat("Kinds", fInt(rows.length), rows[0]?.sig ?? "-"), stat("Worst session", (() => { const c = traces.map((t) => [t.title, allSpans(t).filter(({ s }) => s.isError).length]).sort((a, b) => b[1] - a[1])[0]; return c ? c[0].split(" · ")[0] : "-"; })(), null)], 120);
      const tbody = h("tbody", {});
      for (const g of st.all ? rows : rows.slice(0, 10)) {
        tbody.append(h("tr", { class: "click" + (st.open === g.sig ? " sel" : ""), onclick: () => { st.open = st.open === g.sig ? null : g.sig; render(); } }, h("td", { class: "os-mono os-sig" }, g.sig), h("td", { class: "r os-mono" }, fInt(g.n)), h("td", { class: "os-barc w80" }, h("i", { class: "os-bar badbar", style: { width: `${(g.n / mx) * 100}%` } }))));
        if (st.open === g.sig) tbody.append(h("tr", { class: "os-exp" }, h("td", { colspan: 3 }, h("ul", { class: "os-spans" }, g.items.slice(0, 8).map(({ s, t, trace }) => h("li", { onclick: () => openSpan(s, t, trace) }, h("span", { class: "os-mono dim" }, fClock(s.start)), h("span", { class: "os-mono" }, fDur(s.end - s.start)), h("span", { class: "os-txd" }, s.detail ?? ""), h("span", { class: "os-mono dim" }, `${trace.title.split(" · ")[0]} · ${t.label}`), h("span", { class: "os-go" }, "Jump to span →")))))));
      }
      const more = rows.length > 10 ? h("button", { class: "os-btn", type: "button", style: { margin: "8px 12px 12px" }, onclick: () => { st.all = !st.all; render(); } }, st.all ? "Show top 10" : `Show all ${rows.length} kinds`) : null;
      body.replaceChildren(head, panel("Span failures", "Tool calls and requests that failed inside the traced sessions, grouped by tool and error kind.", h("div", { class: "os-tw" }, h("table", { class: "os-table" }, h("thead", {}, h("tr", {}, h("th", {}, "Tool · kind"), h("th", { class: "r" }, "Spans"), h("th", {}, ""))), tbody)), more), slot);
    }
    card.spec.tab = ["requests", "spans"][st.tab]; card.spec.range = st.range;
  };
  root.append(h("div", { class: "os-toolbar" }, seg(["Requests", "Spans"], (i) => { st.tab = i; st.open = null; render(); }, st.tab), h("span", { class: "grow" }), seg(["7d", "30d"], (i) => { st.range = ["7d", "30d"][i]; render(); }, st.range === "7d" ? 0 : 1)), body);
  render();
  return { node: root };
}

/* ---------------- compare ---------------- */
function compareNode(d, o, card) {
  const pool = d.sessions.filter((s) => d.traces[s.file]);
  const st = { a: o.a ?? pool[1]?.file, b: o.b ?? pool[0]?.file };
  const root = h("div", {});
  const body = h("div", { class: "os-stack" });
  const pick = (k) => h("select", { class: "os-select", onchange: (e) => { st[k] = e.target.value; render(); } }, pool.map((s) => h("option", { value: s.file, selected: s.file === st[k] }, `${s.title} · ${fDay(s.startedAt)}`)));
  const render = () => {
    const L = lay(o), A = d.traces[st.a], B = d.traces[st.b];
    const errs = (t) => allSpans(t).filter(({ s }) => s.isError).length;
    const M = [["Wall time", (t) => t.summary.wallMs, fElapsed], ["Model time", (t) => t.summary.modelMs, fElapsed], ["Tool time", (t) => t.summary.toolMs, fElapsed], ["Idle", (t) => t.summary.idleMs, fElapsed], ["Requests", (t) => t.summary.requests, fInt], ["Tool calls", (t) => t.summary.toolCalls, fInt],
      L.has("subagents") ? ["Subagents", (t) => t.summary.subagents, fInt] : null, L.has("tokens") ? ["Tokens", (t) => t.summary.totalTokens, (v) => (v ? fCompact(v) : "not recorded")] : null, L.has("cost") ? ["Cost", (t) => t.summary.costTotal, (v, t) => (v || t.summary.totalTokens ? fCost(v) : "N/A")] : null, L.has("errors") ? ["Errors", errs, fInt] : null].filter(Boolean);
    const rows = M.map(([label, f, fmt]) => { const a = f(A), b = f(B), mx = Math.max(a, b, 1e-9); const dl = a && b ? (b - a) / a : null; return h("div", { class: "os-cmp-row" }, h("span", { class: "os-mono r" }, fmt(a, A)), h("div", { class: "os-cmp-bar l" }, h("i", { style: { width: `${(a / mx) * 100}%` } })), h("span", { class: "os-cmp-lbl" }, label, dl != null && Math.abs(dl) > 0.005 ? h("em", { class: /Errors|Cost/.test(label) ? (dl > 0 ? "up" : "down") : "" }, `${dl > 0 ? "+" : ""}${(dl * 100).toFixed(0)}%`) : null), h("div", { class: "os-cmp-bar r" }, h("i", { style: { width: `${(b / mx) * 100}%` } })), h("span", { class: "os-mono" }, fmt(b, B))); });
    const topTools = (t) => t.summary.toolStats.slice(0, 4).map((x) => h("li", {}, h("span", { class: "os-mono" }, x.tool), h("span", { class: "grow" }), h("span", { class: "os-mono dim" }, `${x.calls}× · ${fElapsed(x.totalMs)}`), x.errors && L.has("errors") ? h("span", { class: "os-mono bad" }, ` ${x.errors}✕`) : null));
    const side = (t, cls) => h("div", { class: "os-cmp-side " + cls }, h("b", {}, t.title), h("div", { class: "os-sub" }, `${fDay(t.startedAt)} · ${fClock(t.startedAt)} · ${[...new Set(t.tracks.map((x) => x.model).filter(Boolean))].slice(0, 2).join(", ")}`), miniStrip(t, L), h("ul", { class: "os-list tight" }, topTools(t)));
    body.replaceChildren(h("div", { class: "os-cmp-head" }, side(A, "a"), side(B, "b")), h("div", { class: "os-cmp" }, rows));
    card.spec.a = st.a; card.spec.b = st.b;
  };
  root.append(h("div", { class: "os-toolbar wrap" }, h("span", { class: "os-dot a" }), pick("a"), h("span", { class: "os-vs" }, "vs"), h("span", { class: "os-dot b" }), pick("b")), body);
  render();
  return { node: root };
}
/** Static minimap-style strip of a whole trace (no interaction): model / tools / agents rows. */
function miniStrip(trace, L) {
  const c = h("canvas", { class: "os-strip" });
  requestAnimationFrame(() => {
    const W = c.clientWidth || 240, H = 26, dpr = Math.min(2, devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr; const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = readPalette(c), sc = timeScale(trace, true), D = sc.domain, X = (t) => ((sc.toU(t) - D[0]) / (D[1] - D[0] || 1)) * W;
    const lane = { model: 0, tool: 1, subagent: 2, background: 2 };
    for (const { s, t } of allSpans(trace)) { if (s.kind === "turn" || (t.id !== "main" && !L.has("subagents"))) continue; x.fillStyle = s.isError && L.has("errors") ? P.bad : P[s.kind]; x.fillRect(X(s.start), 1 + lane[s.kind] * 8, Math.max(1, X(s.end) - X(s.start)), 6); }
  });
  return c;
}

/* ---------------- frustration (routes/FrustrationRoute.tsx) ---------------- */
function frustrationNode(d, o) {
  const st = { range: o.range ?? "30d" };
  const root = h("div", {}), body = h("div", { class: "os-stack" });
  const render = async () => {
    const f = await api(`/api/stats/frustration?range=${st.range}`);
    const ov = f.overall;
    const head = statGrid([stat("User messages", fInt(ov.messages), `${fInt(ov.judged)} judged, rest regex`), stat("Annoyed", fPct(ov.annoyed / Math.max(1, ov.messages)), `${fInt(ov.annoyed)} messages`), stat("At the assistant", fPct(ov.atAssistant / Math.max(1, ov.messages)), `${fInt(ov.atAssistant)} messages`), stat("Angry", fPct(ov.angry / Math.max(1, ov.messages)), `${fInt(ov.angry)} messages`, ov.angry ? "bad" : "")], 120);
    const rows = f.byModel.filter((m) => m.messages >= 5).sort((a, b) => b.annoyed / b.messages - a.annoyed / a.messages);
    const mx = Math.max(...rows.map((m) => m.annoyed / m.messages), 1e-9);
    body.replaceChildren(head, panel("By model", "Share of user messages that read as annoyed, aimed at the assistant, or angry. Models with 5+ messages.", h("ul", { class: "os-list" }, rows.map((m) => h("li", { class: "col" }, h("div", { class: "row" }, h("span", { class: "os-mono" }, m.label), h("span", { class: "os-sub" }, m.modelClass), h("span", { class: "grow" }), h("span", { class: "os-mono dim" }, `${fInt(m.messages)} msgs`)), h("div", { class: "os-fr" }, h("i", { class: "os-fa", style: { width: `${((m.annoyed / m.messages) / mx) * 100}%` }, title: `annoyed ${fPct(m.annoyed / m.messages)}` }), h("i", { class: "os-fb", style: { width: `${((m.atAssistant / m.messages) / mx) * 100}%` }, title: `at assistant ${fPct(m.atAssistant / m.messages)}` }), h("i", { class: "os-fc", style: { width: `${((m.angry / m.messages) / mx) * 100}%` }, title: `angry ${fPct(m.angry / m.messages)}` })), h("div", { class: "os-sub" }, `annoyed ${fPct(m.annoyed / m.messages)} · at assistant ${fPct(m.atAssistant / m.messages)} · angry ${fPct(m.angry / m.messages)}`))))));
  };
  root.append(h("div", { class: "os-toolbar" }, seg(["7d", "30d"], (i) => { st.range = ["7d", "30d"][i]; render(); }, st.range === "7d" ? 0 : 1)), body);
  render();
  return { node: root };
}

/* ---------------- kinds ---------------- */
const pickTrace = (d, input, o) => input ?? (o?.file ? d.traces[o.file] : null) ?? latestTrace(d, (s) => s.harness === "omp" && s.subagents > 0);
export const KINDS_T = {
  trace: {
    label: "Trace timeline", verb: () => "Read the session trace",
    make(a, r, input, o = {}) {
      const c = traceCard(a, "trace", { verb: "Trace · /api/session/trace", status: "Trace", summary: "Inspected the session trace" }, (d) => {
        const t = pickTrace(d, input, o);
        c.spec.input = `/api/session/trace?file=${t.file}`;
        const tl = timeline(t, d.entries, o);
        c.timeline = tl;
        return { node: h("div", {}, h("div", { class: "os-title" }, h("b", {}, t.title), h("span", { class: "os-sub" }, `${fDay(t.startedAt)} · ${fElapsed(t.summary.wallMs)} · ${fInt(t.summary.requests)} requests · ${t.tracks.length} tracks`)), tl.node), play() { tl.draw(); } };
      }, { layers: [...lay(o)] });
      return c;
    },
  },
  "trace-span": {
    label: "Span drawer", verb: () => "Opened a span",
    make(a, r, input, o = {}) {
      return traceCard(a, "trace-span", { verb: "Span · /api/session/entry", status: "Span", summary: "Inspected one span" }, (d) => {
        const t = pickTrace(d, null, o);
        const pickS = input?.span ? input : (() => { const all = allSpans(t).filter(({ s }) => s.kind === (o.spanKind ?? "model") && (s.tokens ?? 1)); const x = all.sort((p, q) => (q.s.tokens ?? 0) - (p.s.tokens ?? 0))[0]; return { span: x.s, track: x.t }; })();
        let cur = pickS;
        const node = h("div", {});
        const kinds = ["model", "tool", "subagent"];
        const show = () => node.replaceChildren(h("div", { class: "os-toolbar" }, seg(["Model call", "Tool call", "Subagent"], (i) => { const k = kinds[i]; const all = allSpans(t).filter(({ s }) => s.kind === k); const x = k === "tool" ? (all.find(({ s }) => s.isError) ?? all[0]) : all.sort((p, q) => (q.s.tokens ?? q.s.end - q.s.start) - (p.s.tokens ?? p.s.end - p.s.start))[0]; if (x) { cur = { span: x.s, track: x.t }; body.replaceChildren(spanDrawer(cur.span, cur.track, t, d.entries)); } }, kinds.indexOf(cur.span.kind) < 0 ? 0 : kinds.indexOf(cur.span.kind))), body);
        const body = h("div", {}, spanDrawer(cur.span, cur.track, t, d.entries));
        show();
        return { node };
      }, { input: "/api/session/entry" });
    },
  },
  "trace-summary": {
    label: "Trace summary strip", verb: () => "Summarised a session",
    make(a, r, input, o = {}) {
      const c = traceCard(a, "trace-summary", { verb: "Summary · /api/session/trace", status: "Summary", summary: "Summarised the session" }, (d) => { const t = pickTrace(d, input, o); c.spec.input = `/api/session/trace?file=${t.file}`; return { node: h("div", {}, h("div", { class: "os-title" }, h("b", {}, t.title), h("span", { class: "os-sub" }, `${fDay(t.startedAt)} · ${fClock(t.startedAt)}`)), summaryNode(t, o)) }; }, { layers: [...lay(o)] });
      return c;
    },
  },
  "trace-usage": {
    label: "Model · provider · cost", verb: () => "Broke down usage",
    make(a, r, input, o = {}) { const c = traceCard(a, "trace-usage", { verb: "Usage · /api/stats", status: "Costs", summary: "Broke down model and provider usage" }, (d) => usageNode(d, { ...o, input }, c), { input: "/api/stats?range=7d", layers: [...lay(o)] }); return c; },
  },
  "trace-tools": {
    label: "Tool latency & failures", verb: () => "Ranked tools",
    make(a, r, input, o = {}) { const c = traceCard(a, "trace-tools", { verb: "Tools · /api/stats/tools", status: "Tools", summary: "Ranked tools by calls, failures and latency" }, (d) => toolsNode(d, { ...o, input }, c), { input: "/api/stats/tools?range=7d", layers: [...lay(o)] }); return c; },
  },
  "trace-errors": {
    label: "Error signatures", verb: () => "Grouped failures",
    make(a, r, input, o = {}) { const c = traceCard(a, "trace-errors", { verb: "Errors · /api/stats/errors", status: "Errors", summary: "Grouped failures by signature" }, (d) => errorsNode(d, { ...o, input }, c), { input: "/api/stats/errors?range=30d" }); c.el.classList.add("hot"); return c; },
  },
  "trace-compare": {
    label: "Session compare", verb: () => "Compared two sessions",
    make(a, r, input, o = {}) { const c = traceCard(a, "trace-compare", { verb: "Compare · 2 × /api/session/trace", status: "A / B", summary: "Compared two sessions" }, (d) => compareNode(d, { ...o, ...(input ? { a: input[0]?.file, b: input[1]?.file } : {}) }, c), { layers: [...lay(o)] }); return c; },
  },
  "trace-frustration": {
    label: "Frustration", verb: () => "Read user sentiment",
    make(a, r, input, o = {}) { return traceCard(a, "trace-frustration", { verb: "Frustration · /api/stats/frustration", status: "Mood", summary: "Read frustration by model" }, (d) => frustrationNode(d, o), { input: "/api/stats/frustration?range=30d" }); },
  },
};
for (const k of Object.values(KINDS_T)) k.trace = true;
