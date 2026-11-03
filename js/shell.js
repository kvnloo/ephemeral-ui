// Card shell, app icons and shared bits used by every kind.
import { h, anim, springs } from "./motion.js";
import { brandOn, inkOn, state } from "./themes.js";

export const catalog = { apps: [], byId: {}, categories: [] };
export async function loadApps() {
  const d = await (await fetch("data/apps.json")).json();
  catalog.apps = d.apps;
  catalog.categories = d.categories;
  catalog.source = d.source;
  for (const a of d.apps) catalog.byId[a.id] = a;
  return catalog;
}
export const app = (id) => catalog.byId[id];

const SVGNS = "http://www.w3.org/2000/svg";
export const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const k of kids.flat()) if (k) e.append(k);
  return e;
};

export function monogram(name) {
  const words = name.replace(/[^A-Za-z0-9 .&]/g, " ").split(/[\s.]+/).filter(Boolean);
  if (words.length > 1 && !/^(the|of)$/i.test(words[1])) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, name.length <= 3 ? 3 : 1).toUpperCase().replace(/^([A-Z])$/, "$1");
}

/** App tile: a monogram by default (what T3 Code ships); the official mark behind the logos toggle. */
export function icon(a, size = 28) {
  const bg = a.hex || null;
  const e = h("span", { class: "eu-ico" + (bg ? "" : " neutral"), style: { "--s": `${size}px`, ...(bg ? { "--tile": bg, "--tile-ink": inkOn(bg) } : {}) }, title: a.name, "aria-hidden": "true" });
  e.append(h("span", { class: "mono" }, monogram(a.name)));
  if (a.path) {
    const s = svg("svg", { viewBox: "0 0 24 24", class: "mark" }, svg("path", { d: a.path }));
    e.append(s);
  }
  return e;
}

export function avatar(name, i = 0) {
  const hues = [12, 210, 140, 280, 40, 330, 180, 95];
  const ini = name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  return h("span", { class: "eu-av", style: { "--hue": hues[i % hues.length] }, title: name }, ini);
}

export const PEOPLE = ["Jules Moreau", "Harold Kim", "Priya Nair", "Sam Ortiz", "Mina Park", "Theo Grant", "Ana Souza", "Leo Fischer", "Ravi Shah", "Ivy Chen", "Noah Reed", "Zara Ali"];
export const COMPANIES = ["Acme Corp", "Globex", "Initech", "Umbrella Labs", "Stark Studio", "Wayne Freight", "Hooli", "Vandelay"];

/** Hold-to-confirm button: fills while held, springs back if released early. */
export function holdButton(label, done, { ms = 900, cls = "" } = {}) {
  const fill = h("span", { class: "fill" });
  const txt = h("span", { class: "lbl" }, label);
  const b = h("button", { class: `eu-btn primary hold ${cls}`, type: "button" }, fill, txt);
  let a = null, fired = false;
  const start = (e) => {
    if (fired) return;
    e.preventDefault();
    a = fill.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: ms, easing: "linear", fill: "forwards" });
    b.classList.add("holding");
    a.onfinish = () => { fired = true; b.classList.remove("holding"); b.classList.add("done"); anim(b, [{ transform: "scale(.96)" }, { transform: "scale(1)" }], { spring: "bouncy" }); done(b, txt); };
  };
  const stop = () => {
    if (fired || !a) return;
    b.classList.remove("holding");
    const p = a.currentTime / ms; a.cancel();
    fill.animate([{ transform: `scaleX(${p})` }, { transform: "scaleX(0)" }], { duration: 260, easing: "cubic-bezier(.16,1,.3,1)" });
  };
  b.addEventListener("pointerdown", start);
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, stop));
  b.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) start(e); });
  b.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") stop(); });
  b.title = "Press and hold";
  b.reset = () => { fired = false; b.classList.remove("done"); txt.textContent = label; fill.getAnimations().forEach((x) => x.cancel()); };
  return b;
}

