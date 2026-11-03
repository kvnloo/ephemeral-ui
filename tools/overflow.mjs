// List outermost elements whose right edge passes the viewport at a phone width.
import { createRequire } from "node:module";
const require = createRequire("~/.t3/worktrees/t3code/experiment-openui-android-replay/apps/web/package.json");
const { chromium } = require("playwright");
const url = process.argv[2], W = +(process.argv[3] || 390);
const b = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const p = await b.newPage({ viewport: { width: W, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(url); await p.waitForFunction(() => document.documentElement.classList.contains("ready"), null, { timeout: 20000 });
await p.waitForTimeout(2500);
const r = await p.evaluate((W) => {
  const out = [];
  const scrollers = (el) => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && e !== document.body && e !== document.documentElement) return true; } return false; };
  for (const el of document.querySelectorAll("body *")) {
    const rc = el.getBoundingClientRect();
    if (rc.width && rc.right > W + 1 && !scrollers(el)) { const par = el.parentElement.getBoundingClientRect(); if (par.right <= W + 1 || el.parentElement === document.body) out.push(`${el.tagName.toLowerCase()}#${el.id}.${[...el.classList].join(".")} right=${Math.round(rc.right)} w=${Math.round(rc.width)}`); }
  }
  return { docW: document.documentElement.scrollWidth, out: out.slice(0, 40) };
}, W);
console.log(JSON.stringify(r, null, 1)); console.log(errs.join("\n") || "no page errors");
await b.close();
