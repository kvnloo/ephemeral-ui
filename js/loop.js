// Agent loop: the two-way channel between a card and the agent that made it.
//
// Every control on a card does one of two real things:
//   1. changes the card itself, reversibly (`undoable`): the user corrects or dismisses without a
//      confirm dialog, and gets an Undo for a few seconds (HAX G8/G9: efficient dismissal/correction);
//   2. hands context back to the agent (`tell`): the card emits `eui:intent` with typed entity ids,
//      shows the handoff inline, and the agent's acknowledgement streams in under it, so the user
//      never has to retype what they just pointed at or leave the chat to see that it landed.
//
// Event contract (bubbles from the card; mirrored to a parent frame via postMessage):
//   eui:intent  detail = { v: 0, kind, app, action, label, ids: ["type:id", …], entities: { type: [id…] },
//                          text?, at }
// `ids` is an array of "type:id" strings (what live-bridge.js joins); `entities` keeps the typed map.
import { h, anim } from "./motion.js";

const ID_RE = /^[\w.:\-@#/ ]{1,120}$/;

function strip(card) {
  let s = card.querySelector(":scope > .lp-strip");
  if (s) return s;
  s = h("div", { class: "lp-strip", role: "log", "aria-live": "polite", "aria-label": "Agent handoff" });
  const foot = card.querySelector(":scope > .eu-f");
  foot ? card.insertBefore(s, foot) : card.append(s);
  return s;
}

function line(card, cls, ...kids) {
  const s = strip(card);
  const l = h("div", { class: "lp-line " + cls }, ...kids);
  s.append(l);
  while (s.children.length > 3) s.firstElementChild.remove();
  anim(l, [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
  return l;
}

/** Stream an agent reply into a line, word by word (fast: it's an acknowledgement, not an essay). */
async function stream(el, text) {
  const words = String(text).split(/(\s+)/);
  el.textContent = "";
  for (const w of words) { el.textContent += w; if (w.trim()) await new Promise((r) => setTimeout(r, 28)); }
}

/** Normalize typed entities into the "type:id" list the bridge joins. Unsafe ids are dropped. */
export function idsOf(entities = {}) {
  const out = [];
  for (const [type, v] of Object.entries(entities)) for (const id of [].concat(v)) { const s = `${type}:${id}`; if (id != null && ID_RE.test(String(id))) out.push(s); }
  return [...new Set(out)].slice(0, 24);
}

/**
 * Hand context to the agent. Returns the event detail.
 *   label: what the user asked, in their words ("Pay on Nov 13 instead")
 *   ack:   what the agent says back (streams in); omit for a silent handoff
 *   entities: { invoice: "4471", person: ["priya"] } — typed ids the agent can resolve
 */
export function tell(card, { action, label, entities = {}, text, ack, quiet = false }) {
  const detail = { v: 0, kind: card.dataset.kind, app: card.dataset.app, action, label, ids: idsOf(entities), entities, ...(text ? { text } : {}), at: Date.now() };
  card.dispatchEvent(new CustomEvent("eui:intent", { bubbles: true, composed: true, detail }));
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: "eui:intent", detail }, "*"); } catch { /* sandboxed */ }
  if (quiet) return detail;
  line(card, "you", h("span", { class: "lp-who" }, "You"), h("span", { class: "lp-txt" }, label));
  if (ack) {
    const txt = h("span", { class: "lp-txt" });
    const dots = h("span", { class: "lp-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i"));
    const l = line(card, "agent", h("span", { class: "lp-who" }, h("span", { class: "lp-spark", "aria-hidden": "true" }, "✦"), "Agent"), dots, txt);
    setTimeout(() => { dots.remove(); stream(txt, typeof ack === "function" ? ack() : ack); l.classList.add("done"); }, 520);
  }
  return detail;
}

/**
 * A footer button that hands a request to the agent. Use it for actions that happen outside the card
 * (export, open in the app, sync): the button confirms in place, and the agent says what it did.
 *   act("Export MIDI", { ack: "Saved progression.mid to Downloads.", entities: { clip: "am-f-c-g" } })
 */
