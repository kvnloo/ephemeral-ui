#!/usr/bin/env bash
# Build dist/ from src/ and publish to the `ephemeral-ui` Vercel project (https://ephemeralui.vercel.app).
#   tools/deploy.sh            # production
#   tools/deploy.sh --preview  # preview only
set -euo pipefail
cd "$(dirname "$0")/.."
python3 tools/catalog.py > out/catalog.json
node tools/build-apps.mjs
python3 tools/themes.py tools/vendor/hermes-themes.json > src/data/themes.json
rm -rf dist && cp -r src dist
# /classic is the original app-card gallery (pretotypes/app-cards, built by its own tools/build.py).
# src/classic/index.html (untracked) pins the published copy; otherwise take the gallery's dist.
[ -f dist/classic/index.html ] || { mkdir -p dist/classic && cp ../app-cards/dist/index.html dist/classic/index.html; }
prod=--prod; [ "${1:-}" = "--preview" ] && prod=
npx vercel@latest deploy dist --project ephemeral-ui --scope kvnloos-projects $prod --yes
