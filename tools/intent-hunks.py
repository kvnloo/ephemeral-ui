#!/usr/bin/env python3
"""Apply the intent-kit hunks to a site root (gh-pages tree or src/). Idempotent; each anchor must match once."""
import json, sys, pathlib
root = pathlib.Path(sys.argv[1]); wt = pathlib.Path(sys.argv[2])  # wt = working-tree src/ (source of new files + apps)

def sub(path, marker, *pairs):
    """pairs: old, new[, old2, new2 …]; the first old that matches exactly once is used."""
    p = root / path; s = p.read_text()
    if marker in s: return
    for old, new in zip(pairs[::2], pairs[1::2]):
        if s.count(old) == 1: p.write_text(s.replace(old, new)); return
    raise SystemExit(f"{path}: no anchor matched once for {marker!r}")

for f in ["js/kinds-i.js", "js/intent-data.js", "js/intent-kits.js", "intent.css", "data/intent-snapshot.json"]:
    (root / f).write_bytes((wt / f).read_bytes())
M = "js/main.js"
sub(M, 'from "./kinds-i.js"', 'import { KINDS_T } from "./kinds-t.js";\n', 'import { KINDS_T } from "./kinds-t.js";\nimport { KINDS_I } from "./kinds-i.js";\nimport { buildIntent, INTENT_KITS } from "./intent-kits.js";\n')
sub(M, "...KINDS_T, ...KINDS_I", "...KINDS_T, ", "...KINDS_T, ...KINDS_I, ", "...KINDS_T }", "...KINDS_T, ...KINDS_I }")
sub(M, "buildIntent({ catalog, setSpec });", "  buildAsk({ catalog, setSpec });\n", "  buildAsk({ catalog, setSpec });\n  buildIntent({ catalog, setSpec });\n")
sub(M, 'v.intent ? "intent"', 'v.infra ? "infrastructure" : v.trace ? "ask" : "kinds").scrollIntoView({ behavior: "smooth" });', 'v.infra ? "infrastructure" : v.intent ? "intent" : v.trace ? "ask" : "kinds").scrollIntoView({ behavior: "smooth" }); if (v.intent) window.__intent?.pick(INTENT_KITS.find(kit => kit.kinds.includes(k)).id);', 'document.getElementById(v.trace ? "ask" : "kinds").scrollIntoView({ behavior: "smooth" });', 'document.getElementById(v.intent ? "intent" : v.trace ? "ask" : "kinds").scrollIntoView({ behavior: "smooth" }); if (v.intent) window.__intent?.pick(INTENT_KITS.find(kit => kit.kinds.includes(k)).id);')
sub(M, '["Intent kits", "intent"]', '["Combos", "combos"], ', '["Combos", "combos"], ["Intent kits", "intent"], ')
H = "index.html"
sub(H, 'href="intent.css"', '<link rel="stylesheet" href="trace.css">\n', '<link rel="stylesheet" href="trace.css">\n<link rel="stylesheet" href="intent.css">\n')
sub(H, 'href="#intent"', '<a href="#stats">Stats</a>', '<a href="#stats">Stats</a><a href="#intent">Intent</a>', '<a href="#ask">Ask</a>', '<a href="#ask">Ask</a><a href="#intent">Intent</a>')
sub(H, 'id="intent"', '<section id="ask" class="sec">', '<section id="intent" class="sec" aria-label="Ripple intent kits">\n  <div class="sechead"><div><span class="kicker">Ripple × AODL × z0intelligence</span><h2>Declare. Operate. Understand.</h2><p class="dim">Three ephemeral kits for T3 Code: preserve the ask, expose the contract, follow the proof, and open the decision layers that matter. Eight new cards, plus OMP\'s trace and tools. Same host themes; no pretend approval.</p></div></div>\n</section>\n\n<section id="ask" class="sec">')
S = root / "schema/card.v0.json"; sd = json.loads(S.read_text()); enum = sd["properties"]["kind"]["enum"]
if "intent-declare" not in enum:
    i = enum.index("trace-frustration") + 1
    enum[i:i] = ["intent-declare", "intent-contract", "intent-work", "intent-proof", "intel-decisions", "intel-value", "intel-context", "intel-health"]
    S.write_text(S.read_text().replace(json.dumps(enum[:i] + enum[i + 8:]).replace('", "', '", "'), json.dumps(enum), 1))
    assert "intent-declare" in S.read_text(), "schema enum line not found"
if (root / "js/social.js").exists():  # playlists (social.js) may not be in the target yet
    sub("js/social.js", "NOT_SHAREABLE = /^trace/;", 'const NOT_SHAREABLE = /^(trace|intent-|intel-)/; // these need fixture input, not just (app, kind)', 'const NOT_SHAREABLE = /^trace/; // trace cards need a chosen session; intent-/intel- render from the public snapshot')
# apps: add the three tiles after omp-stats, change nothing else
A = root / "data/apps.json"; d = json.loads(A.read_text()); ids = [a["id"] for a in d["apps"]]
new = {a["id"]: a for a in json.loads((wt / "data/apps.json").read_text())["apps"] if a["id"] in ("ripple", "aodl", "z0intelligence")}
add = [new[k] for k in ("ripple", "aodl", "z0intelligence") if k not in ids]
if add:
    i = ids.index("omp-stats") + 1; d["apps"][i:i] = add; A.write_text(json.dumps(d, separators=(",", ":"), ensure_ascii=False))
print("ok", root)
