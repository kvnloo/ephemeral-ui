// Stats library, trace pieces: omp-stats client/traces/* as kit components that share one viewport.
// TimelineCanvas is the trace card's timeline (kinds-t.js) rebuilt as a standalone component; it adds the
// dashboard's axis modes (Duration · Turns · Calls), its keyboard (W/S zoom, A/D pan, 0 fit, F focus,
// ,/. siblings, Esc), dbl-click focus, edge-resizable minimap brush, search with n/m cycling,
// expand/collapse all, the virtualized transcript, tool aggregates and the span drawer.
// Same contract as stats-lib.js: make(data, opts) → { el, spec, getSelection(), on(type, cb) }.
import { h, anim } from "./motion.js";
import { comp, fmt, keyValues, sectionLabel, mono, badge, empty, errorState, skeleton, JsonBlock, Table, StatGrid, meterCell, Segmented, SearchInput, card } from "./stats-lib.js";

const KINDS = ["turn", "model", "tool", "subagent", "background"];
const LANE = { turn: "Input", model: "Model", tool: "Tools", subagent: "Agents", background: "Bg" };
export const DEFAULT_LAYERS = new Set(["spans", "tokens", "cost", "errors", "subagents"]);
const lay = (o) => o?.layers ?? DEFAULT_LAYERS;
export const allSpans = (trace) => trace.tracks.flatMap((t) => t.spans.map((s) => ({ s, t })));
const depthOf = (t) => (t.id === "main" ? 0 : (t.parentId ? 1 + (t.parentId === "main" ? 0 : String(t.parentId).split("/").length) : String(t.id).split("/").length));
/** Event ids for one span (what goes back to the LLM). */
export const spanIds = (s, t, trace) => ({ session: trace?.file, track: t?.id, span: s.id, entry: s.entryId, tool: s.kind === "tool" ? s.label : undefined, model: s.kind === "model" ? s.model ?? s.label : undefined });
export const spanLabel = (s, t) => `${s.kind} ${s.label}${t && t.id !== "main" ? ` (${t.label})` : ""} · ${fmt.dur(s.end - s.start)}${s.isError ? ` · error${s.errorKind ? ` (${s.errorKind})` : ""}` : ""}${s.tokens ? ` · ${fmt.compact(s.tokens)} tok` : ""}`;

