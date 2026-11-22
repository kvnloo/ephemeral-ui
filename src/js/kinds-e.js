// Card kinds, part E: agent-native compute. A computer-use screen (Cua, scrcpy virtual displays) and
// sandbox VMs that fork (boat). The agent works on its own display; you watch, take over, or hand back.
import { h, anim, stagger, typeText, Run } from "./motion.js";
import { shell, burst, holdButton } from "./shell.js";
import { act, tell, why, undoable, settle } from "./loop.js";
import { appSurface, appBar } from "./chrome.js";

const STEPS = {
  phone: [["open", "Settings", 50, 12], ["tap", "Display", 50, 38], ["tap", "Dark mode", 70, 52], ["swipe", "back", 20, 50], ["tap", "T3 Code", 50, 70], ["type", "“run the mobile check”", 50, 86]],
  desk: [["click", "Terminal", 12, 92], ["type", "npm test", 40, 40], ["click", "Chrome", 22, 92], ["click", "localhost:5173", 50, 12], ["drag", "card → column", 62, 55], ["click", "Screenshot ✓", 84, 20]],
};
function screenMake(a, r) {
  const phone = /scrcpy|android|s22|s25|phone/i.test(a.name + a.id);
  const steps = STEPS[phone ? "phone" : "desk"];
  const disp = h("div", { class: "cu-disp" + (phone ? " phone" : "") });
  const rows = phone ? ["Settings", "Network", "Display", "Dark mode", "Battery", "T3 Code", "Apps"] : null;
  if (phone) disp.append(h("div", { class: "cu-status" }, h("span", {}, "9:41"), h("span", {}, "▮▮▮ 82%")), h("ul", { class: "cu-list" }, rows.map((t) => h("li", {}, h("i"), t, t === "Dark mode" ? h("span", { class: "cu-sw" }) : null))));
  else disp.append(h("div", { class: "cu-win" }, h("div", { class: "cu-wb" }, h("i"), h("i"), h("i"), h("span", {}, "localhost:5173")), h("div", { class: "cu-kb" }, ["Todo", "Doing", "Done"].map((c, i) => h("div", {}, h("b", {}, c), h("span", { class: "cu-k" + (i === 1 ? " mv" : "") }), h("span", { class: "cu-k" }))))), h("div", { class: "cu-term" }, h("span", {}, "$ "), h("span", { class: "cu-cmd" }, "")), h("div", { class: "cu-dock" }, ["▢", "⌘", "◎", "✉"].map((x) => h("i", {}, x))));
  const cur = h("div", { class: "cu-cur" }, h("i"), h("span", {}, "agent"));
  const ripple = h("i", { class: "cu-rip" });
  disp.append(cur, ripple);
  const log = h("ol", { class: "cu-log" });
  const badge = h("span", { class: "cu-badge" }, phone ? "virtual display #1 · 1080×2340" : "sandbox · ubuntu-24.04 · 1280×800");
  let mine = false;
  const take = h("button", { class: "eu-btn", type: "button", onclick: () => { mine = !mine; disp.classList.toggle("yours", mine); take.textContent = mine ? "Hand back to agent" : "Take over"; cur.querySelector("span").textContent = mine ? "you" : "agent"; settle(el, mine ? "You're driving" : "Driving", mine ? "paused" : null); tell(el, { action: mine ? "takeover" : "handback", label: mine ? "I'll drive" : "Your turn again", entities: { display: phone ? "virtual-1" : "sandbox" }, ack: mine ? "Paused after the current step. Anything you do here is logged so I can pick up from it." : "Picking up from what you did — I'll re-read the screen first." }); } }, "Take over");
  async function step(run, [verb, what, x, y], i) {
    if (mine) { await run.wait(400); return; }
    anim(cur, [{ left: cur.style.left || "50%", top: cur.style.top || "50%" }, { left: `${x}%`, top: `${y}%` }], { duration: 520, easing: "cubic-bezier(.4,0,.2,1)" });
    cur.style.left = `${x}%`; cur.style.top = `${y}%`;
    await run.wait(560);
    ripple.style.left = `${x}%`; ripple.style.top = `${y}%`;
    anim(ripple, [{ transform: "translate(-50%,-50%) scale(.2)", opacity: 0.9 }, { transform: "translate(-50%,-50%) scale(2.4)", opacity: 0 }], { duration: 500 });
    if (phone && verb === "tap" && what === "Dark mode") disp.classList.toggle("dark");
    if (!phone && verb === "type") await typeText(disp.querySelector(".cu-cmd"), what + "  ✓ 42 passed", run, 30);
    if (!phone && verb === "drag") disp.querySelector(".cu-k.mv")?.classList.add("moved");
    const li = h("li", {}, h("b", {}, verb), ` ${what}`, h("time", {}, `${(i * 0.8 + 0.6).toFixed(1)}s`));
    log.append(li); anim(li, [{ opacity: 0, transform: "translateX(-6px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
    while (log.children.length > 5) log.firstChild.remove();
  }
  const surface = appSurface(a, [appBar(phone ? ["Mirror", "Virtual display", "Input"] : a.id === "cua" ? ["Computer", "Trajectory", "Benchmarks"] : [a.name, "Display", "Logs"], [badge]), h("div", { class: "cu" }, h("div", { class: "cu-stage" }, disp), log)], { cls: "screen" });
  const el = shell(a, "screen", { verb: phone ? "Agent on its own display" : "Computer-use run", status: "Driving", body: h("div", {}, surface, h("p", { class: "eu-hint" }, phone ? "Runs on a second display: your phone screen stays yours." : "The agent drives a sandboxed desktop. Take over any time.")), foot: [take, act("Save trajectory", { cls: "ghost", ack: "Saved the run as a trajectory (12 steps, screenshots included) so it can be replayed or used as a test.", done: "Saved ✓" })], summary: `${steps.length} computer-use steps in ${a.name}` });
  return { el, async play(run) { for (let i = 0; i < steps.length; i++) await step(run, steps[i], i); }, spec: { kind: "screen", app: a.id, display: phone ? "scrcpy --new-display=1080x2340/420" : "cua sandbox", steps: steps.map((s) => `${s[0]} ${s[1]}`), takeover: true } };
}

/* boat-style sandboxes: fork a running VM per experiment, keep the winner, stop the rest */
// Fixture results (synthetic): the decision is the user's; the card shows the evidence and returns a
// typed result { keep, stop[], evidence } rather than only relabelling itself.
const FORKS = [
  { id: "fork-a", runtime: "bun", build: 41, tests: "42/42", y: 20 },
  { id: "fork-b", runtime: "node 26", build: 19, tests: "42/42", y: 80 },
  { id: "fork-c", runtime: "deno", build: 33, tests: "40/42", y: 140 },
];
function sandboxMake(a, r) {
  const W = 560, H = 180;
  const sv = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sv.setAttribute("viewBox", `0 0 ${W} ${H}`); sv.setAttribute("class", "sb-sv"); sv.setAttribute("preserveAspectRatio", "none");
  const tree = h("div", { class: "sb" }, sv);
  const vm = (x, y, name, st, tag = "div", attrs = {}) => { const n = h(tag, { class: "sb-vm " + st, style: { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }, ...attrs }, h("i"), h("b", {}, name), h("span", {}, st)); tree.append(n); return n; };
  const wire = (x1, y1, x2, y2) => { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", `M${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}`); p.setAttribute("class", "sb-w"); p.setAttribute("pathLength", 1); sv.append(p); return p; };
  const cost = h("b", {}, "$0.000");
  const meter = h("span", { class: "ap-stat" }, "per-second billing · ", cost);
  const term = h("pre", { class: "ap-code sb-term" });
  let secs = 0, alive = 4, tm = 0, pick = "fork-b", decided = null;
  const tick = () => { secs += alive; cost.textContent = "$" + (secs * 0.000011).toFixed(4); tm = setTimeout(tick, 250); };
  const fastest = [...FORKS].sort((p, q) => p.build - q.build)[0];
  // The tree is the real state from the start (no autoplay needed); play() only animates it in.
  const root = vm(20, 70, "agent-main", "running");
  const wires = FORKS.map((f) => wire(150, 88, 330, f.y + 16));
  const picks = h("div", { class: "sb-picks", role: "radiogroup", "aria-label": "Fork to keep" });
  const nodes = FORKS.map((f) => {
    const n = vm(330, f.y, `${f.id} · ${f.runtime}`, "running", "button", { type: "button", role: "radio", "aria-checked": String(f.id === pick), "aria-label": `${f.id} · ${f.runtime}, build ${f.build} s, tests ${f.tests}`, "data-fork": f.id });
    n.lastChild.textContent = `build ${f.build} s · ${f.tests}`;
    n.onclick = () => choose(f.id);
    return n;
  });
  const lbl = () => keep.querySelector(".lbl");
  function choose(id, quiet = false) {
    if (decided) return;
    pick = id;
    nodes.forEach((n) => { const on = n.dataset.fork === id; n.setAttribute("aria-checked", String(on)); n.tabIndex = on ? 0 : -1; n.classList.toggle("sb-win", on); });
    const f = FORKS.find((x) => x.id === id);
    lbl().textContent = `Hold to keep ${id}`;
    note.textContent = id === fastest.id ? `${id} is the fastest build (${f.build} s) with ${f.tests} tests passing.` : `${id} is ${f.build - fastest.build} s slower than ${fastest.id}${f.tests !== "42/42" ? ` and has ${f.tests} tests passing` : ""}.`;
    if (!quiet) tell(el, { action: "select", label: `Consider ${id}`, entities: { fork: id }, quiet: true });
  }
  nodes.forEach((n, i) => n.addEventListener("keydown", (e) => {
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]; if (d == null) return;
    e.preventDefault(); const t = nodes[(i + d + nodes.length) % nodes.length]; choose(t.dataset.fork); t.focus();
  }));
  const note = h("p", { class: "eu-hint sb-note", "aria-live": "polite" });
  const result = h("pre", { class: "ap-code sb-result", hidden: true, "aria-label": "Decision result" });
  const keep = holdButton("Hold to keep fork-b", (b, t) => {
    const stop = FORKS.filter((f) => f.id !== pick).map((f) => f.id), f = FORKS.find((x) => x.id === pick);
    decided = { keep: pick, stop, evidence: { build_s: f.build, tests: f.tests, fastest: fastest.id } };
    t.textContent = `Kept ${pick} · ${stop.length} stopped`; burst(b);
    nodes.forEach((n) => { n.disabled = true; if (n.dataset.fork !== pick) { n.className = "sb-vm stopped"; n.lastChild.textContent = "stopped · $0"; } });
    alive = 2;
    result.hidden = false; result.textContent = JSON.stringify(decided, null, 1);
    settle(el, `Kept ${pick}`, "ok");
    tell(el, { action: "keep_fork", label: `Keep ${pick}, stop ${stop.join(" and ")}`, entities: { keep: pick, stop }, text: JSON.stringify(decided),
      ack: `Stopping ${stop.join(" and ")} now; billing for them ends when they halt. ${pick} keeps running with its memory and disk, and its snapshot is the new base.` });
  });
  const surface = appSurface(a, [appBar(["Machines", "Snapshots", "SSH"], [meter]), tree, note, why(`All three forks ran the same build and test command from one snapshot of agent-main. ${fastest.id} finished first; fork-c failed 2 tests on deno. Pick a different fork if speed is not what matters.`), term, result], { cls: "sandbox" });
  const el = shell(a, "sandbox", { verb: "Forked a VM per experiment", status: "3 running", body: surface, foot: [keep, act("ssh fork-b", { cls: "ghost", ack: "Here's the command: ssh fork-b.sandbox — it expires with the sandbox in 2 h." })], summary: `Forked 3 sandboxes in ${a.name}, kept the fastest` });
  const lines = ["$ boat create agent-main --docker", "$ boat fork agent-main ×3   # 1.4 s, memory copied", ...FORKS.map((f) => `${f.id}  build ${f.build} s  tests ${f.tests}${f.id === fastest.id ? "  ← fastest" : ""}`)];
  term.textContent = lines.join("\n");
  choose(pick, true);
  return { el, async play(run) {
    clearTimeout(tm); tick();
    term.replaceChildren();
    nodes.forEach((n) => (n.style.opacity = 0)); wires.forEach((p) => (p.style.opacity = 0));
    for (const l of lines.slice(0, 2)) { const d = h("div"); term.append(d); await typeText(d, l, run, 60); }
    for (let i = 0; i < nodes.length; i++) { await run.wait(260); wires[i].style.opacity = ""; anim(wires[i], [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 500 }); nodes[i].style.opacity = ""; anim(nodes[i], [{ opacity: 0, transform: "translateX(-20px)" }, { opacity: 1, transform: "none" }], { spring: "bouncy" }); }
    await run.wait(500);
    for (const l of lines.slice(2)) { const d = h("div"); term.append(d); await typeText(d, l, run, 70); }
  }, spec: { kind: "sandbox", app: a.id, base: "agent-main", forks: FORKS.length, billing: "per second, free when stopped", result: "keep_fork { keep, stop[], evidence }" } };
}

// Synthetic readout, not an SDK response. Spaces can stream a desktop or an individual window.
function spacesMake(a) {
  const space = { id: "space-preview", name: "Release preview" };
  const session = { id: "session-review", state: "Running" };
  const display = { id: "display-1", name: "Primary display", resolution: "1280 × 800" };
  const targets = [{ id: "desktop", label: "Desktop" }, { id: "window-browser", label: "Window · Browser" }];
  const state = h("p", { class: "eu-hint", role: "status" }, "Streaming desktop · simulated");
  const buttons = targets.map((target, i) => h("button", {
    type: "button", class: "eu-btn", "aria-pressed": i === 0 ? "true" : "false",
    onclick: () => {
      if (state.dataset.target === target.id) return;
      state.dataset.target = target.id;
      state.textContent = i === 0 ? "Streaming desktop · simulated" : "Streaming Browser window · simulated";
      buttons.forEach((button, j) => button.setAttribute("aria-pressed", i === j ? "true" : "false"));
      tell(el, { action: "preview-display", label: target.label, quiet: true,
        entities: { space: space.id, session: session.id, display: display.id, target: target.id } });
    },
  }, target.label));
  state.dataset.target = targets[0].id;
  const surface = appSurface(a, [
    appBar(["Cua Spaces", "Display"], [h("span", { class: "ap-stat" }, "Fixture only")]),
    h("dl", { class: "space-readout" },
      h("dt", {}, "Space"), h("dd", {}, space.name),
      h("dt", {}, "Session"), h("dd", {}, `${session.id} · ${session.state}`),
      h("dt", {}, "Display"), h("dd", {}, `${display.name} · ${display.resolution}`)),
    state,
  ], { cls: "cua-spaces" });
  const el = shell(a, "cua-spaces", { verb: "Cua Spaces session", status: "Fixture", body: surface,
    foot: buttons, summary: `Previewed the display for ${space.name}` });
  return { el, async play() {}, spec: { kind: "cua-spaces", app: a.id, simulated: true, space, session,
    display: { ...display, state: "streaming", target: targets[0].id }, targets } };
}

export const KINDS_E = {
  "cua-spaces": { label: "Cua Spaces", verb: () => "Inspect a Space display", make: spacesMake },
  screen: { label: "Computer-use screen", verb: () => "Agent on its own display", make: screenMake },
  sandbox: { label: "Forking sandboxes", verb: () => "Forked VMs", make: sandboxMake },
};
