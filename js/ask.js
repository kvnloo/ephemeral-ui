// "Ask the trace": a question becomes a typed query plan (src/schema/trace-query.v0.json), the plan's
// API calls run against omp-stats (here: the sanitized fixture behind the same paths), and its card
// list renders as live trace cards with the layers you pick. Phrase → plan is deterministic on this
// page; a Hermes/T3 agent would emit the same plan JSON itself and run the same calls live.
import { h, anim, stagger, quiet, Run, rng } from "./motion.js";
import { KINDS_T, ALL_LAYERS } from "./kinds-t.js";
import { ready, api, fInt, fCompact, fCost, fPct, fRate, fElapsed, fDur, allSpans, toolLatency, trackCost, groupErrors } from "./trace-data.js";

export const SUGGESTIONS = ["why was this session slow?", "which tools failed most this week?", "compare my last two Hermes sessions", "what did the subagents cost?", "what went wrong this month?", "where did the money go this week?"];
const LAYER_COLORS = { spans: "var(--os-model, #5ad8e6)", tokens: "#9d7bff", cost: "var(--os-agent, #ed4abf)", errors: "var(--os-bad, #ff6166)", subagents: "#2dd4bf", transcript: "var(--os-turn, #a0a0a8)" };

/* ---------------- phrase → plan ---------------- */
const INTENTS = [
  { id: "compare_sessions", re: /\bcompare\b|\bvs\.?\b|versus|differ|side.by.side|last two|two sessions/i, layers: ["spans", "tokens", "cost", "errors", "subagents"] },
  { id: "subagent_cost", re: /sub.?agents?|child (?:agents?|tracks?)|scouts?|delegat/i, layers: ["spans", "tokens", "cost", "subagents"] },
  { id: "explain_slowness", re: /slow|took (?:so )?long|latency|bottleneck|stuck|waiting|idle|how long/i, layers: ["spans", "tokens", "errors", "subagents"] },
  { id: "tool_failures", re: /tools?\b.*(?:fail|error|broke)|(?:fail|error)\w*.*\btools?\b|which tools?/i, layers: ["spans", "errors"] },
  { id: "errors", re: /error|fail|broke|wrong|crash|exception|retry/i, layers: ["spans", "errors", "transcript"] },
  { id: "frustration", re: /frustrat|annoy|angry|mood|sentiment|upset/i, layers: [] },
  { id: "cost_breakdown", re: /cost|spend|spent|money|price|\$|expensive|bill|budget|models?\b|providers?|tokens?/i, layers: ["cost", "tokens", "errors"] },
  { id: "walkthrough", re: /what happened|transcript|walk me|steps|timeline|trace/i, layers: ["spans", "subagents", "transcript"] },
];
const OVERVIEW = { id: "session_overview", layers: ["spans", "tokens", "cost", "subagents"] };

