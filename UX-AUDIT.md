# ephemeral-ui UX audit: every card, every control

November 2026. This audit covers every card kind in `src/js/kinds-*.js` except `ops-*` and `infra-*`,
which another session is still building (see "Not changed here").

## The bar

A card shows up in the middle of an agent conversation. It is good when the person can glance at it,
correct the agent or say yes in one gesture, and keep talking. The agent should then know what they
pointed at, so nobody has to retype it. Every card is scored 0–2 on eight criteria (16 max):

| # | Criterion | 2 means | Source |
|---|---|---|---|
| 1 | **Glance** | The action, scope and amount can be read in three seconds | approval-flow "three-second rule" |
| 2 | **Nothing is dead** | Every visible control does something you can see | Nielsen #1, visibility of system status |
| 3 | **Correct and dismiss** | You can undo, edit, deny or cancel, and the card says what happens next | HAX G8, G9; approval states |
| 4 | **Context goes back to the agent** | Pointing at something (a row, a node, a bar, a slot) hands the agent typed ids, and the agent acknowledges it in the card | HAX G4, G12; Shape of AI "inline action" |
| 5 | **Explains itself** | The card answers "why this?" and states the consequences before you commit | HAX G11, G16; Shape of AI governors |
| 6 | **Commit matches risk** | Hold for anything irreversible or external, tap for reversible actions, undo for local ones | approval flow; Claude Code permission model |
| 7 | **Keyboard and labels** | Every pointer gesture (drag, swipe, draw) also works from the keyboard, and icon buttons have names | WCAG 2.1.1, 4.1.2 |
| 8 | **Honest state** | The status pill and the dissolve summary describe what actually happened, not the scripted outcome | approval states: pending, approved, rejected, expired |

Tiers: **S** 15–16 · **A** 12–14 · **B** 9–11 · **C** ≤ 8.

Research behind the bar:
- Microsoft HAX, 18 guidelines (CHI 2019). G7–G11 apply most here: efficient invocation, dismissal and correction, scoping when in doubt, and explaining why.
- Shape of AI (Campbell). Governors: action plan, controls, verification, stream of thought. Trust builders: footprints, caveats.
- agentinterface.co, "How to design an agent approval flow". Lead with the action and its scale, make Reject a real outcome, and handle approved, rejected, expired and superseded states, not only pending.
- Agentic UI pattern write-ups (kanopylabs, builtux). Atomic review cards, undo instead of confirm dialogs, and shared state between the human and the agent.

## What was wrong

The headless audit (`audit.mjs` below) built each card, clicked every control on a fresh, unplayed
copy, and counted DOM mutations and emitted events:

- **26 of the 30 everyday cards (`kinds-a`, `kinds-b`) had at least one dead button.** Examples:
  Deny, Mark all read, Open in Gmail, Apply, Mark duplicate, Schedule, Change seat, Rollback, Pause,
  Dry-run diff, Show all, Refine, Compact, Pin files, Live map, Get help, Log call, View diff, Logs.
  The 17 studio cards had the same problem in their footers (Export .tldr, Bounce stems, Flatten to
  .usdc, …). The whiteboard's whole tool palette was dead, and so was the health card's own **Why?** button.
- **None of the everyday cards sent anything back to the agent.** You could look, but you couldn't
  say "this one, not that one". That is the main thing a card in a chat is for, and only the trace
  library, combos, gallery and review cards did it.
- **No way to correct a mistake.** Swiping archived a row forever. Moving a kanban card or advancing a
  deal stage had no undo. Deny had no outcome.
- **Pointer-only gestures.** Kanban drag, calendar drag-select, swipe-to-archive, graph nodes and
  canvas tools had no keyboard path.
- **Dishonest summaries.** "Booked 30 min" no matter which slot you chose. The home card's summary was
  frozen at 62% wherever you turned the knob.

Visually most cards were already good. The low grades came from the interaction layer, not the paint.

## What changed

### A shared agent loop: `src/js/loop.js` and the `lp-*` styles at the end of `styles.css`

| Helper | What it does |
|---|---|
| `tell(card, { action, label, entities, ack })` | Emits `eui:intent` (bubbles, and is mirrored to a parent frame with `postMessage`), then shows the handoff inline: **You:** what you asked, followed by **✦ Agent:** the acknowledgement, streamed in. `ids` holds `"type:id"` strings, the shape `live-bridge.js` joins, and the typed map stays alongside as `entities`. |
| `undoable(card, label, revert)` | A reversible local change: one line with **Undo** and a draining bar. The deadline is a timer, so reduced motion can't close the window early. Undo quietly tells the agent too, so its picture of the card stays correct. |
| `why(text)` | A "Why?" disclosure with the agent's reason (HAX G11). |
| `settle(card, status, tone)` | One place to set the status pill and outcome tone: ok, hot, denied or paused. It also sets `data-state` for hosts and tests. |
| `roving(items)` | Arrow keys move between items; Enter or Space activates. |
| `act(text, { ack })` | A footer button that hands an outside-the-card action (export, open in the app, sync) to the agent. It confirms in place. |

