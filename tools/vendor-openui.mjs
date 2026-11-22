#!/usr/bin/env node
// src/vendor/openui-lang-core.js: @openuidev/lang-core (MIT, the package.json pin) bundled as one ES module,
// so the browser (src/providers.html) parses OpenUI Lang with the same parser tools/export-cards.mjs uses.
//   node tools/vendor-openui.mjs           # rewrite it
//   node tools/vendor-openui.mjs --check   # exit 1 when it is not what the pinned package builds
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
export const VENDOR_FILE = path.join(root, "src/vendor/openui-lang-core.js");

export async function bundle() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "node_modules/@openuidev/lang-core/package.json"), "utf8"));
  const r = await build({ stdin: { contents: 'export { createParser } from "@openuidev/lang-core";', resolveDir: root, loader: "js" },
    bundle: true, format: "esm", platform: "browser", minify: true, write: false, legalComments: "none", logLevel: "error" });
  return `// @openuidev/lang-core ${pkg.version} (${pkg.license}, https://github.com/thesysdev/openui), bundled by tools/vendor-openui.mjs. Do not edit.\n${r.outputFiles[0].text}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = await bundle();
  if (process.argv.includes("--check")) {
    const ok = fs.existsSync(VENDOR_FILE) && fs.readFileSync(VENDOR_FILE, "utf8") === text;
    console.log(ok ? `${path.relative(root, VENDOR_FILE)} is up to date` : `${path.relative(root, VENDOR_FILE)} is stale: run node tools/vendor-openui.mjs`);
    process.exit(ok ? 0 : 1);
  }
  fs.writeFileSync(VENDOR_FILE, text);
  console.log(`wrote ${path.relative(root, VENDOR_FILE)} (${Buffer.byteLength(text)} bytes)`);
}
