// Host profiles (src/data/hosts.json) for the host preview and the #hosts matrix: every harness has a
// profile, a skin in themes.json and a declared tier; simulations stay labelled; bridges match their hosts.
// The browser proof is tools/host-matrix.browser.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { contrast, over } = await import("../src/js/themes.js");
const { translate, themeFor, profileOf } = await import("../src/js/host-bridge.js");

const file = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const data = JSON.parse(file("../src/data/hosts.json"));
const themesFile = file("../src/data/themes.json");
const themes = JSON.parse(themesFile).themes;
const surfaces = JSON.parse(file("../integration/surfaces.json")).surfaces;
const glide = JSON.parse(file("../theme/glide.json"));
const REQUIRED = ["t3", "hermes", "tern", "chatgpt", "codex", "claude", "o8"];
const NEW = ["tern", "o8", "chatgpt", "codex", "claude"];
const byId = (id) => themes.find((t) => t.id === id);
const intent = { v: 0, kind: "merge", app: "github", action: "pin", label: "Keep this card", ids: ["card:merge"], entities: { card: "merge" }, at: 1 };

test("every harness EU-006 names has one host profile", () => {
  const ids = data.hosts.map((h) => h.id);
  assert.deepEqual([...ids].sort(), [...REQUIRED].sort());
  assert.equal(new Set(ids).size, ids.length);
});

test("each profile wears a light and a dark theme of its own host", () => {
  for (const p of data.hosts) for (const scheme of ["light", "dark"]) {
    const t = byId(p.themes[scheme]);
    assert.ok(t, `${p.id}.${scheme}: ${p.themes[scheme]} in themes.json`);
    assert.equal(t.host, p.id, `${t.id}.host`);
    assert.equal(t.scheme, scheme, `${t.id}.scheme`);
    assert.equal(!!t.approx, p.skin === "approx", `${t.id}: approx flag matches the profile's skin`);
    assert.equal(themeFor(p, scheme), t.id);
    assert.equal(profileOf(data.hosts, t), p);
  }
});

test("every preview is a simulation; native receipts only point at recorded ones", () => {
  for (const p of data.hosts) {
    assert.equal(p.preview, "simulation", p.id);
    assert.ok([0, 1, 2].includes(p.tier.level) && data.tiers[p.tier.level] && p.tier.how, `${p.id}.tier`);
    assert.ok(p.sources.length > 0 && p.surface && p.bridge.label, `${p.id}: sources, surface, bridge`);
    if (p.receipt === null) continue;
    const [f, id] = p.receipt.ref.split("#");
    assert.equal(f, "integration/surfaces.json", `${p.id}.receipt.ref`);
    const s = surfaces.find((x) => x.id === id);
    assert.ok(s, `${p.id}: surfaces.json has ${id}`);
    assert.match(s.status, /tier2|verified/, `${p.id}: the recorded surface has a native/verified status`);
  }
  // none expected from the closed hosts or from this kit's own previews
  for (const id of ["chatgpt", "codex", "claude", "o8", "hermes"]) assert.equal(data.hosts.find((h) => h.id === id).receipt, null, id);
});

test("themes.json is what tools/themes.py generates", (t) => {
  const r = spawnSync("python3", ["tools/themes.py", "tools/vendor/hermes-themes.json"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  if (r.error) return t.skip("python3 not found");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, themesFile);
});

test("Tern · Glide wears the shared theme file unchanged", () => {
  for (const scheme of ["light", "dark"]) {
    const t = byId(`tern-glide-${scheme}`);
    for (const k of ["bg", "fg", "card", "muted", "mutedFg", "border", "primary", "primaryFg", "success", "warning", "danger"]) assert.equal(t[k], glide.color[scheme][k], `${t.id}.${k}`);
    assert.equal(t.radius, glide.radius.base);
    assert.equal(t.font, glide.type.family.sans);
  }
});

test("new host skins keep text readable: fg and mutedFg 4.5:1, primaryFg on primary 3:1", () => {
  for (const t of themes.filter((x) => NEW.includes(x.host))) {
    const card = over(t.card, t.bg);
    assert.ok(contrast(t.fg, t.bg) >= 4.5, `${t.id} fg/bg ${contrast(t.fg, t.bg).toFixed(2)}`);
    assert.ok(contrast(t.mutedFg, card) >= 4.5, `${t.id} mutedFg/card ${contrast(t.mutedFg, card).toFixed(2)}`);
    assert.ok(contrast(t.primaryFg, t.primary) >= 3, `${t.id} primaryFg/primary ${contrast(t.primaryFg, t.primary).toFixed(2)}`);
  }
});

test("bridges carry a pin the way each host's contract does", () => {
  const host = (id) => data.hosts.find((h) => h.id === id);
  assert.equal(translate(host("hermes"), intent), null, "tier 0: no channel back");
  for (const id of ["chatgpt", "codex", "claude"]) {
    const m = translate(host(id), intent, { id: 7 }).message;
    assert.equal(m.jsonrpc, "2.0");
    assert.equal(m.id, 7);
    assert.equal(m.method, "ui/update-model-context", id);
    assert.deepEqual(m.params.structuredContent.euiIntent, intent);
    assert.equal(m.params.content[0].type, "text");
  }
  const o = translate(host("o8"), intent, { nonce: "n1" }).message;
  assert.equal(o.type, "o8-visualization:question");
  assert.equal(o.nonce, "n1");
  assert.ok(typeof o.value === "string" && o.value.trim() && o.value.length <= 4000);
  assert.ok(translate(host("o8"), { ...intent, label: "x".repeat(5000) }).message.value.length <= 4000);
  assert.deepEqual(translate(host("tern"), intent).message.send, { v: 0, kind: "merge", app: "github", action: "pin", ids: ["card:merge"], entities: { card: "merge" } });
  assert.deepEqual(translate(host("t3"), intent).message, { type: "eui:intent", detail: intent });
  for (const p of data.hosts) assert.equal(translate(p, null), null, `${p.id}: no intent, no message`);
});

test("the site wires the picker, the matrix and the frame page", () => {
  const html = file("../src/index.html"), main = file("../src/js/main.js"), frame = file("../src/host-frame.html");
  assert.match(html, /<section id="hosts"[^>]*>/);
  assert.match(html, /<a href="#hosts">Hosts<\/a>/);
  assert.match(html, /<div class="hostpick" role="group" aria-label="Host \(simulated\)"><\/div>/);
  assert.match(main, /fetch\("data\/hosts\.json"\)/);
  assert.match(main, /from "\.\/host-bridge\.js"/);
  assert.match(frame, /<script type="module" src="js\/host-frame\.js"><\/script>/);
  assert.ok(data.fixture.app && data.fixture.kind && data.fixture.seed === data.fixture.app + data.fixture.kind, "fixture seed is what makeCard uses");
});
