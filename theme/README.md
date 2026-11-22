# Shared theme

`glide.json` is the one theme file every app reads (Glide on Tern, Dash, Hermes desktop, the phone apps),
so they match. `tokens.schema.json` (JSON Schema 2020-12) defines the shape; `tools/theme.test.mjs` holds the
file to it and to the sources its values were copied from.

The default theme is **Glide**: light is the kit's default light (T3 Code light, what cards wear in a light
host today), dark is Glide's Tern window theme (Dash black and gold, `glide/themes/dash.json`). No value
was invented or retuned; `sources` names where each group came from, so wearing the file changes nothing
on screen today. `brand` carries the Glide name, tagline and mark colors for store and launcher listings.

## Groups

| group | what | unit |
|---|---|---|
| `brand` | name, app id, tagline, mark, accent and its ink, the gold call-to-action | hex |
| `color.light`, `color.dark` | the kit's token names (`bg`, `fg`, `card`, `muted`, `mutedFg`, `accent`, `border`, `input`, `primary`, `primaryFg`, `success`, `warning`, `danger`, …) | hex, `#rrggbb[aa]` |
| `radius` | Glide's scale (`chip` 4 … `card` 16, `pill`), plus the kit's `base`/`lg` | px |
| `space` | 4 px steps (`0.5` = 2 … `6` = 24), `pad` (card padding), `density` | px |
| `type` | `family` (sans, mono, serif), `base` (body size/line height), `size` ramp, `tracking` | px, em |
| `motion` | `duration` (ms at speed 1), `easing`, `spring` (stiffness/damping), `speed` (`min`, `max`, `turbo`), `reducedMotion` | ms, × |
| `glass` | backdrop levels from `none` to `max`: `blur`, `saturate`, fixed `tint` | px, % |

Durations are divided by the speed in use: `turbo` 2 halves every duration (the kit's motion control max).

## Applying it

Web hosts (kit cards, WebViews) set the kit's CSS variables on the root:

    --h-<token>      color.<scheme>.<token>       e.g. --h-bg, --h-mutedFg, --h-primary
    --h-radius       radius.base px               --h-radius-lg   radius.lg px
    --h-font         type.family.sans             --h-mono        type.family.mono
    --h-density      space.density

Native apps (SwiftUI, Compose, Flutter, Luau) map the same names into their own theme objects. Pin a tag
and fetch `https://raw.githubusercontent.com/kvnloo/ephemeral-ui/<tag>/theme/glide.json`, or vendor a
copy next to the kit with the tag it came from; check `v === 0` before reading.

## Changing it

Edit `glide.json`, bump its `version`, and update `sources` when a value no longer comes from where it
says. `node --test tools/theme.test.mjs` checks the kit-side values; with a glide checkout,
`GLIDE_DIR=<checkout> node --test tools/theme.test.mjs` also checks the dark palette, brand, radii, type
and glass against `glide/themes/dash.json`, `glide/frontend/tokens.ts` and `glide/frontend/glass.ts`.
