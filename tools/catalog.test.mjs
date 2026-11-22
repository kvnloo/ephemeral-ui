// The shared card catalog: fresh, valid, complete, and every fixture renders to its props.
// This is the reference gallery test; each app's own gallery test asserts the same (catalog/README.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { build, serialize, kinds, render, propsOf, CATALOG_FILE } from "./card-catalog.mjs";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));
const text = fs.readFileSync(CATALOG_FILE, "utf8");
const catalog = JSON.parse(text);
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const all = catalog.kinds.flatMap((k) => k.fixtures.map((f) => [k, f]));

test("catalog/catalog.json is what tools/card-catalog.mjs generates (run it after changing a kind)", async () => {
  assert.equal(text, serialize(await build()));
});

test("catalog validates against catalog/catalog.schema.json", () => {
  const validate = ajv.compile(read("../catalog/catalog.schema.json"));
  assert.ok(validate(catalog), ajv.errorsText(validate.errors));
});

test("every kind the modules export is listed once, with 1-3 fixtures and unique ids", async () => {
  const { list } = await kinds();
  assert.deepEqual(catalog.kinds.map((k) => k.kind), [...list.keys()]);
  assert.equal(catalog.count.kinds, list.size);
  assert.equal(catalog.count.fixtures, all.length);
  for (const k of catalog.kinds) assert.ok(k.fixtures.length >= 1 && k.fixtures.length <= 3, k.kind);
  const ids = all.map(([, f]) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(catalog.version, fs.readFileSync(new URL("../catalog/VERSION", import.meta.url), "utf8").trim());
});

test("programmable fixtures are card.v0 documents; input fixtures match $defs.appInput", () => {
  const card = read("../src/schema/card.v0.json");
  const validate = ajv.compile(card);
  let inputs = 0;
  for (const [k, f] of all) {
    assert.equal(f.card.kind, k.kind);
    assert.equal(f.props.kind, k.kind);
    if (k.programmable) assert.ok(validate(f.card), `${f.id}: ${ajv.errorsText(validate.errors)}`);
    if (f.state === "input") {
      const v = ajv.compile(card.$defs.appInput[k.kind]);
      assert.ok(v(f.card.input), `${f.id}: ${ajv.errorsText(v.errors)}`);
      inputs++;
    }
  }
  assert.equal(inputs, Object.keys(card.$defs.appInput).filter((k) => k !== "description").length);
});

test("every fixture renders with the reference renderer and reports its props", async () => {
  const { list } = await kinds();
  for (const [k, f] of all) {
    const c = await render(f, list.get(k.kind).def);
    assert.ok(c.el?.nodeType === 1, `${f.id}: no element`);
    assert.ok(c.el.textContent.trim().length > 0, `${f.id}: empty card`);
    assert.doesNotMatch(c.el.textContent, /\bundefined\b|\bNaN\b/, `${f.id}: undefined or NaN in the card`);
    assert.deepEqual(propsOf(c.spec), f.props, f.id);
    if (f.state === "unavailable") assert.ok(c.spec.unavailable, `${f.id}: should render the unavailable state`);
    if (f.state === "example") assert.equal(c.spec.unavailable, undefined, `${f.id}: example data was rejected`);
    c.el.remove();
  }
});
