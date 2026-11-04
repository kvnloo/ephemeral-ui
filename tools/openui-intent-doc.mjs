#!/usr/bin/env node
// Project the sanitized intent snapshot into the bounded host document behind the
// ephemeral-intent/v1 OpenUI catalog (integration/openui/ephemeral-intent.v1.json).
// Every value a native renderer shows comes from here; the model only selects sections.
// usage: node tools/openui-intent-doc.mjs [src/data/intent-snapshot.json] > intent-board.json
import { readFileSync } from "node:fs";
import { gateState, topRows } from "../src/js/intent-data.js";

const MAX_TEXT = 400, MAX_LIST = 12, MAX_BYTES = 65536;
const snap = JSON.parse(readFileSync(process.argv[2] || new URL("../src/data/intent-snapshot.json", import.meta.url), "utf8"));
const c = snap.contract, z = snap.z0;
const text = s => String(s ?? "").replace(/[\x00-\x1f\x7f]/g, " ").slice(0, MAX_TEXT);
const list = a => a.slice(0, MAX_LIST);
const rows = (o, n = 8) => topRows(o, null, n).map(r => ({ label: text(r.label), value: r.value }));

const doc = {
  version: 1,
  title: "Intent → contract → proof → intelligence",
  intent: {
    revision: c.revision,
    sourceHash: c.sourceHash,
    sentences: list(c.sentences).map(s => ({ text: text(s.text), role: s.cls === "add" ? "task" : "context" })),
  },
  contract: {
    approval: c.approval,
    contractHash: c.contractHash,
    preconditions: list(c.pre).map(p => ({ label: text(p.ref), state: gateState(p) })),
    acceptance: { receipt: c.acceptance.receipt === "missing" ? "missing" : "present", clauses: list(c.acceptance.clauses).map(text) },
    facts: list(c.facts).map(f => ({ text: text(f.text), label: f.evidence.includes("observed") ? "observed" : "claimed" })),
  },
  work: {
    slices: list(c.slices.filter(s => !s.deferred && !s.out)).map(s => ({
      id: text(s.id), title: text(s.title), where: text(s.repo || (s.after?.length ? `after ${s.after.join(" → ")}` : "integration proof")), state: s.state,
    })),
  },
  intel: {
    decisions: {
      rows: z.decisions.rows, last: z.decisions.last,
      execution: rows(z.decisions.execution),
      providers: list(z.decisions.providers).slice(0, 8).map(p => ({ label: text(p.model ? `${p.provider} / ${p.model}` : `${p.provider} / unrecorded model`), value: p.n })),
      status: rows(z.decisions.status),
    },
    value: {
      estimatedAvoided: z.tokenomics.frontier_tokens_avoided_est, pairedRows: z.tokenomics.rows_with_baseline_and_measured,
      reportedSaved: z.tokenomics.actual_tokens_saved, verifiedTasks: z.tokenomics.verified_tasks,
    },
    context: {
      episodes: z.context.live.context_episodes, imported: z.context.imported.episodes, predictions: z.context.flow.rows,
      judged: z.context.flow.judged, hit: z.context.flow.hit, top1: rows(z.context.flow.top1, 6),
    },
    health: { ok: z.doctor.ok, backends: list(z.doctor.backends).map(b => ({ id: text(b.id), ready: !!b.ready, local: !!b.local })) },
  },
};
const out = JSON.stringify(doc, null, 1);
if (Buffer.byteLength(out) > MAX_BYTES) throw new Error(`intent board document exceeds ${MAX_BYTES} bytes`);
process.stdout.write(out + "\n");