Event contract:

    eui:intent  { v: 0, kind, app, action, label, ids: ["invoice:4471", …], entities: { invoice: "4471" }, text?, at }

The pin ring on every card now emits `eui:intent` `pin` / `unpin` as well. A card you keep is context,
not exhaust.

### Per card

| Card | Before | After | What changed |
|---|---|---|---|
| inbox | C | A | Click or Enter picks the message the agent should use, which corrects its guess. Swipe or **E** archives, with Undo. Mark all read is real and undoable. |
| thread | C | A | Entity chips (date, amount, terms, company) pin into the agent's context. The draft is editable before Send. Send and Forward have Undo. |
| approve | C | S | Each scope says what is lost if you switch it off. "Hold to allow 1 of 2" follows your toggles. "Always" explains revocation. **Why?** gives the reason. Deny has an outcome: the agent says what it will do instead, and Deny itself can be undone. Granted access can be revoked. |
| chat | B | A | Free-text reply, unsend on the chips, and "What do they need from me?" |
| notify | C | A | Clear all with Undo, swipe-clear with Undo, opening a note asks the agent, keyboard fan-out. |
| slots | C | A | Arrow keys move the slot and Shift+arrows resize it. Busy time blocks, same as dragging. "Suggest another" is real. The booking and summary state the slot you actually chose. |
| kanban | B | A | ← → moves a focused card. Each move is undoable and is told to the agent with the issue id. |
| triage | C | A | Apply and Mark duplicate do something, with states and Undo, and the summary uses the priority you picked. |
| file | C | A | Each summary bullet is a question you can ask (with its page). "Open at p. 3". |
| graph | C | A | Click or Enter a note to focus the agent on it; it answers with the links. Find orphans really checks link counts and says there are no true orphans. |
| search | C | A | Results are a listbox you can pick from. Show more and Refine (a real query field with filtering and an empty state) work. |
| feed | B | A | Edit makes the text editable, with a character counter and limit. Post has a 7-second unpost. Rewriting the post teaches the agent your voice. |
| frames | C | A | Request changes opens an inline note that goes to the agent. The comment pin explains itself. Approve tells the agent. |
| sign | C | A | Step counter in the status pill. Decline asks why, and each reason has a different outcome; "discuss terms" doesn't decline in DocuSign. |
| context | C | S | Compact shows what it frees and has Undo. Pin files keeps files through compaction. Each legend row answers "what's in here?" (for example, 6 unused tool schemas, −9k). |
| receipt | C | S | Line items show before you pay, the unusual one is highlighted, and **Why?** explains it. Schedule offers dates with their consequences, plus Undo. Paying tells the agent. |
| metric | C | A | Click any point on the chart to ask about it (the agent gets the bucket). Alert me draws a threshold line and can be turned off. Open dashboard hands off. |
| track | C | A | Live updates toggle. Get help offers reasons with honest outcomes ("the address is locked, but…"). |
| crm | B | A | Log call takes inline notes and the agent picks out pricing. Stage moves have Undo. |
| ride | B | A | Keyboard choice. A matched driver comes with a 9-second free-cancel window. The summary is the ride you chose. |
| route | C | A | Start shows the first turn and settles to Navigating. Send to phone hands off. |
| boarding | C | A | Change seat offers seats with their price and Undo, and the pass updates. |
| workout | C | A | Per-km splits, and Share points out that the map starts at your home. |
| home | B | A | Labelled knob, and the summary follows the actual value. |
| merge | B | A | View diff shows the hunk. |
| ci | B | A | Logs show the real failure. Click any job to ask why it's failing or slow. |
| deploy | C | A | Cancel while building, Roll back once ready (with Undo), and Promote says what the agent will watch. |
| incident | C | S | Roll back is now a hold, because it's destructive and external. Each step adds to the timeline, and the agent states the next step and its exit criterion. |
| migrate | C | A | Pause really pauses (animations, counters and the run) between batches. Show SQL with reversibility and lock notes. |
| nodes, board, gallery, layers, daw | B | A | Click or Enter a node to talk about it. The whiteboard tools really draw, and drawings feed Make Real. Gallery "Send N to agent" works, with keyboard select. Variations are labelled and "Keep" names the one you chose. Empty DAW slots are labelled. |
| other studio, 3D, e, f, p footers | B | A− | Every dead footer button now hands off through `act()` with a specific acknowledgement. The health card's **Why?** answers. |
| trace-*, stats library | A/S | unchanged | Already emit select/pin/brush/filter, keyboard and real data. This is the bar the rest now meets. |
| intent-*, intel-* | A− | unchanged | Honest, dense, read-only by design (a review request is never an approval). |

