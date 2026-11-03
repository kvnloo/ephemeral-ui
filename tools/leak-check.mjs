// Leak check for the public trace fixture. Exit 1 on any hit.
//   node tools/leak-check.mjs src/data/trace-fixture.json [more files…] [--deny raw-denylist.json]
// 1. Static patterns: paths, emails, URLs, IPs, hostnames, secrets, the owner's handles and repo names.
// 2. Denylist (from sanitize-trace.mjs --deny-out): every raw string the sanitizer refused to copy
//    (titles, prompts, cwd, track names, args, tool output, error messages). None may appear verbatim.
import fs from "node:fs";
const args = process.argv.slice(2);
const di = args.indexOf("--deny");
const deny = di >= 0 ? JSON.parse(fs.readFileSync(args[di + 1], "utf8")) : [];
const files = args.filter((a, i) => !a.startsWith("--") && !(di >= 0 && i === di + 1));
const STATIC = [
  ["unix path", /(?:^|[\s"'(=])\/(?:home|mnt|Users|tmp|var|etc|workspace|root|opt|srv|private)\/[^\s"']*/g],
  ["windows path", /[A-Z]:\\\\[^\s"']+/g],
  ["home tilde", /~\/[\w.-]+/g],
  ["email", /[\w.+-]+@[\w-]+\.[a-z]{2,}/gi],
  ["url", /https?:\/\/(?!ephemeralui\.vercel\.app|json-schema\.org)[^\s"')]+/g],
  ["ipv4", /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  ["hostname", /\b[\w-]+\.(?:local|lan|internal|ts\.net|tailnet)\b/gi],
  ["secret", /\b(?:sk-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abpr]-[\w-]+|AKIA[0-9A-Z]{16}|eyJ[\w-]{20,}\.[\w-]+)|Bearer\s+\S+/g],
  ["owner/handle", /\b(?:kvn|kvnloo|kevin|rajan|zer0\w*|groot|z0\w*|openjev\w*|tdai\w*|typesafe)\b/gi],
  ["repo name", /\b(?:launch-videos|hermes-agent|hermes-android|t3code|fframestudio|quackles|noop|dash)\b/gi],
  ["jsonl path", /[\w./-]*\.jsonl\b/g],
];
const JSONL_OK = /^session-[a-z0-9]+(?:\/(?:main|sub-\d+))?\.jsonl$/;
let hits = 0;
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const isFixture = /fixture/.test(f);
  for (const [name, re] of STATIC) {
    if (!isFixture && /repo name|jsonl path|url|owner/.test(name)) continue; // source files may name the dashboard and link docs
    for (const m of text.matchAll(re)) {
      const s = m[0].trim();
      if (name === "jsonl path" && JSONL_OK.test(s)) continue;
      if (name === "ipv4" && /^\d+\.\d+\.\d+\.\d+$/.test(s) && s.split(".").every((x) => +x < 10)) continue; // version-like 4.5.0.1
      hits++; if (hits <= 40) console.log(`${f}: ${name}: ${JSON.stringify(s.slice(0, 80))}`);
    }
  }
  if (isFixture && deny.length) {
    let n = 0;
    for (const raw of deny) {
      if (typeof raw !== "string" || raw.length < 8 || raw.length > 400) continue;
      if (/^[a-z_ ]+$/.test(raw) && raw.length < 12) continue; // bare common words (e.g. "continue") are not identifying
      if (text.includes(raw)) { n++; hits++; if (n <= 20) console.log(`${f}: raw string leaked: ${JSON.stringify(raw.slice(0, 80))}`); }
    }
    console.log(`${f}: checked ${deny.length} raw strings`);
  }
}
console.log(hits ? `LEAK CHECK FAILED: ${hits} hit(s)` : `leak check clean: ${files.length} file(s)`);
process.exit(hits ? 1 : 0);
