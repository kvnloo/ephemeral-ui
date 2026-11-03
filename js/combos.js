// Combos: cross-app workflows as a puzzle. Snap the apps into order; when the chain closes, context
// flows piece to piece and each piece shows the one thing you need to know at that moment.
import { h, anim, Run, motion } from "./motion.js";
import { burst } from "./shell.js";

export const COMBOS = [
  { id: "deal", label: "Stalled deal → shipped feature", tag: "Sales × Eng", pieces: [
    ["hubspot", "Deal stalled", "Acme · $48k · blocker: SSO", "Acme's champion asked for SSO twice in 9 days."],
    ["google-ads", "Checked search terms", "‘SAML login’ CTR 4.1%", "SSO is your best-converting keyword this month."],
    ["github", "Opened PR #212", "preview + checks green", "PR #212 is green; one review left (Priya)."],
    ["maze", "Ran an unmoderated test", "5 of 6 done in < 40 s", "One tester missed the IdP field; the copy is fixed."],
    ["gmail", "Drafted the follow-up", "video + PR link", "Send now: Acme opened your last email 3 minutes ago."]] },
  { id: "crash", label: "Crash → fix → ship → tell", tag: "On-call", pieces: [
    ["sentry", "New issue · 412 users", "TypeError in checkout.ts:88", "Started 14 min after deploy 3f2c1a9."],
    ["linear", "Filed ENG-482 · Urgent", "owner: Sam · cycle 31", "Sam already touched checkout.ts today."],
    ["github", "Fix PR #219", "1-line null guard + test", "The test reproduces the Sentry stack exactly."],
    ["vercel", "Promoted to production", "p95 back to 182 ms", "Error rate is 0 for 6 minutes."],
    ["slack", "Posted in #incidents", "timeline + root cause", "Resolved in 23 minutes; no customer emails yet."]] },
  { id: "robot", label: "Photo → 3D → USD → robot sim", tag: "3D × Robotics", pieces: [
    ["trellis", "Image → 3D", "mug.glb · 18k tris", "Watertight mesh; handle thickness 6 mm."],
    ["blender", "Cleaned + scaled", "real-world 9.5 cm", "Origin moved to the base so it rests on tables."],
    ["openusd", "Wrapped as USD asset", "mug.usd + physics schema", "Collision approximated as convex decomposition (8 hulls)."],
    ["isaac-sim", "Grasp training", "16 envs · 94% success", "Fails only when the handle faces away; add that pose to the curriculum."]] },
  { id: "trailer", label: "Sculpt → level → trailer → publish", tag: "Game dev", pieces: [
    ["blender", "Sculpted the hero prop", "relic.glb · baked normals", "Normal map baked at 4k; 2.1k tris after decimate."],
    ["unreal-engine", "Dressed the level", "PCG ruins · Lumen", "Frame time 11.8 ms on the target GPU."],
    ["davinci-resolve", "Cut the trailer", "0:42 · graded", "Beat drop lands on the relic reveal at 0:27."],
    ["youtube-studio", "Scheduled the premiere", "Fri 10:00 PT", "Your audience peaks Fri 9–11 PT; thumbnail B tested +18% CTR."]] },
  { id: "flight", label: "Flight track → reconstruction → film", tag: "Ours", pieces: [
    ["god-s-eye-view", "Pulled the ADS-B track", "N722BD · 1 Hz · 14 min", "Last 40 s show a 2,300 ft/min descent."],
    ["cesium", "Placed it on terrain", "3D Tiles · photogrammetry", "Approach crosses the ridge 180 ft lower than the glide path."],
    ["fframestudio", "Cut the explainer", "shots: chase, cockpit, map", "The cockpit shot needs the altitude readout pinned."],
    ["x", "Drafted the thread", "6 posts + 0:58 video", "Lead with the ridge clip; it carries the finding."]] },
  { id: "study", label: "Lecture → notes → cards → map", tag: "Learning", pieces: [
    ["youtube", "Watched a USD lecture", "47 min · transcript", "Three ideas matter: layers, LIVRPS, payloads."],
    ["obsidian", "Wrote atomic notes", "6 notes · linked", "‘Payload’ links to your Isaac Sim note from last week."],
    ["anki", "Made 12 cards", "cloze + image occlusion", "First review due tonight; 2 min."],
    ["excalidraw", "Drew the concept map", "layers → opinions", "The arrow from Variants to Payloads is the one people get wrong."]] },
  { id: "capture", label: "Show the bug → fix → walkthrough", tag: "Dev flow", pieces: [
    ["scrawl", "Recorded the bug", "contact sheet · 3 marks", "Mark ② shows the button overlapping the composer."],
    ["t3-code", "Agent fixed it", "2 files · tests pass", "Fix is a min-width: 0 on the grid column."],
    ["github", "PR #88 opened", "before/after shots", "Mobile 390 px now has no horizontal overflow."],
    ["loom", "Recorded a 40 s walkthrough", "linked in the PR", "Reviewers watch these 3× more than they read diffs."]] },
  { id: "design", label: "Design → build → preview → sign-off", tag: "Product", pieces: [
    ["figma", "Picked frame ‘Checkout v3’", "tokens + 4 states", "The error state has no design yet."],
    ["github", "Generated the component", "Checkout.tsx · stories", "Agent added the missing error state from your tokens."],
    ["vercel", "Preview ready", "checkout-v3.vercel.app", "Lighthouse 98; CLS 0."],
    ["frame-io", "Sent for sign-off", "3 reviewers", "Mina approved; waiting on legal for the copy."]] },
];

