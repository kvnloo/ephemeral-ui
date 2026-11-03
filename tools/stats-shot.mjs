// Stats library browser gate: every demo in #stats, in one theme and width per run. Exercises each
// component (row click, segmented switch, legend toggle, chart hover, canvas keys, modal/drawer
// open + Esc, dashboard G-letter jump), counts the events it emitted, measures horizontal overflow
// inside the section, and screenshots each demo after the interactions. Then checks the deep links
// (#stats, #stats=<component>, #ask, #ask=<question>) on fresh page loads.
//   node tools/stats-shot.mjs <url> <outdir> --theme t3-dark --w 1440 [--h 900] [--only Models,Table] [--no-links] [--hash range=30d]
// Exit 1 on any page error, console error, HTTP >= 400, overflow, missing event or failed deep link.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? "~/.t3/worktrees/t3code/experiment-openui-android-replay/apps/web/package.json");
const { chromium } = require("playwright");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const url = args[0], out = path.resolve(args[1] ?? "out/stats-shots"), theme = opt("theme", "t3-dark"), W = +opt("w", 1440), H = +opt("h", W < 600 ? 915 : 900);
const only = opt("only", "") ? new Set(opt("only").split(",")) : null, links = !args.includes("--no-links");
const tag = `${theme}-${W}`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const mobile = W < 600;
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
const report = { theme, width: W, demos: [], links: [], errors: [], http: [] };
function watch(p) {
  p.on("pageerror", (e) => report.errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  p.on("console", (m) => m.type() === "error" && report.errors.push(`console: ${m.text().slice(0, 300)}`));
  p.on("response", (r) => r.status() >= 400 && report.http.push(`${r.status()} ${r.url()}`));
  p.on("requestfailed", (r) => !/favicon/.test(r.url()) && r.failure()?.errorText !== "net::ERR_ABORTED" && report.http.push(`failed ${r.url()} ${r.failure()?.errorText ?? ""}`));
}
const page = await ctx.newPage(); watch(page);
const extra = opt("hash", "") ? `&${opt("hash")}` : "";
await page.goto(`${url}#theme=${theme}&stats=Dashboard${extra}`);
await page.waitForFunction(() => document.documentElement.classList.contains("ready") && window.__stats, null, { timeout: 30000 });
await page.waitForSelector("#stats .sl-lib-tab", { timeout: 20000 });
const names = await page.$$eval("#stats .sl-lib-tab", (bs) => bs.map((b) => b.textContent));
const overflow = () => page.evaluate((W) => {
  const sec = document.getElementById("stats"), out = [];
  const clipped = (el) => { for (let e = el.parentElement; e && e !== sec; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
  for (const el of sec.querySelectorAll("*")) { const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1 && !clipped(el) && !el.closest(".sl-drawer.overlay,.sl-modal-ov")) out.push(`${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(" ")[0]} right=${Math.round(r.right)}`); }
  // secW, not the document width: other sections animate cards in with a translateX (the #oss stage),
  // which briefly widens the document while #stats itself fits. tools/overflow.mjs gates the whole page.
  return { docW: document.documentElement.scrollWidth, secW: sec.scrollWidth, out: out.slice(0, 12) };
}, W);
const evCount = () => page.$eval("#stats .sl-ev-list", (e) => (e.textContent.trim() ? e.textContent.trim().split("\n").length : 0));
const tryDo = async (label, fn, did) => { try { if (await fn()) did.push(label); } catch (e) { did.push(`FAIL ${label}: ${String(e).split("\n")[0].slice(0, 120)}`); } };
for (const [i, name] of names.entries()) {
  if (only && !only.has(name)) continue;
  const t0 = Date.now(), errBefore = report.errors.length;
  await page.locator("#stats .sl-lib-tab").nth(i).click();
  await page.waitForFunction(() => { const d = document.querySelector("#stats-demo"); return d && !d.querySelector(".sl-skel-rows") && d.querySelector("[data-stats-kind]"); }, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => (document.querySelector("#stats .sl-ev-list").textContent = ""));
  const demo = page.locator("#stats-demo");
  await demo.scrollIntoViewIfNeeded();
  if (args.includes("--pristine")) { await page.waitForTimeout(400); await demo.screenshot({ path: `${out}/${tag}-${name}-pristine.png`, animations: "disabled" }).catch(() => {}); }
  const did = [];
  await tryDo("row", async () => { const r = demo.locator("tbody tr[data-clickable=true]:visible").first(); if (!(await r.count())) return false; await r.click(); await page.waitForTimeout(250); return true; }, did);
  await tryDo("segmented", async () => { const b = demo.locator(".eu-seg button:visible").nth(1); if (!(await b.count())) return false; await b.click(); await page.waitForTimeout(250); return true; }, did);
  await tryDo("legend", async () => { const b = demo.locator("button.sl-legend-i:visible").first(); if (!(await b.count())) return false; await b.click(); await page.waitForTimeout(150); await b.click(); return true; }, did);
  await tryDo("chart-hover+click", async () => { const c = demo.locator(".sl-chart:visible").first(); if (!(await c.count())) return false; const bb = await c.boundingBox(); await page.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height * 0.5); await page.waitForTimeout(150); const tip = await demo.locator(".sl-chart-tip:not([hidden])").count(); await page.mouse.click(bb.x + bb.width * 0.6, bb.y + bb.height * 0.5); return tip > 0 ? true : "no-tip"; }, did);
  await tryDo("canvas", async () => { const cv = demo.locator("canvas.sl-tl-cv:visible").first(); if (!(await cv.count())) return false; const bb = await cv.boundingBox(); await cv.click({ position: { x: Math.min(bb.width - 20, bb.width * 0.55), y: Math.min(bb.height - 10, 60) } }); await page.keyboard.press("w"); await page.keyboard.press("d"); await page.keyboard.press("."); await page.mouse.move(bb.x + bb.width * 0.4, bb.y + 50); await page.keyboard.down("Shift"); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.7, bb.y + 50, { steps: 6 }); await page.mouse.up(); await page.keyboard.up("Shift"); return true; }, did);
  await tryDo("minimap", async () => { const cv = demo.locator("canvas.sl-mini:visible").first(); if (!(await cv.count())) return false; const bb = await cv.boundingBox(); await page.mouse.move(bb.x + bb.width * 0.2, bb.y + 20); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.45, bb.y + 20, { steps: 5 }); await page.mouse.up(); return true; }, did);
  await tryDo("modal", async () => { const b = demo.locator("button", { hasText: "Open the judge estimate" }); if (!(await b.count())) return false; await b.click(); await page.waitForSelector(".sl-modal", { timeout: 3000 }); await page.screenshot({ path: `${out}/${tag}-${name}-open.jpg`, quality: 70, animations: "disabled" }); await page.keyboard.press("Escape"); return (await page.locator(".sl-modal").count()) === 0; }, did);
  await tryDo("overlay", async () => { const b = demo.locator("button", { hasText: "Open overlay" }); if (!(await b.count())) return false; await b.click(); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${tag}-${name}-open.jpg`, quality: 70, animations: "disabled" }); await page.keyboard.press("Escape"); await page.waitForTimeout(100); return !(await page.locator(".sl-drawer.overlay:visible").count()); }, did);
  await tryDo("dash-keys", async () => { if (name !== "Dashboard") return false; await demo.locator(".sl-dash").click({ position: { x: 5, y: 5 } }); await page.keyboard.press("g"); await page.keyboard.press("e"); await page.waitForSelector("#stats-demo [data-stats-kind=ErrorsView]", { timeout: 5000 }); await page.keyboard.press("3"); return true; }, did);
  await tryDo("tool-select", async () => { const s = demo.locator("select.sl-select:visible").first(); if (!(await s.count())) return false; const opts = await s.locator("option").count(); if (opts < 2) return false; await s.selectOption({ index: 1 }); return true; }, did);
  await page.waitForTimeout(300);
  const events = await evCount(), ov = await overflow();
  await demo.scrollIntoViewIfNeeded();
  await demo.screenshot({ path: `${out}/${tag}-${name}.jpg`, quality: 72, animations: "disabled" }).catch(async () => page.screenshot({ path: `${out}/${tag}-${name}.jpg`, quality: 72, animations: "disabled" }));
  // interactions that must reach the agent as events (opening a modal or drawer alone emits nothing)
  const interactive = did.some((d) => ["row", "segmented", "legend", "chart-hover+click", "canvas", "minimap", "dash-keys", "tool-select"].includes(d));
  report.demos.push({ name, ms: Date.now() - t0, did, events, overflow: ov.out, docW: ov.docW, secW: ov.secW, pageErrors: report.errors.slice(errBefore), ok: !ov.out.length && ov.secW <= W + 1 && report.errors.length === errBefore && !did.some((d) => d.startsWith("FAIL")) && (!interactive || events > 0) });
  process.stdout.write(`${report.demos.at(-1).ok ? "ok  " : "FAIL"} ${name} events=${events} did=${did.join(",")}${ov.out.length ? ` overflow=${ov.out.join(" ")}` : ""}\n`);
}
await page.close();
if (links) {
  const cases = [["stats", "#stats", "#stats"], ["stats=models", "#stats-demo", "[data-stats-kind=ModelsView]"], ["stats=TimelineCanvas", "#stats-demo", "[data-stats-kind=TimelineCanvas]"], ["stats=errors (hermes theme)", "#stats-demo", "[data-stats-kind=ErrorsView]", "theme=hermes-nous&stats=errors"], ["ask", "#ask", "#askq"], ["ask=why was this session slow?", "#ask", "#askout .eu-card, #askout [data-kind]"]];
  for (const [label, scrollTo, expect, hashOverride] of cases) {
    const p = await ctx.newPage(); watch(p);
    const hash = hashOverride ?? `theme=${theme}&${label.replace(/=(.*)$/, (_, q) => "=" + encodeURIComponent(q))}`;
    await p.goto(`${url}#${hash}`);
    await p.waitForFunction(() => document.documentElement.classList.contains("ready"), null, { timeout: 30000 });
    let found = false; try { await p.waitForSelector(expect, { timeout: 15000, state: "attached" }); found = true; } catch {}
    await p.waitForTimeout(2200);
    const pos = await p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; }, scrollTo);
    const extra = label.startsWith("ask=") ? await p.evaluate(() => ({ q: document.querySelector("#askq")?.value, cards: document.querySelectorAll("#askout > *").length })) : null;
    const inView = pos && pos.top < pos.vh * 0.6 && pos.bottom > 0;
    const ok = found && inView && (!extra || (extra.q === "why was this session slow?" && extra.cards > 0));
    await p.screenshot({ path: `${out}/${tag}-link-${label.replace(/[^a-z0-9]+/gi, "_")}.jpg`, quality: 72 });
    report.links.push({ label, hash, found, pos, extra, ok });
    process.stdout.write(`${ok ? "ok  " : "FAIL"} link #${hash} found=${found} top=${pos?.top} ${extra ? JSON.stringify(extra) : ""}\n`);
    await p.close();
  }
}
await browser.close();
report.pass = report.demos.filter((d) => d.ok).length; report.fail = report.demos.length - report.pass;
report.linkPass = report.links.filter((l) => l.ok).length;
fs.writeFileSync(`${out}/${tag}-report.json`, JSON.stringify(report, null, 1));
console.log(`${tag}: demos ${report.pass}/${report.demos.length} ok · links ${report.linkPass}/${report.links.length} ok · page/console errors ${report.errors.length} · http ${report.http.length}`);
if (report.errors.length) console.log(report.errors.slice(0, 10).join("\n"));
if (report.http.length) console.log(report.http.slice(0, 10).join("\n"));
process.exit(report.fail || report.errors.length || report.http.length || report.links.some((l) => !l.ok) ? 1 : 0);
