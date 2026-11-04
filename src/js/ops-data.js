// Ops boards, data layer. One snapshot (`ops-snapshot.v0`, written by tools/ops-collect.py) feeds every
// ops-* kind. The public site loads the sanitized `data/ops-fixture.json`; a local export swaps in the
// live snapshot under the same key, so the boards read real data with no code change.
//
// Selections go back to the chat as one reference, in the style of D2's @trace refs:
//   @ops:v0;b=<board>;k=<kind>;ids=<type:id,...>;r=<startMs>-<endMs>;at=<capturedAt>
// The ids name what the owner picked (lane:claude2, host:laptop, session:s-1a2b3c, model:…), the
// range is a brushed window, and `at` pins the snapshot so the next turn re-reads the same numbers.
import { h } from "./motion.js";

let data = null;
export const opsReady = () => (data ??= fetch("data/ops-fixture.json").then((r) => { if (!r.ok) throw Error(`Ops snapshot: ${r.status}`); return r.json(); }));
/** Hosts (tests, live bridges) can hand in a snapshot directly. */
export const setOpsData = (snap) => { data = Promise.resolve(snap); };

const ID_RE = /^[\w.:\-@/ ()]{1,120}$/;
export function opsRef({ board, kind = "selection", ids = [], range = null, at }) {
  const parts = ["v0", `b=${board}`, `k=${kind}`];
  const ok = [...new Set(ids)].filter((i) => ID_RE.test(i)).map((i) => i.replace(/[ ;,]/g, "_")).slice(0, 24);
  if (ok.length) parts.push(`ids=${ok.join(",")}`);
  if (range && range[1] > range[0]) parts.push(`r=${Math.round(range[0])}-${Math.round(range[1])}`);
  if (at) parts.push(`at=${at}`);
  return "@ops:" + parts.join(";");
}
export function parseOpsRef(text) {
  const m = /@ops:(v0;[^\s`'"]+)/.exec(text ?? "");
  if (!m) return null;
  const f = Object.fromEntries(m[1].split(";").slice(1).map((p) => p.split("=")).filter((p) => p.length === 2));
  const [a, b] = (f.r ?? "").split("-").map(Number);
  return { board: f.b, kind: f.k, ids: f.ids ? f.ids.split(",") : [], range: Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null, at: f.at ? +f.at : null };
}

/**
 * The board component contract (same as the Stats library): { el, spec, getSelection(), on(type, cb) }.
 * Events: { v:0, type, component, entities:{type:id}, ids:["type:id"], range?, label } and a bubbling
 * DOM "stats:event", so one document listener (a host bridge) sees ops boards and stats views alike.
 */
export function opsComp(kind, el, spec = {}) {
  const subs = new Map();
  let sel = null;
  const c = {
    kind, el, spec: { v: 0, kind, ...spec },
    getSelection: () => sel,
    on(t, cb) { if (!subs.has(t)) subs.set(t, new Set()); subs.get(t).add(cb); return () => subs.get(t)?.delete(cb); },
    emit(type, { entities = {}, range, label, filter } = {}) {
      const ent = Object.fromEntries(Object.entries(entities).filter(([, v]) => v != null && v !== ""));
      const e = { v: 0, type, component: kind, entities: ent, ids: Object.entries(ent).map(([k, v]) => `${k}:${v}`), ...(range ? { range } : {}), ...(filter ? { filter } : {}), label };
      if (type === "select" || type === "pin") sel = e.ids.length || e.range ? e : null;
      for (const t of [type, "*"]) for (const cb of subs.get(t) ?? []) cb(e);
      el.dispatchEvent(new CustomEvent("stats:event", { bubbles: true, detail: e }));
      return e;
    },
  };
  el.statsComponent = c;
  return c;
}

async function copyText(text, field) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return "clipboard"; } } catch {}
  if (field) { field.value = text; field.focus(); field.select(); try { if (document.execCommand("copy")) return "execCommand"; } catch {} }
  return "manual";
}

/**
 * Context tray: the current pick, pins, and the @ops reference for the chat. `c` is the board's
 * opsComp; the tray listens to it, so any part of the board that emits select/pin/brush shows here.
 */
export function opsTray(c, board, at) {
  const st = { cur: null, pins: [] };
  const chips = h("div", { class: "ops-chips" });
  const ref = h("input", { class: "ops-ref", readonly: true, "aria-label": "Reference for the chat", spellcheck: "false", onclick: (e) => e.target.select() });
  const status = h("span", { class: "ops-tstatus", role: "status" });
  const items = () => [...st.pins, ...(st.cur && !st.pins.includes(st.cur) ? [st.cur] : [])];
  const refText = () => {
    const it = items();
    const ranges = it.map((x) => x.range).filter(Boolean);
    const kinds = [...new Set(it.map((x) => x.kind))];
    return opsRef({ board, kind: it.length ? (kinds.length === 1 ? kinds[0] : "selection") : "board", ids: it.flatMap((x) => x.ids), range: ranges.length ? [Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1]))] : null, at });
  };
  const pinBtn = h("button", { class: "ops-btn", type: "button", onclick: () => { if (st.cur && !st.pins.includes(st.cur)) { st.pins.push(st.cur); if (st.pins.length > 6) st.pins.shift(); c.emit("pin", { entities: st.cur.entities, range: st.cur.range, label: st.cur.label }); render(); } } }, "Pin");
  const copyBtn = h("button", { class: "ops-btn primary", type: "button", onclick: async () => { const how = await copyText(refText(), ref); status.textContent = how === "manual" ? "Selected: press Ctrl/⌘+C" : "Copied: paste it into your next message"; root.dataset.copied = how; } }, "Copy for chat");
  const root = h("div", { class: "ops-tray", "aria-label": "Selection for the chat" }, chips, h("div", { class: "ops-trow" }, ref, pinBtn, copyBtn), status);
  function render() {
    const it = items();
    chips.replaceChildren(...(it.length ? it.map((x) => h("span", { class: "ops-chip" + (st.pins.includes(x) ? " pinned" : "") }, h("i", {}, x.kind), x.label, st.pins.includes(x) ? h("button", { type: "button", class: "ops-x", "aria-label": "Unpin", onclick: () => { st.pins.splice(st.pins.indexOf(x), 1); render(); } }, "×") : null)) : [h("span", { class: "ops-tempty" }, "Pick anything on the board; the reference names it for the next turn.")]));
    ref.value = refText(); pinBtn.disabled = !st.cur || st.pins.includes(st.cur); status.textContent = ""; delete root.dataset.copied;
  }
  c.on("select", (e) => { st.cur = e.ids.length || e.range ? { kind: Object.keys(e.entities)[0] ?? (e.range ? "range" : "item"), ids: e.ids, range: e.range ?? null, label: e.label, entities: e.entities } : null; render(); });
  c.on("brush", (e) => { st.cur = e.range ? { kind: "range", ids: e.ids, range: e.range, label: e.label, entities: e.entities } : null; render(); });
  render();
  c.ref = refText;
  return root;
}

/* ---------------- small shared helpers ---------------- */
export const HOUR = 3_600_000, DAYMS = 86_400_000;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = (xs, f = (x) => x) => xs.reduce((n, x) => n + (f(x) ?? 0), 0);
export function quantile(xs, p) { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; }
/** Equal buckets [t0, t0+step, …) covering [from, to]. */
export const buckets = (from, to, step) => { const out = []; for (let t = Math.floor(from / step) * step; t <= to; t += step) out.push(t); return out; };
export const bucketOf = (t, step) => Math.floor(t / step) * step;
/** Lane / band tone for badges. */
export const bandTone = (b) => ({ "under-burn": "ok", "on-pace": "ok", ok: "ok", throttle: "warn", "hard-throttle": "bad", avoid: "bad", hold: "bad" })[b] ?? "neutral";
export const short = (s, n = 34) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s ?? "");
