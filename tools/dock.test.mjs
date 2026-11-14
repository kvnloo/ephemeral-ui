import { test } from "node:test";
import assert from "node:assert/strict";
const { parseHTML } = await import(process.env.EUI_DOM_MODULE || 'linkedom');
const { document, window } = parseHTML("<html><body><main id=chat></main><div id=pinslot></div></body></html>");
Object.assign(globalThis, { document, window, CustomEvent: window.CustomEvent, matchMedia: () => ({ matches: true, addEventListener() {} }), requestAnimationFrame: (f) => f() });
window.HTMLElement.prototype.animate = function () { return { pause() {}, play() {}, cancel() {}, finished: Promise.resolve(), onfinish: null }; };
const { state } = await import("../src/js/themes.js");
import fs from "node:fs";
state.base = JSON.parse(fs.readFileSync(new URL("../src/data/themes.json", import.meta.url))).themes.find((t) => t.id === "t3-dark");
const { digest, DOCK_FIXTURE, workDockMake } = await import("../src/js/kinds-dock.js");

test("digest groups blockers, todos and live bots with their subagents", () => {
  const d = digest(DOCK_FIXTURE);
  assert.equal(d.blockers.length, 2); assert.equal(d.todos.length, 2);
  assert.deepEqual(d.running.map((r) => [r.profile, r.live]), [["alpha", true], ["beta", true], ["gamma", false]]);
  assert.equal(d.running[0].subagents.length, 2); assert.equal(d.subRunning, 1);
});

test("a finished subagent older than 30 min drops out; a running one keeps an idle bot live", () => {
  const f = structuredClone(DOCK_FIXTURE);
  f.subagents = [{ profile: "gamma", id: "x", state: "running", startedAt: f.at - 3e6 }, { profile: "beta", id: "y", state: "completed", startedAt: f.at - 9e6, endedAt: f.at - 7.2e6 }];
  const d = digest(f);
  assert.equal(d.running.find((r) => r.profile === "gamma").live, true);
  assert.equal(d.running.find((r) => r.profile === "beta").subagents.length, 0);
});

test("public build renders the synthetic fixture, labelled, and pin moves the card into the bar and back", () => {
  const c = workDockMake({ id: "z0", name: "z0 work", hex: null }, null, { bar: "#pinslot" });
  document.getElementById("chat").append(c.el);
  assert.match(c.el.querySelector(".wd-disc").textContent, /SYNTHETIC/);
  assert.equal(c.spec.provenance, "synthetic-fixture");
  const seen = []; document.addEventListener("eui:intent", (e) => seen.push(e.detail.action));
  c.pin(true);
  assert.ok(document.querySelector("#pinslot .wd-dock .k-work-dock"));
  assert.match(document.querySelector(".wd-bubble").getAttribute("aria-label"), /2 blocked, 2 to do, 2 running/);
  c.pin(false);
  assert.ok(document.querySelector("#chat .k-work-dock")); assert.equal(document.querySelectorAll(".wd-dock").length, 0);
  assert.ok(seen.includes("pin_to_bar") && seen.includes("unpin_from_bar"));
});