const store = { xp: +(localStorage.getItem("eu-xp") || 0), best: JSON.parse(localStorage.getItem("eu-best") || "{}") };
const level = (xp) => Math.floor(Math.sqrt(xp / 40)) + 1;

/** Jigsaw outline. left/right: -1 blank, 0 flat, 1 tab. Horizontal pieces connect left↔right; vertical ones top↔bottom. */
function piecePath(w, hh, a, b, vert) {
  const t = 13, k = t * 1.6;
  if (!vert) {
    const m = hh / 2;
    const right = b ? `L${w} ${m - t} C ${w + b * k} ${m - t * 1.4}, ${w + b * k} ${m + t * 1.4}, ${w} ${m + t} ` : "";
    const left = a ? `L0 ${m + t} C ${-a * k} ${m + t * 1.4}, ${-a * k} ${m - t * 1.4}, 0 ${m - t} ` : "";
    return `M0 0 L${w} 0 ${right}L${w} ${hh} L0 ${hh} ${left}Z`;
  }
  const m = w / 2;
  const top = a ? `L${m - t} 0 C ${m - t * 1.4} ${-a * k}, ${m + t * 1.4} ${-a * k}, ${m + t} 0 ` : "";
  const bottom = b ? `L${m + t} ${hh} C ${m + t * 1.4} ${hh + b * k}, ${m - t * 1.4} ${hh + b * k}, ${m - t} ${hh} ` : "";
  return `M0 0 ${top}L${w} 0 L${w} ${hh} ${bottom}L0 ${hh} Z`;
}

