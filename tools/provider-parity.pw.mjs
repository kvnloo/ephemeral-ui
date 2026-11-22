#!/usr/bin/env node
// Browser proof for tools/provider-parity.test.mjs: src/providers.html in real Chromium draws the canonical
// OpenUI Lang and A2UI fixtures (src/data/providers/) with the same kit modules. Per theme it asserts the same
// normalized spec, the same card DOM, the same computed theme tokens, the same eui:intent on the same clicks
// (plus the A2UI `action` message for each), rejection of invalid payloads, no page errors and no request
// leaving the origin (the vendored OpenUI parser's telemetry is opt-in and stays off).
//
//   PLAYWRIGHT_FROM=<dir with node_modules/playwright>/package.json [CHROMIUM=<chrome binary>] \
//     node tools/provider-parity.pw.mjs [--url http://127.0.0.1:<port>/] [--out out/provider-parity]
// Without --url it serves src/ itself with `python3 -m http.server --directory src` on a free port.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM ?? path.join(root, "package.json"))("playwright");
const out = path.resolve(arg("out", "out/provider-parity"));
fs.mkdirSync(out, { recursive: true });

let server = null, base = arg("url");
if (!base) {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
  server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", path.join(root, "src")], { stdio: "ignore" });
  base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 50; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
}
const origin = new URL(base).origin;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let passed = 0;
const ok = (name) => { passed++; console.log(`ok ${passed} - ${name}`); };
const TOKENS = ["--h-bg", "--h-fg", "--h-card", "--h-card-solid", "--h-border", "--h-primary", "--h-primaryFg", "--h-mutedFg", "--h-radius", "--h-font", "--a", "--a-ink", "--a-raw"];
const STYLES = ["color", "background-color", "border-top-color", "border-top-left-radius", "font-family", "font-size", "box-shadow"];
const strip = (x) => { const { at, ...r } = x; return r; };
const bgByTheme = {};

