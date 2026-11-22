import assert from "node:assert/strict";
import { test } from "node:test";
import { catalog, checkInventory, inventory } from "./qa-inventory.mjs";

test("QA inventory accounts for the catalog and the deployed-only kind manifest", () => {
  checkInventory(inventory());
});

test("new kinds, stale rows, and removal of a still-shipped kind cannot silently pass", () => {
  const data = inventory();
  const { kind } = catalog.kinds[0];
  assert.throws(() => checkInventory(data, [...catalog.kinds, { ...catalog.kinds[0], kind: "missing" }]), /missing audit row/);
  data.kinds.stale = { status: "qualified" };
  assert.throws(() => checkInventory(data), /stale row/);
  data.kinds.stale = { status: "removed", reason: "Retired from both surfaces" };
  checkInventory(data);
  data.kinds[kind] = { status: "removed", reason: "Still listed in catalog" };
  assert.throws(() => checkInventory(data), new RegExp(kind));
});

test("qualifying requires both viewport receipts and actual WebGL for 3D", () => {
  const data = inventory();
  const kind = catalog.kinds.find(k => k.module.endsWith("/kinds-3d.js")).kind;
  const row = data.kinds[kind];
  row.status = "qualified";
  row.grade = "A";
  for (const receipt of Object.values(row.receipts)) Object.assign(receipt, {
    overflow: false, control: "Primary action", keyboard: "event:select", pointer: "event:select", webgl: false,
  });
  assert.throws(() => checkInventory(data), /WebGL evidence/);
  Object.values(row.receipts).forEach(receipt => { receipt.webgl = true; });
  delete row.receipts["390"];
  assert.throws(() => checkInventory(data), /receipt widths/);
});
