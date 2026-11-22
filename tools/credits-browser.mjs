// Serve: python3 -m http.server --directory src
// Run: PLAYWRIGHT_FROM=/path/to/package.json node tools/credits-browser.mjs <served-origin>
// PLAYWRIGHT_FROM resolves a Playwright install outside the kit. By default use
// Playwright's bundled Chromium; EUI_CHROMIUM can point to Chrome/Chromium instead.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const manifest = JSON.parse(readFileSync(new URL('../docs/library-credits.json', import.meta.url), 'utf8'));
const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM || import.meta.url)('playwright');
const browser = await chromium.launch({
  ...(process.env.EUI_CHROMIUM && { executablePath: process.env.EUI_CHROMIUM }),
});
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const response = await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok());
    await page.getByRole('link', { name: 'Credits', exact: true }).click();
    assert.equal(new URL(page.url()).hash, '#credits');
    const credits = page.locator('#credits');
    assert.ok(await credits.isVisible());
    assert.equal(await credits.getByRole('link').first().innerText(), 'OpenUI');
    for (const group of ['kit', 'tools']) {
      const list = credits.locator(`[data-credit-group="${group}"]`);
      const entries = manifest.filter(entry => entry.group === group);
      assert.equal(await list.getByRole('listitem').count(), entries.length);
      for (const entry of entries) {
        const link = list.getByRole('link', { name: entry.upstream, exact: true });
        assert.ok(await link.isVisible(), entry.upstream);
        assert.equal(await link.getAttribute('href'), entry.url);
        assert.ok((await link.locator('..').innerText()).includes(entry.license), entry.upstream);
      }
    }
    assert.ok(await credits.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Credits overflow');
    console.log(`PASS Chromium ${browser.version()} at ${width}px: Credits link, OpenUI first, ${manifest.length} visible library entries with licenses in their groups`);
    await page.close();
  }
} finally {
  await browser.close();
}