/* ---------------- time scale (traces/time-scale.ts) ---------------- */
function piecewise(T, U) {
  const n = T.length;
  const seg = (P, v) => { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P[m] <= v) lo = m; else hi = m - 1; } return Math.min(lo, n - 2); };
  return {
    toU(t) { if (t <= T[0]) return U[0]; if (t >= T[n - 1]) return U[n - 1]; const i = seg(T, t), d = T[i + 1] - T[i]; return d <= 0 ? U[i] : U[i] + ((t - T[i]) / d) * (U[i + 1] - U[i]); },
    toT(u) { if (u <= U[0]) return T[0]; if (u >= U[n - 1]) return T[n - 1]; const i = seg(U, u), d = U[i + 1] - U[i]; return d <= 0 ? T[i] : T[i] + ((u - U[i]) / d) * (T[i + 1] - T[i]); },
    domain: [U[0], U[n - 1]], gaps: [],
  };
}
function bounds(tracks) { let a = Infinity, b = -Infinity; for (const t of tracks) for (const s of t.spans) { if (s.start < a) a = s.start; if (s.end > b) b = s.end; } return Number.isFinite(a) ? [a, Math.max(b, a + 1)] : [0, 1]; }
function equalWidth(anchors, t0, t1) { const u = [...new Set(anchors.filter((t) => t >= t0 && t <= t1))].sort((a, b) => a - b); if (u[0] !== t0) u.unshift(t0); if (u[u.length - 1] !== t1) u.push(t1); if (u.length < 2) return piecewise([t0, t1], [t0, t1]); const step = (t1 - t0) / (u.length - 1); return piecewise(u, u.map((_, i) => t0 + i * step)); }
function compressed(tracks, t0, t1) {
  const iv = tracks.flatMap((t) => t.spans.map((s) => [s.start, s.end])).sort((a, b) => a[0] - b[0]);
  const segs = [];
  for (const [s, e] of iv) { const a = s - 2000, b = e + 2000, l = segs[segs.length - 1]; if (l && a <= l[1]) { if (b > l[1]) l[1] = b; } else segs.push([a, b]); }
  if (!segs.length) segs.push([t0, t1]);
  segs[0][0] = Math.max(segs[0][0], t0); segs[segs.length - 1][1] = Math.min(Math.max(segs[segs.length - 1][1], segs[segs.length - 1][0]), t1);
  const T = [], U = [], gaps = []; let u = segs[0][0];
  segs.forEach(([s, e], i) => { if (i) { const g = s - segs[i - 1][1]; if (g > 30_000) { u += 8000; gaps.push({ t0: segs[i - 1][1], t1: s, uMid: u - 4000 }); } else u += g; } T.push(s); U.push(u); u += Math.max(0, e - s); T.push(e); U.push(u); });
  return { ...piecewise(T, U), gaps };
}
/** Virtual axis for a trace: "time" (optionally idle-compressed), "turns" or "calls" (equal width per boundary). */
export function buildScale(tracks, mode = "time", compress = true) {
  const [t0, t1] = bounds(tracks);
  if (mode === "turns") return equalWidth((tracks.find((t) => t.id === "main")?.spans ?? []).filter((s) => s.kind === "turn").map((s) => s.start), t0, t1);
  if (mode === "calls") return equalWidth(tracks.flatMap((t) => t.spans.filter((s) => s.kind === "model" || s.kind === "tool" || s.kind === "background").flatMap((s) => [s.start, s.end])), t0, t1);
  return compress ? compressed(tracks, t0, t1) : piecewise([t0, t1], [t0, t1]);
}
export function formatOffset(ms) { const sg = ms < 0 ? "-" : "+", a = Math.abs(ms), hh = Math.floor(a / 3_600_000), mm = Math.floor((a % 3_600_000) / 60_000), ss = Math.floor((a % 60_000) / 1000), mi = Math.floor(a % 1000); const b = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}${mi ? "." + String(mi).padStart(3, "0") : ""}`; return hh ? `${sg}${hh}:${b}` : `${sg}${b}`; }
function niceStep(raw) { const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1))); for (const m of [1, 2, 5, 10]) if (p * m >= raw) return p * m; return p * 10; }
export function buildTicks(sc, u0, u1, px) { const span = u1 - u0; if (span <= 0 || px <= 0) return []; const d0 = sc.domain[0], step = niceStep((span * 90) / px), out = []; for (let u = d0 + Math.ceil((u0 - d0) / step) * step, n = 0; u <= u1 && n < 200; u += step, n++) { const major = Math.round((u - d0) / step) % 5 === 0; out.push({ u, major, label: major ? fmt.clock(sc.toT(u)) : formatOffset(u - d0) }); } return out; }

/** One viewport shared by a timeline, its minimap and anything else that follows the visible window. */
export function createView(trace, { mode = "time", compress = true } = {}) {
  const ls = new Set();
  const v = {
    mode, compress, scale: buildScale(trace.tracks, mode, compress), u0: 0, u1: 1,
    set(u0, u1, src) { const [d0, d1] = v.scale.domain; let span = Math.max(10, u1 - u0); span = Math.min(span, d1 - d0 || 10); let a = u0; if (a < d0) a = d0; if (a + span > d1) a = d1 - span; v.u0 = a; v.u1 = a + span; for (const f of ls) f(src); },
    fit(src) { v.set(...v.scale.domain, src); },
    /** Switch axis mode / compression keeping the visible wall-time window (TraceView.tsx). */
    remap(next) { const t0 = v.scale.toT(v.u0), t1 = v.scale.toT(v.u1), full = v.u1 - v.u0 >= (v.scale.domain[1] - v.scale.domain[0]) * 0.999; Object.assign(v, next); v.scale = buildScale(trace.tracks, v.mode, v.compress); if (full) v.fit("remap"); else { const a = v.scale.toU(t0), b = v.scale.toU(t1); b - a > 0 ? v.set(a, b, "remap") : v.fit("remap"); } },
    on(f) { ls.add(f); return () => ls.delete(f); },
    range() { return [Math.round(v.scale.toT(v.u0)), Math.round(v.scale.toT(v.u1))]; },
  };
  [v.u0, v.u1] = v.scale.domain;
  return v;
}

/* ---------------- palette (traces/trace-colors.ts) ---------------- */
export function readPalette(el) {
  const cs = getComputedStyle(el), v = (n, f) => cs.getPropertyValue(n).trim() || f;
  return { turn: v("--os-turn", "#a0a0a8"), model: v("--os-model", "#5ad8e6"), tool: v("--os-tool", "#f5a524"), subagent: v("--os-agent", "#ed4abf"), background: v("--os-bg", "#46464c"), bad: v("--os-bad", "#ff6166"), badSoft: v("--os-bad-soft", "rgba(255,97,102,.13)"), ink1: v("--os-ink-1", "#ededef"), ink2: v("--os-ink-2", "#a0a0a8"), ink3: v("--os-ink-3", "#6c6c74"), grid: v("--os-line-1", "rgba(127,127,127,.12)"), band: v("--os-band", "rgba(127,127,127,.05)"), focus: v("--os-focus", "#5ad8e6"), inv: v("--os-inv", "#0a0a0b"), brush: v("--os-brush", "rgba(127,127,127,.16)"), sans: v("--h-font", "system-ui"), mono: v("--h-mono", "ui-monospace") };
}
function clip(c, s, w) { if (w <= 8) return ""; if (c.measureText(s).width <= w) return s; let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.measureText(s.slice(0, m) + "…").width <= w) lo = m; else hi = m - 1; } return lo ? s.slice(0, lo) + "…" : ""; }
function roundRect(c, x, y, w, hh, r) { w = Math.max(0, w); hh = Math.max(0, hh); r = Math.max(0, Math.min(r, w / 2, hh / 2)); c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, hh, r); else c.rect(x, y, w, hh); }

/* ---------------- TimelineCanvas (traces/TimelineCanvas.tsx) ---------------- */
/**
 * data: SessionTrace. opts: layers, view (createView), mode, compress, collapsed (Set of track ids) or
 * collapseDepth, search, focusTool, height cap, onSelect(s, t), onOpen(s, t) (click), keys (default on).
 * Methods: draw(), select(s, t, {reveal}), clear(), setSearch(q) → matches, zoomToSpan(s), toggle(trackId),
 * collapseAll(bool), tracks (the visible track list). Events: select (span), pin (P key), brush (shift-drag).
 */
export const TimelineCanvas = {
  label: "Timeline canvas",
  make(trace, o = {}) {
    const L = lay(o);
    const view = o.view ?? createView(trace, { mode: o.mode, compress: o.compress ?? true });
    const tracks = trace.tracks.filter((t) => t.id === "main" || L.has("subagents"));
    const st = { sel: null, selT: null, hover: null, q: (o.search ?? o.focusTool ?? "").toLowerCase(), collapsed: o.collapsed ?? new Set(o.collapseDepth != null ? tracks.filter((t) => depthOf(t) >= o.collapseDepth && t.id !== "main").map((t) => t.id) : []), brush: null };
    const cv = h("canvas", { class: "sl-tl-cv os-cv", tabindex: "0", role: "application", "aria-label": "Trace timeline. Click a span to inspect. With focus: W and S zoom, A and D pan, 0 fits, F focuses the selection, comma and period step through a lane, P pins, Escape clears. Shift-drag selects a time range." });
    const tip = h("div", { class: "sl-tl-tip os-tip", hidden: true });
    const el = h("div", { class: "sl-tl os-cvwrap" }, cv, tip);
    const c = comp("TimelineCanvas", el, { session: trace.file, mode: view.mode, compress: view.compress, layers: [...L] });
    const childrenOf = (id) => tracks.filter((t) => t.parentId === id);
    const hiddenByAncestor = (t) => { let p = t.parentId; while (p) { if (st.collapsed.has(p)) return true; p = trace.tracks.find((x) => x.id === p)?.parentId; } return false; };
    function rows() {
      const out = [];
      for (const t of tracks) {
        if (hiddenByAncestor(t)) continue;
        out.push({ type: "head", t, hgt: 24 });
        if (st.collapsed.has(t.id)) { out.push({ type: "gap", hgt: 4 }); continue; }
        for (const k of KINDS) if (t.spans.some((s) => s.kind === k)) out.push({ type: "lane", t, k, hgt: 20 });
        if (L.has("cost") && t.spans.some((s) => s.cost)) out.push({ type: "cost", t, hgt: 22 });
        out.push({ type: "gap", hgt: 8 });
      }
      return out;
    }
    let geo = null, raf = 0;
    const RULER = 22;
    const matches = () => { if (!st.q) return null; return new Set(allSpans({ tracks }).filter(({ s }) => `${s.label} ${s.kind} ${s.detail ?? ""} ${s.errorKind ?? ""}`.toLowerCase().includes(st.q)).map(({ s }) => s.id)); };
    let matchIds = matches();
    function draw() {
      const W = Math.max(280, el.clientWidth || 600), G = W < 520 ? 82 : 150, rs = rows();
      const H = RULER + rs.reduce((n, r) => n + r.hgt, 0) + 4, dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr; cv.style.height = `${H}px`;
      const P = readPalette(el), c2 = cv.getContext("2d"), sc = view.scale;
      c2.setTransform(dpr, 0, 0, dpr, 0, 0); c2.clearRect(0, 0, W, H);
      const v0 = view.u0, v1 = view.u1, X = (t) => G + ((sc.toU(t) - v0) / (v1 - v0 || 1)) * (W - G - 6), XU = (u) => G + ((u - v0) / (v1 - v0 || 1)) * (W - G - 6);
      geo = { W, G, X, rs, hits: [], heads: [], H };
      c2.font = `10px ${P.mono}`; c2.lineWidth = 1;
      for (const tk of buildTicks(sc, v0, v1, W - G - 6)) { const x = XU(tk.u); c2.strokeStyle = P.grid; c2.beginPath(); c2.moveTo(x + 0.5, tk.major ? RULER - 8 : RULER - 4); c2.lineTo(x + 0.5, H); c2.stroke(); if (x < W - 30) { c2.fillStyle = tk.major ? P.ink2 : P.ink3; c2.textAlign = "left"; c2.fillText(tk.label, x + 3, 12); } }
      if (view.mode === "time" && view.compress) for (const g of sc.gaps) { const x = XU(g.uMid); if (x < G || x > W) continue; c2.fillStyle = P.band; c2.fillRect(x - 6, RULER, 12, H - RULER); c2.fillStyle = P.ink3; c2.textAlign = "center"; c2.fillText("⋯", x, RULER + 10); }
      trace.tracks[0].spans.filter((s) => s.kind === "turn").forEach((s, i) => { if (i % 2) { c2.fillStyle = P.band; const a = Math.max(G, X(s.start)), b = Math.min(W, X(s.end)); if (b > a) c2.fillRect(a, RULER, b - a, H - RULER); } });
      if (st.brush) { const a = Math.max(G, XU(Math.min(...st.brush))), b = Math.min(W, XU(Math.max(...st.brush))); c2.fillStyle = P.brush; c2.fillRect(a, RULER, Math.max(1, b - a), H - RULER); c2.strokeStyle = P.focus; c2.strokeRect(a + 0.5, RULER + 0.5, Math.max(1, b - a - 1), H - RULER - 1); }
      let y = RULER;
      const maxTok = Math.max(1, ...allSpans(trace).map(({ s }) => s.tokens ?? 0));
      for (const r of rs) {
        if (r.type === "head") {
          const ind = 4 + Math.min(3, depthOf(r.t)) * 10, caret = st.collapsed.has(r.t.id) ? "▸ " : "▾ ";
          c2.font = `600 12px ${P.sans}`; c2.fillStyle = P.ink1; c2.textAlign = "left";
          c2.fillText(clip(c2, caret + r.t.label, G - ind - 6), ind, y + 16);
          if (W > 520 && r.t.model) { const lw = c2.measureText(caret + r.t.label).width; c2.font = `10.5px ${P.mono}`; c2.fillStyle = P.ink3; c2.fillText(clip(c2, r.t.model, G - ind - 10 - lw), ind + 4 + lw, y + 16); }
          geo.heads.push({ y0: y, y1: y + r.hgt, t: r.t });
          for (const m of r.t.markers ?? []) { const x = X(m.time); if (x < G || x > W) continue; c2.fillStyle = P.ink1; c2.beginPath(); c2.moveTo(x, y + 8); c2.lineTo(x + 4, y + 12); c2.lineTo(x, y + 16); c2.lineTo(x - 4, y + 12); c2.fill(); geo.hits.push({ x0: x - 5, x1: x + 5, y0: y + 6, y1: y + 18, marker: m, t: r.t }); }
        } else if (r.type === "lane") {
          c2.font = `11px ${P.sans}`; c2.fillStyle = P.ink3; c2.textAlign = "left"; c2.fillText(LANE[r.k], 6 + Math.min(3, depthOf(r.t)) * 10 + 12, y + 14);
          for (const s of r.t.spans) {
            if (s.kind !== r.k) continue;
            let x0 = X(s.start), x1 = X(s.end);
            if (x1 < G || x0 > W - 3) continue;
            x0 = Math.max(G, x0); x1 = Math.min(W - 2, Math.max(x0 + 1.5, x1));
            let hh = r.hgt - 4, yy = y + 2;
            if (L.has("tokens") && s.kind === "model" && s.tokens) { hh = Math.max(5, (r.hgt - 4) * Math.sqrt(s.tokens / maxTok)); yy = y + 2 + (r.hgt - 4 - hh); }
            c2.globalAlpha = matchIds && !matchIds.has(s.id) ? 0.22 : 1;
            const err = s.isError && L.has("errors");
            c2.fillStyle = err ? P.bad : P[s.kind];
            roundRect(c2, x0, yy, x1 - x0, hh, Math.min(2.5, (x1 - x0) / 2)); c2.fill();
            if (err) { c2.fillStyle = P.badSoft; c2.fillRect(x0, y, x1 - x0, r.hgt); }
            if (x1 - x0 > 46 && hh > 12) { c2.font = `10.5px ${P.sans}`; c2.fillStyle = s.kind === "background" || s.kind === "turn" ? P.ink1 : P.inv; c2.fillText(clip(c2, s.label, x1 - x0 - 6), x0 + 4, yy + hh - 5); }
            if (st.sel === s) { c2.strokeStyle = P.focus; c2.lineWidth = 2; roundRect(c2, x0 - 1.5, y + 0.5, x1 - x0 + 3, r.hgt - 1, 3); c2.stroke(); c2.lineWidth = 1; }
            if (st.hover?.s === s) { c2.fillStyle = "rgba(255,255,255,.18)"; roundRect(c2, x0, yy, x1 - x0, hh, 2); c2.fill(); }
            c2.globalAlpha = 1;
            geo.hits.push({ x0: x0 - 1, x1: x1 + 1, y0: y, y1: y + r.hgt, s, t: r.t });
          }
        } else if (r.type === "cost") {
          c2.font = `11px ${P.sans}`; c2.fillStyle = P.ink3; c2.textAlign = "left"; c2.fillText("Cost", 6 + Math.min(3, depthOf(r.t)) * 10 + 12, y + 14);
          const ms = r.t.spans.filter((s) => s.kind === "model" && s.cost).sort((a, b) => a.end - b.end), total = ms.reduce((n, s) => n + s.cost, 0) || 1;
          let acc = 0; c2.beginPath(); c2.moveTo(Math.max(G, X(trace.startedAt)), y + r.hgt - 3);
          for (const s of ms) { acc += s.cost; c2.lineTo(Math.min(W - 2, Math.max(G, X(s.end))), y + r.hgt - 3 - (acc / total) * (r.hgt - 6)); }
          c2.strokeStyle = P.subagent; c2.lineWidth = 1.5; c2.stroke(); c2.lineWidth = 1;
          c2.font = `10px ${P.mono}`; c2.fillStyle = P.ink2; c2.textAlign = "right"; c2.fillText(fmt.cost(total), W - 4, y + 10);
        }
        y += r.hgt;
      }
      c.spec.view = view.range(); c.spec.collapsed = [...st.collapsed];
    }
    const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    const offView = view.on(redraw);
    const xToU = (x) => view.u0 + ((x - geo.G) / (geo.W - geo.G - 6)) * (view.u1 - view.u0);
    const zoomAt = (f, x) => { const frac = x == null ? 0.5 : Math.min(1, Math.max(0, (x - geo.G) / (geo.W - geo.G - 6))), span = view.u1 - view.u0, a = view.u0 + span * frac, ns = span * f; view.set(a - ns * frac, a + ns * (1 - frac), "zoom"); };
    const panBy = (du) => view.set(view.u0 + du, view.u1 + du, "pan");
    const zoomToSpan = (s) => { const a = view.scale.toU(s.start), b = view.scale.toU(s.end), pad = Math.max((b - a) * 0.1, 5); view.set(a - pad, b + pad, "focus"); };
    function hitAt(x, y) { let best = null; for (const q of geo?.hits ?? []) if (x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1 && (!best || q.x1 - q.x0 < best.x1 - best.x0)) best = q; return best; }
    function select(s, t, { reveal = false, quiet = false, open = true } = {}) {
      st.sel = s; st.selT = t;
      if (!s) { redraw(); if (!quiet) c.emit("select", { ids: {}, label: "cleared" }); o.onSelect?.(null, null); return; }
      if (!tracks.includes(t)) tracks.push(t);
      st.collapsed.delete(t.id); let p = t.parentId; while (p) { st.collapsed.delete(p); p = trace.tracks.find((x) => x.id === p)?.parentId; }
      if (reveal) { const a = view.scale.toU(s.start), b = view.scale.toU(s.end); if (a < view.u0 || b > view.u1) { const w = Math.max(view.u1 - view.u0, (b - a) * 3); view.set((a + b) / 2 - w / 2, (a + b) / 2 + w / 2, "reveal"); } }
      redraw();
      c.spec.selected = s.id;
      if (!quiet) c.emit("select", { ids: spanIds(s, t, trace), label: spanLabel(s, t) });
      o.onSelect?.(s, t, { open });
    }
    let drag = null;
    cv.addEventListener("pointerdown", (e) => { cv.focus({ preventScroll: true }); const r = cv.getBoundingClientRect(), x = e.clientX - r.left; drag = { x: e.clientX, u: [view.u0, view.u1], moved: false, brush: e.shiftKey && x > geo.G, ua: xToU(x) }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      st.hx = x;
      if (drag) {
        const dx = e.clientX - drag.x; if (Math.abs(dx) > 3) drag.moved = true;
        if (drag.moved && drag.brush) { st.brush = [drag.ua, xToU(x)]; redraw(); }
        else if (drag.moved) { const w = drag.u[1] - drag.u[0]; view.set(drag.u[0] - (dx / (geo.W - geo.G)) * w, drag.u[0] - (dx / (geo.W - geo.G)) * w + w, "pan"); }
        tip.hidden = true; return;
      }
      const hit = hitAt(x, y);
      if (hit !== st.hover && hit?.s !== st.hover?.s) { st.hover = hit; redraw(); }
      if (hit) {
        tip.hidden = false;
        if (hit.marker) tip.replaceChildren(h("b", {}, hit.marker.label), h("div", { class: "sl-micro" }, `${hit.marker.kind.replace("_", " ")} · ${fmt.clock(hit.marker.time)} (${formatOffset(hit.marker.time - trace.startedAt)})`));
        else { const s = hit.s; tip.replaceChildren(h("b", {}, s.label), h("div", { class: "sl-micro" }, `${fmt.dur(s.end - s.start)} · ${fmt.clock(s.start)} (${formatOffset(s.start - trace.startedAt)})${s.unterminated ? " · unterminated" : ""}`), s.kind === "model" ? h("div", { class: "sl-micro" }, [s.tokens != null ? `${fmt.int(s.tokens)} tok` : "usage not recorded", s.cost != null ? `$${s.cost.toFixed(4)}` : null, s.ttft != null ? `TTFT ${fmt.dur(s.ttft)}` : null, s.isError ? "error" : null].filter(Boolean).join(" · ")) : null, s.kind === "subagent" && s.model ? h("div", { class: "sl-micro" }, s.model) : null, s.isError && s.errorKind ? h("div", { class: "sl-micro bad" }, s.errorKind) : null, s.detail ? h("div", { class: "sl-tl-tipd" }, s.detail) : null); }
        tip.style.left = `${Math.min(x + 12, geo.W - 230)}px`; tip.style.top = `${y + 14 > geo.H - 70 ? y - 70 : y + 14}px`; cv.style.cursor = "pointer";
      } else { tip.hidden = true; cv.style.cursor = x > geo.G ? "grab" : "default"; }
    });
    cv.addEventListener("pointerleave", () => { tip.hidden = true; st.hx = null; if (st.hover) { st.hover = null; redraw(); } });
    cv.addEventListener("pointerup", (e) => {
      const d = drag; drag = null;
      if (d?.moved && d.brush && st.brush) { const [a, b] = [Math.min(...st.brush), Math.max(...st.brush)], range = [Math.round(view.scale.toT(a)), Math.round(view.scale.toT(b))]; c.spec.brush = range; c.emit("brush", { ids: { session: trace.file }, range, label: `${fmt.clock(range[0])} → ${fmt.clock(range[1])} (${fmt.elapsed(range[1] - range[0])})` }); return; }
      if (d?.moved) return;
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < geo.G) { const hd = geo.heads.find((q) => y >= q.y0 && y < q.y1); if (hd) c.toggle(hd.t.id); return; }
      const hit = hitAt(x, y);
      if (st.brush) { st.brush = null; delete c.spec.brush; }
      if (hit?.s) select(hit.s, hit.t); else if (st.sel) select(null, null); else redraw();
    });
    cv.addEventListener("dblclick", (e) => { const r = cv.getBoundingClientRect(), hit = hitAt(e.clientX - r.left, e.clientY - r.top); if (hit?.s) zoomToSpan(hit.s); });
    cv.addEventListener("wheel", (e) => {
      const focused = document.activeElement === cv;
      if (!(e.ctrlKey || e.metaKey || focused)) return; // page scroll keeps working until the timeline has focus
      e.preventDefault();
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, span = view.u1 - view.u0, w = geo.W - geo.G;
      if (e.shiftKey) { panBy(((Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) / w) * span); return; }
      if (e.deltaX) panBy((e.deltaX / w) * span);
      if (e.deltaY) zoomAt(1.0015 ** e.deltaY, x);
    }, { passive: false });
    const sibling = (dir) => { if (!st.sel) return; const lane = st.selT.spans.filter((s) => s.kind === st.sel.kind), i = lane.indexOf(st.sel), n = lane[i + dir]; if (n) select(n, st.selT, { reveal: true }); };
    cv.addEventListener("keydown", (e) => {
      if (o.keys === false) return;
      const span = view.u1 - view.u0;
      switch (e.key) {
        case "w": case "W": zoomAt(1 / 1.3, st.hx); break;
        case "s": case "S": zoomAt(1.3, st.hx); break;
        case "a": case "A": panBy(-span * 0.2); break;
        case "d": case "D": panBy(span * 0.2); break;
        case "0": view.fit("fit"); break;
        case "f": case "F": if (st.sel) zoomToSpan(st.sel); break;
        case "Escape": if (st.brush) { st.brush = null; redraw(); } else select(null, null); break;
        case ",": sibling(-1); break;
        case ".": sibling(1); break;
        case "p": case "P": c.pin(); break;
        default: return;
      }
      e.preventDefault();
    });
    new ResizeObserver(redraw).observe(el);
    addEventListener("theme", redraw);
    requestAnimationFrame(draw);
    Object.assign(c, {
      draw, select, view, tracks, state: st, zoomToSpan,
      clear: () => select(null, null),
      toggle(id) { st.collapsed.has(id) ? st.collapsed.delete(id) : st.collapsed.add(id); redraw(); c.emit("filter", { filter: { collapsed: [...st.collapsed] }, label: `${st.collapsed.has(id) ? "collapsed" : "expanded"} ${id}` }); },
      collapseAll(on) { st.collapsed = new Set(on ? tracks.filter((t) => t.id !== "main" && childrenOf(t.parentId).length >= 0).map((t) => t.id) : []); redraw(); },
      setSearch(q) { st.q = (q ?? "").trim().toLowerCase(); matchIds = matches(); c.spec.search = st.q; redraw(); return matchIds; },
      destroy() { offView(); },
    });
    return c;
  },
};

/* ---------------- Minimap (traces/Minimap.tsx) ---------------- */
/** Density strips over the whole axis plus a brush: drag inside to move, drag an edge to resize, drag outside to draw a new window, dbl-click to fit. */
export const Minimap = {
  label: "Minimap",
  make(trace, o = {}) {
    const L = lay(o), view = o.view ?? createView(trace, { mode: o.mode, compress: o.compress ?? true });
    const cv = h("canvas", { class: "sl-mini os-mini", role: "slider", "aria-label": "Timeline overview brush: drag to move, drag an edge to resize, drag outside to draw a window, double-click to fit", tabindex: "-1" });
    const el = h("div", { class: "sl-miniwrap" }, cv);
    const c = comp("Minimap", el, { session: trace.file });
    const HGT = 40, KS = ["turn", "model", "tool", "subagent"];
    let W = 600, raf = 0, drag = null;
    const tracks = trace.tracks.filter((t) => t.id === "main" || L.has("subagents"));
    function draw() {
      W = Math.max(100, el.clientWidth || 600); const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = HGT * dpr; cv.style.height = `${HGT}px`;
      const c2 = cv.getContext("2d"); c2.setTransform(dpr, 0, 0, dpr, 0, 0); c2.clearRect(0, 0, W, HGT);
      const P = readPalette(el), sc = view.scale, [d0, d1] = sc.domain, ds = Math.max(d1 - d0, 1e-9), sh = HGT / KS.length;
      const strips = KS.map(() => new Float32Array(W));
      for (const t of tracks) for (const s of t.spans) { const k = KS.indexOf(s.kind); if (k < 0) continue; const x0 = Math.max(0, Math.floor(((sc.toU(s.start) - d0) / ds) * W)), x1 = Math.min(W - 1, Math.ceil(((sc.toU(s.end) - d0) / ds) * W)); for (let x = x0; x <= x1; x++) strips[k][x] = Math.min(1, strips[k][x] + 0.34); }
      strips.forEach((strip, k) => { c2.fillStyle = P[KS[k]]; for (let x = 0; x < W; x++) { if (strip[x] <= 0) continue; c2.globalAlpha = 0.25 + strip[x] * 0.75; c2.fillRect(x, k * sh + 1, 1, sh - 2); } c2.globalAlpha = 1; });
      if (L.has("errors")) { c2.fillStyle = P.bad; for (const t of tracks) for (const s of t.spans) if (s.isError) { const x = ((sc.toU(s.start) - d0) / ds) * W; c2.fillRect(x, HGT - 3, 2, 3); } }
      const vx0 = ((view.u0 - d0) / ds) * W, vx1 = ((view.u1 - d0) / ds) * W;
      c2.fillStyle = P.brush; c2.fillRect(vx0, 0, vx1 - vx0, HGT);
      c2.strokeStyle = P.focus; c2.lineWidth = 1; c2.strokeRect(vx0 + 0.5, 0.5, Math.max(1, vx1 - vx0 - 1), HGT - 1);
      c2.fillStyle = P.focus; c2.fillRect(vx0, 0, 2, HGT); c2.fillRect(vx1 - 2, 0, 2, HGT);
      c.spec.view = view.range();
    }
    const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    const off = view.on(redraw);
    const toU = (x) => view.scale.domain[0] + (x / Math.max(W, 1)) * (view.scale.domain[1] - view.scale.domain[0]);
    const toX = (u) => ((u - view.scale.domain[0]) / Math.max(view.scale.domain[1] - view.scale.domain[0], 1e-9)) * W;
    cv.addEventListener("pointerdown", (e) => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, a = toX(view.u0), b = toX(view.u1);
      let mode = Math.abs(x - a) <= 6 ? "left" : Math.abs(x - b) <= 6 ? "right" : x > a && x < b && b - a < W * 0.98 ? "move" : "create";
      if (mode === "create") view.set(toU(x), toU(x) + 10, "minimap");
      drag = { mode, x, u: [view.u0, view.u1] }; cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
      const r = cv.getBoundingClientRect(), x = Math.max(0, Math.min(W, e.clientX - r.left));
      if (!drag) { const a = toX(view.u0), b = toX(view.u1); cv.style.cursor = Math.abs(x - a) <= 6 || Math.abs(x - b) <= 6 ? "ew-resize" : x > a && x < b ? "grab" : "crosshair"; return; }
      const du = toU(x) - toU(drag.x), [u0, u1] = drag.u;
      if (drag.mode === "move") view.set(u0 + du, u1 + du, "minimap");
      else if (drag.mode === "left") view.set(Math.min(u0 + du, u1 - 10), u1, "minimap");
      else if (drag.mode === "right") view.set(u0, Math.max(u1 + du, u0 + 10), "minimap");
      else { const a = toU(drag.x), b = toU(x); view.set(Math.min(a, b), Math.max(a, b, Math.min(a, b) + 10), "minimap"); }
    });
    cv.addEventListener("pointerup", () => { if (!drag) return; drag = null; const range = view.range(); c.emit("brush", { ids: { session: trace.file }, range, filter: { viewport: true }, label: `viewport ${fmt.clock(range[0])} → ${fmt.clock(range[1])}` }); });
    cv.addEventListener("dblclick", () => view.fit("minimap"));
    new ResizeObserver(redraw).observe(el);
    addEventListener("theme", redraw);
    requestAnimationFrame(draw);
    Object.assign(c, { draw, view, destroy: off });
    return c;
  },
};

/* ---------------- SpanDrawer (traces/SpanDrawer.tsx) ---------------- */
function textBlocks(content) { if (typeof content === "string") return content.trim() ? [{ kind: "text", text: content }] : []; return Array.isArray(content) ? content.filter((b) => b && (b.type === "text" || b.type === "thinking") && typeof b.text === "string").map((b) => ({ kind: b.type, text: b.text })) : []; }
/**
 * Detail for one span: per-kind metrics, error message, task + "open child track", args, the journal
 * entry's text blocks and raw JSON. data: {span, track, trace}. opts.entry(file, id) → entry | Promise
 * (fixture map or GET /api/session/entry), onClose, onTrack(childTrackId).
 */
export const SpanDrawer = {
  label: "Span drawer",
  make({ span, track, trace }, o = {}) {
    const body = h("div", { class: "sl-sd-b" });
    const pinBtn = h("button", { type: "button", class: "sl-btn ghost sm", title: "Pin: send this span to the agent as context", onclick: () => c.emit("pin", { ids: spanIds(span, track, trace), label: spanLabel(span, track) }) }, "Pin");
    const copyBtn = h("button", { type: "button", class: "sl-btn ghost sm", title: "Copy raw JSON" }, "Copy JSON");
    const head = h("div", { class: "os-dh sl-sd-h" }, h("div", { class: "sl-sd-t" }, h("b", {}, span.label), h("span", { class: `os-kchip k-${span.kind}${span.isError ? " err" : ""}` }, span.isError ? `${span.kind} · error` : span.kind)), h("div", { class: "sl-sd-a" }, pinBtn, copyBtn, o.onClose ? h("button", { class: "sl-btn ghost icon os-x", type: "button", "aria-label": "Close span", onclick: o.onClose }, "✕") : null));
    const el = h("div", { class: "os-drawer sl-sd", "data-kind": span.kind, tabindex: "-1" }, head, body);
    const c = comp("SpanDrawer", el, { session: trace?.file, span: span.id, kind: span.kind });
    el.addEventListener("keydown", (e) => { if (e.key === "Escape" && o.onClose) { e.stopPropagation(); o.onClose(); } });
    let entry = null;
    copyBtn.onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(entry ?? span, null, 2)); copyBtn.textContent = "Copied"; } catch { copyBtn.textContent = "Copy failed"; } setTimeout(() => (copyBtn.textContent = "Copy JSON"), 1500); };
    function render(e) {
      const m = e?.message, u = m?.usage;
      const metrics = [["Duration", fmt.dur(span.end - span.start) + (span.unterminated ? " · unterminated" : "")], ["Start", `${fmt.clock(span.start)} (${formatOffset(span.start - (trace?.startedAt ?? span.start))})`], ["Track", mono(track?.label ?? "-")]];
      if (span.kind === "model") {
        const none = span.tokens == null && !u;
        metrics.push(["Tokens", none ? "not recorded" : fmt.int(span.tokens ?? u.totalTokens)], ["Cost", none ? "N/A" : "$" + (span.cost ?? u?.cost?.total ?? 0).toFixed(4)], ["TTFT", fmt.dur(span.ttft ?? m?.ttft ?? null)], ["Model", mono(m?.model ?? span.model ?? "-")]);
        if (u) metrics.push(["Input / output / cached", `${fmt.int(u.input)} / ${fmt.int(u.output)} / ${fmt.int(u.cacheRead)}`]);
        if (m?.provider) metrics.push(["Provider", mono(m.provider)]);
        if (m?.stopReason) metrics.push(["Stop reason", mono(m.stopReason)]);
      }
      if (span.kind === "tool") { metrics.push(["Tool", mono(span.label)]); if (span.resultChars != null) metrics.push(["Result", `${fmt.int(span.resultChars)} chars`]); }
      if (span.kind === "subagent") { metrics.push(["Agent", span.label]); if (span.model) metrics.push(["Model", mono(span.model)]); }
      const kids = [keyValues(metrics)];
      const errText = m?.errorMessage ?? (span.isError ? span.errorKind ?? "failed" : null);
      if (errText) kids.push(h("div", { class: "sl-sd-sec" }, sectionLabel("Error message", "bad"), h("pre", { class: "sl-code bad" }, errText)));
      if (span.kind === "subagent") kids.push(h("div", { class: "sl-sd-sec" }, span.detail ? [sectionLabel("Task"), h("pre", { class: "sl-code" }, span.detail)] : null, span.childTrackId && o.onTrack ? h("button", { class: "sl-btn sm", type: "button", onclick: () => { o.onTrack(span.childTrackId); c.emit("select", { ids: { session: trace?.file, track: span.childTrackId }, label: `child track ${span.childTrackId}` }); } }, "Open child track ", mono(span.childTrackId)) : null));
      if (span.kind === "tool" && span.detail) kids.push(h("div", { class: "sl-sd-sec" }, sectionLabel("Args"), h("pre", { class: "sl-code" }, span.detail)));
      if (span.kind === "tool" && o.withheld) kids.push(h("div", { class: "sl-sd-sec" }, sectionLabel("Result excerpt"), h("pre", { class: "sl-code dim" }, span.resultChars != null ? `‹${fmt.int(span.resultChars)} chars of tool output, withheld from the public fixture›` : "‹tool output withheld›")));
      for (const b of textBlocks(m?.content)) kids.push(h("div", { class: "sl-sd-sec" }, sectionLabel(b.kind === "thinking" ? "Thinking" : "Text"), h("pre", { class: "sl-code scroll" }, b.text)));
      if (e) kids.push(JsonBlock.make(e, { title: "Raw entry", collapsed: true }).el);
      body.replaceChildren(...kids);
    }
    render(null);
    if (span.entryId && o.entry && track) {
      body.append(h("div", { class: "sl-sd-load" }, skeleton(60), skeleton(90)));
      Promise.resolve(o.entry(track.file, span.entryId)).then((e) => { entry = e?.entry ?? e ?? null; render(entry); }).catch((err) => { render(null); body.append(errorState(`Failed to load entry: ${err?.message ?? err}`)); });
    }
    return c;
  },
};

/* ---------------- SummaryStrip (traces/SummaryStrip.tsx) ---------------- */
/** Headline tiles: wall time split into model/tool/idle, then turns, requests, tool calls, agents, tokens, cost (+ errors and a per-track table with layers). */
export const SummaryStrip = {
  label: "Summary strip",
  make(trace, o = {}) {
    const L = lay(o), s = trace.summary, w = Math.max(1, s.wallMs), share = (ms) => `${fmt.pct(ms / w)} of wall`;
    const errs = allSpans(trace).filter(({ s: x }) => x.isError).length;
    const grid = StatGrid.make([
      { label: "Wall time", value: fmt.elapsed(s.wallMs), hint: `${fmt.clock(trace.startedAt)} start` }, { label: "Model time", value: fmt.elapsed(s.modelMs), hint: share(s.modelMs) }, { label: "Tool time", value: fmt.elapsed(s.toolMs), hint: share(s.toolMs) }, { label: "Idle", value: fmt.elapsed(s.idleMs), hint: share(s.idleMs) },
      s.turns != null ? { label: "Turns", value: fmt.int(s.turns) } : null, { label: "Requests", value: fmt.int(s.requests), hint: `${fmt.int(s.toolCalls)} tool calls` },
      L.has("subagents") ? { label: "Agents", value: fmt.int(s.subagents), hint: `${trace.tracks.length - 1} child tracks` } : null,
      L.has("tokens") ? { label: "Tokens", value: s.totalTokens ? fmt.compact(s.totalTokens) : "-", hint: s.totalTokens ? null : "not recorded" } : null,
      L.has("cost") ? { label: "Cost", value: s.totalTokens || s.costTotal ? fmt.estCost(s.costTotal, s.unpricedRequests) : "N/A", hint: s.unpricedRequests ? `${s.unpricedRequests} unpriced` : null } : null,
      L.has("errors") ? { label: "Errors", value: fmt.int(errs), hint: `${fmt.rate(errs / Math.max(1, s.requests + s.toolCalls))} of calls`, tone: errs ? "bad" : null } : null,
    ], { min: o.min ?? 104, size: "sm", selectable: true });
    const el = h("div", { class: "sl-sum" }, grid.el);
    const c = comp("SummaryStrip", el, { session: trace.file, layers: [...L] });
    c.adopt(grid, { entities: { session: trace.file } });
    if (L.has("subagents") && trace.tracks.length > 1 && o.tracks !== false) {
      const rows = trace.tracks.map((t) => { let cost = 0, tok = 0, req = 0, ms = 0; for (const x of t.spans) if (x.kind === "model") { cost += x.cost ?? 0; tok += x.tokens ?? 0; req++; ms += x.end - x.start; } return { t, cost, tok, req, ms, tools: t.spans.filter((x) => x.kind === "tool").length }; });
      const mx = Math.max(...rows.map((r) => (L.has("cost") && r.cost ? r.cost : r.ms)), 1e-9);
      const tbl = Table.make(rows, { component: "TrackTable", dense: true, rowKey: (r) => r.t.id, ids: (r) => ({ session: trace.file, track: r.t.id, model: r.t.model ?? undefined }), label: (r) => `track ${r.t.label}: ${r.req} requests, ${fmt.elapsed(r.ms)} model time${L.has("cost") ? `, ${fmt.cost(r.cost)}` : ""}`, columns: [
        { key: "track", header: "Track", render: (r) => h("span", {}, h("span", { class: "os-tn" }, r.t.label), r.t.model ? mono(" " + r.t.model, "dim") : null), sort: (r) => r.t.label },
        { key: "req", header: "Req", align: "right", render: (r) => fmt.int(r.req), sort: (r) => r.req },
        { key: "tools", header: "Tools", align: "right", render: (r) => fmt.int(r.tools), sort: (r) => r.tools },
        { key: "ms", header: "Model time", align: "right", render: (r) => fmt.elapsed(r.ms), sort: (r) => r.ms },
        ...(L.has("cost") ? [{ key: "cost", header: "Cost", align: "right", render: (r) => (r.cost || trace.summary.totalTokens ? fmt.cost(r.cost) : "N/A"), sort: (r) => r.cost }] : []),
        { key: "bar", header: "", width: 90, render: (r) => h("i", { class: "os-bar " + (r.t.id === "main" ? "os-b1" : "os-b2"), style: { width: `${((L.has("cost") && r.cost ? r.cost : r.ms) / mx) * 100}%` } }) },
      ] });
      el.append(tbl.el);
      c.adopt(tbl, { entities: { session: trace.file } });
    }
    return c;
  },
};

/* ---------------- AggregatesPanel (traces/AggregatesPanel.tsx) ---------------- */
export const AggregatesPanel = {
  label: "Aggregates panel",
  make(toolStats, o = {}) {
    if (!toolStats?.length) return comp("AggregatesPanel", h("div", { class: "sl-empty" }, "No tool calls in this trace"));
    const mx = Math.max(...toolStats.map((x) => x.totalMs));
    const t = Table.make(toolStats, { component: "AggregatesPanel", dense: true, limit: o.limit ?? 12, rowKey: (r) => r.tool, initialSort: { key: "total", dir: "desc" }, ids: (r) => ({ session: o.session, tool: r.tool }), label: (r) => `tool ${r.tool}: ${r.calls} calls, ${r.errors} failed, ${fmt.dur(r.totalMs)} total, max ${fmt.dur(r.maxMs)}`, pinnable: o.pinnable, columns: [
      { key: "tool", header: "Tool", render: (r) => mono(r.tool), sort: (r) => r.tool },
      { key: "calls", header: "Calls", align: "right", render: (r) => fmt.int(r.calls), sort: (r) => r.calls },
      { key: "errors", header: "Errors", align: "right", render: (r) => (r.errors ? badge(`${fmt.int(r.errors)} failed`, "bad") : h("span", { class: "sl-num dim" }, "0")), sort: (r) => r.errors },
      { key: "total", header: "Total", align: "right", width: 180, render: (r) => meterCell(r.totalMs, mx, fmt.dur(r.totalMs), "var(--os-tool)"), sort: (r) => r.totalMs },
      { key: "avg", header: "Avg", align: "right", render: (r) => fmt.dur(r.calls ? r.totalMs / r.calls : 0), sort: (r) => (r.calls ? r.totalMs / r.calls : 0) },
      { key: "max", header: "Max", align: "right", render: (r) => fmt.dur(r.maxMs), sort: (r) => r.maxMs },
    ] });
    t.spec.session = o.session;
    return t;
  },
};

/* ---------------- TranscriptList (traces/TranscriptList.tsx) ---------------- */
/** Every span and marker in order, virtualized (28px rows), synced with the timeline selection. */
export const TranscriptList = {
  label: "Transcript list",
  make(trace, o = {}) {
    const ROW = 28, LIST = o.height ?? 340, OVER = 20;
    const all = [];
    for (const t of trace.tracks) { const dp = depthOf(t); for (const s of t.spans) all.push({ key: s.id, time: s.start, s, t, dp }); (t.markers ?? []).forEach((m, i) => all.push({ key: `${t.id}:m${i}`, time: m.time, m, t, dp })); }
    all.sort((a, b) => a.time - b.time);
    let rows = all, sel = null;
    const inner = h("div", { class: "sl-tx-in" }), sizer = h("div", { class: "sl-tx-size" }, inner);
    const el = h("div", { class: "sl-tx os-tx", style: { maxHeight: `${LIST}px` } }, sizer);
    const c = comp("TranscriptList", el, { session: trace.file, rows: all.length });
    const detailOf = (s) => (s.kind === "tool" ? s.detail ?? "" : s.kind === "model" ? (s.tokens == null ? "usage not recorded" : `${fmt.compact(s.tokens)} tok · ${fmt.cost(s.cost ?? 0)}`) : s.kind === "turn" ? (o.withheld ? "‹user message withheld›" : s.detail ?? "") : s.detail ?? "");
    function paint() {
      const top = el.scrollTop, a = Math.max(0, Math.floor(top / ROW) - OVER), b = Math.min(rows.length, Math.ceil((top + LIST) / ROW) + OVER);
      sizer.style.height = `${rows.length * ROW}px`; inner.style.top = `${a * ROW}px`;
      inner.replaceChildren(...rows.slice(a, b).map((r) => {
        const s = r.s, kids = [h("span", { class: `os-kchip k-${s?.kind ?? "marker"}` }, s?.kind ?? r.m.kind.replace("_", " ")), r.dp > 0 ? h("span", { class: "sl-tx-track sl-mono" }, r.t.label) : null, h("span", { class: "sl-tx-l" }, s?.label ?? r.m.label), s ? h("span", { class: "sl-tx-d" }, detailOf(s)) : null, h("span", { class: "sl-tx-m sl-num" }, s?.isError ? h("span", { class: "bad" }, "error ") : null, s ? fmt.dur(s.end - s.start) + " " : "", formatOffset(r.time - trace.startedAt))];
        return s ? h("button", { type: "button", class: "sl-tx-row", "data-selected": sel === s.id ? "true" : "false", style: { paddingLeft: `${8 + r.dp * 12}px` }, onclick: () => { sel = s.id; paint(); c.emit("select", { ids: spanIds(s, r.t, trace), label: spanLabel(s, r.t) }); o.onSelect?.(s, r.t); } }, kids) : h("div", { class: "sl-tx-row static", style: { paddingLeft: `${8 + r.dp * 12}px` } }, kids);
      }));
      if (!rows.length) inner.replaceChildren(empty("No matching events"));
    }
    let raf = 0; el.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }, { passive: true });
    paint();
    Object.assign(c, {
      setSearch(q, matchIds) { const n = (q ?? "").trim().toLowerCase(); rows = !n ? all : all.filter((r) => (r.s ? (matchIds ? matchIds.has(r.s.id) : `${r.s.label} ${r.s.detail ?? ""}`.toLowerCase().includes(n)) : r.m.label.toLowerCase().includes(n))); c.spec.search = n; el.scrollTop = 0; paint(); },
      reveal(id) { sel = id; const i = rows.findIndex((r) => r.s?.id === id); if (i >= 0) { const top = i * ROW; if (top < el.scrollTop || top + ROW > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 2); } paint(); },
    });
    return c;
  },
};

/* ---------------- TraceView composite (traces/TraceView.tsx) ---------------- */
const LEGEND = [["turn", "Input"], ["model", "Model"], ["tool", "Tool"], ["subagent", "Agent"], ["background", "Background"]];
/**
 * The whole trace page as one component: summary strip, axis/compress/search toolbar, minimap, canvas,
 * inline span drawer, transcript and tool aggregates, all on one shared viewport and selection.
 * opts: layers, entry(file, id), withheld, onBack, collapseDepth (default 1, like omp), title.
 */
export const TraceView = {
  label: "Trace view",
  make(trace, o = {}) {
    const L = lay(o);
    const view = createView(trace, { mode: o.mode ?? "time", compress: o.compress ?? true });
    const el = h("div", { class: "sl-tv os" });
    const c = comp("TraceView", el, { session: trace.file, layers: [...L] });
    const fwd = (x, name) => c.adopt(x, { entities: { session: trace.file }, part: name });
    const summary = fwd(SummaryStrip.make(trace, { layers: L }), "summary");
    const drawerSlot = h("div", { class: "os-dslot sl-dslot" });
    const tx = TranscriptList.make(trace, { withheld: o.withheld, onSelect: (s, t) => { tl.select(s, t, { reveal: true, quiet: true }); openDrawer(s, t); } });
    const tl = TimelineCanvas.make(trace, { layers: L, view, collapseDepth: o.collapseDepth ?? 1, onSelect: (s, t, x) => { if (!s) { drawerSlot.replaceChildren(); return; } tx.reveal(s.id); if (x?.open !== false) openDrawer(s, t); } });
    const mini = Minimap.make(trace, { layers: L, view });
    fwd(tl, "timeline"); fwd(mini, "minimap"); fwd(tx, "transcript");
    function openDrawer(s, t) { const d = SpanDrawer.make({ span: s, track: t, trace }, { entry: o.entry, withheld: o.withheld, onClose: () => { drawerSlot.replaceChildren(); tl.select(null, null); }, onTrack: (id) => { const ct = trace.tracks.find((x) => x.id === id); if (ct?.spans[0]) tl.select(ct.spans[0], ct, { reveal: true, open: false }); } }); fwd(d, "drawer"); drawerSlot.replaceChildren(d.el); anim(d.el, [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { spring: "snappy" }); }
    // toolbar
    const axis = Segmented.make([{ value: "time", label: "Duration", title: "Real wall-clock time" }, { value: "turns", label: "Turns", title: "Equal width per user turn" }, { value: "calls", label: "Calls", title: "Equal width per model/tool call boundary" }], { value: view.mode, name: "axis", size: "sm", label: "Axis mode", onChange: (m) => { view.remap({ mode: m }); comp_.hidden = m !== "time"; c.spec.mode = m; } });
    const comp_ = h("label", { class: "sl-check" }, h("input", { type: "checkbox", checked: view.compress, onchange: (e) => { view.remap({ compress: e.target.checked }); c.spec.compress = e.target.checked; c.emit("filter", { filter: { compressIdle: e.target.checked }, label: `compress idle ${e.target.checked ? "on" : "off"}` }); } }), "Compress idle");
    const count = h("span", { class: "sl-num sl-dim sl-tv-n" });
    const st = { matches: [], i: 0 };
    const search = SearchInput.make("", { placeholder: "Search spans…", width: 180, onInput: (q) => { const ids = tl.setSearch(q); tx.setSearch(q, ids); st.matches = ids ? allSpans(trace).filter(({ s }) => ids.has(s.id)).sort((a, b) => a.s.start - b.s.start) : []; st.i = 0; count.textContent = q.trim() ? (st.matches.length ? `1/${st.matches.length}` : "0") : ""; prev.disabled = next.disabled = !st.matches.length; } });
    const cycle = (d) => { if (!st.matches.length) return; st.i = (st.i + d + st.matches.length) % st.matches.length; count.textContent = `${st.i + 1}/${st.matches.length}`; const { s, t } = st.matches[st.i]; tl.select(s, t, { reveal: true, open: false }); };
    const prev = h("button", { type: "button", class: "sl-btn ghost icon sm", "aria-label": "Previous match", disabled: true, onclick: () => cycle(-1) }, "‹"), next = h("button", { type: "button", class: "sl-btn ghost icon sm", "aria-label": "Next match", disabled: true, onclick: () => cycle(1) }, "›");
    fwd(axis, "axis"); fwd(search, "search");
    const legend = h("div", { class: "os-legend" }, LEGEND.map(([k, l]) => h("span", {}, h("i", { class: `os-lg k-${k}` }), l)));
    const zoom = h("div", { class: "os-zoom" }, h("button", { type: "button", "aria-label": "Zoom out", onclick: () => { const s = view.u1 - view.u0, m = (view.u0 + view.u1) / 2; view.set(m - s * 0.8, m + s * 0.8, "zoom"); } }, "−"), h("button", { type: "button", "aria-label": "Zoom in", onclick: () => { const s = view.u1 - view.u0, m = (view.u0 + view.u1) / 2; view.set(m - s * 0.31, m + s * 0.31, "zoom"); } }, "+"), h("button", { type: "button", onclick: () => view.fit("fit") }, "Fit"));
    const toolbar = h("div", { class: "sl-tv-bar" }, axis.el, comp_, zoom, h("div", { class: "sl-tv-search" }, search.el, count, prev, next), h("span", { class: "sl-grow" }), legend);
    const expand = h("button", { type: "button", class: "sl-btn ghost sm", onclick: () => tl.collapseAll(false) }, "Expand all"), collapse = h("button", { type: "button", class: "sl-btn ghost sm", onclick: () => tl.collapseAll(true) }, "Collapse all");
    const titleRow = o.title === false ? null : h("div", { class: "sl-tv-title" }, o.onBack ? h("button", { type: "button", class: "sl-btn ghost sm", onclick: o.onBack }, "← Sessions") : null, h("b", {}, trace.title ?? trace.file), h("span", { class: "sl-dim" }, `${fmt.day(trace.startedAt)} · ${fmt.elapsed(trace.summary.wallMs)} · ${fmt.int(trace.summary.requests)} requests · ${trace.tracks.length} tracks`), trace.cwd ? mono(trace.cwd, "dim") : null);
    el.append(...[titleRow, summary.el, card({ title: "Timeline", desc: "W/S zoom · A/D pan · drag pan · ⌘/ctrl-wheel zoom (plain wheel once focused) · shift-drag selects a range · 0 fit · F focus · dbl-click focus · Esc deselect · P pins", actions: [expand, collapse], body: h("div", { class: "sl-tv-tl" }, toolbar, mini.el, tl.el, drawerSlot) }), L.has("transcript") || o.transcript !== false ? card({ title: "Transcript", desc: `Every span and marker in order; click to inspect${o.withheld ? ". Message text is withheld in the public fixture." : ""}`, body: tx.el, flush: true }) : null, o.aggregates !== false && trace.summary.toolStats?.length ? card({ title: "Tool aggregates", desc: `${trace.summary.toolStats.length} tools, by total time`, body: fwd(AggregatesPanel.make(trace.summary.toolStats, { session: trace.file, pinnable: true }), "aggregates").el, flush: true }) : null].filter(Boolean));
    Object.assign(c, { timeline: tl, minimap: mini, transcript: tx, view, select: (s, t, x) => tl.select(s, t, { reveal: true, ...x }), draw: () => { tl.draw(); mini.draw(); } });
    return c;
  },
};

export const TRACE_PIECES = { TimelineCanvas, Minimap, SpanDrawer, SummaryStrip, AggregatesPanel, TranscriptList, TraceView };
