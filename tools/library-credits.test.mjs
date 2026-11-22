import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { collectLibraries, end, groups, renderCredits, start } from './library-credits.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('docs/library-credits.json'));

test('library manifest is current with direct dependencies and vendored sources', () => {
  assert.deepEqual(manifest, collectLibraries(), 'Run node tools/library-credits.mjs');
  assert.equal(manifest[0].upstream, 'OpenUI');
  assert.equal(manifest[0].group, 'kit');
});

test('README and site list every library, with OpenUI first and tools separate', () => {
  const readme = read('README.md').split('\n## Credits\n')[1];
  const site = parseHTML(read('src/index.html')).document.querySelector('#credits');
  for (const [text, html] of [[readme, false], [site.innerHTML, true]]) {
    const section = text.split(start)[1]?.split(end)[0]?.trim();
    assert.equal(section, renderCredits(manifest, html).trim(), 'Run node tools/library-credits.mjs');
  }
  const siteGroups = [...site.querySelectorAll('[data-credit-group]')];
  assert.deepEqual(siteGroups.map(el => el.dataset.creditGroup), groups.map(([id]) => id));
  for (const el of siteGroups) {
    assert.deepEqual([...el.querySelectorAll('li a')].map(link => link.textContent),
      manifest.filter(entry => entry.group === el.dataset.creditGroup).map(entry => entry.upstream));
  }
});
