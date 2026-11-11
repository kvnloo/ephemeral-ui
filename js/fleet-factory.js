// fleet-factory: glide's OSS factory pane as an agent-orchestration graph.
// Lineage: zerOS SystemNetworkGraph (columns + layout switcher + bottlenecks) → aodl-views graph (host/chat/subagent/repo,
// delegated/touched edges, tap to focus) → Dash orchestra states (idle|live|needs-you|failing|done). Sample data (fleet-data.js).
import { h, reduced } from "./motion.js";
import { shell, svg } from "./shell.js";


const COLS = ["Brain", "Lanes", "Cards", "Repos"];
const STATE_LABEL = { live: "Live", "needs-you": "Needs you", failing: "Failing", done: "Done", idle: "Idle", queued: "Queued" };
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - t, 3);

function make(a, r, input) {
  const ids = new Set(input.nodes.map(n => n.id));
  const data = { stats: { ...input.stats }, nodes: input.nodes.map(n => ({ ...n, short: n.label })), edges: input.edges.filter(([f, t]) => ids.has(f) && ids.has(t)).map(([from, to, rel, active]) => ({ from, to, rel, active })) };
  const byId = new Map(data.nodes.map(n => [n.id, n]));
  let mode = "spine", focus = null, W = 680, pos = new Map(), raf = 0;

  const emit = (action, label, n) => el.dispatchEvent(new CustomEvent("eui:intent", { bubbles: true, detail: {
    v: 0, kind: "fleet-factory", app: a.id, action, label,
    entities: { node: n.id, ...(action === "open-node" && n.url ? { url: n.url } : {}) }, at: Date.now() } }));
  const st = n => n.state;

  // ---------- header + stats ----------
  const layoutSelect = h("select", { "aria-label": "Factory layout", onchange: e => setMode(e.target.value) }, ...["spine", "radial"].map(m => h("option", { value: m }, m[0].toUpperCase() + m.slice(1))));
  const counts = s => data.nodes.filter(n => st(n) === s).length;
  const tally = h("p", { class: "ff-tally" });
  const renderTally = () => tally.replaceChildren(...[["live", "live"], ["needs-you", "need you"], ["failing", "failing"], ["queued", "queued"]]
    .filter(([s]) => counts(s)).map(([s, t]) => h("span", { class: `ff-t ff-s-${s}` }, h("i", {}), `${counts(s)} ${t}`)));
  const s = data.stats;
  const queueN = h("b", {}, String(s.queue));
  const queueBar = h("i", { style: { width: `${s.depth ? Math.min(100, s.queue / s.depth * 100) : 0}%` } });
  const sendsPct = s.capHour ? Math.min(1, s.sendsHour / s.capHour) : 0;
  const verifyArc = svg("circle", { cx: 14, cy: 14, r: 11, pathLength: 100, class: "ff-arc", "stroke-dasharray": `${s.verifyPass * 100} 100` });
  const stat = (k, big, unit, extra, cls = "") => h("div", { class: `ff-stat ${cls}` }, h("span", { class: "ff-k" }, k), h("div", { class: "ff-v" }, big, unit ? h("small", {}, unit) : null), extra);
  const stats = h("div", { class: "ff-stats" },
    stat("Queue", queueN, `/ ${s.depth}`, h("div", { class: "ff-bar" }, queueBar)),
    stat("Sends / hr", h("b", {}, String(s.sendsHour)), `/ ${s.capHour}`, h("div", { class: "ff-bar ff-cap" }, h("i", { style: { width: `${sendsPct * 100}%` } }), h("em", {}, sendsPct >= 0.85 ? "near cap" : "")), sendsPct >= 0.85 ? "ff-warn" : ""),
    stat("Posted", h("b", {}, String(s.posted)), "today", h("span", { class: "ff-hint" }, "snapshot total")),
    stat("Verify", h("b", {}, String(Math.round(s.verifyPass * 100))), "% pass", svg("svg", { class: "ff-ring", viewBox: "0 0 28 28" }, svg("circle", { cx: 14, cy: 14, r: 11, class: "ff-trk" }), verifyArc)));

  // ---------- graph ----------
  const graph = h("div", { class: "ff-graph" });
  const svgEl = svg("svg", { class: "ff-svg", role: "img", "aria-label": "Factory graph: brain delegates to lanes, lanes run cards, cards touch upstream repos. Tap a node to focus." });
  graph.append(svgEl);
  svgEl.addEventListener("click", e => { if (!e.target.closest("[data-node]")) setFocus(null); });

  const narrow = () => W < 520;
  const font = () => (narrow() ? 10 : 11.5);
  const textOf = n => (narrow() || mode === "radial" ? n.short : n.label);
  const pillW = () => { const colW = (W - 16) / 4; return Math.min(160, colW - (narrow() ? 12 : 24)); };
  const maxRows = () => Math.max(1, ...[0, 1, 2, 3].map(c => data.nodes.filter(n => n.col === c).length));
  const H = () => mode === "spine" ? 38 + maxRows() * (narrow() ? 40 : 46) : Math.max(620, maxRows() * 70);

  function layout(m) {
    const out = new Map();
    if (m === "spine") {
      const colW = (W - 16) / 4, rowH = narrow() ? 40 : 46, top = 30;
      for (let c = 0; c < 4; c++) {
        const col = data.nodes.filter(n => n.col === c);
        const y0 = top + ((maxRows() - col.length) * rowH) / 2 + rowH / 2;
        col.forEach((n, i) => out.set(n.id, { x: 8 + colW * c + colW / 2, y: y0 + i * rowH }));
      }
      return out;
    }
    // Each column owns a ring, including every col-0 node. No id-specific centre.
    const hh = H(), cx = W / 2, cy = hh / 2, rx = W / 2 - 38, ry = hh / 2 - 36;
    for (let c = 0; c < 4; c++) {
      const ring = data.nodes.filter(n => n.col === c), radius = [0.12, 0.4, 0.68, 0.96][c];
      ring.forEach((n, i) => { const ang = -Math.PI / 2 + i / ring.length * Math.PI * 2 + [0, 0.25, 0.2, 0][c]; out.set(n.id, { x: cx + Math.cos(ang) * rx * radius, y: cy + Math.sin(ang) * ry * radius, a: ang }); });
    }
    return out;
  }

  let gEdges, gNodes, colHead;
  function build() {
    const hh = H();
    svgEl.setAttribute("viewBox", `0 0 ${W} ${hh}`); svgEl.style.height = `${hh}px`; svgEl.dataset.mode = mode;
    gEdges = svg("g", { class: "ff-edges" }); gNodes = svg("g", { class: "ff-nodes" }); colHead = svg("g", { class: "ff-cols" });
    if (mode === "spine") {
      const colW = (W - 16) / 4;
      COLS.forEach((c, i) => colHead.append(svg("text", { x: 8 + colW * i + colW / 2, y: 14, "text-anchor": "middle" }, `${c.toUpperCase()} · ${data.nodes.filter(n => n.col === i).length}`)));
    } else {
      const hh2 = H(), rx = W / 2 - 38, ry = hh2 / 2 - 36;
      [0.12, 0.4, 0.68, 0.96].forEach(f => colHead.append(svg("ellipse", { class: "ff-orbit", cx: W / 2, cy: hh2 / 2, rx: rx * f, ry: ry * f })));
    }
    for (const e of data.edges) {
      const base = svg("path", { class: `ff-e ff-r-${e.rel}` }), flow = e.active ? svg("path", { class: "ff-flow" }) : null;
      const g = svg("g", { class: "ff-eg" + (e.active ? " ff-on" : ""), "data-from": e.from, "data-to": e.to }, base, flow);
      e.g = g; e.paths = [base, flow].filter(Boolean); gEdges.append(g);
    }
    const pw = pillW(), f = font();
    for (const n of data.nodes) {
      const g = svg("g", { class: `ff-n ff-s-${st(n)} ff-k-${n.kind}`, "data-node": n.id, tabindex: 0, role: "button", "aria-label": `${n.label}, ${STATE_LABEL[st(n)]}${n.reason ? ": " + n.reason : ""}` });
      g.append(svg("title", {}, n.label));
      const big = n.col === 0;
      if (mode === "spine") {
        const maxCh = Math.floor((pw - 26) / (f * 0.56)), t = textOf(n), label = t.length > maxCh ? t.slice(0, maxCh - 1) + "…" : t;
        g.append(svg("rect", { class: "ff-pill", x: -pw / 2, y: -13, width: pw, height: 26, rx: 13 }));
        if (n.state === "live") g.append(svg("circle", { class: "ff-pulse", cx: -pw / 2 + 13, cy: 0, r: 4 }));
        g.append(dot(n, -pw / 2 + 13, 0, 4.5), svg("text", { class: "ff-lbl", x: -pw / 2 + 24, y: f * 0.36, "font-size": f }, label));
      } else {
        const r = big ? 13 : n.kind === "repo" ? 7 : 8;
        if (n.state === "live") g.append(svg("circle", { class: "ff-pulse", cx: 0, cy: 0, r }));
        const maxCh = narrow() ? 6 : 11, label = n.label.length > maxCh ? n.label.slice(0, maxCh - 1) + "…" : n.label;
        const hitWidth = Math.max(44, label.length * f * .65 + 8);
        g.append(svg("rect", { class: "ff-hit", x: -hitWidth / 2, y: -16, width: hitWidth, height: 50, rx: 8 }), svg("circle", { class: "ff-halo", cx: 0, cy: 0, r: r + 5 }), dot(n, 0, 0, r), svg("text", { class: "ff-lbl", x: 0, y: r + f + 6, "text-anchor": "middle", "font-size": f }, label));
      }

      g.addEventListener("click", ev => { ev.stopPropagation(); setFocus(n.id); });
      g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setFocus(n.id); } });
      n.g = g; gNodes.append(g);
    }
    svgEl.replaceChildren(colHead, gEdges, gNodes);
    applyFocus();
  }
  function dot(n, x, y, r) {
    if (n.kind === "repo") return svg("rect", { class: "ff-dot", x: x - r, y: y - r, width: r * 2, height: r * 2, rx: r * 0.35 });
    if (n.kind === "host") return svg("circle", { class: "ff-dot ff-ringdot", cx: x, cy: y, r });
    return svg("circle", { class: "ff-dot", cx: x, cy: y, r: n.kind === "subagent" && mode === "spine" ? r - 0.8 : r });
  }
  function place(P) {
    const pw = pillW();
    for (const n of data.nodes) { const p = P.get(n.id); n.g.setAttribute("transform", `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`); }
    for (const e of data.edges) {
      const p = P.get(e.from), q = P.get(e.to); let d;
      if (mode === "spine") {
        const x1 = p.x + pw / 2, x2 = q.x - pw / 2, k = (x2 - x1) * 0.5;
        d = Math.abs(p.x - q.x) < 2 ? `M${p.x},${p.y + 13} L${q.x},${q.y - 13}` : `M${x1},${p.y} C${x1 + k},${p.y} ${x2 - k},${q.y} ${x2},${q.y}`;
      } else {
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, cx = W / 2, cy = H() / 2;
        d = `M${p.x},${p.y} Q${lerp(mx, cx, 0.12)},${lerp(my, cy, 0.12)} ${q.x},${q.y}`;
      }
      e.paths.forEach(x => x.setAttribute("d", d));
    }
  }
  function render(animate) {
    const from = pos; build(); const to = layout(mode);
    cancelAnimationFrame(raf);
    if (!animate || reduced.matches || !from.size) { pos = to; place(to); return; }
    const t0 = performance.now(), dur = 640;
    const step = now => {
      const t = ease(Math.min(1, (now - t0) / dur));
      const P = new Map([...to].map(([id, q]) => { const p = from.get(id) || q; return [id, { x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) }]; }));
      place(P); pos = P;
      if (t < 1) raf = requestAnimationFrame(step); else pos = to;
    };
    raf = requestAnimationFrame(step);
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    layoutSelect.querySelectorAll('option').forEach(o => o.toggleAttribute('selected', o.value === m));
    render(false);
  }

  // ---------- focus ----------
  const detail = h("div", { class: "ff-detail", "aria-live": "polite" });
  function lineage(id) {
    const keep = new Set([id]), walk = (cur, dir) => { for (const e of data.edges) { const [a1, b1] = dir ? [e.from, e.to] : [e.to, e.from]; if (a1 === cur && !keep.has(b1)) { keep.add(b1); walk(b1, dir); } } };
    walk(id, true); walk(id, false); return keep;
  }
  function applyFocus() {
    const keep = focus ? lineage(focus) : null;
    svgEl.classList.toggle("ff-focusing", !!focus);
    for (const n of data.nodes) { n.g?.classList.toggle("ff-dim", !!keep && !keep.has(n.id)); n.g?.classList.toggle("ff-sel", n.id === focus); }
    for (const e of data.edges) e.g?.classList.toggle("ff-dim", !!keep && !(keep.has(e.from) && keep.has(e.to)));
  }
  function setFocus(id) {
    focus = id; applyFocus(); renderDetail();
    if (id) emit("open-node", `Open ${byId.get(id).label}`, byId.get(id));
  }
  const actBtn = (n, cls = "") => {
    const reason = n.requested ? "Fix already requested, awaiting glide" : !n.action ? "No fix action supplied" : "";
    return h("button", { type: "button", class: `ff-act ${cls}`, title: reason || n.action, disabled: reason ? true : null, onclick: ev => { ev.stopPropagation(); queue(n); } }, reason || n.action);
  };
  function renderDetail() {
    const n = focus && byId.get(focus);
    detail.classList.toggle("ff-open", !!n);
    if (!n) { detail.replaceChildren(h("p", { class: "ff-hint" }, "Tap a node to trace its lineage · brain → lane → card → repo")); return; }
    const up = data.edges.filter(e => e.to === n.id).map(e => byId.get(e.from).short), down = data.edges.filter(e => e.from === n.id).map(e => `${byId.get(e.to).short}${e.rel !== "delegated" ? ` (${e.rel})` : ""}`);
    detail.replaceChildren(h("div", { class: "ff-row" },
      h("span", { class: `ff-sdot ff-s-${st(n)}` }),
      h("div", { class: "ff-rt" }, h("b", { title: n.label }, h("span", { title: n.label }, n.label)), h("span", { title: n.reason || n.label }, [n.reason || "no blockers", up.length ? `from ${up.join(", ")}` : "", down.length ? `→ ${down.join(", ")}` : ""].filter(Boolean).join(" · "))),
      h("span", { class: `ff-chip ff-s-${st(n)}` }, `${n.kind} · ${STATE_LABEL[st(n)]}`),
      n.action ? actBtn(n) : null));
  }

  // ---------- bottlenecks ----------
  const bottleList = h("ol", { class: "ff-bl" });
  const blCount = h("span", { class: "ff-count" });
  function renderBottlenecks() {
    const items = data.nodes.filter(n => n.state === "needs-you" || n.state === "failing");
    blCount.textContent = `${items.length} open`;
    bottleList.replaceChildren(...items.map((n, i) => h("li", { class: `ff-bi ff-s-${st(n)}` + (focus === n.id ? " ff-cur" : ""), onclick: () => setFocus(n.id) },
      h("span", { class: "ff-num" }, String(i + 1).padStart(2, "0")),
      h("div", { class: "ff-rt" }, h("b", {}, h("span", { class: `ff-sdot ff-s-${st(n)}` }), h("span", { title: n.label }, n.label)), h("span", { title: n.reason || "" }, n.reason)),
      actBtn(n, "ff-act-row"))));
  }
  function queue(n) {
    if (n.requested || !n.action) return;
    n.requested = true;
    emit("queue-fix", n.action, n);
    renderBottlenecks(); renderDetail();
  }

  const legend = h("div", { class: "ff-legend" },
    ...[["delegated", "delegated"], ["touched", "touched"], ["workspace", "workspace"]].map(([r, t]) => h("span", {}, svg("svg", { viewBox: "0 0 22 6", class: "ff-lg" }, svg("path", { d: "M1,3 L21,3", class: `ff-e ff-r-${r}` })), t)),
    ...["live", "needs-you", "failing", "done", "idle"].map(x => h("span", {}, h("i", { class: `ff-sdot ff-s-${x}` }), STATE_LABEL[x])));

  const body = h("div", { class: "fl-root ff-root" },
    h("div", { class: "ff-head" },
      h("div", {}, h("span", { class: "ff-eyebrow" }, "Glide · factory"), h("h3", { class: "ff-title" }, "OSS factory"), tally),
      h("div", { class: "ff-seg", role: "group", "aria-label": "Layout" }, layoutSelect)),
    stats, graph, legend, detail,
    h("section", { class: "ff-bott" }, h("header", {}, h("h4", {}, "Bottlenecks"), blCount), bottleList));

  const el = shell(a, "fleet-factory", { verb: "Agent factory graph", status: "Snapshot", body, summary: `${a.name} · factory: ${s.queue} queued` });
  const spec = { kind: "fleet-factory", app: a.id, actions: "intents", input };

  renderTally(); renderDetail(); renderBottlenecks();
  const measure = () => { const w = Math.round(graph.clientWidth); if (w && Math.abs(w - W) > 4) { W = w; pos = new Map(); render(false); } };
  new ResizeObserver(measure).observe(graph);
  render(false);
  return { el, spec, show: setMode, async play() { measure(); } };
}

export const KINDS_FLEET_FACTORY = { "fleet-factory": { label: "Agent factory graph", make } };