export function planFor(q) {
  const intent = INTENTS.find((i) => i.re.test(q)) ?? OVERVIEW;
  const range = /today|24 ?h|last day|yesterday/i.test(q) ? "24h" : /month|30 ?d/i.test(q) ? "30d" : /week|7 ?d/i.test(q) ? "7d" : intent.id === "errors" ? "30d" : "7d";
  const harness = /hermes/i.test(q) ? "hermes" : /\bomp\b/i.test(q) ? "omp" : null;
  const count = intent.id === "compare_sessions" ? 2 : 1;
  const where = { ...(harness ? { harness } : {}), ...(intent.id === "subagent_cost" ? { subagents: ">0", costTotal: ">0" } : {}) };
  const sessions = { id: "sessions", get: "/api/sessions?limit=50", select: { where, sort: "startedAt desc", take: count } };
  const trace = (i = 0) => ({ id: count > 1 ? `trace${i}` : "trace", get: `/api/session/trace?file={sessions[${i}].file}` });
  const P = { v: 0, q, intent: intent.id, scope: { session: count > 1 ? `last ${count}` : "latest", harness, range, count }, calls: [], cards: [], layers: intent.layers };
  const card = (kind, input, why, extra = {}) => P.cards.push({ kind, input, why, ...extra });
  switch (intent.id) {
    case "explain_slowness":
      P.calls.push(sessions, trace());
      card("trace-summary", "trace", "Where the wall time went: model, tools, idle");
      card("trace", "trace", "The waterfall; long spans and idle bridges show the cause", { wide: true });
      card("trace-tools", "trace", "Tools by p95 latency in this session", { options: { sort: "p95", scope: "trace" } });
      break;
    case "tool_failures":
      P.calls.push({ id: "tools", get: `/api/stats/tools?range=${range}` }, { id: "traces", get: "/api/session/trace?file={sessions[*].file}", note: "spans for p50/p95 and jump-to-span" });
      card("trace-tools", "tools", `Tools ranked by failures over ${range}`, { options: { sort: "errors", range } });
      card("trace-errors", "traces", "Failed spans grouped by tool and error kind; jump into the trace", { options: { tab: "spans" } });
      card("trace", "traces[0]", "Timeline with failed spans in red", { wide: true });
      break;
    case "compare_sessions":
      P.calls.push(sessions, trace(0), trace(1));
      card("trace-compare", ["trace1", "trace0"], "Older on the left, newer on the right", { wide: true });
      card("trace-summary", "trace1", "Older session");
      card("trace-summary", "trace0", "Newer session");
      break;
    case "subagent_cost":
      P.calls.push(sessions, trace(), { id: "stats", get: `/api/stats?range=${range}` });
      card("trace-summary", "trace", "Cost and model time per track (main vs each subagent)");
      card("trace-usage", "stats", `Main agent vs subagents over ${range}`, { options: { view: "agents", range } });
      card("trace", "trace", "Child tracks with their cumulative cost lanes", { wide: true });
      break;
    case "errors":
      P.calls.push({ id: "errors", get: `/api/stats/errors?range=${range}` }, { id: "traces", get: "/api/session/trace?file={sessions[*].file}" });
      card("trace-errors", "errors", `Request failures by signature over ${range}`, { options: { tab: "requests", range } });
      card("trace-errors", "traces", "Span failures inside traced sessions", { options: { tab: "spans" } });
      card("trace", "traces[0]", "Timeline with failures highlighted", { wide: true });
      break;
    case "frustration":
      P.calls.push({ id: "frustration", get: `/api/stats/frustration?range=${range}` });
      card("trace-frustration", "frustration", "User sentiment by model", { options: { range } });
      break;
    case "cost_breakdown":
      P.calls.push({ id: "stats", get: `/api/stats?range=${range}` }, { id: "providers", get: `/api/stats/providers?range=${range}` });
      card("trace-usage", "stats", `Estimate by model over ${range}`, { options: { view: "models", range } });
      card("trace-usage", "providers", "Same range by billing component", { options: { view: "components", range } });
      break;
    default:
      P.calls.push(sessions, trace());
      card("trace-summary", "trace", "Headline numbers");
      card("trace", "trace", "Waterfall with transcript", { wide: true });
  }
  return P;
}

/* ---------------- plan → data (runs the calls) ---------------- */
async function resolve(plan) {
  const d = await ready();
  const out = { notes: [] };
  const sessionsCall = plan.calls.find((c) => c.id === "sessions");
  let picked = [];
  if (sessionsCall) {
    const all = (await api("/api/sessions")).filter((s) => d.traces[s.file]);
    const w = sessionsCall.select.where;
    const ok = (s) => (!w.harness || s.harness === w.harness) && (!w.subagents || s.subagents > 0) && (!w.costTotal || s.costTotal > 0);
    picked = all.filter(ok).sort((a, b) => b.startedAt - a.startedAt).slice(0, sessionsCall.select.take);
    if (picked.length < sessionsCall.select.take) {
      const extra = all.filter((s) => !picked.includes(s)).sort((a, b) => b.startedAt - a.startedAt).slice(0, sessionsCall.select.take - picked.length);
      if (w.harness) out.notes.push(`The public sample has ${picked.length} ${w.harness === "hermes" ? "Hermes" : w.harness} session${picked.length === 1 ? "" : "s"}; filled with the latest ${extra.map((s) => s.harness).join(", ")} session.`);
      picked.push(...extra);
    }
    out.sessions = picked;
  }
  for (const c of plan.calls) {
    if (c.id === "sessions") continue;
    if (c.id === "traces") { out.traces = Object.values(d.traces).sort((a, b) => allSpans(b).filter(({ s }) => s.isError).length - allSpans(a).filter(({ s }) => s.isError).length); continue; }
    const m = c.get.match(/\{sessions\[(\d+)\]\.file\}/);
    out[c.id] = m ? await api(c.get.replace(m[0], picked[+m[1]]?.file ?? "")) : await api(c.get);
  }
  out.d = d;
  return out;
}

