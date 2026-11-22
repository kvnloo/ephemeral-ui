# Ephemeral UI requirements audit

Baseline: `ad3cae238af11d3b915e1ae21f83cda861a7ba2f` (main) and `2ee7aa0c9d8d808d412dc76bc4827bc2fc288e11` (Pages), plus public production and named sibling repositories. DONE means the scoped demo or code requirement is met, not necessarily live integration with providers. Proposed checks for open units are acceptance criteria, not claims of tests that exist today.

| row | verdict | evidence | done_check | size | build unit |
|---|---|---|---|---|---|
| EU-003 | DONE | Main `src/js/main.js:43–45,239–250`; Chromium on main and prod mounted Uber/ride (#000000), Gmail/inbox (#EA4335), Maps/route (#4285F4). Catalog fixture renderer: `tools/catalog.test.mjs:52–60`. | — | — | — |
| EU-004 | DONE | Both roots return 200, but old root is a client-side redirect, not a second gallery: its script and meta refresh target the renamed site; Chromium reached the new URL. `redirect/index.html:4–10` preserves old hash picks via Classic. | — | — | — |
| EU-005 | PARTIAL | Live agent-agnostic store and replayable demos: `src/js/main.js:172–220,241–254`. Main has 55 Kinds cells and 86 registry kinds; specialized sections cover some others, but `cua-action`, `gev-contacts`, and `work-dock` are cataloged with `site:false` (89 total catalog kinds) and not in the main registry. | Playwright: enumerate the catalog, navigate to a documented public demo for each kind, assert the actual kind mounts and at least one demo action runs without selecting a T3 host. | M | U01 |
| EU-006 | PARTIAL | Browser found only T3 and Hermes desktop preset groups (`src/js/main.js:257–261`). `integration/surfaces.json` records T3/desktop/Tern/Ripple host tiers; Glide has a separate shared-theme/catalog pin (parity test passed), and Hermes desktop main has `apps/desktop/e2e/ephemeral-cards.spec.ts`. No ChatGPT/Codex, Claude or o8 host preview in the kit. | Playwright: select T3, Hermes desktop, Tern/Glide, ChatGPT/Codex, Claude and o8 profiles in the site (separate where behavior differs), mount the same pinned fixture and assert each host skin and declared interaction tier. Label simulations; capture native receipts only where claiming native support. | L | U02 |
| EU-007 | PARTIAL | Shared shell `src/js/shell.js:117–123`, `src/styles.css:212–214` and `src/js/main.js:271` provide host only, accent and full brand. Gmail's computed accent and border switched in Chromium. `tools/catalog.test.mjs:52–60` renders fixtures but does not exercise both modes per kind, including specialized shells. | Playwright: iterate every catalog kind in bare/host-only and themed/brand modes; assert its computed tokens switch as intended and its controls still work, with explicitly documented fixed-skin exceptions if required. | M | U01 |
| EU-008 | DONE | `src/js/main.js:239–250` sets GEV/globe and fframestudio/timeline gallery entries; Chromium mounted both. `tools/catalog_studio.py:218` adds fframestudio mappings. Public sibling trees found; main also has the separate GEV contacts card from `1026a37`. | — | — | — |
| EU-009 | DONE | `src/js/combos.js:39–45,206–225,335–389` composes cross-app graphs (including ads and Gmail), animates packet handoffs and gates decisions. Chromium ran the flow to a promotion checkpoint, approved it, then observed completion. `1f9074e`. | — | — | — |
| EU-010 | DONE | `src/js/kinds-c.js:242–278`, Anatomy fixture in `src/js/main.js:239`; Chromium created gallery with three image and three video elements in main and prod; source supplies lightbox controls. | — | — | — |
| EU-011 | DONE | `src/js/kinds-c.js:492–500` links the fork and plays six captured upstream examples; the fork has the matching example directories. Chrome played the raptor-engine loop on main and prod; this is a recorded upstream example, not a video file hosted by the fork. | — | — | — |
| EU-012 | DONE | `tools/catalog_studio.py:115–190` and `src/js/kinds-c.js:503–514`; Chromium mounted Anki, tldraw, Excalidraw, Blender, Unreal, Maya, AutoCAD, Photoshop, FreeCAD and GIMP cards. These are kit demos, not external integrations. | — | — | — |
| EU-013 | DONE | `src/index.html:131–137`, `src/js/main.js:401–425`: dedicated OSS shelf, preview swapping and downloadable kit manifest. Chromium counted 97 OSS entries in both builds. | — | — | — |
| EU-014 | PARTIAL | Boat sandbox, generic Cua screen and scrcpy virtual-display card mounted in Chromium; `tools/catalog_studio.py:240–242`, `src/js/kinds-e.js:8–23,60–74`. No identified Cua Spaces-specific card/fixture; Cua action is a separate contract. | Playwright: load a distinct Cua Spaces fixture whose UI shows a space/session and its display state, and keep regression renders for Boat sandbox and scrcpy virtual display. Use fixture events only. | M | U03 |
| EU-015 | PARTIAL | `src/js/kinds-p.js:11–22` has Meshy and Hermes plugin recipes; Chromium mounted Meshy/plugin. Heron GLB is present, but `src/js/kinds-3d.js:383–425` explicitly describes a Blender-built sample; provenance as Kevin's Meshy output is not established. | In Chromium open the Meshy fixture, assert it loads and animates an approved Kevin/Meshy GLB with recorded provenance (not the Blender placeholder), and smoke-test a non-Meshy plugin card. | M | U03 |
| EU-016 | DONE | `src/js/kinds-f.js:9–81` has warehouse fleet, Bend policy decisions and simulated robot paths; `3a6dce1`, main twin card mounted in Chromium. This is a fixture, not live robot control or proof execution. | — | — | — |
| EU-017 | PARTIAL | All seven app mappings exist; `src/js/kinds-f.js:85–118` produces a shared demo. Chromium found every health spec reports the same four actual sources; Google Fit, NOOP and Lifesum are not represented as their own data sources. | Parameterized gallery test: mount Apple Health, Google Fit, Oura, WHOOP, NOOP, MyFitnessPal and Lifesum with source-specific synthetic fixtures; assert displayed values, units and provenance match each payload. | M | U04 |
| EU-018 | DONE | `04b68fa`, `src/js/ask.js:25–84,166–194`, `README.md:76–97`: typed question plans and interactive cards on sanitized real trace data. Chromium mounted summary, timeline and tools from a slowness question. Stats DOM tests cover filtering, pinning and span selection (`tools/stats.test.mjs:53–122`). Phrase routing is deterministic, not an LLM. | — | — | — |
| EU-019 | DONE | `1b5cc53` added the 31 s fframes film; `1f9074e` replaced it with a 37.9 s expanded cut. Same blob served HTTP 200; contact sheet shows card, host and flow montage. Reel precedes the kit (`src/index.html:44–49`). The old caption still says 31 s. | — | — | — |
| EU-020 | PARTIAL | OpenUI and major runtime/media credits in `README.md:159–169` and `src/index.html:198`; not an exhaustive library inventory (e.g. esbuild, linkedom, Ajv and Zod declared in `package.json:7–13` are not credited). | Test the README and site credits against a checked-in direct runtime/vendor/tool library manifest with upstream name and license; assert both include OpenUI, and classify tool-only credits separately. | S | U05 |
| EU-021 | PARTIAL | `a12ba4e` adds eight AODL/intent/intel cards and tests; Ripple PR #7 mounts cards and returns intents, #8 opens Ripple in Dash. `INTENT-KITS.md:1–4,20–49,81–89` documents an inline artifact seam, not live T3 integration. | In a running T3 development host, feed a sanitized Ripple/AODL pending contract, show the kit inline, select a slice and verify typed context returns to Ripple without granting approval authority. | M | U06 |
| EU-022 | PARTIAL | Chromium mounted four prod infra kinds. Prod 200 for both infra modules; hashes match `origin/gh-pages`. Pages `js/infra-data.js:2–20,41–53` covers AWS, GCP, Lambda GPU, Brev, k3s/kind and IaC; `js/kinds-infra.js:55–91,139–143` composes/exports architecture. Main has neither infra module nor the four kinds in its shared catalog; Glide separately has `openui-generation/test/architecture.test.mjs`. | On main, `node tools/card-catalog.mjs --check && node --test tools/catalog.test.mjs` includes architecture/cluster/IaC fixtures; Chromium edits a hybrid graph and asserts rendered edges and Mermaid/JSON export, plus representative k3s/kind and Terraform views. | L | U07 |
| EU-023 | DONE | `1f9074e` replaces linear puzzle with a branching graph. The 37.9 s production MP4 matches main and the extracted 20–30 s frames visibly show graph handoffs, human checkpoints, approvals and subsequent steps. | — | — | — |
| EU-024 | PARTIAL | `UX-AUDIT.md` contains rubric, grades and remediation; its Per card table groups kinds and its Not changed here section excludes ops/infra and notes missing 3D interaction exercise. Later fleet/intel and specialty kinds are not individually graded either. | Diff a machine-readable QA inventory against current catalog plus any deployed-only kinds; require one A/S grade per shipped kind, with keyboard/control and 390px/desktop Chromium receipts, or explicit removal. Exercise 3D with WebGL. | L | U08 |
| EU-025 | MISSING | Warehouse/Bend prototype is not an ACE facility card; generic workout is not form analysis. Public ACE tree contains `components/PascalFacility.tsx` and `facility/program.ts`, but no matching ACE catalog entry or workout form/tennis-swing kind was found in audited main/Pages. | Gallery test mounts ACE facility, workout form-analysis and tennis swing fixtures; assert selectable facility zones, timed body landmarks/corrections and swing phase scrub respectively. | M | U04 |
| EU-026 | PARTIAL | Prod serves the renamed kit but HTML, main JS and apps bytes differ from audited main `ad3cae2`; Chromium counted 75 prod registry kinds vs 86 on main. Prod includes Pages infra; GitHub's public deployment receipts only identify Pages, not Vercel production. | After reconciling production-only infra (U07), publish authorized then curl a production build SHA marker and assert equality with intended `origin/main`; compare representative asset hashes and run the prod gallery smoke. | S | U09 |
| EU-027 | PARTIAL | `src/js/fleet-data.js:80–84` mentions DemandIQ Video counts in a fleet portfolio fixture, not DemandIQ chart/model views. No DemandIQ app/kinds in main; unauthenticated public API for `kvnloo/demandiq` returned 404 (source may be private). | Obtain approved source inventory or sanitized payload examples; run parameterized gallery tests for every selected DemandIQ chart/model/page, asserting displayed series, units and selection events against fixtures. | M | U10 |
| EU-028 | SUPERSEDED | Exact duplicate of EU-030. No independent implementation or test needed; EU-030 retains both providers and the common-renderer requirement. | Use EU-030's adapter parity test as the single acceptance check. | L | U11 |
| EU-029 | DONE | `tools/export-cards.mjs:26–65,97–115` parses OpenUI Lang and uses the shared export path. A Board/EphemeralCards Uber fixture mounted via export-check; in Chromium settled card markup and tokens matched a direct catalog-kind export. This proves the exporter, not default wiring in every host. | — | — | — |
| EU-030 | PARTIAL | EU-029 proves OpenUI Lang. No A2UI adapter/parity test in the audited main/Pages source; Glide has OpenUI adapter tests, not evidence for A2UI interoperability. | `node --test tools/provider-parity.test.mjs`: render canonical OpenUI Lang and A2UI fixtures with equivalent inputs; assert equal normalized card spec, DOM content, theme tokens and interaction event; assert invalid payloads are rejected. | M | U11 |

## Ready-to-queue build units

### U01 — Public kind demos and brand-mode parity

Rows: EU-005, EU-007.

- **EU-005 (M):** Playwright: enumerate the catalog, navigate to a documented public demo for each kind, assert the actual kind mounts and at least one demo action runs without selecting a T3 host.
- **EU-007 (M):** Playwright: iterate every catalog kind in bare/host-only and themed/brand modes; assert its computed tokens switch as intended and its controls still work, with explicitly documented fixed-skin exceptions if required.

### U02 — Harness preview matrix

Rows: EU-006.

- **EU-006 (L):** Playwright: select T3, Hermes desktop, Tern/Glide, ChatGPT/Codex, Claude and o8 profiles in the site (separate where behavior differs), mount the same pinned fixture and assert each host skin and declared interaction tier. Label simulations; capture native receipts only where claiming native support.

### U03 — Agent-native Cua Spaces and Meshy fixtures

Rows: EU-014, EU-015.

- **EU-014 (M):** Playwright: load a distinct Cua Spaces fixture whose UI shows a space/session and its display state, and keep regression renders for Boat sandbox and scrcpy virtual display. Use fixture events only.
- **EU-015 (M):** In Chromium open the Meshy fixture, assert it loads and animates an approved Kevin/Meshy GLB with recorded provenance (not the Blender placeholder), and smoke-test a non-Meshy plugin card.

### U04 — Health provenance and advanced visual analysis

Rows: EU-017, EU-025.

- **EU-017 (M):** Parameterized gallery test: mount Apple Health, Google Fit, Oura, WHOOP, NOOP, MyFitnessPal and Lifesum with source-specific synthetic fixtures; assert displayed values, units and provenance match each payload.
- **EU-025 (M):** Gallery test mounts ACE facility, workout form-analysis and tennis swing fixtures; assert selectable facility zones, timed body landmarks/corrections and swing phase scrub respectively.

### U05 — Complete library attribution

Rows: EU-020.

- **EU-020 (S):** Test the README and site credits against a checked-in direct runtime/vendor/tool library manifest with upstream name and license; assert both include OpenUI, and classify tool-only credits separately.

### U06 — Ripple/AODL handoff in T3

Rows: EU-021.

- **EU-021 (M):** In a running T3 development host, feed a sanitized Ripple/AODL pending contract, show the kit inline, select a slice and verify typed context returns to Ripple without granting approval authority.

### U07 — Reconcile infra into main catalog

Rows: EU-022.

- **EU-022 (L):** On main, `node tools/card-catalog.mjs --check && node --test tools/catalog.test.mjs` includes architecture/cluster/IaC fixtures; Chromium edits a hybrid graph and asserts rendered edges and Mermaid/JSON export, plus representative k3s/kind and Terraform views.

### U08 — Grade and remediate every shipped kind

Rows: EU-024.

- **EU-024 (L):** Diff a machine-readable QA inventory against current catalog plus any deployed-only kinds; require one A/S grade per shipped kind, with keyboard/control and 390px/desktop Chromium receipts, or explicit removal. Exercise 3D with WebGL.

### U09 — Publish and fingerprint production

Rows: EU-026.

- **EU-026 (S):** After reconciling production-only infra (U07), publish authorized then curl a production build SHA marker and assert equality with intended `origin/main`; compare representative asset hashes and run the prod gallery smoke.

### U10 — DemandIQ gallery kit

Rows: EU-027.

- **EU-027 (M):** Obtain approved source inventory or sanitized payload examples; run parameterized gallery tests for every selected DemandIQ chart/model/page, asserting displayed series, units and selection events against fixtures.

### U11 — OpenUI Lang and A2UI adapter parity

Rows: EU-028, EU-030.

- **EU-028 (L):** Use EU-030's adapter parity test as the single acceptance check.
- **EU-030 (M):** `node --test tools/provider-parity.test.mjs`: render canonical OpenUI Lang and A2UI fixtures with equivalent inputs; assert equal normalized card spec, DOM content, theme tokens and interaction event; assert invalid payloads are rejected.
