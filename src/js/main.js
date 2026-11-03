// Ephemeral UI site: host preview, kit store, kinds gallery, theme engine, flows, spec, command palette.
import { h, anim, flip, stagger, countUp, typeText, Run, quiet, motion, rng } from "./motion.js";
import { loadThemes, state as T, setTheme, setOver, setBrand, setLogos, setSpeed, exportCSS, exportJSON, current } from "./themes.js";
import { loadApps, catalog, icon, svg, seg, dissolve, burst } from "./shell.js";
import { KINDS_A } from "./kinds-a.js";
import { KINDS_B } from "./kinds-b.js";
import { KINDS_C } from "./kinds-c.js";
import { KINDS_3D } from "./kinds-3d.js";
import { KINDS_E } from "./kinds-e.js";
import { buildCombos, COMBOS } from "./combos.js";

export const KINDS = { ...KINDS_A, ...KINDS_B, ...KINDS_3D, ...KINDS_C, ...KINDS_E };
const STUDIO = new Set([...Object.keys(KINDS_3D), ...Object.keys(KINDS_C), ...Object.keys(KINDS_E)]);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function makeCard(appId, kind) {
  const a = catalog.byId[appId];
  const k = KINDS[kind];
  const c = k.make(a, rng(appId + kind));
  c.el.spec = c.spec;
  c.el.addEventListener("click", () => setSpec(c.spec), { capture: true });
  return c;
}

/* ---------------- copy ---------------- */
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { const t = h("textarea", {}, text); document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
  if (btn) { const o = btn.textContent; btn.textContent = "Copied ✓"; setTimeout(() => (btn.textContent = o), 1200); }
}

/* ---------------- host window: a real-feeling agent turn ---------------- */
const SCENES = [
  { id: "pay", label: "Pay an invoice", prompt: "Find the Acme invoice in my email and pay it", steps: [{ app: "gmail", tool: "Searched Gmail", detail: "invoice from Acme", kind: "inbox", ttl: 2600 }, { app: "stripe", tool: "Prepared payment", detail: "$1,240.00 to Acme Corp", kind: "receipt", hold: true, ttl: 3400 }], reply: "Paid Acme Corp $1,240.00 with Stripe and filed the receipt next to the invoice." },
  { id: "merge", label: "Merge a PR", prompt: "Merge the session PR once checks pass", steps: [{ app: "github", tool: "Read PR #128", detail: "feat/session → main", kind: "merge", auto: true, ttl: 3000 }], reply: "Resolved 3 conflicts, all 4 checks passed, and #128 is merged into main." },
  { id: "ride", label: "Book a ride", prompt: "Get me a ride from the Ferry Building to SFO", steps: [{ app: "google-maps", tool: "Routed", detail: "Ferry Building → SFO", kind: "route", ttl: 2400 }, { app: "uber", tool: "Priced rides", detail: "3 options", kind: "ride", pick: 1, hold: true, ttl: 3200 }], reply: "Comfort is on the way: 6 minutes out, $46.90. I'll ping you when it's close." },
  { id: "meet", label: "Find a time", prompt: "Find 30 minutes with Priya, Sam and Mina this week", steps: [{ app: "google-calendar", tool: "Checked 3 calendars", detail: "this week", kind: "slots", hold: true, ttl: 3200 }], reply: "Booked Tuesday 2:30 for all three and added a Meet link." },
  { id: "sculpt", label: "Sculpt with 3 agents", prompt: "Block out a helmet in Blender, split the work across three agents", steps: [{ app: "blender", tool: "Sculpting", detail: "3 agents · Clay Strips, Crease, Smooth", kind: "sculpt", ttl: 7000 }], reply: "Three agents sculpted the blockout in parallel. The script is in the card if you want to re-run it." },
  { id: "level", label: "Build a level", prompt: "Block out a city level in Unreal and fly the camera through it", steps: [{ app: "unreal-engine", tool: "PCG graph", detail: "5 nodes", kind: "city", ttl: 4200 }, { app: "unreal-engine", tool: "Sequencer", detail: "6 keys · 24 s", kind: "fly", ttl: 4200 }], reply: "The level is blocked out with PCG and the flythrough is ready for Movie Render Queue." },
  { id: "edit", label: "Edit by voice", prompt: "Cut the pause after ‘wild’ and punch in on the light", steps: [{ app: "fframestudio", tool: "Transcribed + marked", detail: "voice · ✎①", kind: "timeline", ttl: 4200 }], reply: "Cut the pause (−7 frames) and added a 120% punch-in. Undo is one tap." },
  { id: "ship", label: "Ship a preview", prompt: "Ship the checkout fix to a preview and tell #launch", steps: [{ app: "vercel", tool: "Deploying", detail: "main@3f2c1a9", kind: "deploy", ttl: 2600 }, { app: "discord", tool: "Posted", detail: "#launch", kind: "chat", ttl: 2600 }], reply: "Preview is live and the team has the link in #launch." },
];

const host = { run: null, scene: 0, paused: false };

