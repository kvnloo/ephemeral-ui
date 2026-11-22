// EU-025: the advanced kits. ACE campus twin (selectable zones with truth labels), workout form analysis (timed
// body landmarks + the corrections found in them) and tennis swing phases (scrub). Synthetic fixtures only.
// The browser test (skipped without EUI_BROWSER_URL) drives the same cards in Chromium on the site:
//   python3 -m http.server 8765 --directory src &
//   EUI_BROWSER_URL=http://localhost:8765 PLAYWRIGHT_FROM=/path/to/dir/with/node_modules/ node --test tools/kits.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { kinds, render, setup } from "./card-catalog.mjs";
import { ACE_FLOORS, ACE_ZONES, JOINTS, SQUAT, squatFrames, squatCorrections, SWING, SWING_PHASES, SWING_CONTACT, swingFrames } from "../src/js/ace-data.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../catalog/catalog.json", import.meta.url), "utf8"));
await setup();
const W = globalThis.window;
const click = (el) => el.dispatchEvent(new W.Event("click", { bubbles: true }));
const scrubTo = (el, i) => { el.value = String(i); el.dispatchEvent(new W.Event("input", { bubbles: true })); };
const mount = async (kind) => { const { list } = await kinds(); return render({ seed: "ace" + kind, card: { kind, app: "ace" } }, list.get(kind).def); };

test("the catalog lists the three kits with ACE fixtures", () => {
  for (const kind of ["ace-facility", "form-check", "swing"]) {
    const k = catalog.kinds.find((x) => x.kind === kind);
    assert.ok(k, `${kind} missing from catalog`);
    assert.equal(k.module, "src/js/kinds-k.js");
    assert.equal(k.site, true);
    assert.deepEqual(k.fixtures.map((f) => f.id), [`${kind}/ace`]);
    assert.equal(k.fixtures[0].props.kind, kind);
  }
});

test("ACE facility: every floor's zones are selectable and carry their truth label", async () => {
  const c = await mount("ace-facility"), el = c.el;
  const intents = []; el.addEventListener("eui:intent", (e) => intents.push(e.detail));
  try {
    const tabs = [...el.querySelectorAll(".ak-floor")];
    assert.deepEqual(tabs.map((t) => t.dataset.floor), ACE_FLOORS.map((f) => f.id));
    for (const f of ACE_FLOORS) {
      click(el.querySelector(`.ak-floor[data-floor="${f.id}"]`));
      assert.equal(el.querySelector('.ak-floor[aria-pressed="true"]').dataset.floor, f.id);
      assert.ok(el.querySelector(".ak-fhead").textContent.includes(f.title));
      const want = ACE_ZONES.filter((z) => z.floor === f.id);
      const zones = [...el.querySelectorAll(".ak-zone")];
      assert.deepEqual(zones.map((z) => z.dataset.zone), want.map((z) => z.id));
      for (const z of want) {
        const b = el.querySelector(`.ak-zone[data-zone="${z.id}"]`);
        click(b);
        assert.equal(b.getAttribute("aria-pressed"), "true");
        assert.equal(el.querySelectorAll('.ak-zone[aria-pressed="true"]').length, 1);
        const d = el.querySelector(".ak-detail");
        assert.ok(d.textContent.includes(z.label) && d.textContent.includes(z.truth) && d.textContent.includes(z.id), z.id);
        if (z.count) assert.equal(b.querySelectorAll(".ak-cells i").length, z.count);
        if (z.mock) { assert.ok(d.textContent.includes(`MOCK ${z.mock.inUse} of ${z.count}`), `${z.id}: mock occupancy is labelled`); assert.equal(b.querySelectorAll(".ak-cells i.on").length, z.mock.inUse); }
        assert.deepEqual(intents.at(-1).entities, { zone: [z.id] });
      }
    }
    assert.equal(intents.length, ACE_ZONES.length);
    assert.ok(ACE_ZONES.filter((z) => z.floor === "APEX").every((z) => z.truth === "VISION"), "APEX rooms are VISION, never SPEC");
    assert.doesNotMatch(el.textContent, /6\s*\/\s*6\s*\/\s*6/, "no invented court surface split");
    assert.deepEqual(c.spec.zones.map((z) => z.id), ACE_ZONES.map((z) => z.id));
  } finally { el.remove(); }
});

