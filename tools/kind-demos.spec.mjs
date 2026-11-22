// Run against python3 -m http.server --directory src (see README.md).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = new URL(process.argv[2] ?? "http://localhost:8000");
const { kinds } = JSON.parse(await readFile(new URL("../catalog/catalog.json", import.meta.url)));
const browser = await chromium.launch({
  executablePath: process.env.EUI_CHROMIUM || undefined,
  args: ["--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ reducedMotion: "reduce" });
page.setDefaultTimeout(5000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error" && message.location().url.startsWith(base.origin)) errors.push(message.text()); });
await page.route("**/*", (route) => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());

async function exercise(kind, card) {
  if (kind === "cua-action" || kind === "gev-contacts") {
    const button = card.locator(kind === "cua-action" ? ".cd-el:enabled" : ".gc-contact").first();
    await button.click();
    assert.equal(await button.getAttribute("aria-pressed"), "true");
  } else if (kind === "work-dock") {
    await card.getByRole("button", { name: "Pin to input bar" }).click();
    const bubble = page.locator("#demo-dock .wd-bubble");
    await bubble.click();
    assert.equal(await bubble.getAttribute("aria-expanded"), "true");
    await page.locator("#demo-dock").getByRole("button", { name: "Unpin", exact: true }).click();
    await card.waitFor();
  } else if (kind === "fleet-hosts") {
    await card.getByLabel("Hosts view").selectOption("machines");
    await card.locator(".fh-machines").waitFor();
  } else if (kind === "fleet-portfolio") {
    await card.getByLabel("Portfolio view").selectOption("roadmap");
    await card.locator(".fp-lanes").waitFor();
  } else if (kind === "fleet-factory") {
    await card.locator(".ff-n").first().press("Enter");
    await card.locator(".ff-n.ff-sel").waitFor();
  } else if (kind === "intel-suite") {
    await card.getByRole("tab", { name: "Memory" }).click();
    await card.getByRole("tabpanel", { name: "Memory" }).waitFor();
  } else {
    const pin = card.getByRole("button", { name: "Pin card" });
    await pin.click();
    assert.equal(await pin.getAttribute("aria-pressed"), "true");
    await pin.click();
    assert.equal(await pin.getAttribute("aria-pressed"), "false");
  }
}

try {
  await page.goto(base.href, { waitUntil: "domcontentloaded" });
  const fromKit = page.getByRole("link", { name: "Live demos", exact: true });
  await fromKit.click();
  await page.waitForURL("**/demos.html");
  const index = page.locator("#demo-index a");
  await index.first().waitFor();
  const links = await index.evaluateAll((els) => els.map((a) => a.href));
  assert.deepEqual(links.map((url) => new URL(url).searchParams.get("kind")).sort(), kinds.map(({ kind }) => kind).sort());
  for (const url of links) {
    const kind = new URL(url).searchParams.get("kind");
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const card = page.locator(`#demo-mount > .eu-card[data-kind="${kind}"]`);
      await card.waitFor();
      await page.locator("#demo-status").waitFor({ state: "hidden" });
      assert.equal(await page.locator("html").getAttribute("data-host"), "hermes");
      await exercise(kind, card);
      assert.deepEqual(errors, []);
      console.log(`PASS ${kind}: mounted and exercised`);
    } catch (error) {
      throw new Error(kind, { cause: error });
    }
  }

  await page.goto(new URL("demos.html?kind=inbox", base).href);
  const pin = page.getByRole("button", { name: "Pin card" });
  await pin.click();
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.getByRole("button", { name: "Replay demo" }).click(),
  ]);
  await pin.waitFor();
  assert.equal(await pin.getAttribute("aria-pressed"), "false");
  await page.goto(new URL("demos.html?kind=unknown-kind", base).href);
  await page.getByText("That card kind is not in the demo catalog. Pick one below.", { exact: true }).waitFor();
  console.log(`Verified ${links.length} public demos, replay reset, and unknown-kind recovery.`);
} finally {
  await browser.close();
}