/* ---------------- deterministic answer from the data ---------------- */
function answer(plan, r) {
  const t = r.trace ?? r.trace0;
  const b = (x) => h("b", {}, x);
  switch (plan.intent) {
    case "explain_slowness": {
      const s = t.summary, w = s.wallMs || 1;
      const parts = [["model calls", s.modelMs], ["tools", s.toolMs], ["idle", s.idleMs]].sort((a, b) => b[1] - a[1]);
      const tl = toolLatency([t]).sort((a, b) => b.totalMs - a.totalMs)[0];
      const longest = allSpans(t).filter(({ s: x }) => x.kind === "model" || x.kind === "tool").sort((a, b) => (b.s.end - b.s.start) - (a.s.end - a.s.start))[0];
      return [t.title.split(" · ")[0], " ran ", b(fElapsed(s.wallMs)), ". Most of it was ", b(parts[0][0]), ` (${fPct(parts[0][1] / w)} of wall${parts[0][0] === "idle" ? ": waiting on you or a background job" : ""}), then ${parts[1][0]} ${fPct(parts[1][1] / w)} and ${parts[2][0]} ${fPct(parts[2][1] / w)}. `, tl ? ["The heaviest tool was ", b(tl.tool), `: ${tl.calls} calls, ${fElapsed(tl.totalMs)} total, p95 ${fDur(tl.p95)}${tl.errors ? `, ${tl.errors} failed` : ""}. `] : "", longest ? ["Longest single span: ", b(`${longest.s.label} ${fDur(longest.s.end - longest.s.start)}`), "."] : ""];
    }
    case "tool_failures": {
      const rows = [...r.tools.byTool].sort((a, b) => b.errors - a.errors);
      const top = rows[0], calls = rows.reduce((n, x) => n + x.calls, 0), errs = rows.reduce((n, x) => n + x.errors, 0);
      const worstRate = rows.filter((x) => x.calls >= 50).sort((a, b) => b.errors / b.calls - a.errors / a.calls)[0];
      return [`Over ${plan.scope.range}, `, b(fInt(errs)), ` of ${fInt(calls)} tool calls failed (${fRate(errs / calls)}). `, b(top.tool), ` failed most: ${fInt(top.errors)} of ${fInt(top.calls)}. `, worstRate && worstRate !== top ? ["Worst rate among busy tools: ", b(worstRate.tool), ` at ${fRate(worstRate.errors / worstRate.calls)}. `] : "", "Open a tool for its failed spans."];
    }
    case "compare_sessions": {
      const [A, B] = [r.trace1, r.trace0];
      const ratio = B.summary.wallMs / Math.max(1, A.summary.wallMs);
      return [b(B.title), ` ran ${fElapsed(B.summary.wallMs)} vs `, b(A.title), ` ${fElapsed(A.summary.wallMs)} (${ratio >= 1 ? ratio.toFixed(1) + "× longer" : (1 / ratio).toFixed(1) + "× shorter"}), with ${fInt(B.summary.requests)} vs ${fInt(A.summary.requests)} requests and ${fInt(B.summary.toolCalls)} vs ${fInt(A.summary.toolCalls)} tool calls. `, B.summary.totalTokens && A.summary.totalTokens ? `Cost ${fCost(B.summary.costTotal)} vs ${fCost(A.summary.costTotal)}.` : "One of them has no token usage recorded, so cost is N/A for it."];
    }
    case "subagent_cost": {
      const rows = trackCost(t), main = rows.find((x) => x.track.id === "main"), subs = rows.filter((x) => x.track.id !== "main");
      const sc = subs.reduce((n, x) => n + x.cost, 0), tot = sc + (main?.cost ?? 0) || 1;
      const ag = r.stats?.byAgentType ?? [], sa = ag.find((x) => x.agentType === "subagent"), all = ag.reduce((n, x) => n + x.totalCost, 0) || 1;
      const top = [...subs].sort((a, b) => b.cost - a.cost)[0];
      return ["In ", b(t.title.split(" · ")[0]), `, ${subs.length} subagents cost `, b(fCost(sc)), ` of ${fCost(tot)} (${fPct(sc / tot)}). `, top ? ["Most expensive: ", b(top.track.label), ` at ${fCost(top.cost)} over ${fInt(top.requests)} requests. `] : "", sa ? [`Across ${plan.scope.range}, subagents took `, b(fPct(sa.totalCost / all)), ` of the estimate (${fCost(sa.totalCost)}).`] : ""];
    }
    case "errors": {
      const g = groupErrors(r.errors), sp = r.traces.reduce((n, x) => n + allSpans(x).filter(({ s }) => s.isError).length, 0);
      return [`${fInt(r.errors.length)} failed requests over ${plan.scope.range} in `, b(`${g.length} signatures`), ". The top one, ", b(g[0]?.sig ?? "-"), `, accounts for ${g[0]?.n ?? 0}. Inside the traced sessions, ${fInt(sp)} spans failed; open a group and jump to the span.`];
    }
    case "frustration": {
      const o = r.frustration.overall;
      return [`Of ${fInt(o.messages)} user messages, `, b(fPct(o.annoyed / Math.max(1, o.messages))), " read as annoyed and ", b(fPct(o.atAssistant / Math.max(1, o.messages))), " were aimed at the assistant. Counts only; no message text is in the sample."];
    }
    case "cost_breakdown": {
      const ov = r.stats.overall; if (!ov?.totalRequests) return [`No requests in the last ${plan.scope.range} in the sample. Try “this week”.`];
      const top = [...r.stats.byModel].sort((a, b) => b.totalCost - a.totalCost)[0];
      return [`The last ${plan.scope.range} would cost `, b(fCost(ov.totalCost)), ` at public API rates over ${fInt(ov.totalRequests)} requests. `, b(top.model), ` is ${fPct(top.totalCost / (ov.totalCost || 1))} of it. Cache served ${fPct(ov.cacheRate)} of prompt input.`];
    }
    default:
      return [b(t.title), ` · ${fElapsed(t.summary.wallMs)} · ${fInt(t.summary.requests)} requests · ${fInt(t.summary.toolCalls)} tool calls · ${t.tracks.length - 1} subagents.`];
  }
}

