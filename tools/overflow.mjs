// List outermost elements whose right edge passes the viewport at a phone width.
//   node tools/overflow.mjs <url> [width=390]
//   env: ENGINE=webkit (Hermex/WKWebView, Tern) | chromium (default); PLAYWRIGHT_FROM=<package.json that can resolve playwright>;
//        SHOT=<png> full-page screenshot after the check; CLICK=1 click the first visible button and report it.
//   Ready when the site sets html.ready or an export sets html[data-ready="1"].
import { createRequire } from "node:module";
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? "~/.t3/worktrees/t3code/experiment-openui-android-replay/apps/web/package.json");
const pw = require("playwright");
const url = process.argv[2], W = +(process.argv[3] || 390), engine = process.env.ENGINE || "chromium";
const exe = engine === "chromium" && !process.env.PLAYWRIGHT_FROM ? { executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` } : {};
const b = await pw[engine].launch(exe);
const p = await b.newPage({ viewport: { width: W, height: 844 }, ...(engine === "chromium" ? { isMobile: true } : {}), hasTouch: true, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(`console: ${m.text()}`));
await p.goto(url); await p.waitForFunction(() => document.documentElement.classList.contains("ready") || document.documentElement.dataset.ready === "1", null, { timeout: 20000 });
await p.waitForTimeout(2500);
const r = await p.evaluate((W) => {
  const out = [];
  const scrollers = (el) => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && e !== document.body && e !== document.documentElement) return true; } return false; };
  for (const el of document.querySelectorAll("body *")) {
    const rc = el.getBoundingClientRect();
    if (rc.width && rc.right > W + 1 && !scrollers(el)) { const par = el.parentElement.getBoundingClientRect(); if (par.right <= W + 1 || el.parentElement === document.body) out.push(`${el.tagName.toLowerCase()}#${el.id}.${[...el.classList].join(".")} right=${Math.round(rc.right)} w=${Math.round(rc.width)}`); }
  }
  return { docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, bg: getComputedStyle(document.body).backgroundColor, out: out.slice(0, 40) };
}, W);
if (process.env.CLICK) { const btn = p.locator("button:visible").first(); r.clicked = (await btn.count()) ? (await btn.innerText()).trim().slice(0, 40) : null; if (r.clicked != null) { await btn.click(); await p.waitForTimeout(500); } }
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, fullPage: true });
// RESTYLE=<css>: replace <style id="hermex-theme"> live (as Hermex does on a theme switch) and shoot again.
if (process.env.RESTYLE) {
  r.before = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--h-card").trim());
  await p.evaluate((c) => { document.getElementById("hermex-theme").textContent = c; document.getElementById("hermex-canvas")?.remove(); }, process.env.RESTYLE);
  await p.waitForTimeout(400);
  r.after = await p.evaluate(() => ({ scheme: document.documentElement.dataset.scheme, card: getComputedStyle(document.documentElement).getPropertyValue("--h-card").trim() }));
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace(/\.png$/, "-restyled.png"), fullPage: true });
}
r.engine = engine;
console.log(JSON.stringify(r, null, 1)); console.log(errs.join("\n") || "no page errors");
await b.close();
