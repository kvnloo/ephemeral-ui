// EU-017: every health source (Apple Health, Google Fit, Oura, WHOOP, NOOP, MyFitnessPal, Lifesum) has its own
// synthetic payload, and its card shows that payload's values, units and provenance, not a shared demo.
// The browser test (skipped without EUI_BROWSER_URL) opens each app on the site and checks the same in Chromium:
//   python3 -m http.server 8765 --directory src &
//   EUI_BROWSER_URL=http://localhost:8765 PLAYWRIGHT_FROM=/path/to/dir/with/node_modules/ node --test tools/health.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { kinds, render, setup } from "./card-catalog.mjs";
import { HEALTH_SOURCES, HEALTH_FAMILIES, HEALTH_MERGE, fmtValue } from "../src/js/health-data.js";

const SEVEN = ["apple-health", "google-fit", "oura", "whoop", "noop", "myfitnesspal", "lifesum"];
const catalog = JSON.parse(fs.readFileSync(new URL("../catalog/catalog.json", import.meta.url), "utf8"));
const unitText = (u) => (u.startsWith("/") ? u : ` ${u}`);
await setup();
const click = (el) => el.dispatchEvent(new globalThis.window.Event("click", { bubbles: true }));

test("the seven sources each have a distinct payload in exactly one family", () => {
  assert.deepEqual(Object.keys(HEALTH_SOURCES).sort(), [...SEVEN].sort());
  assert.deepEqual(Object.values(HEALTH_FAMILIES).flat().sort(), [...SEVEN].sort());
  const sigs = SEVEN.map((id) => JSON.stringify([HEALTH_SOURCES[id].headline, HEALTH_SOURCES[id].metrics, HEALTH_SOURCES[id].provenance]));
  assert.equal(new Set(sigs).size, 7, "two sources share a payload");
  for (const id of SEVEN) {
    const s = HEALTH_SOURCES[id];
    assert.equal(HEALTH_FAMILIES[s.family].includes(id), true, id);
    assert.ok(s.provenance.via && s.provenance.device && s.provenance.records.length >= 4, `${id}: provenance`);
    assert.match(s.provenance.device, /synthetic/, `${id}: device must say it is synthetic`);
    for (const m of [s.headline, ...s.metrics]) {
      assert.ok(Number.isFinite(m.value) && m.unit, `${id}/${m.label}: value + unit`);
      assert.ok(s.provenance.records.includes(m.field) || m.field === s.headline.field, `${id}/${m.label}: field ${m.field} is not a listed record`);
    }
    assert.equal(s.series.points.length, 7, `${id}: 7-day series`);
  }
});

test("the catalog has a health card fixture for every source, drawn from that source", () => {
  const got = {};
  for (const k of catalog.kinds.filter((k) => /^health-/.test(k.kind))) for (const f of k.fixtures) got[f.card.app] = [k.kind, f.props];
  assert.deepEqual(Object.keys(got).sort(), [...SEVEN].sort());
  for (const id of SEVEN) {
    const [kind, props] = got[id], s = HEALTH_SOURCES[id];
    assert.equal(kind, `health-${s.family}`);
    assert.equal(props.source, id);
    assert.equal(props.data, "synthetic");
    assert.deepEqual(props.provenance, JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(s.provenance).sort()))));
  }
});

for (const id of SEVEN) {
  test(`${id}: the card shows its own values, units and provenance`, async () => {
    const s = HEALTH_SOURCES[id], kind = `health-${s.family}`;
    const { list } = await kinds();
    const c = await render({ seed: id + kind, card: { kind, app: id } }, list.get(kind).def);
    const el = c.el, q = (sel) => el.querySelector(sel);
    try {
      assert.equal(c.spec.source, id);
      assert.equal(q(".hs-big").getAttribute("data-field"), s.headline.field);
      assert.equal(q(".hs-big .hs-v").textContent, fmtValue(s.headline.value));
      assert.equal(q(".hs-big .hs-u").textContent, unitText(s.headline.unit));
      const rows = [...el.querySelectorAll(".hs-m")];
      assert.equal(rows.length, s.metrics.length);
      s.metrics.forEach((m, i) => {
        assert.equal(rows[i].getAttribute("data-field"), m.field);
        assert.equal(rows[i].querySelector(".hs-l").textContent, m.label);
        assert.equal(rows[i].querySelector(".hs-v").textContent, fmtValue(m.value));
        assert.equal(rows[i].querySelector(".hs-u").textContent, unitText(m.unit));
      });
      assert.ok(q(".hs-via").textContent.includes(s.provenance.via));
      assert.ok(q(".hs-via").textContent.startsWith(s.name));
      assert.ok(q(".hs-dev").textContent.includes(s.provenance.device) && q(".hs-dev").textContent.includes(s.day));
      assert.deepEqual([...el.querySelectorAll(".hs-recs code")].map((x) => x.textContent), s.provenance.records);
      assert.equal(!!q(".hs-note"), !!s.provenance.note);
      assert.match(q(".hs-syn").textContent, /Synthetic/);
      assert.equal(q(".hs-src").textContent, `source: ${s.name}`);
      // other sources' numbers never leak in
      for (const other of SEVEN.filter((o) => o !== id)) assert.ok(!el.textContent.includes(HEALTH_SOURCES[other].provenance.via), `${id} shows ${other}'s provenance`);
      // tap a metric with a raw unit (or the first): its record type and the source's own unit appear
      const mi = Math.max(0, s.metrics.findIndex((m) => m.raw));
      click(rows[mi]);
      assert.equal(rows[mi].getAttribute("aria-pressed"), "true");
      assert.ok(q(".hs-why").textContent.includes(s.metrics[mi].field));
      if (s.metrics[mi].raw) assert.ok(q(".hs-why").textContent.includes(`${fmtValue(s.metrics[mi].raw.value)} ${s.metrics[mi].raw.unit}`));
      // tap a day of the series: the readout is that day's value
      click(el.querySelectorAll(".hs-day")[2]);
      assert.equal(q(".hs-read").textContent, `Wed · ${fmtValue(s.series.points[2])}${unitText(s.series.unit)}`);
    } finally { el.remove(); }
  });
}

