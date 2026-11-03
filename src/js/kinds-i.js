// Ripple interaction, AODL intent contract, z0intelligence receipts. No approval or execution writes.
// make(app, rng, input?, { onReview?, onInspect? }) uses a sanitized snapshot by default.
import { h } from "./motion.js";
import { shell } from "./shell.js";
import { intentReady, int, pct, gateState, readiness, topRows, ageDays, reviewRequest } from "./intent-data.js";

const chip = (t, cls = "") => h("span", { class: "ic-chip " + cls }, t);
const note = t => h("p", { class: "ic-note" }, t);
const code = t => h("code", { class: "ic-code" }, t);
const stack = (...kids) => h("div", { class: "ic-stack" }, ...kids);
const details = (label, ...kids) => h("details", { class: "ic-details" }, h("summary", {}, label), ...kids);
const btn = (text, fn, cls = "") => h("button", { class: "ic-btn " + cls, type: "button", onclick: fn }, text);
const stats = cells => h("div", { class: "ic-stats" }, cells.map(([l, v, f]) => h("div", { class: "ic-stat" }, h("span", {}, l), h("b", {}, v), h("small", {}, f))));
function tabs(labels, cb) {
  const el = h("div", { class: "ic-tabs", role: "tablist" });
  labels.forEach((l, i) => el.append(btn(l, () => { [...el.children].forEach((b, j) => b.setAttribute("aria-selected", i === j ? "true" : "false")); cb(i); })));
  [...el.children].forEach((b, i) => { b.setAttribute("role", "tab"); b.setAttribute("aria-selected", i === 0 ? "true" : "false"); });
  return el;
}
function bars(rows, { unit = "", onPick } = {}) {
  const max = Math.max(1, ...rows.map(x => x.value));
  return h("div", { class: "ic-bars", role: "list" }, rows.map((x, i) => {
    const content = [h("span", { class: "ic-barlabel" }, x.label), h("i", { class: "ic-meter", "aria-hidden": "true", style: { "--ic-w": `${100 * x.value / max}%`, "--ic-n": i % 4 } }), h("b", {}, int(x.value) + unit)];
    return onPick ? h("button", { class: "ic-bar", type: "button", role: "listitem", onclick: () => onPick(x), "aria-label": `${x.label}: ${int(x.value)}` }, ...content) : h("div", { class: "ic-bar", role: "listitem" }, ...content);
  }));
}
function card(a, kind, title, status, input, build, opts = {}) {
  const body = h("div", { class: "ic" }, note("Loading source…"));
  const el = shell(a, kind, { verb: title, status, body, summary: title, cls: "ic-card" });
  const done = (input ? Promise.resolve(input) : intentReady()).then(d => {
    const node = build(d, opts); body.replaceChildren(node); return d;
  }).catch(e => { body.replaceChildren(note("Source unavailable. No result inferred.")); throw e; });
  // A host can await done. Gallery play does not animate or change source state.
  return { el, done, async play() { await done; }, spec: { kind, app: a.id, actions: "read-only", input: { source: "intent-snapshot.v0" }, ttl: "until-done" } };
}

