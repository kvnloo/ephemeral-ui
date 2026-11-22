// Card kinds, part K: advanced kits on synthetic fixtures (ace-data.js). An ACE campus twin with selectable
// zones and truth labels, workout form analysis (timed body landmarks + the corrections found in them) and a
// tennis forehand whose phases you scrub through.
import { h, stagger } from "./motion.js";
import { shell, svg } from "./shell.js";
import { act, tell } from "./loop.js";
import { appSurface, appBar } from "./chrome.js";
import { ACE_FLOORS, ACE_ZONES, JOINTS, BONES, SQUAT, squatFrames, squatMeasures, squatCorrections, SWING, SWING_PHASES, SWING_CONTACT, swingFrames } from "./ace-data.js";

const TRUTH = { SPEC: "sourced program fact", PLANNED: "sourced, size undecided", VISION: "intended program", MOCK: "illustrative twin state" };
const badge = (t) => h("span", { class: `ak-truth ak-${t.toLowerCase()}`, title: TRUTH[t] }, t);
const s2 = (t) => `${t.toFixed(2)} s`;
const pick = (el, sel, on) => el.querySelectorAll(sel).forEach((x) => x.setAttribute("aria-pressed", String(x === on)));

/* ---------------- ACE facility twin ---------------- */
function aceMake(a) {
  let floor = "0", zone = "zone_tennis";
  const tabs = h("div", { class: "ak-floors", role: "group", "aria-label": "Floor" }, ACE_FLOORS.map((f) => h("button", { type: "button", class: "ak-floor", "data-floor": f.id, "aria-pressed": String(f.id === floor) }, f.label)));
  const head = h("div", { class: "ak-fhead" });
  const plan = h("div", { class: "ak-plan" });
  const detail = h("div", { class: "ak-detail", "aria-live": "polite" });
  const drawDetail = () => {
    const z = ACE_ZONES.find((x) => x.id === zone);
    detail.replaceChildren(...[h("div", { class: "ak-dh" }, h("b", {}, z.label), badge(z.truth)), h("code", {}, z.id),
      z.count ? h("p", {}, `${z.count} ${z.unit}`) : null, z.note ? h("p", {}, z.note) : null,
      z.mock ? h("p", { class: "ak-mock" }, badge("MOCK"), ` ${z.mock.inUse} of ${z.count} ${z.unit} in use now`) : null].filter(Boolean)); // replaceChildren prints null
  };
  const drawFloor = () => {
    const f = ACE_FLOORS.find((x) => x.id === floor);
    head.replaceChildren(h("b", {}, f.title), badge(f.truth), h("span", {}, f.note));
    plan.replaceChildren(...ACE_ZONES.filter((z) => z.floor === floor).map((z) => h("button", { type: "button", class: "ak-zone", "data-zone": z.id, "aria-pressed": String(z.id === zone) },
      h("span", { class: "ak-zl" }, z.label, badge(z.truth)),
      z.count ? h("span", { class: "ak-cells" }, Array.from({ length: z.count }, (_, i) => h("i", { class: z.mock && i < z.mock.inUse ? "on" : "" }))) : null)));
    drawDetail();
  };
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".ak-floor"); if (!b) return;
    floor = b.dataset.floor; zone = ACE_ZONES.find((z) => z.floor === floor).id; pick(tabs, ".ak-floor", b); drawFloor();
  });
  plan.addEventListener("click", (e) => {
    const b = e.target.closest(".ak-zone"); if (!b) return;
    zone = b.dataset.zone; pick(plan, ".ak-zone", b); drawDetail();
    const card = b.closest(".eu-card"); if (card) tell(card, { action: "select_zone", label: `Selected ${ACE_ZONES.find((z) => z.id === zone).label}`, entities: { zone: [zone] }, quiet: true });
  });
  drawFloor();
  const legend = h("div", { class: "ak-legend" }, Object.keys(TRUTH).map((t) => h("span", {}, badge(t), ` ${TRUTH[t]}`)));
  const surface = appSurface(a, [appBar(["Twin", "Program", "Evidence"], [h("span", { class: "ap-stat" }, "occupancy: MOCK")]), tabs, head, h("div", { class: "ak-twin" }, plan, detail), legend], { cls: "ak ak-ace" });
  const el = shell(a, "ace-facility", { verb: "Campus twin", status: "Pretotype", body: surface,
    foot: [act("Ask a coach about this zone", { cls: "ghost", ack: "A coach sees the zone you picked with its truth label; MOCK numbers are never shown to them as live." })],
    summary: "Walked the ACE campus: 5 floors, 17 zones, truth-labelled" });
  return { el, async play() { stagger(plan.children, { gap: 50 }); }, spec: { kind: "ace-facility", app: a.id, source: "kvnloo/ace facility/program.ts + facility/vision.ts (MIT)",
    floors: ACE_FLOORS.map((f) => ({ id: f.id, title: f.title, truth: f.truth })), zones: ACE_ZONES.map((z) => ({ id: z.id, floor: z.floor, truth: z.truth, ...(z.count ? { count: z.count } : {}) })),
    selected: { floor: "0", zone: "zone_tennis" }, occupancy: "mock", data: "synthetic" } };
}

