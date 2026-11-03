// Interaction journey: hero 3D scene, Blender drawer, sculpt drag, CAD click, combos tap-order, OSS swap, palette.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("~/.t3/worktrees/t3code/experiment-openui-android-replay/apps/web/package.json");
const { chromium } = require("playwright");
const [url, out = "out/journey", W = "1440", H = "900"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const mobile = +W < 600, tag = mobile ? "m" : "d";
const b = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto(url); await p.waitForFunction(() => document.documentElement.classList.contains("ready"));
const r = {};
// hero: pick the sculpt scene
await p.click('#hostctl .scn button[data-id="sculpt"]'); await p.waitForTimeout(6500);
await p.screenshot({ path: `${out}/${tag}-hero-sculpt.png` });
r.heroSculpt = await p.evaluate(() => !!document.querySelector("#host .eu-card[data-kind=sculpt] canvas.v3-cv"));
// drawer: Blender, 6 kinds
await p.evaluate(() => window.__eui.runInHost && document.getElementById("kit").scrollIntoView());
await p.fill("#q", "blender"); await p.waitForTimeout(600);
await p.locator('.tile[data-id="blender"]').click(); await p.waitForTimeout(3500);
await p.screenshot({ path: `${out}/${tag}-drawer-blender.png` });
r.drawerKinds = await p.evaluate(() => [...document.querySelectorAll("#drawer .eu-card")].map((c) => c.dataset.kind));
r.drawerAlt = await p.evaluate(() => document.querySelector("#drawer .dalt")?.innerText);
// sculpt drag inside drawer: displacement should change pixels
const cv = p.locator("#drawer .eu-card[data-kind=sculpt] canvas.v3-cv");
await cv.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
const bb = await cv.boundingBox();
const before = await cv.screenshot();
await p.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.45); await p.mouse.down();
for (let i = 0; i < 20; i++) await p.mouse.move(bb.x + bb.width * (0.4 + i * 0.01), bb.y + bb.height * 0.45, { steps: 2 });
await p.mouse.up(); await p.waitForTimeout(300);
r.sculptYouTag = await p.evaluate(() => !document.querySelector("#drawer .v3-tag.you")?.hidden);
await p.keyboard.press("Escape"); await p.waitForTimeout(500);
// photoshop search finds GIMP/Krita via alt
await p.fill("#q", "photoshop"); await p.waitForTimeout(700);
r.photoshopHits = await p.evaluate(() => [...document.querySelectorAll("#grid .tile:not([hidden])")].map((t) => t.dataset.id));
await p.fill("#q", "");
// CAD: click to draw walls
await p.evaluate(() => document.getElementById("kinds").scrollIntoView());
const cad = p.locator('#kindgrid .eu-card[data-kind=cad] .cad-sv');
await cad.scrollIntoViewIfNeeded(); await p.waitForTimeout(6000);
const cb = await cad.boundingBox();
await cad.click({ position: { x: cb.width * 0.2, y: cb.height * 0.85 } }); await p.mouse.move(cb.x + cb.width * 0.7, cb.y + cb.height * 0.86); await p.waitForTimeout(100);
await cad.click({ position: { x: cb.width * 0.7, y: cb.height * 0.86 } });
r.cadUserPts = await p.evaluate(() => document.querySelector("#kindgrid .cad-l.you")?.getAttribute("points"));
r.cadDims = await p.evaluate(() => document.querySelectorAll("#kindgrid .cad-dim g").length);
await p.locator('#kindgrid .eu-card[data-kind=cad]').screenshot({ path: `${out}/${tag}-cad.png` });
// combos: tap pieces in order on combo 2 (crash)
await p.evaluate(() => document.getElementById("combos").scrollIntoView());
await p.locator(".cb-tab").nth(1).click(); await p.waitForTimeout(800);
const order = ["sentry", "linear", "github", "vercel", "slack"];
// tap a decoy first: should be rejected
const decoy = await p.evaluate(() => [...document.querySelectorAll('.cb-tray .cb-p[data-k="-1"]')][0]?.dataset.app);
await p.locator(`.cb-tray .cb-p[data-app="${decoy}"]`).click(); await p.waitForTimeout(500);
r.decoyRejected = await p.evaluate(() => document.querySelectorAll(".cb-board .cb-p").length === 0);
console.log("tray", await p.evaluate(() => [...document.querySelectorAll(".cb-tray .cb-p")].map((e) => e.dataset.app + ":" + e.dataset.k).join(" ")), "board", await p.evaluate(() => [...document.querySelectorAll(".cb-board .cb-p")].map((e) => e.dataset.app).join(" ")));
for (const id of order) { const loc = p.locator(`.cb-tray .cb-p[data-app="${id}"]:not([data-used="1"])`).first(); if (!(await loc.count())) { console.log("missing", id); continue; } await loc.click(); await p.waitForTimeout(450); }
await p.waitForTimeout(2500);
await p.locator("#combos").screenshot({ path: `${out}/${tag}-combos-flow.png` });
r.comboPlaced = await p.evaluate(() => document.querySelectorAll(".cb-board .cb-p").length);
r.comboNow = await p.evaluate(() => document.querySelector(".cb-out")?.innerText.slice(0, 120));
r.xp = await p.evaluate(() => localStorage.getItem("eu-xp"));
// OSS swap
await p.evaluate(() => document.getElementById("oss").scrollIntoView()); await p.waitForTimeout(1500);
const k1 = await p.evaluate(() => document.querySelector("#ossstage .eu-card")?.dataset.app);
await p.click("#ossswap"); await p.waitForTimeout(1200);
const k2 = await p.evaluate(() => document.querySelector("#ossstage .eu-card:last-child")?.dataset.app);
r.ossSwap = [k1, k2];
await p.locator("#oss").screenshot({ path: `${out}/${tag}-oss.png` });
console.log(JSON.stringify(r, null, 1));
console.log(errs.length ? "ERRORS:\n" + [...new Set(errs)].join("\n") : "no page errors");
await b.close();
