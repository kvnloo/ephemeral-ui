import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const file = path => new URL('../' + path, import.meta.url);
const read = path => readFileSync(file(path), 'utf8');
const json = path => JSON.parse(read(path));

// Editorial metadata for direct dependencies. Versions and licenses come from
// the respective lockfiles; an unclassified package fails generation.
const npmCredits = {
  '@openuidev/lang-core': ['openui', 'OpenUI', 'https://github.com/thesysdev/openui', 'kit',
    'By Thesys; the generative UI language and renderer these cards build on. The export tool parses programs with @openuidev/lang-core.'],
  'simple-icons': ['simple-icons', 'simple-icons', 'https://simpleicons.org', 'kit',
    'Brand marks and colours shipped as kit data; marks are trademarks of their owners.'],
  three: ['three', 'three.js', 'https://threejs.org', 'kit', '3D studio cards and their loaders.'],
  ajv: ['ajv', 'Ajv', 'https://ajv.js.org', 'tools', 'Schema validation in tests.'],
  esbuild: ['esbuild', 'esbuild', 'https://esbuild.github.io', 'tools', 'Bundles exported cards.'],
  linkedom: ['linkedom', 'linkedom', 'https://github.com/WebReflection/linkedom', 'tools', 'DOM implementation for tests.'],
  playwright: ['playwright', 'Playwright', 'https://playwright.dev', 'tools',
    'Chromium QA receipts, browser specs and screenshot tooling; not shipped with the site.'],
  zod: ['zod', 'Zod', 'https://zod.dev', 'tools', 'OpenUI parser peer dependency for card export.'],
};

export function collectLibraries() {
  const entries = new Map();
  for (const dir of ['', 'tools/']) {
    const pkg = json(dir + 'package.json');
    const lock = json(dir + 'package-lock.json').packages;
    const direct = Object.assign({}, ...['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
      .map(field => pkg[field]));
    for (const [name, range] of Object.entries(direct)) {
      assert.ok(npmCredits[name], 'Add credit metadata for ' + name);
      const [id, upstream, url, group, note] = npmCredits[name];
      const { version, license } = lock['node_modules/' + name] ?? {};
      assert.ok(version && license, 'Missing locked version or license for ' + name);
      assert.ok(!entries.has(id), 'Classify multiple declarations of ' + name);
      entries.set(id, { id, upstream, url, group, license, version, note,
        sources: [{ packageJson: dir + 'package.json', package: name, range }] });
    }
  }

  // No package metadata in the vendored decoder; its source header records both.
  const decoder = 'src/vendor/addons/libs/meshopt_decoder.module.js';
  const header = read(decoder).slice(0, 400);
  const meshopt = header.match(/Built from meshoptimizer ([\d.]+)/);
  assert.ok(meshopt && header.includes('MIT License'), 'Review meshoptimizer vendor metadata');
  entries.set('meshoptimizer', {
    id: 'meshoptimizer', upstream: 'meshoptimizer', url: 'https://github.com/zeux/meshoptimizer',
    group: 'kit', license: 'MIT', version: meshopt[1], note: 'Decodes compressed 3D meshes.',
    sources: [],
  });

  const vendorOwners = {
    'src/vendor/three.min.js': 'three',
    'src/vendor/addons/LICENSE': 'three',
    'src/vendor/addons/environments/RoomEnvironment.js': 'three',
    'src/vendor/addons/loaders/GLTFLoader.js': 'three',
    'src/vendor/addons/utils/BufferGeometryUtils.js': 'three',
    'src/vendor/addons/utils/SkeletonUtils.js': 'three',
    [decoder]: 'meshoptimizer',
  };
  const vendorFiles = readdirSync(file('src/vendor/'), { recursive: true, withFileTypes: true })
    .filter(entry => !entry.isDirectory())
    .map(entry => relative(fileURLToPath(file('')), join(entry.parentPath ?? entry.path, entry.name)))
    .map(path => path.split(sep).join('/')).sort();
  assert.deepEqual(vendorFiles, Object.keys(vendorOwners).sort(), 'Classify changes under src/vendor');
  for (const path of vendorFiles) entries.get(vendorOwners[path]).sources.push({ path });
  // tools/vendor contains a local extraction script and host theme data, not
  // vendored executables. The host data is still acknowledged in the kit.
  assert.deepEqual(readdirSync(file('tools/vendor/')).sort(),
    ['dump-hermes.sh', 'hermes-themes.json'], 'Review changes under tools/vendor');

  const references = [
    ['omp-stats', 'omp-stats', 'https://github.com/can1357/oh-my-pi', 'kit', 'MIT',
      'Trace card shapes and API from @oh-my-pi/omp-stats.', 'src/js/stats-lib.js'],
    ['t3-code', 'T3 Code', 'https://github.com/pingdotgg/t3code', 'kit', 'MIT',
      'Host theme tokens.', 'tools/themes.py'],
    ['hermes-agent', 'Hermes Agent', 'https://github.com/NousResearch/hermes-agent', 'kit', 'MIT',
      'Host theme tokens.', 'tools/vendor/hermes-themes.json'],
    ['tailwind-css', 'Tailwind CSS', 'https://tailwindcss.com', 'kit', 'MIT',
      'Colour ramps shipped in the host theme data.', 'tools/themes.py'],
  ];
  for (const [id, upstream, url, group, license, note, path] of references) {
    entries.set(id, { id, upstream, url, group, license, note, sources: [{ path }] });
  }
  return [...entries.values()].sort((a, b) =>
    a.id === 'openui' ? -1 : b.id === 'openui' ? 1 :
      a.group.localeCompare(b.group, 'en') || a.id.localeCompare(b.id, 'en'));
}

const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export const groups = [['kit', 'Kit libraries and data'], ['tools', 'Tool-only libraries']];

export function renderCredits(libraries, html) {
  return groups.map(([group, heading]) => {
    const rows = libraries.filter(entry => entry.group === group).map(({ upstream, url, license, version, note }) => {
      const label = ` (${[version, license].filter(Boolean).join('; ')}): ${note}`;
      return html
        ? `      <li><a href="${escapeHtml(url)}">${escapeHtml(upstream)}</a>${escapeHtml(label)}</li>`
        : `- [${upstream}](${url})${label}`;
    }).join('\n');
    return html
      ? `    <div data-credit-group="${group}"><b>${heading}</b>\n    <ul>\n${rows}\n    </ul></div>`
      : `### ${heading}\n\n${rows}`;
  }).join('\n\n');
}

export const start = '<!-- BEGIN LIBRARY CREDITS -->';
export const end = '<!-- END LIBRARY CREDITS -->';

function updateCredits(path, credits) {
  const text = read(path);
  const before = text.indexOf(start);
  const after = text.indexOf(end);
  assert.ok(before >= 0 && after > before, 'Missing credit markers in ' + path);
  writeFileSync(file(path), text.slice(0, before + start.length) + '\n' + credits + '\n' + text.slice(after));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const libraries = collectLibraries();
  writeFileSync(file('docs/library-credits.json'), JSON.stringify(libraries, null, 2) + '\n');
  updateCredits('README.md', renderCredits(libraries, false));
  updateCredits('src/index.html', renderCredits(libraries, true));
}
