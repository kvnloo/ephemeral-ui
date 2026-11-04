// Ops boards browser gate: every board in #ops in one theme and width per run. Waits for each board to
// load, picks something on it (lane, node, chain, row, bar), pins it, presses Copy for chat, and checks
// that a stats:event left the board and the @ops reference names the pick. Measures horizontal overflow
// inside #ops, screenshots each board, then checks #ops / #ops=<board> deep links and an Ops playlist
// link on fresh pages.
//   node tools/ops-shot.mjs <url> <outdir> --theme t3-dark --w 1440 [--playlist '<#pl=… hash>']
// Exit 1 on any page error, console error, HTTP >= 400, overflow, missing event or failed deep link.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? "~/.t3/worktrees/t3code/experiment-openui-android-replay/apps/web/package.json");
const { chromium } = require("playwright");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const url = args[0], out = path.resolve(args[1] ?? "out/ops-shots"), theme = opt("theme", "t3-dark"), W = +opt("w", 1440), H = W < 600 ? 915 : 900;
const tag = `${theme}-${W}`, mobile = W < 600;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const report = { theme, width: W, boards: [], links: [], playlist: null, errors: [], http: [] };
function watch(p) {
  p.on("pageerror", (e) => report.errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  p.on("console", (m) => m.type() === "error" && report.errors.push(`console: ${m.text().slice(0, 300)}`));
  p.on("response", (r) => r.status() >= 400 && !/favicon/.test(r.url()) && report.http.push(`${r.status()} ${r.url()}`));
  p.on("requestfailed", (r) => !/favicon/.test(r.url()) && r.failure()?.errorText !== "net::ERR_ABORTED" && report.http.push(`failed ${r.url()} ${r.failure()?.errorText ?? ""}`));
}
const newCtx = () => browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, colorScheme: /light|nous$/.test(theme) ? "light" : "dark", permissions: ["clipboard-read", "clipboard-write"] });
let ctx = await newCtx();
const page = await ctx.newPage(); watch(page);
await page.goto(`${url}#theme=${theme}&ops`);
await page.waitForFunction(() => document.documentElement.classList.contains("ready") && window.__ops, null, { timeout: 40000 });
await page.waitForSelector("#ops .ops-card", { timeout: 20000 });
await page.evaluate(() => { window.__opsEv = []; document.addEventListener("stats:event", (e) => e.target.closest?.("#ops") && window.__opsEv.push(e.detail)); });
const ids = await page.$$eval("#ops .ops-card", (cs) => cs.map((c) => c.id));
const PICK = { "ops-burn": ".ops-lane", "ops-fleet": ".ops-node", "ops-incidents": ".ops-chain, .ops-ev", "ops-models": ".sl-barlist-row", "ops-context": ".sl-barlist-row" };
const overflow = () => page.evaluate((W) => {
  const sec = document.getElementById("ops"), out = [];
  const clipped = (el) => { for (let e = el.parentElement; e && e !== sec; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
  for (const el of sec.querySelectorAll("*")) { const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1 && !clipped(el)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`); }
  return { secW: sec.scrollWidth, out: out.slice(0, 10) };
}, W);
for (const id of ids) {
  const b = { id, did: [], ok: true };
  const card = page.locator(`#${id}`);
  await card.scrollIntoViewIfNeeded();
  await page.waitForFunction((id) => document.querySelector(`#${id} .ops-lead`), id, { timeout: 20000 }).catch(() => { b.ok = false; b.did.push("FAIL no headline"); });
  b.lead = (await card.locator(".ops-lead").first().textContent().catch(() => ""))?.trim();
  const before = await page.evaluate(() => window.__opsEv.length);
  const sel = PICK[id] ?? "tr[data-clickable='true']";
  const target = card.locator(sel).first();
  if (await target.count()) {
    await target.scrollIntoViewIfNeeded();
    if (mobile) await target.tap(); else await target.click();
    b.did.push(`pick ${sel}`);
  } else b.did.push(`no ${sel}`);
  // drag across the first time chart (brush) on desktop; a tap selects a bucket on touch
  const plot = card.locator(".sl-chart").first();
  if (await plot.count()) {
    const bb = await plot.boundingBox();
    if (bb && !mobile) { await page.mouse.move(bb.x + bb.width * 0.55, bb.y + bb.height * 0.5); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.8, bb.y + bb.height * 0.5, { steps: 6 }); await page.mouse.up(); b.did.push("brush chart"); }
  }
  const pin = card.locator(".ops-btn", { hasText: "Pin" });
  if (await pin.isEnabled().catch(() => false)) { await pin.click(); b.did.push("pin"); }
  await card.locator(".ops-btn", { hasText: "Copy for chat" }).click();
  b.ref = await card.locator(".ops-ref").inputValue();
  b.copied = await card.locator(".ops-tray").getAttribute("data-copied");
  const evs = await page.evaluate((n) => window.__opsEv.slice(n), before);
  b.events = evs.map((e) => `${e.type}:${e.ids.join("|") || (e.range ? "range" : "")}`).slice(0, 6);
  if (!evs.some((e) => (e.type === "select" || e.type === "brush") && (e.ids.length || e.range))) { b.ok = false; b.did.push("FAIL no select/brush event with ids or range"); }
  if (!/^@ops:v0;b=\w+;k=\w+;(ids=|r=)/.test(b.ref)) { b.ok = false; b.did.push(`FAIL ref does not name the pick: ${b.ref}`); }
  const text = await card.textContent();
  if (/\bNaN\b|undefined|\[object Object\]/.test(text)) { b.ok = false; b.did.push("FAIL NaN/undefined in text"); }
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, `${tag}-${id}.png`), animations: "disabled", fullPage: false, clip: await (async () => { const bb = await card.boundingBox(); return bb ? { x: Math.max(0, bb.x - 4), y: Math.max(0, bb.y - 4), width: Math.min(W, bb.width + 8), height: Math.min(4000, bb.height + 8) } : undefined; })() }).catch(async () => page.screenshot({ path: path.join(out, `${tag}-${id}.png`), animations: "disabled" }));
  report.boards.push(b);
}
report.overflow = await overflow();
await ctx.close();
// deep links on fresh pages
for (const link of ["ops", "ops=incidents", "ops=burn", "ops=fleet"]) {
  ctx = await newCtx(); const p = await ctx.newPage(); watch(p);
  await p.goto(`${url}#theme=${theme}&${link}`);
  await p.waitForFunction(() => document.documentElement.classList.contains("ready"), null, { timeout: 40000 });
  await p.waitForTimeout(2500);
  const target = link === "ops" ? "#ops" : `#ops-${link.split("=")[1]}`;
  const top = await p.$eval(target, (e) => e.getBoundingClientRect().top).catch(() => null);
  const ok = top != null && top > -40 && top < H * 0.5;
  report.links.push({ link, top, ok });
  await p.screenshot({ path: path.join(out, `${tag}-link-${link.replace("=", "-")}.png`), animations: "disabled" });
  await ctx.close();
}
// an Ops playlist link opens with every board, in a fresh context
const pl = opt("playlist");
if (pl) {
  ctx = await newCtx(); const p = await ctx.newPage(); watch(p);
  await p.goto(`${url}${pl}`);
  await p.waitForFunction(() => document.documentElement.classList.contains("ready"), null, { timeout: 40000 });
  await p.waitForTimeout(3000);
  const n = await p.$$eval("#playlist .eu-card[data-kind^='ops-']", (cs) => cs.length).catch(() => 0);
  const dropped = await p.$eval("#playlist", (e) => /dropped|skipped/i.test(e.textContent) ? e.textContent.match(/\d+ (?:card|item)s? (?:dropped|skipped)/i)?.[0] ?? "some dropped" : null).catch(() => null);
  report.playlist = { cards: n, dropped };
  await p.screenshot({ path: path.join(out, `${tag}-playlist.png`), animations: "disabled" });
  await ctx.close();
}
await browser.close();
const bad = report.errors.length + report.http.length + report.boards.filter((b) => !b.ok).length + report.links.filter((l) => !l.ok).length + (report.overflow.out.length ? 1 : 0) + (pl && !(report.playlist?.cards >= 8) ? 1 : 0);
report.pass = bad === 0;
fs.writeFileSync(path.join(out, `${tag}-report.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ tag, pass: report.pass, boards: report.boards.map((b) => `${b.ok ? "ok" : "FAIL"} ${b.id}`), links: report.links.map((l) => `${l.ok ? "ok" : "FAIL"} ${l.link}`), playlist: report.playlist, overflow: report.overflow.out, errors: report.errors.slice(0, 5), http: report.http.slice(0, 5) }));
process.exit(report.pass ? 0 : 1);