export function burst(at, color = "var(--a)", n = 12) {
  const r = at.getBoundingClientRect();
  const host = at.closest(".eu-card") || document.body;
  const hr = host.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const p = h("i", { class: "eu-spark", style: { left: `${r.left - hr.left + r.width / 2}px`, top: `${r.top - hr.top + r.height / 2}px`, background: color } });
    host.append(p);
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = 26 + Math.random() * 26;
    anim(p, [{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * d}px), calc(-50% + ${Math.sin(ang) * d}px)) scale(.2)`, opacity: 0 }], { duration: 620, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => p.remove();
  }
}

export function seg(options, onPick, active = 0) {
  const ind = h("span", { class: "ind" });
  const s = h("div", { class: "eu-seg", role: "tablist" }, ind);
  const btns = options.map((o, i) => h("button", { type: "button", role: "tab", "aria-selected": i === active ? "true" : "false", onclick: () => go(i) }, o));
  s.append(...btns);
  const place = (i, animate) => {
    const b = btns[i];
    const to = { transform: `translateX(${b.offsetLeft - 3}px)`, width: `${b.offsetWidth}px` };
    if (animate) anim(ind, [{ transform: ind.style.transform || to.transform, width: ind.style.width || to.width }, to], { spring: "snappy" });
    Object.assign(ind.style, to);
  };
  function go(i) { btns.forEach((b, j) => b.setAttribute("aria-selected", j === i ? "true" : "false")); place(i, true); onPick(i); }
  requestAnimationFrame(() => requestAnimationFrame(() => place(active, false)));
  s.go = go;
  return s;
}

/** Ephemeral lifetime ring; click to pin. */
function ttlRing() {
  const c = svg("circle", { cx: 9, cy: 9, r: 7, pathLength: 100, class: "run" });
  const s = svg("svg", { viewBox: "0 0 18 18" }, svg("circle", { cx: 9, cy: 9, r: 7, class: "trk" }), c);
  const b = h("button", { class: "eu-ttl", type: "button", title: "Ephemeral: this card dissolves when the task is done. Click to pin it." }, s);
  return { b, c };
}

/**
 * Every card: brand accent from the app, surfaces and type from the host theme.
 * body: element; foot: array of elements; summary: what the card leaves behind when it dissolves.
 */
export function shell(a, kind, { verb, status, body, foot = [], summary, cls = "" }) {
  const ring = ttlRing();
  const card = h("article", { class: `eu-card k-${kind} ${cls}`, "data-kind": kind, "data-app": a.id, style: { "--a": brandOn(a.hex), "--a-ink": inkOn(brandOn(a.hex)), "--a-raw": a.hex || "var(--h-mutedFg)" } },
    h("header", { class: "eu-h" }, icon(a, 26), h("div", { class: "eu-t" }, h("b", {}, a.name), h("span", { class: "eu-verb" }, verb)), status ? h("span", { class: "eu-status" }, status) : null, ring.b),
    h("div", { class: "eu-b" }, body),
    foot.length ? h("footer", { class: "eu-f" }, ...foot) : null);
  card.summary = summary || `${a.name} · ${verb}`;
  let pinned = false, ttlAnim = null;
  ring.b.addEventListener("click", () => {
    pinned = !pinned; card.classList.toggle("pinned", pinned);
    if (pinned) ttlAnim?.pause(); else ttlAnim?.play();
    anim(ring.b, [{ transform: "scale(.8)" }, { transform: "scale(1)" }], { spring: "bouncy" });
  });
  /** Start the lifetime; resolves once the card has dissolved into its summary chip (unless pinned). */
  card.startTTL = (ms, onDone) => {
    ttlAnim = ring.c.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 100 }], { duration: ms, fill: "forwards", easing: "linear" });
    ttlAnim.onfinish = () => { if (!pinned) dissolve(card).then(onDone); };
    return ttlAnim;
  };
  return card;
}

export async function dissolve(card) {
  const chip = h("div", { class: "eu-chip-left" }, icon(catalog.byId[card.dataset.app] || { name: "?", hex: null }, 16), h("span", {}, card.summary));
  const r = card.getBoundingClientRect();
  card.style.height = `${r.height}px`;
  const kids = [...card.children];
  await Promise.all(kids.map((k, i) => anim(k, [{ opacity: 1, filter: "blur(0)" }, { opacity: 0, filter: "blur(6px)", transform: "translateY(-4px)" }], { duration: 260, delay: i * 40, easing: "ease-in" }).finished));
  card.replaceChildren(chip);
  card.classList.add("gone");
  const to = 34;
  await anim(card, [{ height: `${r.height}px`, width: `${r.width}px` }, { height: `${to}px`, width: `${Math.min(r.width, chip.scrollWidth + 28)}px` }], { spring: "soft" }).finished;
  card.style.height = `${to}px`;
  card.style.width = `${Math.min(r.width, chip.scrollWidth + 28)}px`;
  anim(chip, [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
}

window.addEventListener("theme", () => {
  document.querySelectorAll(".eu-card[data-app]").forEach((c) => {
    const a = catalog.byId[c.dataset.app];
    if (a) { c.style.setProperty("--a", brandOn(a.hex)); c.style.setProperty("--a-ink", inkOn(brandOn(a.hex))); }
  });
});

export const fmt$ = (n) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const springsRef = springs;
export { state };
