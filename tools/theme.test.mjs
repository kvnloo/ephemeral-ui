// theme/glide.json: valid against theme/tokens.schema.json and equal to the values it was taken from, so an
// app wearing it looks as it does today. Glide-side values are checked when a glide checkout is given:
//   GLIDE_DIR=<path to kvnloo/glide> node --test tools/theme.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
const lc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v.toLowerCase() : v]));

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
test("dark, brand, radii, type and glass match the glide checkout", { skip: !glide && "set GLIDE_DIR to a kvnloo/glide checkout" }, () => {
  const g = (p) => fs.readFileSync(path.join(glide, p), "utf8");
  const dash = JSON.parse(g("glide/themes/dash.json")).vars, tokens = g("glide/frontend/tokens.ts"), glass = g("glide/frontend/glass.ts");
  const map = { bg: "background", fg: "foreground", card: "card", muted: "muted", mutedFg: "mutedForeground", accent: "accent", border: "border", input: "border",
    primary: "primary", sidebar: "popover", sidebarBorder: "border", message: "userBubble", success: "green", successFg: "green", warning: "yellow", danger: "destructive",
    dangerFg: "red", faint: "faint", secondary: "secondary", popover: "popover", info: "blue", magenta: "magenta", cyan: "cyan" };
  const dark = lc(theme.color.dark);
  for (const [k, v] of Object.entries(map)) assert.equal(dark[k], dash[v].toLowerCase(), `color.dark.${k} = dash.json ${v}`);
  assert.deepEqual(Object.keys(dark).filter((k) => !map[k]), ["primaryFg", "messageBorder"]);
  const obj = (name) => Function(`return (${tokens.match(new RegExp(`export const ${name} = (\\{[^}]*\\})`))[1]})`)();
  const GOLD = obj("GOLD"), DASH = obj("DASH"), RADIUS = obj("RADIUS"), TYPE = obj("TYPE"), TRACK = obj("TRACK");
  assert.equal(theme.color.dark.primaryFg, GOLD.ink);
  assert.deepEqual(theme.brand.cta, GOLD);
  assert.equal(theme.brand.accent, DASH.gold);
  assert.ok(g("README.md").includes(theme.brand.tagline), "tagline is the README's first line");
  for (const [k, v] of Object.entries(RADIUS)) assert.equal(theme.radius[k], v, `radius.${k}`);
  assert.deepEqual(theme.type.size, TYPE);
  assert.deepEqual(theme.type.tracking, TRACK);
  assert.match(glass, new RegExp(`blur\\(${theme.glass.card.blur}px\\) saturate\\(${theme.glass.card.saturate}%\\)`));
  assert.ok(glass.includes(`'--g-ease: ${theme.motion.easing.glass}'`));
  assert.match(glass, new RegExp(`blur 2-${theme.glass.max.blur}px, saturation 100-${theme.glass.max.saturate}%`));
});