/* ---------------- plan → cards ---------------- */
function inputFor(c, r) {
  if (Array.isArray(c.input)) return c.input.map((k) => r[k]);
  if (c.input === "traces[0]") return r.traces[0];
  if (c.input === "traces") return null;
  return r[c.input];
}
function buildCards(plan, r, layers, { app, setSpec, focus }) {
  const cells = [];
  let tlCard = null;
  for (const c of plan.cards) {
    const K = KINDS_T[c.kind];
    const o = { layers, ...(c.options ?? {}) };
    if (c.input === "traces" || c.options?.scope === "trace") o.traces = c.options?.scope === "trace" ? [r.trace] : r.traces;
    if (c.kind === "trace-usage" && c.options?.range) o.range = c.options.range;
    const input = c.kind === "trace-tools" || c.kind === "trace-errors" || c.kind === "trace-usage" || c.kind === "trace-frustration" ? (c.input === "tools" ? r.tools : undefined) : inputFor(c, r);
    o.onSpan = (s, t, trace) => focus(s, t, trace);
    const card = K.make(app, rng(c.kind), input, o);
    card.el.addEventListener("click", () => setSpec?.({ ...card.spec, plan: plan.intent }), { capture: true });
    if (c.kind === "trace" && !tlCard) tlCard = card;
    cells.push(h("div", { class: "ask-cell" + (c.wide ? " wide" : "") }, h("div", { class: "kl" }, h("b", {}, K.label), h("code", {}, c.kind), h("span", { class: "ask-why" }, c.why)), card.el));
    quiet(card.play(new Run()));
  }
  // pair half-width cards; a half card with no partner spans the row
  let run = [];
  const flush = () => { if (run.length % 2) run[run.length - 1].classList.add("wide"); run = []; };
  for (const c of cells) { if (c.classList.contains("wide")) flush(); else run.push(c); }
  flush();
  return { cells, tlCard };
}

