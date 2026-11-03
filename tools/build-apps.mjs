// Resolve tools/catalog.py into src/data/apps.json with simple-icons colours and paths.
// Usage: python3 tools/catalog.py > out/catalog.json && node tools/build-apps.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const si = require("./node_modules/simple-icons/index.js");
const pkg = JSON.parse(readFileSync(new URL("./node_modules/simple-icons/package.json", import.meta.url)));
const bySlug = Object.fromEntries(Object.values(si).map((i) => [i.slug, i]));
const cat = JSON.parse(readFileSync(new URL("../out/catalog.json", import.meta.url)));
const missing = [];
const apps = cat.apps.map((a) => {
  const icon = a.slug ? bySlug[a.slug] : null;
  if (a.slug && !icon) missing.push(`${a.name} (${a.slug})`);
  const id = a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { id, name: a.name, cat: a.cat, kinds: a.kinds, hex: icon ? "#" + icon.hex : null, path: icon ? icon.path : null, ...(a.oss ? { oss: true } : {}), ...(a.alt ? { alt: a.alt } : {}), ...(a.ui ? { ui: a.ui } : {}), ...(a.docs ? { docs: a.docs } : {}) };
});
if (missing.length) { console.error("unknown slugs:", missing.join(", ")); process.exit(1); }
mkdirSync(new URL("../src/data/", import.meta.url), { recursive: true });
const out = { source: `simple-icons ${pkg.version} (CC0 data; marks are trademarks of their owners)`, categories: cat.categories, apps };
writeFileSync(new URL("../src/data/apps.json", import.meta.url), JSON.stringify(out));
console.log(apps.length, "apps,", apps.filter((a) => a.hex).length, "with verified colours");
