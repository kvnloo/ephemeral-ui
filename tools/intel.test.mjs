import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const { parseHTML } = await import(pathToFileURL(process.env.EUI_DOM_MODULE).href);
const { document, window } = parseHTML('<html><body></body></html>');
Object.assign(globalThis, { document, window, CustomEvent: window.CustomEvent, matchMedia: () => ({ matches: true }), requestAnimationFrame: () => 0, cancelAnimationFrame() {} });
const { state } = await import('../src/js/themes.js');
state.base = JSON.parse(fs.readFileSync(new URL('../src/data/themes.json', import.meta.url))).themes.find(t => t.id === 't3-dark');
const { KINDS_INTEL } = await import('../src/js/intel-suite.js');
const make = (data, opts) => KINDS_INTEL['intel-suite'].make({ id: 'glide', name: 'Glide', hex: null }, null, data, opts);
const fixture = async () => structuredClone((await import('../src/js/intel-data.js')).INTEL_DEMO);
const click = el => el.dispatchEvent(new window.Event('click', { bubbles: true }));
const keys = ['climbs', 'routes', 'memory', 'failures', 'trace'];

function entities(detail, data) {
  const fields = { tab: ['tab'], 'open-climb': ['id'], 'open-skill': ['skill'], 'open-failure': ['sig'], refresh: [] };
  assert.deepEqual(Object.keys(detail.entities).sort(), fields[detail.action]?.slice().sort());
  switch (detail.action) {
    case 'tab': assert.ok(Number.isInteger(detail.entities.tab)); assert.ok(detail.entities.tab >= 0 && detail.entities.tab <= 4); break;
    case 'open-climb': assert.ok(data.climbs.some(c => c.id === detail.entities.id)); break;
    case 'open-skill': assert.ok(data.routes.some(r => r.skill === detail.entities.skill)); break;
    case 'open-failure': assert.ok(data.failures.some(f => f.sig === detail.entities.sig)); break;
    case 'refresh': assert.deepEqual(detail.entities, {}); break;
    default: assert.fail(`Unexpected action ${detail.action}`);
  }
}

test('missing and invalid data is unavailable and names /intel, never sample data', () => {
  for (const data of [undefined, null, {}, { data: null }, { kind: 'intel-suite', app: 'glide' }, { data: {}, demo: true }]) {
    const c = make(data);
    assert.match(c.el.textContent, /unavailable/i);
    assert.match(c.el.textContent, /\/intel/);
    assert.equal(c.el.querySelectorAll('button:not([disabled])').length, 0);
  }
});

test('fixture and published schema agree; validator rejects malformed data and all bounds', async () => {
  const { validateIntel, INTEL_SCHEMA } = await import('../src/js/intel-schema.js');
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../src/schema/intel.v0.json', import.meta.url))), INTEL_SCHEMA);
  const data = await fixture();
  assert.deepEqual(validateIntel(data), { ok: true, errors: [] });
  for (const bad of [null, [], {}, { ...data, at: 'yesterday' }, { ...data, at: '2026-02-30T12:00:00Z' }, { ...data, at: 123 }, { ...data, extra: true }]) assert.equal(validateIntel(bad).ok, false);
  const mutations = [
    d => delete d.notes, d => d.tab = -1, d => d.tab = 5, d => d.tab = 1.5,
    d => d.climbs[0].label = 'x'.repeat(201), d => d.climbs[0].points = Array(65).fill(1),
    d => d.climbs[0].points[0] = NaN, d => d.climbs[0].best = Infinity,
    d => d.climbs[0].metric = null, d => d.climbs[0].unit = 2,
    d => d.routes = Array(13).fill(d.routes[0]), d => d.routes[0].hits = 1.5,
    d => d.routes[0].corrected = -1, d => d.memory[0].level = 'L6', d => d.memory[0].stale = 1,
    d => d.failures = Array(13).fill(d.failures[0]), d => d.failures[0].spark = '2',
    d => d.failures[0].spark = '1'.repeat(15), d => d.failures[0].count = -1,
    d => d.failures[0].status = 'ignored', d => d.trace[0].spans[0] = [0, 1],
    d => d.trace[0].spans[0][2] = 'x', d => d.trace[0].spans[0][0] = -1,
    d => d.trace[0].spans[0] = [2, 1, 'm'],
    d => d.trace = [{ lane: 'a', spans: Array(101).fill([0, 1, 'm']) }, { lane: 'b', spans: Array(100).fill([0, 1, 't']) }],
    d => d.notes = [false], d => d.notes = ['x'.repeat(201)]
  ];
  for (const mutate of mutations) { const bad = structuredClone(data); mutate(bad); assert.equal(validateIntel(bad).ok, false, String(mutate)); }
  for (const key of keys) data[key] = [];
  assert.equal(validateIntel(data).ok, true);
  data.trace = [{ lane: 'a', spans: Array(200).fill([0, 1, 'm']) }];
  assert.equal(validateIntel(data).ok, true);
});

