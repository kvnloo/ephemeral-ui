# Ripple intent kits → T3 Code

These are **interactive kit prototypes**, not a live T3 backend integration. AODL remains the IR,
Ripple owns interaction, z0intelligence owns cognition, and OMP owns the trace dashboard's data shapes.

## Three compositions

Open the kit's `index.html` through its normal static host:

- `#intent=declare`: exact source sentences → one task → pending contract. Select a sentence;
  switch Done means / Evidence / Boundaries; prepare a review request.
- `#intent=operate`: inspect H1 → T1 → P1, then the real-turn acceptance clauses. Preconditions
  can pass while acceptance remains missing. Built is not approved or accepted.
- `#intent=understand`: decision traffic, tokenomics coverage, context prediction and readiness,
  plus the existing OMP waterfall and tool cards. No contract↔trace join is inferred.

All cards inherit the existing T3 / Hermes host-theme and brand controls. All eight new kinds
are registered in `main.js`, the command palette, and `schema/card.v0.json`. Ripple, AODL and
z0intelligence also have catalog tiles (neutral monograms, no invented brand colours).

`tools/intent-inline.mjs <output.html>` bundles the **actual eight new card modules** and the
sanitized snapshot into a standalone interactive HTML document, suitable for T3's inline HTML
renderer. It intentionally excludes the large OMP fixture; the site version includes those cards.

## Ownership and integration seam

`KINDS_I[kind].make(app, rng, snapshot, { onReview, onInspect })` returns `{ el, done, play, spec }`.
Await `done` before inspecting its DOM. Passing a snapshot skips the default public-data fetch.
The input shape is the projection in `src/data/intent-snapshot.json`, **not raw HOTL**.
`contractView(doc)` in `intent-data.js` reads raw AODL bindings without mutating them; it is a
starting point for the host adapter, not a complete projection into all eight cards.

A T3/Ripple host must:

1. Read a validated AODL document from the existing IntentService. Resolve its source entries,
   task, acceptance and precondition bindings. Preserve exact source text and full hashes.
2. Supply private citation links, observed verification receipts and implementation-state
   observations separately. A proposed acceptance command is not a passing receipt.
3. Wire `onReview` to the authoritative review surface. The callback emits only
   `{ v:0, action:"request_review", sourceHash, contractHash, revision, approval:"pending" }`.
   **It does not approve, write approval JSON, call `/approve`, or start work.** The existing
   formal approval path remains OMP `/aodl`; adding a T3 authority path needs its own design.
4. Connect Ripple's real text/pen/voice inputs. The gallery labels their seam and explicitly
   says input adapters are required; it does not pretend to record audio.
5. Supply z0intelligence's receipt-summary, decision, context and health projections. Keep
   measurement population and capture time visible. Never turn estimated avoidance into
   verified savings or count lifecycle rows as distinct completed jobs.
6. Reuse `KINDS_T` and `trace-query.v0` for stats responses. T3 should launch the harness's
   advertised `/stats` command, not introduce a parallel stats service. Remote URLs and
   permissions remain the host's responsibility; no loopback origin is baked into a card.
7. Preserve Seen/Reopen as view state only. It is neither task completion nor approval.

The site controls use local state only. Switching kits rebuilds their view, not the underlying
contract. They do not currently persist annotations, edit contracts, fetch live state, or join
contract tasks to live traces. Those are deliberate integration gaps, not simulated features.

## Snapshot and truth labels

`tools/intent-fixture.py` builds fields explicitly from private sources. Private paths become
neutral labels; fork handles are removed; flow targets, window names, context IDs and raw
prompts are excluded. Numeric aggregates remain real. Public upstream references are retained.
Full source/contract hashes are preserved for review requests; the UI abbreviates them.

The snapshot combines independent sources:

- The pending background-work contract from the earlier triage. H1 has an observed fork head;
  T1 has no matching local branch; P1's acceptance file is absent. These are observations at
  capture, not an assertion that no other host or author ever started T1.
- `z0int receipt summary --json`: 7,518 summary rows and zero verified tasks at capture.
  Estimated avoidance, reported savings, measured sum and baseline sum use different
  populations; the UI deliberately computes no savings percentage from them.
- The raw decisions file: 28,157 parseable historical events, latest timestamp Oct 28.
  Orchestration, log-only and live events coexist. Counts are events, not unique jobs.
- Context/flow aggregates: 30,303 prediction rows. The displayed family match is
  1,227 / 8,149 labeled rows; not downstream utility, and unlabeled rows are excluded.
- Health was captured in an evaluation Python environment. Missing libraries there do not
  prove the installed z0int service is down. Remote credential presence is not execution proof.

## Checks

DOM tests require `linkedom` (installed outside the repo for this pass). No browser is started:

    EUI_DOM_MODULE=<linkedom>/worker.js node --test tools/intent.test.mjs
    node tools/leak-check.mjs src/data/intent-snapshot.json
    node tools/intent-inline.mjs <output.html>

The tests exercise all eight kinds in four theme configurations, sentence and slice drill-down,
contract tabs, chart-bar inspection, Seen/Reopen, kit navigation, review callback and source
immutability. They do **not** prove layout, overflow, browser accessibility or a live T3 turn.
The snapshot leak check covers paths, hosts, secrets and emails; additionally review the
allowlist projection before any public deploy (public project names are intentional here).

Before shipping: ask permission for a browser pass, inspect 1440/412 px in both host themes and
schemes, run the kit's journey and overflow gates, and verify the actual deployment. Nothing
here authorizes a commit, push, deploy or change to the running T3 install.
