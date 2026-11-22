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
    const css = kind === "cua-action" ? ".cd-el:enabled" : ".gc-contact";
    const buttons = card.locator(css);
    const index = await buttons.first().getAttribute("aria-pressed") === "true" ? 1 : 0;
    const button = buttons.nth(index);
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
    const view = card.getByLabel("Hosts view");
    const next = await view.inputValue() === "agents" ? "machines" : "agents";
    await view.selectOption(next);
    await card.locator(next === "machines" ? ".fh-machines" : ".fh-tree").waitFor();
  } else if (kind === "fleet-portfolio") {
    const view = card.getByLabel("Portfolio view");
    const next = await view.inputValue() === "tree" ? "roadmap" : "tree";
    await view.selectOption(next);
    await card.locator(next === "roadmap" ? ".fp-lanes" : ".fp-tree").waitFor();
  } else if (kind === "fleet-factory") {
    const nodes = card.locator(".ff-n");
    const target = nodes.nth(await nodes.first().evaluate((el) => Number(el.classList.contains("ff-sel"))));
    await target.press("Enter");
    assert.match(await target.getAttribute("class"), /\bff-sel\b/);
  } else if (kind === "intel-suite") {
    const memory = card.getByRole("tab", { name: "Memory" });
    const next = await memory.getAttribute("aria-selected") === "true" ? "Failures" : "Memory";
    await card.getByRole("tab", { name: next }).click();
    await card.getByRole("tabpanel", { name: next }).waitFor();
  } else {
    const pin = card.getByRole("button", { name: "Pin card" });
    await pin.click();
    assert.equal(await pin.getAttribute("aria-pressed"), "true");
    await pin.click();
    assert.equal(await pin.getAttribute("aria-pressed"), "false");
  }
}

// The dedicated shells keep their documented skin; their shared header still switches.
const fixedSkin = (kind) => kind === "cua-action" || kind === "gev-contacts" || /^trace(?:-|$)/.test(kind);

async function readPalette(card) {
  return card.evaluate((el) => {
    const css = getComputedStyle(el);
    const root = getComputedStyle(document.documentElement);
    const read = (style, name) => style.getPropertyValue(name).trim();
    const header = el.querySelector(".eu-h");
    const tile = getComputedStyle(header.querySelector(".eu-ico"));
    const editor = el.querySelector(".ap:not(.ap-host)");
    return {
      accent: read(css, "--a"),
      accentInk: read(css, "--a-ink"),
      hostAccent: read(css, "--h-primary"),
      hostAccentInk: read(css, "--h-primary-ink"),
      pageAccent: read(root, "--h-primary"),
      brandAccent: read(el.style, "--a"),
      brandAccentInk: read(el.style, "--a-ink"),
      stroke: css.borderTopWidth,
      surface: css.backgroundColor,
      surfaceImage: css.backgroundImage,
      header: getComputedStyle(header).backgroundImage,
      icon: tile.backgroundColor,
      brandTile: !!header.querySelector(".eu-ico:not(.neutral)"),
      editor: editor ? {
        background: getComputedStyle(editor).backgroundColor,
        token: read(getComputedStyle(editor), "--ap-bg"),
        brandToken: read(editor.style, "--editor-bg"),
        hostToken: read(css, "--h-muted"),
      } : null,
    };
  });
}

async function exerciseModes(kind, card) {
  const bare = page.getByRole("radio", { name: "Bare (host only)", exact: true });
  const full = page.getByRole("radio", { name: "Full brand", exact: true });
  const skin = page.locator("#demo-skin");
  assert.equal(await skin.isVisible(), fixedSkin(kind));
  if (fixedSkin(kind)) assert.match(await skin.innerText(), /keeps its dedicated skin/);

  await bare.check();
  const before = await readPalette(card);
  assert.equal(before.accent, before.hostAccent);
  assert.equal(before.accentInk, before.hostAccentInk);
  assert.equal(before.stroke, "1px");
  assert.equal(before.header, "none");
  if (!kind.startsWith("trace")) assert.equal(before.hostAccent, before.pageAccent);
  if (before.editor) assert.equal(before.editor.token, before.editor.hostToken);
  await exercise(kind, card);

  await full.check();
  const after = await readPalette(card);
  assert.equal(after.accent, after.brandAccent);
  assert.equal(after.accentInk, after.brandAccentInk);
  assert.equal(after.stroke, "3px");
  assert.match(after.header, /^linear-gradient/);
  assert.equal(after.surface, before.surface);
  assert.equal(after.surfaceImage, before.surfaceImage);
  if (after.brandTile) assert.notEqual(after.icon, before.icon);
  if (before.editor) assert.equal(after.editor.token, after.editor.brandToken);
  await exercise(kind, card);

  await bare.check();
  const restored = await readPalette(card);
  assert.equal(restored.stroke, before.stroke);
  assert.equal(restored.header, before.header);
  assert.equal(restored.accent, before.accent);
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
      await exerciseModes(kind, card);
      assert.deepEqual(errors, []);
      console.log(`PASS ${kind}: mounted and exercised in bare and full brand`);
    } catch (error) {
      throw new Error(kind, { cause: error });
    }
  }

  await page.goto(new URL("demos.html?kind=inbox", base).href);
  const pin = page.getByRole("button", { name: "Pin card" });
  const full = page.getByRole("radio", { name: "Full brand" });
  await pin.click();
  await full.check();
  assert.equal(await pin.getAttribute("aria-pressed"), "true", "mode change keeps card state");
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.getByRole("button", { name: "Replay demo" }).click(),
  ]);
  await pin.waitFor();
  assert.equal(await pin.getAttribute("aria-pressed"), "false");
  assert.ok(await full.isChecked(), "replay keeps the selected mode");
  await page.goto(new URL("demos.html?kind=unknown-kind", base).href);
  await page.getByText("That card kind is not in the demo catalog. Pick one below.", { exact: true }).waitFor();
  console.log(`Verified ${links.length} public demos in both modes, replay reset, and unknown-kind recovery.`);
} finally {
  await browser.close();
}
