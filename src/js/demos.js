// Standalone cards: no chat shell, agent bridge, or host selection.
import { KINDS } from "./kind-registry.js";
import { h, rng, Run, quiet } from "./motion.js";
import { catalog, loadApps } from "./shell.js";
import { loadThemes, setBrand, state } from "./themes.js";

const $ = (selector) => document.querySelector(selector);
const status = $("#demo-status");
const selected = new URLSearchParams(location.search).get("kind");

async function boot() {
  const [entries] = await Promise.all([
    fetch("data/kind-demos.json").then((r) => {
      if (!r.ok) throw new Error("Demo index unavailable");
      return r.json();
    }),
    loadApps(),
    loadThemes({ light: "hermes-nous", dark: "hermes-nous-dark", brandModes: ["mono", "full"] }),
  ]);

  const ordered = entries.sort((a, b) => a.kind.localeCompare(b.kind));
  $("#demo-index").replaceChildren(...ordered.map(({ kind, label }) => h("li", {},
    h("a", { href: `?kind=${encodeURIComponent(kind)}`, "aria-current": selected === kind ? "page" : null }, label, " · ", h("code", {}, kind)))));

  if (!selected) { status.hidden = true; return; }
  const demo = entries.find(({ kind }) => kind === selected);
  if (!demo) { status.textContent = "That card kind is not in the demo catalog. Pick one below."; return; }

  const { kind, label, seed, app: { id, name }, example } = demo;
  const app = catalog.byId[id] ?? { id, name, hex: null };
  const c = KINDS[kind].make(app, rng(seed), kind === "work-dock" ? { bar: "#demo-dock" } : undefined, { demo: example });
  $("#demo-title").textContent = label;
  for (const radio of document.querySelectorAll("#demo-brand input")) {
    radio.checked = radio.value === state.brand;
    radio.onchange = () => { if (radio.checked) setBrand(radio.value); };
  }
  if (c.el.matches(".k-trace, .k-cua-action, .k-gev-contacts")) {
    $("#demo-skin").hidden = false;
    $("#demo-skin").textContent = "This card keeps its dedicated skin in both modes. The header treatment still switches.";
  }
  $("#demo-mount").append(c.el);
  $("#demo-section").hidden = false;
  $("#demo-replay").onclick = () => location.reload(); // Dispose of any renderer timers/canvas with the document.
  await c.done;
  status.hidden = true;
  quiet(Promise.resolve(c.play(new Run())));
}

boot().catch((error) => {
  status.textContent = "Could not load the card demo.";
  console.error(error);
});
