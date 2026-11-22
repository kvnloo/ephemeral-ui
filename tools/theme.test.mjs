// Check the shared theme against its schema and the kit. With a Glide checkout,
// also verify Glide's pin against the committed theme and catalog bytes:
//   GLIDE_DIR=<path to kvnloo/glide> node --test tools/theme.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";

globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { ease, spring, springs } = await import("../src/js/motion.js");
const { contrast } = await import("../src/js/themes.js");

const file = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const theme = JSON.parse(file("../theme/glide.json"));
const schema = JSON.parse(file("../theme/tokens.schema.json"));
const kit = JSON.parse(file("../src/data/themes.json")).themes;
const css = file("../src/styles.css"), html = file("../src/index.html");
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

test("glide.json validates against tokens.schema.json", () => {
  assert.ok(validate(theme), ajv.errorsText(validate.errors));
});

test("the schema rejects a bad hex, a missing scheme, a type size under 10 and a speed default other than 1", () => {
  const bad = (f) => { const t = structuredClone(theme); f(t); return validate(t); };
  assert.equal(bad((t) => (t.color.dark.bg = "black")), false);
  assert.equal(bad((t) => delete t.color.light), false);
  assert.equal(bad((t) => (t.type.size.label = 8)), false);
  assert.equal(bad((t) => (t.motion.speed.default = 2)), false);
  assert.equal(bad((t) => delete t.brand.name), false);
});

test("light is the kit's default light (t3-light) token for token, with its radius and fonts", () => {
  const t3 = kit.find((t) => t.id === "t3-light");
  for (const [k, v] of Object.entries(theme.color.light)) assert.equal(v, t3[k]?.toLowerCase(), `color.light.${k}`);
  assert.equal(theme.radius.base, t3.radius);
  assert.equal(theme.radius.lg, t3.radius + 4); // themes.js apply(): --h-radius-lg for non-Hermes hosts
  assert.equal(theme.type.family.sans, t3.font);
  assert.equal(theme.type.family.mono, t3.mono);
  assert.equal(theme.type.family.serif, css.match(/--serif: ([^;]+);/)[1]);
  assert.match(css, new RegExp(`body \\{[^}]*font: ${theme.type.base.size}px/${theme.type.base.lineHeight} `));
  assert.match(css, new RegExp(`--pad: calc\\(${theme.space.pad}px \\* var\\(--h-density\\)\\)`));
});

test("motion matches motion.js, the speed control and the theme reveal", () => {
  for (const k of ["out", "inOut", "emph", "in"]) assert.equal(theme.motion.easing[k], ease[k], `easing.${k}`);
  for (const [k, p] of Object.entries(theme.motion.spring)) assert.deepEqual(spring(p), springs[k], `spring.${k}`);
  assert.deepEqual(Object.keys(theme.motion.spring), Object.keys(springs));
  const speed = html.match(/<input id="c-speed" type="range" min="([\d.]+)" max="([\d.]+)"/);
  assert.equal(theme.motion.speed.min, +speed[1]);
  assert.equal(theme.motion.speed.max, +speed[2]);
  assert.ok(theme.motion.speed.turbo > 1 && theme.motion.speed.turbo <= theme.motion.speed.max, "turbo is a speed the kit's control reaches");
  assert.match(file("../src/js/themes.js"), new RegExp(`duration: ${theme.motion.duration.reveal} / motion\\.speed`));
  assert.match(file("../src/js/motion.js"), new RegExp(`o\\.duration \\?\\? ${theme.motion.duration.slow}\\)`));
});

test("glass levels are the blurs the kit's stylesheet uses", () => {
  const g = theme.glass;
  assert.match(css, new RegExp(`header\\.top \\{[^}]*${g.bar.tint}%, transparent\\); backdrop-filter: blur\\(${g.bar.blur}px\\) saturate\\(${g.bar.saturate / 100}\\)`));
  assert.match(css, new RegExp(`\\.composer \\{[^}]*${g.composer.tint}%, transparent\\); backdrop-filter: blur\\(${g.composer.blur}px\\) saturate\\(${g.composer.saturate / 100}\\)`));
  assert.match(css, new RegExp(`#drawer \\.scrim \\{[^}]*backdrop-filter: blur\\(${g.scrim.blur}px\\)`));
  assert.match(css, new RegExp(`#palette::backdrop \\{[^}]*backdrop-filter: blur\\(${g.overlay.blur}px\\)`));
  const levels = Object.values(g).map((l) => l.blur);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b), "levels run from none to max");
});

test("text reads in both schemes: fg, mutedFg on bg and primaryFg on primary at 4.5:1", () => {
  for (const [scheme, c] of Object.entries(theme.color)) {
    for (const [ink, on] of [["fg", "bg"], ["mutedFg", "bg"], ["fg", "card"], ["primaryFg", "primary"]]) {
      const r = contrast(c[ink], c[on]);
      assert.ok(r >= 4.5, `${scheme}: ${ink} on ${on} is ${r.toFixed(2)}:1`);
    }
  }
});

const glide = process.env.GLIDE_DIR;
test("Glide's shared theme and catalog hashes match the pinned ephemeral-ui commit",
  { skip: !glide && "set GLIDE_DIR to a kvnloo/glide checkout" }, (t) => {
    const pinPath = "glide/themes/shared/PIN.json";
    const pin = JSON.parse(fs.readFileSync(path.join(glide, pinPath), "utf8"));
    assert.equal(pin?.repo, "kvnloo/ephemeral-ui", `${pinPath}: unexpected repo`);
    assert.match(pin.sha ?? "", /^[0-9a-f]{40}$/, `${pinPath}: expected a full commit SHA`);

    const cwd = fileURLToPath(new URL("../", import.meta.url));
    const git = (...args) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    assert.doesNotThrow(() => git("cat-file", "-e", `${pin.sha}^{commit}`),
      `${pinPath}: pinned commit ${pin.sha} is unavailable; fetch ephemeral-ui history and retry`);

    for (const [file, recorded] of [
      ["theme/glide.json", pin.files?.["theme/glide.json"]],
      ["theme/tokens.schema.json", pin.files?.["theme/tokens.schema.json"]],
      ["catalog/catalog.json", pin.catalog?.sha256],
    ]) {
      assert.match(recorded ?? "", /^[0-9a-f]{64}$/, `${pinPath}: missing or invalid SHA-256 for ${file}`);
      const actual = createHash("sha256").update(git("cat-file", "blob", `${pin.sha}:${file}`)).digest("hex");
      assert.equal(recorded, actual, `${pinPath}: SHA-256 mismatch for ${file} at ${pin.sha} (recorded vs. committed)`);
    }

    const main = git("rev-parse", "origin/main").toString().trim();
    if (pin.sha !== main) {
      const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", pin.sha, main], { cwd });
      if (ancestry.error) throw ancestry.error;
      assert.ok(ancestry.status === 0 || ancestry.status === 1,
        `Could not compare Glide's pin to origin/main: ${ancestry.stderr}`);
      if (ancestry.status === 0) {
        t.diagnostic(`Glide's pin ${pin.sha} is behind ephemeral-ui origin/main (${main}); pinned hashes still match.`);
      } else {
        t.diagnostic(`Glide's pin ${pin.sha} differs from ephemeral-ui origin/main (${main}) and is not a known ancestor.`);
      }
    }
  });