function hostShell() {
  const el = $("#host");
  const threads = ["Pay the Acme invoice", "Session PR cleanup", "SFO ride Thursday", "Team sync", "Helmet blockout", "City level", "Voice edit", "Ship checkout fix"];
  el.innerHTML = "";
  const side = h("aside", { class: "side" },
    h("div", { class: "side-top" }, h("span", { class: "brandmark" }), h("b", { class: "host-name" }, ""), h("span", { class: "grow" }), h("span", { class: "kbd" }, "⌘N")),
    h("div", { class: "side-sec" }, "Threads"),
    h("ul", { class: "threads" }, threads.map((t, i) => h("li", { class: i === 0 ? "on" : "" }, h("i", { class: "st" + (i === 0 ? " live" : "") }), h("span", {}, t), h("time", {}, ["now", "2h", "1d", "2d", "3d", "4d", "5d", "1w"][i])))));
  const scroll = h("div", { class: "scroll" });
  const input = h("div", { class: "inp" }, h("span", { class: "ph" }, "Ask anything…"), h("span", { class: "typed" }), h("span", { class: "caret" }));
  const orb = h("span", { class: "orb", title: "Agent state" });
  const composer = h("div", { class: "composer" }, input, h("div", { class: "crow" }, h("span", { class: "eu-chip" }, "Opus"), h("span", { class: "eu-chip ghost napps-chip" }, "Apps"), h("span", { class: "grow" }), orb, h("button", { class: "send", type: "button", "aria-label": "Send" }, "↑")));
  const chat = h("main", { class: "chat" }, h("div", { class: "chat-top" }, h("b", { class: "thread-title" }, threads[0]), h("span", { class: "grow" }), h("span", { class: "eu-chip ghost" }, "ephemeral cards: on")), scroll, composer);
  el.append(h("div", { class: "titlebar" }, h("i"), h("i"), h("i"), h("span", { class: "wt" }, "")), h("div", { class: "cols" }, side, chat));
  const updateNames = () => { const t = current(); $(".host-name", el).textContent = t.host === "hermes" ? "Hermes" : "T3 Code"; $(".wt", el).textContent = `${t.label} · ${t.sub} — tokens from source`; };
  updateNames();
  window.addEventListener("theme", updateNames);
  el.addEventListener("pointerdown", (e) => { if (e.isTrusted && e.target.closest(".eu-card") && host.run && !host.paused) pauseHost(); });
  return { scroll, input, orb, chat, threadsEl: $(".threads", el), title: $(".thread-title", el) };
}

function pauseHost() {
  host.paused = true; host.run?.stop();
  $("#hostctl .state").textContent = "Paused: the card is yours";
  $("#hostctl .resume").hidden = false;
}

function toolRow(a, tool, detail) {
  return h("div", { class: "tool" }, h("span", { class: "spin" }), icon(a, 16), h("span", {}, h("b", {}, tool), h("span", { class: "d" }, ` · ${detail}`)));
}