export function act(text, { say = text, ack, entities = {}, action, cls = "ghost", done } = {}) {
  const b = h("button", { class: `eu-btn ${cls}`, type: "button" }, text);
  b.onclick = () => {
    const card = b.closest(".eu-card");
    if (!card) return;
    tell(card, { action: action || text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), label: say, entities, ack: typeof ack === "function" ? ack(card) : ack });
    if (done) { b.title = 'Already completed'; b.textContent = `${done} · ${b.title}`; b.disabled = true; }
  };
  return b;
}

/**
 * A reversible local change: `apply()` now, offer Undo for `ms`. Undo calls `revert()` and tells the
 * agent quietly so its model of the card stays in sync. Returns { cancel }.
 */
export function undoable(card, label, revert, { ms = 6000, entities = {}, action = "undo" } = {}) {
  let done = false;
  const btn = h("button", { type: "button", class: "lp-undo" }, "Undo");
  const bar = h("i", { class: "lp-bar" });
  const l = line(card, "local", h("span", { class: "lp-txt" }, label), btn, bar);
  // The bar only shows the time left; the deadline is a timer, so reduced motion or a finished
  // animation can never close the undo window early.
  const a = bar.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: ms, easing: "linear", fill: "forwards" });
  const finish = () => { if (done) return; done = true; btn.remove(); bar.remove(); l.classList.add("settled"); };
  const timer = setTimeout(finish, ms);
  btn.onclick = () => { if (done) return; done = true; clearTimeout(timer); a.cancel(); revert(); l.querySelector(".lp-txt").textContent = `Undid: ${label}`; btn.remove(); bar.remove(); l.classList.add("undone"); tell(card, { action, label: `Undo ${label}`, entities, quiet: true }); };
  return { cancel: finish };
}

/** A small "Why?" disclosure: the agent's reason for what the card shows (HAX G11). */
export function why(text, { label = "Why?" } = {}) {
  const body = h("p", { class: "lp-why-body", hidden: true }, h("span", { class: "lp-spark", "aria-hidden": "true" }, "✦"), " ", text);
  const btn = h("button", { type: "button", class: "lp-why", "aria-expanded": "false", onclick: () => { const open = body.hidden; body.hidden = !open; btn.setAttribute("aria-expanded", String(open)); if (open) anim(body, [{ opacity: 0, transform: "translateY(-3px)" }, { opacity: 1, transform: "none" }], { spring: "soft" }); } }, label);
  return h("span", { class: "lp-why-wrap" }, btn, body);
}

/** Set a card's status pill and outcome tone in one place (pending → ok / denied / paused …). */
export function settle(card, status, tone) {
  const s = card.querySelector(".eu-status");
  if (s) s.textContent = status;
  card.classList.remove("ok", "hot", "denied", "paused");
  if (tone) card.classList.add(tone);
  card.dataset.state = status.toLowerCase();
}

/** Roving keyboard focus over a list of items: ↑/↓ (or ←/→) move, Enter/Space activate. */
export function roving(items, { onActivate, onKey, axis = "y" } = {}) {
  const list = [...items];
  list.forEach((el, i) => {
    el.tabIndex = i === 0 ? 0 : -1;
    el.addEventListener("keydown", (e) => {
      const next = axis === "y" ? ["ArrowDown", "ArrowUp"] : ["ArrowRight", "ArrowLeft"];
      const live = list.filter((x) => x.isConnected);
      const j = live.indexOf(el);
      if (e.key === next[0] || e.key === next[1]) { e.preventDefault(); const t = live[(j + (e.key === next[0] ? 1 : -1) + live.length) % live.length]; live.forEach((x) => (x.tabIndex = -1)); t.tabIndex = 0; t.focus(); return; }
      if ((e.key === "Enter" || e.key === " ") && onActivate) { e.preventDefault(); onActivate(el, e); return; }
      onKey?.(el, e);
    });
  });
  return list;
}