/* ---------------- section ---------------- */
export function buildAsk({ catalog, setSpec }) {
  const sec = document.getElementById("ask");
  if (!sec) return;
  const app = catalog.byId["omp-stats"] ?? { id: "omp-stats", name: "omp stats", hex: null };
  const input = sec.querySelector("#askq"), out = sec.querySelector("#askout"), ans = sec.querySelector("#askans"), planEl = sec.querySelector("#askplan"), layEl = sec.querySelector("#asklayers"), sugg = sec.querySelector("#asksugg");
  const st = { plan: null, data: null, layers: null, user: false };
  let tl = null;
  const focus = (s, t, trace) => {
    if (tl?.timeline && tl.timeline.tracks && trace?.file && tl.spec.input?.endsWith(trace.file)) { tl.el.scrollIntoView({ behavior: "smooth", block: "center" }); tl.timeline.select(s, t, { reveal: true }); anim(tl.el, [{ boxShadow: "0 0 0 0 var(--h-primary)" }, { boxShadow: "0 0 0 6px transparent" }], { duration: 900 }); return; }
    // different session: swap the composed timeline to it, then select
    const cell = tl?.el.closest(".ask-cell");
    const K = KINDS_T.trace;
    const card = K.make(app, rng("trace"), trace, { layers: st.layers, onSpan: focus });
    if (cell) { tl.el.replaceWith(card.el); } else { out.prepend(h("div", { class: "ask-cell wide" }, card.el)); }
    tl = card;
    card.done.then(() => { card.el.scrollIntoView({ behavior: "smooth", block: "center" }); card.timeline.select(s, t, { reveal: true }); });
  };
  const layerBtns = ALL_LAYERS.map((k) => h("button", { type: "button", "data-layer": k, "aria-pressed": "false", style: { "--lc": LAYER_COLORS[k] }, onclick: () => { st.user = true; st.layers.has(k) ? st.layers.delete(k) : st.layers.add(k); syncLayers(); render(); } }, h("i"), k));
  layEl.append(h("span", { class: "lbl" }, "Layers"), ...layerBtns);
  const syncLayers = () => layerBtns.forEach((b) => b.setAttribute("aria-pressed", st.layers.has(b.dataset.layer) ? "true" : "false"));
  sugg.replaceChildren(...SUGGESTIONS.map((q) => h("button", { type: "button", "aria-pressed": "false", onclick: () => { input.value = q; ask(q); } }, q)));
  async function ask(q) {
    q = q.trim(); if (!q) return;
    input.value = q;
    sugg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.textContent === q ? "true" : "false"));
    st.plan = planFor(q);
    st.layers = new Set(st.plan.layers.length ? st.plan.layers : ["spans"]);
    syncLayers();
    out.replaceChildren(h("div", { class: "os-load" }, "Running the plan…"));
    st.data = await resolve(st.plan);
    render();
    history.replaceState(null, "", `#ask=${encodeURIComponent(q)}`);
  }
  function render() {
    const plan = { ...st.plan, layers: [...st.layers], ...(st.data.notes.length ? { notes: st.data.notes } : {}) };
    planEl.textContent = JSON.stringify({ $schema: "https://ephemeralui.vercel.app/schema/trace-query.v0.json", ...plan }, null, 2);
    ans.replaceChildren(h("span", { class: "who" }, "→"), h("p", {}, ...answer(plan, st.data).flat(), ...st.data.notes.map((n) => h("span", { class: "dim" }, " " + n))));
    const { cells, tlCard } = buildCards(plan, st.data, st.layers, { app, setSpec, focus });
    tl = tlCard;
    out.replaceChildren(...cells);
    stagger(out.children, { gap: 70, y: 8 });
  }
  sec.querySelector("#askform").addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  // gallery: every trace kind once, on the fixture defaults
  const gal = sec.querySelector("#tracekinds");
  const io = new IntersectionObserver((es) => es.forEach((en) => { if (!en.isIntersecting) return; io.disconnect(); for (const [k, K] of Object.entries(KINDS_T)) { const c = K.make(app, rng(k), undefined, {}); c.el.addEventListener("click", () => setSpec?.(c.spec), { capture: true }); gal.append(h("div", { class: "tkcell" + (k === "trace" || k === "trace-compare" ? " wide" : ""), "data-kind": k }, h("div", { class: "kl" }, h("b", {}, K.label), h("code", {}, k)), c.el)); quiet(c.play(new Run())); } }), { rootMargin: "300px" });
  io.observe(gal);
  // first question: deep link, else the slowness question once the section is near
  const p = new URLSearchParams(location.hash.slice(1));
  const first = p.get("ask");
  if (first) { input.value = first; ask(first); setTimeout(() => sec.scrollIntoView(), 50); }
  else { const io2 = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io2.disconnect(); input.value = SUGGESTIONS[0]; ask(SUGGESTIONS[0]); } }, { rootMargin: "400px" }); io2.observe(sec); }
  window.__ask = { ask, planFor, st };
}