async function playScene(sc, run, ui) {
  ui.scroll.replaceChildren();
  ui.title.textContent = sc.label;
  const ti = SCENES.indexOf(sc);
  [...ui.threadsEl.children].forEach((li, i) => { li.classList.toggle("on", i === (ti < 0 ? 7 : ti)); li.querySelector(".st").classList.toggle("live", i === (ti < 0 ? 7 : ti)); });
  $$("#hostctl .scn button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === sc.id ? "true" : "false"));
  const typed = $(".typed", ui.input);
  ui.input.classList.add("typing");
  await typeText(typed, sc.prompt, run, 38);
  await run.wait(260);
  const bubble = h("div", { class: "turn user" }, h("div", { class: "bub" }, sc.prompt));
  ui.scroll.append(bubble);
  const r0 = typed.getBoundingClientRect(), r1 = bubble.firstChild.getBoundingClientRect();
  typed.textContent = ""; ui.input.classList.remove("typing");
  anim(bubble.firstChild, [{ transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px)`, opacity: 0.4 }, { transform: "none", opacity: 1 }], { spring: "soft" });
  const turn = h("div", { class: "turn agent" });
  ui.scroll.append(turn);
  ui.orb.classList.add("on");
  await run.wait(500);
  for (const st of sc.steps) {
    const a = catalog.byId[st.app];
    const row = toolRow(a, st.tool, st.detail);
    turn.append(row);
    anim(row, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
    ui.scroll.scrollTop = ui.scroll.scrollHeight;
    await run.wait(700);
    row.classList.add("done");
    const c = makeCard(st.app, st.kind);
    const slot = h("div", { class: "cardslot" }, c.el);
    turn.append(slot);
    // container transform: the card grows out of the tool row that produced it
    const rr = row.getBoundingClientRect(), cr = c.el.getBoundingClientRect();
    anim(c.el, [{ clipPath: `inset(0 ${Math.max(0, cr.width - rr.width)}px ${Math.max(0, cr.height - rr.height)}px 0 round 10px)`, transform: `translateY(${rr.top - cr.top}px)`, opacity: 0.3 }, { clipPath: "inset(0 0 0 0 round 0px)", transform: "none", opacity: 1 }], { spring: "soft", fill: "none" });
    c.el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    ui.scroll.scrollTo({ top: ui.scroll.scrollHeight, behavior: "smooth" });
    await c.play(run);
    await run.wait(900);
    if (st.pick != null) c.el.querySelectorAll(".rides li")[st.pick]?.click(), await run.wait(700);
    if (st.auto && c.auto) await c.auto(run);
    if (st.hold) {
      const b = c.el.querySelector(".hold");
      if (b) { b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); await run.wait(1100); }
    }
    await run.wait(900);
    await new Promise((res) => c.el.startTTL(st.ttl, res));
    run.check();
  }
  ui.orb.classList.remove("on");
  const reply = h("p", { class: "reply" });
  turn.append(reply);
  await typeText(reply, sc.reply, run, 70);
  await run.wait(2600);
}

async function hostLoop(ui, from = host.scene) {
  host.run?.stop();
  const run = (host.run = new Run());
  host.paused = false;
  $("#hostctl .state").textContent = "Live: watch a turn, or grab a card to take over";
  $("#hostctl .resume").hidden = true;
  let i = from;
  try {
    for (;;) { host.scene = i; await playScene(SCENES[i], run, ui); i = (i + 1) % SCENES.length; }
  } catch (e) { if (e !== Run.CANCEL) console.error(e); }
}

/** Play one app/kind inside the host window (from the store or palette). */
export function runInHost(appId, kind) {
  const a = catalog.byId[appId];
  const k = KINDS[kind];
  const prompts = { inbox: `Find the Acme invoice in ${a.name}`, receipt: `Pay the Acme invoice with ${a.name}`, merge: `Merge #128 on ${a.name} when it's green`, ride: `Get me a ${a.name} to SFO`, route: `Route me to Oracle Park in ${a.name}`, slots: `Find 30 minutes this week in ${a.name}`, deploy: `Deploy main to ${a.name}`, chat: `Catch me up on ${a.name}`, metric: `How are we doing on ${a.name} this week?`, sculpt: `Sculpt a helmet blockout in ${a.name}`, city: `Block out a city in ${a.name}`, fly: `Fly the camera through the scene in ${a.name}`, fpv: `Fly the gate line in ${a.name}`, light: `Light the bust Rembrandt-style in ${a.name}`, trigger: `Make the door open when the player walks in (${a.name})`, nodes: `Build the graph in ${a.name} and run it`, timeline: `Cut the pause and punch in (${a.name})`, review: `Collect review notes in ${a.name}`, layers: `Add a red barn to the selection in ${a.name}`, gallery: `Show me the renders in ${a.name}`, cad: `Draft a two-room plan in ${a.name}`, board: `Map this lecture in ${a.name}`, daw: `Write an Am–F–C–G progression in ${a.name}`, flash: `Quiz me in ${a.name}`, stage: `Why is the gripper red? (${a.name})`, globe: `Follow the flight into Tokyo`, gen3d: `Turn this photo into a 3D asset with ${a.name}`, sim: `Train a pick-and-place policy in ${a.name}`, screen: `Test the mobile build on a virtual display (${a.name})`, sandbox: `Try three runtimes in parallel on ${a.name}` };
  const sc = { id: "custom", label: `${a.name} · ${k.label}`, prompt: prompts[kind] || `Use ${a.name}: ${k.label.toLowerCase()}`, steps: [{ app: appId, tool: k.verb(a).split(" · ")[0], detail: a.name, kind, auto: !!KINDS[kind].make, hold: false, ttl: 6000 }], reply: `Done in ${a.name}. The card stays until you're finished with it.` };
  document.getElementById("top").scrollIntoView({ behavior: "smooth" });
  host.run?.stop();
  const run = (host.run = new Run());
  host.paused = false;
  quiet(playScene(sc, run, host.ui).then(() => { if (!run.dead) hostLoop(host.ui); }));
}

/* ---------------- kit store ---------------- */
const store = { q: "", cat: "all" };
function tile(a) {
  const kinds = a.kinds.slice(0, 3).map((k) => h("span", { class: "kk" + (STUDIO.has(k) ? " st" : "") }, KINDS[k].label));
  return h("button", { class: "tile", type: "button", "data-id": a.id, "data-cat": a.cat, style: a.hex ? { "--tile-c": a.hex } : null, onclick: (e) => openDrawer(a.id, e.currentTarget) }, h("span", { class: "glow" }), icon(a, 40), h("span", { class: "tn" }, a.name, a.oss ? h("span", { class: "oss-b", title: "Open source" }, "OSS") : null), h("span", { class: "tc" }, catLabel(a.cat)), h("span", { class: "kks" }, kinds));
}
const catLabel = (id) => catalog.categories.find((c) => c.id === id)?.label || id;
function buildStore() {
  const grid = $("#grid");
  grid.replaceChildren(...catalog.apps.map(tile));
  const chips = $("#cats");
  const all = [{ id: "all", label: "All" }, { id: "oss", label: "Open source" }, ...catalog.categories];
  chips.replaceChildren(...all.map((c) => h("button", { type: "button", class: "cat", "aria-pressed": c.id === "all" ? "true" : "false", "data-cat": c.id, onclick: (e) => { store.cat = c.id; $$("#cats .cat").forEach((b) => b.setAttribute("aria-pressed", b === e.currentTarget ? "true" : "false")); filter(); } }, c.label, h("em", {}, c.id === "all" ? catalog.apps.length : c.id === "oss" ? catalog.apps.filter((a) => a.oss).length : catalog.apps.filter((a) => a.cat === c.id).length))));
  $("#q").addEventListener("input", (e) => { store.q = e.target.value.trim().toLowerCase(); filter(); });
  grid.addEventListener("pointermove", (e) => { const t = e.target.closest(".tile"); if (!t) return; const b = t.getBoundingClientRect(); const x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height; t.style.setProperty("--mx", `${x * 100}%`); t.style.setProperty("--my", `${y * 100}%`); t.style.setProperty("--rx", `${(0.5 - y) * 7}deg`); t.style.setProperty("--ry", `${(x - 0.5) * 9}deg`); });
  grid.addEventListener("pointerout", (e) => { const t = e.target.closest(".tile"); if (t && !t.contains(e.relatedTarget)) { t.style.setProperty("--rx", "0deg"); t.style.setProperty("--ry", "0deg"); } });
  const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); en.target.classList.add("in"); } }), { rootMargin: "60px" });
  $$(".tile", grid).forEach((t, i) => { t.style.setProperty("--d", `${(i % 8) * 35}ms`); io.observe(t); });
  filter(true);
}
function matches(a) {
  if (store.cat === "oss" ? !a.oss : store.cat !== "all" && a.cat !== store.cat) return false;
  if (!store.q) return true;
  const hay = `${a.name} ${catLabel(a.cat)} ${a.kinds.map((k) => KINDS[k].label + " " + k).join(" ")} ${(a.alt || []).join(" ")} ${a.oss ? "open source oss" : ""}`.toLowerCase();
  return store.q.split(/\s+/).every((w) => hay.includes(w));
}
function filter(first) {
  const tiles = $$("#grid .tile");
  const vis = tiles.filter((t) => !t.hidden);
  const apply = () => { let n = 0; for (const t of tiles) { const ok = matches(catalog.byId[t.dataset.id]); t.hidden = !ok; n += ok; } $("#count").textContent = `${n} app${n === 1 ? "" : "s"}`; $("#empty").hidden = n > 0; };
  if (first) return apply();
  const inView = vis.filter((t) => { const b = t.getBoundingClientRect(); return b.bottom > -100 && b.top < innerHeight + 100; });
  flip(inView.concat(tiles.filter((t) => t.hidden).slice(0, 40)), apply, { spring: "snappy" });
}

