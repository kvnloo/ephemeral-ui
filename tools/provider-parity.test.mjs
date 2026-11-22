// EU-030: one card spec and one renderer for OpenUI Lang and A2UI (src/js/card-spec.js, src/js/a2ui.js).
// The canonical fixtures in src/data/providers/ say the same thing in both languages; they must give the same
// normalized spec, the same card DOM, the same theme tokens and the same interaction event, and every invalid
// payload must be rejected. tools/provider-parity.pw.mjs repeats the check in real Chromium on providers.html.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { setup, kinds, render, propsOf } from "./card-catalog.mjs";
import { fromOpenUI, fromA2UI, fromProgram, normalize } from "./card-spec.mjs";
import { cardSpec } from "../src/js/card-spec.js";
import { parseA2UI, toA2UIAction, A2UIError, A2UI_CATALOG_ID, COMPONENTS, looksLikeA2UI } from "../src/js/a2ui.js";
import { bundle, VENDOR_FILE } from "./vendor-openui.mjs";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");
const fx = (f) => fs.readFileSync(path.join(src, "data/providers", f), "utf8");
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const OPENUI = fx("merge.openui"), A2UI = fx("merge.a2ui.jsonl");
const lines = (t) => t.trim().split("\n").map((l) => JSON.parse(l));
const jsonl = (m) => m.map((x) => JSON.stringify(x)).join("\n");
const edit = (f, base = A2UI) => { const m = lines(base); f(m); return jsonl(m); };
const PR = lines(A2UI)[2].updateDataModel.value;
const plain = (x) => JSON.parse(JSON.stringify(x));

test("the A2UI catalog file names card.v0's kinds and exactly the adapter's components", () => {
  const cat = readJSON("src/schema/a2ui-catalog.v0.json"), card = readJSON("src/schema/card.v0.json");
  assert.equal(cat.$id, A2UI_CATALOG_ID); assert.equal(cat.catalogId, A2UI_CATALOG_ID);
  assert.deepEqual(cat.components.EphemeralCard.properties.kind.enum, card.properties.kind.enum);
  assert.deepEqual(Object.keys(cat.components), Object.keys(COMPONENTS));
  for (const [k, props] of Object.entries(COMPONENTS)) assert.deepEqual(Object.keys(cat.components[k].properties).sort(), [...props].sort(), k);
  for (const c of Object.values(cat.components)) if (c.properties.children) assert.equal(c.properties.children.$ref, "common_types.json#/$defs/ChildList");
});

test("providers.html's kind → module table matches catalog/catalog.json", () => {
  const text = fs.readFileSync(path.join(src, "js/providers.js"), "utf8");
  const table = new Function(`return ${text.match(/export const KIND_MODULES = (\{[\s\S]*?\n\});/)[1]}`)();
  const want = {};
  for (const k of readJSON("catalog/catalog.json").kinds.filter((k) => k.programmable)) (want[path.basename(k.module, ".js")] ??= []).push(k.kind);
  assert.deepEqual(Object.fromEntries(Object.entries(table).map(([m, ks]) => [m, [...ks].sort()]).sort()), Object.fromEntries(Object.entries(want).map(([m, ks]) => [m, ks.sort()]).sort()));
});

test("src/vendor/openui-lang-core.js is what the pinned @openuidev/lang-core builds (node tools/vendor-openui.mjs)", async () => {
  assert.equal(fs.readFileSync(VENDOR_FILE, "utf8"), await bundle());
});

