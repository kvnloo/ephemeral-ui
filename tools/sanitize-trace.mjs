// Build src/data/trace-fixture.json from a running omp-stats dashboard (`omp stats -p <port>`),
// keeping real structure (timings, token counts, costs, tool names, models, error kinds) and
// dropping everything that could identify a person or a machine.
//
//   node tools/sanitize-trace.mjs --base http://127.0.0.1:8977 --sessions <file>,<file>,... \
//        [--hermes path/to/hermes-trace.json] [--out src/data/trace-fixture.json]
//
// Rule: nothing is copied wholesale. Every output field is built from an allowlist: numbers and
// booleans pass, strings only through a mapper (tool/model/provider/agent allowlists, neutral
// labels for titles/paths/tracks, error *kinds* instead of messages, args as typed placeholders).
// tools/leak-check.mjs then greps the result against every raw string seen here.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const BASE = opt("base", "http://127.0.0.1:8977");
const OUT = opt("out", new URL("../src/data/trace-fixture.json", import.meta.url).pathname);
const RAW_DENY = opt("deny-out", null); // optional: write the raw-string denylist for leak-check
const SESSION_FILES = (opt("sessions", "") || "").split(",").filter(Boolean);
const HERMES = opt("hermes", null);
const RANGES = (opt("ranges", "24h,7d,30d")).split(",");

const rawStrings = new Set(); // every raw string we refused to copy; leak-check greps for these
const seen = (s) => { if (typeof s === "string" && s.length >= 6) rawStrings.add(s); return s; };

async function get(p, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + p, { signal: AbortSignal.timeout(180_000) });
      if (r.ok) return r.json();
      if (r.status === 404) return null;
    } catch (e) { if (i === tries - 1) throw e; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

/* ---------------- allowlists ---------------- */
const TOOL_OK = new Set(["read", "write", "edit", "bash", "grep", "glob", "find", "eval", "todo", "task", "ask", "web_search", "web_fetch", "wait", "yield", "terminal", "read_file", "write_file", "search_files", "patch", "execute_code", "skill_view", "delegate_task", "tool_call", "tool_describe", "browser", "fetch", "lsp", "notebook", "memory", "goal", "learn"]);
const toolMap = new Map();
const tool = (t) => { if (TOOL_OK.has(t)) return t; seen(t); if (!toolMap.has(t)) toolMap.set(t, `custom_tool_${toolMap.size + 1}`); return toolMap.get(t); };

const MODEL_RE = /^(?:(?:openai-codex|openai|anthropic|xai-oauth|xai|openrouter|google|opencode-zen|cursor)\/)*(claude-(?:opus|sonnet|haiku)-[\d-]+|gpt-[\d.]+(?:-[a-z]+)?(?:-codex)?(?:-spark)?|grok-[\d.]+(?::auto)?|gemini-[\d.]+-(?:flash|pro)(?:-lite)?|glm-[\d.]+(?:-flash)?|composer-[\d.]+|free|default|(?:opus|sonnet|haiku|gpt|codex|grok|gemini) [\d.]+)$/;
const modelMap = new Map();
const model = (m) => { if (m == null) return null; if (MODEL_RE.test(m)) return m; seen(m); if (!modelMap.has(m)) modelMap.set(m, `custom-model-${modelMap.size + 1}`); return modelMap.get(m); };
const PROVIDER_OK = new Set(["anthropic", "openai", "openai-codex", "xai", "xai-oauth", "openrouter", "google", "opencode-zen", "cursor", "unknown"]);
const provMap = new Map();
const provider = (p) => { if (p == null) return null; if (PROVIDER_OK.has(p)) return p; seen(p); if (!provMap.has(p)) provMap.set(p, `custom-provider-${provMap.size + 1}`); return provMap.get(p); };
const AGENT_OK = new Set(["main", "subagent", "scout", "task", "gui", "advisor", "explore", "plan", "reviewer", "worker"]);
const agent = (a) => (a == null ? null : AGENT_OK.has(a) ? a : (seen(a), "agent"));
const MODE_OK = new Set(["normal", "plan", "signal", "auto", "yolo", "default", "ask", "code"]);
const BG_OK = new Set(["bash job", "task job"]);

const folderMap = new Map();
const folder = (f) => { seen(f); if (!folderMap.has(f)) folderMap.set(f, `project-${String.fromCharCode(97 + folderMap.size)}`); return folderMap.get(f); };
const fileMap = new Map();
const sessionFile = (f) => { seen(f); if (!fileMap.has(f)) fileMap.set(f, `session-${fileMap.size + 1}.jsonl`); return fileMap.get(f); };
const entryMap = new Map();
const entry = (e) => { if (e == null) return undefined; const k = String(e); if (!entryMap.has(k)) entryMap.set(k, `e${entryMap.size + 1}`); return entryMap.get(k); };

/** Error *kind* from a provider/tool error message. The message itself never leaves this file. */
export function errorKind(msg = "") {
  seen(msg);
  const m = String(msg);
  if (/rate.?limit|\b429\b/i.test(m)) return "rate_limit_error · HTTP 429";
  if (/overloaded/i.test(m)) return "overloaded_error";
  if (/credit|billing|\b402\b|subscription/i.test(m)) return "billing_error · out of credits";
  if (/ECONNRESET|socket connection was closed|socket hang up/i.test(m)) return "connection closed before response";
  if (/turn lane|WebSocket/i.test(m)) return "protocol_error · stateful socket rejected";
  if (/flagged/i.test(m)) return "content flagged by provider";
  if (/context.{0,20}(length|window)|too long|maximum context/i.test(m)) return "context_length_exceeded";
  if (/timed? ?out|timeout|deadline/i.test(m)) return "timeout";
  if (/abort|cancel/i.test(m)) return "aborted";
  if (/\b5\d\d\b|internal server|bad gateway|unavailable/i.test(m)) return "server_error · HTTP 5xx";
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden|auth/i.test(m)) return "auth_error";
  return "provider_error";
}
export function toolErrorKind(text = "") {
  seen(text);
  const m = String(text);
  if (/timed? ?out|timeout/i.test(m)) return "timeout";
  if (/exit(?:ed)? (?:with )?(?:code|status)|non-zero|exit code/i.test(m)) return "non-zero exit";
  if (/not found|no such file|ENOENT|does not exist/i.test(m)) return "not found";
  if (/permission|EACCES|denied/i.test(m)) return "permission denied";
  if (/old_string|not unique|no match|did not match|0 matches/i.test(m)) return "edit did not match";
  if (/abort|cancel|interrupt/i.test(m)) return "cancelled";
  if (/invalid|validation|schema|required/i.test(m)) return "invalid arguments";
  return "tool error";
}

