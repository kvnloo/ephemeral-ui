// Node side of the one card spec (src/js/card-spec.js): loads card.v0.json, data/apps.json and the real
// @openuidev/lang-core (resolved from OPENUI_FROM=<package.json next to it>, default this repo's), so
// tools/export-cards.mjs and the tests parse every provider exactly as the browser does.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { cardSpec, MAX_CARDS, FENCE, check, RULES } from "../src/js/card-spec.js";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");
const read = (f) => JSON.parse(fs.readFileSync(path.join(src, f), "utf8"));
const S = cardSpec({ card: read("schema/card.v0.json"), apps: read("data/apps.json").apps });
export const { normalize, fromFences, fromA2UI, APP_INPUT, KINDS_ENUM } = S;
export { MAX_CARDS, FENCE, check, RULES };

export async function openuiParser(from = process.env.OPENUI_FROM || path.join(root, "package.json")) {
  return (await import(createRequire(from).resolve("@openuidev/lang-core"))).createParser;
}
export async function fromOpenUI(text, opts = {}) { return S.fromOpenUI(text, await openuiParser(opts.from)); }
export async function fromProgram(text, opts = {}) { return S.fromFences(text) ?? S.fromProgram(text, { createParser: await lazyParser(text, opts) }); }
// Only load lang-core when the text is OpenUI Lang (A2UI and fences need no parser).
async function lazyParser(text, opts) { const { looksLikeA2UI } = await import("../src/js/a2ui.js"); return looksLikeA2UI(text) ? undefined : openuiParser(opts.from); }
