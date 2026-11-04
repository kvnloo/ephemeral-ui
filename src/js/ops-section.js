// The #ops section: one board per recurring ops question, on the sanitized snapshot. Boots on its own
// (no main.js hunk beyond the KINDS spread): waits for main.js's boot (html.ready), builds the section
// after #stats, and follows #ops / #ops=<board> deep links (board = burn, alive, incidents, fleet, slow,
// models, tokens, context, tools, routing, sources).
import { h } from "./motion.js";
import { catalog } from "./shell.js";
import { rng } from "./motion.js";
import { KINDS_OPS, OPS_APPS } from "./kinds-ops.js";

const ORDER = ["ops-burn", "ops-alive", "ops-incidents", "ops-fleet", "ops-slow", "ops-models", "ops-tokens", "ops-context", "ops-tools", "ops-routing", "ops-sources"];
const fallbackApp = (id) => ({ id, name: id, hex: null, cat: "agents" });
let built = null;

function build() {
  if (built) return built;
  const sec = h("section", { id: "ops", class: "sec", "aria-label": "Ops boards" },
    h("div", { class: "sechead" }, h("div", {}, h("span", { class: "kicker" }, "Ops boards"), h("h2", {}, "The questions I keep asking my agents, as boards."),
      h("p", { class: "dim ops-intro" }, "Each board answers one recurring ops question (burn pace, liveness, incidents, hosts, slowness, model mix, cache, context, tools, routing) from a real snapshot, then lets you pick a lane, host, model, session or time window and copy it back to the chat as an ", h("code", {}, "@ops:v0"), " reference. This page shows a sanitized snapshot; the same cards run on live local data. Link one with ", h("code", {}, "#ops=<board>"), "."))),
    h("div", { class: "ops-grid" }));
  const grid = sec.querySelector(".ops-grid");
  const cards = {};
  for (const kind of ORDER) {
    const a = catalog.byId[OPS_APPS[kind]] ?? fallbackApp(OPS_APPS[kind]);
    const c = KINDS_OPS[kind].make(a, rng(a.id + kind));
    c.el.id = kind;
    grid.append(c.el);
    cards[kind] = c;
  }
  const anchor = document.getElementById("stats") ?? document.getElementById("oss");
  if (anchor) anchor.after(sec); else document.querySelector("main, body").append(sec);
  built = { sec, cards };
  return built;
}

function settle(el) {
  if (!el) return;
  const pin = () => el.scrollIntoView({ block: "start", behavior: "instant" });
  if (typeof ResizeObserver !== "function") return pin();
  const kinds = ["wheel", "touchstart", "keydown", "pointerdown"];
  const ro = new ResizeObserver(pin);
  const stop = () => { ro.disconnect(); clearTimeout(timer); for (const k of kinds) removeEventListener(k, stop, true); };
  const timer = setTimeout(stop, 5000);
  for (const k of kinds) addEventListener(k, stop, { capture: true, passive: true });
  ro.observe(document.body);
  pin();
}
export async function followOps() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (!p.has("ops")) return;
  const b = build();
  const v = p.get("ops");
  const card = v ? b.cards[v.startsWith("ops-") ? v : `ops-${v}`] : null;
  if (card) await card.done.catch(() => {});
  settle(card?.el ?? b.sec);
  if (card) { card.el.dataset.flash = "1"; setTimeout(() => delete card.el.dataset.flash, 1300); }
}
function whenBooted() {
  const r = document.documentElement;
  if (r.classList.contains("ready")) return Promise.resolve();
  return new Promise((res) => { const mo = new MutationObserver(() => { if (r.classList.contains("ready")) { mo.disconnect(); res(); } }); mo.observe(r, { attributes: true, attributeFilter: ["class"] }); });
}
whenBooted().then(() => { build(); followOps(); });
addEventListener("hashchange", () => followOps());
window.__ops = { build, followOps, KINDS_OPS };