/* ---------------- shared skeleton view + scrubber ---------------- */
function skeleton(extra = []) {
  const bones = BONES.map(([p, q]) => svg("line", { class: "ak-bone", "data-a": p, "data-b": q }));
  const dots = JOINTS.map((j) => svg("circle", { class: "ak-joint", "data-joint": j, r: j === "nose" ? 3.2 : 1.8 }));
  const el = svg("svg", { viewBox: "0 0 100 100", class: "ak-fig", role: "img" }, ...extra, ...bones, ...dots);
  const set = (J) => {
    for (const b of bones) { const p = J[b.getAttribute("data-a")], q = J[b.getAttribute("data-b")]; b.setAttribute("x1", p[0] * 100); b.setAttribute("y1", p[1] * 100); b.setAttribute("x2", q[0] * 100); b.setAttribute("y2", q[1] * 100); }
    for (const d of dots) { const p = J[d.getAttribute("data-joint")]; d.setAttribute("cx", p[0] * 100); d.setAttribute("cy", p[1] * 100); }
  };
  const mark = (joints = []) => dots.forEach((d) => d.classList.toggle("hot", joints.includes(d.getAttribute("data-joint"))));
  return { el, set, mark };
}
function scrubber(n, label) { return h("input", { type: "range", class: "ak-scrub", min: 0, max: n - 1, step: 1, value: 0, "aria-label": label }); }
/** Plays the frames once; stops (returns false) as soon as the user scrubs or picks something. */
async function autoplay(run, n, set, fps, touched) { for (let i = 0; i < n; i++) { if (touched()) return false; set(i); await run.wait(1000 / fps); } return !touched(); }

