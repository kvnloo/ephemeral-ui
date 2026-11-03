// Motion primitives: spring easings as CSS linear(), FLIP, count-up, typing, cancellable waits.
export const reduced = matchMedia("(prefers-reduced-motion: reduce)");
export const motion = { speed: 1 };

/** Sample a damped spring into a CSS linear() easing. Returns { easing, duration } (ms). */
export function spring({ stiffness = 170, damping = 26, mass = 1, velocity = 0 } = {}) {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const pos = (t) => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0 - velocity) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + (w0 - velocity) * t);
  };
  let settle = 0;
  for (let t = 0; t < 4; t += 1 / 120) if (Math.abs(pos(t) - 1) > 0.002) settle = t;
  const dur = Math.max(0.12, settle + 1 / 60);
  const pts = [];
  const n = 48;
  for (let i = 0; i <= n; i++) pts.push(+pos((dur * i) / n).toFixed(4));
  pts[n] = 1;
  return { easing: `linear(${pts.join(", ")})`, duration: Math.round(dur * 1000) };
}

export const springs = {
  snappy: spring({ stiffness: 380, damping: 32 }),
  soft: spring({ stiffness: 140, damping: 22 }),
  bouncy: spring({ stiffness: 260, damping: 15 }),
  gentle: spring({ stiffness: 90, damping: 20 }),
};
export const ease = {
  out: "cubic-bezier(.16,1,.3,1)",
  inOut: "cubic-bezier(.65,0,.35,1)",
  emph: "cubic-bezier(.2,0,0,1)",
  in: "cubic-bezier(.3,0,.8,.15)",
};

const scale = (ms) => (reduced.matches ? 0 : ms / motion.speed);

/** Element.animate with the global speed and reduced-motion respected. */
export function anim(el, keyframes, opts = {}) {
  if (!el) return null;
  const s = typeof opts.spring === "string" ? springs[opts.spring] : opts.spring;
  const o = { fill: "both", ...opts };
  delete o.spring;
  if (s) { o.easing = s.easing; o.duration = opts.duration ?? s.duration; }
  o.duration = scale(o.duration ?? 400);
  o.delay = scale(o.delay ?? 0);
  return el.animate(keyframes, o);
}

/** A cancellable run: tokens let a looping scene stop cleanly when the user takes over. */
export class Run {
  constructor() { this.dead = false; this.timers = new Set(); }
  wait(ms) {
    return new Promise((res, rej) => {
      if (this.dead) return rej(Run.CANCEL);
      const id = setTimeout(() => { this.timers.delete(id); this.dead ? rej(Run.CANCEL) : res(); }, scale(ms));
      this.timers.add(id);
    });
  }
  check() { if (this.dead) throw Run.CANCEL; }
  stop() { this.dead = true; this.timers.forEach(clearTimeout); this.timers.clear(); }
}
Run.CANCEL = Symbol("cancel");
export const quiet = (p) => p.catch((e) => { if (e !== Run.CANCEL) console.error(e); });

/** FLIP: measure, mutate, then animate every element from its old box to its new one. */
export function flip(els, mutate, { spring: sp = "snappy", fade = true } = {}) {
  const before = new Map([...els].map((e) => [e, e.getBoundingClientRect()]));
  mutate();
  for (const [e, a] of before) {
    const b = e.getBoundingClientRect();
    const hidden = b.width === 0 && b.height === 0;
    if (hidden) continue;
    if (a.width === 0 && a.height === 0) {
      if (fade) anim(e, [{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], { spring: sp });
      continue;
    }
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    anim(e, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { spring: sp, fill: "none" });
  }
}

export function countUp(el, to, { from = 0, dur = 900, fmt = (v) => Math.round(v).toLocaleString() } = {}) {
  const d = scale(dur);
  if (!d) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / d);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export async function typeText(el, text, run, cps = 42) {
  el.textContent = "";
  for (let i = 0; i < text.length; i++) {
    el.textContent = text.slice(0, i + 1);
    if (run) await run.wait(1000 / cps + (text[i] === " " ? 18 : 0));
  }
}

/** Stagger children in. */
export function stagger(els, { y = 10, gap = 55, delay = 0, sp = "soft" } = {}) {
  [...els].forEach((e, i) => anim(e, [{ opacity: 0, transform: `translateY(${y}px) scale(.98)`, filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { spring: sp, delay: delay + i * gap }));
}

export const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") for (const [p, x] of Object.entries(v)) { if (x == null) continue; if (p.startsWith("--")) e.style.setProperty(p, x); else e.style[p] = x; }
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};

/** Deterministic PRNG so every app gets its own, stable demo content. */
export function rng(seedStr) {
  let s = 2166136261;
  for (const c of seedStr) s = Math.imul(s ^ c.charCodeAt(0), 16777619);
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822507); s = Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
