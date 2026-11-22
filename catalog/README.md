# Card catalog

`catalog.json` lists every card kind the kit defines (`src/js/kinds-*.js`), each with 1-3 fixtures, so
every app that renders ephemeral-ui cards (Glide on Tern, Dash, Hermes desktop, T3, the phone apps) can
draw the same set and prove it in a test. This repo is the single source; apps never hand-copy a kind list.

- `catalog.json`: generated, never edited. `node tools/card-catalog.mjs` rewrites it.
- `catalog.schema.json`: JSON Schema (2020-12) for the file.
- `VERSION`: the catalog's semver. Bump the minor when a kind is added or a fixture's props change,
  the major when a kind is removed or renamed. The file's `v` is the shape of the file itself.

## How it is made

`tools/card-catalog.mjs` imports every `KINDS_*` export from `src/js/kinds-*.js` under linkedom, mounts
each fixture with the kind's real `make(app, rng(seed), input)` and records the card's `spec` as the
fixture's `props` (keys sorted). The clock is frozen at `generatedAt`, so the output is the same on every
machine. Fixtures per kind:

| `input` | fixtures |
|---|---|
| `none` | sample data, seeded as the site seeds it (`app id + kind`), for up to 3 apps that list the kind in `src/data/apps.json` |
| `appInput` | 2 sample apps + 1 `input` fixture whose `card.input` matches `card.v0.json` `$defs.appInput[kind]` |
| `data` | the kind's authored example document (`example`) + no data (`unavailable`) |

Other fields: `group` (gallery section), `site` (on the site's gallery), `programmable` (in
`card.v0.json`'s kind enum, so a model may emit it in an `ephemeral-ui` fence), `data` (fixture files the
reference renderer reads, e.g. `src/data/trace-fixture.json`), `apps[].inCatalog` (false for host apps
such as `glide`, which draw a neutral monogram).

Check it is current (CI and `tools/catalog.test.mjs` both run this):

    node tools/card-catalog.mjs --check     # exit 1 when catalog.json is stale

## Consuming it in an app

Pin a tag; never read `main`.

1. **Fetch a tagged raw URL** (apps that sync at build time):
   `https://raw.githubusercontent.com/kvnloo/ephemeral-ui/catalog-v<VERSION>/catalog/catalog.json`
   Tags are named `catalog-v<VERSION>` and cut from the commit that bumped `VERSION`.
2. **Vendor a copy** (apps that build offline, phones): copy `catalog.json` to the app's vendor dir next
   to the rest of the kit (Glide keeps `frontend/src/vendor/ephemeral-ui/`), and record the tag or commit
   it came from beside it. Re-vendor with the kit, never edit the copy.

Either way the app checks `v === 0` before reading and fails its gallery test on any other value.

## What an app's gallery test must assert

Each app has a gallery screen that renders every fixture of every kind. Its test (unit, snapshot or UI)
loads the vendored or fetched catalog and asserts:

1. **Coverage.** The set of kinds the gallery renders equals `catalog.kinds[].kind`: no kind missing, none
   extra. A kind the app cannot draw natively still gets a cell (the Tier 0 HTML export or an explicit
   "not supported" cell), so the gap is visible and counted.
2. **Every fixture mounts.** One cell per `fixtures[].id`, rendered from `fixture.card` (`kind`, `app`,
   `input`) with no thrown error, no empty cell, and no `undefined`/`NaN` in its text.
3. **Props parity.** Where the app has a native renderer, the props it derives for the cell deep-equal
   `fixture.props` (or the app renders straight from `fixture.props`). Where it embeds the kit's modules,
   `KINDS[kind].make(app, rng(fixture.seed), fixture.card.input).spec` deep-equals `fixture.props`,
   which is what `tools/catalog.test.mjs` does here.
4. **States.** `unavailable` fixtures show the unavailable state; `example` and `input` fixtures do not.
5. **Version shown.** The gallery displays `catalog.version`, so a screenshot says which catalog it is.

Parity across apps is then a passing gallery test in each app at the same `catalog-v<VERSION>`.
