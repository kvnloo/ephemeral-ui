// K16: trace cards use omp /stats' own dark tokens, scoped to .k-trace (never leaking to the host page).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../src/trace.css", import.meta.url), "utf8");
const omp = (process.env.OMP_CHECKOUT || "../omp") + "/packages/stats/src/client/styles.css";

test("trace cards carry omp-stats' dark tokens inside .k-trace", () => {
  const block = css.match(/\n\.k-trace \{([^}]*)\}/)?.[1] ?? "";
  for (const t of ["--h-card: #0e0e10", "--h-fg: #ededef", "--h-primary: #f068c8", "background: #09090a"]) assert.ok(block.includes(t), t);
  assert.match(css, /\.k-trace \.os \{[^}]*--os-model: #5ad8e6/);
});

test("no host variable is redefined outside a .k-trace scope", () => {
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (/--h-[a-zA-Z]+\s*:/.test(body)) assert.match(sel.trim().split("\n").pop(), /^\.k-trace/, sel.trim());
  }
});

test("tokens match the omp-stats source when it is checked out", { skip: !(() => { try { readFileSync(omp); return true; } catch { return false; } })() }, () => {
  const src = readFileSync(omp, "utf8");
  for (const [k, v] of [["--card", "#0e0e10"], ["--ink-1", "#ededef"], ["--accent", "#f068c8"], ["--accent-a", "#5ad8e6"], ["--panel", "#09090a"]]) assert.ok(src.includes(`${k}: ${v};`), k);
});
