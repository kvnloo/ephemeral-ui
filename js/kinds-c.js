// Card kinds, part D: 2D studio surfaces. Node graphs, an edit timeline driven by voice + marks, frame
// review, generative layers, galleries with video, CAD drafting, whiteboards, a DAW, flashcards, USD
// stages and Anatomy figures. Terms and defaults come from each app's docs (see apps.json `docs`).
import { h, anim, stagger, typeText, flip, Run } from "./motion.js";
import { shell, burst, seg, holdButton, svg, avatar, PEOPLE } from "./shell.js";
import { act, tell, why, undoable, settle } from "./loop.js";
import { appSurface, appBar, uiOf } from "./chrome.js";

const sleep = (run, ms) => run.wait(ms);

/* ---------------- nodes: the app's own node graph ---------------- */
// ComfyUI link colours are ComfyUI's defaults per type; the default graph is ComfyUI's starter workflow.
const COMFY = { MODEL: "#b39ddb", CLIP: "#ffd500", VAE: "#ff6e6e", CONDITIONING: "#ffa931", LATENT: "#ff9cf9", IMAGE: "#64b5f6", exec: "#ffffff", float: "#a0ff7f", bool: "#940000", obj: "#00a8f3", geo: "#7fc3ff", top: "#c088ff" };
const GRAPHS = {
  comfy: { nodes: [["Load Checkpoint", 10, 20, [], ["MODEL", "CLIP", "VAE"], "sd_xl_base_1.0"], ["CLIP Text Encode", 200, 6, ["CLIP"], ["CONDITIONING"], "a lighthouse at dusk, film"], ["CLIP Text Encode", 200, 104, ["CLIP"], ["CONDITIONING"], "blurry, text"], ["Empty Latent Image", 200, 204, [], ["LATENT"], "1024 × 1024"], ["KSampler", 390, 40, ["MODEL", "CONDITIONING", "CONDITIONING", "LATENT"], ["LATENT"], "steps 20 · cfg 7 · euler"], ["VAE Decode", 560, 16, ["LATENT", "VAE"], ["IMAGE"], ""], ["Save Image", 560, 120, ["IMAGE"], [], "preview"]], wires: [[0, 0, 4, 0], [0, 1, 1, 0], [0, 1, 2, 0], [1, 0, 4, 1], [2, 0, 4, 2], [3, 0, 4, 3], [4, 0, 5, 0], [0, 2, 5, 1], [5, 0, 6, 0]], run: [0, 1, 2, 3, 4, 5, 6], head: "#353535" },
  unreal: { nodes: [["Event BeginPlay", 10, 30, [], ["exec"], ""], ["Delay", 190, 30, ["exec", "float"], ["exec"], "Duration 2.0"], ["Spawn Actor from Class", 360, 20, ["exec", "obj"], ["exec", "obj"], "BP_Drone"], ["Print String", 560, 30, ["exec"], ["exec"], "\"Drone spawned\""], ["Get Actor Transform", 190, 140, [], ["obj"], "PlayerStart"]], wires: [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0], [4, 0, 2, 1]], run: [0, 1, 2, 3], heads: ["#9b1d1d", "#2b5d8a", "#2b5d8a", "#2b5d8a", "#2f6e3a"] },
  houdini: { nodes: [["grid1", 40, 10, [], ["geo"], "Grid"], ["mountain1", 40, 80, ["geo"], ["geo"], "Mountain"], ["scatter1", 40, 150, ["geo"], ["geo"], "Scatter · 4000"], ["box1", 240, 150, [], ["geo"], "Box"], ["copytopoints1", 140, 220, ["geo", "geo"], ["geo"], "Copy to Points"]], wires: [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 4, 0], [3, 0, 4, 1]], run: [0, 1, 2, 3, 4], sop: true },
  touch: { nodes: [["noise1", 10, 30, [], ["top"], "Noise TOP"], ["level1", 180, 30, ["top"], ["top"], "Level TOP"], ["feedback1", 180, 130, ["top"], ["top"], "Feedback TOP"], ["comp1", 350, 60, ["top", "top"], ["top"], "Composite TOP"], ["out1", 520, 60, ["top"], [], "Out TOP"]], wires: [[0, 0, 1, 0], [1, 0, 3, 0], [2, 0, 3, 1], [3, 0, 4, 0], [3, 0, 2, 0]], run: [0, 1, 2, 3, 4] },
  resolve: { nodes: [["01 Balance", 10, 60, ["IMAGE"], ["IMAGE"], "Lift −0.02"], ["02 Contrast", 170, 60, ["IMAGE"], ["IMAGE"], "Pivot 0.435"], ["03 Skin (qualifier)", 330, 10, ["IMAGE"], ["IMAGE"], "HSL key"], ["04 Look", 330, 120, ["IMAGE"], ["IMAGE"], "Film LUT 40%"], ["Output", 500, 60, ["IMAGE", "IMAGE"], [], ""]], wires: [[0, 0, 1, 0], [1, 0, 2, 0], [1, 0, 3, 0], [2, 0, 4, 0], [3, 0, 4, 1]], run: [0, 1, 2, 3, 4] },
  generic: { nodes: [["Trigger", 10, 40, [], ["exec"], "on push"], ["Fetch", 180, 20, ["exec"], ["exec", "obj"], "GET /events"], ["Transform", 350, 40, ["exec", "obj"], ["exec"], "map → card"], ["Render", 520, 40, ["exec"], [], "ephemeral card"]], wires: [[0, 0, 1, 0], [1, 0, 2, 0], [1, 1, 2, 1], [2, 0, 3, 0]], run: [0, 1, 2, 3] },
};
const graphFor = (a) => a.ui === "comfy" || /comfy/i.test(a.name) ? "comfy" : a.ui === "unreal" || a.ui === "unity" || a.ui === "godot" || a.ui === "gamemaker" || a.ui === "scratch" ? "unreal" : a.ui === "houdini" || a.ui === "rhino" || a.ui === "c4d" ? "houdini" : a.ui === "touch" || a.ui === "rive" ? "touch" : a.ui === "resolve" ? "resolve" : "generic";
function nodesMake(a, r) {
  const g = GRAPHS[graphFor(a)];
  const W = 720, H = 310;
  const sv = svg("svg", { class: "ng-wires", viewBox: `0 0 ${W} ${H}` });
  const cv = h("div", { class: "ng" + (g.sop ? " sop" : ""), style: { "--w": W, "--h": H } }, sv);
  const nodes = g.nodes.map(([title, x, y, ins, outs, body], i) => {
    const n = h("div", { class: "ng-n", style: { left: `${x}px`, top: `${y}px`, "--hd": g.heads?.[i] || g.head || "var(--ap-panel)" } },
      h("div", { class: "ng-h" }, title, g.sop && i === g.nodes.length - 1 ? h("span", { class: "ng-flag" }) : null),
      h("div", { class: "ng-io" }, h("div", {}, ins.map((t) => h("span", { class: "ng-pin in", style: { "--pc": COMFY[t] || "#aaa" } }, h("i"), t === "exec" ? "" : t.toLowerCase()))), h("div", {}, outs.map((t) => h("span", { class: "ng-pin out", style: { "--pc": COMFY[t] || "#aaa" } }, t === "exec" ? "" : t, h("i"))))),
      body ? h("div", { class: "ng-b" }, body) : null, h("div", { class: "ng-prog" }));
    cv.append(n); return n;
  });
  const wires = g.wires.map(([a0, o, b0, ii]) => { const p = svg("path", { class: "ng-w" }); sv.append(p); return { p, a0, o, b0, ii }; });
  const out = h("div", { class: "ng-out" });
  const lay = () => {
    const cb = cv.getBoundingClientRect(); if (!cb.width) return;
    const sx = 1;
    for (const w of wires) {
      const A = nodes[w.a0].querySelectorAll(".ng-pin.out i")[w.o], B = nodes[w.b0].querySelectorAll(".ng-pin.in i")[w.ii];
      if (!A || !B) continue;
      const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
      const x1 = (ra.left + ra.width / 2 - cb.left) * sx, y1 = (ra.top + ra.height / 2 - cb.top) * sx, x2 = (rb.left + rb.width / 2 - cb.left) * sx, y2 = (rb.top + rb.height / 2 - cb.top) * sx;
      const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
      w.p.setAttribute("d", g.sop ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`);
      w.p.style.stroke = getComputedStyle(A).getPropertyValue("--pc") || "#aaa";
    }
  };
  new ResizeObserver(lay).observe(cv);
  // drag nodes
  nodes.forEach((n) => {
    let o = null;
    n.querySelector(".ng-h").addEventListener("pointerdown", (e) => { const sc = 1; o = [e.clientX, e.clientY, parseFloat(n.style.left), parseFloat(n.style.top), sc]; n.setPointerCapture(e.pointerId); n.classList.add("drag"); e.stopPropagation(); });
    n.addEventListener("pointermove", (e) => { if (!o) return; n.style.left = `${o[2] + (e.clientX - o[0]) * o[4]}px`; n.style.top = `${o[3] + (e.clientY - o[1]) * o[4]}px`; lay(); });
    n.addEventListener("pointerup", (e) => { const moved = o && Math.hypot(e.clientX - o[0], e.clientY - o[1]) > 4; o = null; n.classList.remove("drag"); if (!moved) pickNode(n); });
    n.tabIndex = 0; n.setAttribute("role", "button"); n.setAttribute("aria-label", `${n.querySelector(".ng-h").textContent} node`);
    n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickNode(n); } });
  });
  // Pointing at a node is how you talk about it: the agent gets the node, not "the third box".
  function pickNode(n) {
    nodes.forEach((x) => x.classList.toggle("lp-sel", x === n));
    const t = n.querySelector(".ng-h").textContent, b = n.querySelector(".ng-b")?.textContent || "";
    tell(el, { action: "select", label: `This node: ${t}`, entities: { node: t }, ack: /KSampler|sampler/i.test(t) ? "The sampler: 20 steps, euler, cfg 7. Fewer steps would halve the time; more would mostly sharpen fabric." : /Checkpoint/i.test(t) ? "SDXL base. Swap it for a turbo checkpoint and the run drops to ~1 s at 4 steps." : b ? `${t} — ${b}. Tell me what to change and I'll re-run from here.` : `${t}. Tell me what to change and I'll re-run from here.` });
  }
  const queue = h("button", { class: "eu-btn primary", type: "button" }, graphFor(a) === "comfy" ? "Queue Prompt" : graphFor(a) === "unreal" ? "▶ Compile & Play" : "Cook");
  async function exec(run) {
    queue.disabled = true;
    nodes.forEach((n) => n.classList.remove("ran", "running"));
    for (const i of g.run) {
      const n = nodes[i]; n.classList.add("running");
      wires.filter((w) => w.b0 === i).forEach((w) => w.p.classList.add("flow"));
      if (graphFor(a) === "comfy" && i === 4) { const pr = n.querySelector(".ng-prog"); for (let s = 1; s <= 20; s++) { pr.style.setProperty("--p", s / 20); n.querySelector(".ng-b").textContent = `step ${s}/20 · euler`; await sleep(run, 70); } }
      else await sleep(run, 380);
      n.classList.remove("running"); n.classList.add("ran");
      wires.filter((w) => w.b0 === i).forEach((w) => w.p.classList.remove("flow"));
    }
    if (graphFor(a) === "comfy") { const img = h("div", { class: "ng-img" }); nodes[6].querySelector(".ng-b").replaceChildren(img); anim(img, [{ opacity: 0, filter: "blur(10px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 900 }); }
    out.textContent = graphFor(a) === "comfy" ? "Prompt executed in 3.1 s · ComfyUI_00042_.png" : graphFor(a) === "unreal" ? "LogBlueprintUserMessages: Drone spawned" : "Cooked in 0.4 s";
    queue.disabled = false;
  }
  queue.onclick = () => exec(new Run());
  const surface = appSurface(a, [appBar(graphFor(a) === "comfy" ? ["Workflow", "Queue", "History"] : graphFor(a) === "unreal" ? ["Event Graph", "Construction Script", "Compile"] : [a.name, "Network", "Cook"], [h("span", { class: "ap-stat" }, `${nodes.length} nodes`)]), h("div", { class: "ng-scroll" }, cv), out], { cls: "nodes" });
  const el = shell(a, "nodes", { verb: `Built a ${graphFor(a) === "comfy" ? "workflow" : "graph"} · ${a.name}`, status: "Ready", body: surface, foot: [queue, act("Save graph", { cls: "ghost", ack: `Saved to ${a.name} as a reusable workflow — re-running it from this card gives the same result.`, done: "Saved ✓" })], summary: `Built and ran a ${nodes.length}-node graph in ${a.name}` });
  return { el, async play(run) { nodes.forEach((n, i) => anim(n, [{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "none" }], { spring: "bouncy", delay: i * 80 })); wires.forEach((w, i) => { w.p.setAttribute("pathLength", 1); anim(w.p, [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: 600, delay: 300 + i * 90 }); }); requestAnimationFrame(lay); await sleep(run, 1500); await exec(run); }, auto: async (run) => {}, spec: { kind: "nodes", app: a.id, graph: graphFor(a), nodes: g.nodes.map((n) => n[0]) } };
}

/* ---------------- timeline: edit by voice + marks (after Scrawl and the voice-edit demos) ---------------- */
function timelineMake(a, r) {
  const ui = uiOf(a) || {};
  const clips = [["Intro", 0, 18], ["Wide", 18, 16], ["um… pause", 34, 7], ["Detail", 41, 20], ["Outro", 61, 14]];
  const mon = h("canvas", { class: "tl-mon", width: 480, height: 270 });
  const transcript = h("div", { class: "tl-tx" }, "so the wild part is um… the light hits the water and you get this".split(" ").map((w) => h("span", {}, w + " ")));
  const v1 = h("div", { class: "tl-tr v" }, clips.map(([n, s, d], i) => h("div", { class: "tl-c" + (i === 2 ? " gap" : ""), style: { left: `${s}%`, width: `${d}%` } }, h("span", {}, n))));
  const v2 = h("div", { class: "tl-tr v2" });
  const a1 = h("div", { class: "tl-tr a" }, h("div", { class: "tl-c a", style: { left: "0%", width: "75%" } }, wave()));
  const head = h("i", { class: "tl-ph" });
  const marks = svg("svg", { class: "tl-marks", viewBox: "0 0 100 40", preserveAspectRatio: "none" });
  const tracks = h("div", { class: "tl-tracks" }, h("div", { class: "tl-lbl" }, h("span", {}, "V2"), h("span", {}, "V1"), h("span", {}, "A1")), h("div", { class: "tl-lanes" }, v2, v1, a1, head, marks));
  const voice = h("div", { class: "tl-voice" }, h("span", { class: "tl-mic" }), h("span", { class: "tl-say" }, ""));
  const chips = h("div", { class: "tl-chips" });
  let playing = false, ph = 0, raf = 0, zoom = 1;
  const draw = () => {
    const g = mon.getContext("2d"), W = 480, H = 270;
    const k = ph / 75;
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, `hsl(${210 - k * 40} 50% ${30 + k * 20}%)`); sky.addColorStop(1, `hsl(${25 + k * 10} 70% ${45 + k * 10}%)`);
    g.save(); g.translate(W / 2, H / 2); g.scale(zoom, zoom); g.translate(-W / 2, -H / 2);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = "#ffd28a"; g.beginPath(); g.arc(W * (0.3 + k * 0.4), H * 0.55, 26, 0, 7); g.fill();
    g.fillStyle = "rgba(10,20,40,.85)"; g.fillRect(0, H * 0.62, W, H);
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,210,140,${0.5 - i * 0.03})`; g.fillRect(W * (0.3 + k * 0.4) - 30 + Math.sin(i * 2 + ph) * 8, H * 0.64 + i * 7, 60 - i * 3, 2); }
    g.restore();
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(12, H - 30, 98, 20); g.fillStyle = "#fff"; g.font = "12px monospace"; g.fillText(`00:00:${String(Math.floor(ph / 3)).padStart(2, "0")}:${String(Math.floor(ph * 8) % 24).padStart(2, "0")}`, 18, H - 16);
  };
  const tick = () => { if (!playing) return; ph += 0.25; if (ph > 75) ph = 0; head.style.left = `${ph / 75 * 100}%`; draw(); raf = requestAnimationFrame(tick); };
  const play = h("button", { class: "eu-btn", type: "button", onclick: () => { playing = !playing; play.textContent = playing ? "❚❚" : "▶"; if (playing) tick(); else cancelAnimationFrame(raf); } }, "▶");
  async function edit(run) {
    // 1. owner talks, words light up as transcribed
    const say = voice.querySelector(".tl-say"); voice.classList.add("on");
    await typeText(say, "“cut the pause after ‘wild’ and punch in on the light”", run, 32);
    for (const w of transcript.children) { w.classList.add("lit"); await sleep(run, 55); }
    transcript.children[4].classList.add("cut");
    // 2. a mark circles the pause clip (✎①), like a Scrawl mark
    const pause = v1.children[2];
    const path = svg("path", { d: "M33 22 C 33 4, 43 4, 43 20 C 43 36, 31 36, 33 20", class: "tl-mark", pathLength: 1 });
    marks.append(path);
    anim(path, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, easing: "cubic-bezier(.65,0,.35,1)" });
    chips.append(h("span", { class: "tl-chip" }, "✎① pause · 00:00:11"));
    await sleep(run, 900);
    // 3. ripple delete: the gap closes with FLIP
    const rest = [...v1.children].slice(3);
    pause.classList.add("gone"); anim(pause, [{ opacity: 1 }, { opacity: 0, transform: "scaleY(.4)" }], { duration: 300 });
    await sleep(run, 260);
    flip(rest, () => { pause.remove(); rest.forEach((c) => (c.style.left = `${parseFloat(c.style.left) - 7}%`)); }, { spring: "soft" });
    path.remove();
    chips.append(h("span", { class: "tl-chip" }, "Ripple delete · −7 f"));
    await sleep(run, 600);
    // 4. punch in: a zoom keyframe lands on the Detail clip and the monitor pushes in
    const det = v1.children[2];
    const kf = h("i", { class: "tl-kf" }); det.append(kf); anim(kf, [{ transform: "scale(0) rotate(45deg)" }, { transform: "scale(1) rotate(45deg)" }], { spring: "bouncy" });
    const adj = h("div", { class: "tl-c adj", style: { left: det.style.left, width: det.style.width } }, h("span", {}, "Scale 120%")); v2.append(adj); anim(adj, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
    for (let i = 0; i < 20; i++) { zoom = 1 + (i / 19) * 0.2; ph = 41 + i; draw(); await sleep(run, 30); }
    chips.append(h("span", { class: "tl-chip" }, "Punch-in 120% · ease"));
    voice.classList.remove("on");
  }
  const surface = appSurface(a, [appBar(a.ui === "premiere" ? ["Edit", "Color", "Audio", "Captions"] : a.ui === "resolve" ? ["Cut", "Edit", "Fusion", "Color", "Fairlight"] : a.ui === "ffs" ? ["Film", "Shots", "Review", "Render"] : a.ui === "descript" ? ["Script", "Scenes", "Layers"] : [a.name, "Timeline", "Export"], [play]), h("div", { class: "tl-top" }, mon, h("div", { class: "tl-side" }, voice, transcript, chips)), tracks], { cls: "timeline" });
  const el = shell(a, "timeline", { verb: "Edited by voice and marks", status: "Editing", body: surface, foot: [act(a.ui === "ffs" ? "Render film" : "Export", { cls: "primary", ack: "Rendering at 4K in the background. This card turns into the file when it lands; keep chatting." }), act("Undo all", { cls: "ghost", ack: "Reverted all three edits. The cut is back to the original — your marks are kept if you want them again." })], summary: `Cut a pause and added a punch-in in ${a.name}` });
  return { el, async play(run) { draw(); stagger(v1.children, { gap: 60 }); await sleep(run, 700); await edit(run); }, spec: { kind: "timeline", app: a.id, input: ["voice", "pen marks"], ops: ["ripple delete 00:00:11", "scale keyframe 120%"] } };
}
function wave() { const s = svg("svg", { viewBox: "0 0 200 20", preserveAspectRatio: "none", class: "wv" }); let d = "M0 10"; for (let i = 0; i < 200; i += 2) { const a = Math.abs(Math.sin(i * 0.31) * Math.sin(i * 0.07)) * 9 + 1; d += ` M${i} ${10 - a} L${i} ${10 + a}`; } s.append(svg("path", { d })); return s; }

/* ---------------- review: draw on a frame, send a bundle, compare versions ---------------- */
function reviewMake(a, r) {
  const ui = uiOf(a) || {};
  const pic = h("div", { class: "rv-pic" }, h("div", { class: "rv-v1" }), h("div", { class: "rv-v2" }));
  const ink = svg("svg", { class: "rv-ink", viewBox: "0 0 100 56.25", preserveAspectRatio: "none" });
  const handle = h("div", { class: "rv-cmp", hidden: true }, h("i"));
  const frame = h("div", { class: "rv-frame" }, pic, ink, handle);
  const comments = h("ul", { class: "rv-list" });
  const bar = h("div", { class: "rv-bar" });
  const bundle = h("div", { class: "rv-bundle", hidden: true });
  let drawing = null, n = 0;
  const pt = (e) => { const b = frame.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * 100, ((e.clientY - b.top) / b.height) * 56.25]; };
  frame.addEventListener("pointerdown", (e) => { if (e.target.closest(".rv-cmp")) return; frame.setPointerCapture(e.pointerId); const [x, y] = pt(e); drawing = svg("path", { d: `M${x} ${y}`, class: "rv-stroke" }); ink.append(drawing); });
  frame.addEventListener("pointermove", (e) => { if (!drawing) return; const [x, y] = pt(e); drawing.setAttribute("d", drawing.getAttribute("d") + ` L${x.toFixed(1)} ${y.toFixed(1)}`); });
  frame.addEventListener("pointerup", () => { if (!drawing) return; drawing = null; addComment("You", "Fix this area", true); });
  function addComment(who, text, mine) {
    n++;
    const at = (8 + n * 9) % 60;
    const li = h("li", { class: mine ? "mine" : "" }, avatar(who, n), h("div", {}, h("b", {}, who, h("span", { class: "rv-tc" }, ` 00:00:${String(at).padStart(2, "0")}`)), h("p", {}, h("span", { class: "rv-num" }, `✎${"①②③④⑤⑥⑦⑧⑨"[n - 1] || n}`), " ", text)));
    comments.prepend(li); anim(li, [{ opacity: 0, transform: "translateX(10px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
    const pin = h("i", { style: { left: `${(at / 60) * 100}%` } }); bar.append(pin); anim(pin, [{ transform: "scale(0)" }, { transform: "scale(1)" }], { spring: "bouncy" });
  }
  const send = h("button", { class: "eu-btn primary", type: "button" }, "Send to agent");
  send.onclick = async () => {
    const run = new Run();
    send.disabled = true;
    bundle.hidden = false;
    bundle.replaceChildren(h("b", {}, "Bundle"), h("span", {}, `contact sheet · ${n} marks · transcript · 3 keyframes`));
    anim(bundle, [{ opacity: 0, transform: "translateY(6px) scale(.96)" }, { opacity: 1, transform: "none" }], { spring: "bouncy" });
    await run.wait(1200);
    bundle.replaceChildren(h("b", {}, "Agent"), h("span", {}, "Fixed in v2 · drag to compare"));
    handle.hidden = false; frame.classList.add("cmp");
    anim(handle, [{ left: "100%" }, { left: "50%" }], { spring: "soft" });
    frame.style.setProperty("--cmp", "50%");
    send.textContent = "Approve v2"; send.disabled = false; send.onclick = () => { burst(send); send.textContent = "Approved ✓"; };
  };
  let dragC = false;
  handle.addEventListener("pointerdown", (e) => { dragC = true; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener("pointermove", (e) => { if (!dragC) return; const b = frame.getBoundingClientRect(); const x = Math.max(0, Math.min(100, ((e.clientX - b.left) / b.width) * 100)); frame.style.setProperty("--cmp", `${x}%`); handle.style.left = `${x}%`; });
  handle.addEventListener("pointerup", () => (dragC = false));
  const surface = appSurface(a, [appBar(a.ui === "frameio" ? ["Review", "Compare", "Share"] : a.ui === "dash" ? ["Annotate", "Voice", "Send"] : a.ui === "ffs" ? ["Review", "Shots", "Proposals"] : [a.name, "Review", "Versions"], [h("span", { class: "ap-stat" }, "v1 → v2")]), h("div", { class: "rv" }, h("div", {}, frame, bar, bundle), comments)], { cls: "review" });
  const el = shell(a, "review", { verb: "Review with marks", status: "In review", body: h("div", {}, surface, h("p", { class: "eu-hint" }, "Draw on the frame to leave a mark; send it and drag the compare handle.")), foot: [send, act("Copy link", { cls: "ghost", ack: "Copied. The link opens this frame at 00:00:11 with both marks and the compare handle where you left it.", done: "Copied ✓" })], summary: `Reviewed a cut in ${a.name} and approved v2` });
  return { el, async play(run) { await sleep(run, 400); const d = svg("path", { d: "M58 20 C 70 14, 80 22, 74 32 C 68 40, 54 36, 56 26", class: "rv-stroke", pathLength: 1 }); ink.append(d); anim(d, [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: 800 }); await sleep(run, 800); addComment(PEOPLE[2], "Highlights clip here — pull back 1/3 stop"); await sleep(run, 500); addComment(PEOPLE[5], "Love the push-in. Hold 6 more frames."); }, spec: { kind: "review", app: a.id, marks: 2, bundle: ["contact sheet", "transcript", "keyframes"], compare: "v1↔v2" } };
}

/* ---------------- layers: selection → generative fill → variations ---------------- */
function layersMake(a, r) {
  const ui = uiOf(a) || {};
  const cv = h("canvas", { class: "ly-cv", width: 520, height: 320 });
  const ants = svg("svg", { class: "ly-ants", viewBox: "0 0 520 320" });
  const lasso = svg("path", { d: "M300 150 C 320 120, 380 118, 400 150 C 420 185, 400 225, 350 228 C 305 230, 285 190, 300 150 Z", class: "ly-sel", pathLength: 1 });
  ants.append(lasso);
  const genWord = ["photoshop", "photopea"].includes(a.ui) ? "Generative Fill" : a.ui === "krita" ? "AI Diffusion · Fill" : a.ui === "gimp" ? "Inpaint (G'MIC / SD)" : a.ui === "procreate" ? "Liquify" : "Fill";
  const bar = h("div", { class: "ly-task" }, h("span", { class: "ly-gen" }, "✦ " + genWord), h("span", { class: "ly-prompt" }, ""), h("button", { class: "ly-go", type: "button" }, "Generate"));
  const vars = h("div", { class: "ly-vars" });
  const layers = h("ul", { class: "ly-layers" }, h("li", { class: "on" }, h("i", { class: "ly-th bg" }), "Background", h("span", { class: "lock" }, "🔒")));
  let pick = 0;
  const variants = [["#b8322a", 0], ["#3a6fb0", 1], ["#e1b13a", 2]];
  function paint(withBarn = -1) {
    const g = cv.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, 320); sky.addColorStop(0, "#8fc1e8"); sky.addColorStop(0.6, "#f2d7b0"); g.fillStyle = sky; g.fillRect(0, 0, 520, 320);
    g.fillStyle = "#6f8f4f"; g.beginPath(); g.moveTo(0, 210); for (let x = 0; x <= 520; x += 20) g.lineTo(x, 200 + Math.sin(x * 0.02) * 14); g.lineTo(520, 320); g.lineTo(0, 320); g.fill();
    g.fillStyle = "#4e6b36"; g.beginPath(); g.moveTo(0, 250); for (let x = 0; x <= 520; x += 20) g.lineTo(x, 240 + Math.cos(x * 0.03) * 10); g.lineTo(520, 320); g.lineTo(0, 320); g.fill();
    for (let i = 0; i < 6; i++) { g.fillStyle = "#3d5a2a"; g.beginPath(); g.arc(40 + i * 34, 205, 14, 0, 7); g.fill(); }
    if (withBarn >= 0) {
      const [c, k] = variants[withBarn];
      g.save(); g.translate(350 - k * 4, 175 + k * 3);
      g.fillStyle = c; g.fillRect(-36, -6, 72, 46); g.beginPath(); g.moveTo(-42, -6); g.lineTo(0, -38 - k * 4); g.lineTo(42, -6); g.fill();
      g.fillStyle = "#fff"; g.fillRect(-12, 12, 24, 28); g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.moveTo(-12, 12); g.lineTo(12, 40); g.moveTo(12, 12); g.lineTo(-12, 40); g.stroke();
      g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(-36, 40, 80, 5); g.restore();
    }
  }
  async function generate(run) {
    const go = bar.querySelector(".ly-go"); go.disabled = true; go.textContent = "Generating…"; bar.classList.add("busy");
    await sleep(run, 1100);
    vars.replaceChildren(...variants.map((_, i) => { const b = h("button", { type: "button", class: "ly-v" + (i === 0 ? " on" : ""), "aria-label": `Variation ${i + 1}` }, h("canvas", { width: 104, height: 64 })); b.onclick = () => choose(i); return b; }));
    vars.querySelectorAll("canvas").forEach((c, i) => { paint(i); c.getContext("2d").drawImage(cv, 0, 0, 520, 320, 0, 0, 104, 64); });
    stagger(vars.children, { gap: 90, sp: "bouncy" });
    choose(0);
    const li = h("li", { class: "on" }, h("i", { class: "ly-th gen" }), "Generative Layer 1", h("span", { class: "eu-hint" }, "mask"));
    layers.querySelector("li").classList.remove("on"); layers.prepend(li); anim(li, [{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
    ants.classList.add("done"); go.textContent = "Generate"; go.disabled = false; bar.classList.remove("busy");
  }
  function choose(i) { pick = i; paint(i); vars.querySelectorAll(".ly-v").forEach((b, j) => b.classList.toggle("on", j === i)); }
  bar.querySelector(".ly-go").onclick = () => generate(new Run());
  const surface = appSurface(a, [appBar(a.ui === "photoshop" ? ["File", "Edit", "Image", "Layer", "Select"] : [a.name, "Layers", "Filters"], [h("span", { class: "ap-stat" }, "100% · RGB/8")]), h("div", { class: "ly" }, h("div", { class: "ly-stage" }, cv, ants, bar), h("div", { class: "ly-side" }, h("span", { class: "ap-lbl" }, "Properties · variations"), vars, h("span", { class: "ap-lbl" }, "Layers"), layers))], { cls: "layers" });
  const el = shell(a, "layers", { verb: `${genWord} on a selection`, status: "Editing", body: surface, foot: [act("Keep variation", { cls: "primary", ack: () => `Kept variation ${pick + 1} as its own layer above Background. The other two stay in Variations if you change your mind.`, entities: { layer: "generative-1" }, done: "Kept ✓" }), act("Export PSD", { cls: "ghost", ack: "Exported a layered PSD — masks and the generative layer stay editable." })], summary: `Filled a selection with a barn in ${a.name}` });
  return { el, async play(run) { paint(); anim(lasso, [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: 900 }); await sleep(run, 1000); ants.classList.add("march"); await typeText(bar.querySelector(".ly-prompt"), "a red barn with white doors", run, 30); await sleep(run, 300); await generate(run); }, spec: { kind: "layers", app: a.id, tool: genWord, selection: "lasso", prompt: "a red barn with white doors", variations: 3 } };
}

/* ---------------- gallery: images + videos, lightbox with shared-element motion ---------------- */
const ANATOMY = ["raptor-engine", "ripple-tank", "turning-dial", "dial-indicator", "push-button", "desk-computer"];
function galleryMake(a, r) {
  const items = a.id === "anatomy" || /quackles|openseadragon|dream|pixelfx/.test(a.id) || r() < 0.5
    ? ANATOMY.map((n, i) => ({ src: `media/anatomy/${n}.jpg`, vid: i % 2 === 0 ? `media/anatomy/${n}.mp4` : null, t: n.replace(/-/g, " ") }))
    : Array.from({ length: 6 }, (_, i) => ({ gen: i, vid: i % 3 === 0, t: ["Hero shot", "Turntable", "Detail", "Wide", "Close-up", "Night"][i] }));
  const grid = h("div", { class: "gl" }, items.map((it, i) => {
    const media = it.src ? (it.vid ? h("video", { src: it.vid, poster: it.src, muted: true, loop: true, playsinline: true, preload: "none" }) : h("img", { src: it.src, alt: it.t, loading: "lazy" })) : genTile(it.gen);
    const b = h("button", { type: "button", class: "gl-i" + (i === 0 ? " gl-big" : ""), "data-i": i, "aria-label": `${it.t}${it.vid ? " (video)" : ""}. Open; S to select.`, onkeydown: (e) => { if (e.key === "s" || e.key === "S") { e.preventDefault(); b.querySelector(".gl-sel").click(); } } }, media, it.vid ? h("span", { class: "gl-play" }, "▶") : null, h("span", { class: "gl-t" }, it.t), h("span", { class: "gl-sel", title: "Select for the agent" }));
    b.addEventListener("pointerenter", () => b.querySelector("video")?.play().catch(() => {}));
    b.addEventListener("pointerleave", () => b.querySelector("video")?.pause());
    return b;
  }));
  const picked = new Set();
  const pill = h("button", { type: "button", class: "gl-pill", hidden: true, onclick: () => { const ids = [...picked].sort(); const names = ids.map((i) => items[i].t); tell(el, { action: "select", label: `Use ${names.join(", ")}`, entities: { media: names }, ack: names.length === 1 ? `Got “${names[0]}”. Want variations of it, or should I drop it into the deck?` : `Got ${names.length}. I'll keep them in this order — say what they're for.` }); pill.textContent = `Sent ${names.length} ✓`; } });
  grid.addEventListener("click", (e) => {
    const b = e.target.closest(".gl-i"); if (!b) return;
    if (e.target.closest(".gl-sel")) { const i = +b.dataset.i; picked.has(i) ? picked.delete(i) : picked.add(i); b.classList.toggle("picked"); pill.hidden = !picked.size; pill.textContent = `Send ${picked.size} to agent →`; anim(pill, [{ transform: "scale(.9)" }, { transform: "none" }], { spring: "bouncy" }); return; }
    open(+b.dataset.i);
  });
  function open(i) {
    const from = grid.children[i];
    const lb = h("div", { class: "gl-lb", tabindex: "-1" });
    const it = items[i];
    const m = it.src ? (it.vid ? h("video", { src: it.vid, autoplay: true, muted: true, loop: true, playsinline: true, controls: true }) : h("img", { src: it.src, alt: it.t })) : genTile(it.gen);
    const close = () => { const r0 = from.getBoundingClientRect(), r1 = m.getBoundingClientRect(); anim(m, [{ transform: "none" }, { transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px) scale(${r0.width / r1.width})` }], { duration: 260, easing: "ease-in" }).onfinish = () => lb.remove(); anim(lb, [{ backgroundColor: "rgb(0 0 0 / .8)" }, { backgroundColor: "rgb(0 0 0 / 0)" }], { duration: 260 }); };
    const nav = (d) => { lb.remove(); open((i + d + items.length) % items.length); };
    lb.append(m, h("div", { class: "gl-cap" }, h("b", {}, it.t), h("span", {}, `${i + 1} / ${items.length}`)), h("button", { class: "gl-x", type: "button", onclick: close }, "✕"), h("button", { class: "gl-nav l", type: "button", onclick: () => nav(-1) }, "‹"), h("button", { class: "gl-nav r", type: "button", onclick: () => nav(1) }, "›"));
    lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
    lb.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); if (e.key === "ArrowRight") nav(1); if (e.key === "ArrowLeft") nav(-1); });
    let sx = null; lb.addEventListener("pointerdown", (e) => (sx = e.clientX)); lb.addEventListener("pointerup", (e) => { if (sx != null && Math.abs(e.clientX - sx) > 50) nav(e.clientX < sx ? 1 : -1); sx = null; });
    document.body.append(lb); lb.focus();
    const r0 = from.getBoundingClientRect(), r1 = m.getBoundingClientRect();
    anim(m, [{ transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px) scale(${r0.width / Math.max(1, r1.width)})` }, { transform: "none" }], { spring: "soft" });
  }
  const el = shell(a, "gallery", { verb: `${items.length} results · ${items.filter((x) => x.vid).length} videos`, status: "Grid", body: h("div", {}, grid, pill), foot: [act("Open all in " + a.name, { cls: "ghost", ack: `Opened all six in ${a.name} as one board, in the order shown here.` })], summary: `Browsed ${items.length} renders in ${a.name}` });
  return { el, async play() { stagger(grid.children, { gap: 50 }); const v = grid.querySelector("video"); if (v) { v.preload = "auto"; v.play().catch(() => {}); } }, spec: { kind: "gallery", app: a.id, items: items.map((x) => ({ title: x.t, video: !!x.vid })) } };
}
function genTile(i) { const c = h("canvas", { width: 320, height: 200 }); const g = c.getContext("2d"); const hue = (i * 57 + 190) % 360; const gr = g.createLinearGradient(0, 0, 320, 200); gr.addColorStop(0, `hsl(${hue} 50% 22%)`); gr.addColorStop(1, `hsl(${(hue + 50) % 360} 60% 55%)`); g.fillStyle = gr; g.fillRect(0, 0, 320, 200); g.fillStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.arc(160 + Math.sin(i) * 60, 100, 30 + i * 4, 0, 7); g.fill(); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 150, 320, 50); return c; }

/* ---------------- cad: drafting with the app's command line ---------------- */
function cadMake(a, r) {
  const ui = uiOf(a) || {};
  const W = 600, H = 300;
  const s = svg("svg", { class: "cad-sv", viewBox: `0 0 ${W} ${H}` });
  const grid = svg("g", { class: "cad-grid" }); for (let x = 0; x <= W; x += 20) grid.append(svg("line", { x1: x, y1: 0, x2: x, y2: H })); for (let y = 0; y <= H; y += 20) grid.append(svg("line", { x1: 0, y1: y, x2: W, y2: y })); s.append(grid);
  const geo = svg("g", { class: "cad-geo" }); s.append(geo);
  const dims = svg("g", { class: "cad-dim" }); s.append(dims);
  const cross = svg("g", { class: "cad-x" }, svg("line", { x1: -2000, y1: 0, x2: 2000, y2: 0 }), svg("line", { x1: 0, y1: -2000, x2: 0, y2: 2000 }), svg("rect", { x: -5, y: -5, width: 10, height: 10 }));
  s.append(cross);
  const cmd = h("div", { class: "cad-cmd" }, h("span", { class: "cad-hist" }, ""), h("span", { class: "cad-in" }, "Command: "));
  const revit = a.ui === "revit", free = a.ui === "freecad", fusion = a.ui === "fusion";
  const wallW = revit ? 8 : 1.6;
  const plan = [[60, 40], [420, 40], [420, 260], [60, 260], [60, 40]];
  const inner = [[240, 40], [240, 170], [420, 170]];
  const line = (pts, cls = "") => { const p = svg("polyline", { points: pts.map((q) => q.join(",")).join(" "), class: "cad-l " + cls, "stroke-width": wallW, pathLength: 1 }); geo.append(p); return p; };
  const dim = (x1, y1, x2, y2, label, off = -16) => { const g = svg("g"); const vert = x1 === x2; g.append(svg("line", { x1: vert ? x1 + off : x1, y1: vert ? y1 : y1 + off, x2: vert ? x2 + off : x2, y2: vert ? y2 : y2 + off }), svg("text", { x: vert ? x1 + off - 6 : (x1 + x2) / 2, y: vert ? (y1 + y2) / 2 : y1 + off - 4, "text-anchor": "middle", transform: vert ? `rotate(-90 ${x1 + off - 6} ${(y1 + y2) / 2})` : null }, label)); dims.append(g); anim(g, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); };
  const label = (x, y, t) => { const e = svg("text", { x, y, class: "cad-room", "text-anchor": "middle" }, t); geo.append(e); anim(e, [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { spring: "soft" }); };
  const setCmd = async (run, t) => { const inp = cmd.querySelector(".cad-in"); await typeText(inp, t, run, 40); };
  // user drafting: click to place points with 0.5 m snap and a live length tooltip
  let user = null; const tip = h("div", { class: "cad-tip", hidden: true });
  const sp = (e) => { const b = s.getBoundingClientRect(); const x = Math.round(((e.clientX - b.left) / b.width) * W / 10) * 10, y = Math.round(((e.clientY - b.top) / b.height) * H / 10) * 10; return [x, y]; };
  s.addEventListener("pointermove", (e) => { const [x, y] = sp(e); cross.setAttribute("transform", `translate(${x} ${y})`); if (user) { const [px, py] = user.pts.at(-1); const ortho = Math.abs(x - px) > Math.abs(y - py) ? [x, py] : [px, y]; user.ghost.setAttribute("points", `${px},${py} ${ortho.join(",")}`); tip.hidden = false; tip.textContent = `${(Math.hypot(ortho[0] - px, ortho[1] - py) / 40).toFixed(2)} m  <${Math.abs(x - px) > Math.abs(y - py) ? "0" : "90"}°`; const b = s.getBoundingClientRect(); tip.style.translate = `${e.clientX - b.left + 12}px ${e.clientY - b.top + 12}px`; user.next = ortho; } });
  s.addEventListener("click", (e) => { const p = user?.next || sp(e); if (!user) { user = { pts: [p], line: svg("polyline", { class: "cad-l you", "stroke-width": wallW }), ghost: svg("polyline", { class: "cad-l ghost", "stroke-width": wallW }) }; geo.append(user.line, user.ghost); cmd.querySelector(".cad-in").textContent = "Command: LINE  Specify next point or [Undo]:"; } else { user.pts.push(p); user.line.setAttribute("points", user.pts.map((q) => q.join(",")).join(" ")); } });
  s.addEventListener("dblclick", () => { user = null; tip.hidden = true; cmd.querySelector(".cad-in").textContent = "Command: "; });
  const tabs = revit ? ["Architecture", "Structure", "Annotate", "View"] : free ? ["Sketcher", "Part Design", "TechDraw"] : fusion ? ["Solid", "Surface", "Sketch"] : ["Home", "Insert", "Annotate", "Parametric"];
  const status = h("span", { class: "ap-stat" }, free ? "Under-constrained: 6 DoF" : "ORTHO · SNAP · 1:50");
  const surface = appSurface(a, [appBar(tabs, [status]), h("div", { class: "cad-wrap" }, s, tip), cmd], { cls: "cad" + (free ? " free" : "") });
  const el = shell(a, "cad", { verb: revit ? "Drafted walls on Level 1" : free ? "Constrained a sketch" : "Drafted a floor plan", status: "Drafting", body: h("div", {}, surface, h("p", { class: "eu-hint" }, "Click to draft walls (ortho, 0.25 m snap). Double-click to end.")), foot: [act(revit ? "Create sheet" : free ? "Pad (extrude)" : "Plot to PDF", { cls: "primary", ack: revit ? "Placed the plan on a new A1 sheet at 1:50 with the dimensions you see." : free ? "Padded the sketch 3000 mm into a solid. The constraints still drive it." : "Plotted plan.pdf at 1:50 on A3, dimensions in mm." }), act("Export DXF", { cls: "ghost", ack: "Exported plan.dxf (mm, layers kept: WALLS, DIMS, TEXT)." })], summary: `Drafted a 2-room plan in ${a.name}` });
  return { el, async play(run) {
    await setCmd(run, revit ? "WA  Wall: Architectural · Generic 200mm" : free ? "Sketcher_CreatePolyline" : "PLINE  Specify start point:");
    const outer = line(plan); anim(outer, [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: 1400, easing: "cubic-bezier(.65,0,.35,1)" });
    await sleep(run, 1400);
    const inl = line(inner); anim(inl, [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: 700 });
    await sleep(run, 700);
    const door = svg("path", { d: "M240 120 A 40 40 0 0 1 280 160", class: "cad-l door", pathLength: 1 }); geo.append(door); anim(door, [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: 500 });
    cmd.querySelector(".cad-hist").textContent = cmd.querySelector(".cad-in").textContent.replace("Command: ", "") + "\n";
    await setCmd(run, free ? "Sketcher_ConstrainDistanceX 9000 mm" : "DIMLINEAR  Specify first extension line origin:");
    dim(60, 40, 420, 40, "9000"); await sleep(run, 250); dim(60, 40, 60, 260, "5500"); await sleep(run, 250); dim(240, 170, 420, 170, "4500", 16);
    label(150, 155, "LIVING  4.5 × 5.5"); label(330, 110, "BED  4.5 × 3.25"); label(330, 222, "BATH");
    if (free) { geo.classList.add("constrained"); status.textContent = "Fully constrained sketch"; anim(geo, [{ filter: "brightness(1)" }, { filter: "brightness(1.6)" }, { filter: "brightness(1)" }], { duration: 700 }); }
  }, spec: { kind: "cad", app: a.id, entities: ["polyline × 2", "arc (door)", "dimlinear × 3"], units: "mm", scale: "1:50" } };
}

/* ---------------- board: whiteboard with cursors and "make real" ---------------- */
function boardMake(a, r) {
  const ui = uiOf(a) || {};
  const ex = a.ui === "excalidraw";
  const W = 600, H = 300;
  const s = svg("svg", { class: "bd-sv" + (ex ? " rough" : ""), viewBox: `0 0 ${W} ${H}` });
  const cur = (name, c) => h("div", { class: "bd-cur", style: { "--c": c } }, svg("svg", { viewBox: "0 0 16 16" }, svg("path", { d: "M1 1 L1 13 L4.5 9.5 L7 15 L9 14 L6.5 8.5 L11.5 8.5 Z" })), h("span", {}, name));
  const agent = cur("Agent", "#f97316"), you = cur("You", ui.acc || "#2f80ed");
  const wrap = h("div", { class: "bd" + (ex ? " ex" : "") }, s, agent, you);
  const TOOLS = [["↖", "Select"], ["✋", "Hand"], ["✎", "Draw"], ["▭", "Rectangle"], ["◯", "Ellipse"], ["→", "Arrow"], ["T", "Text"], ["🗒", "Sticky note"]];
  let mode = "Draw";
  const tool = h("div", { class: "bd-tools", role: "toolbar", "aria-label": "Tools" }, TOOLS.map(([t, name], i) => h("button", { type: "button", class: i === 2 ? "on" : "", "aria-label": name, title: name, "aria-pressed": i === 2 ? "true" : "false", onclick: (e) => { mode = name; tool.querySelectorAll("button").forEach((b) => { const on = b === e.currentTarget; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }); s.dataset.mode = name; } }, t)));
  const real = h("button", { class: "bd-real", type: "button" }, a.ui === "tldraw" ? "Make Real" : ex ? "Wireframe → code" : "Generate");
  const jit = (pts) => pts.map(([x, y]) => [x + (Math.random() - 0.5) * (ex ? 2.6 : 0.6), y + (Math.random() - 0.5) * (ex ? 2.6 : 0.6)]);
  const path = (pts, close) => { const p = jit(pts); return "M" + p.map((q) => q.join(" ")).join(" L") + (close ? " Z" : ""); };
  const rectP = (x, y, w, hh) => path([[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]], true);
  const shapes = [
    { d: rectP(40, 50, 150, 90), t: [115, 100, "Lecture: USD"], c: "#1d1d1d" },
    { d: rectP(240, 30, 140, 70), t: [310, 70, "LIVRPS"], c: "#1d1d1d", fill: ex ? "#ffec99" : "#fff3bf" },
    { d: rectP(240, 150, 140, 70), t: [310, 190, "Layers"], c: "#1d1d1d" },
    { d: rectP(430, 90, 130, 80), t: [495, 133, "Anki deck"], c: "#1971c2", fill: ex ? "#a5d8ff" : "#dbe4ff" },
    { d: "M190 95 C 210 80, 220 70, 238 66", arrow: true }, { d: "M190 100 C 215 130, 222 170, 238 182", arrow: true }, { d: "M380 66 C 410 80, 420 100, 428 120", arrow: true }, { d: "M380 186 C 405 170, 415 160, 428 150", arrow: true },
  ];
  const els = shapes.map((sh) => {
    const g = svg("g", { class: "bd-sh" });
    const p = svg("path", { d: sh.d, class: sh.arrow ? "bd-ar" : "bd-box", fill: sh.fill || "none", stroke: sh.c || "#1d1d1d", pathLength: 1 }); g.append(p);
    if (ex) g.append(svg("path", { d: sh.d.replace(/[\d.]+/g, (n) => (+n + (Math.random() - 0.5) * 2.2).toFixed(1)), class: sh.arrow ? "bd-ar ghost" : "bd-box ghost", fill: "none", stroke: sh.c || "#1d1d1d", pathLength: 1 }));
    if (sh.arrow) { const m = sh.d.match(/([\d.]+) ([\d.]+)$/); g.append(svg("path", { d: `M${+m[1] - 9} ${+m[2] - 6} L${m[1]} ${m[2]} L${+m[1] - 10} ${+m[2] + 4}`, class: "bd-ar", fill: "none", stroke: "#1d1d1d" })); }
    if (sh.t) g.append(svg("text", { x: sh.t[0], y: sh.t[1], "text-anchor": "middle", class: "bd-tx" }, sh.t[2]));
    g.style.opacity = 0; s.append(g); return { g, p, sh };
  });
  const moveCur = (c, x, y, ms = 500) => { const b = wrap.getBoundingClientRect(); const px = (x / W) * b.width, py = (y / H) * b.height; anim(c, [{ translate: c.style.translate || "0px 0px" }, { translate: `${px}px ${py}px` }], { duration: ms, easing: "cubic-bezier(.4,0,.2,1)" }); c.style.translate = `${px}px ${py}px`; };
  // you can draw freehand
  let pen = null;
  const pt = (e) => { const b = s.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * W, ((e.clientY - b.top) / b.height) * H]; };
  // Each tool really draws; whatever you add is context the agent reads (it says what it understood).
  let p0 = null, mine = 0;
  const shapeOf = (x0, y0, x, y) => mode === "Rectangle" ? `M${x0} ${y0} H${x} V${y} H${x0} Z` : mode === "Ellipse" ? `M${(x0 + x) / 2} ${y0} A${Math.abs(x - x0) / 2} ${Math.abs(y - y0) / 2} 0 1 0 ${(x0 + x) / 2} ${y} A${Math.abs(x - x0) / 2} ${Math.abs(y - y0) / 2} 0 1 0 ${(x0 + x) / 2} ${y0}` : `M${x0} ${y0} L${x} ${y} M${x - 10} ${y - 6} L${x} ${y} L${x - 8} ${y + 7}`;
  s.addEventListener("pointerdown", (e) => {
    const [x, y] = pt(e);
    if (mode === "Select" || mode === "Hand") { const g = e.target.closest?.(".bd-sh"); if (g && mode === "Select") { s.querySelectorAll(".bd-sh.sel").forEach((n) => n.classList.remove("sel")); g.classList.add("sel"); const t = g.querySelector("text")?.textContent || "an arrow"; tell(el, { action: "select", label: `This: ${t}`, entities: { shape: t }, ack: t === "an arrow" ? "That arrow says one thing depends on the other. Want me to label it?" : `“${t}” — I'll make that the focus of the generated UI.` }); } return; }
    if (mode === "Text" || mode === "Sticky note") { const label = mode === "Text" ? "Quiz me" : "Due Friday"; const n = svg("text", { x, y, class: "bd-tx mine", fill: ui.acc || "#2f80ed" }, label); if (mode === "Sticky note") s.append(svg("rect", { x: x - 6, y: y - 16, width: 86, height: 24, rx: 3, fill: "#fff3bf", class: "mine" })); s.append(n); mine++; tell(el, { action: "annotate", label: `Added “${label}”`, entities: { note: label }, ack: label === "Quiz me" ? "Noted — Make Real will end in a 12-card quiz." : "Noted — I'll schedule the deck to finish by Friday." }); return; }
    s.setPointerCapture(e.pointerId); p0 = [x, y];
    pen = svg("path", { d: `M${x} ${y}`, class: "bd-pen", stroke: ui.acc || "#2f80ed", fill: "none" }); s.append(pen);
  });
  s.addEventListener("pointermove", (e) => { const [x, y] = pt(e); const b = wrap.getBoundingClientRect(); you.style.translate = `${(x / W) * b.width}px ${(y / H) * b.height}px`; if (!pen) return; if (mode === "Draw") pen.setAttribute("d", pen.getAttribute("d") + ` L${x.toFixed(1)} ${y.toFixed(1)}`); else pen.setAttribute("d", shapeOf(p0[0], p0[1], x, y)); });
  s.addEventListener("pointerup", (e) => { if (!pen) return; const [x, y] = pt(e); const big = Math.hypot(x - p0[0], y - p0[1]) > 18; if (big) { mine++; tell(el, { action: "draw", label: `Drew a ${mode.toLowerCase()}`, entities: { shape: `${mode.toLowerCase()}-${mine}` }, quiet: true }); } else pen.remove(); pen = null; });
  real.onclick = async () => {
    real.disabled = true; real.textContent = "Generating…";
    const out = h("div", { class: "bd-out" }, h("div", { class: "bd-win" }, h("div", { class: "bd-wb" }, h("i"), h("i"), h("i")), h("div", { class: "bd-ui" }, h("b", {}, "USD composition"), h("div", { class: "bd-chips" }, ..."L I V R P S".split(" ").map((c) => h("span", {}, c))), h("div", { class: "bd-bar" }, h("i")), h("button", { type: "button" }, "Start review (12 cards)"))));
    await new Promise((res) => setTimeout(res, 900));
    wrap.append(out); anim(out, [{ opacity: 0, transform: "scale(.85) translateY(10px)" }, { opacity: 1, transform: "none" }], { spring: "bouncy" });
    real.textContent = "✓ Made real"; burst(real);
    tell(el, { action: "make_real", label: "Make it real", entities: { board: "study-map" }, ack: mine ? `Built it, including your ${mine} addition${mine > 1 ? "s" : ""}. The quiz button runs the Anki deck.` : "Built a working page from the map. The quiz button runs the Anki deck." });
  };
  const surface = appSurface(a, [h("div", { class: "bd-frame" }, wrap, tool, real)], { cls: "board" });
  const el = shell(a, "board", { verb: "Sketching with you", status: "2 here", body: h("div", {}, surface, h("p", { class: "eu-hint" }, "Draw anywhere. The agent lays out the study map; Make Real turns it into a working UI.")), foot: [act("Export .tldr", { cls: "ghost", ack: "Saved study-map.tldr — opening it restores every shape and your strokes." }), act("Copy as PNG", { cls: "ghost", ack: "Copied a 2× PNG of the board to your clipboard.", done: "Copied ✓" })], summary: `Built a study map in ${a.name}` });
  return { el, async play(run) {
    await sleep(run, 200);
    for (const e of els) {
      const bb = e.sh.t || [300, 120]; moveCur(agent, bb[0] + 30, bb[1] + 10, 380); await sleep(run, 380);
      e.g.style.opacity = 1; e.g.querySelectorAll("path").forEach((p) => anim(p, [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: e.sh.arrow ? 300 : 520 }));
      const tx = e.g.querySelector("text"); if (tx) anim(tx, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 350 });
      await sleep(run, e.sh.arrow ? 220 : 420);
    }
    moveCur(you, 520, 250, 700);
  }, spec: { kind: "board", app: a.id, shapes: shapes.length, cursors: ["you", "agent"], action: a.ui === "tldraw" ? "make real" : "generate" } };
}

/* ---------------- daw: clips + piano roll, playable ---------------- */
function dawMake(a, r) {
  const ui = uiOf(a) || {};
  const chords = [["Am", [57, 60, 64]], ["F", [53, 57, 60]], ["C", [48, 52, 55]], ["G", [55, 59, 62]]];
  const roll = h("div", { class: "pr" });
  const keys = h("div", { class: "pr-keys" }, Array.from({ length: 24 }, (_, i) => h("i", { class: [1, 3, 6, 8, 10].includes((71 - i) % 12) ? "b" : "" })));
  const grid = h("div", { class: "pr-grid" });
  const ph = h("i", { class: "pr-ph" });
  roll.append(keys, h("div", { class: "pr-area" }, grid, ph));
  const scenes = h("div", { class: "sv" }, ["Drums", "Bass", "Keys", "Vox"].map((t, ti) => h("div", { class: "sv-col" }, h("b", {}, t), [0, 1, 2].map((s) => h("button", { type: "button", "aria-label": (ti + s) % 3 === 2 ? `Empty ${t} slot ${s + 1}` : `${t} ${s + 1}`, class: "sv-clip" + ((ti + s) % 3 === 2 ? " empty" : ""), style: { "--c": ["#ff764d", "#ffb532", "#7ad1ff", "#b388ff"][ti] } }, h("i"), (ti + s) % 3 === 2 ? "" : `${t} ${s + 1}`)))));
  const notes = [];
  const place = (pitch, step, len) => { const n = h("i", { class: "pr-n", style: { left: `${(step / 16) * 100}%`, width: `${(len / 16) * 100 - 0.6}%`, top: `${((71 - pitch) / 24) * 100}%` } }); grid.append(n); notes.push({ n, pitch, step, len }); return n; };
  let ctx = null, playing = false;
  const play = h("button", { class: "eu-btn", type: "button" }, "▶ Play");
  play.onclick = () => {
    if (playing) return; playing = true; play.textContent = "❚❚ Playing"; play.setAttribute("aria-pressed", "true");
    if (!notes.length) for (let c = 0; c < 4; c++) for (const p of chords[c][1]) place(p, c * 4, 3.6);
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime + 0.05, spb = 60 / 96 / 4;
    for (const { pitch, step, len } of notes) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; o.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12); g.gain.setValueAtTime(0, t0 + step * spb); g.gain.linearRampToValueAtTime(0.08, t0 + step * spb + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (step + len) * spb); o.connect(g).connect(ctx.destination); o.start(t0 + step * spb); o.stop(t0 + (step + len) * spb + 0.05); }
    anim(ph, [{ left: "0%" }, { left: "100%" }], { duration: 16 * spb * 1000, easing: "linear" }).onfinish = () => { playing = false; play.textContent = "▶ Play"; play.setAttribute("aria-pressed", "false"); };
  };
  scenes.addEventListener("click", (e) => {
    const c = e.target.closest(".sv-clip"); if (!c) return;
    if (c.classList.contains("empty")) { const lbl = c.getAttribute("aria-label").replace("Empty ", ""); tell(el, { action: "fill", label: `Write something for ${lbl}`, entities: { clip: lbl }, ack: `Writing a ${lbl.split(" ")[0].toLowerCase()} part over Am–F–C–G for that slot. It'll appear here in a few seconds.` }); c.classList.remove("empty"); c.classList.add("on", "pending"); c.append(lbl); return; }
    c.classList.toggle("on");
  });
  const surface = appSurface(a, [appBar(a.ui === "ableton" ? ["Session", "Arrangement", "Clip"] : a.ui === "fl" ? ["Playlist", "Piano roll", "Mixer"] : [a.name, "Tracks", "Editor"], [h("span", { class: "ap-stat" }, "96 BPM · A minor"), play]), h("div", { class: "daw" }, scenes, roll)], { cls: "daw-w" });
  const el = shell(a, "daw", { verb: "Wrote a chord progression", status: "Recording", body: surface, foot: [act("Bounce stems", { cls: "primary", ack: "Bouncing 4 stems (Drums, Bass, Keys, Vox) at 48 kHz/24-bit. I'll drop them in Downloads/am-f-c-g/." }), act("Export MIDI", { cls: "ghost", ack: "Saved progression.mid — Am, F, C, G, one bar each at 96 BPM." })], summary: `Wrote Am–F–C–G in ${a.name}` });
  return { el, async play(run) { stagger(scenes.querySelectorAll(".sv-clip"), { gap: 30 }); for (let c = 0; c < 4; c++) { for (const p of chords[c][1]) { const n = place(p, c * 4, 3.6); anim(n, [{ transform: "scaleX(0)", transformOrigin: "left" }, { transform: "none" }], { spring: "snappy" }); await sleep(run, 70); } await sleep(run, 160); } }, spec: { kind: "daw", app: a.id, bpm: 96, key: "A minor", progression: chords.map((c) => c[0]) } };
}

/* ---------------- flash: Anki review (default learning steps 1m 10m) and Quizlet flip ---------------- */
const DECKS = {
  usd: [["In USD composition, what does LIVRPS order?", "Strength of opinions: Local, Inherits, VariantSets, References, Payloads, Specializes."], ["What does a payload let you do?", "Defer loading a prim's contents until you ask for them."]],
  blender: [["Shortcut for the Clay Strips brush?", "C"], ["What does Dyntopo change?", "It adds and removes faces under the brush as you sculpt."]],
  unreal: [["Which PCG node keeps points by density?", "Density Filter."], ["Lumen is…", "UE5's dynamic global illumination and reflections."]],
  default: [["What is the forgetting curve?", "Memory decays fast after learning unless reviewed at growing intervals."], ["Who described it?", "Hermann Ebbinghaus, 1885."]],
};
function flashMake(a, r) {
  const ui = uiOf(a) || {};
  const quiz = a.ui === "quizlet";
  const deck = DECKS[/usd|isaac|omni/i.test(a.name) ? "usd" : /blender/i.test(a.name) ? "blender" : /unreal/i.test(a.name) ? "unreal" : "default"];
  let i = 0, shown = false, done = 0;
  const counts = h("div", { class: "fc-counts" }, h("span", { class: "n" }, "12"), " + ", h("span", { class: "l" }, "3"), " + ", h("span", { class: "r" }, "41"));
  const card = h("div", { class: "fc-card" + (quiz ? " flip" : "") }, h("div", { class: "fc-f" }), h("div", { class: "fc-b" }));
  const btns = h("div", { class: "fc-btns" });
  const render = () => {
    const [q, ans] = deck[i % deck.length];
    card.querySelector(".fc-f").textContent = q; card.querySelector(".fc-b").replaceChildren(h("div", { class: "fc-q" }, q), h("hr"), h("div", {}, ans));
    shown = false; card.classList.remove("shown");
    btns.replaceChildren(h("button", { class: "fc-show", type: "button", onclick: show }, quiz ? "Flip" : "Show Answer"));
  };
  const show = () => {
    shown = true; card.classList.add("shown");
    if (quiz) anim(card, [{ transform: "rotateY(0)" }, { transform: "rotateY(180deg)" }], { spring: "soft" });
    const opts = quiz ? [["Still learning", "#ff983a", 0], ["Know", "#18ae79", 2]] : [["Again", "#e53935", "<1m"], ["Hard", "#7a7a7a", "6m"], ["Good", "#43a047", "10m"], ["Easy", "#1e88e5", "4d"]];
    btns.replaceChildren(...opts.map(([n, c, iv]) => h("button", { type: "button", class: "fc-a", style: { "--c": c }, onclick: () => answer(n) }, quiz ? null : h("small", {}, iv), n)));
    stagger(btns.children, { gap: 40, y: 6 });
  };
  const answer = (n) => {
    done++;
    const dir = n === "Again" || n === "Still learning" ? -1 : 1;
    anim(card, [{ transform: card.classList.contains("flip") && shown ? "rotateY(180deg)" : "none", opacity: 1 }, { transform: `translateX(${dir * 120}px) rotate(${dir * 8}deg)`, opacity: 0 }], { duration: 260, easing: "ease-in" }).onfinish = () => { i++; render(); anim(card, [{ transform: "translateY(10px) scale(.96)", opacity: 0 }, { transform: "none", opacity: 1 }], { spring: "soft" }); };
    const c = counts.querySelector(dir < 0 ? ".l" : ".r"); c.textContent = Math.max(0, +c.textContent + (dir < 0 ? 1 : -1));
    heat.children[27 - (done % 5)]?.classList.add("on");
  };
  const heat = h("div", { class: "fc-heat" }, Array.from({ length: 28 }, (_, k) => h("i", { style: { "--o": [0.1, 0.3, 0.6, 0.9][Math.floor((Math.sin(k * 1.7) + 1) * 2) % 4] } })));
  render();
  const surface = appSurface(a, [appBar(quiz ? ["Flashcards", "Learn", "Test", "Match"] : ["Decks", "Add", "Browse", "Stats"], [counts]), h("div", { class: "fc" }, card, btns), h("div", { class: "row between" }, h("span", { class: "eu-hint" }, quiz ? "Made from the lecture you watched" : "FSRS · desired retention 0.90"), heat)], { cls: "flash" + (quiz ? " quiz" : "") });
  const el = shell(a, "flash", { verb: quiz ? "Made a study set" : "Due now: 56 cards", status: "Review", body: surface, foot: [act("Add from selection", { cls: "ghost", ack: "Made 4 cards from your highlighted passage. They're due tomorrow with the rest." }), act("Sync", { cls: "ghost", ack: "Synced: 56 due, 3 new from today's highlights. Nothing conflicted.", done: "Synced ✓" })], summary: `Reviewed ${deck.length} cards in ${a.name}` });
  return { el, async play(run) { anim(card, [{ transform: "translateY(12px) scale(.96)", opacity: 0 }, { transform: "none", opacity: 1 }], { spring: "bouncy" }); }, auto: async (run) => { await run.wait(600); show(); await run.wait(900); answer(quiz ? "Know" : "Good"); }, spec: { kind: "flash", app: a.id, deck: deck.map((d) => d[0]), scheduler: quiz ? "Quizlet Learn" : "FSRS", buttons: quiz ? ["Still learning", "Know"] : ["Again <1m", "Hard 6m", "Good 10m", "Easy 4d"] } };
}

/* ---------------- stage: OpenUSD layer stack + strongest opinion ---------------- */
function stageMake(a, r) {
  const prims = [["/World", 0], ["Robot", 1, "Xform"], ["base_link", 2, "Mesh"], ["arm", 2, "Xform"], ["gripper", 3, "Mesh"], ["Lights", 1, "Scope"], ["DomeLight", 2, "DomeLight"]];
  const tree = h("ul", { class: "us-tree" }, prims.map(([n, d, t], i) => h("li", { style: { "--d": d }, class: i === 4 ? "sel" : "" }, h("span", { class: "us-t" }, t || "def"), n)));
  const layers = [["session layer", null], ["shot_042.usda", "#d94b3d"], ["anim.usda", null], ["robot.usd (reference)", "#3d7ad9"], ["robot_payload.usdc", "#7a7a7a"]];
  const stack = h("ol", { class: "us-stack" }, layers.map(([n, c], i) => h("li", { "data-i": i }, h("b", {}, n), h("span", { class: "us-op", style: { "--c": c || "transparent" } }, c ? "color" : "—"))));
  const result = h("div", { class: "us-res" });
  const variant = seg(["red", "blue", "steel"], (k) => { const cols = ["#d94b3d", "#3d7ad9", "#9aa3ad"]; stack.children[1].querySelector(".us-op").style.setProperty("--c", cols[k]); resolve(); }, 0);
  let muted = new Set();
  stack.addEventListener("click", (e) => { const li = e.target.closest("li"); if (!li) return; const i = +li.dataset.i; muted.has(i) ? muted.delete(i) : muted.add(i); li.classList.toggle("muted"); resolve(); });
  function resolve() {
    const win = [...stack.children].findIndex((li, i) => !muted.has(i) && li.querySelector(".us-op").textContent !== "—");
    [...stack.children].forEach((li, i) => li.classList.toggle("us-win", i === win));
    const c = win < 0 ? "none" : stack.children[win].querySelector(".us-op").style.getPropertyValue("--c");
    result.replaceChildren(h("code", {}, "/World/Robot/arm/gripper.primvars:displayColor"), h("span", { class: "us-sw", style: { background: c } }), h("span", {}, win < 0 ? "fallback" : `from ${layers[win][0]}`));
    anim(result, [{ transform: "scale(.98)" }, { transform: "none" }], { spring: "bouncy" });
  }
  resolve();
  const surface = appSurface(a, [appBar(["Stage", "Layers", "Property"], [h("span", { class: "ap-stat" }, "usdview · Hydra Storm")]), h("div", { class: "us" }, tree, h("div", {}, h("span", { class: "ap-lbl" }, "Layer stack · strongest first · tap to mute"), stack, h("div", { class: "row" }, h("span", { class: "eu-hint" }, "variantSet “color”"), variant), result))], { cls: "stage" });
  const el = shell(a, "stage", { verb: "Resolved a prim's opinions", status: "Composed", body: surface, foot: [act("Flatten to .usdc", { cls: "primary", ack: "Flattened the stage to shot_042_flat.usdc. The gripper keeps the red variant you picked." }), act("Open in usdview", { cls: "ghost", ack: "Opened usdview on the gripper prim, with the layer stack shown." })], summary: `Traced displayColor through ${layers.length} layers in ${a.name}` });
  return { el, async play() { stagger(tree.children, { gap: 50 }); stagger(stack.children, { gap: 70, delay: 200 }); }, spec: { kind: "stage", app: a.id, prim: "/World/Robot/arm/gripper", attribute: "primvars:displayColor", layers: layers.map((l) => l[0]), rule: "LIVRPS" } };
}

/* ---------------- anatomy: the figures, as recorded loops ---------------- */
function anatomyMake(a, r) {
  const vid = h("video", { muted: true, loop: true, playsinline: true, autoplay: true, src: "media/anatomy/raptor-engine.mp4", poster: "media/anatomy/raptor-engine.jpg" });
  const cap = h("div", { class: "an-cap" }, h("b", {}, "Fig 1"), h("span", {}, "raptor engine"));
  const chips = h("div", { class: "row wrap" }, ANATOMY.map((n, i) => h("button", { type: "button", class: "ap-chip" + (i === 0 ? " on" : ""), onclick: (e) => { chips.querySelectorAll(".ap-chip").forEach((c) => c.classList.toggle("on", c === e.currentTarget)); anim(vid, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = () => { vid.src = `media/anatomy/${n}.mp4`; vid.poster = `media/anatomy/${n}.jpg`; vid.play().catch(() => {}); cap.lastChild.textContent = n.replace(/-/g, " "); cap.firstChild.textContent = `Fig ${i + 1}`; anim(vid, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 }); }; } }, n.replace(/-/g, " "))));
  const surface = appSurface(a, [h("div", { class: "an" }, vid, cap), chips], { cls: "anatomy" });
  const el = shell(a, "anatomy", { verb: "Built a working figure", status: "SVG + WebGL", body: h("div", {}, surface, h("p", { class: "eu-hint" }, "Loops recorded from the examples in wheresryan22/anatomy (MIT).")), foot: [h("a", { class: "eu-btn primary", href: "https://skills.wheresryan.sh/anatomy", target: "_blank", rel: "noopener" }, "Open interactive"), h("a", { class: "eu-btn ghost", href: "https://github.com/kvnloo/anatomy", target: "_blank", rel: "noopener" }, "kvnloo/anatomy")], summary: "Explained an idea as a working machine" });
  return { el, async play() { vid.play().catch(() => {}); }, spec: { kind: "anatomy", app: a.id, figures: ANATOMY, source: "github.com/wheresryan22/anatomy" } };
}

export const KINDS_C = {
  nodes: { label: "Node graph", verb: () => "Built a graph", make: nodesMake },
  timeline: { label: "Voice + mark edit", verb: () => "Edited by voice", make: timelineMake },
  review: { label: "Frame review", verb: () => "Review with marks", make: reviewMake },
  layers: { label: "Generative layers", verb: () => "Generative fill", make: layersMake },
  gallery: { label: "Media gallery", verb: () => "Gallery", make: galleryMake },
  cad: { label: "CAD drafting", verb: () => "Drafted a plan", make: cadMake },
  board: { label: "Whiteboard", verb: () => "Sketching", make: boardMake },
  daw: { label: "DAW", verb: () => "Wrote a progression", make: dawMake },
  flash: { label: "Flashcards", verb: () => "Due now", make: flashMake },
  stage: { label: "USD stage", verb: () => "Resolved opinions", make: stageMake },
  anatomy: { label: "Anatomy figure", verb: () => "Built a figure", make: anatomyMake },
};
