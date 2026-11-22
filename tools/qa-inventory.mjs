import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
export const catalog = read("../catalog/catalog.json");
export const pages = read("../qa/pages.json");
export const inventory = () => read("../qa/inventory.json");
export const widths = ["390", "1280"];

export function checkInventory(data, catalogKinds = catalog.kinds, deployed = pages.fixtures) {
  assert.equal(data.version, 1);
  const shipped = new Map(catalogKinds.map(entry => [entry.kind, {
    surface: "catalog", fixtures: entry.fixtures.map(f => f.id), webgl: entry.module.endsWith("/kinds-3d.js"),
  }]));
  for (const kind of Object.keys(deployed)) if (!shipped.has(kind)) {
    shipped.set(kind, { surface: "pages", fixtures: [kind], webgl: false });
  }
  const open = [];
  for (const [kind, expected] of shipped) {
    const row = data.kinds[kind];
    assert.ok(row, `${kind}: missing audit row`);
    assert.equal(row.surface, expected.surface, `${kind}: wrong surface`);
    assert.match(row.grade, /^(S|A|B|C)$/, `${kind}: invalid grade`);
    const meetsBar = row.grade === "A" || row.grade === "S";
    assert.equal(row.status, meetsBar ? "qualified" : "below-bar", kind);
    assert.ok(row.reason?.trim(), `${kind}: missing grading rationale`);
    if (!meetsBar) open.push(kind);
    assert.deepEqual(Object.keys(row.receipts).sort(), widths.slice().sort(), `${kind}: receipt widths`);
    for (const width of widths) {
      const receipt = row.receipts[width];
      assert.ok(expected.fixtures.includes(receipt.fixture), `${kind}: unknown fixture`);
      assert.equal(typeof receipt.overflow, "boolean", kind);
      assert.equal(receipt.webgl, expected.webgl, `${kind}: missing or unexpected WebGL evidence`);
      assert.ok(receipt.control?.trim() && receipt.keyboard?.trim() && receipt.pointer?.trim(), `${kind}: missing control evidence`);
      if (meetsBar) {
        assert.equal(receipt.overflow, false, `${kind}: overflows the viewport`);
      }
    }
  }
  for (const [kind, row] of Object.entries(data.kinds)) if (!shipped.has(kind)) {
    assert.equal(row.status, "removed", `${kind}: stale row (not shipped)`);
    assert.ok(row.reason?.trim(), `${kind}: missing removal rationale`);
    assert.ok(!row.grade && !row.receipts, `${kind}: removal is not a passing grade`);
  }
  return open;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const open = checkInventory(inventory());
  console.log(`QA inventory covers ${catalog.count.kinds} catalog kinds and the pinned Pages manifest; ${open.length} below bar.`);
  if (open.length) {
    console.log(open.join(", "));
    if (!process.argv.includes("--allow-below-bar")) process.exitCode = 1;
  }
}