try {
  for (const theme of ["t3-light", "hermes-nous-dark"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [], foreign = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
    page.on("request", (r) => { const u = new URL(r.url()); if (u.origin !== origin && !/^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname)) foreign.push(r.url()); });
    await page.goto(`${base}providers.html#theme=${theme}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 20000 });
    await page.waitForTimeout(1500); // let both columns finish the same entrance animations
    const P = await page.evaluate(() => ({ specs: window.__providers.specs, errors: window.__providers.errors }));
    assert.deepEqual(P.errors, [], "page reported draw errors");
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.host + "/" + document.documentElement.dataset.scheme), theme === "t3-light" ? "t3/light" : "hermes/dark");
    ok(`${theme}: providers.html mounted both columns with no page errors`);

    assert.deepEqual(P.specs.a2ui, P.specs.openui);
    assert.equal(P.specs.openui.cards.length, 2);
    ok(`${theme}: OpenUI Lang and A2UI give the same normalized spec (${P.specs.openui.cards.map((c) => c.kind).join(", ")})`);

    const dom = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".pv-col")].map((c) => [c.dataset.provider,
      [...c.querySelectorAll(".pv-cell")].map((x) => { const y = x.cloneNode(true); y.removeAttribute("data-a2ui-component"); return y.outerHTML; })])));
    assert.equal(dom.openui.length, 2);
    assert.deepEqual(dom.a2ui, dom.openui);
    const texts = await page.evaluate(() => [...document.querySelectorAll('.pv-col[data-provider="a2ui"] .eu-card')].map((c) => c.textContent));
    assert.match(texts[0], /Refresh sessions in the auth middleware/); assert.match(texts[0], /#128 · feat\/session → main/); assert.match(texts[0], /main moved · 3 conflicts/);
    ok(`${theme}: card DOM is identical in both columns and shows the payload's PR (${dom.openui.reduce((n, s) => n + s.length, 0)} chars)`);

    const tok = await page.evaluate(([TOKENS, STYLES]) => Object.fromEntries([...document.querySelectorAll(".pv-col")].map((c) => [c.dataset.provider,
      [...c.querySelectorAll(".eu-card")].map((el) => { const s = getComputedStyle(el); return Object.fromEntries([...TOKENS.map((k) => [k, s.getPropertyValue(k).trim()]), ...STYLES.map((k) => [k, s.getPropertyValue(k)])]); })])), [TOKENS, STYLES]);
    assert.deepEqual(tok.a2ui, tok.openui);
    assert.ok(tok.openui[0]["--h-bg"] && tok.openui[0]["--a"], "tokens resolved");
    bgByTheme[theme] = tok.openui[0]["background-color"];
    ok(`${theme}: computed theme tokens match (${TOKENS.length} vars + ${STYLES.length} styles per card; card bg ${tok.openui[0]["background-color"]}, --a ${tok.openui[0]["--a"]})`);

    for (const p of ["openui", "a2ui"]) {
      await page.click(`.pv-col[data-provider="${p}"] .k-merge .eu-ttl`);
      await page.click(`.pv-col[data-provider="${p}"] .k-ci .gantt li:nth-child(4)`);
    }
    const ev = await page.evaluate(() => ({ intents: window.__providers.intents, actions: window.__providers.actions }));
    assert.equal(ev.intents.openui.length, 2);
    assert.deepEqual(ev.intents.a2ui.map(strip), ev.intents.openui.map(strip));
    assert.deepEqual(ev.intents.openui.map((d) => [d.kind, d.action, d.ids.join(",")]), [["merge", "pin", "card:merge"], ["ci", "select", "job:unit"]]);
    assert.equal(ev.actions.length, 2);
    for (const [i, a] of ev.actions.entries()) {
      const d = ev.intents.a2ui[i];
      assert.equal(a.version, "1.0");
      assert.deepEqual(Object.keys(a.action).sort(), ["context", "name", "sourceComponentId", "surfaceId", "timestamp", "userMessage"]);
      assert.equal(a.action.name, d.action); assert.equal(a.action.surfaceId, "auth_pr"); assert.equal(a.action.userMessage, d.label);
      assert.deepEqual(a.action.context, { kind: d.kind, app: d.app, ids: d.ids, entities: d.entities });
      assert.ok(!Number.isNaN(Date.parse(a.action.timestamp)));
    }
    assert.deepEqual(ev.actions.map((a) => a.action.sourceComponentId), ["pr_card", "ci_card"]);
    ok(`${theme}: same clicks give the same eui:intent in both columns (pin merge, select ci job) and A2UI action messages from pr_card, ci_card`);

    const bad = await page.evaluate(async () => {
      const good = (await (await fetch("data/providers/merge.a2ui.jsonl")).text()).trim().split("\n").map((l) => JSON.parse(l));
      const edit = (f) => { const m = structuredClone(good); f(m); return m.map((x) => JSON.stringify(x)).join("\n"); };
      const cases = {
        "a2ui unknown component": edit((m) => { m[1].updateComponents.components[2].component = "Video"; }),
        "a2ui wrong catalog": edit((m) => { m[0].createSurface.catalogId = "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json"; }),
        "a2ui missing binding": edit((m) => { m.splice(2, 1); }),
        "a2ui bad input": edit((m) => { m[2].updateDataModel.value.state = "ready"; m[2].updateDataModel.value.conflicts = 0; }),
        "a2ui v1.0 theme": edit((m) => { m[0].createSurface.theme = { primaryColor: "#f00" }; }),
        "openui unknown kind": 'root = EphemeralCards("x", [{kind: "rocket"}])',
        "openui incomplete": 'root = Board("x", "y", [cards',
      };
      return Object.fromEntries(Object.entries(cases).map(([k, t]) => [k, window.__providers.check(t)]));
    });
    for (const [k, r] of Object.entries(bad)) assert.equal(r.ok, false, `${k} was accepted`);
    ok(`${theme}: ${Object.keys(bad).length} invalid payloads rejected in the browser (${Object.entries(bad).map(([k, r]) => `${k}: ${r.error.slice(0, 48)}`).join(" | ")})`);

    assert.deepEqual(foreign, [], "requests left the origin");
    ok(`${theme}: no request left ${origin} (fonts aside)`);
    await page.screenshot({ path: path.join(out, `providers-${theme}.png`), fullPage: true });
    await page.close();
  }
  // The HTML export (tools/export-cards.mjs --program, the Tier 0 path every host gets) from each fixture.
  const ex = {};
  for (const [p, f] of [["openui", "merge.openui"], ["a2ui", "merge.a2ui.jsonl"]]) {
    const file = path.join(out, `export-${p}.html`);
    execFileSync(process.execPath, [path.join(root, "tools/export-cards.mjs"), "--program", path.join(root, "src/data/providers", f), "--theme", "hermes-nous", "--out", file]);
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const cards = await page.evaluate(() => [...document.querySelectorAll("#cards .xc-cell")].map((x) => { const y = x.cloneNode(true); y.removeAttribute("data-a2ui-component"); return y.outerHTML; }));
    await page.click(".k-merge .eu-ttl");
    ex[p] = { cards, errors, title: await page.title(), actions: await page.evaluate(() => window.__a2uiActions ?? null) };
    await page.close();
  }
  assert.deepEqual(ex.openui.errors, []); assert.deepEqual(ex.a2ui.errors, []);
  assert.equal(ex.openui.cards.length, 2); assert.deepEqual(ex.a2ui.cards, ex.openui.cards); assert.equal(ex.a2ui.title, ex.openui.title);
  assert.equal(ex.openui.actions, null);
  assert.deepEqual(ex.a2ui.actions.map((a) => [a.version, a.action.name, a.action.surfaceId, a.action.sourceComponentId]), [["1.0", "pin", "auth_pr", "pr_card"]]);
  ok(`export-cards --program: both exports mount the same 2 cards in Chromium; the A2UI export answers a pin with an A2UI action from pr_card`);
  assert.notEqual(bgByTheme["t3-light"], bgByTheme["hermes-nous-dark"]);
  ok(`tokens follow the host theme, not the payload (card bg ${bgByTheme["t3-light"]} vs ${bgByTheme["hermes-nous-dark"]})`);
  console.log(`# pass ${passed}\n# fail 0\n# screenshots ${path.relative(process.cwd(), out)}/providers-*.png`);
} catch (e) {
  console.log(`not ok ${passed + 1} - ${e.message}`); console.log(`# pass ${passed}\n# fail 1`); process.exitCode = 1;
} finally {
  await browser.close(); server?.kill();
}
