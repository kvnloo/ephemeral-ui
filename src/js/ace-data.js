// Synthetic fixtures for the advanced kits (kinds-k.js): the ACE campus twin, workout form analysis and a tennis
// swing. The facility program is the public ACE pretotype's (github.com/kvnloo/ace, MIT: facility/program.ts and
// facility/vision.ts), restated as data with its truth labels; occupancy and every body landmark are made up.
// Landmarks are 2D image coordinates in [0, 1], y down (the MediaPipe Pose convention), sampled at `fps`.

/* ---------------- ACE facility: floors, zones and truth labels ---------------- */
// SPEC: sourced program fact. VISION: intended program. PLANNED: sourced but undecided. MOCK: illustrative twin state.
export const ACE_FLOORS = [
  { id: "0", label: "Ground", title: "Tennis arena", truth: "SPEC", note: "24 courts · hard / clay / grass / wood · surface split unspecified" },
  { id: "1", label: "L1", title: "Racquet mezzanine", truth: "SPEC", note: "16 badminton · 4 squash · 16 table tennis" },
  { id: "2", label: "L2", title: "Pickleball & heritage", truth: "SPEC", note: "8 pickleball · 1 real tennis" },
  { id: "3", label: "L3", title: "Vertical grass lab", truth: "PLANNED", note: "500 m² per section · section count unspecified" },
  { id: "APEX", label: "APEX", title: "APEX campus wing", truth: "VISION", note: "labs, physio, gym, pool, clubhouse · cells inferred" },
];
export const ACE_ZONES = [
  { id: "zone_tennis", floor: "0", label: "Tennis courts", count: 24, unit: "courts", truth: "SPEC", note: "Surfaces: hard, clay, grass, wood. The split is unspecified; no per-court surface is drawn.", mock: { inUse: 14 } },
  { id: "zone_pro_shop", floor: "0", label: "Pro shop", truth: "SPEC", note: "Retail and stringing beside the arena." },
  { id: "zone_badminton", floor: "1", label: "Badminton", count: 16, unit: "courts", truth: "SPEC", mock: { inUse: 9 } },
  { id: "zone_squash", floor: "1", label: "Squash", count: 4, unit: "courts", truth: "SPEC", mock: { inUse: 3 } },
  { id: "zone_table_tennis", floor: "1", label: "Table tennis", count: 16, unit: "tables", truth: "SPEC", mock: { inUse: 6 } },
  { id: "zone_pickleball", floor: "2", label: "Pickleball", count: 8, unit: "courts", truth: "SPEC", mock: { inUse: 8 } },
  { id: "zone_real_tennis", floor: "2", label: "Real tennis", count: 1, unit: "court", truth: "SPEC", mock: { inUse: 0 } },
  { id: "zone_grass_lab", floor: "3", label: "Grass lab section", truth: "PLANNED", note: "500 m² per section; how many sections is unspecified, so one is drawn." },
  { id: "zone_biometric", floor: "APEX", label: "Biometric lab", truth: "VISION", note: "VO2, force plate and mocap language; capacity unspecified." },
  { id: "zone_cognitive", floor: "APEX", label: "Cognitive lab", truth: "VISION", note: "Cognitive training; capacity unspecified." },
  { id: "zone_movement", floor: "APEX", label: "Movement studio", truth: "VISION", note: "Movement optimization; capacity unspecified." },
  { id: "zone_research", floor: "APEX", label: "Research integration", truth: "VISION", note: "Scientists and protocol translation; capacity unspecified." },
  { id: "zone_nutrition", floor: "APEX", label: "Nutrition kitchen", truth: "VISION", note: "Personalized nutrition language; capacity unspecified." },
  { id: "zone_recovery", floor: "APEX", label: "Recovery / physio", truth: "VISION", note: "Recovery suite and physiotherapy; not a live clinic twin." },
  { id: "zone_gym", floor: "APEX", label: "Gym", truth: "VISION", note: "All-sports training floor; capacity unspecified." },
  { id: "zone_pool", floor: "APEX", label: "Pool", truth: "VISION", note: "Aquatic training; capacity unspecified." },
  { id: "zone_clubhouse", floor: "APEX", label: "Clubhouse", truth: "VISION", note: "Scientists, athletes and members; capacity unspecified." },
];