export function buildCombos({ catalog, icon, openDrawer }) {
  const root = document.getElementById("combos");
  if (!root) return;
  const tabs = root.querySelector(".cb-tabs"), board = root.querySelector(".cb-board"), tray = root.querySelector(".cb-tray"), hud = root.querySelector(".cb-hud"), out = root.querySelector(".cb-out");
  let cur = 0, placed = [], combo = 0, startedAt = 0, running = null, touched = false;
  const vert = () => board.clientWidth < 640;
  tabs.replaceChildren(...COMBOS.map((c, i) => h("button", { type: "button", class: "cb-tab", "aria-pressed": i === 0 ? "true" : "false", onclick: () => load(i) }, h("span", { class: "cb-icos" }, c.pieces.slice(0, 4).map(([id]) => catalog.byId[id] && icon(catalog.byId[id], 16))), h("b", {}, c.label), h("em", {}, c.tag), h("i", { class: "cb-stars" }, "★".repeat(store.best[c.id] || 0)))));
  function drawHud() {
    const lv = level(store.xp), lo = 40 * (lv - 1) ** 2, hi = 40 * lv ** 2;
    hud.replaceChildren(h("span", { class: "cb-lv" }, `Lv ${lv}`), h("span", { class: "cb-xp" }, h("i", { style: { width: `${((store.xp - lo) / (hi - lo)) * 100}%` } })), h("span", { class: "cb-pts" }, `${store.xp} xp`), h("span", { class: "cb-combo" + (combo > 1 ? " on" : "") }, `×${combo}`));
  }
  function pieceEl(appId, i, n, data) {
    const a = catalog.byId[appId];
    const V = vert(), W = V ? 280 : 168, H = V ? 74 : 104;
    const L = i === 0 ? 0 : -1, R = i === n - 1 ? 0 : 1;
    const svgNS = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(svgNS, "svg"); s.setAttribute("viewBox", `-16 -16 ${W + 32} ${H + 32}`); s.setAttribute("class", "cb-shape");
    const p = document.createElementNS(svgNS, "path"); p.setAttribute("d", piecePath(W, H, L, R, V)); s.append(p);
    const el = h("div", { class: "cb-p", "data-app": appId, style: { "--a": a?.hex || "var(--h-mutedFg)", "--w": `${W}px`, "--hh": `${H}px` } }, s, h("div", { class: "cb-pc" }, icon(a, 26), h("div", {}, h("b", {}, a.name), h("span", {}, data ? data[1] : a.cat))), h("div", { class: "cb-focus" }));
    return el;
  }
  function load(i) {
    running?.stop(); running = null;
    cur = i; placed = []; combo = 0; startedAt = 0;
    tabs.querySelectorAll(".cb-tab").forEach((b, j) => b.setAttribute("aria-pressed", j === i ? "true" : "false"));
    const c = COMBOS[i], n = c.pieces.length;
    board.classList.toggle("vert", vert());
    board.replaceChildren(...c.pieces.map((d, k) => h("div", { class: "cb-slot", "data-k": k }, h("span", {}, k + 1))));
    // tray: the real pieces shuffled with two decoys
    const decoyPool = catalog.apps.filter((a) => !c.pieces.some((d) => d[0] === a.id) && a.hex);
    const decoys = [0, 1].map((k) => decoyPool[(i * 37 + k * 101) % decoyPool.length].id);
    const all = c.pieces.map((d, k) => ({ id: d[0], k, d })).concat(decoys.map((id) => ({ id, k: -1 })));
    all.sort((x, y) => ((x.id.length * 7 + i) % 5) - ((y.id.length * 7 + i) % 5) || x.id.localeCompare(y.id));
    tray.replaceChildren(...all.map((x) => { const el = pieceEl(x.id, Math.max(0, x.k), n, x.d); el.dataset.k = x.k; el.dataset.used = ""; wire(el); return el; }));
    out.replaceChildren(h("p", { class: "eu-hint" }, "Drag the apps onto the board in the order the work flows (or tap them in order). Two pieces don't belong."));
    tray.querySelectorAll(".cb-p").forEach((p, k) => anim(p, [{ opacity: 0, transform: "translateY(16px) rotate(-4deg)" }, { opacity: 1, transform: "none" }], { spring: "bouncy", delay: k * 50 }));
    drawHud();
  }
  function wire(el) {
    let st = null;
    el.addEventListener("pointerdown", (e) => {
      if (el.dataset.used || running) return;
      touched = true;
      startedAt ||= performance.now();
      const r = el.getBoundingClientRect();
      st = { x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!st) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.moved && Math.hypot(dx, dy) < 6) return;
      st.moved = true; el.classList.add("lift");
      el.style.translate = `${dx}px ${dy}px`;
      const slot = nextSlot(); slot?.classList.toggle("near", hit(e, slot));
    });
    el.addEventListener("pointerup", (e) => {
      if (!st) return;
      const slot = nextSlot();
      const drop = !st.moved || (slot && hit(e, slot));
      el.classList.remove("lift");
      slot?.classList.remove("near");
      st = null;
      if (drop && slot) tryPlace(el, slot); else { anim(el, [{ translate: el.style.translate }, { translate: "0px 0px" }], { spring: "soft" }); el.style.translate = ""; }
    });
  }
  const nextSlot = () => board.querySelector(`.cb-slot[data-k="${placed.length}"]`);
  const hit = (e, slot) => { const r = slot.getBoundingClientRect(); return e.clientX > r.left - 30 && e.clientX < r.right + 30 && e.clientY > r.top - 30 && e.clientY < r.bottom + 30; };
  function tryPlace(el, slot) {
    const want = placed.length;
    if (+el.dataset.k !== want) {
      combo = 0; drawHud();
      el.style.translate = "";
      anim(el, [{ transform: "translateX(0)" }, { transform: "translateX(-9px) rotate(-3deg)" }, { transform: "translateX(8px) rotate(2deg)" }, { transform: "translateX(-5px)" }, { transform: "none" }], { duration: 420 });
      el.classList.add("nope"); setTimeout(() => el.classList.remove("nope"), 600);
      return;
    }
    const r0 = el.getBoundingClientRect();
    el.style.translate = ""; el.dataset.used = "1";
    slot.replaceChildren(el); slot.classList.add("filled");
    const r1 = el.getBoundingClientRect();
    anim(el, [{ transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px) scale(1.06)` }, { transform: "none" }], { spring: "bouncy" });
    placed.push(el.dataset.app);
    combo++; gain(10 * combo, el);
    burst(el.querySelector(".eu-ico"), el.style.getPropertyValue("--a"), 10);
    if (placed.length === COMBOS[cur].pieces.length) setTimeout(finish, 350);
  }
  function gain(n, at) {
    store.xp += n; localStorage.setItem("eu-xp", store.xp);
    const before = level(store.xp - n);
    drawHud();
    if (at) { const f = h("span", { class: "cb-float" }, `+${n}`); at.append(f); anim(f, [{ opacity: 1, transform: "translate(-50%, 0)" }, { opacity: 0, transform: "translate(-50%, -34px)" }], { duration: 900, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => f.remove(); }
    if (level(store.xp) > before) { const t = h("div", { class: "cb-lvup" }, `Level ${level(store.xp)}`); root.append(t); anim(t, [{ opacity: 0, transform: "translate(-50%, 10px) scale(.9)" }, { opacity: 1, transform: "translate(-50%, 0) scale(1)" }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1800 }).onfinish = () => t.remove(); }
  }
  async function finish() {
    const c = COMBOS[cur];
    const secs = startedAt ? (performance.now() - startedAt) / 1000 : 0;
    const stars = secs && secs < 12 ? 3 : secs < 25 ? 2 : 1;
    store.best[c.id] = Math.max(store.best[c.id] || 0, stars); localStorage.setItem("eu-best", JSON.stringify(store.best));
    tabs.children[cur].querySelector(".cb-stars").textContent = "★".repeat(store.best[c.id]);
    gain(25 * stars);
    await flow();
  }
  /** Context runs down the chain; each piece shows its one 'now' fact while the rest dim. */
  async function flow() {
    const run = (running = new Run());
    const c = COMBOS[cur];
    const pieces = [...board.querySelectorAll(".cb-p")];
    board.classList.add("flowing");
    const facts = [];
    try {
      for (let k = 0; k < pieces.length; k++) {
        const p = pieces[k], d = c.pieces[k];
        pieces.forEach((q, j) => q.classList.toggle("now", j === k));
        p.classList.add("lit");
        const f = p.querySelector(".cb-focus"); f.textContent = d[3];
        anim(f, [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
        out.replaceChildren(h("div", { class: "cb-now" }, h("span", { class: "kicker" }, `Now · ${catalog.byId[d[0]].name} · ${d[1]}`), h("b", {}, d[3])), h("div", { class: "cb-carried" }, facts.map((x) => h("span", { class: "eu-chip" }, x))));
        await run.wait(1500);
        if (k < pieces.length - 1) {
          const tok = h("span", { class: "cb-token" }, d[2]);
          board.append(tok);
          const a = p.getBoundingClientRect(), b = pieces[k + 1].getBoundingClientRect(), br = board.getBoundingClientRect();
          await anim(tok, [{ left: `${a.left + a.width / 2 - br.left}px`, top: `${a.top + a.height / 2 - br.top}px`, opacity: 0, transform: "translate(-50%,-50%) scale(.6)" }, { opacity: 1, offset: 0.2, transform: "translate(-50%,-50%) scale(1)" }, { left: `${b.left + b.width / 2 - br.left}px`, top: `${b.top + b.height / 2 - br.top}px`, opacity: 1, transform: "translate(-50%,-50%) scale(1)" }], { duration: 700, easing: "cubic-bezier(.65,0,.35,1)" }).finished;
          tok.remove();
          facts.push(d[2]);
          burst(pieces[k + 1].querySelector(".eu-ico"), "var(--h-primary)", 8);
        }
      }
      facts.push(c.pieces.at(-1)[2]);
      pieces.forEach((q) => q.classList.remove("now"));
      out.replaceChildren(h("div", { class: "cb-now done" }, h("span", { class: "kicker" }, `Combo complete · ${c.pieces.length} apps`), h("b", {}, `${facts.length} facts carried across, 0 copy-pastes. You saw one thing at a time.`)), h("div", { class: "cb-carried" }, facts.map((x) => h("span", { class: "eu-chip" }, x))), h("div", { class: "row" }, h("button", { class: "eu-btn primary sm", type: "button", onclick: () => load((cur + 1) % COMBOS.length) }, "Next combo →"), h("button", { class: "eu-btn ghost sm", type: "button", onclick: () => flow() }, "↻ Replay flow"), h("button", { class: "eu-btn ghost sm", type: "button", onclick: () => openDrawer(c.pieces[0][0]) }, `Open ${catalog.byId[c.pieces[0][0]].name} cards`)));
    } catch (e) { if (e !== Run.CANCEL) throw e; }
    finally { board.classList.remove("flowing"); running = null; }
  }
  async function autoSolve() {
    const c = COMBOS[cur];
    for (let k = placed.length; k < c.pieces.length; k++) {
      const el = tray.querySelector(`.cb-p[data-k="${k}"]:not([data-used="1"])`);
      if (!el) return;
      await new Promise((r) => setTimeout(r, 380 / motion.speed));
      if (cur !== COMBOS.indexOf(c)) return;
      tryPlace(el, nextSlot());
    }
  }
  root.querySelector(".cb-auto").onclick = autoSolve;
  root.querySelector(".cb-reset").onclick = () => load(cur);
  // re-cut the pieces when the board switches between a row and a column (phone rotation, resize)
  let lastV = null;
  new ResizeObserver(() => { const v = vert(); if (lastV === null) { lastV = v; return; } if (v !== lastV && !running) { lastV = v; load(cur); } }).observe(board);
  // if nobody touches it, it assembles itself once so the section never sits idle
  new IntersectionObserver(([en], io) => { if (!en.isIntersecting) return; io.disconnect(); setTimeout(() => { if (!touched && !placed.length) autoSolve(); }, 3500); }, { threshold: 0.4 }).observe(board);
  requestAnimationFrame(() => load(0));
}