/* ---------------- workout form analysis ---------------- */
function formMake(a) {
  const frames = squatFrames(), fixes = squatCorrections(frames), dur = frames.length / SQUAT.fps;
  const fig = skeleton([svg("line", { class: "ak-floorline", x1: 10, y1: 93, x2: 90, y2: 93 })]);
  const scrub = scrubber(frames.length, "Time in set");
  const read = h("div", { class: "ak-read" });
  const cue = h("div", { class: "ak-cue", "aria-live": "polite" }, "Scrub the set or pick a correction.");
  const track = h("div", { class: "ak-track" }, fixes.map((c, i) => h("button", { type: "button", class: `ak-mark ak-${c.id}`, "data-i": i, title: c.id, "aria-label": `${c.id} at ${s2(c.t0)}`, style: { left: `${(c.t0 / dur) * 100}%`, width: `${Math.max(1.5, ((c.t1 - c.t0) / dur) * 100)}%` } })));
  const list = h("ol", { class: "ak-fixes" }, fixes.map((c, i) => h("li", {}, h("button", { type: "button", class: "ak-fix", "data-i": i, "aria-pressed": "false" },
    h("b", {}, `Rep ${c.rep} · ${s2(c.t0)}${c.t1 > c.t0 ? `–${s2(c.t1)}` : ""}`), h("code", {}, c.id), h("span", {}, c.measured), h("em", {}, c.cue)))));
  let touched = false;
  const set = (i) => {
    const f = frames[i], m = squatMeasures(f); scrub.value = String(i); fig.set(f.joints);
    const active = fixes.filter((c) => f.t >= c.t0 - 1e-9 && f.t <= c.t1 + 1e-9);
    fig.mark(active.flatMap((c) => c.joints));
    read.replaceChildren(h("span", { class: "ak-t" }, s2(f.t)), h("span", {}, `rep ${f.rep}/${SQUAT.reps}`), h("span", {}, `knees ${Math.round(m.kneeRatio * 100)}% of ankle width`), h("span", {}, `hips ${m.hipBelowKnee >= -0.02 ? "at/below" : "above"} knee line`), h("span", { class: "ak-flags" }, active.map((c) => c.id).join(", ") || "clean"));
  };
  const choose = (i) => { const c = fixes[i]; set(frames.findIndex((f) => f.t >= c.t0 - 1e-9)); list.querySelectorAll(".ak-fix").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.i === i))); cue.replaceChildren(h("b", {}, c.cue), ` ${c.measured} (${c.joints.join(", ")})`); };
  scrub.addEventListener("input", () => { touched = true; set(+scrub.value); });
  for (const box of [track, list]) box.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) { touched = true; choose(+b.dataset.i); } });
  set(0);
  const surface = appSurface(a, [appBar(["Form", "Landmarks", "History"], [h("span", { class: "ap-stat" }, `${SQUAT.exercise} · ${SQUAT.fps} fps · synthetic`)]),
    h("div", { class: "ak-stage" }, h("div", { class: "ak-figwrap" }, fig.el), h("div", { class: "ak-side" }, read, list)), h("div", { class: "ak-scrubwrap" }, track, scrub), cue], { cls: "ak ak-form" });
  const el = shell(a, "form-check", { verb: "Checked squat form", status: `${fixes.length} fixes`, body: surface,
    foot: [act("Send cues to my coach", { cls: "ghost", entities: { correction: fixes.map((c) => c.id) }, ack: "Sent the three timed corrections with their landmark windows; the coach sees the frames, not a score." })],
    summary: `Squat: ${fixes.length} corrections over ${SQUAT.reps} reps` });
  return { el, async play(run) { if (await autoplay(run, frames.length, set, SQUAT.fps * 2, () => touched)) set(0); }, spec: { kind: "form-check", app: a.id, exercise: SQUAT.exercise, view: SQUAT.view, fps: SQUAT.fps, reps: SQUAT.reps,
    frames: frames.length, seconds: dur, joints: JOINTS, corrections: fixes, landmarks: "synthetic" } };
}

