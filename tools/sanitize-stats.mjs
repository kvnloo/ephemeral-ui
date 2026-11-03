// Add the /stats dashboard payloads to the public fixture (the stats library's route views read them):
// overview, model-dashboard, costs, folders, providers, provider-windows, tools, errors, recent,
// frustration, gain, status and a handful of /api/request/:id details. Same allowlist rules and
// mappers as sanitize-trace.mjs (imported), so model/tool/provider renames stay consistent.
//
//   node tools/sanitize-stats.mjs --from <dir of captured API JSON> | --base http://127.0.0.1:8977 \
//        [--fixture src/data/trace-fixture.json] [--deny-out raw-denylist.json] [--ranges 24h,7d,30d]
//
// --from reads files named like the live capture (overview-30d.json, recent.json, request-<id>.json,
// pw-30d-<provider>.json, status.json); --base fetches the same endpoints. Existing fixture keys
// (traces, sessions, entries, the trace cards' /api/stats rows) are kept; the stats keys are replaced.
import fs from "node:fs";
import path from "node:path";
import { seen, rawStrings, model, provider, agent, folder, sessionFile, entry, ms, pick, r6, AGG, sanStats, sanTools, sanUsage, sanErrors, sanProviders, sanFrustration } from "./sanitize-trace.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const FROM = opt("from", null), BASE = opt("base", null);
const FIX = opt("fixture", new URL("../src/data/trace-fixture.json", import.meta.url).pathname);
const RANGES = opt("ranges", "24h,7d,30d").split(",");
const DENY = opt("deny-out", null);
if (!FROM && !BASE) { console.error("need --from <dir> or --base <url>"); process.exit(2); }

async function get(p, file) {
  if (FROM) { const f = path.join(FROM, file); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; }
  const r = await fetch(BASE + p, { signal: AbortSignal.timeout(180_000) });
  return r.ok ? r.json() : null;
}

const STOP_OK = new Set(["stop", "toolUse", "length", "error", "aborted"]);
const sanRow = (e) => ({ id: e.id, sessionFile: sessionFile(e.sessionFile), entryId: entry(`${e.sessionFile}#${e.entryId}`), folder: folder(e.folder), model: model(e.model), provider: provider(e.provider), api: provider(e.api), timestamp: e.timestamp, duration: ms(e.duration), ttft: ms(e.ttft), stopReason: STOP_OK.has(e.stopReason) ? e.stopReason : "stop", errorMessage: e.errorMessage ? sanErrors([e])[0].errorMessage : null, usage: { ...sanUsage(e.usage), premiumRequests: typeof e.usage?.premiumRequests === "number" ? e.usage.premiumRequests : 0 }, agentType: agent(e.agentType), serviceTier: null, costUnpriced: !!e.costUnpriced });
const sanFolders = (list) => (list || []).map((f) => ({ folder: folder(f.folder), ...pick(f, AGG) }));
// Window keys look like "anthropic:5h" / "openai-codex:weekly"; labels like "Claude 5 Hour".
const winKey = (k) => { const [p, ...rest] = String(k ?? "").split(":"); return rest.length && rest.length <= 4 && rest.every((x) => /^[\w .-]{1,24}$/.test(x)) ? [provider(p), ...rest].join(":") : "window"; };
const winLabel = (l) => (/^[A-Za-z0-9 .()·-]{1,40}$/.test(l ?? "") ? l : "Window");
const sanWindows = (d) => d && ({
  windowInsights: (d.windowInsights || []).map((w) => ({ provider: provider(w.provider), windowKey: winKey(w.windowKey), windowLabel: winLabel(w.windowLabel), ...pick(w, ["accounts", "cycles", "fractionConsumed", "estTokensPerWindow", "peakConcurrentFraction", "idealAccounts", "exhaustedEvents"]) })),
  // usageSeries rows carry account keys and labels (emails, org ids): keep the points, number the accounts
  usageSeries: (d.usageSeries || []).map((s) => { seen(s.accountLabel); const a = acct(s.accountKey ?? s.accountLabel); return { provider: provider(s.provider), accountKey: a, accountLabel: a, windowKey: winKey(s.windowKey), windowLabel: winLabel(s.windowLabel), points: (s.points || []).map((p) => ({ timestamp: p.timestamp, usedFraction: typeof p.usedFraction === "number" ? p.usedFraction : 0, exhausted: !!p.exhausted })) }; }),
});
const acctMap = new Map();
const acct = (a) => { if (a == null) return null; seen(String(a)); if (!acctMap.has(a)) acctMap.set(a, `account-${acctMap.size + 1}`); return acctMap.get(a); };
const sanGain = (d) => d && ({ overall: pick(d.overall || {}, ["savedTokens", "savedBytes", "hits", "outputBytes", "originalBytes", "reductionPercent"]), bySource: Object.fromEntries(Object.entries(d.bySource || {}).filter(([k]) => /^[a-z][\w-]{0,30}$/.test(k)).map(([k, v]) => [k, pick(v, ["savedTokens", "savedBytes", "hits", "outputBytes", "originalBytes", "reductionPercent"])])), timeSeries: (d.timeSeries || []).filter((p) => /^\d{4}-\d\d-\d\d$/.test(p.date ?? "")).map((p) => ({ date: p.date, snapcompact: typeof p.snapcompact === "number" ? p.snapcompact : 0 })), project: null, projects: (d.projects || []).map((p) => folder(typeof p === "string" ? p : p.folder ?? p.project)) });
/** A request detail keeps its row and the shape of the conversation: roles, block types and lengths, never text. */
const sanMsg = (m) => { if (!m || typeof m !== "object") return null; const c = Array.isArray(m.content) ? m.content : typeof m.content === "string" ? [{ type: "text", text: m.content }] : []; for (const b of c) { seen(b?.text); seen(b?.thinking); } return { role: ["user", "assistant", "toolResult", "system", "developer"].includes(m.role) ? m.role : "message", content: c.map((b) => (b?.type === "text" ? { type: "text", text: `‹text, ${String(b.text ?? "").length} chars›` } : b?.type === "thinking" ? { type: "thinking", text: `‹thinking, ${String(b.thinking ?? b.text ?? "").length} chars›` } : b?.type === "toolCall" ? { type: "toolCall", name: "‹tool›" } : { type: /^[a-zA-Z]{1,20}$/.test(b?.type ?? "") ? b.type : "block" })) }; };
const sanRequest = (d) => d && { ...sanRow(d), messages: (d.messages || []).slice(-6).map(sanMsg).filter(Boolean), output: d.output ? sanMsg(d.output) : null };

