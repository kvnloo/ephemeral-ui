// Browser proof for the host matrix (EU-006): every agent host profile in the header picker and the
// #hosts matrix, same pinned fixture, each host's skin and declared interaction tier.
//   python3 -m http.server 8765 --directory src &
//   node tools/host-matrix.browser.mjs http://localhost:8765/ [screenshot dir]
// Needs Playwright: `playwright` resolvable from here, or PLAYWRIGHT_MODULE=<dir with node_modules/playwright>.
// CHROMIUM=<chrome binary> picks a browser other than Playwright's own. Exits 1 on any failed check.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const load = async () => {
  if (process.env.PLAYWRIGHT_MODULE) return createRequire(path.join(process.env.PLAYWRIGHT_MODULE, "package.json"))("playwright");
  return import("playwright");
};
const { chromium } = await load();
const [url = "http://localhost:8765/", out = "out/host-matrix"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const REQUIRED = ["t3", "hermes", "tern", "chatgpt", "codex", "claude", "o8"];
const BRIDGE = { t3: "t3-native", hermes: "none", tern: "tern-host", chatgpt: "mcp-apps", codex: "mcp-apps", claude: "mcp-apps", o8: "o8-question" };
const LOGS = { "t3-native": '"eui:intent"', none: "No channel back", "tern-host": '"send"', "mcp-apps": '"ui/update-model-context"', "o8-question": '"o8-visualization:question"' };
const results = [];
const check = (name, ok, info = "") => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? "ok  " : "FAIL"} ${name}${info ? ` — ${info}` : ""}`); };
const rgb = (hex) => { const c = hex.replace("#", ""); return `rgb(${parseInt(c.slice(0, 2), 16)}, ${parseInt(c.slice(2, 4), 16)}, ${parseInt(c.slice(4, 6), 16)})`; };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => document.documentElement.classList.contains("ready"));

const { hosts, themes, fixture } = await page.evaluate(() => ({ hosts: window.__eui.HOSTS.list, themes: window.__eui.T.themes, fixture: window.__eui.HOSTS.fixture }));
const theme = (id) => themes.find((t) => t.id === id);
check("hosts.json lists every required harness", REQUIRED.every((id) => hosts.some((h) => h.id === id)), hosts.map((h) => h.id).join(","));
check("every profile is labelled a simulation", hosts.every((h) => h.preview === "simulation"));
check("native receipts only where one is on file", hosts.filter((h) => h.receipt).map((h) => h.id).join(",") === "t3,tern", hosts.filter((h) => h.receipt).map((h) => h.id).join(","));

// 1. Header picker: each host wears its skin in the hero host window.
const pick = await page.$$eval(".hostpick button", (bs) => bs.map((b) => b.dataset.host));
check("header picker has a button per host", REQUIRED.every((id) => pick.includes(id)), pick.join(","));
for (const p of hosts) {
  await page.click(`.hostpick button[data-host="${p.id}"]`);
  const want = theme(p.themes.light);
  await page.waitForFunction((id) => document.documentElement.dataset.host === id, p.id);
  await page.waitForTimeout(150);
  const got = await page.evaluate(() => ({ bg: getComputedStyle(document.documentElement).getPropertyValue("--h-bg").trim(), radius: getComputedStyle(document.documentElement).getPropertyValue("--h-radius").trim(), name: document.querySelector("#host .host-name").textContent, wt: document.querySelector("#host .wt").textContent, pressed: document.querySelector(`.hostpick button[aria-pressed="true"]`)?.dataset.host, preset: document.querySelector(".preset[aria-pressed=true]")?.dataset.id }));
  check(`hero · ${p.id} skin (${want.id})`, got.bg === want.bg && got.radius === `${want.radius}px` && got.pressed === p.id && got.preset === want.id, JSON.stringify({ bg: got.bg, radius: got.radius, preset: got.preset }));
  check(`hero · ${p.id} names the host and says simulation`, got.name === p.short && /simulation/.test(got.wt) && (/approximate skin/.test(got.wt) === (p.skin === "approx")), `${got.name} | ${got.wt}`);
}
// scheme toggle keeps the host and flips to its dark preset
await page.click('.hostpick button[data-host="o8"]');
await page.waitForFunction(() => document.documentElement.dataset.host === "o8");
await page.click("#scheme");
await page.waitForFunction(() => window.__eui.T.base.id === "o8-dark");
check("light/dark toggle stays on the host (o8-light → o8-dark)", true);
await page.screenshot({ path: `${out}/hero-o8-dark.png` });
await page.click('.hostpick button[data-host="t3"]');
await page.click("#scheme");
await page.waitForFunction(() => window.__eui.T.base.id === "t3-light");

// 2. Matrix: same fixture in every host frame, both schemes.
await page.locator("#hosts").scrollIntoViewIfNeeded();
const texts = {};
for (const scheme of ["light", "dark"]) {
  if (scheme === "dark") await page.click('#hostscheme button[aria-label="Dark"]');
  const want = Object.fromEntries(hosts.map((p) => [p.id, p.themes[scheme]]));
  await page.waitForFunction((want) => {
    const figs = [...document.querySelectorAll("#hostgrid .hm-cell")];
    return figs.length === Object.keys(want).length && figs.every((f) => f.dataset.ready === want[f.dataset.host]);
  }, want, { timeout: 20000 });
  await page.waitForTimeout(1200);
  for (const p of hosts) {
    const want = theme(p.themes[scheme]);
    const fr = page.frame({ url: new RegExp(`host-frame\\.html\\?host=${p.id}&scheme=${scheme}`) });
    const got = await fr.evaluate(() => {
      const r = document.documentElement, card = document.querySelector(".eu-card");
      return { host: r.dataset.host, scheme: r.dataset.scheme, bg: getComputedStyle(r).getPropertyValue("--h-bg").trim(), radius: getComputedStyle(r).getPropertyValue("--h-radius").trim(), body: getComputedStyle(document.body).backgroundColor, font: getComputedStyle(document.body).fontFamily, kind: card?.dataset.kind, app: card?.dataset.app, text: card?.querySelector(".eu-h")?.textContent, tag: document.querySelector(".hf-tag")?.textContent };
    });
    const ok = got.host === p.id && got.scheme === scheme && got.bg === want.bg && got.radius === `${want.radius}px` && got.body === rgb(want.bg) && got.kind === fixture.kind && got.app === fixture.app;
    check(`matrix · ${p.id} · ${scheme} wears ${want.id} with the pinned ${fixture.app}/${fixture.kind}`, ok, JSON.stringify({ bg: got.bg, body: got.body, radius: got.radius, tag: got.tag }));
    (texts[scheme] ||= []).push(got.text);
    const chips = await page.$eval(`#hostgrid .hm-cell[data-host="${p.id}"]`, (f) => ({ sim: f.querySelector(".hm-chip.sim")?.textContent, tier: f.querySelector(".hm-chip.tier")?.textContent, rc: f.querySelector(".hm-chip.rc")?.classList.contains("ok"), skin: f.querySelector(".hm-chip.skin")?.textContent }));
    if (scheme === "light") check(`matrix · ${p.id} labels: Simulation, Tier ${p.tier.level}, ${p.receipt ? "receipt" : "no receipt"}`, chips.sim === "Simulation" && chips.tier.startsWith(`Tier ${p.tier.level}`) && chips.rc === !!p.receipt && (chips.skin === "approximate skin") === (p.skin === "approx"), JSON.stringify(chips));
  }
  check(`matrix · ${scheme}: every frame draws the same card header`, new Set(texts[scheme]).size === 1, texts[scheme][0]);
  await page.locator("#hosts").screenshot({ path: `${out}/matrix-${scheme}.png` });
}

