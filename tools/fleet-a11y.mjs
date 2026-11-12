import { createRequire } from 'node:module';
import fs from 'node:fs';

// Read rendered colours, including alpha and inherited opacity, not palette approximations.
function measure() {
  const rgb = value => {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (a, b) => [...a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3])), 1];
  const lum = c => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
  const muted = [...document.querySelectorAll('.fl-root')].flatMap(root => {
    const probe = document.createElement('span'); probe.style.color = 'var(--fl-ink3)'; root.append(probe);
    const color = getComputedStyle(probe).color; probe.remove();
    return [...root.querySelectorAll('*')].filter(el => el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && getComputedStyle(el).color === color);
  });
  const rows = muted.map(el => {
    const stack = []; let opacity = 1;
    for (let p = el; p; p = p.parentElement) { stack.unshift(p); opacity *= Number(getComputedStyle(p).opacity); }
    const bg = stack.reduce((bg, p) => over(rgb(getComputedStyle(p).backgroundColor), bg), [255, 255, 255, 1]);
    const fg = rgb(getComputedStyle(el).color); fg[3] *= opacity;
    return { text: el.textContent.trim().slice(0, 80), class: el.className, color: getComputedStyle(el).color, background: bg, ratio: ratio(over(fg, bg), bg) };
  });
  const disabledFailures = [...document.querySelectorAll('.eu-card button:disabled')].filter(el => !el.title.trim() || !el.innerText.includes(el.title) || !el.checkVisibility({ checkVisibilityCSS: true })).map(el => ({ title: el.title, text: el.textContent }));
  return { rows, disabledFailures };
}

export async function checkFleetA11y(base) {
  const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM)('playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.EUI_CHROMIUM ? { executablePath: process.env.EUI_CHROMIUM } : {}) });
  const report = { errors: [], disabledFailures: [], contrastFailures: [], themes: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    page.on('pageerror', e => report.errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    // Font CDNs are not part of the kit's offline contract.
    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.fulfill({ status: 200, body: '', contentType: 'text/css' }));
    await page.goto(`${base}/fleet.html`);
    await page.waitForSelector('html.ready');
    const themes = await page.evaluate(async () => (await import('./js/themes.js')).state.themes.map(t => ({ id: t.id, scheme: t.scheme })));
    for (const theme of themes) {
      await page.evaluate(async id => (await import('./js/themes.js')).setTheme(id), theme.id);
      let all = [];
      // W5's recorded backdrop must stay covered even if gallery layout changes.
      if (theme.scheme === 'light') {
        await page.evaluate(() => {
          const root = document.createElement('div'); root.className = 'fl-root'; root.style.background = '#ececed';
          const label = document.createElement('span'); label.className = 'fh-sub'; label.textContent = 'W5 muted subtitle'; root.append(label); document.body.append(root);
        });
        all.push(...(await page.evaluate(measure)).rows);
        await page.evaluate(() => document.body.lastElementChild.remove());
      }
      for (const view of ['agents', 'machines', 'k3s']) {
        await page.selectOption('[aria-label="Hosts view"]', view);
        await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
        const result = await page.evaluate(measure);
        all.push(...result.rows);
        report.disabledFailures.push(...result.disabledFailures.map(r => ({ theme: theme.id, view, ...r })));
      }
      if (!all.length) throw new Error(`No muted text measured for ${theme.id}`);
      report.themes.push({ ...theme, samples: all.length, minimum: Math.min(...all.map(r => r.ratio)), weakest: all.reduce((a, b) => a.ratio < b.ratio ? a : b) });
      report.contrastFailures.push(...all.filter(r => r.ratio < 4.5 - 1e-6).map(r => ({ theme: theme.id, ...r })));
      if (process.env.EUI_SCREENSHOTS && ['t3-light', 't3-dark'].includes(theme.id)) {
        fs.mkdirSync(process.env.EUI_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: `${process.env.EUI_SCREENSHOTS}/${theme.id}.png` });
      }
    }
    await page.goto(`${base}/index.html`);
    await page.waitForSelector('.eu-card');
    await page.evaluate(async () => {
      const { KINDS_F } = await import('./js/kinds-f.js');
      const { catalog } = await import('./js/shell.js');
      const { rng } = await import('./js/motion.js');
      const card = KINDS_F.health.make(catalog.byId.oura, rng('w5-health'));
      document.body.replaceChildren(card.el);
    });
    await page.getByRole('button', { name: 'Add plan to calendar', exact: true }).click();
    const completed = page.locator('button:disabled');
    if (!(await completed.getAttribute('title'))?.trim() || !/already|completed/i.test(await completed.innerText())) report.disabledFailures.push({ gallery: 'health', text: await completed.innerText(), title: await completed.getAttribute('title') });
    if (process.env.EUI_SCREENSHOTS) await page.screenshot({ path: `${process.env.EUI_SCREENSHOTS}/gallery-health.png` });
  } finally { await browser.close(); }
  return report;
}
