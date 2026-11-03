// Theme engine: host presets (T3 Code, Hermes desktop) plus user overrides, applied as CSS variables.
import { motion } from "./motion.js";

const KEY = "eui.theme.v1";
export const state = { themes: [], base: null, over: {}, brand: "accent", logos: false };

const TOKENS = ["bg", "fg", "card", "muted", "mutedFg", "accent", "border", "input", "primary", "primaryFg", "sidebar", "sidebarBorder", "message", "messageBorder", "success", "successFg", "warning", "danger", "dangerFg"];

export function hexToRgb(hex) {
  let c = (hex || "#000").replace("#", "");
  if (c.length === 3) c = [...c].map((x) => x + x).join("");
  const a = c.length === 8 ? parseInt(c.slice(6, 8), 16) / 255 : 1;
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16), a];
}
const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
/** Flatten a possibly translucent colour over an opaque backdrop. */
export function over(fg, bg) {
  const F = hexToRgb(fg), B = hexToRgb(bg);
  return toHex(F[0] * F[3] + B[0] * (1 - F[3]), F[1] * F[3] + B[1] * (1 - F[3]), F[2] * F[3] + B[2] * (1 - F[3]));
}
export function lum(hex) {
  const [r, g, b] = hexToRgb(hex).map((v, i) => (i < 3 ? v / 255 : v)).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** A brand colour that stays legible on the current card surface (>= 3:1), nudged toward ink if not. */
export function brandOn(hex, theme = current()) {
  const card = over(theme.card, theme.bg);
  if (!hex) return theme.mutedFg;
  let c = hex;
  for (let i = 0; i < 12 && contrast(c, card) < 3; i++) c = mix(c, theme.scheme === "dark" ? "#ffffff" : "#000000", 0.14);
  return c;
}
export const inkOn = (hex) => (lum(hex) > 0.42 ? "#0b0b0c" : "#ffffff");

export function current() {
  const b = state.base;
  return { ...b, ...state.over };
}

export async function loadThemes() {
  const d = await (await fetch("data/themes.json")).json();
  state.themes = d.themes;
  state.sources = d.sources;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  const hashTheme = new URLSearchParams(location.hash.slice(1)).get("theme");
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  state.base = state.themes.find((t) => t.id === (hashTheme || saved.id)) || state.themes.find((t) => t.id === (prefersDark ? "t3-dark" : "t3-light"));
  state.over = saved.over || {};
  state.brand = saved.brand || "accent";
  state.logos = !!saved.logos;
  motion.speed = saved.speed || 1;
  apply(false);
}

function save() {
  localStorage.setItem(KEY, JSON.stringify({ id: state.base.id, over: state.over, brand: state.brand, logos: state.logos, speed: motion.speed }));
}

let fontLinks = new Set();
export function apply(persist = true) {
  const t = current();
  const r = document.documentElement;
  const card = over(t.card, t.bg);
  for (const k of TOKENS) if (t[k]) r.style.setProperty(`--h-${k}`, t[k]);
  r.style.setProperty("--h-card-solid", card);
  r.style.setProperty("--h-radius", `${t.radius}px`);
  r.style.setProperty("--h-radius-lg", `${t.host === "hermes" ? t.radius * 1.33 : t.radius + 4}px`);
  r.style.setProperty("--h-font", t.font);
  r.style.setProperty("--h-mono", t.mono);
  r.style.setProperty("--h-shadow", t.shadow);
  r.style.setProperty("--h-density", t.density ?? 1);
  r.style.setProperty("--h-primary-ink", inkOn(t.primary));
  r.style.setProperty("--h-ink-strong", t.scheme === "dark" ? "#ffffff" : "#000000");
  r.dataset.scheme = t.scheme;
  r.dataset.host = t.host;
  r.dataset.brand = state.brand;
  r.dataset.logos = state.logos ? "on" : "off";
  r.style.colorScheme = t.scheme;
  if (t.fontUrl && !fontLinks.has(t.fontUrl)) {
    fontLinks.add(t.fontUrl);
    document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href: t.fontUrl }));
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bg);
  if (persist) save();
  window.dispatchEvent(new CustomEvent("theme", { detail: t }));
}

/** Switch with a circular reveal from the pointer (View Transitions), falling back to a plain swap. */
export function setTheme(id, at) {
  const next = state.themes.find((t) => t.id === id);
  if (!next || next === state.base) return;
  const go = () => { state.base = next; state.over = {}; apply(); };
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return go();
  const x = at?.x ?? innerWidth / 2, y = at?.y ?? 80;
  const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = document.startViewTransition(go);
  vt.ready.then(() => {
    document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
      { duration: 620 / motion.speed, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" });
  });
}

export function setOver(patch) { Object.assign(state.over, patch); for (const k in state.over) if (state.over[k] == null) delete state.over[k]; apply(); }
export function setBrand(mode) { state.brand = mode; apply(); }
export function setLogos(on) { state.logos = on; apply(); }
export function setSpeed(v) { motion.speed = v; save(); }

export function exportCSS() {
  const t = current();
  const lines = TOKENS.filter((k) => t[k]).map((k) => `  --eui-${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}: ${t[k]};`);
  lines.push(`  --eui-radius: ${t.radius}px;`, `  --eui-font: ${t.font};`, `  --eui-mono: ${t.mono};`);
  return `/* ephemeral-ui host theme: ${t.label} · ${t.sub}${Object.keys(state.over).length ? " (customised)" : ""} */\n:root {\n${lines.join("\n")}\n}`;
}
export function exportJSON() {
  const t = current();
  const o = { host: t.host, id: t.id, scheme: t.scheme, radius: t.radius, font: t.font, mono: t.mono, brand: state.brand };
  for (const k of TOKENS) if (t[k]) o[k] = t[k];
  return JSON.stringify(o, null, 2);
}
