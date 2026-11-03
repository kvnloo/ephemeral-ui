// Trace data for the omp-stats cards: the sanitized fixture behind a fake `api(path)` that answers with
// the same JSON shapes `omp stats` serves, plus the formatters and derivations the /stats client uses.
// A live host swaps `api` for fetch(`${statsBase}${path}`) and nothing else changes.

let fixture = null;
export function loadFixture() {
  return (fixture ??= fetch("data/trace-fixture.json").then((r) => r.json()));
}

/** GET an omp-stats endpoint from the fixture. Paths match server.ts exactly. */
export async function api(path) {
  const d = await loadFixture();
  const u = new URL(path, "http://x");
  if (u.pathname === "/api/session/trace") return d.traces[u.searchParams.get("file")] ?? null;
  if (u.pathname === "/api/session/entry") { const e = d.entries[`${u.searchParams.get("file")}#${u.searchParams.get("id")}`]; return e ? { entry: e } : null; }
  if (u.pathname === "/api/sessions") return d.sessions;
  const range = u.searchParams.get("range") ?? "7d";
  return d.api[`${u.pathname}?range=${range}`] ?? null;
}
/** The fixture, once loaded; cards render synchronously from it after `ready()`. */
export async function ready() { return loadFixture(); }

/* ---------------- formatters (client/data/formatters.ts) ---------------- */
const L = "en-US";
export const fInt = (v) => Math.round(v).toLocaleString(L);
export const fCompact = (v) => v.toLocaleString(L, { notation: "compact", maximumFractionDigits: 1 });
export function fCost(v, digits) { if (!v) return "$0"; const d = digits ?? (v > 0 && v < 0.01 ? 4 : 2); return "$" + v.toLocaleString(L, { minimumFractionDigits: d, maximumFractionDigits: d }); }
export const fPct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
export function fRate(v) { const p = v * 100; if (p > 0 && p < 0.005) return "<0.01%"; return fPct(v, p > 0 && p < 0.1 ? 2 : 1); }
export function fDur(ms, digits) { if (ms == null) return "-"; const s = ms / 1000; return `${s.toFixed(digits ?? (s < 1 ? 2 : 1))}s`; }
export function fElapsed(ms) { if (ms < 60_000) return fDur(ms); const m = Math.floor(ms / 60_000); if (m < 60) return `${m}m ${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}s`; return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`; }
export const fClock = (t) => new Date(t).toLocaleTimeString(L, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
export const fDay = (t) => new Date(t).toLocaleDateString(L, { month: "short", day: "numeric" });
/** Day bucket label: buckets are UTC midnights ("Per UTC day"). */
export const fDayUTC = (t) => new Date(t).toLocaleDateString(L, { month: "short", day: "numeric", timeZone: "UTC" });

/* ---------------- palette (client/data/colors.ts, trace-colors.ts) ---------------- */
export const SERIES = ["#5ad8e6", "#ed4abf", "#9d7bff", "#f5b54a", "#4ade80", "#5b8cff", "#ff7a59", "#2dd4bf", "#c3e94f", "#fb7185"];
export const OTHER = "#6c6c74";
/** Busiest key gets the first hue, same key same hue across a page. */
export function colorMap(items) { const m = new Map(); [...items].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).forEach(([k], i) => m.set(k, SERIES[i % SERIES.length])); return m; }

/* ---------------- derivations ---------------- */
export function quantile(xs, q) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
export const allSpans = (trace) => trace.tracks.flatMap((t) => t.spans.map((s) => ({ s, t })));
/** Per-tool durations from trace spans: calls, errors, p50, p95, max (the /stats Tools page has counts; spans add latency). */
export function toolLatency(traces) {
  const by = new Map();
  for (const tr of traces) for (const { s, t } of allSpans(tr)) {
    if (s.kind !== "tool") continue;
    const r = by.get(s.label) ?? { tool: s.label, calls: 0, errors: 0, ms: [], spans: [] };
    r.calls++; if (s.isError) r.errors++; r.ms.push(s.end - s.start); r.spans.push({ s, t, trace: tr });
    by.set(s.label, r);
  }
  return [...by.values()].map((r) => ({ ...r, p50: quantile(r.ms, 0.5), p95: quantile(r.ms, 0.95), max: Math.max(...r.ms), totalMs: r.ms.reduce((a, b) => a + b, 0) }));
}
/** Cost/tokens per track (subagent attribution) from model spans. */
export function trackCost(trace) {
  return trace.tracks.map((t) => { let cost = 0, tokens = 0, req = 0, ms = 0; for (const s of t.spans) if (s.kind === "model") { cost += s.cost ?? 0; tokens += s.tokens ?? 0; req++; ms += s.end - s.start; } const t0 = Math.min(...t.spans.map((s) => s.start)), t1 = Math.max(...t.spans.map((s) => s.end)); return { track: t, cost, tokens, requests: req, modelMs: ms, wallMs: t1 - t0, tools: t.spans.filter((s) => s.kind === "tool").length }; });
}
/** Error signature like ErrorsRoute: same message with ids and counters normalized. */
export const signature = (msg) => String(msg).replace(/\d+/g, "#");
export function groupErrors(list) {
  const g = new Map();
  for (const e of list) { const k = signature(e.errorMessage); const r = g.get(k) ?? { sig: k, n: 0, models: new Map(), last: 0, items: [] }; r.n++; r.models.set(e.model, (r.models.get(e.model) ?? 0) + 1); r.last = Math.max(r.last, e.timestamp); r.items.push(e); g.set(k, r); }
  return [...g.values()].sort((a, b) => b.n - a.n);
}
/** Span-level failures in a trace (tool isError + model spans that errored), grouped by tool and error kind. */
export function spanErrors(trace) {
  const g = new Map();
  for (const { s, t } of allSpans(trace)) { if (!s.isError) continue; const k = `${s.kind === "tool" ? s.label : "model"} · ${s.errorKind ?? (s.kind === "model" ? "request failed" : "tool error")}`; const r = g.get(k) ?? { sig: k, n: 0, items: [] }; r.n++; r.items.push({ s, t }); g.set(k, r); }
  return [...g.values()].sort((a, b) => b.n - a.n);
}
/** Piecewise time axis with idle compression (traces/time-scale.ts, time mode). */
export function timeScale(trace, compress = true) {
  const iv = allSpans(trace).map(({ s }) => [s.start, Math.max(s.end, s.start + 1)]).sort((a, b) => a[0] - b[0]);
  const t0 = trace.startedAt, t1 = Math.max(trace.endedAt, ...iv.map((x) => x[1]));
  if (!compress) return { toU: (t) => t - t0, toT: (u) => u + t0, domain: [0, t1 - t0], gaps: [] };
  const PAD = 2000, GAP = 30_000, BRIDGE = 8000;
  const segs = [];
  for (const [a, b] of iv) { const s = [a - PAD, b + PAD]; const last = segs[segs.length - 1]; if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); else segs.push(s); }
  const tp = [t0], up = [0], gaps = [];
  let u = 0, cur = t0;
  for (const [a, b] of segs) {
    const sa = Math.max(a, t0), sb = Math.min(b, t1);
    if (sa - cur > GAP) { u += BRIDGE; gaps.push({ t0: cur, t1: sa, uMid: u - BRIDGE / 2 }); } else u += Math.max(0, sa - cur);
    tp.push(sa); up.push(u); u += Math.max(0, sb - sa); tp.push(sb); up.push(u); cur = sb;
  }
  if (t1 > cur) { if (t1 - cur > GAP) { u += BRIDGE; gaps.push({ t0: cur, t1, uMid: u - BRIDGE / 2 }); } else u += t1 - cur; tp.push(t1); up.push(u); }
  const seg = (P, v) => { let lo = 0, hi = P.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P[m] <= v) lo = m; else hi = m - 1; } return Math.min(lo, P.length - 2); };
  const map = (A, B) => (v) => { if (v <= A[0]) return B[0]; if (v >= A[A.length - 1]) return B[B.length - 1]; const i = seg(A, v); const d = A[i + 1] - A[i]; return d <= 0 ? B[i] : B[i] + ((v - A[i]) / d) * (B[i + 1] - B[i]); };
  return { toU: map(tp, up), toT: map(up, tp), domain: [0, u], gaps };
}
