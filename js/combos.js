// Combos: cross-app work as a live node graph (ComfyUI-style), composed from the user's own prompt and stack.
// Your words light the nodes they asked for; nodes your stack implies are marked "from your stack". Branches run in
// parallel, every wire carries a typed payload you can read in flight, and the receiving node shows what it used it
// for. Checkpoints (human-in-the-loop gates) stop the run until you approve, edit or ask; how many there are depends on
// how you prompted. Emits eui:select / eui:decision on the section so a host can send the selection back to the agent.
import { h, anim, Run, motion } from "./motion.js";
import { burst } from "./shell.js";

// node: [id, app, alts, title, out, now, gate?]   gate: { lvl: 1 (always) | 2 (walk-through only), ask, ev: [], diff: [] }
// edge: [from, to, type, payload, use]            prompt: segments [text, nodeId?] per style
export const COMBOS = [
  { id: "crash", label: "Crash → fix → ship → tell", tag: "On-call",
    prompt: {
      terse: [["checkout's broken", "s"], [". "], ["fix it", "g"], [" and "], ["ship", "v"], ["."]],
      walk: [["checkout's throwing errors", "s"], [" for some users. "], ["Walk me through the fix", "g"], [" before anything "], ["goes live", "v"], [", then "], ["tell the team", "k"], ["."]],
      voice: [["“hey, checkout's crashing again", "s"], [", "], ["handle it", "g"], [" and "], ["ping the team", "k"], ["”"]] },
    nodes: [
      ["s", "sentry", [], "New issue · 412 users", "TypeError · checkout.ts:88", "Started 14 min after deploy 3f2c1a9."],
      ["p", "pagerduty", ["opsgenie"], "Who's on call", "Sam Ortiz · checkout", "Sam is on call and touched checkout.ts today."],
      ["l", "linear", ["jira"], "Filed ENG-482 · Urgent", "ENG-482 · owner Sam", "Linked to the Sentry issue; lands in cycle 31."],
      ["g", "github", ["gitlab"], "Fix PR #219", "1-line null guard + test", "The new test reproduces the Sentry stack exactly.",
        { lvl: 2, ask: "Open PR #219 for review?", ev: ["Failing test written from the Sentry stack", "Fix touches 1 line of checkout.ts", "Sam is requested as reviewer"], diff: ["- const total = cart.items.reduce(sum, 0)", "+ const total = (cart.items ?? []).reduce(sum, 0)"] }],
      ["v", "vercel", ["netlify"], "Promote to production", "p95 182 ms · 0 errors", "Error rate is 0 for 6 minutes.",
        { lvl: 1, ask: "Promote PR #219 to production?", ev: ["New test passes; it failed before the fix", "Preview: 0 errors in 300 checkout runs", "Rollback is one click (deploy 3f2c1a9)"], diff: ["- const total = cart.items.reduce(sum, 0)", "+ const total = (cart.items ?? []).reduce(sum, 0)"] }],
      ["k", "slack", ["discord", "microsoft-teams"], "Post to #incidents", "timeline + root cause", "Resolved in 23 minutes; no customer emails yet."]],
    edges: [
      ["s", "l", "issue", "412 users · checkout.ts:88", "ticket title + impact"],
      ["p", "l", "person", "Sam Ortiz (on call)", "assignee"],
      ["s", "g", "trace", "stack @ checkout.ts:88", "becomes the failing test"],
      ["l", "g", "ticket", "ENG-482", "PR title + link"],
      ["g", "v", "pr", "PR #219 · checks green", "what to promote"],
      ["l", "k", "ticket", "ENG-482 timeline", "the incident thread"],
      ["v", "k", "metric", "p95 182 ms · 0 errors", "proof it's fixed"]] },
  { id: "deal", label: "Stalled deal → shipped feature", tag: "Sales × Eng",
    prompt: {
      terse: [["unstick the Acme deal", "hs"], ["."]],
      walk: [["Acme's deal is stuck", "hs"], [". Show me "], ["why", "ga"], [" and "], ["what we'd send", "gm"], [" before anything goes out."]],
      voice: [["“what's blocking Acme?", "hs"], [" "], ["get them unstuck", "gh"], ["”"]] },
    nodes: [
      ["hs", "hubspot", ["salesforce"], "Deal stalled · Acme $48k", "blocker: SSO", "Acme's champion asked for SSO twice in 9 days."],
      ["ga", "google-ads", [], "Checked search terms", "‘SAML login’ CTR 4.1%", "SSO is your best-converting keyword this month."],
      ["gh", "github", ["gitlab"], "PR #212 · SAML SSO", "preview + checks green", "One review left (Priya).",
        { lvl: 2, ask: "Request Priya's review on PR #212?", ev: ["Checks green on the preview", "Covers Okta + Azure AD", "Priya owns auth/"], diff: ["+ auth/saml.ts  (new, 140 lines)", "+ settings/sso.tsx  (IdP field)"] }],
      ["mz", "maze", [], "Unmoderated test", "5 of 6 done in < 40 s", "One tester missed the IdP field; the copy is fixed."],
      ["gm", "gmail", ["outlook"], "Follow-up to Dana", "40 s video + PR link", "Dana opened your last email 3 minutes ago.",
        { lvl: 1, ask: "Send the follow-up to Dana at Acme?", ev: ["Preview link works signed-out", "Maze: 5 of 6 finished SSO setup", "Tone matches your last 3 emails to Acme"], diff: ["Subject: SSO is live in preview", "Hi Dana, here's a 40 s walkthrough and the link…"] }]],
    edges: [
      ["hs", "gh", "spec", "SSO (SAML) · Acme", "the feature to build"],
      ["gh", "mz", "url", "preview URL", "what testers open"],
      ["hs", "gm", "person", "Dana · champion", "recipient"],
      ["ga", "gm", "metric", "‘SAML login’ CTR 4.1%", "why it matters, one line"],
      ["mz", "gm", "clip", "40 s clip", "attachment"],
      ["gh", "gm", "pr", "PR #212", "proof link"]] },
  { id: "design", label: "Design → build → preview → sign-off", tag: "Product",
    prompt: {
      terse: [["build Checkout v3", "fg"], [" and "], ["get sign-off", "fi"], ["."]],
      walk: [["Turn Checkout v3", "fg"], [" into code. "], ["Show me the states", "gh"], [" before "], ["it goes to reviewers", "fi"], ["."]],
      voice: [["“ship the new checkout design", "fg"], [", "], ["send it round for sign-off", "fi"], ["”"]] },
    nodes: [
      ["fg", "figma", ["penpot"], "Frame ‘Checkout v3’", "tokens + 4 states", "The error state has no design yet."],
      ["gh", "github", ["gitlab"], "Checkout.tsx · stories", "5 states incl. error", "Drew the missing error state from your tokens.",
        { lvl: 2, ask: "Use the generated error state?", ev: ["Built only from your tokens", "Contrast AA on both themes", "Story added for review"], diff: ["+ <ErrorState tone=\"danger\" retry />", "+ stories/Checkout.error.tsx"] }],
      ["vc", "vercel", ["netlify"], "Preview ready", "Lighthouse 98 · CLS 0", "checkout-v3 passes at 390 px."],
      ["lm", "loom", [], "40 s walkthrough", "before / after", "Reviewers watch these 3× more than they read diffs."],
      ["fi", "frame-io", [], "Sign-off", "3 reviewers", "Mina approved; legal is reviewing the copy.",
        { lvl: 1, ask: "Send Checkout v3 to 3 reviewers?", ev: ["Preview link + Figma frame attached", "Walkthrough is 40 s", "Legal tagged for the copy"], diff: ["To: Mina, Theo, Legal", "Due: Thu 5 pm"] }]],
    edges: [
      ["fg", "gh", "tokens", "tokens + 4 frames", "component props"],
      ["fg", "fi", "frame", "Figma frame", "the reference"],
      ["gh", "vc", "build", "Checkout.tsx", "what to deploy"],
      ["vc", "lm", "url", "preview URL", "what to record"],
      ["vc", "fi", "url", "preview URL", "link to try it"],
      ["lm", "fi", "clip", "40 s walkthrough", "watch first"]] },
  { id: "robot", label: "Photo → 3D → USD → robot sim", tag: "3D × Robotics",
    prompt: {
      terse: [["mug photo", "tr"], [" → "], ["robot grasp", "is"], ["."]],
      walk: [["Make this mug", "tr"], [" something "], ["a robot can learn to grab", "is"], [". Log what you find", "nt"], ["."]],
      voice: [["“teach the arm to pick up my mug", "is"], ["”"]] },
    nodes: [
      ["tr", "trellis", [], "Image → 3D", "mug.glb · 18k tris", "Watertight mesh; handle is 6 mm thick."],
      ["bl", "blender", [], "Cleaned + scaled", "9.5 cm · origin at base", "Origin moved to the base so it rests on tables."],
      ["us", "openusd", [], "Wrapped as USD", "mug.usd + physics", "Collision is 8 convex hulls."],
      ["is", "isaac-sim", [], "Grasp training", "16 envs · 94% success", "Fails only when the handle faces away.",
        { lvl: 1, ask: "Start a 2 h run on 16 envs?", ev: ["Asset passes the physics check", "Same reward as last week's cup run", "GPU is free until 6 pm"], diff: ["envs: 16 · steps: 2M", "curriculum: + handle-away pose"] }],
      ["nt", "notion", ["obsidian"], "Experiment log", "run card + failure pose", "Logged the handle-away pose for the next curriculum."]],
    edges: [
      ["tr", "bl", "mesh", "mug.glb", "what to clean"],
      ["bl", "us", "mesh", "9.5 cm mesh", "the USD payload"],
      ["tr", "nt", "image", "photo + preview", "log header"],
      ["us", "is", "asset", "mug.usd", "the object to grasp"],
      ["is", "nt", "metric", "94% · failure pose", "what to try next"]] },
];