/* ---------------- drawer ---------------- */
function openDrawer(id, from) {
  const a = catalog.byId[id];
  const d = $("#drawer");
  const cards = a.kinds.map((k) => makeCard(id, k));
  const body = $(".dbody", d);
  body.replaceChildren(...cards.map((c) => h("div", { class: "dcard" }, h("div", { class: "dk" }, h("span", {}, KINDS[c.spec.kind].label), h("button", { class: "eu-btn ghost sm", onclick: (e) => copy(JSON.stringify(c.spec, null, 2), e.currentTarget) }, "Copy spec"), h("button", { class: "eu-btn ghost sm", onclick: () => { closeDrawer(); runInHost(id, c.spec.kind); } }, "Run in host")), c.el)));
  $(".dhead", d).replaceChildren(icon(a, 52), h("div", {}, h("h3", {}, a.name), h("span", { class: "eu-hint" }, `${catLabel(a.cat)} · ${a.hex ? `brand ${a.hex.toUpperCase()} from simple-icons` : "no verified brand colour: neutral tile"}`), altLine(a)), h("button", { class: "x", "aria-label": "Close", onclick: closeDrawer }, "✕"));
  d.hidden = false;
  document.body.classList.add("drawer-open");
  const ico = $(".dhead .eu-ico", d);
  const fi = from?.querySelector?.(".eu-ico");
  if (fi) { const a0 = fi.getBoundingClientRect(), a1 = ico.getBoundingClientRect(); anim(ico, [{ transform: `translate(${a0.left - a1.left}px, ${a0.top - a1.top}px) scale(${a0.width / a1.width})` }, { transform: "none" }], { spring: "soft" }); }
  anim($(".panel", d), [{ transform: "translateX(40px)", opacity: 0 }, { transform: "none", opacity: 1 }], { spring: "soft" });
  anim($(".scrim", d), [{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
  const run = new Run();
  d._run?.stop(); d._run = run;
  cards.forEach((c, i) => setTimeout(() => quiet(c.play(run)), 120 + i * 160));
  setSpec(cards[0].spec);
  history.replaceState(null, "", `#app=${id}`);
}
/** OSS apps list what they replace; proprietary apps list their OSS equivalents (reverse of `alt`). */
function altLine(a) {
  const ossFor = catalog.apps.filter((o) => o.oss && (o.alt || []).some((x) => x.toLowerCase() === a.name.toLowerCase()));
  const bits = [];
  if (a.oss && a.alt) bits.push(h("span", {}, "Open source · stands in for ", h("b", {}, a.alt.join(", "))));
  if (ossFor.length) bits.push(h("span", {}, "OSS equivalents: ", ...ossFor.map((o, i) => [i ? ", " : "", h("a", { href: `#app=${o.id}`, onclick: (e) => { e.preventDefault(); openDrawer(o.id); } }, o.name)])));
  if (a.docs) bits.push(h("a", { href: a.docs, target: "_blank", rel: "noopener" }, "docs ↗"));
  return bits.length ? h("div", { class: "dalt" }, ...bits) : null;
}
function closeDrawer() {
  const d = $("#drawer");
  if (d.hidden) return;
  d._run?.stop();
  anim($(".panel", d), [{ transform: "none", opacity: 1 }, { transform: "translateX(40px)", opacity: 0 }], { duration: 200, easing: "ease-in" }).onfinish = () => { d.hidden = true; document.body.classList.remove("drawer-open"); };
  history.replaceState(null, "", location.pathname);
}

/* ---------------- kinds gallery ---------------- */
const SHOW_STUDIO = { screen: "scrcpy", sandbox: "boat", sculpt: "blender", city: "unreal-engine", fly: "unreal-engine", fpv: "betaflight", light: "blender", trigger: "godot-engine", globe: "god-s-eye-view", gen3d: "trellis", sim: "isaac-sim", nodes: "comfyui", timeline: "fframestudio", review: "frame-io", layers: "photoshop", gallery: "anatomy", cad: "autocad", board: "tldraw", daw: "ableton-live", flash: "anki", stage: "openusd", anatomy: "anatomy" };
const SHOW = { inbox: "gmail", thread: "proton-mail", approve: "1password", chat: "discord", notify: "telegram", slots: "google-calendar", kanban: "trello", triage: "linear", file: "google-drive", graph: "obsidian", search: "yelp", feed: "bluesky", frames: "figma", sign: "docusign", context: "claude", receipt: "stripe", metric: "posthog", track: "fedex", crm: "hubspot", ride: "uber", route: "waze", boarding: "united", player: "spotify", workout: "strava", home: "philips-hue", merge: "github", ci: "github-actions", deploy: "vercel", incident: "pagerduty", migrate: "supabase" };
function buildKinds() {
  const g = $("#kindgrid");
  const io = new IntersectionObserver((es) => es.forEach((en) => { if (!en.isIntersecting) return; io.unobserve(en.target); const c = en.target._c; quiet(c.play(new Run())); }), { threshold: 0.25 });
  const bar = $("#kindbar");
  bar?.append(seg(["Everyday", "Studio", "All"], (i) => { $$(".kcell", g).forEach((c) => (c.hidden = i === 2 ? false : (c.dataset.studio === "1") !== (i === 1))); }, 1));
  for (const [k, id] of Object.entries({ ...SHOW_STUDIO, ...SHOW })) {
    if (!catalog.byId[id]) { console.warn("missing show app", id); continue; }
    const c = makeCard(id, k);
    const wrap = h("div", { class: "kcell" }, h("div", { class: "kl" }, h("b", {}, KINDS[k].label), h("code", {}, k), h("button", { class: "replay", title: "Replay", "aria-label": "Replay", onclick: () => { const n = makeCard(id, k); wrap.querySelector(".eu-card").replaceWith(n.el); quiet(n.play(new Run())); } }, "↻")), c.el);
    wrap.dataset.studio = STUDIO.has(k) ? "1" : "0"; wrap.hidden = !STUDIO.has(k);
    c.el._c = c; g.append(wrap); io.observe(c.el);
  }
  $("#nkinds").textContent = Object.keys(KINDS).length;
}

/* ---------------- theme engine ---------------- */
function buildThemes() {
  const list = $("#presets");
  const groups = [["t3", "T3 Code"], ["hermes", "Hermes desktop"]];
  list.replaceChildren(...groups.map(([hid, name]) => h("div", { class: "pgroup" }, h("span", { class: "eu-hint" }, name), h("div", { class: "prow" }, T.themes.filter((t) => t.host === hid).map((t) => h("button", { type: "button", class: "preset", "data-id": t.id, onclick: (e) => setTheme(t.id, { x: e.clientX, y: e.clientY }), style: { "--pb": t.bg, "--pc": t.card, "--pp": t.primary, "--pf": t.fg, "--ps": t.sidebar, "--pr": `${Math.min(t.radius, 8)}px` } }, h("span", { class: "mini" }, h("i", { class: "s" }), h("i", { class: "c" }), h("i", { class: "p" })), h("span", { class: "pn" }, t.sub)))))));
  const mark = () => { $$(".preset").forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === T.base.id ? "true" : "false")); $$(".hostpick button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.host === T.base.host ? "true" : "false")); };
  window.addEventListener("theme", () => { mark(); syncControls(); $("#tokcode").textContent = $("#exp-json").getAttribute("aria-pressed") === "true" ? exportJSON() : exportCSS(); });
  mark();

  const acc = $("#c-accent"), rad = $("#c-radius"), spd = $("#c-speed"), font = $("#c-font"), dens = $("#c-density");
  acc.addEventListener("input", () => setOver({ primary: acc.value }));
  rad.addEventListener("input", () => { setOver({ radius: +rad.value }); $("#v-radius").textContent = `${rad.value}px`; });
  spd.addEventListener("input", () => { setSpeed(+spd.value); $("#v-speed").textContent = `${(+spd.value).toFixed(2)}×`; });
  font.addEventListener("change", () => setOver({ font: font.value || null }));
  dens.addEventListener("input", () => { setOver({ density: +dens.value }); $("#v-density").textContent = ["Compact", "Default", "Roomy"][Math.round((+dens.value - 0.85) / 0.15)] || "Default"; });
  $("#brandmode").append(seg(["Brand accent", "Full brand", "Host only"], (i) => setBrand(["accent", "full", "mono"][i]), ["accent", "full", "mono"].indexOf(T.brand)));
  $("#logomode").append(seg(["Monograms", "Official marks"], (i) => setLogos(i === 1), T.logos ? 1 : 0));
  $("#reset").onclick = () => { setOver({ primary: null, radius: null, font: null, density: null }); };
  $("#exp-css").onclick = () => { $("#exp-css").setAttribute("aria-pressed", "true"); $("#exp-json").setAttribute("aria-pressed", "false"); $("#tokcode").textContent = exportCSS(); };
  $("#exp-json").onclick = () => { $("#exp-json").setAttribute("aria-pressed", "true"); $("#exp-css").setAttribute("aria-pressed", "false"); $("#tokcode").textContent = exportJSON(); };
  $("#copytok").onclick = (e) => copy($("#tokcode").textContent, e.currentTarget);
  $("#tokcode").textContent = exportCSS();
  function syncControls() { const t = current(); acc.value = /^#[0-9a-f]{6}$/i.test(t.primary) ? t.primary : "#3366ff"; rad.value = t.radius; $("#v-radius").textContent = `${t.radius}px`; spd.value = motion.speed; $("#v-speed").textContent = `${motion.speed.toFixed(2)}×`; dens.value = t.density ?? 1; }
  syncControls();
  const pv = $("#themepv");
  const show = () => { const run = new Run(); pv.replaceChildren(); for (const [id, k] of [["uber", "ride"], ["github", "merge"], ["stripe", "receipt"]]) { const c = makeCard(id, k); pv.append(c.el); quiet(c.play(run)); } };
  show();
  $("#pvreplay").onclick = show;
  $$(".hostpick button").forEach((b) => b.addEventListener("click", (e) => { const t = current(); const scheme = t.scheme; const target = b.dataset.host === "t3" ? (scheme === "dark" ? "t3-dark" : "t3-light") : scheme === "dark" ? "hermes-nous-dark" : "hermes-nous"; setTheme(target, { x: e.clientX, y: e.clientY }); }));
  $("#scheme").addEventListener("click", (e) => { const t = current(); const pairs = { "t3-light": "t3-dark", "t3-dark": "t3-light", "hermes-nous": "hermes-nous-dark", "hermes-nous-dark": "hermes-nous" }; setTheme(pairs[t.id] || (t.host === "hermes" ? "hermes-nous" : "t3-light"), { x: e.clientX, y: e.clientY }); });
}

/* ---------------- flows: cards wired together ---------------- */
const FLOWS = [
  { id: "invoice", label: "Invoice → pay → tell finance", nodes: [["gmail", "inbox", "Find invoice"], ["stripe", "receipt", "Pay $1,240"], ["discord", "chat", "Post receipt"]] },
  { id: "ship", label: "PR → deploy → close issue", nodes: [["github", "merge", "Merge #128"], ["vercel", "deploy", "Deploy"], ["linear", "triage", "Close ENG-482"]] },
  { id: "trip", label: "Flight → ride → calendar", nodes: [["united", "boarding", "Check in"], ["uber", "ride", "Ride to SFO"], ["google-calendar", "slots", "Block travel"]] },
  { id: "ops", label: "Alert → page → status", nodes: [["datadog", "metric", "p95 spike"], ["pagerduty", "incident", "Page on-call"], ["telegram", "notify", "Status update"]] },
];
const flow = { i: 0, pos: [], raf: 0, packets: [] };
function buildFlows() {
  const tabs = $("#flowtabs");
  tabs.append(seg(FLOWS.map((f) => f.label), (i) => { flow.i = i; drawFlow(); }, 0));
  $("#runflow").onclick = runFlow;
  drawFlow();
  addEventListener("resize", () => layoutFlow());
}
function drawFlow() {
  const f = FLOWS[flow.i];
  const cv = $("#flowcv");
  cv.querySelectorAll(".fnode").forEach((n) => n.remove());
  const W = cv.clientWidth, H = cv.clientHeight;
  const narrow = W < 640;
  flow.pos = f.nodes.map((_, i) => narrow ? [W / 2 - 110, 30 + i * ((H - 120) / 2)] : [30 + i * ((W - 280) / 2), H / 2 - 50 + (i % 2 ? -50 : 40)]);
  f.nodes.forEach(([id, kind, label], i) => {
    const a = catalog.byId[id];
    const n = h("div", { class: "fnode", style: { "--a": a.hex || "var(--h-mutedFg)" }, "data-i": i }, h("span", { class: "port in" }), icon(a, 30), h("div", {}, h("b", {}, label), h("span", { class: "eu-hint st" }, `${a.name} · ${KINDS[kind].label}`)), h("span", { class: "port out" }));
    n.style.translate = `${flow.pos[i][0]}px ${flow.pos[i][1]}px`;
    cv.append(n);
    anim(n, [{ opacity: 0, transform: "scale(.8)" }, { opacity: 1, transform: "none" }], { spring: "bouncy", delay: i * 90 });
    let o = null;
    n.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; o = [e.clientX - flow.pos[i][0], e.clientY - flow.pos[i][1], e.clientX, e.clientY]; n.setPointerCapture(e.pointerId); n.classList.add("drag"); });
    n.addEventListener("pointermove", (e) => { if (!o) return; flow.pos[i] = [Math.max(0, Math.min(cv.clientWidth - 230, e.clientX - o[0])), Math.max(0, Math.min(cv.clientHeight - 70, e.clientY - o[1]))]; n.style.translate = `${flow.pos[i][0]}px ${flow.pos[i][1]}px`; layoutFlow(); });
    n.addEventListener("pointerup", (e) => { n.classList.remove("drag"); if (o && Math.hypot(e.clientX - o[2], e.clientY - o[3]) < 4) openDrawer(id, n); o = null; });
  });
  layoutFlow(true);
}
function layoutFlow(fresh) {
  const cv = $("#flowcv"), s = $("#flowsvg");
  const nodes = $$(".fnode", cv);
  if (fresh) s.replaceChildren();
  const cvb = cv.getBoundingClientRect();
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = $(".port.out", nodes[i]).getBoundingClientRect(), b = $(".port.in", nodes[i + 1]).getBoundingClientRect();
    const x1 = a.left - cvb.left + 5, y1 = a.top - cvb.top + 5, x2 = b.left - cvb.left + 5, y2 = b.top - cvb.top + 5;
    const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
    const d = `M${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    let g = s.querySelector(`[data-i="${i}"]`);
    if (!g) { g = svg("g", { "data-i": i }, svg("path", { class: "cable-shadow" }), svg("path", { class: "cable" }), svg("path", { class: "cable-flow" })); s.append(g); if (fresh) anim(g.querySelector(".cable"), [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: 700, delay: 200 + i * 200, easing: "cubic-bezier(.65,0,.35,1)" }); g.querySelectorAll("path").forEach((p) => p.setAttribute("pathLength", 1)); }
    g.querySelectorAll("path").forEach((p) => p.setAttribute("d", d));
  }
}
async function runFlow() {
  const btn = $("#runflow");
  btn.disabled = true;
  const nodes = $$("#flowcv .fnode");
  const s = $("#flowsvg");
  nodes.forEach((n) => n.classList.remove("ok", "run"));
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].classList.add("run");
    await new Promise((r) => setTimeout(r, 700 / motion.speed));
    nodes[i].classList.remove("run"); nodes[i].classList.add("ok");
    burst(nodes[i].querySelector(".eu-ico"), nodes[i].style.getPropertyValue("--a"), 10);
    const p = s.querySelector(`[data-i="${i}"] .cable`);
    if (p) {
      const dot = svg("circle", { r: 5, class: "packet" });
      s.append(dot);
      const L = p.getTotalLength(), t0 = performance.now(), dur = 900 / motion.speed;
      await new Promise((res) => { const step = (t) => { const k = Math.min(1, (t - t0) / dur); const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; const pt = p.getPointAtLength(L * e); dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y); if (k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
      dot.remove();
    }
  }
  btn.disabled = false;
}

/* ---------------- spec ---------------- */
function setSpec(spec) {
  const el = $("#speccode");
  if (!el || !spec) return;
  const full = { "$schema": "https://ephemeralui.vercel.app/schema/card.v0.json", ...spec, ttl: "until-done", actions: "host-confirmed", render: { host: current().host, theme: current().id, brand: T.brand } };
  el.innerHTML = JSON.stringify(full, null, 2).replace(/("[^"]+")(:)/g, '<span class="k">$1</span>$2').replace(/: ("[^"]*")/g, ': <span class="s">$1</span>').replace(/: (\d[\d.]*)/g, ': <span class="n">$1</span>');
}

/* ---------------- command palette ---------------- */
function buildPalette() {
  const dlg = $("#palette"), inp = $("#pq"), out = $("#pres");
  let items = [], sel = 0;
  const all = () => [
    ...catalog.apps.map((a) => ({ type: "App", label: a.name, sub: catLabel(a.cat), ico: a, go: () => openDrawer(a.id) })),
    ...Object.entries(KINDS).map(([k, v]) => ({ type: "Card kind", label: v.label, sub: k, go: () => { document.getElementById("kinds").scrollIntoView({ behavior: "smooth" }); const cell = $(`#kindgrid .eu-card[data-kind="${k}"]`)?.closest(".kcell"); setTimeout(() => cell && anim(cell, [{ boxShadow: "0 0 0 0 var(--h-primary)" }, { boxShadow: "0 0 0 6px transparent" }], { duration: 900, delay: 500 }), 10); } })),
    ...T.themes.map((t) => ({ type: "Theme", label: `${t.label} · ${t.sub}`, sub: t.host, go: () => setTheme(t.id) })),
    ...COMBOS.map((c, i) => ({ type: "Combo", label: c.label, sub: c.tag, go: () => { document.getElementById("combos").scrollIntoView({ behavior: "smooth" }); document.querySelectorAll(".cb-tab")[i]?.click(); } })),
    ...[["Kit", "kit"], ["Combos", "combos"], ["Open source", "oss"], ["Card kinds", "kinds"], ["Theme engine", "theme"], ["Flows", "flows"], ["Spec", "spec"]].map(([l, id]) => ({ type: "Go to", label: l, sub: "#" + id, go: () => document.getElementById(id).scrollIntoView({ behavior: "smooth" }) })),
  ];
  const render = () => {
    const q = inp.value.trim().toLowerCase();
    const src = all();
    items = !q ? src.filter((x) => x.type !== "App").concat(src.filter((x) => x.type === "App").slice(0, 12)) : src.map((x) => ({ x, s: score(`${x.label} ${x.sub}`.toLowerCase(), q) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map((r) => r.x);
    sel = 0;
    out.replaceChildren(...items.map((it, i) => h("li", { class: i === 0 ? "on" : "", onclick: () => choose(i), onpointermove: () => mark(i) }, it.ico ? icon(it.ico, 22) : h("span", { class: "pt" }, it.type[0]), h("b", {}, it.label), h("span", { class: "eu-hint" }, it.sub), h("em", {}, it.type))));
  };
  const score = (hay, q) => { if (hay.startsWith(q)) return 3; if (hay.includes(" " + q)) return 2; if (hay.includes(q)) return 1.5; let i = 0; for (const c of hay) if (c === q[i]) i++; return i === q.length ? 0.5 : 0; };
  const mark = (i) => { sel = i; [...out.children].forEach((li, j) => li.classList.toggle("on", j === i)); out.children[i]?.scrollIntoView({ block: "nearest" }); };
  const choose = (i) => { const it = items[i]; close(); it?.go(); };
  const open = () => { dlg.showModal(); inp.value = ""; render(); inp.focus(); anim($(".pbox", dlg), [{ transform: "translateY(-8px) scale(.98)", opacity: 0 }, { transform: "none", opacity: 1 }], { spring: "snappy" }); };
  const close = () => dlg.close();
  inp.addEventListener("input", render);
  inp.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); mark(Math.min(items.length - 1, sel + 1)); } if (e.key === "ArrowUp") { e.preventDefault(); mark(Math.max(0, sel - 1)); } if (e.key === "Enter") { e.preventDefault(); choose(sel); } });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); dlg.open ? close() : open(); } if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); open(); } if (e.key === "Escape") closeDrawer(); });
  $$(".open-palette").forEach((b) => b.addEventListener("click", open));
}

