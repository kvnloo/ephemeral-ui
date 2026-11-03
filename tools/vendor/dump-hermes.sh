#!/usr/bin/env bash
# Dump Hermes desktop's built-in themes to JSON (node >= 23 strips TS types natively).
#   tools/vendor/dump-hermes.sh [/path/to/hermes-agent] > tools/vendor/hermes-themes.json
set -euo pipefail
src="${1:-$ZER0/oss/hermes-agent}/apps/desktop/src/themes"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp "$src/presets.ts" "$src/types.ts" "$tmp/" && sed -i "s#from './types'#from './types.ts'#" "$tmp/presets.ts"
cat > "$tmp/dump.mts" <<'JS'
import * as p from "./presets.ts";
const out = [];
for (const v of Object.values(p)) for (const t of Array.isArray(v) ? v : [v]) if (t && t.colors && !out.some((o) => o.name === t.name)) out.push(t);
console.log(JSON.stringify(out, null, 1));
JS
node --no-warnings "$tmp/dump.mts"
