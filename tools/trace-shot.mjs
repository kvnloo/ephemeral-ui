// Real-browser checks for the trace cards and "Ask the trace":
//   node tools/trace-shot.mjs <url> <outdir> [--w 1440] [--theme t3-dark] [--tag d-t3]
// For each question: composed cards screenshot + interactions (timeline click → drawer, minimap scrub,
// tools row → span → timeline, errors jump, layer toggle). Then one screenshot per trace card kind.
// Prints a JSON report and page errors; exits 1 on any page error.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? "~/.t3/worktrees/t3code/experiment-openui-android-replay/apps/web/package.json");
const { chromium } = require("playwright");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const url = args[0] ?? "http://127.0.0.1:8793/";
const out = path.resolve(args[1] ?? "out/trace-shots");
fs.mkdirSync(out, { recursive: true });
const W = +opt("w", 1440), mobile = W < 600, theme = opt("theme", "t3-light"), tag = opt("tag", `${mobile ? "m" : "d"}-${theme}`);
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const page = await browser.newPage({ viewport: { width: W, height: mobile ? 915 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
const report = { theme, W, questions: [], kinds: {} };
const shot = async (name, loc) => { const p = path.join(out, `${tag}-${name}.png`); if (loc) await loc.screenshot({ path: p }); else await page.screenshot({ path: p }); return p; };
const settle = (ms = 900) => page.waitForTimeout(ms);
const QUESTIONS = (opt("q", "") || "").split("|").filter(Boolean);
const qs = QUESTIONS.length ? QUESTIONS : ["why was this session slow?", "which tools failed most this week?", "compare my last two Hermes sessions", "what did the subagents cost?", "what went wrong this month?", "where did the money go this week?"];
await page.goto(`${url}#theme=${theme}&ask=${encodeURIComponent(qs[0])}`);
await page.waitForFunction(() => document.documentElement.classList.contains("ready"), null, { timeout: 20000 });
for (const [i, q] of qs.entries()) {
  if (i) await page.evaluate((q) => window.__ask.ask(q), q);
  await page.waitForFunction(() => document.querySelectorAll("#askout .eu-card").length && ![...document.querySelectorAll("#askout .os-load")].length, null, { timeout: 20000 });
  await settle(1400);
  const r = await page.evaluate(() => ({ intent: window.__ask.st.plan.intent, layers: [...window.__ask.st.layers], cards: [...document.querySelectorAll("#askout .eu-card")].map((c) => c.dataset.kind), answer: document.querySelector("#askans p").innerText.slice(0, 400) }));
  const slug = q.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40);
  await page.evaluate(() => document.getElementById("askans").scrollIntoView({ block: "start" }));
  await settle(500);
  r.shot = await shot(`q${i + 1}-${slug}`, page.locator("#ask .ask"));
  // interactions on the composed cards
  const cv = page.locator("#askout .eu-card[data-kind=trace] canvas.os-cv").first();
  if (await cv.count()) {
    await cv.scrollIntoViewIfNeeded(); await settle(300);
    const hit = await page.evaluate(() => { const el = document.querySelector("#askout .eu-card[data-kind=trace] canvas.os-cv"); const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
    // find a model span pixel by scanning the second lane row
    let opened = false;
    for (const fx of [0.3, 0.45, 0.6, 0.75, 0.2, 0.5, 0.35]) for (const fy of [62, 82, 42]) { if (opened) break; await page.mouse.click(hit.x + hit.w * fx, hit.y + fy); await settle(150); opened = await page.evaluate(() => !!document.querySelector("#askout .os-drawer")); }
    r.timelineDrawer = opened;
    const mini = page.locator("#askout .eu-card[data-kind=trace] canvas.os-mini").first();
    const mb = await mini.boundingBox();
    await page.mouse.move(mb.x + mb.width * 0.2, mb.y + 18); await page.mouse.down(); await page.mouse.move(mb.x + mb.width * 0.45, mb.y + 18, { steps: 6 }); await page.mouse.up();
    r.minimapZoom = await page.evaluate(() => { const s = window.__ask; return true; });
    await settle(300);
    r.timelineShot = await shot(`q${i + 1}-timeline`, page.locator("#askout .eu-card[data-kind=trace]").first());
  }
  // tools: open a row, click its first span (jumps to the timeline when the session matches)
  const trow = page.locator("#askout .eu-card[data-kind=trace-tools] tr.click").first();
  if (await trow.count()) { await trow.scrollIntoViewIfNeeded(); await trow.click(); await settle(400); const sp = page.locator("#askout .eu-card[data-kind=trace-tools] .os-spans li").first(); if (await sp.count()) { await sp.click(); await settle(900); r.toolsJump = await page.evaluate(() => !!document.querySelector("#askout .eu-card[data-kind=trace] .os-drawer, #askout .eu-card[data-kind=trace-tools] .os-drawer")); } }
  const erow = page.locator("#askout .eu-card[data-kind=trace-errors] tr.click").first();
  if (await erow.count()) { await erow.scrollIntoViewIfNeeded(); await erow.click(); await settle(400); const li = page.locator("#askout .eu-card[data-kind=trace-errors] .os-spans li:not(.nolink)").first(); if (await li.count()) { await li.click(); await settle(1000); r.errorsJump = await page.evaluate(() => !!document.querySelector("#askout .os-drawer")); } }
  if (i === 0) { // layer toggle: cost on → summary gains Cost cell; transcript on → list appears
    await page.click('#asklayers button[data-layer="cost"]'); await page.click('#asklayers button[data-layer="transcript"]'); await settle(1600);
    r.layerToggle = await page.evaluate(() => ({ costCell: [...document.querySelectorAll("#askout .os-sl")].some((e) => e.textContent === "Cost"), transcript: !!document.querySelector("#askout .os-tx li") }));
    await page.evaluate(() => document.getElementById("askout").scrollIntoView({ block: "start" })); await settle(400);
    r.layerShot = await shot(`q1-layers-cost-transcript`, page.locator("#askout"));
  }
  report.questions.push({ q, ...r });
}
// gallery: one screenshot per kind
await page.evaluate(() => document.getElementById("tracekinds").scrollIntoView());
await page.waitForFunction(() => document.querySelectorAll("#tracekinds .eu-card").length >= 8, null, { timeout: 15000 });
await settle(1800);
for (const k of await page.evaluate(() => [...document.querySelectorAll("#tracekinds .tkcell")].map((c) => c.dataset.kind))) {
  const cell = page.locator(`#tracekinds .tkcell[data-kind="${k}"]`);
  await cell.scrollIntoViewIfNeeded(); await settle(500);
  if (k === "trace-span") { await cell.locator(".eu-seg button").nth(1).click(); await settle(300); }
  if (k === "trace-tools") { await cell.locator("tr.click").first().click(); await settle(300); }
  if (k === "trace-errors") { await cell.locator("tr.click").first().click(); await settle(300); }
  if (k === "trace-usage") { await cell.locator(".eu-seg").first().locator("button").nth(2).click(); await settle(500); }
  report.kinds[k] = await shot(`kind-${k}`, cell);
}
report.overflow = await page.evaluate((W) => { const bad = []; for (const el of document.querySelectorAll("#ask *")) { const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1) { let clipped = false; for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p !== document.body && p !== document.documentElement) { clipped = true; break; } } if (!clipped) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].join(".")} right=${Math.round(r.right)}`); } } return { docW: document.documentElement.scrollWidth, bad: bad.slice(0, 20) }; }, W);
console.log(JSON.stringify(report, null, 1));
console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].slice(0, 30).join("\n") : "no page errors");
await browser.close();
process.exit(errors.length ? 1 : 0);