/** Tool-call arguments as a typed shape: keys kept, numbers/booleans kept, every string replaced. */
function argShape(a) {
  if (a == null || typeof a !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(a).slice(0, 8)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,24}$/.test(k)) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") {
      seen(v);
      out[k] = /path|file|cwd|dir/i.test(k) ? "‹path›" : /command|cmd|script|code/i.test(k) ? `‹${k}, ${v.length} chars›` : /pattern|query|regex|q$/i.test(k) ? "‹pattern›" : /url/i.test(k) ? "‹url›" : `‹text, ${v.length} chars›`;
    } else if (Array.isArray(v)) out[k] = `‹${v.length} items›`;
    else if (v && typeof v === "object") out[k] = "‹object›";
  }
  return out;
}
const fmtArgs = (o) => (o ? "{ " + Object.entries(o).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ") + " }" : null);
const ms = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x) : null);
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, typeof o[k] === "number" || typeof o[k] === "boolean" || o[k] === null ? o[k] : null]));

/* ---------------- dashboard payloads ---------------- */
const AGG = ["totalRequests", "successfulRequests", "failedRequests", "errorRate", "totalInputTokens", "totalOutputTokens", "totalCacheReadTokens", "totalCacheWriteTokens", "cacheRate", "cacheSavings", "totalCost", "unpricedRequests", "totalPremiumRequests", "avgDuration", "avgTtft", "avgTokensPerSecond", "firstTimestamp", "lastTimestamp"];
const sanStats = (d) => d && ({
  overall: pick(d.overall ?? {}, AGG),
  byModel: (d.byModel || []).map((m) => ({ model: model(m.model), provider: provider(m.provider), ...pick(m, AGG) })),
  byFolder: (d.byFolder || []).map((f) => ({ folder: folder(f.folder), ...pick(f, AGG) })),
  byAgentType: (d.byAgentType || []).map((a) => ({ agentType: agent(a.agentType), ...pick(a, ["totalRequests", "totalInputTokens", "totalOutputTokens", "totalCacheReadTokens", "totalCacheWriteTokens", "totalCost"]) })),
  timeSeries: (d.timeSeries || []).map((p) => pick(p, ["timestamp", "requests", "errors", "tokens", "cost"])),
  modelSeries: (d.modelSeries || []).map((p) => ({ model: model(p.model), provider: provider(p.provider), ...pick(p, ["timestamp", "requests"]) })),
  modelPerformanceSeries: (d.modelPerformanceSeries || []).map((p) => ({ model: model(p.model), provider: provider(p.provider), ...pick(p, ["timestamp", "requests", "avgTtft", "avgTokensPerSecond"]) })),
  costSeries: (d.costSeries || []).map((p) => ({ model: model(p.model), provider: provider(p.provider), ...pick(p, ["timestamp", "cost", "unpricedRequests", "costInput", "costOutput", "costCacheRead", "costCacheWrite", "requests"]) })),
});
const TU = ["calls", "errors", "argsChars", "resultChars", "totalTokensShare", "outputTokensShare", "costShare", "unpricedRequestsShare", "lastUsed"];
const sanTools = (d) => d && ({
  byTool: d.byTool.map((t) => ({ tool: tool(t.tool), ...pick(t, TU) })),
  byToolModel: d.byToolModel.map((t) => ({ tool: tool(t.tool), model: model(t.model), provider: provider(t.provider), ...pick(t, TU) })),
  series: d.series.map((p) => ({ tool: tool(p.tool), ...pick(p, ["timestamp", "calls", "errors"]) })),
});
const r6 = (x) => (typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x);
const sanUsage = (u = {}) => ({ ...pick(u, ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]), cost: Object.fromEntries(Object.entries(pick(u.cost || {}, ["input", "output", "cacheRead", "cacheWrite", "total"])).map(([k, v]) => [k, r6(v)])) });
const sanErrors = (list) => (list || []).map((e) => ({ id: e.id, sessionFile: sessionFile(e.sessionFile), entryId: entry(`${e.sessionFile}#${e.entryId}`), folder: folder(e.folder), model: model(e.model), provider: provider(e.provider), api: provider(e.api), timestamp: e.timestamp, duration: ms(e.duration), ttft: ms(e.ttft), stopReason: e.stopReason === "error" || e.stopReason === "aborted" ? e.stopReason : "error", errorMessage: errorKind(e.errorMessage), usage: sanUsage(e.usage), agentType: agent(e.agentType), serviceTier: null, costUnpriced: !!e.costUnpriced }));
const sanProviders = (d) => d && ({
  providers: d.providers.map((p) => ({ provider: provider(p.provider), ...pick(p, ["totalRequests", "failedRequests", "models", "totalInputTokens", "totalOutputTokens", "totalCacheReadTokens", "totalCacheWriteTokens", "totalTokens", "totalCost", "unpricedRequests", "totalPremiumRequests", "avgTokensPerSecond"]) })),
  hourly: d.hourly.map((p) => ({ provider: provider(p.provider), ...pick(p, ["hour", "totalTokens", "outputTokens", "requests"]) })),
  series: d.series.map((p) => ({ provider: provider(p.provider), ...pick(p, ["timestamp", "totalTokens", "cost", "unpricedRequests", "requests"]) })),
});
const FR = ["messages", "judged", "annoyed", "atAssistant", "angry"];
const sanFrustration = (d) => d && ({
  overall: pick(d.overall, FR),
  byModel: d.byModel.map((m) => { const ms = m.models.map(model); const lab = MODEL_RE.test(m.label) ? m.label : ms[0]; return { key: `${provider(m.modelClass) ?? "unknown"}/${lab}`, label: lab, modelClass: provider(m.modelClass) ?? "unknown", family: /^[a-z]+$/.test(m.family || "") && MODEL_RE.test(m.label) ? m.family : null, revision: /^[\d.]+$/.test(m.revision || "") ? m.revision : null, models: ms, firstSeen: m.firstSeen, ...pick(m, FR) }; }),
  judgeAvailable: false,
  job: { state: "idle", total: 0, done: 0, failed: 0, cost: 0, judge: null, error: null, startedAt: null, finishedAt: null, concurrency: 0 },
});

