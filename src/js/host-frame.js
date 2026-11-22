// One host-matrix frame: the pinned fixture card in one agent host's skin (a simulation).
// URL: host-frame.html?host=<hosts.json id>&scheme=light|dark&app=<app>&kind=<kind>
// Tells the parent page when it is ready and every eui:intent the card raises; the parent plays
// that host's bridge (js/host-bridge.js). Nothing leaves the page.
import { h, rng, Run, quiet } from "./motion.js";
import { loadThemes, state, apply } from "./themes.js";
import { loadApps, catalog } from "./shell.js";
import { KINDS_A } from "./kinds-a.js";
import { KINDS_B } from "./kinds-b.js";
import { themeFor } from "./host-bridge.js";

const KINDS = { ...KINDS_A, ...KINDS_B };
const TAG = { "t3-native": "App card", none: "Artifact · cards.html", "tern-host": "```ephemeral-ui", "mcp-apps": "MCP App · ui://ephemeral-ui/card", "o8-question": "Visualization · o8_html_render" };
const post = (msg) => parent !== window && parent.postMessage(msg, location.origin);

async function boot() {
  const q = new URLSearchParams(location.search);
  const [hosts] = await Promise.all([fetch("data/hosts.json").then((r) => r.json()), loadThemes(), loadApps()]);
  const prof = hosts.hosts.find((p) => p.id === q.get("host")) || hosts.hosts[0];
  const scheme = q.get("scheme") === "dark" ? "dark" : "light";
  const appId = catalog.byId[q.get("app")] ? q.get("app") : hosts.fixture.app;
  const kind = KINDS[q.get("kind")] ? q.get("kind") : hosts.fixture.kind;
  state.base = state.themes.find((t) => t.id === themeFor(prof, scheme));
  state.over = {}; state.brand = "accent";
  apply(false);
  const a = catalog.byId[appId];
  const c = KINDS[kind].make(a, rng(appId + kind));
  const root = document.getElementById("hf");
  root.dataset.bridge = prof.bridge.id;
  root.replaceChildren(
    h("div", { class: "hf-turn" }, h("span", { class: "hf-tag" }, TAG[prof.bridge.id] || prof.surface), h("div", { class: "hf-slot" }, c.el)),
  );
  document.addEventListener("eui:intent", (e) => post({ type: "eui:frame-intent", host: prof.id, detail: e.detail }));
  quiet(c.play(new Run()));
  const size = () => post({ type: "eui:frame-size", host: prof.id, height: Math.ceil(document.documentElement.scrollHeight) });
  new ResizeObserver(size).observe(root);
  document.documentElement.classList.add("ready");
  post({ type: "eui:frame-ready", host: prof.id, theme: state.base.id, app: appId, kind, height: Math.ceil(document.documentElement.scrollHeight) });
}
boot();
