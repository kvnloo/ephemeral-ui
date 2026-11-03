// Checks the reel at the top of the page: it plays muted, the sound toggle works, it pauses offscreen,
// reduced motion shows controls instead of autoplay, no overflow, no errors. Screenshots per config.
//   node tools/reel-shot.mjs <url> <outdir>
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? "~/.t3/worktrees/t3code/experiment-openui-android-replay/apps/web/package.json");
const { chromium } = require("playwright");
const [url = "http://127.0.0.1:8791/", outArg = "out/reel-shots"] = process.argv.slice(2);
const out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let bad = 0;
for (const [w, h] of [[1440, 900], [412, 915]]) for (const theme of ["t3-dark", "t3-light", "hermes-nous", "hermes-nous-dark"]) for (const reduce of [false, true]) {
  if (reduce && theme !== "t3-dark") continue;
  const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: reduce ? "reduce" : "no-preference" });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror " + e.message));
  page.on("console", (m) => m.type() === "error" && errs.push("console " + m.text()));
  page.on("response", (r) => r.status() >= 400 && errs.push(`http ${r.status()} ${r.url()}`));
  await page.goto(`${url}#theme=${theme}`);
  await page.waitForFunction(() => document.documentElement.classList.contains("ready"));
  await page.waitForTimeout(1500);
  const s = await page.evaluate(async () => {
    const v = document.querySelector(".rl-vid"), b = document.querySelector(".rl-snd");
    const r = { playing: !v.paused, muted: v.muted, t: v.currentTime, controls: v.controls, overflow: document.documentElement.scrollWidth - innerWidth, top: v.getBoundingClientRect().top };
    b.click(); r.afterClick = { muted: v.muted, label: b.textContent, pressed: b.getAttribute("aria-pressed") }; b.click();
    window.scrollTo(0, 3000); await new Promise((ok) => setTimeout(ok, 600)); r.pausedOffscreen = v.paused;
    window.scrollTo(0, 0); await new Promise((ok) => setTimeout(ok, 600)); r.resumed = !v.paused;
    return r;
  });
  const name = `${w}-${theme}${reduce ? "-reduced" : ""}`;
  await page.screenshot({ path: path.join(out, name + ".png") });
  const ok = (reduce ? !s.playing && s.controls : s.playing && s.muted && s.pausedOffscreen && s.resumed) && !s.afterClick.muted && s.overflow <= 0 && !errs.length;
  if (!ok) bad++;
  console.log(ok ? "ok  " : "BAD ", name, JSON.stringify(s), errs.slice(0, 4).join(" | "));
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
