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
function sandboxMake(a, r) {
  const W = 560, H = 180;
  const sv = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sv.setAttribute("viewBox", `0 0 ${W} ${H}`); sv.setAttribute("class", "sb-sv"); sv.setAttribute("preserveAspectRatio", "none");
  const tree = h("div", { class: "sb" }, sv);
  const vm = (x, y, name, st) => { const n = h("div", { class: "sb-vm " + st, style: { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` } }, h("i"), h("b", {}, name), h("span", {}, st)); tree.append(n); return n; };
  const wire = (x1, y1, x2, y2) => { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", `M${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}`); p.setAttribute("class", "sb-w"); p.setAttribute("pathLength", 1); sv.append(p); anim(p, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 500 }); };
  const cost = h("b", {}, "$0.000");
  const meter = h("span", { class: "ap-stat" }, "per-second billing · ", cost);
  const term = h("pre", { class: "ap-code sb-term" });
  let secs = 0, alive = 1, tm = 0;
  const tick = () => { secs += alive; cost.textContent = "$" + (secs * 0.000011).toFixed(4); tm = setTimeout(tick, 250); };
  const keep = holdButton("Hold to keep winner", (b, t) => { t.textContent = "Kept fork-b · others stopped"; burst(b); tree.querySelectorAll(".sb-vm.running").forEach((n) => { if (!n.textContent.includes("fork-b")) { n.className = "sb-vm stopped"; n.lastChild.textContent = "stopped · $0"; } }); alive = 2; });
  const surface = appSurface(a, [appBar(["Machines", "Snapshots", "SSH"], [meter]), tree, term], { cls: "sandbox" });
  const el = shell(a, "sandbox", { verb: "Forked a VM per experiment", status: "3 running", body: surface, foot: [keep, act("ssh fork-b", { cls: "ghost", ack: "Here's the command: ssh fork-b.sandbox — it expires with the sandbox in 2 h." })], summary: `Forked 3 sandboxes in ${a.name}, kept the fastest` });
  return { el, async play(run) {
    clearTimeout(tm); tick();
    const root = vm(20, 70, "agent-main", "running");
    for (const l of ["$ boat create agent-main --docker", "$ boat fork agent-main ×3   # 1.4 s, memory copied"]) { const d = h("div"); term.append(d); await typeText(d, l, run, 60); }
    const ys = [20, 80, 140], names = ["fork-a · bun", "fork-b · node 26", "fork-c · deno"];
    for (let i = 0; i < 3; i++) { await run.wait(260); wire(150, 88, 330, ys[i] + 16); const n = vm(330, ys[i], names[i], "running"); anim(n, [{ opacity: 0, transform: "translateX(-20px)" }, { opacity: 1, transform: "none" }], { spring: "bouncy" }); alive++; }
    await run.wait(500);
    const res = ["fork-a  build 41 s", "fork-b  build 19 s  ← fastest", "fork-c  build 33 s"];
    for (const l of res) { const d = h("div"); term.append(d); await typeText(d, l, run, 70); }
    tree.querySelectorAll(".sb-vm")[2]?.classList.add("win");
  }, spec: { kind: "sandbox", app: a.id, base: "agent-main", forks: 3, billing: "per second, free when stopped" } };
}

export const KINDS_E = {
  screen: { label: "Computer-use screen", verb: () => "Agent on its own display", make: screenMake },
  sandbox: { label: "Forking sandboxes", verb: () => "Forked VMs", make: sandboxMake },
};