## User stories (each one is a gate in `journeys.mjs`)

1. **"Pay the Acme invoice", from the inbox.** The agent guessed the wrong email. *Before:* you retype
   "no, the October one". *Now:* click the right row; the agent says "working from … instead".
   Archive the noise with **E**, and Undo if you hit the wrong one.
2. **Least-privilege OK.** The agent wants to send mail as you. You switch off "Read the thread". The
   card says what that costs ("the reply won't quote the thread") and the button becomes "Hold to
   allow 1 of 2". Deny is a real outcome: the agent says it will only save a draft.
3. **Check before money moves.** The receipt shows a new $112.50 overage. **Why?** explains it (450 calls
   over plan). You schedule for Nov 13 instead of paying now, and the agent confirms.
4. **Find a time without a mouse.** Focus the grid, ← → to a day, Shift+↓ to stretch, hold to book.
   The invite says the slot you chose.
5. **Move work along from the keyboard.** Focus a kanban card, press →, and the agent hears
   `move issue:TRE-274 column:In progress`. Undo is there for 6 s.
6. **Keep the session going.** Context is at 84%. Pin files, then Compact: the card shows what is freed
   (48k) and what is kept, and Undo is there for 8 s. Ask "what's in Tools?" and get a concrete saving
   (−9k).
7. **On-call at 2 a.m.** Hold to acknowledge, then hold to roll back (destructive, so it's a hold). The
   timeline grows, and the agent says the incident stays open until errors are under 0.5% for 10 min.
8. **Sketch with the agent.** Choose Rectangle, draw around something, then Make Real. The agent
   builds it "including your 1 addition".
9. **Search and refine in place.** Refine turns the query into a field. Pick the result, and the agent
   reads it and cites it.
10. **Stop a migration safely.** Pause is between batches and nothing is half-written. Show SQL to see
    reversibility and locks before resuming.

## How it was checked

The checks run against a stage copy of `src/`. Harness and evidence are in `out/ux-audit/`, which is
gitignored: `audit.html` (a light page with only the card modules), `audit.mjs`, `journeys.mjs`,
`gate2.sh`, screenshots and logs. Everything ran on groot with one headless-shell Chromium, run
sequentially, because the MBP queue was held by another job:

- `audit.mjs`: every kind at 460 px. Screenshots before and after play, a dead-control probe
  (fresh card per control, with baseline mutations subtracted), overflow, unlabeled controls,
  and page errors.
- `journeys.mjs`: the 12 stories above, driven with real pointer and keyboard input. Each one asserts
  its outcome and the emitted `eui:intent` ids, and collects page errors. It runs in `t3-dark` at
  460 px and `hermes-nous` (light) at 380 px.

Results:
- Journeys: 12/12 pass with 0 page errors, in both t3-dark at 460 px and hermes-nous at 380 px.
- Dead-control probe after the fixes: 0 dead controls on the 45 non-3D, non-fixture kinds.
  - The probe still flags a few controls, but none are dead. Post is disabled while the draft is
    empty, and Promote is disabled until the build finishes. Gallery tiles open a lightbox outside
    the card, and generic graph nodes select on pointerup rather than click.
- The probe also caught a real bug that would have reached the live site. `screen` had a local
  `act()` that shadowed the new import, so Save trajectory threw. It is fixed.

## Not changed here

- `kinds-ops.js` and `kinds-infra.js` are another session's uncommitted work, so they weren't edited
  or graded beyond a look. Infra reads as a B: the copy is mostly caveats ("not deployable IaC", "no
  apply"), information density is low, and there are no pick-to-context events. Recommendation: put
  the caveat in one provenance chip, and make nodes and rows emit `eui:intent` `select`, like the trace
  cards do.
- The 3D kinds (`kinds-3d.js`) only got the footer handoffs. The headless audit can't run WebGL on this
  host, so their interactions were not exercised.
- The `nodes` canvas is 720 px wide inside a horizontal scroller. At chat width you scroll to see the
  last node; a fit-to-width zoom would be better.