const fx = JSON.parse(fs.readFileSync(FIX, "utf8"));
for (const k of Object.keys(fx.api)) if (/^\/api\/(stats\/(overview|model-dashboard|costs|folders|provider-windows|recent|gain)|request\/|status)/.test(k)) delete fx.api[k];
let n = 0;
const put = (k, v) => { if (v != null) { fx.api[k] = v; n++; } };
for (const r of RANGES) {
  const ov = await get(`/api/stats/overview?range=${r}`, `overview-${r}.json`);
  if (ov) put(`/api/stats/overview?range=${r}`, { overall: sanStats(ov).overall, byAgentType: sanStats(ov).byAgentType, timeSeries: sanStats(ov).timeSeries });
  const md = await get(`/api/stats/model-dashboard?range=${r}`, `model-dashboard-${r}.json`);
  if (md) { const s = sanStats(md); put(`/api/stats/model-dashboard?range=${r}`, { byModel: s.byModel, modelSeries: s.modelSeries, modelPerformanceSeries: s.modelPerformanceSeries }); }
  const co = await get(`/api/stats/costs?range=${r}`, `costs-${r}.json`);
  if (co) put(`/api/stats/costs?range=${r}`, { costSeries: sanStats(co).costSeries });
  put(`/api/stats/folders?range=${r}`, sanFolders(await get(`/api/stats/folders?range=${r}`, `folders-${r}.json`)));
  put(`/api/stats/providers?range=${r}`, sanProviders(await get(`/api/stats/providers?range=${r}`, `providers-${r}.json`)));
  put(`/api/stats/provider-windows?range=${r}`, sanWindows(await get(`/api/stats/provider-windows?range=${r}`, `provider-windows-${r}.json`)));
  for (const p of ["anthropic", "openai-codex"]) put(`/api/stats/provider-windows?range=${r}&provider=${p}`, sanWindows(await get(`/api/stats/provider-windows?range=${r}&provider=${p}`, `pw-${r}-${p}.json`)));
  put(`/api/stats/tools?range=${r}`, sanTools(await get(`/api/stats/tools?range=${r}`, `tools-${r}.json`)));
  const er = await get(`/api/stats/errors?range=${r}&limit=200`, `errors-${r}.json`);
  if (er) put(`/api/stats/errors?range=${r}`, sanErrors(er.slice(0, 200)));
  put(`/api/stats/frustration?range=${r}`, sanFrustration(await get(`/api/stats/frustration?range=${r}`, `frustration-${r}.json`)));
  put(`/api/stats/gain?range=${r}`, sanGain(await get(`/api/stats/gain?range=${r}`, `gain-${r}.json`)));
}
const recent = await get(`/api/stats/recent?limit=500`, "recent.json");
if (recent) put("/api/stats/recent", recent.slice(0, 300).map(sanRow));
// request details: the ids listed in ids.txt (--from) or the first error + first two ok rows
const ids = FROM && fs.existsSync(path.join(FROM, "ids.txt")) ? fs.readFileSync(path.join(FROM, "ids.txt"), "utf8").split(/\s+/).filter(Boolean) : (recent ?? []).slice(0, 3).map((x) => x.id);
for (const id of ids) put(`/api/request/${id}`, sanRequest(await get(`/api/request/${id}`, `request-${id}.json`)));
const st = await get("/api/status", "status.json");
if (st) put("/api/status", { version: st.version ?? 0, sync: { phase: "idle", current: 0, total: 0, processed: 0, lastSyncedAt: st.sync?.lastSyncedAt ?? (recent?.[0]?.timestamp ?? null), error: null }, indexingHours: 0 });
fx.statsCapturedAt = recent?.[0]?.timestamp ?? Date.now();
fx.source = String(fx.source).replace(/;.*$/, "") + "; /stats payloads sanitized by tools/sanitize-stats.mjs";
fs.writeFileSync(FIX, JSON.stringify(fx));
console.error(`wrote ${n} stats payloads into ${FIX} (${(fs.statSync(FIX).size / 1024).toFixed(0)} KB)`);
if (DENY) { const prev = fs.existsSync(DENY) ? JSON.parse(fs.readFileSync(DENY, "utf8")) : []; fs.writeFileSync(DENY, JSON.stringify([...new Set([...prev, ...rawStrings])])); console.error(`denylist: ${rawStrings.size} raw strings added`); }