/* ---------------- traces ---------------- */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
async function sanTrace(raw, idx, harness, withEntries) {
  const sid = `session-${LETTERS[idx].toLowerCase()}`;
  seen(raw.title); seen(raw.cwd); seen(raw.file);
  const trackId = new Map([["main", "main"]]);
  let n = 0;
  for (const t of raw.tracks) if (t.id !== "main") { seen(t.id); seen(t.label); trackId.set(t.id, `sub-${++n}`); }
  const entries = {};
  const tracks = [];
  let toolSeq = 0;
  for (const t of raw.tracks) {
    const tid = trackId.get(t.id);
    const file = `${sid}/${tid}.jsonl`;
    seen(t.file);
    fileMap.set(t.file, file);
    // assistant entries: usage + tool-call argument shapes
    const callArgs = new Map(), toolResults = new Map();
    if (withEntries) {
      for (const s of t.spans) {
        if (s.kind !== "model" && s.kind !== "tool") continue;
        if (!s.entryId) continue;
        const e = (await get(`/api/session/entry?file=${encodeURIComponent(t.file)}&id=${encodeURIComponent(s.entryId)}`))?.entry;
        const m = e?.message;
        if (!m) continue;
        const eid = entry(`${t.file}#${s.entryId}`);
        if (m.role === "assistant") {
          for (const b of m.content || []) if (b.type === "toolCall") callArgs.set(b.id, argShape(b.arguments));
          entries[`${file}#${eid}`] = { type: "message", id: eid, message: { role: "assistant", provider: provider(m.provider), model: model(m.model), usage: sanUsage(m.usage), stopReason: ["stop", "toolUse", "length", "error", "aborted"].includes(m.stopReason) ? m.stopReason : "stop", ...(m.errorMessage ? { errorMessage: errorKind(m.errorMessage) } : {}), duration: ms(m.duration), ttft: ms(m.ttft) } };
        } else if (m.role === "toolResult") {
          const text = (m.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("");
          seen(text);
          toolResults.set(eid, { resultChars: text.length, errorKind: m.isError ? toolErrorKind(text) : undefined });
        }
      }
    }
    const spans = t.spans.map((s) => {
      seen(s.detail); seen(s.toolCallId); if (s.kind === "turn" || (s.kind === "background" && !BG_OK.has(s.label))) seen(s.label);
      const eid = s.entryId ? entry(`${t.file}#${s.entryId}`) : undefined;
      const o = { id: "", kind: s.kind, start: s.start, end: s.end, label: "", entryId: eid };
      if (s.kind === "turn") o.label = `Turn ${t.spans.filter((x) => x.kind === "turn").indexOf(s) + 1}`;
      else if (s.kind === "model") { o.label = model(s.model ?? s.label) ?? "model"; o.model = model(s.model ?? s.label); }
      else if (s.kind === "tool") {
        o.label = tool(s.label);
        o.toolCallId = `c${++toolSeq}`;
        const a = callArgs.get(s.toolCallId);
        o.detail = a ? fmtArgs(a) : s.detail ? `‹args, ${s.detail.length} chars›` : undefined;
      } else if (s.kind === "subagent") { o.label = agent(s.label) ?? "agent"; o.detail = s.detail ? `‹task, ${s.detail.length} chars›` : undefined; if (s.childTrackId) o.childTrackId = trackId.get(s.childTrackId); if (s.model) o.model = model(s.model); }
      else if (s.kind === "background") o.label = BG_OK.has(s.label) ? s.label : "job";
      if (num(s.tokens) != null) o.tokens = s.tokens;
      if (num(s.cost) != null) o.cost = r6(s.cost);
      if (num(s.ttft) != null) o.ttft = Math.round(s.ttft);
      if (s.isError) o.isError = true;
      if (s.unterminated) o.unterminated = true;
      o.id = `${tid}:${eid ?? o.start}${o.toolCallId ? ":" + o.toolCallId : ""}`;
      if (s.kind === "tool") { const tr = toolResults.get(eid); if (tr) o.resultChars = tr.resultChars; if (s.isError) o.errorKind = tr?.errorKind ?? "tool error"; }
      return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
    });
    const markers = t.markers.map((m) => {
      let label = m.kind;
      if (m.kind === "model_change") label = model(m.label) ?? "model";
      else if (m.kind === "mode_change") label = MODE_OK.has(m.label) ? m.label : "mode";
      else if (m.kind === "compaction") label = /^compaction [\d.]+k→[\d.]+k$/.test(m.label) ? m.label : "compaction";
      else if (m.kind === "session_exit") label = MODE_OK.has(m.label) ? m.label : "exit";
      if (label !== m.label) seen(m.label);
      return { time: m.time, kind: m.kind, label };
    });
    const ag = agent(t.agent);
    tracks.push({ id: tid, parentId: t.parentId ? trackId.get(t.parentId) : null, label: tid === "main" ? "Main" : `${ag ?? "agent"} ${LETTERS[tracks.length - 1] ?? tracks.length}`, agent: ag, model: model(t.model), file, spans, markers });
  }
  const sm = raw.summary;
  const summary = { ...pick(sm, ["wallMs", "modelMs", "toolMs", "idleMs", "turns", "requests", "toolCalls", "subagents", "totalTokens", "costTotal", "unpricedRequests"]), toolStats: sm.toolStats.map((x) => ({ tool: tool(x.tool), ...pick(x, ["calls", "errors", "totalMs", "maxMs"]) })) };
  const title = `Session ${LETTERS[idx]} · ${harness === "hermes" ? "Hermes" : "omp"}`;
  return { trace: { file: `${sid}.jsonl`, title, cwd: null, startedAt: raw.startedAt, endedAt: raw.endedAt, mtimeMs: raw.endedAt, etag: `${raw.endedAt}:0`, tracks, summary, harness }, entries };
}

/* ---------------- main ---------------- */
// Imported by sanitize-stats.mjs for the mappers: only run when executed directly.
if (import.meta.url === new URL(`file://${path.resolve(process.argv[1] ?? "")}`).href) {
const out = { $schema: "https://ephemeralui.vercel.app/schema/trace-query.v0.json#/$defs/fixture", source: "omp-stats 18.9.2 API responses, sanitized by tools/sanitize-trace.mjs", generatedAt: Date.now(), sessions: [], traces: {}, entries: {}, api: {} };
const sessions = await get("/api/sessions?limit=300");
const rawTraces = [];
for (const f of SESSION_FILES) {
  const s = sessions.find((x) => x.file === f);
  const t = await get(`/api/session/trace?file=${encodeURIComponent(f)}`);
  if (!t) { console.error("no trace for a requested session"); process.exit(1); }
  rawTraces.push({ s, t, harness: "omp", entries: true });
}
if (HERMES) {
  const t = JSON.parse(fs.readFileSync(HERMES, "utf8"));
  const s = { file: t.file, folder: t.cwd || "", title: t.title, startedAt: t.startedAt, endedAt: t.endedAt, requests: t.summary.requests, toolCalls: t.summary.toolCalls, subagents: t.summary.subagents, totalTokens: t.summary.totalTokens, costTotal: t.summary.costTotal, unpricedRequests: t.summary.unpricedRequests, models: [...new Set(t.tracks.map((x) => x.model).filter(Boolean))] };
  rawTraces.push({ s, t, harness: "hermes", entries: false });
}
rawTraces.sort((a, b) => a.t.startedAt - b.t.startedAt);
for (let i = 0; i < rawTraces.length; i++) {
  const { s, t, harness, entries } = rawTraces[i];
  const { trace, entries: ents } = await sanTrace(t, i, harness, entries);
  out.traces[trace.file] = trace;
  Object.assign(out.entries, ents);
  out.sessions.push({ file: trace.file, folder: folder(s.folder), title: trace.title, startedAt: s.startedAt, endedAt: s.endedAt, requests: s.requests, toolCalls: s.toolCalls, subagents: s.subagents, totalTokens: s.totalTokens, costTotal: s.costTotal, unpricedRequests: s.unpricedRequests, models: s.models.map(model), harness });
  console.error(`trace ${trace.file}: ${trace.tracks.length} tracks, ${trace.tracks.reduce((n, x) => n + x.spans.length, 0)} spans`);
}
out.sessions.sort((a, b) => b.startedAt - a.startedAt);
for (const r of RANGES) {
  out.api[`/api/stats?range=${r}`] = sanStats(await get(`/api/stats?range=${r}`));
  out.api[`/api/stats/tools?range=${r}`] = sanTools(await get(`/api/stats/tools?range=${r}`));
  out.api[`/api/stats/providers?range=${r}`] = sanProviders(await get(`/api/stats/providers?range=${r}`));
  out.api[`/api/stats/errors?range=${r}`] = sanErrors((await get(`/api/stats/errors?range=${r}&limit=200`) || []).slice(0, 100));
  out.api[`/api/stats/frustration?range=${r}`] = sanFrustration(await get(`/api/stats/frustration?range=${r}`));
  console.error(`range ${r} ok`);
}
out.api["/api/sessions"] = out.sessions;
fs.writeFileSync(OUT, JSON.stringify(out));
console.error(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB); ${toolMap.size} tools, ${modelMap.size} models, ${provMap.size} providers renamed`);
if (RAW_DENY) fs.writeFileSync(RAW_DENY, JSON.stringify([...rawStrings]));
}

export { seen, rawStrings, tool, model, provider, agent, folder, sessionFile, entry, ms, num, r6, pick, AGG, TU, FR, sanStats, sanTools, sanUsage, sanErrors, sanProviders, sanFrustration, MODEL_RE };