test("form analysis: landmarks are timed, and each correction is what the landmarks show", async () => {
  const frames = squatFrames(), fixes = squatCorrections(frames);
  assert.equal(frames.length, SQUAT.reps * SQUAT.repSeconds * SQUAT.fps);
  frames.forEach((f, i) => {
    assert.ok(Math.abs(f.t - i / SQUAT.fps) < 1e-3, `frame ${i} time`);
    assert.deepEqual(Object.keys(f.joints).sort(), [...JOINTS].sort());
    for (const [x, y] of Object.values(f.joints)) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `frame ${i} out of frame`);
  });
  assert.deepEqual(fixes.map((c) => [c.id, c.rep]), [["knee_valgus", 2], ["hip_lateral_shift", 3], ["depth_above_parallel", 3]]);
  // independent re-measure from the raw landmarks
  const at = (t) => frames.find((f) => Math.abs(f.t - t) < 1e-6).joints;
  const kneeRatio = (J) => Math.abs(J.left_knee[0] - J.right_knee[0]) / Math.abs(J.left_ankle[0] - J.right_ankle[0]);
  const v = fixes[0], s = fixes[1], d = fixes[2];
  assert.ok(kneeRatio(at(v.t0)) < 0.8 && kneeRatio(at(v.t1)) < 0.8, "valgus window shows knees inside the ankles");
  assert.ok(frames.filter((f) => f.rep === 1).every((f) => kneeRatio(f.joints) >= 0.8), "rep 1 is clean");
  const J = at(s.t0); assert.ok(Math.abs((J.left_hip[0] + J.right_hip[0]) / 2 - 0.5) > 0.02, "shift window starts off centre");
  const B = at(d.t0); assert.ok((B.left_hip[1] + B.right_hip[1]) / 2 < (B.left_knee[1] + B.right_knee[1]) / 2 - 0.02, "rep 3 bottom is above parallel");

  const c = await mount("form-check"), el = c.el;
  try {
    assert.deepEqual(c.spec.corrections, fixes);
    const scrub = el.querySelector(".ak-scrub");
    assert.equal(+scrub.getAttribute("max"), frames.length - 1);
    fixes.forEach((fx, i) => {
      click(el.querySelector(`.ak-fix[data-i="${i}"]`));
      const fi = frames.findIndex((f) => f.t >= fx.t0 - 1e-9);
      assert.equal(+scrub.value, fi, `${fx.id}: jumps to its first frame`);
      assert.ok(el.querySelector(".ak-read .ak-t").textContent === `${frames[fi].t.toFixed(2)} s`);
      const hot = [...el.querySelectorAll(".ak-joint.hot")].map((x) => x.getAttribute("data-joint"));
      for (const j of fx.joints) assert.ok(hot.includes(j), `${fx.id}: ${j} highlighted`);
      assert.ok(el.querySelector(".ak-cue").textContent.includes(fx.cue));
      // the drawn joints are the landmarks of that frame
      const knee = el.querySelector('.ak-joint[data-joint="left_knee"]');
      assert.equal(+knee.getAttribute("cx"), frames[fi].joints.left_knee[0] * 100);
    });
    click(el.querySelector('.ak-mark[data-i="0"]'));
    assert.equal(+scrub.value, frames.findIndex((f) => f.t >= fixes[0].t0 - 1e-9), "timeline marker jumps too");
    scrubTo(scrub, 15); // rep 1 bottom: clean
    assert.equal(el.querySelectorAll(".ak-joint.hot").length, 0);
    assert.match(el.querySelector(".ak-read").textContent, /clean/);
  } finally { c.el.remove(); }
});

test("tennis swing: phases tile the swing, scrubbing tracks them and the speed peaks at contact", async () => {
  const frames = swingFrames();
  assert.equal(frames.length, Math.round(SWING.seconds * SWING.fps));
  assert.equal(SWING_PHASES[0].t0, 0); assert.equal(SWING_PHASES.at(-1).t1, SWING.seconds);
  SWING_PHASES.slice(1).forEach((p, i) => assert.equal(p.t0, SWING_PHASES[i].t1, `${p.id} starts where ${SWING_PHASES[i].id} ends`));
  const peak = frames.reduce((p, f) => (f.speedKmh > p.speedKmh ? f : p));
  assert.equal(peak.phase, "forward_swing");
  assert.ok(Math.abs(peak.t - SWING_CONTACT) <= 2 / SWING.fps, `peak at ${peak.t}, contact ${SWING_CONTACT}`);
  assert.ok(peak.speedKmh >= 60 && peak.speedKmh <= 180, `plausible racket-head speed ${peak.speedKmh}`);

  const c = await mount("swing"), el = c.el;
  try {
    const scrub = el.querySelector(".ak-scrub");
    assert.equal(+scrub.value, frames.findIndex((f) => f.t >= SWING_CONTACT - 1e-9), "opens on the contact frame");
    assert.match(el.querySelector(".ak-read").textContent, /contact/);
    for (let i = 0; i < frames.length; i += 7) {
      scrubTo(scrub, i);
      const want = SWING_PHASES.find((p) => frames[i].t >= p.t0 && frames[i].t < p.t1);
      assert.equal(el.querySelector('.ak-phase[aria-pressed="true"]').dataset.phase, want.id, `t=${frames[i].t}`);
      assert.equal(el.querySelector(".ak-ph").textContent, want.label);
      assert.ok(el.querySelector(".ak-read").textContent.includes(`${frames[i].speedKmh} km/h`));
      assert.equal(+el.querySelector(".ak-tip").getAttribute("cx"), frames[i].joints.racket_tip[0] * 100);
    }
    for (const p of SWING_PHASES) {
      click(el.querySelector(`.ak-phase[data-phase="${p.id}"]`));
      assert.ok(Math.abs(frames[+scrub.value].t - p.t0) < 1 / SWING.fps, `${p.id}: jumps to its start`);
      assert.equal(el.querySelector('.ak-phase[aria-pressed="true"]').dataset.phase, p.id);
    }
    assert.deepEqual(c.spec.peak, { t: peak.t, speedKmh: peak.speedKmh, phase: peak.phase });
  } finally { c.el.remove(); }
});

