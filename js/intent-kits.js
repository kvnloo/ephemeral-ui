import { h, rng } from "./motion.js";
import { KINDS_I } from "./kinds-i.js";
import { KINDS_T } from "./kinds-t.js";
import { intentReady } from "./intent-data.js";

export const INTENT_KITS = [
  { id: "declare", title: "01 / Declare", line: "From a sentence to a reviewable promise.", desc: "Ripple collects intent. The contract preserves the exact ask, separates context from work, and exposes evidence and boundaries before execution.", kinds: ["intent-declare", "intent-contract"], surface: "composer → review" },
  { id: "operate", title: "02 / Operate", line: "Keep the work and its proof separate.", desc: "One task decomposes into fork-scoped slices. Inspect a dependency, then inspect its receipt. A built branch does not turn the acceptance gate green.", kinds: ["intent-work", "intent-proof"], surface: "thread → work + proof" },
  { id: "understand", title: "03 / Understand", line: "Open only the layers the question needs.", desc: "z0intelligence explains decision traffic, context predictions and value coverage. OMP supplies the trace waterfall and tool drill-down, with its original data shapes.", kinds: ["intel-decisions", "intel-value", "intel-context", "intel-health", "trace", "trace-tools"], surface: "question → evidence" },
];

export function buildIntent({ catalog, setSpec, target = document.getElementById("intent") }) {
  if (!target) return;
  const out = h("div", { class: "ik-grid", "aria-live": "polite" });
  const context = h("div", { class: "ik-context" });
  const hostnote = h("pre", { class: "ik-hostnote", role: "status" });
  const nav = h("div", { class: "ik-kits", role: "tablist", "aria-label": "Intent kit" });
  const labels = { "intent-declare": "Ripple", "intent-contract": "AODL", "intent-work": "AODL", "intent-proof": "AODL", "intel-decisions": "z0intelligence", "intel-value": "z0intelligence", "intel-context": "z0intelligence", "intel-health": "z0intelligence" };
  let generation = 0;
  async function pick(id, updateHash = true) {
    const kit = INTENT_KITS.find(k => k.id === id) || INTENT_KITS[0];
    const gen = ++generation;
    [...nav.children].forEach(b => b.setAttribute("aria-selected", b.dataset.kit === kit.id ? "true" : "false"));
    context.replaceChildren(h("div", {}, h("b", {}, kit.line), h("p", {}, kit.desc)), h("code", {}, kit.surface));
    out.replaceChildren(); hostnote.textContent = "";
    try {
      const input = await intentReady();
      if (gen !== generation) return;
      const cards = kit.kinds.map(kind => {
        const trace = kind.startsWith("trace"), K = trace ? KINDS_T[kind] : KINDS_I[kind];
        const a = trace ? catalog.byId["omp-stats"] : catalog.byId[kind.startsWith("intel") ? "z0intelligence" : kind === "intent-declare" ? "ripple" : "aodl"] || { id: kind.startsWith("intel") ? "z0intelligence" : kind === "intent-declare" ? "ripple" : "aodl", name: labels[kind], hex: null };
        const c = K.make(a, rng(kind), trace ? undefined : input, { onReview: r => { hostnote.textContent = "HOST CALLBACK / request_review\n" + JSON.stringify(r, null, 2) + "\nNo approval was written. Wire this to the authoritative review UI."; } });
        let receipt = null;
        const seen = h("button", { type: "button", onclick: () => {
          if (receipt) { receipt.remove(); receipt = null; c.el.hidden = false; seen.textContent = "Seen"; }
          else { c.el.hidden = true; receipt = h("div", { class: "ik-hostnote" }, `${labels[kind] || "omp stats"} · ${K.label} · seen (view only)`); cell.append(receipt); seen.textContent = "Reopen"; }
        } }, "Seen");
        const cell = h("div", { class: "ik-cell" + (kind === "trace" ? " wide" : ""), "data-kind": kind }, h("div", { class: "ik-meta" }, h("span", {}, kind), seen), c.el);
        c.el.addEventListener("click", () => setSpec?.(c.spec), { capture: true });
        out.append(cell);
        c.done?.catch(e => { hostnote.textContent = `Source failed: ${e.message}`; });
        return c;
      });
      // The Understand sequence is 4 half cards, a full-width waterfall, then a full-width tool list.
      if (kit.id === "understand") out.lastChild.classList.add("wide");
      target.dataset.ready = "true";
      window.__intent.cards = cards;
    } catch (e) { out.replaceChildren(h("p", {}, `Source unavailable: ${e.message}. No fallback data generated.`)); }
    if (updateHash) history.replaceState(null, "", `#intent=${kit.id}`);
  }
  for (const k of INTENT_KITS) nav.append(h("button", { type: "button", role: "tab", "data-kit": k.id, "aria-selected": "false", onclick: () => pick(k.id) }, k.title));
  target.append(nav, context, hostnote, out,
    h("p", { class: "ik-caption" }, "Real, sanitized snapshots: a pending AODL contract from the background-work triage, z0intelligence receipt aggregates captured 3 Nov 2026, and the existing OMP trace fixture. These are separate sources: no contract↔trace relationship is claimed. Full runtime adapters, live refresh and formal approval remain host responsibilities. Type / Draw / Talk names the Ripple input seam, not a working microphone in this gallery."));
  window.__intent = { pick, kits: INTENT_KITS, KINDS: KINDS_I, cards: [] };
  const p = new URLSearchParams(location.hash.slice(1));
  pick(p.get("intent") || "declare", false);
  if (p.has("intent")) requestAnimationFrame(() => target.scrollIntoView());
}
