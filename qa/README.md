# Replaying EU-024 receipts

`inventory.json` is the per-kind grade sheet. It covers the generated catalog (including
host-only kinds) and the four deployment-only kinds in `pages.json`. The latter pins
the audited Pages revision and the infra module hash. When U07 brings a Pages kind into
the catalog, switch that row to a catalog fixture and regrade it against main.

- **S / A:** the core demo interaction clears the [UX audit rubric](../UX-AUDIT.md).
  The receipt is a regression sample, not proof that every control, fixture variant,
  host, or assistive technology behaves the same.
- **Below bar:** the row records the blocking UX gap and the control that was still
  exercised. A green replay does **not** confer a passing grade.
- **Removed:** only valid for a kind absent on both surfaces; retain a reason in the
  inventory, without a grade or passing receipts. There are no removals in this lane.

The regular Node tests enforce coverage and receipt structure. Run
`node tools/qa-inventory.mjs` for the strict A/S gate: it exits nonzero while below-bar
rows remain. Use `--allow-below-bar` to print them without failing a coverage-only run.

## Chromium

1. Run `npm ci` and `npx playwright install chromium` (or point `QA_CHROMIUM` at an
   installed Chromium or Chrome binary).
2. Run `python3 -m http.server 8173 --directory src`. Export `QA_URL` as the origin of
   that local server (no trailing slash).
3. For Pages coverage too, extract the revision in `qa/pages.json` with `git archive`
   into a temp directory, serve that directory on a second port, and export
   `QA_PAGES_URL` as its origin. The replay checks the module hash and exported kind set.
4. Run `node qa/chromium.mjs`. Optionally set `QA_KIND` to a kind-name regex to debug a
   subset.

The replay uses the public styles and first catalog fixture of each kind in isolation,
with synthetic fixture input only and no demo autoplay, at 390×900 and 1280×900.
Each recorded control starts on a fresh card for keyboard and pointer input.
A receipt says whether the test observed an intent, a native change, selected/expanded
state, or rendered text changing. 3D receipts require non-flat pixels rendered by the
actual WebGL pipeline (Chromium ANGLE/SwiftShader is sufficient). Where the canvas has
keyboard orbit, the test verifies that it handles the focused arrow key.