test("the merged health brief lists each app's own source set, not the same four", async () => {
  const { list } = await kinds();
  const seen = new Set();
  for (const id of SEVEN) {
    const c = await render({ seed: id + "health", card: { kind: "health", app: id } }, list.get("health").def);
    assert.deepEqual(c.spec.sources, HEALTH_MERGE[id]);
    assert.equal(c.spec.sources[0], id);
    assert.deepEqual(new Set(c.spec.sources.map((s) => HEALTH_SOURCES[s].family)).size, 3, `${id}: one source per family`);
    assert.deepEqual([...c.el.querySelectorAll(".hl-src span")].map((x) => x.textContent), HEALTH_MERGE[id].map((s) => HEALTH_SOURCES[s].name));
    assert.equal(c.el.querySelector(".hl-src .on").textContent, HEALTH_SOURCES[id].name);
    seen.add(JSON.stringify(c.spec.sources));
    c.el.remove();
  }
  assert.equal(seen.size, 7);
});

test("headless Chromium: each app's drawer mounts its source card with its own values and provenance", { skip: !process.env.EUI_BROWSER_URL }, async () => {
  const { createRequire } = await import("node:module");
  const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM)("playwright");
  const browser = await chromium.launch({ headless: true, ...(process.env.EUI_CHROMIUM ? { executablePath: process.env.EUI_CHROMIUM } : {}) });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
      await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.fulfill({ status: 200, body: "", contentType: "text/css" }));
      for (const id of SEVEN) {
        const s = HEALTH_SOURCES[id];
        await page.goto("about:blank"); // a hash-only change would not reload the site
        await page.goto(`${process.env.EUI_BROWSER_URL}/#app=${id}`);
        await page.waitForSelector("html.ready");
        const card = page.locator(`#drawer .eu-card[data-kind="health-${s.family}"]`);
        await card.waitFor();
        await card.scrollIntoViewIfNeeded();
        const got = await card.evaluate((el) => ({ big: el.querySelector(".hs-big").textContent, via: el.querySelector(".hs-via").textContent, recs: [...el.querySelectorAll(".hs-recs code")].map((x) => x.textContent),
          rows: [...el.querySelectorAll(".hs-m")].map((r) => [r.dataset.field, r.querySelector(".hs-v").textContent, r.querySelector(".hs-u").textContent]), overflow: el.scrollWidth > el.clientWidth + 1 }));
        assert.equal(got.big, fmtValue(s.headline.value) + unitText(s.headline.unit), `${id}@${width}`);
        assert.equal(got.via, `${s.name} · ${s.provenance.via}`);
        assert.deepEqual(got.recs, s.provenance.records);
        assert.deepEqual(got.rows, s.metrics.map((m) => [m.field, fmtValue(m.value), unitText(m.unit)]));
        assert.equal(got.overflow, false, `${id}@${width}: card overflows`);
        assert.doesNotMatch(await card.textContent(), /null|undefined|NaN/, `${id}@${width}: null/undefined/NaN in the card`);
        await card.locator(".hs-m").last().click();
        assert.ok((await card.locator(".hs-why").textContent()).includes(s.metrics.at(-1).field));
        const brief = await page.locator('#drawer .eu-card[data-kind="health"] .hl-src span').allTextContents();
        if (width > 720) assert.deepEqual(brief, HEALTH_MERGE[id].map((x) => HEALTH_SOURCES[x].name));
        if (process.env.EUI_SHOT_DIR) await card.screenshot({ path: `${process.env.EUI_SHOT_DIR}/health-${id}-${width}.png` });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