function declareNode(d, o) {
  const c = d.contract, out = h("div", { class: "ic-inspect" });
  const source = h("div", { class: "ic-source" }, c.sentences.map((s, i) => h("button", { class: "ic-sentence", type: "button", onclick: () => {
    out.replaceChildren(chip(s.cls === "add" ? "One ask → one task" : "Context, not another task", s.cls === "add" ? "ok" : ""), h("p", {}, s.reason || c.task.interpretation), code(`source ${c.sourceHash} · sentence ${i + 1}`));
  } }, h("span", {}, s.text), chip(s.cls === "add" ? "+ task" : "context"))));
  const review = btn("Prepare review ↗", () => {
    const request = reviewRequest(c);
    out.replaceChildren(chip("Review request prepared", "warn"), note("Nothing approved. A host must open the authoritative review UI for this exact revision."), h("pre", { class: "ic-pre" }, JSON.stringify(request, null, 2)));
    o.onReview?.(request);
  }, "primary");
  return stack(h("div", { class: "ic-eyebrow" }, "RIPPLE / DECLARED INTENT", chip(`r${c.revision}`, "")), source,
    h("div", { class: "ic-dock" }, h("span", { class: "ic-inputs" }, "Type · Draw · Talk"), chip("Input adapters required")),
    out, h("div", { class: "ic-actions" }, review, code(`source ${c.sourceHash.slice(0, 12)}`)), note("Exact source text is immutable. Edits become a new proposed revision; this card cannot silently rewrite intent or approve work."));
}
function contractNode(d) {
  const c = d.contract, state = readiness(c), panel = h("div", { class: "ic-inspect" });
  function render(i) {
    if (i === 0) panel.replaceChildren(h("h3", {}, "What counts as done"), details("Interpretation · read the full scope", note(c.task.interpretation)), ...c.acceptance.clauses.map(x => h("div", { class: "ic-clause" }, chip("?", "warn"), code(x))), note("Acceptance receipt is missing. Passing preconditions or an ACP test is not this real-turn proof."));
    if (i === 1) panel.replaceChildren(...c.facts.map(f => details(`${f.evidence.join(" / ")} · ${f.n} source${f.n === 1 ? "" : "s"}`, h("p", {}, f.text))), note("Observed and claimed are evidence labels, not confidence percentages. Public snapshot omits private citation paths."));
    if (i === 2) panel.replaceChildren(...c.conflicts.map(f => h("div", { class: "ic-conflict" }, chip("conflict", "warn"), h("p", {}, f))), ...c.slices.filter(x => x.out || x.deferred).map(x => details(x.out ? "Out of scope" : "Deferred", h("p", {}, x.work))));
  }
  render(0);
  return stack(stats([["Approval", c.approval, "not executable"], ["Preconditions", `${state.observed}/${state.total}`, "observed at capture"], ["Acceptance", "unproven", c.acceptance.receipt + " receipt"]]),
    tabs(["Done means", "Evidence", "Boundaries"], render), panel,
    h("div", { class: "ic-seal" }, chip("PENDING", "warn"), code(`contract ${c.contractHash.slice(0, 12)} · r${c.revision}`)), note("Formal approval remains in OMP /aodl. This prototype only requests a review; it never emits approval JSON."));
}
function workNode(d, o) {
  const c = d.contract, slices = c.slices.filter(s => s.title), drawer = h("div", { class: "ic-inspect" });
  const rows = slices.map(s => h("button", { class: "ic-slice", type: "button", onclick: () => {
    rows.forEach(r => r.setAttribute("aria-pressed", r.dataset.slice === s.id ? "true" : "false"));
    drawer.replaceChildren(h("h3", {}, s.title), note(s.work), code(s.check), ...(s.head ? [note(`Observed fork head ${s.head}`)] : []), ...(s.note ? [note(s.note)] : [])); o.onInspect?.({ type: "slice", id: s.id });
  }, "data-slice": s.id, "aria-pressed": "false" }, h("b", { class: "ic-node" }, s.id), h("span", { class: "ic-slicetext" }, h("b", {}, s.title), h("small", {}, s.repo || (s.after.length ? `after ${s.after.join(" → ")}` : "integration proof"))), chip(s.state, s.state === "built" ? "ok" : "warn")));
  drawer.append(note("Inspect a slice to see its seam, verifier, and observed fork state."));
  return stack(h("div", { class: "ic-eyebrow" }, "SEQUENCE / ONE TASK, THREE SLICES"), h("div", { class: "ic-slices" }, ...rows), drawer,
    details("Deferred + explicitly outside this plan", ...c.slices.filter(s => s.deferred || s.out).map(s => note(s.work))),
    note("Built ≠ approved ≠ accepted. These are observed implementation states, not authorization to run the next slice."));
}
function proofNode(d) {
  const c = d.contract;
  return stack(h("div", { class: "ic-proofhead" }, h("span", { class: "ic-proofnum" }, "0"), h("div", {}, h("h3", {}, "real-turn acceptance receipts"), note("The job is not done yet."))),
    ...c.pre.map(p => details(`${gateState(p) === "pass" ? "✓" : "?"} ${p.ref}`, h("p", {}, p.claim), code(p.cmd || `${p.want} @ ${p.head}`), note(`Observed: ${p.observed}${p.observedHead ? " @ " + p.observedHead : ""}`))),
    h("div", { class: "ic-proofmissing" }, chip("Missing", "warn"), code(c.task.target), ...c.acceptance.clauses.map(x => h("p", {}, code(x)))),
    note(`Preconditions rechecked ${c.checkedAt}. They are snapshots, not subscriptions. A real turn must produce the acceptance receipt; no synthetic pass button.`));
}
function decisionsNode(d, o) {
  const z = d.z0.decisions, body = h("div"), inspector = h("div", { class: "ic-inspect" });
  const pick = row => { inspector.replaceChildren(h("b", {}, row.label), note(`${int(row.value)} recorded events. Events include starts, completions and admission steps; these are not unique jobs.`)); o.onInspect?.({ type: "aggregate", key: row.label }); };
  const views = [() => bars(topRows(z.execution), { onPick: pick }), () => bars(z.providers.slice(0, 7).map(x => ({ label: `${x.provider} / ${x.model || "unrecorded model"}`, value: x.n })), { onPick: pick }), () => bars(topRows(z.status), { onPick: pick }), () => bars(topRows(z.capabilities), { onPick: pick })];
  body.append(views[0]());
  return stack(stats([["Decision events", int(z.rows), "raw valid JSON rows"], ["Newest event", z.last.slice(0, 10), `${Math.floor(ageDays(z.last))}d old at view time`]]),
    tabs(["Execution", "Providers", "Outcomes", "Capabilities"], i => body.replaceChildren(views[i]())), body, inspector,
    details("Why this is not a success-rate dashboard", note("Orchestration, live calls and log-only policy traces share this receipt file. Status events repeat per job. No model ranking or savings percentage is inferred from event counts.")),
    note("Historical capture, not live. Select a bar to inspect the aggregate. A host may link actual trace IDs privately; no trace identity is invented here."));
}
function valueNode(d) {
  const t = d.z0.tokenomics, panel = h("div");
  const render = i => {
    if (i === 0) panel.replaceChildren(stats([["Estimated avoided", int(t.frontier_tokens_avoided_est), "counterfactual estimate"], ["Paired rows", int(t.rows_with_baseline_and_measured), "baseline + measurement"], ["Reported saved", int(t.actual_tokens_saved), "receipt summary's field"], ["Verified tasks", int(t.verified_tasks), "tokens / task: N/A"]]), note("Estimated avoidance is not a billing credit. Reported savings is not independently reconciled here. No percentage is computed from aggregates with different populations."));
    else panel.replaceChildren(stats([["All summary rows", int(t.rows), "not the raw event count"], ["Outcome rows", int(t.rows_with_outcome), "not verified tasks"], ["Baseline sum", int(t.baseline_tokens_sum), "all summary rows"], ["Measured sum", int(t.measured_frontier_tokens_sum), "not a matching denominator"]]), bars(topRows(t.by_capability)), note("Capability bars count summary rows, not spend. Raw decisions and tokenomics summary use different selection and joining rules."));
  };
  render(0);
  return stack(tabs(["Value, with caveats", "Coverage + population"], render), panel, chip("Measured ≠ estimated ≠ verified", "warn"));
}
function contextNode(d) {
  const z = d.z0.context, p = h("div");
  const render = i => {
    if (i === 0) p.replaceChildren(stats([["Live episodes", int(z.live.context_episodes), `${int(z.live.closed_episodes)} closed`], ["Imported", int(z.imported.episodes), "not all live episodes"], ["Predictions", int(z.flow.rows), `${int(z.flow.committed)} committed`], ["Family top-1", pct(z.flow.hit, z.flow.judged), `${int(z.flow.hit)} / ${int(z.flow.judged)} labeled rows`]]), bars(topRows(z.flow.top1)), note(`Latest flow day: ${z.flow.last || "not recorded"}. Top-1 is a family-label match on labeled rows, not verified downstream utility. Pending labels are excluded.`));
    else p.replaceChildren(stats([["Shadow predictions", int(z.live.shadow_predictions), "workspace source"], ["Horizons", int(z.live.prediction_horizons), "multiple per prediction"], ["Routines", int(z.live.routine_candidates), `${int(z.imported.routines)} imported`]]), bars(topRows(z.operators)), note("Targets, window names, candidate IDs and raw context are withheld. Only operator families and numeric aggregates leave the private source."));
  };
  render(0);
  return stack(tabs(["Predict → observe", "Source coverage"], render), p, chip("No automatic action authorized", "warn"));
}
function healthNode(d) {
  const z = d.z0.doctor;
  return stack(h("div", { class: "ic-eyebrow" }, "Z0INT / CAPTURE ENVIRONMENT", chip(z.ok ? "ready" : "degraded", z.ok ? "ok" : "warn")),
    note("Readiness reflects the interpreter used to capture this snapshot, not every installed service or host."),
    ...z.backends.map(b => details(`${b.ready ? "◌" : "!"} ${b.id} · ${b.local ? "local" : "remote"}`, note(b.why), chip(b.ready ? "credential presence only" : "not ready", "warn"), note("Live execution is the readiness proof."))),
    details("OMP extension wiring", note(`Linked: ${z.omp.linked.join(", ")}`), note(`Missing: ${z.omp.missing.join(", ")}`)),
    details("Interpreter gaps", ...z.unresolved.map(x => note(x)), note(`Evolution Lab importable: ${z.evolutionLab.importable}. Kerdoios importable: ${z.kerdoios.importable}.`)));
}
const define = (label, title, status, build) => ({ label, intent: true, verb: () => title, make: (a, r, input, opts) => card(a, label.toLowerCase().replaceAll(" ", "-"), title, status, input, build, opts) });
export const KINDS_I = {
  "intent-declare": define("Intent declaration", "One ask. Exact words.", "Pending", declareNode),
  "intent-contract": define("Intent contract", "Review before execution", "Pending", contractNode),
  "intent-work": define("Intent work graph", "Implementation is not acceptance", "Observed", workNode),
  "intent-proof": define("Intent proof", "Show me the real-turn receipt", "Missing", proofNode),
  "intel-decisions": define("Intelligence decisions", "Where decisions went", "Snapshot", decisionsNode),
  "intel-value": define("Intelligence value", "Savings, without wishful math", "Snapshot", valueNode),
  "intel-context": define("Intelligence context", "Prediction meets the next action", "Snapshot", contextNode),
  "intel-health": define("Intelligence health", "Can this runtime actually execute?", "Degraded", healthNode),
};
// Keep the registry key authoritative in the shell and serialized spec.
for (const [kind, K] of Object.entries(KINDS_I)) {
  const make = K.make;
  K.make = (...args) => { const c = make(...args); c.el.dataset.kind = kind; c.spec.kind = kind; return c; };
}
