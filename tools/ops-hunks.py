#!/usr/bin/env python3
"""Apply the ops-boards hunks to a kit tree (working tree, HEAD candidate or a live gh-pages clone).

    python3 tools/ops-hunks.py <root containing js/main.js + index.html>     (a src/ dir or a Pages tree)

Idempotent: each hunk is skipped when its marker is present, and its anchor must match exactly once.
"""
import sys
from pathlib import Path

root = Path(sys.argv[1])
HUNKS = [
    ("js/main.js", 'import { KINDS_OPS } from "./kinds-ops.js";',
     'import { buildCombos, COMBOS } from "./combos.js";\n', 'import { buildCombos, COMBOS } from "./combos.js";\nimport { KINDS_OPS } from "./kinds-ops.js";\n'),
    # the KINDS spread ends with whichever kit landed last (infra on the live site, intent at older heads)
    ("js/main.js", "...KINDS_OPS }",
     ("...KINDS_INFRA };", "...KINDS_I };"), None),
    ("index.html", 'href="ops.css"',
     '<link rel="stylesheet" href="stats.css">\n', '<link rel="stylesheet" href="stats.css">\n<link rel="stylesheet" href="ops.css">\n'),
    ("index.html", 'src="js/ops-section.js"',
     '<script type="module" src="js/stats-section.js"></script>\n', '<script type="module" src="js/stats-section.js"></script>\n<script type="module" src="js/ops-section.js"></script>\n'),
]
for f, marker, anchor, new in HUNKS:
    p = root / f
    s = p.read_text()
    if marker in s:
        print(f"skip {f}: {marker}")
        continue
    for a in anchor if isinstance(anchor, tuple) else (anchor,):
        if s.count(a) == 1:
            break
    else:
        sys.exit(f"{f}: anchor {anchor!r} matched {s.count(a)}x")
    p.write_text(s.replace(a, new or a.replace(" };", ", ...KINDS_OPS };")))
    print(f"applied {f}: {marker}")