/* ---------------- shared skeleton ---------------- */
export const JOINTS = ["nose", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"];
export const BONES = [["left_shoulder", "right_shoulder"], ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"], ["left_hip", "right_hip"], ["left_hip", "left_knee"], ["left_knee", "left_ankle"], ["right_hip", "right_knee"], ["right_knee", "right_ankle"]];
const r4 = (v) => Math.round(v * 10000) / 10000;
const pt = (x, y) => [r4(x), r4(y)];

/* ---------------- workout form: three front-view back squats ---------------- */
// Rep 1 is clean; rep 2 caves the knees in (valgus); rep 3 stops above parallel and shifts the hips right.
export const SQUAT = { exercise: "Back squat", view: "front", fps: 15, reps: 3, repSeconds: 2, camera: "phone, 1.2 m high, 3 m away (synthetic)" };
const SQUAT_REPS = [{ depth: 1, valgus: 0, shift: 0 }, { depth: 1, valgus: 1, shift: 0 }, { depth: 0.6, valgus: 0, shift: 0.04 }];

function squatPose(t) {
  const rep = Math.min(SQUAT.reps - 1, Math.floor(t / SQUAT.repSeconds)), p = SQUAT_REPS[rep];
  const d = (1 - Math.cos((2 * Math.PI * (t - rep * SQUAT.repSeconds)) / SQUAT.repSeconds)) / 2; // 0 standing → 1 bottom
  const cx = 0.5 + p.shift * d, hipY = 0.55 + 0.24 * p.depth * d, kneeY = 0.74 + 0.03 * d, sh = hipY - 0.27 + 0.04 * d;
  const knee = 0.1 + 0.02 * d - 0.07 * p.valgus * d; // half the knee width; the ankles stay 0.1 either side
  // The subject faces the camera, so their left is image right (+x).
  return { rep, d, joints: {
    nose: pt(cx, sh - 0.09), left_shoulder: pt(cx + 0.11, sh), right_shoulder: pt(cx - 0.11, sh),
    left_elbow: pt(cx + 0.15, sh - 0.03), right_elbow: pt(cx - 0.15, sh - 0.03), left_wrist: pt(cx + 0.09, sh - 0.04), right_wrist: pt(cx - 0.09, sh - 0.04),
    left_hip: pt(cx + 0.07, hipY), right_hip: pt(cx - 0.07, hipY), left_knee: pt(0.5 + knee, kneeY), right_knee: pt(0.5 - knee, kneeY),
    left_ankle: pt(0.6, 0.92), right_ankle: pt(0.4, 0.92) } };
}

/** Timed landmarks: one frame per 1/fps second over all reps. */
export function squatFrames() {
  const n = SQUAT.reps * SQUAT.repSeconds * SQUAT.fps;
  return Array.from({ length: n }, (_, i) => { const t = r4(i / SQUAT.fps), { rep, joints } = squatPose(t); return { t, rep: rep + 1, joints }; });
}

/** Per-frame measures the corrections read. */
export function squatMeasures(f) {
  const J = f.joints, mid = (a, b) => (J[a][0] + J[b][0]) / 2;
  return {
    kneeRatio: Math.abs(J.left_knee[0] - J.right_knee[0]) / Math.abs(J.left_ankle[0] - J.right_ankle[0]), // < 0.8: knees caving in
    hipBelowKnee: (J.left_hip[1] + J.right_hip[1]) / 2 - (J.left_knee[1] + J.right_knee[1]) / 2, // ≥ −0.02: at or below parallel
    hipShift: mid("left_hip", "right_hip") - mid("left_ankle", "right_ankle"), // |x| > 0.02: lateral shift
  };
}

const RULES = [
  { id: "knee_valgus", joints: ["left_knee", "right_knee"], test: (m) => m.kneeRatio < 0.8, value: (m) => m.kneeRatio, worst: Math.min, fmt: (v) => `knees at ${Math.round(v * 100)}% of ankle width`, cue: "Push the knees out over the toes." },
  { id: "hip_lateral_shift", joints: ["left_hip", "right_hip"], test: (m) => Math.abs(m.hipShift) > 0.02, value: (m) => Math.abs(m.hipShift), worst: Math.max, fmt: (v) => `hips ${Math.round(v * 1000) / 10}% of frame width off centre`, cue: "Keep the weight even on both feet." },
];

/** Corrections found in the landmarks: each a time window, the joints involved, what was measured and the cue. */
export function squatCorrections(frames = squatFrames()) {
  const out = [];
  for (const rule of RULES) {
    let run = null;
    const close = () => { if (run) out.push({ id: rule.id, rep: run.rep, t0: run.t0, t1: run.t1, joints: rule.joints, measured: rule.fmt(run.v), cue: rule.cue }); run = null; };
    for (const f of frames) {
      const m = squatMeasures(f);
      if (rule.test(m) && (!run || run.rep === f.rep)) { const v = rule.value(m); run = run ? { ...run, t1: f.t, v: rule.worst(run.v, v) } : { rep: f.rep, t0: f.t, t1: f.t, v }; } else close();
    }
    close();
  }
  // depth: judged once per rep, at its bottom frame
  for (let rep = 1; rep <= SQUAT.reps; rep++) {
    const fs = frames.filter((f) => f.rep === rep), bottom = fs.reduce((a, b) => (squatMeasures(b).hipBelowKnee > squatMeasures(a).hipBelowKnee ? b : a));
    const m = squatMeasures(bottom);
    if (m.hipBelowKnee < -0.02) out.push({ id: "depth_above_parallel", rep, t0: bottom.t, t1: bottom.t, joints: ["left_hip", "right_hip", "left_knee", "right_knee"], measured: `hips ${Math.round(-m.hipBelowKnee * 1000) / 10}% of frame height above the knees`, cue: "Sit lower: hip crease to knee height." });
  }
  return out.sort((a, b) => a.t0 - b.t0 || a.id.localeCompare(b.id));
}

/* ---------------- tennis: one forehand, side view ---------------- */
// The racket tip turns about the hitting shoulder; θ is measured from +x (towards the net), counter-clockwise, y up.
export const SWING = { stroke: "Forehand (right-handed)", view: "side", fps: 60, seconds: 1.7, reachM: 1.1, camera: "tripod, side-on at the baseline (synthetic)" };
export const SWING_PHASES = [
  { id: "ready", label: "Ready", t0: 0, t1: 0.2, th0: -40, th1: -40, sep0: 0, sep1: 0 },
  { id: "unit_turn", label: "Unit turn", t0: 0.2, t1: 0.45, th0: -40, th1: -160, sep0: 0, sep1: 45 },
  { id: "backswing", label: "Backswing", t0: 0.45, t1: 0.8, th0: -160, th1: -130, sep0: 45, sep1: 50 },
  { id: "forward_swing", label: "Forward swing", t0: 0.8, t1: 0.95, th0: -130, th1: 0, sep0: 50, sep1: 10, ease: "in" },
  { id: "follow_through", label: "Follow-through", t0: 0.95, t1: 1.25, th0: 0, th1: 110, sep0: 10, sep1: -30, ease: "out" },
  { id: "recovery", label: "Recovery", t0: 1.25, t1: 1.7, th0: 110, th1: -40, sep0: -30, sep1: 0 },
];
export const SWING_CONTACT = 0.95; // the end of the forward swing: tip in front of the body at shoulder height

const ease = { in: (k) => k * k, out: (k) => 1 - (1 - k) * (1 - k), both: (k) => k * k * (3 - 2 * k) };
export function swingPhaseAt(t) { return SWING_PHASES.find((p) => t >= p.t0 && t < p.t1) || SWING_PHASES.at(-1); }

function swingPose(t) {
  const p = swingPhaseAt(t), k = ease[p.ease || "both"](Math.min(1, (t - p.t0) / (p.t1 - p.t0)));
  const th = (p.th0 + (p.th1 - p.th0) * k) * (Math.PI / 180), sep = p.sep0 + (p.sep1 - p.sep0) * k;
  const load = p.id === "backswing" ? 0.03 : p.id === "forward_swing" ? 0.03 * (1 - k) : 0;
  const sx = 0.48, sy = 0.36 + load, R = 0.3; // shoulder; R in frame units for the drawn reach
  const tip = pt(sx + R * Math.cos(th), sy - R * Math.sin(th)), hand = pt(sx + 0.45 * R * Math.cos(th), sy - 0.45 * R * Math.sin(th));
  const turn = Math.cos((sep * Math.PI) / 180) * 0.05;
  return { phase: p.id, sep: Math.round(sep * 10) / 10, joints: {
    nose: pt(sx + 0.03, sy - 0.1), right_shoulder: pt(sx, sy), left_shoulder: pt(sx - turn, sy + 0.01), right_elbow: pt((sx + hand[0]) / 2, (sy + hand[1]) / 2 + 0.02), right_wrist: hand,
    left_elbow: pt(sx - turn + 0.06, sy + 0.1), left_wrist: pt(sx - turn + 0.12, sy + 0.06), right_hip: pt(0.5, 0.6 + load), left_hip: pt(0.47, 0.6 + load),
    right_knee: pt(0.54, 0.76 + load / 2), left_knee: pt(0.43, 0.76 + load / 2), right_ankle: pt(0.56, 0.92), left_ankle: pt(0.38, 0.92), racket_tip: tip }, th };
}

/** Timed landmarks (plus racket_tip) and racket-head speed from the tip's angular speed about the shoulder. */
export function swingFrames() {
  const n = Math.round(SWING.seconds * SWING.fps), dt = 1 / SWING.fps;
  const frames = Array.from({ length: n }, (_, i) => { const t = r4(i * dt), s = swingPose(t); return { t, phase: s.phase, sep: s.sep, th: s.th, joints: s.joints }; });
  return frames.map((f, i) => {
    const a = frames[Math.max(0, i - 1)], b = frames[Math.min(n - 1, i + 1)];
    const w = Math.abs(b.th - a.th) / (b.t - a.t || dt); // rad/s
    const { th, ...rest } = f;
    return { ...rest, speedKmh: Math.round(w * SWING.reachM * 3.6) };
  });
}