test("canonical OpenUI Lang and A2UI fixtures give the same normalized card spec", async () => {
  const o = await fromOpenUI(OPENUI);
  assert.equal(o.source.provider, "openui");
  assert.deepEqual(plain(o), { v: 0, title: "Auth middleware PR", summary: "PR #128 has 3 conflicts with main; tests pass, preview is still building.",
    cards: [{ kind: "merge", app: "github", input: PR }, { kind: "ci", app: "github" }] });
  const variants = { "1.0 JSONL": A2UI, "v0.9 JSONL": fx("merge.a2ui-v0.9.jsonl"), "1.0 single createSurface": fx("merge.a2ui-single.jsonl"), "parsed messages": lines(A2UI), "JSON array": JSON.stringify(lines(A2UI)) };
  for (const [name, input] of Object.entries(variants)) {
    const a = fromA2UI(input);
    assert.equal(a.source.provider, "a2ui", name);
    assert.deepEqual(a, o, name);
    assert.deepEqual(a.source.componentIds, ["pr_card", "ci_card"], name);
  }
  // auto-detection (export-cards --program) picks the right adapter for each text
  assert.equal((await fromProgram(OPENUI)).source.provider, "openui");
  assert.equal((await fromProgram(A2UI)).source.provider, "a2ui");
  assert.equal(looksLikeA2UI(OPENUI), false);
  // the browser's vendored parser gives the same spec as the npm package
  const { createParser } = await import("../src/vendor/openui-lang-core.js");
  const S = cardSpec({ card: readJSON("src/schema/card.v0.json"), apps: readJSON("src/data/apps.json").apps });
  assert.deepEqual(S.fromOpenUI(OPENUI, createParser), o);
  assert.deepEqual(S.fromA2UI(A2UI), o);
});

// Mount both specs with the reference renderer (each kind's make(app, rng(app + kind), input), as every host does).
async function mount(spec) {
  const { list } = await kinds();
  const cards = [];
  for (const c of spec.cards) cards.push(await render({ seed: c.app + c.kind, card: c }, list.get(c.kind).def));
  return cards;
}
const unmount = (cards) => cards.forEach((c) => c.el.remove());

test("both providers render the same card DOM, and the merge card draws the payload", async () => {
  const [o, a] = [await fromOpenUI(OPENUI), fromA2UI(A2UI)];
  const co = await mount(o), ca = await mount(a);
  assert.equal(co.length, 2);
  assert.deepEqual(ca.map((c) => c.el.outerHTML), co.map((c) => c.el.outerHTML));
  assert.deepEqual(ca.map((c) => propsOf(c.spec)), co.map((c) => propsOf(c.spec)));
  assert.deepEqual(propsOf(ca[0].spec), propsOf({ kind: "merge", app: "github", input: PR }));
  const t = ca[0].el.textContent;
  for (const s of ["Refresh sessions in the auth middleware", "#128 · feat/session → main", "main moved · 3 conflicts", "Rotate session keys", "Open on GitHub"]) assert.ok(t.includes(s), s);
  assert.doesNotMatch(ca.map((c) => c.el.textContent).join(" "), /\bundefined\b|\bNaN\b/);
  unmount([...co, ...ca]);
});

test("theme tokens come from the host theme and are identical for both providers", async () => {
  await setup();
  const { state, apply } = await import("../src/js/themes.js");
  const prev = state.base;
  const r = document.documentElement, seen = {};
  try {
    for (const id of ["t3-light", "hermes-nous-dark"]) {
      state.base = state.themes.find((t) => t.id === id); state.over = {}; apply(false);
      const tokens = (cards) => ({ root: Object.fromEntries([...r.style.cssText.matchAll(/(--h-[\w-]+)\s*:\s*([^;]+)/g)].map((m) => [m[1], m[2].trim()])), host: r.dataset.host, scheme: r.dataset.scheme,
        cards: cards.map((c) => Object.fromEntries(["--a", "--a-ink", "--a-raw"].map((k) => [k, c.el.style.getPropertyValue(k)]))) });
      const co = await mount(await fromOpenUI(OPENUI)), ca = await mount(fromA2UI(A2UI));
      // v0.9 lets createSurface carry a theme; cards ignore it, the host theme wins
      const cv = await mount(fromA2UI(edit((m) => { m[0].createSurface.theme = { primaryColor: "#ff0000" }; }, fx("merge.a2ui-v0.9.jsonl"))));
      const [to, ta, tv] = [tokens(co), tokens(ca), tokens(cv)];
      assert.deepEqual(ta, to, id); assert.deepEqual(tv, to, `${id} v0.9 theme`);
      assert.ok(to.root["--h-bg"] && to.root["--h-primary"] && to.cards[0]["--a"], `${id}: tokens set`);
      seen[id] = to;
      unmount([...co, ...ca, ...cv]);
    }
    assert.notEqual(seen["t3-light"].root["--h-bg"], seen["hermes-nous-dark"].root["--h-bg"]);
    assert.deepEqual([seen["t3-light"].host, seen["hermes-nous-dark"].host], ["t3", "hermes"]);
  } finally { state.base = prev; state.over = {}; apply(false); }
});