test('all five tabs render card data and explicit demo without mutation; data.tab wins', async () => {
  const data = await fixture(), before = JSON.stringify(data);
  for (let tab = 0; tab < 5; tab++) {
    const c = make({ kind: 'intel-suite', app: 'glide', data: { ...data, tab } }, { tab: 4 });
    await c.play();
    assert.equal(c.el.querySelector('[aria-selected="true"]').textContent, ['Hill climbs', 'Skill router', 'Memory', 'Failures', 'Trace'][tab]);
    assert.ok(c.el.querySelector(`.is-${keys[tab]}`));
    assert.ok(!/undefined|NaN/.test(c.el.textContent));
    assert.match(c.el.textContent, /updated/);
    assert.equal(c.el.querySelector('time').getAttribute('datetime'), data.at);
    assert.equal(c.spec.provenance, 'card-data');
  }
  for (const c of [make({ demo: true }), make(undefined, { demo: true })]) {
    for (let tab = 0; tab < 5; tab++) { c.setTab(tab); assert.ok(c.el.querySelector(`.is-${keys[tab]}`)); }
    assert.equal(c.spec.provenance, 'authored-example');
  }
  assert.equal(JSON.stringify(data), before);
  data.climbs[0].label = '<script>custom climb</script>'; data.climbs[0].points = [7]; data.climbs[0].best = 7;
  const c = make(data); assert.ok(c.el.textContent.includes(data.climbs[0].label)); assert.equal(c.el.querySelectorAll('script').length, 0);
});

test('empty and single-point climbs, zero-hit routes and empty trace spans stay finite', async () => {
  for (const points of [[], [0], [-3, -2, -4]]) {
    const data = await fixture(); data.climbs[0].points = points; data.climbs[0].best = points.length ? Math.max(...points) : 0;
    data.routes = [{ skill: 'unused', hits: 0, corrected: 0 }]; data.trace = [{ lane: 'empty', spans: [] }];
    const c = make(data);
    for (const tab of [0, 1, 4]) { c.setTab(tab); assert.doesNotMatch(c.el.toString(), /NaN|Infinity|undefined/); }
  }
});

test('each empty source gets its matching note and unavailable state, other tabs stay usable', async () => {
  const data = await fixture();
  data.notes = keys.map(k => `${k}: synthetic source missing`);
  for (let tab = 0; tab < 5; tab++) {
    const c = make({ ...data, [keys[tab]]: [], tab });
    assert.match(c.el.querySelector('.is-stage').textContent, /unavailable/i);
    assert.ok(c.el.querySelector('.is-stage').textContent.includes(data.notes[tab]));
    assert.ok(!c.el.querySelector('.is-stage').textContent.includes(data.notes[(tab + 1) % 5]));
    c.setTab((tab + 1) % 5); assert.equal(c.el.querySelector('.is-tab-unavailable'), null);
  }
  const c = make({ ...data, trace: [], notes: [], tab: 4 });
  assert.match(c.el.querySelector('.is-stage').textContent, /No trace data.*\/intel/s);
});

test('EVERY enabled button on every tab dispatches one contract action with exact source entities', async () => {
  const data = await fixture(), { INTEL_ACTIONS } = await import('../src/js/intel-schema.js');
  const seenActions = new Set();
  for (let tab = 0; tab < 5; tab++) {
    const c = make({ ...data, tab }), seen = [];
    c.el.addEventListener('eui:intent', e => seen.push(e.detail));
    for (const button of [...c.el.querySelectorAll('button')]) {
      if (button.disabled) { assert.ok(button.title); assert.ok(button.textContent.trim()); continue; }
      // A tab click replaces its pane. Reset before clicking a captured pane control.
      if (!c.el.contains(button)) continue;
      const before = seen.length; click(button); assert.equal(seen.length, before + 1, button.textContent);
      const d = seen.at(-1); assert.ok(INTEL_ACTIONS.includes(d.action)); entities(d, data); seenActions.add(d.action);
    }
    c.setTab(tab);
    for (const button of [...c.el.querySelectorAll('.is-stage button')]) {
      const before = seen.length; click(button); assert.equal(seen.length, before + 1, button.textContent);
      const d = seen.at(-1); assert.ok(INTEL_ACTIONS.includes(d.action)); entities(d, data); seenActions.add(d.action);
    }
  }
  assert.deepEqual([...seenActions].sort(), [...INTEL_ACTIONS].sort());
});

