import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const { parseHTML } = await import(pathToFileURL(process.env.EUI_DOM_MODULE).href);
const { document, window } = parseHTML('<html><body></body></html>');
Object.assign(globalThis, { document, window, CustomEvent: window.CustomEvent, matchMedia: () => ({ matches: true }), requestAnimationFrame: () => 0, cancelAnimationFrame() {}, ResizeObserver: class { observe() {} disconnect() {} } });
const { state } = await import('../src/js/themes.js');
state.base = JSON.parse(fs.readFileSync(new URL('../src/data/themes.json', import.meta.url))).themes.find(t => t.id === 't3-dark');
const { HOSTS, PORTFOLIOS, FACTORY } = await import('../src/js/fleet-data.js');
const { KINDS_FLEET, FLEET_APPS } = await import('../src/js/kinds-fleet.js');
const fixtures = { 'fleet-hosts': { at: '2026-11-11T12:00:00Z', hosts: HOSTS }, 'fleet-portfolio': { at: '2026-11-11T12:00:00Z', portfolios: PORTFOLIOS }, 'fleet-factory': { at: '2026-11-11T12:00:00Z', ...FACTORY } };
const commands = { 'fleet-hosts': '/hosts', 'fleet-portfolio': '/portfolio', 'fleet-factory': '/factory graph' };
const make = (kind, data, opts) => KINDS_FLEET[kind].make({ id: FLEET_APPS[kind], name: 'Fleet', hex: null }, null, data, opts);
const click = el => el.dispatchEvent(new window.Event('click', { bubbles: true }));

test('missing or invalid data is unavailable, never synthetic', () => {
  for (const kind of Object.keys(fixtures)) for (const data of [undefined, {}, { at: 'bad' }]) {
    const c = make(kind, data);
    assert.match(c.el.textContent, /unavailable/i);
    assert.ok(c.el.textContent.includes(commands[kind]));
    assert.equal(c.el.querySelectorAll('button:not([disabled])').length, 0);
  }
});

test('validator and published schema accept fixtures and reject malformed docs', async () => {
  const { validateFleet, FLEET_SCHEMA } = await import('../src/js/fleet-schema.js');
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../src/schema/fleet.v0.json', import.meta.url))), FLEET_SCHEMA);
  for (const [kind, data] of Object.entries(fixtures)) {
    assert.deepEqual(validateFleet(kind, data), { ok: true, errors: [] });
    for (const bad of [null, [], {}, { ...data, at: 'yesterday' }, { ...data, at: '2026-02-30T12:00:00Z' }, { ...data, at: 123 }, { ...data, surprise: true }]) assert.equal(validateFleet(kind, bad).ok, false);
  }
  const bad = [
    ['fleet-hosts', d => d.hosts[0].gauges.cpu = 101],
    ['fleet-hosts', d => d.hosts[0].online = 'yes'],
    ['fleet-hosts', d => d.hosts[0].harnesses[0].agents[0].state = 'busy'],
    ['fleet-hosts', d => d.hosts = Array(65).fill(d.hosts[0])],
    ['fleet-hosts', d => d.hosts[0].label = 'x'.repeat(201)],
    ['fleet-hosts', d => d.hosts[0].k3s.pods[0][3] = -1],
    ['fleet-portfolio', d => d.portfolios.glide.products[0].features[0].tasks[0].status = 'unknown'],
    ['fleet-portfolio', d => d.portfolios.glide.products[0].features[0].horizon = 'soon'],
    ['fleet-factory', d => d.nodes = Array(513).fill(d.nodes[0])],
    ['fleet-factory', d => d.stats.verifyPass = 1.1],
    ['fleet-factory', d => d.nodes[0].col = 4],
    ['fleet-factory', d => d.edges[0][3] = 'true']
  ];
  for (const [kind, mutate] of bad) { const d = structuredClone(fixtures[kind]); mutate(d); assert.equal(validateFleet(kind, d).ok, false, String(mutate)); }
  assert.equal(validateFleet('unknown', {}).ok, false);
});