/* ---------------- tennis swing phases ---------------- */
function swingMake(a) {
  const frames = swingFrames(), n = frames.length, dur = SWING.seconds;
  const peak = frames.reduce((p, f) => (f.speedKmh > p.speedKmh ? f : p));
  const trail = svg("polyline", { class: "ak-trail", points: frames.map((f) => `${f.joints.racket_tip[0] * 100},${f.joints.racket_tip[1] * 100}`).join(" ") });
  const racket = svg("line", { class: "ak-racket" }), tip = svg("circle", { class: "ak-tip", r: 2.4 });
  const fig = skeleton([svg("line", { class: "ak-floorline", x1: 10, y1: 93, x2: 90, y2: 93 }), trail]);
  fig.el.append(racket, tip);
  const scrub = scrubber(n, "Time in swing");
  const strip = h("div", { class: "ak-phases", role: "group", "aria-label": "Swing phases" }, SWING_PHASES.map((p) => h("button", { type: "button", class: "ak-phase", "data-phase": p.id, "aria-pressed": "false", style: { flex: p.t1 - p.t0 } }, p.label)));
  strip.append(h("i", { class: "ak-contact", title: `contact ${s2(SWING_CONTACT)}`, style: { left: `${(SWING_CONTACT / dur) * 100}%` } }));
  const read = h("div", { class: "ak-read" });
  let touched = false;
  const set = (i) => {
    const f = frames[i], J = f.joints; scrub.value = String(i); fig.set(J);
    racket.setAttribute("x1", J.right_wrist[0] * 100); racket.setAttribute("y1", J.right_wrist[1] * 100); racket.setAttribute("x2", J.racket_tip[0] * 100); racket.setAttribute("y2", J.racket_tip[1] * 100);
    tip.setAttribute("cx", J.racket_tip[0] * 100); tip.setAttribute("cy", J.racket_tip[1] * 100);
    strip.querySelectorAll(".ak-phase").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.phase === f.phase)));
    const p = SWING_PHASES.find((x) => x.id === f.phase);
    read.replaceChildren(...[h("span", { class: "ak-t" }, s2(f.t)), h("b", { class: "ak-ph" }, p.label), h("span", {}, `racket head ${f.speedKmh} km/h`), h("span", {}, `hip–shoulder separation ${f.sep}°`),
      Math.abs(f.t - SWING_CONTACT) < 0.5 / SWING.fps ? h("span", { class: "ak-flags" }, "contact") : null].filter(Boolean));
  };
  scrub.addEventListener("input", () => { touched = true; set(+scrub.value); });
  strip.addEventListener("click", (e) => { const b = e.target.closest(".ak-phase"); if (!b) return; touched = true; const p = SWING_PHASES.find((x) => x.id === b.dataset.phase); set(frames.findIndex((f) => f.t >= p.t0 - 1e-9)); });
  set(frames.findIndex((f) => f.t >= SWING_CONTACT - 1e-9));
  const surface = appSurface(a, [appBar(["Swing", "Phases", "Compare"], [h("span", { class: "ap-stat" }, `Forehand · ${SWING.fps} fps · synthetic`)]),
    h("div", { class: "ak-stage" }, h("div", { class: "ak-figwrap" }, fig.el), h("div", { class: "ak-side" }, read,
      h("p", { class: "ak-note" }, `Peak racket-head speed ${peak.speedKmh} km/h at ${s2(peak.t)}, ${Math.round((SWING_CONTACT - peak.t) * 1000)} ms before contact.`))),
    h("div", { class: "ak-scrubwrap" }, strip, scrub)], { cls: "ak ak-swing" });
  const el = shell(a, "swing", { verb: "Broke down a forehand", status: `${SWING_PHASES.length} phases`, body: surface,
    foot: [act("Compare with last week", { cls: "ghost", ack: "Lined up last week's forehand by contact frame; the phases you scrub stay in sync." })],
    summary: `Forehand: peak ${peak.speedKmh} km/h, contact at ${s2(SWING_CONTACT)}` });
  return { el, async play(run) { if (await autoplay(run, n, set, SWING.fps / 2, () => touched)) set(frames.findIndex((f) => f.t >= SWING_CONTACT - 1e-9)); }, spec: { kind: "swing", app: a.id, stroke: SWING.stroke, view: SWING.view, fps: SWING.fps,
    frames: n, seconds: dur, phases: SWING_PHASES.map(({ id, label, t0, t1 }) => ({ id, label, t0, t1 })), contact: SWING_CONTACT, peak: { t: peak.t, speedKmh: peak.speedKmh, phase: peak.phase }, joints: [...JOINTS, "racket_tip"], landmarks: "synthetic" } };
}

export const KINDS_K = {
  "ace-facility": { label: "ACE campus twin", verb: () => "Campus twin", make: aceMake },
  "form-check": { label: "Workout form analysis", verb: () => "Checked form", make: formMake },
  swing: { label: "Tennis swing phases", verb: () => "Swing breakdown", make: swingMake },
};
