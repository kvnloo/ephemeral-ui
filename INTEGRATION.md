# Host integration: one artifact, every surface

The kit reaches a host in three tiers. Each tier reuses the one below it, so a new host starts at
Tier 0 the same day and only needs host code for Tier 1/2. Per-surface state lives in
[`integration/surfaces.json`](integration/surfaces.json); update it in the same change.

| Tier | What ships | Host code |
|---|---|---|
| 0 | One self-contained HTML document of real card modules + embedded data, in the host's theme | none: use the host's existing HTML/artifact/browser surface |
| 1 | Context back: the host reads which card/entity the user picked into the chat | small: a bridge or the host's own pick/snapshot API |
| 2 | Native catalog component (OpenUI catalog, Luau, RN, Flutter, SwiftUI) | per host |

## Workflow (any host)

1. **Pick cards.** A playlist link (the site's ♥ dock → Copy link) or `--cards app:kind,…`.
2. **Export.** `node tools/export-cards.mjs --playlist '<url>' --theme <id> --out cards.html`
   - Theme ids come from `src/data/themes.json` (T3 + Hermes presets). Use the theme the host
     frame actually shows (Hermes desktop's artifact frame is forced light → `hermes-nous`).
   - `--host-vars` maps the kit's `--h-*` tokens onto the frame's own CSS variables (T3 `html_render`).
   - Only the modules and data the chosen cards need are bundled; apps.json is pruned to the cards'
     apps. Default cap 512 KB (T3's limit); trace kinds carry a ~1.2 MB fixture, so they only fit
     file-based hosts (`--max-bytes`).
3. **Check.** `EUI_DOM_MODULE=<linkedom>/worker.js node tools/export-check.mjs cards.html --expect N`
   runs the inline script with no network and a throwing `localStorage` (what a sandboxed,
   opaque-origin iframe does) and requires every card to mount with no errors. It proves logic,
   not paint: Web Animations and canvas are stubbed.
4. **Deliver** through the host's Tier 0 path (`surfaces.json`), then look at it in the real client
   once (desktop width + phone width where the host has one). That visual pass is the milestone;
   steps 2–3 are not.
5. **Tier 1/2** only when Tier 0 shows the card is worth it in that host. Reuse the export as the
   reference rendering for native ports; the card's `spec` is the props contract.

## Tier 2 = OpenUI (after the Tier 0 visual sign-off)

Native integration goes through each host's OpenUI catalog, not bespoke renderers:
the model emits one `openui-v2` fence (`root = Board(...)`) naming registered components, and the
host renders them natively. One shared definition, per-host renderers:

1. **Shared catalog entry per kit kind**: name, positional props (from the card's `spec`), bounds,
   and an export-rendered reference PNG. Dependency-free runtime (validation, counters) shared by
   every host; schemas bound to each client's own OpenUI/zod instance.
2. **Hosts, in order** (owner priority: Tern and Hermes desktop first): Tern (`feat/tern-openui-v2`
   Luau catalog, fixed host renderers, no generated code) and Hermes desktop (no OpenUI yet: add a
   catalog renderer beside the artifact pane, reusing the Tern lane's generation/compiler side);
   then the T3 fork (extend `experiment/openui-app-cards` / `exp/openui-gallery`, already on
   `channels/nightly`), Dash (native OpenUI replies exist), hermes-android, Hermex.
   **HTML-only hosts get the same program** (Hermex inline HTML, Hermes desktop artifact pane, Dash
   WebViews): `node tools/export-cards.mjs --program reply.openui --host-vars --out cards.html` parses
   the model's `Board(… [EphemeralCards(title, [{kind, app?, input?}])])` fence with the real
   `@openuidev/lang-core` (`OPENUI_FROM=<package.json next to it>`) and fails closed on bad programs.
   Kinds listed in `card.v0.json` `$defs.appInput` (now: `merge`) draw the given data; every other kind
   draws sample data and rejects `input`. `--catalog-prompt merge,ci` prints the minimal catalog text
   for just those kinds instead of the whole catalog.
3. **Proof per host**: the stock parser accepts the literal fence; the component matches the
   Tier 0 reference at desktop/phone width; a real model turn emits it and it renders in that client.
   Everything lands on each repo's nightly branch first.

## Priority surfaces

- **Hermes desktop (Tier 0, no code change).** The artifact pane renders an assistant ```html
  fence in `iframe sandbox="allow-scripts"` via `srcdoc`. Put the export's full document in one
  fence, or write it to a file and link it. The frame is an opaque origin: no storage, no fetch to
  the kit, and that's why the export embeds its data.
- **Hermes × Tern (Tier 0 → 1).** `tern browser '{"op":"open","owner":<block>,"url":"file:///…/cards.html","how":"beside"}'`
  docks the export beside the session. The same block answers `snapshot` and `pick`, so a picked
  card can be read back into the turn without a new channel. Tier 2 is the OpenUI v2 Luau catalog
  on `feat/tern-openui-v2` (bounded catalog, fixed host renderers); kit cards are not in it yet.
- **T3 (Tier 2 exists for everyday app cards).** See `surfaces.json`. Intent/intel/trace kinds are
  Tier 0 only (`html_render`).

## Rules

- Exports are read-only snapshots. No card in an export may write, approve or call an app.
- Never inline private data: build fixtures through the kit's sanitizers (`intent-fixture.py`,
  `sanitize-trace.mjs`) and leak-check them.
- A host's "HTML rendered" receipt is not reader-visible delivery. Count a surface as integrated
  only after the card was seen in that client.
