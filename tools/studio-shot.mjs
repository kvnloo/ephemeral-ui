// Screenshots of the studio kinds, combos and OSS shelf, plus page errors. node tools/studio-shot.mjs <url> <out> [w] [h]
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("~/.t3/worktrees/t3code/experiment-openui-android-replay/apps/web/package.json");
const { chromium } = require("playwright");
const [url, out = "out/studio", W = "1440", H = "900"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const mobile = +W < 600;
const b = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const errs = [], warns = [];
p.on("pageerror", (e) => errs.push("pageerror: " + e.message + " " + (e.stack || "").split("\n")[1]));
p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); if (m.type() === "warning") warns.push(m.text()); });
p.on("response", (r) => r.status() >= 400 && errs.push(`${r.status()} ${r.url()}`));
await p.goto(url);
await p.waitForFunction(() => document.documentElement.classList.contains("ready"), null, { timeout: 20000 });
const tag = mobile ? "m" : "d";
const shot = async (name, sel) => { const f = `${out}/${tag}-${name}.png`; if (sel) await p.locator(sel).first().screenshot({ path: f }); else await p.screenshot({ path: f }); console.log("shot", f); };
await p.waitForTimeout(6000); await shot("hero");
const cells = await p.locator(".kcell:not([hidden])").count();
console.log("studio cells", cells);
for (let i = 0; i < cells; i++) {
  const c = p.locator(".kcell:not([hidden])").nth(i);
  await c.scrollIntoViewIfNeeded(); await p.waitForTimeout(i < 2 ? 4500 : 3200);
  const k = await c.locator(".eu-card").getAttribute("data-kind");
  await c.screenshot({ path: `${out}/${tag}-k-${k}.png` });
}
await p.evaluate(() => document.getElementById("combos").scrollIntoView()); await p.waitForTimeout(500); await shot("combos-0", "#combos");
await p.click("#combos .fl-run"); await p.waitForTimeout(3500); await shot("combos-1", "#combos"); await p.waitForTimeout(5000); await shot("combos-2", "#combos");
await p.evaluate(() => document.getElementById("oss").scrollIntoView()); await p.waitForTimeout(2500); await shot("oss", "#oss");
const ov = await p.evaluate((W) => { const o = []; const sc = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; }; for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1 && !sc(el) && el.parentElement.getBoundingClientRect().right <= W + 1) o.push(`${el.tagName}.${el.className?.baseVal ?? el.className} r=${Math.round(r.right)}`); } return o.slice(0, 20); }, +W);
console.log("overflow:", JSON.stringify(ov));
console.log(errs.length ? "ERRORS:\n" + [...new Set(errs)].slice(0, 25).join("\n") : "no page errors");
console.log("warnings:", [...new Set(warns)].slice(0, 8).join(" | "));
await b.close();
