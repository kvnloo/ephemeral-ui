import { h } from "./motion.js";
import { shell, svg } from "./shell.js";
import { SERVICES, ARCHITECTURES, CLUSTERS, IAC, cloneGraph, validateGraph, toMermaid, planSummary } from "./infra-data.js";

const btn = (text, onclick) => h("button", { type: "button", class: "eu-btn ghost sm", onclick }, text);
const hint = text => h("p", { class: "if-hint" }, text);
const select = (label, entries, onChange) => {
  const el = h("select", { "aria-label": label }, entries.map(([value, text]) => h("option", { value }, text)));
  el.addEventListener("change", () => onChange(el.value));
  return el;
};
function card(a, kind, verb, body, input) {
  const spec = { kind, app: a.id, actions: "read-only", input, provenance: "authored-example" };
  const el = shell(a, kind, { verb, status: "Example · offline", body, summary: `${a.name} · ${verb} (example)` });
  return { el, spec, async play() {} };
}

export function diagramSVG(input, selected) {
  const g = validateGraph(input), columns = Math.min(4, g.nodes.length), rows = Math.ceil(g.nodes.length / columns);
  const width = columns * 210, height = rows * 130 + 35;
  const positions = new Map(g.nodes.map((n, i) => [n.id, { x: (i % columns) * 210 + 12, y: Math.floor(i / columns) * 130 + 22 }]));
  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${g.title}. ${g.nodes.length} services, ${g.edges.length} connections. Select a service below for details.`, xmlns: "http://www.w3.org/2000/svg" });
  root.append(svg("title", {}, g.title));
  for (const e of g.edges) {
    // Same row: side to side. Otherwise: bottom of the upper box to the top of the lower one.
    const p = positions.get(e.from), q = positions.get(e.to);
    let d, head;
    if (p.y === q.y) {
      const right = q.x > p.x, x1 = right ? p.x + 180 : p.x, x2 = right ? q.x : q.x + 180, y = p.y + 32 + (Math.abs(q.x - p.x) > 210 ? 18 : 0), s = right ? -6 : 6;
      d = Math.abs(q.x - p.x) > 210 ? `M${x1},${p.y + 50} C${x1 + (right ? 30 : -30)},${p.y + 100} ${x2 + (right ? -30 : 30)},${p.y + 100} ${x2},${y}` : `M${x1},${y} L${x2},${y}`;
      head = `M${x2 + s},${y - 4} L${x2},${y} L${x2 + s},${y + 4}`;
    } else {
      const down = q.y > p.y, x1 = p.x + 90, y1 = down ? p.y + 65 : p.y, x2 = q.x + 90, y2 = down ? q.y : q.y + 65, s = down ? -6 : 6;
      d = `M${x1},${y1} C${x1},${y1 + (down ? 35 : -35)} ${x2},${y2 + (down ? -35 : 35)} ${x2},${y2}`;
      head = `M${x2 - 4},${y2 + s} L${x2},${y2} L${x2 + 4},${y2 + s}`;
    }
    root.append(svg("path", { class: "if-edge", d, fill: "none", stroke: "#888", "stroke-width": "1.5" }), svg("path", { class: "if-edge", d: head, fill: "none", stroke: "#888", "stroke-width": "1.5" }));
  }
  for (const n of g.nodes) {
    const p = positions.get(n.id), s = SERVICES[n.service];
    root.append(svg("g", { "data-node": n.id }, svg("rect", { class: "if-box" + (selected === n.id ? " on" : ""), x: p.x, y: p.y, width: 180, height: 65, rx: 8, fill: selected === n.id ? "#e2e8f0" : "#f8fafc", stroke: selected === n.id ? "#475569" : "#94a3b8" }), svg("text", { class: "if-prov", x: p.x + 10, y: p.y + 23, fill: "#475569", "font-size": 11, "font-family": "system-ui" }, s.provider), svg("text", { class: "if-svc", x: p.x + 10, y: p.y + 45, fill: "#0f172a", "font-size": 12, "font-family": "system-ui" }, s.label)));
  }
  return root;
}
function architecture(a, r, input, options = {}) {
  const initial = input || ARCHITECTURES.find(g => g.id === ({ "google-cloud": "gcp", "aws": "aws", "amazon-web-services": "aws", "aws-lambda": "aws", "lambda-gpu-cloud": "gpu", "nvidia-brev": "gpu", "terraform": "delivery", "unsloth": "gpu" }[a.id])) || ARCHITECTURES[3];
  let graph = cloneGraph(initial), selected = graph.nodes[0].id, note = initial.note || "Custom authored example; validate deployment separately.";
  const visual = h("div", { class: "if-diagram" }), nodes = h("div", { class: "if-node-picks", role: "group", "aria-label": "Inspect service" });
  const inspector = h("div", { class: "if-inspector", "aria-live": "polite" }), output = h("textarea", { class: "if-code", "aria-label": "Architecture JSON editor", rows: 9 });
  const message = h("p", { class: "if-hint", role: "status" });
  const edges = h("ol", { class: "if-edges", "aria-label": "Connections" });
  const source = select("Connection source", [], () => {}), dest = select("Connection target", [], () => {});
  const label = h("input", { "aria-label": "Connection label", placeholder: "HTTPS / artifact / placement", maxlength: 100 });
  const service = select("Add service", Object.values(SERVICES).map(s => [s.id, `${s.provider} / ${s.label}`]), () => {});
  const c = card(a, "infra-architecture", "Compose a service architecture", h("div", { class: "if-body" }), { architecture: graph });
  const updateSpec = () => { c.spec.input = { architecture: cloneGraph(graph) }; options.onChange?.(cloneGraph(graph)); };
  function render() {
    visual.replaceChildren(diagramSVG(graph, selected));
    nodes.replaceChildren(...graph.nodes.map(n => h("button", { type: "button", "aria-pressed": String(n.id === selected), onclick: () => { selected = n.id; render(); } }, SERVICES[n.service].label)));
    const n = graph.nodes.find(n => n.id === selected), s = SERVICES[n.service];
    inspector.replaceChildren(h("b", {}, `${s.provider} / ${s.label}`), hint(s.detail), hint(`${graph.edges.filter(e => e.to === n.id).length} inbound · ${graph.edges.filter(e => e.from === n.id).length} outbound`), btn("Remove selected service", () => {
      if (graph.nodes.length === 1) { message.textContent = "Keep at least one service."; return; }
      graph.nodes = graph.nodes.filter(x => x.id !== selected); graph.edges = graph.edges.filter(e => e.from !== selected && e.to !== selected); selected = graph.nodes[0].id; render();
    }));
    edges.replaceChildren(...graph.edges.map((e, i) => h("li", {}, h("span", {}, `${SERVICES[graph.nodes.find(n => n.id === e.from).service].label} → ${SERVICES[graph.nodes.find(n => n.id === e.to).service].label} · ${e.label}`), btn("Remove connection", () => { graph.edges.splice(i, 1); render(); }))));
    for (const el of [source, dest]) el.replaceChildren(...graph.nodes.map(n => h("option", { value: n.id }, `${n.id} / ${SERVICES[n.service].label}`)));
    if (dest.options.length > 1) dest.selectedIndex = 1;
    output.value = JSON.stringify(graph, null, 2); updateSpec();
  }
  function exportText(format) {
    const text = format === "json" ? JSON.stringify(graph, null, 2) : format === "mermaid" ? toMermaid(graph) : new XMLSerializer().serializeToString(diagramSVG(graph));
    exported.value = text; message.textContent = `${format.toUpperCase()} generated locally. No infrastructure changed.`;
    options.onExport?.({ format, text });
  }
  const exported = h("textarea", { class: "if-code", readonly: true, rows: 7, "aria-label": "Generated architecture export" });
  const presets = select("Architecture example", ARCHITECTURES.map(g => [g.id, g.title]), id => { const p = ARCHITECTURES.find(g => g.id === id); graph = cloneGraph(p); selected = graph.nodes[0].id; note = p.note; caution.textContent = note; exported.value = ""; message.textContent = "Example loaded."; render(); });
  presets.value = initial.id || "hybrid";
  const caution = hint(note);
  c.el.querySelector(".if-body").append(hint("Authored diagram · arrows express intent, not verified integrations or network access."), presets, visual, nodes, inspector, caution,
    h("details", {}, h("summary", {}, "Compose services & connections"), h("div", { class: "if-controls" }, service, btn("Add service", () => {
      if (graph.nodes.length >= 24) { message.textContent = "Maximum 24 services."; return; }
      let i = 0; while (graph.nodes.some(n => n.id === `custom${i}`)) i++;
      selected = `custom${i}`; graph.nodes.push({ id: selected, service: service.value }); render();
    }), source, dest, label, btn("Connect services", () => {
      try { const next = validateGraph({ ...graph, edges: [...graph.edges, { from: source.value, to: dest.value, label: label.value }] }); graph = next; message.textContent = "Connection added."; render(); }
      catch (e) { message.textContent = e.message; }
    })), edges),
    h("details", {}, h("summary", {}, "Generate from architecture JSON"), hint("Edit the typed graph or paste one emitted by an agent. Validation is atomic; invalid input leaves the diagram untouched."), output, btn("Generate diagram", () => {
      try { const next = validateGraph(JSON.parse(output.value)); graph = next; selected = graph.nodes[0].id; caution.textContent = "Custom authored example; verify identity, networking, compatibility and cost independently."; message.textContent = "Diagram generated."; render(); }
      catch (e) { message.textContent = `Not changed: ${e.message}`; }
    })), h("div", { class: "if-controls" }, btn("Export JSON", () => exportText("json")), btn("Export Mermaid", () => exportText("mermaid")), btn("Export SVG", () => exportText("svg"))), exported, message);
  render();
  return c;
}
function cluster(a) {
  const view = h("div", { class: "if-body" });
  const picker = select("Cluster context", Object.entries(CLUSTERS).map(([id, c]) => [id, c.label]), render);
  const body = h("div", { class: "if-stack" });
  const c = card(a, "infra-cluster", "Inspect a cluster context", view, {});
  function render(id) {
    const d = CLUSTERS[id]; c.spec.input = { context: id, snapshot: d, source: "authored-example" };
    body.replaceChildren(hint("Example snapshot · not connected · switching context never touches kubeconfig."), h("h4", {}, "Nodes"), ...d.nodes.map(([name, role, state]) => h("div", { class: "if-record" }, h("b", {}, name), h("span", {}, role), h("code", {}, state))), h("h4", {}, "Namespace / workload / replicas"), ...d.workloads.map(([ns, name, replicas, reason]) => h("details", { class: "if-record" }, h("summary", {}, `${ns} / ${name} · ${replicas}`), hint(reason))), hint(d.note));
  }
  const id = ({ kind: "kind", "amazon-eks": "eks", "google-kubernetes-engine": "gke" })[a.id] || "k3s";
  picker.value = id; view.append(picker, body); render(id); return c;
}
function iac(a) {
  const body = h("div", { class: "if-body" }), rows = h("div", { class: "if-stack" }), status = hint("");
  let tool = IAC[a.id] ? a.id : "terraform", destructiveOnly = false;
  const picker = select("IaC tool", Object.entries(IAC).map(([id, p]) => [id, p.label]), id => { tool = id; render(); }); picker.value = tool;
  const filter = btn("Destructive only", () => { destructiveOnly = !destructiveOnly; filter.setAttribute("aria-pressed", String(destructiveOnly)); render(); }); filter.setAttribute("aria-pressed", "false");
  const command = h("code", { class: "if-command" });
  const c = card(a, "infra-iac", "Review infrastructure changes", body, {});
  function render() {
    const d = IAC[tool], summary = planSummary(d.rows); c.spec.input = { tool, example: d, summary };
    command.textContent = d.command; status.textContent = `${summary.total} example changes · ${summary.destructive} destructive · ${d.scope}`;
    const visible = d.rows.filter(([action]) => !destructiveOnly || ["delete", "replace"].includes(action));
    rows.replaceChildren(...(visible.length ? visible.map(([action, address, detail]) => h("details", { class: "if-record" }, h("summary", {}, `${action.toUpperCase()} / ${address}`), hint(detail))) : [hint("No destructive changes in this example.")]));
  }
  body.append(hint("Authored plan, not command output. No apply, destroy, sync or credentials. Commands below are reference text, never executed."), picker, command, status, filter, rows, hint("A diagram is not deployable IaC. A host adapter must ingest real plans, redact sensitive values and request authoritative approval before any mutation.")); render(); return c;
}
function models(a) {
  let runtime = "llamacpp";
  const body = h("div", { class: "if-body" }), stages = h("div", { class: "if-stages" }), detail = h("div", { class: "if-inspector", "aria-live": "polite" });
  const c = card(a, "infra-models", "Trace training artifacts to a runtime", body, {});
  const picker = select("Inference runtime", [["llamacpp", "llama.cpp / GGUF"], ["ollama", "Ollama / import GGUF"], ["vllm", "vLLM / supported checkpoint"]], id => { runtime = id; render(); });
  function render() {
    const path = ["dataset", "unsloth", "adapter", ...(runtime === "vllm" ? [] : ["gguf"]), runtime];
    c.spec.input = { stages: path, runtime, evidence: "authored-example", deployment: "not-run" };
    stages.replaceChildren(...path.map((id, i) => btn(`${i + 1} / ${SERVICES[id].label}`, () => show(id)))); show(runtime);
  }
  function show(id) {
    const checks = { dataset: "Verify consent, train/eval split, schema and a versioned dataset receipt.", unsloth: "Check architecture support, CUDA/driver compatibility and memory before training. No job has run.", adapter: "Preserve base-model revision, adapter config and license. Merge/export only with compatible tooling.", gguf: "GGUF is a format, not a deployment. Validate tokenizer, quantization, checksum and quality after conversion.", llamacpp: "Load a compatible GGUF; benchmark latency, quality and memory on the target device. No measurements collected.", ollama: "Import a compatible GGUF through a reviewed Modelfile. No model has been imported.", vllm: "Use a supported checkpoint/export path. Do not assume an arbitrary GGUF or LoRA works; support is model- and version-dependent." };
    detail.replaceChildren(h("b", {}, SERVICES[id].label), hint(checks[id]));
    [...stages.children].forEach(b => b.setAttribute("aria-pressed", String(b.textContent.endsWith(`/ ${SERVICES[id].label}`))));
  }
  body.append(hint("Local ML example · no training, conversion or inference has run. z0intelligence owns eligibility; Kerdoios owns placement; these cards grant neither authority."), picker, stages, detail, hint("Related local tools: ComfyUI for image/asset graphs, vLLM Semantic Router for routing, Ollama and llama.cpp for inference. They are distinct components, not interchangeable model formats.")); render(); return c;
}
export const KINDS_INFRA = {
  "infra-architecture": { label: "Service architecture composer", infra: true, make: architecture },
  "infra-cluster": { label: "Kubernetes context & workloads", infra: true, make: cluster },
  "infra-iac": { label: "IaC change review", infra: true, make: iac },
  "infra-models": { label: "Local training & inference", infra: true, make: models }
};
export function buildInfrastructure({ catalog, setSpec, target = document.getElementById("infrastructure") }) {
  if (!target) return;
  const apps = ["google-cloud", "k3s", "terraform", "unsloth"], cards = [];
  const grid = h("div", { class: "if-grid" });
  Object.entries(KINDS_INFRA).forEach(([kind, K], i) => {
    const a = catalog.byId[apps[i]] || { id: apps[i], name: ["Cloud architecture", "K3s", "Terraform", "Unsloth"][i], hex: null };
    const c = K.make(a), receipt = h("div", { class: "if-receipt", hidden: true }, `${K.label} · seen · authored example`);
    const seen = btn("Seen", () => { c.el.hidden = !c.el.hidden; receipt.hidden = !c.el.hidden; seen.textContent = c.el.hidden ? "Reopen" : "Seen"; });
    const cell = h("div", { class: `if-cell${i === 0 || i === 3 ? " if-wide" : ""}`, "data-kind": kind }, h("div", { class: "if-meta" }, h("code", {}, kind), seen), c.el, receipt);
    c.el.addEventListener("click", () => setSpec?.(c.spec)); grid.append(cell); cards.push(c);
  });
  target.append(grid); window.__infra = { cards, KINDS: KINDS_INFRA };
}