test('each kind renders its real fixture, card doc and explicit demo without mutation', async () => {
  const before = JSON.stringify(fixtures);
  for (const [kind, data] of Object.entries(fixtures)) {
    for (const c of [make(kind, data), make(kind, { kind, app: FLEET_APPS[kind], data }), make(kind, undefined, { demo: true }), make(kind, { demo: true })]) {
      await c.play();
      assert.equal(c.el.querySelector('.fl-unavailable'), null);
      assert.ok(!/undefined|NaN/.test(c.el.textContent));
      assert.match(c.el.textContent, /updated/);
      assert.ok(c.el.querySelectorAll('button').length > 0);
    }
  }
  assert.equal(JSON.stringify(fixtures), before);
  const data = structuredClone(fixtures['fleet-hosts']); data.hosts[0].label = '<script>not sample</script>';
  const c = make('fleet-hosts', data); assert.ok(c.el.textContent.includes(data.hosts[0].label)); assert.equal(c.el.querySelectorAll('script').length, 0);
});

function assertEntities(kind, detail, data) {
  const e = detail.entities;
  if (kind === 'fleet-hosts') {
    const host = data.hosts.find(h => h.id === e.host); assert.ok(host);
    if (detail.action === 'open-pod') assert.ok(host.k3s.pods.some(p => p[0] === e.ns && p[1] === e.name));
    else assert.ok(host.harnesses.some(h => h.agents.some(a => a.id === e.agent)));
  } else if (kind === 'fleet-portfolio') {
    const p = Object.values(data.portfolios).flatMap(p => p.products).find(p => p.id === e.product);
    const f = p?.features.find(f => f.id === e.feature); const t = f?.tasks.find(t => t.id === e.task);
    assert.ok(t); if (e.url !== undefined) assert.equal(e.url, t.url);
  } else { const n = data.nodes.find(n => n.id === e.node); assert.ok(n); if (e.url !== undefined) assert.equal(e.url, n.url); }
}

test('EVERY enabled button emits exactly one allowed action with source entity ids, across all views', async () => {
  const { FLEET_ACTIONS } = await import('../src/js/fleet-schema.js');
  for (const [kind, data] of Object.entries(fixtures)) {
    const c = make(kind, data), seen = [];
    c.el.addEventListener('eui:intent', e => seen.push(e.detail));
    const check = () => {
      for (const button of [...c.el.querySelectorAll('button')]) {
        if (!c.el.contains(button)) continue;
        if (button.disabled) { assert.ok(button.title); assert.ok(button.textContent.trim()); continue; }
        const count = seen.length; click(button); assert.equal(seen.length, count + 1, `${kind}: ${button.textContent}`);
        const detail = seen.at(-1); assert.ok(FLEET_ACTIONS[kind].includes(detail.action), detail.action); assertEntities(kind, detail, data);
      }
    };
    check();
    for (const tab of kind === 'fleet-hosts' ? ['agents', 'machines', 'k3s'] : kind === 'fleet-portfolio' ? ['tree', 'roadmap', 'links'] : ['spine', 'radial']) { c.show?.(tab); check(); }
    for (const node of [...c.el.querySelectorAll('[data-node]')]) {
      for (let repeat = 0; repeat < 2; repeat++) {
        const before = seen.length; click(node); assert.equal(seen.length, before + 1);
        assert.equal(seen.at(-1).action, 'open-node'); assertEntities(kind, seen.at(-1), data);
      }
      check();
    }
    for (const select of c.el.querySelectorAll('select')) for (const option of select.querySelectorAll('option')) { select.querySelectorAll('option').forEach(o => o.removeAttribute('selected')); option.setAttribute('selected', ''); select.dispatchEvent(new window.Event('change')); check(); }
    assert.ok(seen.length > 0);
  }
});

