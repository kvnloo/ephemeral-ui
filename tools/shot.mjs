// Real-browser checks for the site: page errors, section screenshots, theme switches, interactions.
//   node tools/shot.mjs <url> <outdir> [--w 1440] [--h 900] [--theme t3-dark] [--steps hero,kit,kinds,theme,flows,spec,drawer,palette]
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? "~/.t3/worktrees/t3code/experiment-openui-android-replay/apps/web/package.json");
const { chromium } = require("playwright");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const url = args[0] ?? "http://127.0.0.1:8791/";
const out = path.resolve(args[1] ?? "out/shots");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const page = await browser.newPage({ viewport: { width: +opt("w", 1440), height: +opt("h", 900) }, deviceScaleFactor: +opt("dsf", 1) });
const errors = [], failed = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
page.on("requestfailed", (r) => failed.push(r.url()));
page.on("response", (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
const theme = opt("theme", "");
await page.goto(url + (theme ? `#theme=${theme}` : ""));
try { await page.waitForFunction(() => document.documentElement.classList.contains("ready"), null, { timeout: 15000 }); } catch (e) { console.log("NOT READY", errors.join("\n"), failed.join("\n")); await browser.close(); process.exit(2); }
const tag = opt("tag", theme || "default");
const shot = async (name, sel) => { const p = path.join(out, `${tag}-${name}.png`); if (sel) await page.locator(sel).screenshot({ path: p }); else await page.screenshot({ path: p }); console.log("shot", p); };
const steps = opt("steps", "hero,kit,kinds,theme,flows,spec,drawer,palette").split(",");
for (const s of steps) {
  if (s === "hero") { await page.waitForTimeout(+opt("t", 9000)); await shot("hero"); }
  if (s === "hero2") { await page.waitForTimeout(16000); await shot("hero2"); }
  if (s === "kit") { await page.locator("#kit").scrollIntoViewIfNeeded(); await page.evaluate(() => document.getElementById("kit").scrollIntoView()); await page.waitForTimeout(1200); await shot("kit"); await page.fill("#q", "merge"); await page.waitForTimeout(900); await shot("kit-filter"); await page.fill("#q", ""); }
  if (s === "kinds") { const cells = await page.locator(".kcell").count(); for (let i = 0; i < cells; i += 6) { await page.locator(".kcell").nth(i).scrollIntoViewIfNeeded(); await page.evaluate((i) => document.querySelectorAll(".kcell")[i].scrollIntoView({ block: "start" }), i); await page.waitForTimeout(2600); await shot(`kinds-${i}`); } }
  if (s === "theme") { await page.evaluate(() => document.getElementById("theme").scrollIntoView()); await page.waitForTimeout(2200); await shot("theme"); }
  if (s === "flows") { await page.evaluate(() => document.getElementById("flows").scrollIntoView()); await page.waitForTimeout(900); await page.click("#runflow"); await page.waitForTimeout(2200); await shot("flows"); }
  if (s === "spec") { await page.evaluate(() => document.getElementById("spec").scrollIntoView()); await page.waitForTimeout(600); await shot("spec"); }
  if (s === "drawer") { await page.evaluate(() => document.getElementById("kit").scrollIntoView()); await page.waitForTimeout(500); await page.locator('.tile[data-id="spotify"]').click(); await page.waitForTimeout(2500); await shot("drawer"); await page.keyboard.press("Escape"); await page.waitForTimeout(400); }
  if (s === "palette") { await page.keyboard.press("Control+k"); await page.keyboard.type("lin"); await page.waitForTimeout(500); await shot("palette"); await page.keyboard.press("Escape"); }
  if (s === "full") { await page.waitForTimeout(800); await page.screenshot({ path: path.join(out, `${tag}-full.png`), fullPage: true }); }
}
const stats = await page.evaluate(() => ({ cards: document.querySelectorAll(".eu-card").length, tiles: document.querySelectorAll(".tile").length, theme: document.documentElement.dataset.host + "/" + document.documentElement.dataset.scheme }));
console.log(JSON.stringify(stats));
console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].slice(0, 20).join("\n") : "no page errors");
console.log(failed.length ? "FAILED REQUESTS:\n" + [...new Set(failed)].slice(0, 20).join("\n") : "no failed requests");
await browser.close();