test("the same clicks give the same eui:intent from both providers, and A2UI gets its action message", async () => {
  const o = await fromOpenUI(OPENUI), a = fromA2UI(A2UI);
  const run = async (spec) => {
    const cards = await mount(spec), got = [];
    for (const c of cards) c.el.addEventListener("eui:intent", (e) => got.push(e.detail));
    cards[0].el.querySelector(".eu-ttl").click();               // pin the merge card
    cards[1].el.querySelectorAll(".gantt li")[3].click();       // ask about the "unit" CI job
    unmount(cards);
    return got;
  };
  const eo = await run(o), ea = await run(a);
  assert.equal(eo.length, 2);
  assert.deepEqual(ea, eo);
  assert.deepEqual(eo.map((d) => [d.kind, d.app, d.action, d.ids]), [["merge", "github", "pin", ["card:merge"]], ["ci", "github", "select", ["job:unit"]]]);
  const actions = ea.map((d, i) => toA2UIAction(d, { version: a.source.version, surfaceId: a.source.surfaceId, sourceComponentId: a.source.componentIds[i] }));
  assert.deepEqual(actions[1], { version: "1.0", action: { name: "select", surfaceId: "auth_pr", sourceComponentId: "ci_card", timestamp: new Date(eo[1].at).toISOString(), userMessage: "Why is unit slow?", context: { kind: "ci", app: "github", ids: ["job:unit"], entities: { job: "unit" } } } });
  assert.equal(actions[0].action.sourceComponentId, "pr_card");
  assert.throws(() => toA2UIAction(eo[0], { surfaceId: "auth_pr" }), A2UIError);
});

