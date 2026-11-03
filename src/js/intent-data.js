// The public snapshot is a projection, not an AODL document: hashes identify the private original.
// A live host can project a validated contract with contractView() and pass its own payload to make().
let data;
export const intentReady = () => data ??= fetch("data/intent-snapshot.json").then(r => { if (!r.ok) throw Error(`Intent snapshot: ${r.status}`); return r.json(); });
export function contractView(doc) {
  const b = doc.plan.bindings;
  const tasks = Object.entries(b).filter(([k, v]) => k.startsWith("task.") && v.text && v.acceptance);
  return { approval: b.approval.status, revision: doc.revision, sourceHash: b.approval.sourceHash, contractHash: b.approval.contractHash,
    tasks: tasks.map(([id, t]) => ({ id, text: t.text, status: t.status, interpretation: t.interpretation,
      acceptance: b[t.acceptance], preconditions: t.preconditions.map(p => b[p]) })) };
}
export const int = n => n == null ? "not recorded" : n.toLocaleString("en-US");
export const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : "N/A";
export function gateState(p) { return p.type === "pr_state" ? (p.want === p.observed && p.head === p.observedHead ? "pass" : "changed") : p.observed === "pass" ? "pass" : "unknown"; }
export const readiness = c => ({ approval: c.approval, observed: c.pre.filter(p => gateState(p) === "pass").length, total: c.pre.length, accepted: c.acceptance.receipt === "missing" ? false : null });
export function topRows(rows, key, n = 8) { return Object.entries(rows).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, n); }
export const ageDays = (stamp, now = Date.now()) => Math.max(0, (now - Date.parse(stamp)) / 864e5);
// This is only a view request. It cannot authorize execution, change a contract, or approve one.
export const reviewRequest = c => ({ v: 0, action: "request_review", sourceHash: c.sourceHash, contractHash: c.contractHash, revision: c.revision, approval: "pending" });
