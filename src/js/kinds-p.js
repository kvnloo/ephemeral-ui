// Hermes plugins: the real tool chain a plugin runs, with the plugin's own rules surfaced as UI.
// Meshy's skill says "confirm cost before every credit-spending call", so the card makes that a hold.
// Tool names and costs come from each plugin's README / skill (see apps.json docs).
import { h, anim, stagger, Run } from "./motion.js";
import { shell, burst, holdButton } from "./shell.js";
import { act, tell, why, undoable, settle } from "./loop.js";
import { appSurface, appBar } from "./chrome.js";
import { KINDS_3D } from "./kinds-3d.js";

const CHAINS = {
  meshy: { title: "low-poly treasure chest for Godot", steps: [
    ["meshy_check_balance", "", 0, "1,240 credits"],
    ["meshy_text_to_3d", 'prompt: "low-poly treasure chest", ai_model: meshy-6', 20, "preview ✓ 2m 14s"],
    ["meshy_text_to_3d_refine", "texture: hand-painted", 10, "PBR textures ✓"],
    ["meshy_remesh", "target_polycount: 3000, topology: quad", 5, "2,986 quads"],
    ["meshy_download_model", "format: glb", 0, "chest.glb · 1.8 MB → res://assets/"]], viewer: true },
  "hermes-talk": { title: "duplex voice call", steps: [["talk.start", "voice: realtime, barge-in: on", 0, "connected · 180 ms"], ["memory.recall", "“the Acme deal”", 0, "3 notes"], ["calendar.create", "Thu 10:00 · Acme sync", 0, "booked"], ["talk-hangup", "", 0, "summary saved"]] },
  "phone-harness": { title: "check the T3 Code build on the S25", steps: [["phone.open", "app: T3 Code (virtual display)", 0, "launched"], ["phone.tree", "", 0, "142 nodes"], ["phone.tap", "“Threads”", 0, "ok"], ["phone.screenshot", "", 0, "390×844 ✓"]] },
  firecrawl: { title: "crawl the Godot docs for triggers", steps: [["firecrawl.map", "docs.godotengine.org", 1, "1,904 URLs"], ["firecrawl.crawl", "include: /tutorials/physics/*", 18, "18 pages"], ["firecrawl.extract", "schema: {signal, args}", 5, "body_entered(body)"]] },
  exa: { title: "find agent-native UI demos", steps: [["exa.search", "“ephemeral ui agent card demo”, type: neural", 0, "25 results"], ["exa.contents", "top 5, highlights", 0, "5 pages"], ["exa.similar", "x.com/pitus_/status/…", 0, "12 similar"]] },
  fal: { title: "concept art → turntable", steps: [["fal.flux-pro", "“brass robot toy, studio”", 1, "1024² ✓"], ["fal.trellis", "image → 3D", 2, "robot.glb"], ["fal.kling-video", "turntable 5 s", 4, "mp4 ✓"]] },
  tavily: { title: "research the Meshy plugin", steps: [["tavily.search", "depth: advanced", 1, "8 sources"], ["tavily.extract", "top 3", 1, "markdown"]] },
  "google-meet": { title: "join and take notes", steps: [["meet.join", "meet.google.com/abc-defg-hij", 0, "in call · 4 people"], ["meet.transcribe", "live", 0, "31 min"], ["meet.actions", "", 0, "5 action items"]] },
  bend: { title: "prove the owner rule", steps: [["bend.write_law", "never_merge_red_ci", 0, "PROOF.bend"], ["bend_verify", "--verdict", 0, "VERIFIED · 12 cases"], ["bend.gate", "pre-merge", 0, "installed"]] },
  "hermes-handoff": { title: "close this stretch of work", steps: [["handoff.capsule", "thread → 2 KB", 0, "written"], ["handoff.next", "", 0, "3 next steps"], ["/new", "", 0, "fresh session primed"]] },
  searxng: { title: "search with the free backend", steps: [["web.search", "backend: searxng", 0, "10 results"], ["web.extract", "top 3", 0, "markdown"]] },
};

function pluginMake(a, r) {
  const c = CHAINS[a.id] || CHAINS.searxng;
  const total = c.steps.reduce((s, x) => s + x[2], 0);
  const rows = h("ol", { class: "pl-steps" }, c.steps.map(([tool, args, cost]) => h("li", {}, h("i", { class: "pl-dot" }), h("code", {}, tool), h("span", { class: "pl-args" }, args), cost ? h("span", { class: "pl-cost" }, `${cost} cr`) : h("span", { class: "pl-free" }, "free"), h("span", { class: "pl-res" }))));
  const bal = h("span", { class: "ap-stat" }, total ? `${total} credits total` : "no credits");
  let view = null;
  if (c.viewer) { view = KINDS_3D.gen3d.make(a, r); }
  let go = null;
  const confirm = holdButton(total ? `Hold to spend ${total} credits` : "Hold to run", async (b, t) => { t.textContent = "Running…"; await run(new Run()); t.textContent = "Done ✓"; burst(b); });
  async function run(rn) {
    const lis = [...rows.children];
    for (let i = 0; i < c.steps.length; i++) {
      const li = lis[i]; li.classList.add("on");
      await rn.wait(c.steps[i][2] ? 900 : 450);
      li.classList.remove("on"); li.classList.add("done");
      li.querySelector(".pl-res").textContent = c.steps[i][3];
      anim(li.querySelector(".pl-res"), [{ opacity: 0, transform: "translateX(-4px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
      if (view && i === 1) quietPlay(view);
    }
  }
  const quietPlay = (v) => v.play(new Run()).catch(() => {});
  const body = h("div", {}, appSurface(a, [appBar(["Hermes", "Plugin", a.name], [bal]), h("div", { class: "pl-task" }, h("span", { class: "kicker" }, "Task"), h("b", {}, c.title)), rows, view ? h("div", { class: "pl-view" }, view.el.querySelector(".ap") || view.el) : null], { cls: "plugin" }), h("p", { class: "eu-hint" }, total ? "The plugin's rule: name the tool and its cost, then wait for you. One hold approves the whole chain." : "Read-only tools run without asking."));
  const el = shell(a, "plugin", { verb: `Hermes plugin · ${c.steps.length} tools`, status: total ? "Needs OK" : "Ready", body, foot: [confirm, act("Show calls", { cls: "ghost", ack: "Three calls: meet.join (read-only), meet.transcribe (read-only), meet.actions (writes notes — this is the one that asks first)." })], summary: `${a.name}: ${c.title}` });
  return { el, async play(rn) { stagger(rows.children, { gap: 80 }); }, spec: { kind: "plugin", app: a.id, host: "hermes", tools: c.steps.map((s) => ({ tool: s[0], args: s[1], credits: s[2] })), confirm: total ? "hold" : "none" } };
}

export const KINDS_P = { plugin: { label: "Hermes plugin chain", verb: () => "Hermes plugin", make: pluginMake } };