test('every intel colour uses theme tokens and the harness explicitly opts into demo', () => {
  const css = fs.readFileSync(new URL('../src/intel.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
  for (const token of ['--fl-surface', '--fl-ink', '--fl-hair', '--fl-gold']) assert.ok(css.includes(`var(${token})`));
  const html = fs.readFileSync(new URL('../src/intel.html', import.meta.url), 'utf8');
  assert.match(html, /demo:\s*true/);
});

test('headless browser: five tabs, every button, light/dark, 390/1280, long labels and empty/error docs', { skip: !process.env.EUI_BROWSER_URL }, async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(process.env.PLAYWRIGHT_FROM);
  const { chromium } = require('playwright');
  const browser = await chromium.launch(process.env.EUI_CHROMIUM ? { executablePath: process.env.EUI_CHROMIUM } : {});
  const data = await fixture();
  try {
    for (const width of [390, 1280]) for (const theme of ['t3-light', 't3-dark']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', e => errors.push(String(e)));
      await page.goto(`${process.env.EUI_BROWSER_URL}/intel.html#theme=${theme}`);
      await page.waitForSelector('html.ready');
      const layout = async () => {
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.is-root, .is-pane, .is-hero, .is-layer, .is-frow, .is-route')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className)), [], `${width}/${theme} overflow`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.evaluate(() => { const rows = {}; for (const b of document.querySelectorAll('.is-segb')) { const t = Math.round(b.getBoundingClientRect().top); rows[t] = (rows[t] || 0) + 1; } return Object.values(rows).some(n => n === 1) && Object.keys(rows).length > 1; }), false, `${width}/${theme} orphan tab`);
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.is-k, .is-value')].filter(e => { const range = document.createRange(); range.selectNodeContents(e); return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1; }).map(e => e.textContent)), [], `${width}/${theme} wrapped stats`);
      };
      for (let tab = 0; tab < 5; tab++) {
        await page.locator('[role="tab"]').nth(tab).click();
        await layout();
        const buttons = page.locator('button:not([role="tab"])');
        for (let i = 0; i < await buttons.count(); i++) {
          const before = await page.evaluate(() => window.__intel.intents.length);
          await buttons.nth(i).click();
          const events = await page.evaluate(n => window.__intel.intents.slice(n), before);
          assert.equal(events.length, 1); entities(events[0], data);
          assert.ok((await page.locator('.is-receipt').textContent()).trim());
        }
        if (theme === 't3-light') assert.notEqual(await page.locator('.is-hero').first().evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(0, 0, 0)');
      }
      const long = structuredClone(data);
      long.climbs[0].label = 'C'.repeat(200); long.climbs[0].metric = 'M'.repeat(200);
      long.routes[0].skill = 'R'.repeat(200); long.memory[0].name = 'L'.repeat(200);
      long.memory[0].size = 'S'.repeat(200); long.memory[0].fresh = 'F'.repeat(200);
      long.failures[0].sig = 'X'.repeat(200); long.failures[0].source = 'Y'.repeat(200); long.trace[0].lane = 'T'.repeat(200);
      await page.evaluate(async input => {
        const { KINDS_INTEL } = await import('./js/intel-suite.js');
        const c = KINDS_INTEL['intel-suite'].make({ id: 'glide', name: 'Glide', hex: null }, null, input);
        document.querySelector('.cell').replaceChildren(c.el); window.__intel.card = c;
      }, long);
      for (let tab = 0; tab < 5; tab++) { await page.locator('[role="tab"]').nth(tab).click(); await layout(); }
      const empty = { ...data, notes: keys.map(k => `${k}: synthetic source unavailable`) };
      for (const key of keys) empty[key] = [];
      await page.evaluate(async input => {
        const { KINDS_INTEL } = await import('./js/intel-suite.js');
        document.querySelector('.cell').replaceChildren(KINDS_INTEL['intel-suite'].make({ id: 'glide', name: 'Glide', hex: null }, null, { kind: 'intel-suite', app: 'glide', data: input }).el);
      }, empty);
      for (let tab = 0; tab < 5; tab++) {
        await page.locator('[role="tab"]').nth(tab).click(); await layout();
        assert.ok((await page.locator('.is-tab-unavailable').textContent()).includes(empty.notes[tab]));
        assert.match(await page.locator('.is-tab-unavailable').textContent(), /\/intel/);
      }
      await page.evaluate(async () => {
        const { KINDS_INTEL } = await import('./js/intel-suite.js');
        document.querySelector('.cell').replaceChildren(KINDS_INTEL['intel-suite'].make({ id: 'glide', name: 'Glide', hex: null }).el);
      });
      assert.match(await page.locator('.cell').textContent(), /unavailable.*\/intel/is);
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
});