test('headless browser checks real layout, all controls and intent entities', { skip: !process.env.EUI_BROWSER_URL }, async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(process.env.PLAYWRIGHT_FROM);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
  try {
    for (const width of [1440, 390]) for (const theme of ['t3-dark', 't3-light', 'hermes-nous-dark']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', e => errors.push(String(e)));
      await page.goto(`${process.env.EUI_BROWSER_URL}/fleet.html#theme=${theme}`);
      await page.waitForSelector('html.ready');
      const check = async (selector = '.eu-card') => {
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.fl-root')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className)), [], `${width}/${theme} overflow`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
        const buttons = page.locator(`${selector} button`);
        for (let i = 0; i < await buttons.count(); i++) {
          const b = buttons.nth(i);
          if (await b.isDisabled()) { assert.ok(await b.getAttribute('title')); assert.ok(await b.textContent()); continue; }
          const before = await page.evaluate(() => window.__fleet.intents.length);
          await b.click();
          const emitted = await page.evaluate(n => window.__fleet.intents.slice(n), before);
          assert.equal(emitted.length, 1, await b.textContent());
          const d = emitted[0]; assert.ok((await import('../src/js/fleet-schema.js')).FLEET_ACTIONS[d.kind].includes(d.action));
          assertEntities(d.kind, d, fixtures[d.kind]);
        }
      };
      await check();
      for (const v of ['machines', 'k3s', 'agents']) { await page.selectOption('[aria-label="Hosts view"]', v); await check('.k-fleet-hosts'); }
      await page.check('[aria-label="Needs you only"]'); await check('.k-fleet-hosts'); await page.uncheck('[aria-label="Needs you only"]');
      for (const portfolio of Object.keys(PORTFOLIOS)) {
        await page.selectOption('[aria-label="Portfolio"]', portfolio);
        for (const v of ['tree', 'roadmap', 'links']) { await page.selectOption('[aria-label="Portfolio view"]', v); await check('.k-fleet-portfolio'); }
      }
      for (const v of ['spine', 'radial']) {
        await page.selectOption('[aria-label="Factory layout"]', v); await check('.k-fleet-factory');
        for (let i = 0; i < FACTORY.nodes.length; i++) {
          const before = await page.evaluate(() => window.__fleet.intents.length);
          await page.locator('[data-node]').nth(i).click();
          const emitted = await page.evaluate(n => window.__fleet.intents.slice(n), before);
          assert.equal(emitted.length, 1); assert.equal(emitted[0].action, 'open-node'); assertEntities('fleet-factory', emitted[0], fixtures['fleet-factory']);
        }
        const outside = await page.evaluate(() => {
          const s = document.querySelector('.ff-svg'), frame = s.getBoundingClientRect();
          return [...s.querySelectorAll('.ff-lbl')].filter(e => { const r = e.getBoundingClientRect(); return r.left < frame.left || r.right > frame.right || r.top < frame.top || r.bottom > frame.bottom; }).map(e => e.textContent);
        });
        assert.deepEqual(outside, [], `clipped graph labels ${width}/${v}`);
        const overlaps = await page.evaluate(() => {
          const labels = [...document.querySelectorAll('.ff-lbl')].map(e => ({ label: e.textContent, r: e.getBoundingClientRect() }));
          return labels.flatMap((a, i) => labels.slice(i + 1).filter(b => a.r.left < b.r.right && b.r.left < a.r.right && a.r.top < b.r.bottom && b.r.top < a.r.bottom).map(b => [a.label, b.label]));
        });
        assert.deepEqual(overlaps, [], `overlapping graph labels ${width}/${v}`);
      }
      assert.deepEqual(errors, []);
      if (theme === 't3-light') assert.notEqual(await page.locator('.ff-graph').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(0, 0, 0)');
      await page.close();
    }
  } finally { await browser.close(); }
});

test('fleet CSS uses theme tokens for every colour, no literal colours except var fallbacks', () => {
  for (const name of ['fleet', 'fleet-hosts', 'fleet-pm', 'fleet-factory']) {
    const css = fs.readFileSync(new URL(`../src/${name}.css`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/var\(--[\w-]+,\s*(?:#[\da-f]+|rgba?\([^)]*\))\)/gi, 'var(--fallback)');
    assert.doesNotMatch(css, /#[\da-f]{3,8}\b|rgba?\(/i, name);
  }
});

test('counts are pluralised correctly (regression: "1 agents")', async () => {
  const { plural } = await import('../src/js/fleet-hosts.js');
  assert.equal(plural(1, 'agent'), '1 agent');
  assert.equal(plural(0, 'agent'), '0 agents');
  assert.equal(plural(5, 'agent'), '5 agents');
});
