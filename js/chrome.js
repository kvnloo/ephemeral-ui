// App chrome: the inner surface of a studio card copies the app's own editor colours, so a Blender card
// reads as Blender and an AutoCAD card as AutoCAD, while the card frame stays in the host theme.
// Values are the apps' default (dark) editor themes; the brand accent still comes from simple-icons.
import { h } from "./motion.js";

export const UI = {
  blender: { bg: "#303030", panel: "#1d1d1d", view: "#393939", fg: "#e6e6e6", acc: "#4772b3", hot: "#ffaf29", name: "Blender", font: "\"DejaVu Sans\", Inter, sans-serif" },
  zbrush: { bg: "#2b2b2b", panel: "#1e1e1e", view: "#3a3a3a", fg: "#d8d8d8", acc: "#e8892b", hot: "#e8892b" },
  nomad: { bg: "#1c1c1e", panel: "#121214", view: "#2a2a2e", fg: "#f2f2f7", acc: "#4c8dff", hot: "#4c8dff" },
  maya: { bg: "#444444", panel: "#373737", view: "#5d5d5d", fg: "#dddddd", acc: "#5285a6", hot: "#67c7e2" },
  c4d: { bg: "#2e2e2e", panel: "#222222", view: "#3a3a3a", fg: "#dcdcdc", acc: "#5b6ef5", hot: "#5b6ef5" },
  max: { bg: "#444444", panel: "#383838", view: "#4f4f4f", fg: "#dddddd", acc: "#0696d7", hot: "#f0c040" },
  houdini: { bg: "#3a3a3a", panel: "#2b2b2b", view: "#454545", fg: "#cfcfcf", acc: "#4d9be6", hot: "#f2a344" },
  substance: { bg: "#2a2a2a", panel: "#1f1f1f", view: "#353535", fg: "#d9d9d9", acc: "#e64e2f", hot: "#e64e2f" },
  blockbench: { bg: "#21252b", panel: "#181a1f", view: "#282c34", fg: "#d0d3d8", acc: "#3e90ff", hot: "#3e90ff" },
  sketchfab: { bg: "#1b1b1b", panel: "#111111", view: "#2a2a2a", fg: "#eeeeee", acc: "#1caad9", hot: "#1caad9" },
  spline: { bg: "#18181b", panel: "#0f0f11", view: "#242428", fg: "#f4f4f5", acc: "#6c5cff", hot: "#6c5cff" },
  anatomy: { bg: "#111311", panel: "#0b0c0b", view: "#151715", fg: "#d7d7d0", acc: "#d7d7d0", hot: "#e5484d", font: "\"IBM Plex Mono\", monospace" },
  unreal: { bg: "#151515", panel: "#242424", view: "#1c1c1c", fg: "#c0c0c0", acc: "#0070e0", hot: "#ffb300", name: "Unreal Editor" },
  unity: { bg: "#282828", panel: "#383838", view: "#474747", fg: "#d2d2d2", acc: "#2c5d87", hot: "#4c7efc" },
  godot: { bg: "#21262e", panel: "#363d4a", view: "#2a2f38", fg: "#e0e0e0", acc: "#70bafa", hot: "#70bafa" },
  roblox: { bg: "#2e2e2e", panel: "#242424", view: "#3b3b3b", fg: "#e8e8e8", acc: "#00a2ff", hot: "#00a2ff" },
  gamemaker: { bg: "#1f2023", panel: "#2a2c30", view: "#2f3136", fg: "#e2e2e2", acc: "#6ac942", hot: "#6ac942" },
  playcanvas: { bg: "#293538", panel: "#20292b", view: "#364346", fg: "#e0e6e7", acc: "#f60", hot: "#f60" },
  aseprite: { bg: "#3d2f37", panel: "#2b2026", view: "#544047", fg: "#f0e6d8", acc: "#ffd766", hot: "#ffd766", font: "\"Courier Prime\", monospace" },
  comfy: { bg: "#202020", panel: "#353535", view: "#151515", fg: "#dddddd", acc: "#6ab04c", hot: "#6ab04c" },
  touch: { bg: "#1c1c1c", panel: "#2c2c2c", view: "#141414", fg: "#d0d0d0", acc: "#68b0ff", hot: "#ffc66d" },
  rive: { bg: "#1d1d1d", panel: "#141414", view: "#262626", fg: "#ededed", acc: "#57a5e0", hot: "#ff5678" },
  premiere: { bg: "#1d1d1d", panel: "#232323", view: "#000000", fg: "#d6d6d6", acc: "#2d8ceb", hot: "#2d8ceb", clipV: "#9b8de4", clipA: "#4fa36b" },
  ae: { bg: "#232323", panel: "#1b1b1b", view: "#000000", fg: "#d6d6d6", acc: "#2d8ceb", hot: "#c7a64a", clipV: "#b39a5c", clipA: "#4fa36b" },
  resolve: { bg: "#1f1f22", panel: "#28282e", view: "#0b0b0d", fg: "#d0d0d6", acc: "#e64b3d", hot: "#e64b3d", clipV: "#3d79b8", clipA: "#3e8e5d" },
  fcp: { bg: "#1e1e1e", panel: "#2b2b2b", view: "#000000", fg: "#e0e0e0", acc: "#ffd60a", hot: "#ffd60a", clipV: "#3f63c8", clipA: "#3a9f69" },
  capcut: { bg: "#101012", panel: "#1b1b1f", view: "#000000", fg: "#f2f2f2", acc: "#00e1e8", hot: "#00e1e8", clipV: "#2b6c8f", clipA: "#3a8f6e" },
  descript: { bg: "#ffffff", panel: "#f4f4f6", view: "#111111", fg: "#1b1b1f", acc: "#5a4fff", hot: "#5a4fff", clipV: "#8f86ff", clipA: "#4fa36b", light: true },
  kdenlive: { bg: "#232629", panel: "#31363b", view: "#000000", fg: "#eff0f1", acc: "#3daee9", hot: "#3daee9", clipV: "#53698a", clipA: "#3e8e5d" },
  obs: { bg: "#1f1e1f", panel: "#2b2a2b", view: "#000000", fg: "#e0e0e0", acc: "#476be5", hot: "#d7263d" },
  frameio: { bg: "#13131a", panel: "#1c1c26", view: "#000000", fg: "#e7e7f0", acc: "#5b53ff", hot: "#5b53ff" },
  loom: { bg: "#ffffff", panel: "#f5f5f7", view: "#111111", fg: "#1c1c1f", acc: "#625df5", hot: "#625df5", light: true },
  ytstudio: { bg: "#282828", panel: "#1f1f1f", view: "#000000", fg: "#f1f1f1", acc: "#3ea6ff", hot: "#ff0033" },
  ffs: { bg: "#0f0f11", panel: "#17171a", view: "#000000", fg: "#ececef", acc: "#ff6a3d", hot: "#ff6a3d", clipV: "#ff6a3d", clipA: "#7a7aff", name: "fframestudio" },
  photoshop: { bg: "#323232", panel: "#262626", view: "#535353", fg: "#e1e1e1", acc: "#31a8ff", hot: "#31a8ff" },
  lightroom: { bg: "#262626", panel: "#1f1f1f", view: "#141414", fg: "#d9d9d9", acc: "#31a8ff", hot: "#31a8ff" },
  gimp: { bg: "#454545", panel: "#3b3b3b", view: "#2b2b2b", fg: "#dedede", acc: "#7d9fbf", hot: "#7d9fbf" },
  krita: { bg: "#31363b", panel: "#232629", view: "#4a4f55", fg: "#eff0f1", acc: "#3daee9", hot: "#3daee9" },
  procreate: { bg: "#111111", panel: "#1c1c1e", view: "#2a2a2c", fg: "#f2f2f7", acc: "#0a84ff", hot: "#0a84ff" },
  mj: { bg: "#0d0d0f", panel: "#17171a", view: "#000000", fg: "#f2f2f2", acc: "#ffffff", hot: "#ffffff" },
  autocad: { bg: "#3b4453", panel: "#2c3340", view: "#212830", fg: "#f0f0f0", acc: "#0696d7", hot: "#ffffff", name: "AutoCAD" },
  revit: { bg: "#3b4453", panel: "#2c3340", view: "#ffffff", fg: "#f0f0f0", acc: "#0696d7", hot: "#0696d7" },
  fusion: { bg: "#e9ebee", panel: "#ffffff", view: "#f2f4f7", fg: "#2a2a2a", acc: "#0696d7", hot: "#0696d7", light: true },
  sketchup: { bg: "#e6e6e6", panel: "#f5f5f5", view: "#dfe9f2", fg: "#222", acc: "#005f9e", hot: "#c00", light: true },
  rhino: { bg: "#d4d4d4", panel: "#ebebeb", view: "#a0a0a0", fg: "#1d1d1d", acc: "#1d6dd3", hot: "#ffd400", light: true },
  freecad: { bg: "#f0f0f0", panel: "#fafafa", view: "#bcc8d6", fg: "#202020", acc: "#4a90d9", hot: "#00c000", light: true },
  kicad: { bg: "#3b3b3b", panel: "#2a2a2a", view: "#001023", fg: "#e0e0e0", acc: "#c83434", hot: "#c8c832" },
  tldraw: { bg: "#ffffff", panel: "#ffffff", view: "#f9fafb", fg: "#1d1d1d", acc: "#2f80ed", hot: "#2f80ed", light: true, font: "\"Caveat\", \"Comic Sans MS\", cursive" },
  excalidraw: { bg: "#ffffff", panel: "#ffffff", view: "#ffffff", fg: "#1e1e1e", acc: "#6965db", hot: "#6965db", light: true, font: "\"Caveat\", \"Comic Sans MS\", cursive" },
  miro: { bg: "#ffffff", panel: "#ffffff", view: "#f2f2f2", fg: "#050038", acc: "#4262ff", hot: "#ffd02f", light: true },
  figjam: { bg: "#ffffff", panel: "#ffffff", view: "#f5f5f5", fg: "#1e1e1e", acc: "#9747ff", hot: "#ffc943", light: true },
  ableton: { bg: "#2a2a2a", panel: "#1e1e1e", view: "#363636", fg: "#d8d8d8", acc: "#ff764d", hot: "#ffb532" },
  logic: { bg: "#252525", panel: "#1b1b1b", view: "#2e2e2e", fg: "#dedede", acc: "#3fa5ff", hot: "#3fa5ff" },
  fl: { bg: "#34444c", panel: "#2a363c", view: "#3d4f58", fg: "#dfe7ea", acc: "#ff8f00", hot: "#93d500" },
  reaper: { bg: "#333333", panel: "#262626", view: "#3a3a3a", fg: "#d9d9d9", acc: "#47a0ff", hot: "#47a0ff" },
  anki: { bg: "#ffffff", panel: "#f5f5f5", view: "#ffffff", fg: "#202020", acc: "#0093d0", hot: "#0093d0", light: true },
  quizlet: { bg: "#0a092d", panel: "#2e3856", view: "#2e3856", fg: "#ffffff", acc: "#4255ff", hot: "#ffcd1f" },
  scratch: { bg: "#e9f1fc", panel: "#ffffff", view: "#f9f9f9", fg: "#575e75", acc: "#855cd6", hot: "#ffab19", light: true },
  dji: { bg: "#000000", panel: "#111111", view: "#000000", fg: "#ffffff", acc: "#ffffff", hot: "#ffcc00" },
  betaflight: { bg: "#2e2e2e", panel: "#242424", view: "#000000", fg: "#ffffff", acc: "#ffbb00", hot: "#ffbb00", font: "\"IBM Plex Mono\", monospace" },
  gev: { bg: "#020604", panel: "#061009", view: "#000000", fg: "#9dffbf", acc: "#39ff88", hot: "#ffb000", font: "\"IBM Plex Mono\", monospace", name: "God's Eye View" },
  usd: { bg: "#1f2123", panel: "#2a2d30", view: "#17191b", fg: "#d6d8da", acc: "#76b900", hot: "#76b900" },
  omni: { bg: "#1f2123", panel: "#2a2d30", view: "#3a3d40", fg: "#d6d8da", acc: "#76b900", hot: "#76b900", name: "Isaac Sim" },
  meshy: { bg: "#0b0b0f", panel: "#15151b", view: "#1b1b22", fg: "#f2f2f5", acc: "#c4f042", hot: "#c4f042" },
  tiny: { bg: "#a8d8ea", panel: "#ffffff", view: "#cfeaf5", fg: "#2a3b4c", acc: "#3a72c8", hot: "#ffb347", light: true },
  dash: { bg: "#000000", panel: "#0d0d0d", view: "#000000", fg: "#f5f5f5", acc: "#ffffff", hot: "#4ade80" },
  code: null,
};

/** Wrap a card body in the app's editor surface. */
export function appSurface(a, kids, { ui = a.ui, cls = "" } = {}) {
  const t = UI[ui] || null;
  const el = h("div", { class: `ap ${cls}` + (t?.light ? " ap-light" : "") + (t ? "" : " ap-host"), "data-ui": ui || "host" }, kids);
  if (t) { el.style.setProperty("--ap-bg", t.bg); el.style.setProperty("--ap-panel", t.panel); el.style.setProperty("--ap-view", t.view); el.style.setProperty("--ap-fg", t.fg); el.style.setProperty("--ap-acc", t.acc); el.style.setProperty("--ap-hot", t.hot); if (t.font) el.style.setProperty("--ap-font", t.font); }
  return el;
}
export const uiOf = (a) => UI[a.ui] || null;

/** Editor header strip: mode menu + tabs, like the app's own header. */
export function appBar(items, right = []) {
  return h("div", { class: "ap-bar" }, items.map((x, i) => h("span", { class: "ap-tab" + (i === 0 ? " on" : "") }, x)), h("span", { class: "grow" }), right);
}
