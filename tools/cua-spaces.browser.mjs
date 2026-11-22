// Serve src/ with python3 -m http.server --directory src.
// Run: node tools/cua-spaces.browser.mjs <site-url>
// Optional: PLAYWRIGHT_FROM points to a package.json beside an external Playwright install;
// CHROMIUM_PATH sets a system Chromium executable instead of Playwright's bundled browser.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url)("playwright");
const catalog = JSON.parse(readFileSync(new URL("../catalog/catalog.json", import.meta.url)));
const fixture = catalog.kinds.find(({ kind }) => kind === "cua-spaces").fixtures[0];
const { space, session, display, targets } = fixture.props;
assert.equal(fixture.props.simulated, true);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(12000);
  await page.goto(process.argv[2]);
  const card = (kind, app) => page.locator(`#kindgrid [data-kind="${kind}"][data-app="${app}"]`);
  const spaces = card(fixture.card.kind, fixture.card.app);
  await spaces.waitFor();
  const readout = await spaces.innerText();
  for (const value of [space.name, session.id, session.state, display.name, display.resolution, "Fixture only"]) {
    assert.ok(readout.includes(value), value);
  }

  const desktop = spaces.getByRole("button", { name: targets[0].label, exact: true });
  const window = spaces.getByRole("button", { name: targets[1].label, exact: true });
  const status = spaces.getByText("Streaming desktop · simulated", { exact: true });
  await status.waitFor();
  assert.equal(await desktop.getAttribute("aria-pressed"), "true");
  await spaces.evaluate(el => el.addEventListener("eui:intent", e => { el.lastIntent = e.detail; }));
  await window.focus();
  await page.keyboard.press("Enter");
  await spaces.getByText("Streaming Browser window · simulated", { exact: true }).waitFor();
  assert.equal(await desktop.getAttribute("aria-pressed"), "false");
  assert.equal(await window.getAttribute("aria-pressed"), "true");
  const event = await spaces.evaluate(el => el.lastIntent);
  assert.equal(event.action, "preview-display");
  assert.deepEqual(event.entities, { space: space.id, session: session.id, display: display.id, target: targets[1].id });
  await desktop.click();
  await status.waitFor();
  console.log("PASS Cua Spaces fixture, desktop/window display state, and local intent (390px Chromium)");

  await card("sandbox", "boat").getByRole("button", { name: "Hold to keep winner" }).waitFor();
  await card("screen", "scrcpy").getByText("virtual display #1 · 1080×2340", { exact: true }).waitFor();
  console.log("PASS Boat sandbox and scrcpy virtual display regression renders");
} finally {
  await browser.close();
}