const STYLES = [
  ["terse", "Terse"], ["walk", "Walk me through"], ["voice", "Voice"]];
const TUNE = {
  terse: (g) => `Short prompt → ${g} checkpoint${g === 1 ? "" : "s"}, one line per node.`,
  walk: (g) => `You asked to be walked through → ${g} checkpoints, reasons shown on every wire.`,
  voice: (g) => `Spoken → summaries read aloud, ${g} checkpoint you can answer by voice.`,
};
const TYPE_HUE = { issue: 350, trace: 20, person: 280, ticket: 235, pr: 150, metric: 190, spec: 40, url: 205, clip: 320, tokens: 300, frame: 15, build: 130, mesh: 30, image: 55, asset: 95 };
const hue = (t) => TYPE_HUE[t] ?? 220;

function css() {
  if (document.querySelector("link[data-flow-css]")) return;
  document.head.append(h("link", { rel: "stylesheet", href: new URL("../flow.css", import.meta.url).href, "data-flow-css": "" }));
}

/** Longest-path layering → positions in a logical stage (wide: columns; narrow: rows). */
function layout(c, V) {
  const L = {}, ids = c.nodes.map((n) => n[0]);
  const preds = (id) => c.edges.filter((e) => e[1] === id).map((e) => e[0]);
  const depth = (id) => (L[id] ??= Math.max(-1, ...preds(id).map(depth)) + 1);
  ids.forEach(depth);
  const layers = [];
  ids.forEach((id) => (layers[L[id]] ||= []).push(id));
  const NW = V ? 156 : 160, NH = V ? 92 : 104, GAP = 66;
  const W = V ? 360 : 48 + NW + (layers.length - 1) * (NW + GAP), H = V ? layers.length * 150 + 20 : 340;
  const pos = {};
  layers.forEach((ly, i) => ly.forEach((id, j) => {
    const span = V ? W : H, n = ly.length, gap = span / n;
    const along = gap * (j + 0.5);
    if (V) pos[id] = { x: along - NW / 2, y: 20 + i * 150 };
    else pos[id] = { x: 24 + i * (NW + GAP), y: along - NH / 2 + (n === 1 && i % 2 ? 26 : 0) };
  }));
  return { pos, W, H, NW, NH, V, depth: L };
}

