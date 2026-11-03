#!/usr/bin/env bash
# Run tools/trace-shot.mjs over the desktop/phone × T3/Hermes matrix. Usage: tools/trace-matrix.sh <url> <outdir>
set -u
url=${1:-http://127.0.0.1:8811/}; out=${2:-out/trace-shots-final}
mkdir -p "$out"
cd "$(dirname "$0")/.."
fail=0
for cfg in "1440 t3-light" "1440 hermes-nous-dark" "412 t3-dark" "412 hermes-nous"; do
  read -r w theme <<<"$cfg"
  timeout 450 node tools/trace-shot.mjs "$url" "$out" --theme "$theme" --w "$w" > "$out/report-$w-$theme.txt" 2>&1 || fail=1
  echo "$w $theme: $(tail -1 "$out/report-$w-$theme.txt")"
done
exit $fail
