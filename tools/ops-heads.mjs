// Print each ops board's headline and stat row from a snapshot (DOM, no browser): a quick read of what
// the boards actually say.   EUI_DOM_MODULE=… node tools/ops-heads.mjs [snapshot.json]
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const { parseHTML } = await import(pathToFileURL(process.env.EUI_DOM_MODULE).href);
const { document, window } = parseHTML("<html><body></body></html>");
const noop = () => {};
window.HTMLElement.prototype.animate = () => ({ finished: Promise.resolve(), cancel: noop, set onfinish(f) {} });
const snap = JSON.parse(fs.readFileSync(process.argv[2] ?? new URL("../src/data/ops-fixture.json", import.meta.url)));
Object.assign(globalThis, { document, window, CustomEvent: window.CustomEvent, Event: window.Event, Node: window.Node, matchMedia: () => ({ matches: false, addEventListener: noop }), requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout, ResizeObserver: class { observe() {} disconnect() {} }, getComputedStyle: () => ({ getPropertyValue: () => "" }), addEventListener: noop, removeEventListener: noop, fetch: async () => ({ ok: true, json: async () => snap }) });
const { KINDS_OPS, OPS_APPS } = await import("../src/js/kinds-ops.js");
for (const [kind, K] of Object.entries(KINDS_OPS)) {
  const c = K.make({ id: OPS_APPS[kind], name: OPS_APPS[kind] }, Math.random);
  document.body.append(c.el); await c.done;
  const stats = [...c.el.querySelectorAll(".sl-stat")].map((s) => `${s.querySelector(".sl-stat-l")?.textContent}=${s.querySelector(".sl-stat-v")?.textContent}`).join(" | ");
  console.log(`\n## ${kind}\n${c.el.querySelector(".ops-lead")?.textContent}\n  ${stats}`);
  for (const p of c.el.querySelectorAll(".ops-p")) console.log("  · " + p.textContent);
}