export function buildCombos({ catalog, icon, openDrawer }) {
  const root = document.getElementById("combos");
  if (!root) return;
  css();
  const app = (id) => catalog.byId[id] || { id, name: id, hex: null };
  const tabs = root.querySelector(".cb-tabs"), main = root.querySelector(".cb-main");
  main.classList.add("fl");
  const promptEl = h("div", { class: "fl-prompt" }), styleSeg = h("div", { class: "fl-style", role: "group", "aria-label": "How you prompted" });
  const stackEl = h("div", { class: "fl-stack" }), tuneEl = h("span", { class: "fl-tune" });
  const stage = h("div", { class: "fl-stage" }), wrap = h("div", { class: "fl-canvas" }, stage);
  const insp = h("aside", { class: "fl-insp", "aria-live": "polite" });
  const ledger = h("div", { class: "fl-ledger" });
  const runBtn = h("button", { type: "button", class: "eu-btn primary sm fl-run" }, "▶ Run");
  const resetBtn = h("button", { type: "button", class: "eu-btn ghost sm", title: "Reset" }, "↻");
  main.replaceChildren(
    h("div", { class: "fl-top" }, h("span", { class: "fl-you" }, "You"), promptEl, styleSeg),
    h("div", { class: "fl-mid" }, wrap, insp),
    h("div", { class: "fl-bar" }, stackEl, h("span", { class: "grow" }), tuneEl, runBtn, resetBtn),
    ledger);

  let cur = 0, style = "terse", lay = null, run = null, touched = false, sel = null;
  let swaps = {}, state = {}, facts = [], decisions = 0, waiters = {};
  const C = () => COMBOS[cur];
  const gated = (n) => n[6] && (n[6].lvl === 1 || style === "walk");
  const nodeOf = (id) => C().nodes.find((n) => n[0] === id);
  const appOf = (n) => app(swaps[n[0]] || n[1]);
  const emit = (type, detail) => root.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));

  tabs.replaceChildren(...COMBOS.map((c, i) => h("button", { type: "button", class: "cb-tab", "aria-pressed": i === 0 ? "true" : "false", onclick: () => { touched = true; load(i); } },
    h("span", { class: "cb-icos" }, c.nodes.slice(0, 5).map((n) => icon(app(n[1]), 16))), h("b", {}, c.label), h("em", {}, `${c.tag} · ${c.nodes.length} apps · ${c.edges.length} handoffs`))));
  styleSeg.replaceChildren(...STYLES.map(([k, label]) => h("button", { type: "button", "data-style": k, "aria-pressed": k === style ? "true" : "false", onclick: () => { touched = true; setStyle(k); } }, label)));

  function setStyle(k) {
    style = k;
    styleSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.style === k ? "true" : "false"));
    root.dataset.style = k;
    compose(true);
  }

  function drawPrompt() {
    const segs = C().prompt[style];
    promptEl.replaceChildren(...(style === "voice" ? [h("span", { class: "fl-wave", "aria-hidden": "true" }, ...Array.from({ length: 9 }, (_, i) => h("i", { style: { "--i": i } })))] : []),
      ...segs.map(([t, id]) => id ? h("mark", { "data-node": id, onpointerenter: () => hl(id, true), onpointerleave: () => hl(id, false), onclick: () => select(id) }, t) : t));
  }
  function hl(id, on) {
    stage.querySelector(`.fl-node[data-id="${id}"]`)?.classList.toggle("hl", on);
    promptEl.querySelectorAll(`mark[data-node="${id}"]`).forEach((m) => m.classList.toggle("hl", on));
  }
  function drawStack() {
    stackEl.replaceChildren(h("span", { class: "kicker" }, "Your stack"), ...C().nodes.map((n) => {
      const a = appOf(n), alts = [n[1], ...n[2]].filter((x) => catalog.byId[x]);
      return h("button", { type: "button", class: "fl-chip", "data-node": n[0], disabled: alts.length < 2 ? "" : null, title: alts.length > 1 ? `Swap: ${alts.map((x) => app(x).name).join(" / ")}` : a.name,
        onclick: () => { touched = true; const i = alts.indexOf(swaps[n[0]] || n[1]); swaps[n[0]] = alts[(i + 1) % alts.length]; compose(false); select(n[0]); } },
        icon(a, 16), a.name, alts.length > 1 ? h("i", {}, "⇄") : null);
    }));
  }

  // ---------- stage: nodes, wires, sockets ----------
  const svgNS = "http://www.w3.org/2000/svg";
  const S = (tag, attrs = {}) => { const e = document.createElementNS(svgNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  function port(id, out) {
    const p = lay.pos[id], { NW, NH, V } = lay;
    if (V) return out ? { x: p.x + NW / 2, y: p.y + NH } : { x: p.x + NW / 2, y: p.y };
    return out ? { x: p.x + NW, y: p.y + 40 } : { x: p.x, y: p.y + 40 };
  }
  function wirePath(e) {
    const a = port(e[0], true), b = port(e[1], false);
    if (lay.V) { const d = Math.max(40, (b.y - a.y) / 2); return `M${a.x} ${a.y} C ${a.x} ${a.y + d}, ${b.x} ${b.y - d}, ${b.x} ${b.y}`; }
    const d = Math.max(50, (b.x - a.x) / 2);
    return `M${a.x} ${a.y} C ${a.x + d} ${a.y}, ${b.x - d} ${b.y}, ${b.x} ${b.y}`;
  }
  function fit() {
    if (!lay) return;
    const s = Math.min(1, wrap.clientWidth / lay.W);
    stage.style.transform = `scale(${s})`;
    wrap.style.height = `${lay.H * s}px`;
  }
  function compose(animate) {
    run?.stop(); run = null;
    Object.values(waiters).forEach((w) => w.cancel?.());
    waiters = {}; state = {}; facts = []; decisions = 0; sel = null;
    const c = C(), V = wrap.clientWidth < 600;
    lay = layout(c, V);
    root.classList.toggle("fl-v", V);
    stage.style.width = `${lay.W}px`; stage.style.height = `${lay.H}px`;
    const wires = S("svg", { class: "fl-wires", viewBox: `0 0 ${lay.W} ${lay.H}`, width: lay.W, height: lay.H });
    const fromPrompt = new Set(c.prompt[style].filter((s) => s[1]).map((s) => s[1]));
    const nodes = c.nodes.map((n) => {
      const a = appOf(n), p = lay.pos[n[0]];
      const el = h("div", { class: "fl-node", "data-id": n[0], tabindex: "0", role: "button", style: { left: `${p.x}px`, top: `${p.y}px`, width: `${lay.NW}px`, height: `${lay.NH}px`, "--a": a.hex || "var(--h-mutedFg)" },
        onclick: () => { touched = true; select(n[0]); }, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(n[0]); } },
        onpointerenter: () => hl(n[0], true), onpointerleave: () => hl(n[0], false) },
        h("div", { class: "fl-nh" }, icon(a, 20), h("b", {}, a.name), h("span", { class: "fl-dot" })),
        h("div", { class: "fl-nt" }, n[3]),
        h("div", { class: "fl-no" }, n[4]),
        h("div", { class: "fl-src" + (fromPrompt.has(n[0]) ? " p" : "") }, fromPrompt.has(n[0]) ? "from your prompt" : "from your stack"),
        gated(n) ? h("span", { class: "fl-gate-b", title: "Checkpoint: waits for you" }, "◆") : null,
        h("span", { class: "fl-sock in" }), h("span", { class: "fl-sock out" }));
      drag(el, n[0]);
      return el;
    });
    for (const e of c.edges) {
      const g = S("g", { class: "fl-w", "data-e": `${e[0]}>${e[1]}`, style: `--t:${hue(e[2])}` });
      const d = wirePath(e);
      g.append(S("path", { d, class: "fl-wb" }), S("path", { d, class: "fl-wf" }));
      wires.append(g);
    }
    const labels = c.edges.map((e) => h("button", { type: "button", class: "fl-lab", "data-e": `${e[0]}>${e[1]}`, style: { "--t": hue(e[2]) }, onclick: () => { touched = true; select(e[1], e); } }, e[2]));
    stage.replaceChildren(wires, ...labels, ...nodes);
    placeLabels();
    fit();
    drawPrompt(); drawStack();
    const g = c.nodes.filter(gated).length;
    tuneEl.textContent = TUNE[style](g);
    runBtn.disabled = false; runBtn.textContent = "▶ Run";
    drawLedger();
    showIdle();
    if (animate) {
      // nodes the prompt named arrive first, then what the stack implies
      const order = [...nodes].sort((x, y) => (fromPrompt.has(y.dataset.id) - fromPrompt.has(x.dataset.id)) || (lay.depth[x.dataset.id] - lay.depth[y.dataset.id]));
      order.forEach((el, k) => anim(el, [{ opacity: 0, transform: "translateY(10px) scale(.92)" }, { opacity: 1, transform: "none" }], { spring: "soft", delay: 60 + k * 70 }));
      wires.querySelectorAll(".fl-wb").forEach((p, k) => { const L = p.getTotalLength?.() || 300; anim(p, [{ strokeDasharray: `${L}`, strokeDashoffset: `${L}` }, { strokeDasharray: `${L}`, strokeDashoffset: "0" }], { duration: 520, delay: 300 + k * 60, easing: "cubic-bezier(.16,1,.3,1)" }); });
    }
  }
  function placeLabels() {
    for (const lab of stage.querySelectorAll(".fl-lab")) {
      const [a, b] = lab.dataset.e.split(">");
      const p = stage.querySelector(`.fl-w[data-e="${a}>${b}"] .fl-wb`);
      const L = p.getTotalLength?.() || 0, m = L ? p.getPointAtLength(L * 0.5) : { x: 0, y: 0 };
      lab.style.left = `${m.x}px`; lab.style.top = `${m.y}px`;
    }
  }
  function drag(el, id) {
    let st = null;
    el.addEventListener("pointerdown", (e) => { if (e.button) return; st = { x: e.clientX, y: e.clientY, p: { ...lay.pos[id] }, moved: false }; });
    el.addEventListener("pointermove", (e) => {
      if (!st) return;
      const s = Math.min(1, wrap.clientWidth / lay.W), dx = (e.clientX - st.x) / s, dy = (e.clientY - st.y) / s;
      if (!st.moved && Math.hypot(dx, dy) < 6) return;
      if (!st.moved) { st.moved = true; el.setPointerCapture(e.pointerId); el.classList.add("lift"); touched = true; }
      lay.pos[id] = { x: Math.max(0, Math.min(lay.W - lay.NW, st.p.x + dx)), y: Math.max(0, Math.min(lay.H - lay.NH, st.p.y + dy)) };
      el.style.left = `${lay.pos[id].x}px`; el.style.top = `${lay.pos[id].y}px`;
      for (const e2 of C().edges) if (e2[0] === id || e2[1] === id) stage.querySelectorAll(`.fl-w[data-e="${e2[0]}>${e2[1]}"] path`).forEach((p) => p.setAttribute("d", wirePath(e2)));
      placeLabels();
    });
    const up = (e) => { if (!st) return; if (st.moved) { el.classList.remove("lift"); el.addEventListener("click", (c) => c.stopImmediatePropagation(), { once: true, capture: true }); } st = null; };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  }

  // ---------- inspector ----------
  function showIdle() {
    const c = C();
    insp.className = "fl-insp idle";
    insp.replaceChildren(h("span", { class: "kicker" }, "Composed for you"),
      h("b", { class: "fl-ih" }, `${c.nodes.length} apps · ${c.edges.length} handoffs · ${c.nodes.filter(gated).length} checkpoint${c.nodes.filter(gated).length === 1 ? "" : "s"}`),
      h("p", { class: "fl-ip" }, "Highlighted words in your prompt became nodes; the rest come from the apps you already use. Click a node or a wire to see what it carries. Drag nodes to rearrange."),
      h("div", { class: "fl-legend" }, ...[...new Set(c.edges.map((e) => e[2]))].map((t) => h("span", { style: { "--t": hue(t) } }, t))));
  }
  function select(id, edge) {
    const n = nodeOf(id); if (!n) return;
    sel = id;
    stage.querySelectorAll(".fl-node").forEach((el) => el.classList.toggle("sel", el.dataset.id === id));
    stage.querySelectorAll(".fl-w, .fl-lab").forEach((el) => el.classList.toggle("sel", !!edge && el.dataset.e === `${edge[0]}>${edge[1]}`));
    emit("eui:select", { combo: C().id, label: n[3], ids: [`node:${id}`, ...(edge ? [`edge:${edge[0]}>${edge[1]}`] : [])], entities: { node: id, app: appOf(n).id, edge: edge ? `${edge[0]}>${edge[1]}` : null }, style });
    if (state[id] === "wait") return showGate(n);
    showNode(n, edge);
  }
  function showNode(n, edge) {
    const a = appOf(n), c = C();
    const ins = c.edges.filter((e) => e[1] === n[0]), outs = c.edges.filter((e) => e[0] === n[0]);
    const st = state[n[0]] || "idle";
    const row = (e, dir) => {
      const other = appOf(nodeOf(dir === "in" ? e[0] : e[1]));
      return h("li", { class: "fl-io" + (edge && e === edge ? " sel" : "") + (dir === "in" && state[e[0]] === "done" ? " got" : ""), style: { "--t": hue(e[2]) } },
        icon(other, 16), h("span", { class: "fl-io-t" }, e[2]), h("code", {}, e[3]), h("em", {}, dir === "in" ? `→ ${e[4]}` : `to ${other.name}`));
    };
    insp.className = `fl-insp st-${st}`;
    insp.replaceChildren(
      h("div", { class: "fl-ihd" }, icon(a, 24), h("div", {}, h("b", {}, a.name), h("span", {}, n[3])), h("span", { class: "fl-pill " + st }, { idle: "queued", run: "running", done: "done", wait: "needs you" }[st])),
      ins.length ? h("div", { class: "fl-sec" }, h("span", { class: "kicker" }, "Receives"), h("ul", {}, ins.map((e) => row(e, "in")))) : h("div", { class: "fl-sec" }, h("span", { class: "kicker" }, "Starts here"), h("p", { class: "fl-ip" }, "First signal in the chain.")),
      h("div", { class: "fl-sec fl-nowbox" }, h("span", { class: "kicker" }, st === "done" ? "Learned" : "Will tell you"), h("b", {}, n[5])),
      ...(outs.length ? [h("div", { class: "fl-sec" }, h("span", { class: "kicker" }, "Hands off"), h("ul", {}, outs.map((e) => row(e, "out"))))] : []),
      h("div", { class: "fl-acts" }, h("button", { type: "button", class: "eu-btn ghost sm", onclick: () => openDrawer(a.id) }, `${a.name} cards`), h("button", { type: "button", class: "eu-btn ghost sm", onclick: () => { emit("eui:pin", { combo: C().id, ids: [`node:${n[0]}`], label: n[5] }); burst(insp.querySelector(".eu-ico"), "var(--h-primary)", 8); } }, "Pin to chat")));
  }
  function showGate(n) {
    const a = appOf(n), g = n[6];
    insp.className = "fl-insp gate";
    const note = h("textarea", { class: "fl-note", rows: 2, placeholder: "Change something before it runs…", hidden: "" });
    const said = C().prompt[style].find((s) => s[1] === n[0])?.[0].replace(/[“”]/g, "");
    const why = h("p", { class: "fl-why", hidden: "" }, g.lvl === 1
      ? `This step reaches people outside the agent, so it always waits for you${said ? ` (you said “${said}”)` : ""}. Branches that don't depend on it keep running.`
      : `You asked to be walked through, so this step waits for you too. Prompt tersely and it runs on its own.`);
    const decide = (kind) => { const w = waiters[n[0]]; if (!w) return; decisions++; emit("eui:decision", { combo: C().id, ids: [`node:${n[0]}`], decision: kind, note: note.value || null }); w.ok(kind); };
    insp.replaceChildren(
      h("div", { class: "fl-ihd" }, icon(a, 24), h("div", {}, h("b", {}, "Checkpoint"), h("span", {}, a.name)), h("span", { class: "fl-pill wait" }, "needs you")),
      h("b", { class: "fl-ask" }, g.ask),
      h("ul", { class: "fl-ev" }, g.ev.map((x) => h("li", {}, x))),
      h("pre", { class: "fl-diff" }, g.diff.map((x) => h("span", { class: x[0] === "-" ? "del" : x[0] === "+" ? "add" : "" }, x))),
      note, why,
      h("div", { class: "fl-acts" },
        h("button", { type: "button", class: "eu-btn primary sm fl-approve", onclick: () => decide(note.hidden || !note.value ? "approve" : "approve-with-edit") }, style === "voice" ? "Approve · or say “yes”" : "Approve"),
        h("button", { type: "button", class: "eu-btn ghost sm", onclick: () => { note.hidden = !note.hidden; if (!note.hidden) note.focus(); } }, "Edit"),
        h("button", { type: "button", class: "eu-btn ghost sm", onclick: () => { why.hidden = !why.hidden; } }, "Why ask?")));
    anim(insp, [{ transform: "translateY(6px)", opacity: 0.4 }, { transform: "none", opacity: 1 }], { spring: "soft" });
  }

  // ---------- run: branches in parallel, packets on wires, gates wait ----------
  function setState(id, st) {
    state[id] = st;
    const el = stage.querySelector(`.fl-node[data-id="${id}"]`);
    el?.setAttribute("data-st", st);
  }
  function drawLedger() {
    const c = C();
    ledger.replaceChildren(
      h("span", { class: "kicker" }, "Carried"),
      h("div", { class: "fl-facts" }, ...(facts.length ? facts.map((f) => h("span", { class: "fl-fact", style: { "--t": hue(f.t) } }, icon(appOf(nodeOf(f.from)), 14), f.text)) : [h("span", { class: "fl-empty" }, "Nothing yet. Run it and every handoff lands here.")])),
      h("span", { class: "fl-count" }, h("b", {}, facts.length), ` of ${c.edges.length} handoffs · `, h("b", {}, decisions), decisions === 1 ? " decision · " : " decisions · ", h("b", {}, 0), " copy-pastes"));
  }
  async function packet(e, r, k = 0) {
    if (k) await r.wait(220 * k);
    const p = stage.querySelector(`.fl-w[data-e="${e[0]}>${e[1]}"]`);
    p.classList.add("live");
    const pk = h("span", { class: "fl-pkt", style: { "--t": hue(e[2]), offsetPath: `path("${wirePath(e)}")` } }, h("i", {}, e[2]), e[3]);
    stage.append(pk);
    try { await anim(pk, [{ offsetDistance: "0%", opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.88 }, { offsetDistance: "100%", opacity: 0 }], { duration: 1150, easing: "cubic-bezier(.45,0,.25,1)" }).finished; }
    finally { pk.remove(); }
    r.check();
    p.classList.remove("live"); p.classList.add("done");
    stage.querySelector(`.fl-lab[data-e="${e[0]}>${e[1]}"]`)?.classList.add("done");
    // arrival: the receiving socket shows what this payload became
    const tgt = stage.querySelector(`.fl-node[data-id="${e[1]}"]`);
    const lens = h("span", { class: "fl-lens", style: { "--t": hue(e[2]), "--k": tgt.querySelectorAll(".fl-lens").length } }, h("code", {}, e[3]), h("em", {}, `→ ${e[4]}`));
    tgt.append(lens);
    anim(lens, [{ opacity: 0, transform: "translate(-50%, 6px) scale(.9)" }, { opacity: 1, transform: "translate(-50%, 0)", offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0, transform: "translate(-50%, -6px)" }], { duration: 2300 }).onfinish = () => lens.remove();
    burst(tgt.querySelector(".fl-sock.in"), `hsl(${hue(e[2])} 80% 60%)`, 8);
    facts.push({ t: e[2], text: e[3], from: e[0] });
    drawLedger();
    if (sel === e[1] && state[e[1]] !== "wait") showNode(nodeOf(e[1]));
  }
  function gate(n) {
    return new Promise((ok, no) => {
      waiters[n[0]] = { ok: (k) => { delete waiters[n[0]]; ok(k); }, cancel: () => no(Run.CANCEL) };
      setState(n[0], "wait");
      select(n[0]);
      runBtn.textContent = "Waiting on you…";
    });
  }
  async function runNode(n, r) {
    if (gated(n)) { await gate(n); r.check(); }
    setState(n[0], "run");
    runBtn.textContent = "Running…";
    const el = stage.querySelector(`.fl-node[data-id="${n[0]}"]`);
    const now = h("div", { class: "fl-now", title: n[5] }, n[5]);
    el.querySelector(".fl-src").replaceWith(now);
    anim(now, [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
    if (!sel || state[sel] === "done" || sel === n[0]) select(n[0]);
    await r.wait(1250);
    setState(n[0], "done");
    if (sel === n[0]) showNode(n);
    await Promise.all(C().edges.filter((e) => e[0] === n[0]).map((e, k) => packet(e, r, k)));
  }
  async function play() {
    if (run) return;
    if (Object.keys(state).length) compose(false);
    const r = (run = new Run()), c = C();
    root.classList.add("fl-running"); runBtn.disabled = false;
    const started = new Set(), done = new Set();
    try {
      await new Promise((res, rej) => {
        const tick = () => {
          if (r.dead) return rej(Run.CANCEL);
          if (done.size === c.nodes.length) return res();
          for (const n of c.nodes) {
            if (started.has(n[0])) continue;
            const preds = c.edges.filter((e) => e[1] === n[0]);
            if (preds.every((e) => done.has(e[0]) && facts.some((f) => f.from === e[0] && f.text === e[3]))) {
              started.add(n[0]);
              runNode(n, r).then(() => { done.add(n[0]); tick(); }, rej);
            }
          }
        };
        tick();
      });
      runBtn.textContent = "↻ Run again";
      insp.className = "fl-insp done";
      insp.replaceChildren(h("span", { class: "kicker" }, "Done"), h("b", { class: "fl-ih" }, `${facts.length} handoffs, ${decisions} decision${decisions === 1 ? "" : "s"} from you, 0 copy-pastes.`),
        h("p", { class: "fl-ip" }, "Each app saw only what it needed; you saw one thing at a time and stepped in where it mattered."),
        h("div", { class: "fl-acts" }, h("button", { type: "button", class: "eu-btn primary sm", onclick: () => { touched = true; load((cur + 1) % COMBOS.length); } }, "Next flow →"), h("button", { type: "button", class: "eu-btn ghost sm", onclick: () => setStyle(style === "walk" ? "terse" : "walk") }, style === "walk" ? "Try it terse" : "Walk me through instead")));
    } catch (e) { if (e !== Run.CANCEL) throw e; }
    finally { if (run === r) run = null; root.classList.remove("fl-running"); }
  }
  function load(i) {
    cur = i; swaps = {};
    tabs.querySelectorAll(".cb-tab").forEach((b, j) => b.setAttribute("aria-pressed", j === i ? "true" : "false"));
    root.dataset.combo = COMBOS[i].id;
    compose(true);
  }
  runBtn.onclick = () => { touched = true; if (!run) play(); };
  resetBtn.onclick = () => { touched = true; compose(true); };
  root.dataset.style = style;
  // row ↔ column re-layout only when the width has really settled on the other side (phone rotation, window resize):
  // a capture tool briefly resizing the viewport must not wipe a run the person is looking at
  let relay = 0;
  new ResizeObserver(() => { fit(); clearTimeout(relay); relay = setTimeout(() => { if (lay && (wrap.clientWidth < 600) !== lay.V && !run) compose(false); }, 400); }).observe(wrap);
  // nobody touched it: run once so the section never sits idle (it still stops at the checkpoint for a person)
  new IntersectionObserver(([en], io) => { if (!en.isIntersecting) return; io.disconnect(); setTimeout(() => { if (!touched && !run) play(); }, 2500 / motion.speed); }, { threshold: 0.35 }).observe(wrap);
  root.flow = { load, setStyle, play, select, approve: () => Object.values(waiters)[0]?.ok("approve") };
  requestAnimationFrame(() => load(0));
}