test("headless Chromium: the ACE drawer mounts all three kits and they respond", { skip: !process.env.EUI_BROWSER_URL }, async () => {
  const { createRequire } = await import("node:module");
  const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM)("playwright");
  const browser = await chromium.launch({ headless: true, ...(process.env.EUI_CHROMIUM ? { executablePath: process.env.EUI_CHROMIUM } : {}) });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
      await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.fulfill({ status: 200, body: "", contentType: "text/css" }));
      await page.goto(`${process.env.EUI_BROWSER_URL}/#app=ace`);
      await page.waitForSelector("html.ready");
      const card = (k) => page.locator(`#drawer .eu-card[data-kind="${k}"]`);
      for (const k of ["ace-facility", "form-check", "swing"]) await card(k).waitFor();
      const noOverflow = async (k) => {
        assert.equal(await card(k).evaluate((el) => el.scrollWidth > el.clientWidth + 1), false, `${k}@${width} overflows`);
        assert.doesNotMatch(await card(k).textContent(), /null|undefined|NaN/, `${k}@${width}: null/undefined/NaN in the card` /* substring: "zone_poolnull" has no word boundary */);
      };
      // ACE: pick the APEX wing, then the pool
      const ace = card("ace-facility");
      await ace.locator('.ak-floor[data-floor="APEX"]').click();
      assert.equal(await ace.locator(".ak-zone").count(), ACE_ZONES.filter((z) => z.floor === "APEX").length);
      await ace.locator('.ak-zone[data-zone="zone_pool"]').click();
      assert.match(await ace.locator(".ak-detail").textContent(), /Pool\s*VISION/);
      await noOverflow("ace-facility");
      if (process.env.EUI_SHOT_DIR) await ace.screenshot({ path: `${process.env.EUI_SHOT_DIR}/ace-facility-${width}.png` });
      // form: the valgus correction highlights both knees on its frame
      const form = card("form-check");
      await form.scrollIntoViewIfNeeded();
      await form.locator('.ak-fix[data-i="0"]').click();
      assert.deepEqual((await form.locator(".ak-joint.hot").evaluateAll((els) => els.map((e) => e.dataset.joint))).sort(), ["left_knee", "right_knee"]);
      await form.locator(".ak-scrub").fill("15");
      assert.match(await form.locator(".ak-read").textContent(), /1\.00 s.*clean/);
      await noOverflow("form-check");
      if (process.env.EUI_SHOT_DIR) { await form.locator('.ak-fix[data-i="0"]').click(); await form.screenshot({ path: `${process.env.EUI_SHOT_DIR}/form-check-${width}.png` }); }
      // swing: scrub to the backswing, then jump to follow-through
      const sw = card("swing");
      await sw.scrollIntoViewIfNeeded();
      await sw.locator(".ak-scrub").fill("36");
      assert.equal(await sw.locator(".ak-ph").textContent(), "Backswing");
      await sw.locator('.ak-phase[data-phase="follow_through"]').click();
      assert.equal(await sw.locator(".ak-ph").textContent(), "Follow-through");
      assert.equal(await sw.locator('.ak-phase[aria-pressed="true"]').getAttribute("data-phase"), "follow_through");
      await noOverflow("swing");
      if (process.env.EUI_SHOT_DIR) { await sw.locator('.ak-phase[data-phase="forward_swing"]').click(); await sw.locator(".ak-scrub").fill(String(Math.round(SWING_CONTACT * SWING.fps))); await sw.screenshot({ path: `${process.env.EUI_SHOT_DIR}/swing-${width}.png` }); }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
