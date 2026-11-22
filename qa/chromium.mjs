// Reference catalog fixtures, isolated from gallery autoplay. Drives real Chromium input.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { catalog as generated, pages as deployed, inventory, widths } from "../tools/qa-inventory.mjs";

const catalog = generated.kinds;
const base = process.env.QA_URL;
assert.ok(base, "QA_URL must point at the static server serving src/");
const pages = process.env.QA_PAGES_URL;
const rows = inventory().kinds;
const infra = Object.entries(deployed.fixtures).filter(([kind]) => !catalog.some(k => k.kind === kind)).map(([kind, app]) => ({
  kind, module: deployed.module, export: "KINDS_INFRA",
  fixtures: [{ id: kind, card: { app } }],
}));
if (!pages && infra.length) console.log("Pages receipts omitted: set QA_PAGES_URL to verify the pinned Pages tree.");
if (pages) {
  const response = await fetch(pages + "/" + deployed.module);
  assert.ok(response.ok, "Pages module response");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(bytes).digest("hex"), deployed.moduleSha256, "serve the pinned Pages revision");
}
const controls = "button, a[href], input, select, textarea, summary, [role=button], [role=option], [tabindex]";
const failures = [];
let count = 0;
const browser = await chromium.launch({
  executablePath: process.env.QA_CHROMIUM,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  for (const [url, entries] of [[base, catalog], [pages, infra]]) {
    if (!url) continue;
    const html = await fetch(url).then(r => r.text());
    const css = [...html.matchAll(/<link rel="stylesheet" href="([^":]+\.css)"[^>]*>/g)].map(([tag]) => tag);
    // The public gallery does not mount these native-host kinds, but the kit ships their CSS.
    if (url === base) for (const sheet of ["cua.css", "dock.css", "gev.css"]) {
      const tag = `<link rel="stylesheet" href="${sheet}">`;
      if (!css.includes(tag)) css.push(tag);
    }
    for (const width of widths.map(Number)) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      await context.route("**/*", route => route.request().url().startsWith(url + "/") ? route.continue() : route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(2000);
      let errors = [];
      page.on("pageerror", err => errors.push(err.message));
      page.on("console", msg => {
        if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) errors.push(msg.text());
      });
      await page.route(url + "/__qa", r => r.fulfill({ contentType: "text/html", body:
        '<!doctype html><meta charset="utf-8">' + css.join("") + '<main id="fixture" style="margin:12px;max-width:720px"></main><div id="pinslot"></div>' }));
      await page.goto(url + "/__qa");
      assert.ok(await page.evaluate(() => document.createElement("canvas").getContext("webgl2") !== null), "WebGL2 required");
      if (url === pages) assert.deepEqual(
        await page.evaluate(async module => Object.keys((await import("/" + module)).KINDS_INFRA).sort(), deployed.module),
        Object.keys(deployed.fixtures).sort(), "Pages manifest drift (serve the pinned revision)");
      await page.evaluate(async () => {
        const [{ loadThemes }, { loadApps, catalog }, { rng }] = await Promise.all([
          import("/js/themes.js"), import("/js/shell.js"), import("/js/motion.js"),
        ]);
        await Promise.all([loadThemes(), loadApps()]);
        window.mount = async (entry, fixture) => {
          // The gallery's lightbox lives outside the card; clear it when replacing the fixture.
          document.querySelectorAll("body > .gl-lb").forEach(el => el.remove());
          const mod = await import("/" + entry.module.replace(/^src\//, ""));
          const { app, input } = fixture.card;
          const c = mod[entry.export][entry.kind].make(catalog.byId[app] || { id: app, name: app }, rng(fixture.seed || entry.kind), input);
          await c.done;
          document.querySelector("#fixture").replaceChildren(c.el);
          return c.spec.kind;
        };
        window.events = [];
        for (const type of ["eui:intent", "stats:event", "change"]) {
          document.addEventListener(type, e => events.push(e.detail?.action || e.detail?.type || type), true);
        }
      });
      for (const entry of entries) {
        const { kind } = entry;
        if (process.env.QA_KIND && !new RegExp(process.env.QA_KIND).test(kind)) continue;
        const expect = rows[kind].receipts[String(width)];
        const fixture = entry.fixtures.find(f => f.id === expect.fixture);
        const mount = async () => assert.equal(await page.evaluate(args => mount(...args), [entry, fixture]), kind);
        errors = [];
        try {
          assert.ok(fixture, "catalog fixture named by receipt");
          await mount();
          const layout = await page.locator("#fixture > *").evaluate(el => ({
            text: !!el.innerText.trim(),
            overflow: el.getBoundingClientRect().right > innerWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1,
          }));
          assert.ok(layout.text, "empty card");
          const canvas = page.locator("#fixture canvas.v3-cv").first();
          let webgl = false;
          if (await canvas.count()) {
            await canvas.scrollIntoViewIfNeeded();
            await page.waitForFunction(() => {
              const c = document.querySelector("#fixture canvas.v3-cv");
              const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
              for (let i = 4; i < data.length; i += 4) if (data[i + 3] && (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2])) return true;
              return false;
            }, null, { timeout: 7000 });
            webgl = true;
            if (await canvas.getAttribute("tabindex") === "0") {
              await canvas.evaluate(el => el.addEventListener("keydown", e => {
                if (e.defaultPrevented) el.dataset.qaOrbitKey = e.key;
              }, { once: true }));
              await canvas.press("ArrowRight");
              assert.equal(await canvas.getAttribute("data-qa-orbit-key"), "ArrowRight");
            }
          }
          const buttons = page.locator("#fixture").locator(controls);
          const candidates = await buttons.evaluateAll(els => els.map((e, index) => ({
            index, name: (e.getAttribute("aria-label") || e.innerText || e.title || e.getAttribute("placeholder") || "").trim().replace(/\s+/g, " "),
            enabled: !e.disabled && e.tabIndex >= 0 && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden",
            skip: e.matches(".pin, a[href], textarea, input:not([type=checkbox]):not([type=range])"),
          })).filter(e => e.enabled && !e.skip));
          const snapshot = () => page.evaluate(() => {
            const root = document.querySelector("#fixture");
            return { text: document.body.innerText, state: [...root.querySelectorAll("[aria-pressed],[aria-expanded],[aria-selected],input,select,details,[data-state]")].map(
              e => [e.getAttribute("aria-pressed"), e.getAttribute("aria-expanded"), e.getAttribute("aria-selected"), e.value, e.checked, e.open, e.dataset.state]), events: events.slice() };
          });
          async function exercise(candidate, pointer = false) {
            const b = buttons.nth(candidate.index);
            const isHold = await b.evaluate(e => e.classList.contains("hold"));
            const key = await b.evaluate(e => e.getAttribute("aria-label") === "Flythrough position" ? "ArrowRight" : e.matches("select,input[type=range]") ? "ArrowDown" : e.matches("input[type=checkbox]") ? "Space" : "Enter");
            await b.focus();
            assert.ok(await b.evaluate(e => e === document.activeElement), "could not focus control");
            const before = await snapshot();
            if (pointer) {
              if (await b.evaluate(e => e.matches("input[type=range]"))) {
                const box = await b.boundingBox();
                await b.click({ position: { x: Math.round(box.width * 0.72), y: Math.round(box.height / 2) } });
              } else if (key === "ArrowDown") {
                throw new Error("Native select needs a separate pointer scenario");
              } else if (await b.locator("circle").count() && kind === "graph") {
                await b.locator("circle").first().click();
              } else await b.click({ delay: isHold ? 1300 : 0, timeout: 1500 });
            } else await page.keyboard.press(key, { delay: isHold ? 1300 : 0 });
            const after = await snapshot();
            if (JSON.stringify(before.events) !== JSON.stringify(after.events)) return "event:" + after.events.at(-1);
            if (JSON.stringify(before.state) !== JSON.stringify(after.state)) return "control state changed";
            if (before.text !== after.text) return "visible text changed";
            return null;
          }
          assert.equal(webgl, expect.webgl, "WebGL frame");
          assert.equal(layout.overflow, expect.overflow, "layout overflow");
          const candidate = candidates.find(c => c.name === expect.control);
          assert.ok(candidate, "expected focusable control: " + expect.control);
          assert.equal(await exercise(candidate), expect.keyboard, "keyboard outcome");
          await mount();
          assert.equal(await exercise(candidate, true), expect.pointer, "control outcome");
          assert.deepEqual(errors, []);
          count++;
          console.log(`VERIFIED ${kind} ${width}px · ${expect.control} · keyboard=${expect.keyboard} · pointer=${expect.pointer}${webgl ? " · WebGL frame" : ""}`);
        } catch (e) {
          failures.push(`${kind} ${width}px: ${e.message}`);
        }
      }
      await context.close();
    }
  }
} finally { await browser.close(); }
if (failures.length) console.error(failures.join("\n"));
console.log(`${count} receipts verified, ${failures.length} failures`);
process.exitCode = failures.length ? 1 : 0;