// 3. Interaction tier: pin the card in each frame and read what the host bridge carried.
for (const p of hosts) {
  const fl = page.frameLocator(`iframe.hm-frame[data-host="${p.id}"]`);
  await fl.locator(".eu-ttl").first().click();
  await page.waitForFunction((id) => document.querySelector(`#hostgrid .hm-cell[data-host="${id}"]`).dataset.last, p.id, { timeout: 5000 });
  const got = await page.$eval(`#hostgrid .hm-cell[data-host="${p.id}"]`, (f) => ({ last: f.dataset.last, log: f.querySelector(".hm-log").textContent }));
  const exp = BRIDGE[p.id];
  check(`tier · ${p.id} pin → ${exp}`, got.last === exp && got.log.includes(LOGS[exp]), got.log.split("\n").slice(0, 3).join(" "));
}
await page.locator("#hosts").screenshot({ path: `${out}/matrix-after-pin.png` });

// 4. Phone width: the picker scrolls inside the bar, the page does not overflow.
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
m.on("pageerror", (e) => errs.push(e.message));
await m.goto(url);
await m.waitForFunction(() => document.documentElement.classList.contains("ready"));
await m.locator("#hosts").scrollIntoViewIfNeeded();
await m.waitForFunction(() => [...document.querySelectorAll("#hostgrid .hm-cell")].every((f) => f.dataset.ready), null, { timeout: 20000 });
const mo = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, pick: document.querySelector(".hostpick").getBoundingClientRect().right }));
check("390px: no page overflow and the picker stays in the bar", mo.sw <= mo.cw && mo.pick <= mo.cw, JSON.stringify(mo));
await m.screenshot({ path: `${out}/phone-hosts.png` });

check("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
await browser.close();
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length} checks, ${results.length - fail} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