/* ---------------- open-source shelf ---------------- */
const OSS_PAIRS = [["photoshop", "krita", "layers"], ["autodesk-maya", "blender", "light"], ["autocad", "freecad", "cad"], ["miro", "excalidraw", "board"], ["premiere-pro", "kdenlive", "timeline"], ["meshy", "trellis", "gen3d"], ["unity", "godot-engine", "trigger"], ["quizlet", "anki", "flash"], ["ableton-live", "lmms", "daw"], ["lucidchart", "diagrams-net", "board"]];
function buildOSS() {
  const grid = $("#ossgrid"); if (!grid) return;
  const pairs = OSS_PAIRS.filter(([p, o]) => catalog.byId[p] && catalog.byId[o]);
  const stage = $("#ossstage");
  let sel = 0, side = 1;
  const show = () => {
    const [p, o, k] = pairs[sel];
    const id = side ? o : p;
    const c = makeCard(id, k);
    const old = stage.firstChild;
    if (old) anim(old, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${side ? -30 : 30}px) rotateY(${side ? 12 : -12}deg)` }], { duration: 200, easing: "ease-in" }).onfinish = () => old.remove();
    stage.append(c.el);
    anim(c.el, [{ opacity: 0, transform: `translateX(${side ? 30 : -30}px) rotateY(${side ? -12 : 12}deg)` }, { opacity: 1, transform: "none" }], { spring: "soft", delay: old ? 140 : 0 });
    quiet(c.play(new Run()));
    $$(".oss-pair", grid).forEach((b, i) => b.setAttribute("aria-pressed", i === sel ? "true" : "false"));
    $("#ossswap").textContent = side ? `Swap to ${catalog.byId[p].name}` : `Swap to ${catalog.byId[o].name} (OSS)`;
  };
  grid.replaceChildren(...pairs.map(([p, o], i) => h("button", { type: "button", class: "oss-pair", onclick: () => { sel = i; side = 1; show(); } }, icon(catalog.byId[p], 26), h("span", { class: "oss-arrow" }, "⇄"), icon(catalog.byId[o], 26), h("span", {}, h("b", {}, catalog.byId[o].name), h("em", {}, `for ${catalog.byId[p].name}`)))));
  $("#ossswap").onclick = () => { side = 1 - side; show(); };
  const oss = catalog.apps.filter((a) => a.oss);
  $("#osscount").textContent = oss.length;
  $("#osslist").replaceChildren(...oss.map((a) => h("button", { type: "button", class: "oss-chip", onclick: () => openDrawer(a.id) }, icon(a, 18), a.name)));
  const kit = { $schema: "https://ephemeralui.vercel.app/schema/card.v0.json", name: "ephemeral-ui-oss", license: "MIT (kit) · app marks belong to their owners", apps: oss.map((a) => ({ id: a.id, name: a.name, kinds: a.kinds, replaces: a.alt || [], docs: a.docs || null })) };
  const blob = new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" });
  $("#osskit").href = URL.createObjectURL(blob);
  new IntersectionObserver(([en], io) => { if (en.isIntersecting) { io.disconnect(); show(); } }, { rootMargin: "200px" }).observe(document.getElementById("oss"));
}

/* ---------------- boot ---------------- */
async function boot() {
  await Promise.all([loadThemes(), loadApps()]);
  $("#napps").textContent = catalog.apps.length;
  $("#srcicons").textContent = catalog.source;
  $("#srct3").textContent = T.sources.t3;
  $("#srchermes").textContent = T.sources.hermes;
  buildStore(); buildKinds(); buildThemes(); buildFlows(); buildPalette(); buildOSS();
  buildCombos({ catalog, icon, openDrawer });
  const pairs = catalog.apps.reduce((n, a) => n + a.kinds.length, 0);
  $$("[data-count=\"310\"]").forEach((e) => (e.dataset.count = catalog.apps.length));
  $("#ninter") && ($("#ninter").dataset.count = pairs);

  host.ui = hostShell();
  $$(".napps-chip").forEach((e) => (e.textContent = `Apps: ${catalog.apps.length}`));
  $("#hostctl .scn").replaceChildren(...SCENES.map((s, i) => h("button", { type: "button", "data-id": s.id, "aria-pressed": "false", onclick: () => hostLoop(host.ui, i) }, s.label)));
  $("#hostctl .resume").onclick = () => hostLoop(host.ui);
  const io = new IntersectionObserver(([en]) => { if (en.isIntersecting && !host.run) hostLoop(host.ui); else if (!en.isIntersecting && host.run && !host.paused) { host.run.stop(); host.run = null; } }, { threshold: 0.15 });
  io.observe($("#host"));
  $$("[data-count]").forEach((e) => { const io2 = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io2.disconnect(); countUp(e, +e.dataset.count, { dur: 1300 }); } }); io2.observe(e); });
  $("#drawer .scrim").onclick = closeDrawer;
  setSpec(makeCard("github", "merge").spec);
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("app") && catalog.byId[p.get("app")]) openDrawer(p.get("app"));
  document.documentElement.classList.add("ready");
  // hero spotlight
  const hero = $("#top");
  hero.addEventListener("pointermove", (e) => { const b = hero.getBoundingClientRect(); hero.style.setProperty("--sx", `${e.clientX - b.left}px`); hero.style.setProperty("--sy", `${e.clientY - b.top}px`); });
  window.__eui = { KINDS, catalog, makeCard, runInHost, setTheme, T };
}
boot();
