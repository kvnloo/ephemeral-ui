// Ops boards DOM suite (no browser): every ops-* kind builds from the snapshot, answers with a
// headline, keeps the board contract, shows no NaN/undefined, and turns clicks into @ops references.
//   EUI_DOM_MODULE=<linkedom>/worker.js node --test tools/ops.test.mjs
//   OPS_DATA=out/ops-live.json …   (run the same suite against the live local snapshot)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const { parseHTML } = await import(pathToFileURL(process.env.EUI_DOM_MODULE).href);
const { document, window } = parseHTML("<html><body></body></html>");
const noop = () => {};
window.HTMLElement.prototype.animate = () => ({ finished: Promise.resolve(), cancel: noop, pause: noop, play: noop, set onfinish(f) {} });
window.HTMLElement.prototype.scrollIntoView = noop;
window.HTMLElement.prototype.setPointerCapture = noop;
window.HTMLElement.prototype.focus = noop;
const snap = JSON.parse(fs.readFileSync(process.env.OPS_DATA ?? new URL("../src/data/ops-fixture.json", import.meta.url)));
Object.assign(globalThis, {
  document, window, CustomEvent: window.CustomEvent, Event: window.Event, Node: window.Node,
  matchMedia: () => ({ matches: false, addEventListener: noop }), requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
  ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} },
  getComputedStyle: () => ({ getPropertyValue: () => "" }), devicePixelRatio: 1, addEventListener: noop, removeEventListener: noop,
  fetch: async (u) => ({ ok: String(u).includes("ops-fixture"), status: 200, json: async () => snap }),
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (t) => { globalThis.__copied = t; } } } });
const { KINDS_OPS, OPS_APPS } = await import("../src/js/kinds-ops.js");
const { parseOpsRef, opsRef } = await import("../src/js/ops-data.js");
const app = (id) => ({ id, name: id, hex: "#5ad8e6" });
const text = (el) => el.textContent.replace(/\s+/g, " ");
const tick = () => new Promise((r) => setTimeout(r, 5));

test("every ops board builds, answers with a headline and keeps the contract", async () => {
  assert.equal(Object.keys(KINDS_OPS).length, 11);
  for (const [kind, K] of Object.entries(KINDS_OPS)) {
    assert.ok(OPS_APPS[kind], `${kind}: app`);
    const c = K.make(app(OPS_APPS[kind]), Math.random);
    document.body.append(c.el);
    await c.done; await tick();
    const b = c.board;
    assert.equal(b.el, c.el); assert.equal(b.spec.v, 0); assert.equal(typeof b.getSelection, "function"); assert.equal(typeof b.on, "function");
    const lead = c.el.querySelector(".ops-lead");
    assert.ok(lead && lead.textContent.trim().length > 20, `${kind}: headline answer`);
    const t = text(c.el);
    assert.ok(!/\bNaN\b|undefined|\[object Object\]/.test(t), `${kind}: no NaN/undefined in "${t.match(/.{40}(NaN|undefined|\[object Object\]).{40}/)?.[0]}"`);
    assert.ok(c.el.querySelector(".ops-tray .ops-ref").value.startsWith(`@ops:v0;b=${kind.slice(4)};k=board`), `${kind}: tray ref`);
    assert.equal(c.spec.capturedAt, snap.capturedAt);
  }
});

test("picks become typed events and an @ops reference; pins persist", async () => {
  const picks = {
    "ops-burn": ".ops-lane", "ops-fleet": ".ops-node", "ops-incidents": ".ops-ev, .ops-chain", "ops-alive": "tr[data-clickable='true']", "ops-slow": "tr[data-clickable='true']",
    "ops-models": ".sl-barlist-row", "ops-tokens": "tr[data-clickable='true']", "ops-context": "tr[data-clickable='true']", "ops-tools": "tr[data-clickable='true'], .sl-barlist-row",
    "ops-routing": "tr[data-clickable='true']", "ops-sources": "tr[data-clickable='true']",
  };
  for (const [kind, sel] of Object.entries(picks)) {
    const c = KINDS_OPS[kind].make(app(OPS_APPS[kind]), Math.random);
    document.body.append(c.el); await c.done; await tick();
    const seen = [];
    c.board.on("*", (e) => seen.push(e));
    const target = c.el.querySelector(sel);
    if (!target) { assert.ok(c.el.querySelector(".sl-empty"), `${kind}: nothing to pick and no empty state`); continue; }
    target.dispatchEvent(new window.Event("click", { bubbles: true }));
    await tick();
    const ev = seen.find((e) => e.type === "select");
    assert.ok(ev, `${kind}: select event`);
    assert.ok(ev.ids.length || ev.range, `${kind}: event carries ids or a range`);
    assert.ok(ev.ids.every((i) => /^\w+:.+/.test(i)), `${kind}: ids are type:id`);
    const ref = c.el.querySelector(".ops-ref").value;
    const p = parseOpsRef(ref);
    assert.equal(p.board, kind.slice(4)); assert.equal(p.at, snap.capturedAt);
    if (ev.ids.length) assert.ok(p.ids.length > 0, `${kind}: ref names the pick: ${ref}`);
    const pin = [...c.el.querySelectorAll(".ops-btn")].find((x) => x.textContent === "Pin");
    pin.dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.ok(seen.some((e) => e.type === "pin"), `${kind}: pin event`);
    assert.ok(c.el.querySelector(".ops-chip.pinned"), `${kind}: pinned chip`);
    const copy = [...c.el.querySelectorAll(".ops-btn")].find((x) => x.textContent === "Copy for chat");
    copy.dispatchEvent(new window.Event("click", { bubbles: true })); await tick();
    assert.equal(globalThis.__copied, c.el.querySelector(".ops-ref").value, `${kind}: copied the reference`);
  }
});

test("references drop ids that would break the wire format", () => {
  const r = opsRef({ board: "fleet", kind: "host", ids: ["host:laptop", "bad;id=x", "session:s-1a2b3c"], range: [1, 5], at: 9 });
  assert.equal(r, "@ops:v0;b=fleet;k=host;ids=host:laptop,session:s-1a2b3c;r=1-5;at=9");
  assert.deepEqual(parseOpsRef(`see ${r} please`), { board: "fleet", kind: "host", ids: ["host:laptop", "session:s-1a2b3c"], range: [1, 5], at: 9 });
});
