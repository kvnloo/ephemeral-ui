// Run with EUI_DOM_MODULE pointing to linkedom's worker.js (no browser needed).
// node --test tools/intent.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const { parseHTML } = await import(pathToFileURL(process.env.EUI_DOM_MODULE).href);
const { document, window } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { document, window, matchMedia: () => ({ matches: true, addEventListener() {} }), requestAnimationFrame: f => f() });
const D = JSON.parse(fs.readFileSync(new URL("../src/data/intent-snapshot.json", import.meta.url)));
const themes = JSON.parse(fs.readFileSync(new URL("../src/data/themes.json", import.meta.url))).themes;
const { state } = await import("../src/js/themes.js"); state.base = themes.find(t => t.id === "t3-dark");
const { KINDS_I } = await import("../src/js/kinds-i.js");
const { gateState, readiness, reviewRequest, contractView, ageDays, topRows } = await import("../src/js/intent-data.js");
const click = e => { assert.ok(e); e.dispatchEvent(new window.Event("click")); };
const button = (root, text) => [...root.querySelectorAll("button")].find(b => b.textContent === text);
const app = { id: "aodl", name: "AODL", hex: null };

test("three kit compositions cover all eight new kinds once", async () => {
  const { INTENT_KITS } = await import("../src/js/intent-kits.js");
  const kinds = INTENT_KITS.flatMap(k => k.kinds).filter(k => !k.startsWith("trace"));
  assert.equal(INTENT_KITS.length, 3); assert.deepEqual(kinds.sort(), Object.keys(KINDS_I).sort());
});
test("eight cards build in T3 and Hermes light/dark without mutating their source", async () => {
  const before = JSON.stringify(D);
  for (const id of ["t3-dark", "t3-light", "hermes-nous", "hermes-nous-dark"]) {
    state.base = themes.find(t => t.id === id); assert.ok(state.base, `theme ${id} exists`);
    for (const [kind, K] of Object.entries(KINDS_I)) {
      const c = K.make(app, null, D); document.body.append(c.el); await c.done; await c.play();
      assert.equal(c.spec.kind, kind); assert.equal(c.el.dataset.kind, kind); assert.equal(c.spec.actions, "read-only");
      assert.ok(c.el.textContent.length > 100); assert.ok(!c.el.textContent.includes("undefined"));
      assert.equal(c.el.querySelectorAll("script").length, 0); c.el.remove();
    }
  }
  assert.equal(JSON.stringify(D), before);
});
test("source sentence drill-down and review callback preserve pending approval", async () => {
  const requests = [], before = JSON.stringify(D);
  const c = KINDS_I["intent-declare"].make(app, null, D, { onReview: r => requests.push(r) }); await c.done;
  click(c.el.querySelectorAll(".ic-sentence")[1]); assert.match(c.el.textContent, /Context, not another task/);
  click(button(c.el, "Prepare review ↗")); assert.equal(requests.length, 1); assert.equal(requests[0].action, "request_review");
  assert.equal(requests[0].contractHash, D.contract.contractHash); assert.equal(requests[0].approval, "pending");
  assert.equal(JSON.stringify(D), before); assert.match(c.el.textContent, /Nothing approved/);
});
test("contract tabs expose claims and explicit out-of-scope without approving", async () => {
  const c = KINDS_I["intent-contract"].make(app, null, D); await c.done;
  assert.match(c.el.textContent, /unproven/);
  click(button(c.el, "Evidence")); assert.match(c.el.textContent, /claimed/);
  click(button(c.el, "Boundaries")); assert.match(c.el.textContent, /Out of scope/); assert.match(c.el.textContent, /conflict/);
  click(button(c.el, "Done means")); assert.match(c.el.textContent, /working_while_running/);
  assert.equal(c.el.querySelectorAll('[aria-selected="true"]').length, 1);
});
test("work graph reveals each slice; proof remains missing despite passing preconditions", async () => {
  const c = KINDS_I["intent-work"].make(app, null, D); await c.done;
  for (const s of c.el.querySelectorAll(".ic-slice")) click(s);
  assert.equal(c.el.querySelectorAll('[aria-pressed="true"]').length, 1);
  assert.match(c.el.textContent, /receipt/);
  const p = KINDS_I["intent-proof"].make(app, null, D); await p.done;
  assert.match(p.el.textContent, /Missing/); assert.equal(readiness(D.contract).accepted, false);
  assert.equal(readiness(D.contract).observed, 3);
  assert.equal(gateState({ ...D.contract.pre[1], observedHead: "changed" }), "changed");
});
test("all intelligence tabs and chart bars respond with honest denominator labels", async () => {
  for (const kind of ["intel-decisions", "intel-value", "intel-context"]) {
    const c = KINDS_I[kind].make(app, null, D); await c.done;
    for (const tab of c.el.querySelectorAll('[role="tab"]')) click(tab);
    for (const bar of c.el.querySelectorAll("button.ic-bar")) click(bar);
    assert.ok(c.el.textContent.length > 200);
  }
  const c = KINDS_I["intel-context"].make(app, null, D); await c.done;
  assert.match(c.el.textContent, /15.1%/); assert.match(c.el.textContent, /8,149 labeled/);
  const v = KINDS_I["intel-value"].make(app, null, D); await v.done;
  assert.match(v.el.textContent, /counterfactual estimate/); assert.match(v.el.textContent, /tokens \/ task: N\/A/);
});
test("degraded readiness is scoped to capture interpreter, not asserted global outage", async () => {
  const c = KINDS_I["intel-health"].make(app, null, D); await c.done;
  assert.match(c.el.textContent, /interpreter used to capture/); assert.match(c.el.textContent, /credential presence only/);
});
test("kit navigation, Seen/Reopen and review handoff work as one surface", async () => {
  const { buildIntent } = await import("../src/js/intent-kits.js");
  globalThis.fetch = async () => ({ ok: true, json: async () => D });
  globalThis.location = { hash: "" }; globalThis.history = { replaceState() {} };
  const target = document.createElement("section"); document.body.append(target);
  buildIntent({ catalog: { byId: {} }, target });
  await window.__intent.pick("declare", false); await Promise.all(window.__intent.cards.map(c => c.done));
  assert.equal(target.querySelectorAll(".ik-cell").length, 2);
  click(button(target, "Seen")); assert.equal(target.querySelector(".eu-card").hidden, true);
  click(button(target, "Reopen")); assert.equal(target.querySelector(".eu-card").hidden, false);
  click(button(target, "Prepare review ↗")); assert.match(target.querySelector(".ik-hostnote").textContent, /request_review/);
  await window.__intent.pick("operate", false); await Promise.all(window.__intent.cards.map(c => c.done));
  assert.equal(target.querySelectorAll(".ik-cell").length, 2); assert.match(target.textContent, /Implementation|implementation|real-turn/);
  assert.equal(target.querySelectorAll('.ik-kits [aria-selected="true"]').length, 1); target.remove();
});
test("data helpers keep unknowns unknown and do not write authority", () => {
  assert.equal(ageDays("2026-11-01T00:00:00Z", Date.parse("2026-11-03T00:00:00Z")), 2);
  assert.equal(topRows({ b: 1, a: 2 })[0].label, "a"); assert.equal(reviewRequest(D.contract).action, "request_review");
  const doc = { revision: 2, plan: { bindings: { approval: { status: "pending", sourceHash: "s", contractHash: "c" }, "task.x": { text: "ask", status: "open", acceptance: "a", preconditions: ["p"] }, a: { type: "human_review" }, p: { type: "file_contains" } } } };
  assert.equal(contractView(doc).tasks[0].acceptance.type, "human_review"); assert.equal(doc.plan.bindings.approval.status, "pending");
});
