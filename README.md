# ephemeral-ui

Agnostic ephemeral UI cards: they appear when an agent touches an app, take the host's theme
(Hermes desktop, T3 Code, …) and dissolve into a one-line receipt when the task is done.
Formerly `t3-app-cards`; the original gallery is kept at `/classic`.

Live: https://ephemeralui.vercel.app (Vercel project `ephemeral-ui`, scope kvnloos-projects;
`ephemeral-ui.vercel.app` belongs to someone else). https://t3-app-cards.vercel.app redirects here
(links with a hash, i.e. old gallery picks, go to `/classic/`); its redirect page is `redirect/`.

## What's on the page

- **Host preview**: a live agent turn in a T3 Code or Hermes desktop window. Tool rows turn into
  cards (container transform), the card plays, a hold confirms, the card dissolves. Grab a card
  to take over; five scenes loop.
- **Kit**: 310 apps in 25 categories (`tools/catalog.py`). Brand colours and marks come from
  simple-icons 16.36.0 (CC0 data). Apps simple-icons lacks get a neutral monogram, not a guessed hex.
  Monograms by default (what T3 Code ships); official marks behind the Logos toggle.
- **30 card kinds** (`src/js/kinds-a.js`, `kinds-b.js`), each interactive: swipe to archive,
  drag to pick a time, drag kanban cards, hold to pay/approve/book, the @pitus_-style
  resolve → checks → merge, CI re-run, knob, force graph, receipt and boarding-pass printers.
- **Theme engine**: host presets resolved from source at build time (`tools/themes.py`):
  T3 Code `apps/web/src/index.css` @ 54e9bb96 + Tailwind 4.3.3 ramps; Hermes desktop
  `apps/desktop/src/themes/presets.ts` @ 1afe076d (dumped with `tools/vendor/dump-hermes.sh`,
  radius-scalar 0.2 from styles.css). Overrides: accent, radius, density, type, motion speed,
  brand mode (accent / full / host only), logos. Exports CSS or JSON tokens.
- **Flows**: three cards wired with draggable cables; Run sends a packet down the line.
- **Spec**: the card JSON of whatever you last clicked; draft schema at `src/schema/card.v0.json`.
- ⌘K palette over apps, kinds, themes and sections. `#theme=<id>` and `#app=<id>` deep-link.

## Build, check, deploy

    python3 tools/catalog.py > out/catalog.json && node tools/build-apps.mjs   # src/data/apps.json
    python3 tools/themes.py tools/vendor/hermes-themes.json > src/data/themes.json
    python3 -m http.server 0 --bind 127.0.0.1 --directory src                  # any free port
    node tools/shot.mjs http://127.0.0.1:<port>/ out/shots --theme hermes-nous  # screenshots + page errors
    tools/deploy.sh                                                            # dist/ -> production

No bundler: plain ES modules, one stylesheet. `tools/node_modules` holds simple-icons only.

## Motion and taste sources

Motion references come from a private reference collection and
@pitus_'s Generative UI series. The evidence (frame sheets, notes) stays out of this repo, in
`$ZER0/data/operations/ephemeral-ui/x-taste/`.