test("export-cards --program renders both fixtures through the same export (2 cards each, A2UI actions wired)", () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "eui-parity-"));
  try {
    const res = {};
    for (const [p, file] of [["openui", "merge.openui"], ["a2ui", "merge.a2ui.jsonl"]]) {
      const out = path.join(dir, `${p}.html`);
      execFileSync(process.execPath, [path.join(root, "tools/export-cards.mjs"), "--program", path.join(src, "data/providers", file), "--out", out], { encoding: "utf8" });
      res[p] = JSON.parse(execFileSync(process.execPath, [path.join(root, "tools/export-check.mjs"), out, "--expect", "2"], { encoding: "utf8" }));
      res[p].html = fs.readFileSync(out, "utf8");
    }
    for (const p of ["openui", "a2ui"]) { assert.equal(res[p].ready, true, p); assert.equal(res[p].cards, 2, p); assert.deepEqual(res[p].errors, [], p); assert.equal(res[p].hasUndefined, false, p); }
    assert.equal(res.openui.theme, res.a2ui.theme);
    for (const id of ["auth_pr", "pr_card", "ci_card", "a2ui:action"]) { assert.ok(res.a2ui.html.includes(id), `a2ui export lacks ${id}`); assert.ok(!res.openui.html.includes(id), `openui export has ${id}`); }
    assert.match(res.openui.html, /<title>Auth middleware PR<\/title>/); assert.match(res.a2ui.html, /<title>Auth middleware PR<\/title>/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("invalid A2UI payloads are rejected with the spec's error codes", () => {
  const v09 = fx("merge.a2ui-v0.9.jsonl");
  const cases = [
    ["empty payload", "", "VALIDATION_FAILED", /empty/],
    ["not JSON", "{nope", "VALIDATION_FAILED", /not JSON/],
    ["v0.8 message", jsonl([{ surfaceUpdate: { surfaceId: "s", components: [] } }]), "VALIDATION_FAILED", /v0\.8/],
    ["unknown version", edit((m) => m.forEach((x) => (x.version = "2.0"))), "VALIDATION_FAILED", /version must be/],
    ["mixed versions", edit((m) => { m[3].version = "v0.9"; }), "VALIDATION_FAILED", /mixes/],
    ["two message types", edit((m) => { m[0].deleteSurface = { surfaceId: "auth_pr" }; }), "VALIDATION_FAILED", /exactly one/],
    ["basic catalog", edit((m) => { m[0].createSurface.catalogId = "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json"; }), "VALIDATION_FAILED", /catalogId must be/],
    ["v1.0 theme", edit((m) => { m[0].createSurface.theme = { primaryColor: "#f00" }; }), "VALIDATION_FAILED", /must not carry theme/],
    ["update before create", edit((m) => { m.shift(); }), "INTEGRITY_ERROR", /before its createSurface/],
    ["duplicate surface", edit((m) => { m.push(m[0]); }), "INTEGRITY_ERROR", /already exists/],
    ["deleted surface", edit((m) => { m.push({ version: "1.0", deleteSurface: { surfaceId: "auth_pr" } }); }), "VALIDATION_FAILED", /no surface/],
    ["two surfaces", edit((m) => { m.push({ version: "1.0", createSurface: { surfaceId: "other", catalogId: A2UI_CATALOG_ID } }); }), "VALIDATION_FAILED", /2 surfaces/],
    ["unknown component", edit((m) => { m[1].updateComponents.components[2].component = "Video"; }), "VALIDATION_FAILED", /not in the ephemeral-ui catalog/],
    ["unknown property", edit((m) => { m[1].updateComponents.components[2].onClick = "x"; }), "VALIDATION_FAILED", /onClick is not allowed/],
    ["v1.0 id with a hyphen", edit((m) => { m[1].updateComponents.components[2].id = "pr-card"; m[1].updateComponents.components[1].children[0] = "pr-card"; }), "VALIDATION_FAILED", /not a valid component id/],
    ["no root", edit((m) => { m[1].updateComponents.components[0].id = "top"; }), "VALIDATION_FAILED", /no component with id "root"/],
    ["missing child", edit((m) => { m[1].updateComponents.components[1].children.push("ghost"); }), "VALIDATION_FAILED", /child "ghost"/],
    ["cycle", edit((m) => { m[1].updateComponents.components[1].children.push("prs"); }), "INTEGRITY_ERROR", /appears twice/],
    ["orphan component", edit((m) => { m[1].updateComponents.components.push({ id: "spare", component: "EphemeralCard", kind: "ci" }); }), "VALIDATION_FAILED", /not reachable/],
    ["bare card root", edit((m) => { m[1].updateComponents.components = [{ id: "root", component: "EphemeralCard", kind: "ci" }]; }), "VALIDATION_FAILED", /bare EphemeralCard/],
    ["card directly under Board", edit((m) => { m[1].updateComponents.components[0].children = ["ci_card"]; m[1].updateComponents.components.splice(1, 2); }), "VALIDATION_FAILED", /must be EphemeralCards/],
    ["template children", edit((m) => { m[1].updateComponents.components[1].children = { componentId: "pr_card", path: "/prs" }; }), "VALIDATION_FAILED", /templates are not supported/],
    ["missing required prop", edit((m) => { delete m[1].updateComponents.components[0].summary; }), "VALIDATION_FAILED", /Board\.summary is required/],
    ["unresolved binding", edit((m) => { m.splice(2, 1); }), "VALIDATION_FAILED", /data binding \/pr is not in the data model/],
    ["v0.9 binding in a v1.0 stream", edit((m) => { m[1].updateComponents.components[2].input = { path: "/pr" }; }), "VALIDATION_FAILED", /binds data with "@path"/],
    ["function call", edit((m) => { m[1].updateComponents.components[0].title = { "@call": "formatString", args: { value: "x" } }; }), "VALIDATION_FAILED", /function calls are not allowed/],
    ["non-string title", edit((m) => { m[1].updateComponents.components[0].title = 7; }), "VALIDATION_FAILED", /title must be a string/],
    ["bad JSON Pointer", edit((m) => { m[2].updateDataModel.path = "pr"; }), "VALIDATION_FAILED", /JSON Pointer/],
    ["v0.9 components in createSurface", edit((m) => { m[0].createSurface.components = []; }, v09), "VALIDATION_FAILED", /v1\.0 only/],
  ];
  for (const [name, input, code, re] of cases) {
    assert.throws(() => fromA2UI(input), (e) => { assert.ok(e instanceof A2UIError, `${name}: ${e}`); assert.equal(e.code, code, name); assert.match(e.message, re, name); return true; }, name);
  }
  const e = (() => { try { parseA2UI(edit((m) => { m.shift(); })); } catch (x) { return x; } })();
  assert.deepEqual(e.toMessage(), { version: "1.0", error: { code: "INTEGRITY_ERROR", message: e.message, surfaceId: "auth_pr" } });
});

test("a bad card is rejected the same way from OpenUI Lang and A2UI", async () => {
  const bad = [
    ["unknown kind", (c) => { c.kind = "rocket"; }, /cards\[0\]\.kind rocket is not a card\.v0 kind/],
    ["input on a sample-data kind", (c) => { c.kind = "ci"; }, /ci draws sample data and takes no input/],
    ["input fails appInput", (c) => { c.input.number = 0; }, /cards\[0\]\.input\.number is out of range/],
    ["input breaks a merge rule", (c) => { c.input.state = "ready"; c.input.conflicts = 0; }, /ready needs every check passed/],
    ["unknown app", (c) => { c.app = "not-an-app"; }, /app not-an-app is not a catalog app/],
    ["extra input field", (c) => { c.input.secret = "x"; }, /input\.secret is not allowed/],
  ];
  const lit = (v) => (Array.isArray(v) ? `[${v.map(lit).join(", ")}]` : v && typeof v === "object" ? `{${Object.entries(v).map(([k, x]) => `${k}: ${lit(x)}`).join(", ")}}` : JSON.stringify(v));
  for (const [name, f, re] of bad) {
    const card = { kind: "merge", app: "github", input: structuredClone(PR) }; f(card);
    const openui = `root = EphemeralCards("x", [${lit(card)}])`;
    const a2ui = jsonl([{ version: "1.0", createSurface: { surfaceId: "s", catalogId: A2UI_CATALOG_ID, dataModel: { card: card.input }, components: [{ id: "root", component: "EphemeralCards", title: "x", children: ["c"] }, { id: "c", component: "EphemeralCard", kind: card.kind, app: card.app, input: { "@path": "/card" } }] } }]);
    const msg = async (p) => { try { await p(); } catch (e) { return e.message; } return null; };
    const [mo, ma] = [await msg(() => fromOpenUI(openui)), await msg(() => fromA2UI(a2ui))];
    assert.match(mo ?? "", re, `openui ${name}`); assert.match(ma ?? "", re, `a2ui ${name}`);
    assert.equal(mo.replace(/^openui: /, ""), ma.replace(/^a2ui: /, ""), name);
  }
  for (const [name, text, re] of [["incomplete", 'root = Board("x", "y", [cards', /incomplete|unresolved/], ["no cards", 'root = EphemeralCards("x", [])', /need 1\.\.12 cards/], ["13 cards", `root = EphemeralCards("x", [${Array(13).fill('{kind: "ci"}').join(", ")}])`, /need 1\.\.12 cards, got 13/]])
    await assert.rejects(fromOpenUI(text), re, name);
  assert.throws(() => normalize({ cards: [{ kind: "ci", onClick: "x" }] }), /onClick is not a card\.v0 field/);
});
