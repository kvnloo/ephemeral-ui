// Card kinds, part F: a warehouse digital twin whose robots obey Bend-proven policies, and health
// cards that merge wearables and food logs into the one number that matters today.
import { h, anim, stagger, countUp, typeText, Run } from "./motion.js";
import { shell, burst, holdButton, svg } from "./shell.js";
import { appSurface, appBar } from "./chrome.js";
import { stage3d, sunRig, rand } from "./stage3d.js";

/* ---------------- twin: warehouse fleet under Bend policies ---------------- */
const LAWS = [
  ["speed_near_humans", "v ≤ 0.5 m/s within 2 m of a person", "speed"],
  ["no_wet_aisle", "transport robots never enter an aisle a cleaner marked wet", "wet"],
  ["dock_battery", "battery < 20% ⇒ next action is dock", "dock"],
  ["one_way_aisles", "aisles B and D are one-way north", "oneway"],
];
function twinMake(a, r) {
  const laws = h("ol", { class: "tw-laws" }, LAWS.map(([id, txt]) => h("li", { "data-id": id }, h("code", {}, `law ${id}`), h("span", {}, txt), h("b", { class: "tw-st" }, "proved"))));
  const log = h("div", { class: "tw-log" });
  const kpi = h("div", { class: "tw-kpi" }, h("span", {}, h("b", { class: "k-pick" }, "0"), " picks"), h("span", {}, h("b", { class: "k-block" }, "0"), " blocked moves"), h("span", {}, h("b", {}, "0"), " violations"));
  const vp = h("div", { class: "vp" });
  const hit = (id, msg) => {
    const li = laws.querySelector(`[data-id="${id}"]`); li.classList.add("fire"); setTimeout(() => li.classList.remove("fire"), 900);
    const row = h("div", {}, h("code", {}, id), ` ${msg}`); log.prepend(row); anim(row, [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
    while (log.children.length > 4) log.lastChild.remove();
    const b = kpi.querySelector(".k-block"); b.textContent = +b.textContent + 1;
  };
  stage3d(vp, (T, v) => {
    v.shadows = true;
    v.orbit = { yaw: 0.6, pitch: 0.85, dist: 17, target: [0, 0, 0] };
    sunRig(T, v.scene, { pos: [6, 18, 8], shadow: 14, intensity: 1.8, sky: 0xdfe8f2 });
    const floor = new T.Mesh(new T.PlaneGeometry(26, 18), new T.MeshStandardMaterial({ color: 0xb9bdc3, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; v.scene.add(floor);
    const rackM = new T.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.6 }), boxM = new T.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.8 });
    const aisles = [-8, -4, 0, 4, 8];
    for (const x of [-10, -6, -2, 2, 6, 10]) for (const z of [-6, 0, 6]) { const rk = new T.Mesh(new T.BoxGeometry(1.4, 2.2, 4.6), rackM); rk.position.set(x, 1.1, z); rk.castShadow = true; v.scene.add(rk); for (let k = 0; k < 3; k++) { const bx = new T.Mesh(new T.BoxGeometry(1.1, 0.5, 1.1), boxM); bx.position.set(x, 0.5 + k * 0.7, z - 1.4 + k * 1.3); v.scene.add(bx); } }
    // one-way arrows on B and D
    for (const x of [aisles[1], aisles[3]]) for (const z of [-6, 0, 6]) { const ar = new T.Mesh(new T.ConeGeometry(0.35, 0.8, 3), new T.MeshBasicMaterial({ color: 0xffffff })); ar.rotation.x = -Math.PI / 2; ar.position.set(x, 0.03, z); v.scene.add(ar); }
    const wet = new T.Mesh(new T.PlaneGeometry(2.6, 16), new T.MeshBasicMaterial({ color: 0x3fa9f5, transparent: true, opacity: 0.35 })); wet.rotation.x = -Math.PI / 2; wet.position.set(aisles[2], 0.02, 0); v.scene.add(wet);
    const dock = new T.Mesh(new T.BoxGeometry(2, 0.1, 1.4), new T.MeshBasicMaterial({ color: 0x22c55e })); dock.position.set(-11.5, 0.05, -8); v.scene.add(dock);
    const human = new T.Mesh(new T.CapsuleGeometry(0.3, 1.1, 6, 12), new T.MeshStandardMaterial({ color: 0xff8a3d })); human.position.set(4, 0.85, 0); human.castShadow = true; v.scene.add(human);
    const ring = new T.Mesh(new T.RingGeometry(1.95, 2.05, 48), new T.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.6 })); ring.rotation.x = -Math.PI / 2; v.scene.add(ring);
    const mk = (c, kind) => { const g = new T.Group(); const b = new T.Mesh(kind === "clean" ? new T.CylinderGeometry(0.45, 0.45, 0.35, 24) : new T.BoxGeometry(0.9, 0.35, 1.2), new T.MeshStandardMaterial({ color: c, roughness: 0.4 })); b.position.y = 0.2; b.castShadow = true; g.add(b); const led = new T.Mesh(new T.SphereGeometry(0.09), new T.MeshBasicMaterial({ color: 0x22c55e })); led.position.y = 0.45; g.add(led); g.led = led; g.scale.setScalar(1.7); v.scene.add(g); return g; };
    const bots = [
      { g: mk(0xf2f2f2, "clean"), kind: "clean", x: aisles[2], z: -7, dz: 1, bat: 64 },
      { g: mk(0x2b2f36, "amr"), kind: "amr", x: aisles[1], z: 7, dz: -1, bat: 81 },
      { g: mk(0x2b2f36, "amr"), kind: "amr", x: aisles[3], z: 6, dz: -1, bat: 23 },
      { g: mk(0x2b2f36, "amr"), kind: "amr", x: aisles[0], z: -3, dz: 1, bat: 55, wantsWet: true },
    ];
    let t0 = 0, picks = 0, nextPick = 2;
    return (dt, t) => {
      if (v.auto) v.orbit.yaw += dt * 0.05;
      v.applyOrbit();
      t0 += dt;
      human.position.x = 4 + Math.sin(t * 0.4) * 3.5; ring.position.set(human.position.x, 0.03, human.position.z);
      for (const b of bots) {
        let speed = b.kind === "clean" ? 1.0 : 2.2;
        const near = Math.hypot(b.x - human.position.x, b.z - human.position.z) < 2;
        if (near && speed > 0.5) { speed = 0.5; if (!b.slow) { b.slow = true; hit("speed_near_humans", `${b.kind === "clean" ? "cleaner" : "AMR"} capped at 0.5 m/s`); } } else b.slow = false;
        b.bat -= dt * (b.kind === "clean" ? 0.6 : 0.9);
        if (b.bat < 20 && !b.docking) { b.docking = true; hit("dock_battery", `AMR at ${Math.round(b.bat)}% rerouted to dock`); }
        if (b.docking) { const dx = -11.5 - b.x, dz = -8 - b.z, L = Math.hypot(dx, dz); if (L > 0.1) { b.x += (dx / L) * dt * 1.8; b.z += (dz / L) * dt * 1.8; } else { b.bat = Math.min(100, b.bat + dt * 30); if (b.bat > 90) { b.docking = false; b.x = aisles[3]; b.z = 6; } } }
        else {
          if (b.kind === "amr" && (b.x === aisles[1] || b.x === aisles[3]) && b.dz > 0) b.dz = -1;
          b.z += b.dz * speed * dt;
          if (b.z > 7.5 || b.z < -7.5) {
            if (b.kind === "amr" && (b.x === aisles[1] || b.x === aisles[3])) { b.z = 7.5; hit("one_way_aisles", "AMR looped back to aisle start (north only)"); }
            else b.dz *= -1;
            if (b.wantsWet) { hit("no_wet_aisle", "plan through aisle C refused; took aisle A"); b.wantsWet = false; setTimeout(() => (b.wantsWet = true), 7000); }
          }
        }
        b.g.position.set(b.x, 0, b.z); b.g.rotation.y = b.dz > 0 ? 0 : Math.PI;
        b.g.led.material.color.setHex(b.docking ? 0xf5a524 : b.slow ? 0xff8a3d : 0x22c55e);
      }
      wet.position.z = bots[0].z / 2 - 3.5; wet.scale.y = 0.6;
      if (t0 > nextPick) { nextPick = t0 + 1.6; picks++; kpi.querySelector(".k-pick").textContent = picks; }
    };
  }, { bg: 0xe9edf2, shadows: true, aspect: 16 / 9 });
  const editor = h("pre", { class: "ap-code tw-src" });
  const src = ["-- warehouse.bend · checked before any plan reaches a robot", "law no_wet_aisle(plan, map):", "  ∀ step ∈ plan.", "    robot.kind = AMR ⇒ step.aisle ∉ map.wet", "", "law dock_battery(r):", "  r.battery < 20 ⇒ next(r) = Dock", "", "$ bend_verify --verdict", "VERIFIED · 4 laws · 2,048 cases · 0 counterexamples"];
  const surface = appSurface(a, [appBar(["Twin", "Policies", "Fleet", "Replay"], [h("span", { class: "ap-stat" }, "4 robots · Bend-gated")]), h("div", { class: "ap-vpwrap" }, vp), kpi, h("div", { class: "tw-grid" }, h("div", {}, laws, log), editor)], { cls: "twin" });
  const el = shell(a, "twin", { verb: "Fleet under proven policies", status: "Live", body: surface, foot: [holdButton("Hold to deploy policy v4", (b, t) => { t.textContent = "Deployed to 4 robots"; burst(b); }), h("button", { class: "eu-btn ghost" }, "Replay last shift")], summary: "Ran the warehouse twin with 4 Bend-proven laws, 0 violations" });
  return { el, async play(run) { stagger(laws.children, { gap: 80 }); for (const l of src) { const d = h("div"); editor.append(d); await typeText(d, l, run, 120); } }, spec: { kind: "twin", app: a.id, robots: ["cleaner", "AMR ×3"], laws: LAWS.map((l) => l[0]), gate: "bend_verify before every plan" } };
}

/* ---------------- health: many sources, one decision ---------------- */
const SRC = {
  "apple-health": ["Apple Health", "rings"], "google-fit": ["Google Fit", "hearts"], oura: ["Oura", "readiness"], whoop: ["WHOOP", "recovery"], noop: ["NOOP", "recovery"], myfitnesspal: ["MyFitnessPal", "food"], lifesum: ["Lifesum", "food"], strava: ["Strava", "load"], garmin: ["Garmin", "load"], gadgetbridge: ["Gadgetbridge", "recovery"],
};
function healthMake(a, r) {
  const mode = (SRC[a.id] || [a.name, "recovery"])[1];
  const R = 46, C = 2 * Math.PI * R;
  const ring = (cls, val, col, rr) => svg("circle", { cx: 60, cy: 60, r: rr, class: "hl-arc " + cls, stroke: col, "stroke-dasharray": `${2 * Math.PI * rr}`, "stroke-dashoffset": `${2 * Math.PI * rr}`, "data-v": val });
  const rings = svg("svg", { viewBox: "0 0 120 120", class: "hl-rings" },
    ...(mode === "rings" ? [[46, 0.82, "#fa114f"], [36, 0.64, "#a6ff00"], [26, 0.9, "#00f0ff"]] : mode === "food" ? [[46, 0.71, "#22c55e"]] : [[46, 0.68, mode === "readiness" ? "#b9a6ff" : "#16ec06"]]).flatMap(([rr, v, c]) => [svg("circle", { cx: 60, cy: 60, r: rr, class: "hl-trk" }), ring("", v, c, rr)]));
  const big = h("b", { class: "hl-big" }, "0");
  const label = { rings: "Move · Exercise · Stand", food: "1,420 / 2,000 kcal", readiness: "Readiness", recovery: "Recovery", hearts: "Heart Points", load: "Training load" }[mode];
  const days = ["M", "T", "W", "T", "F", "S", "S"], hrv = [52, 61, 47, 44, 58, 66, 63], slp = [[1.1, 1.6, 3.9, 0.6], [1.3, 1.8, 4.1, 0.4], [0.8, 1.2, 3.6, 0.9], [0.7, 1.1, 3.2, 1.1], [1.2, 1.7, 4.0, 0.5], [1.4, 2.0, 4.3, 0.3], [1.3, 1.9, 4.2, 0.4]];
  const spark = svg("svg", { viewBox: "0 0 140 40", class: "hl-spark" }, svg("polyline", { points: hrv.map((v, i) => `${i * 23},${40 - (v - 40) * 1.4}`).join(" "), pathLength: 1 }), ...hrv.map((v, i) => svg("circle", { cx: i * 23, cy: 40 - (v - 40) * 1.4, r: i === 6 ? 3 : 1.6 })));
  const sleep = h("div", { class: "hl-sleep" }, slp.map((d, i) => h("div", { class: "hl-day" }, h("div", { class: "hl-bar" }, d.map((x, k) => h("i", { class: ["deep", "rem", "light", "awake"][k], style: { flex: x } }))), h("span", {}, days[i]))));
  const macros = h("div", { class: "hl-mac" }, [["Protein", 92, 140, "#ef4444"], ["Carbs", 160, 220, "#f59e0b"], ["Fat", 48, 65, "#3b82f6"]].map(([n, v, g, c]) => h("div", {}, h("span", {}, n, h("em", {}, `${v}/${g} g`)), h("i", { style: { "--p": v / g, "--c": c } }))));
  const sources = h("div", { class: "hl-src" }, ["oura", "whoop", "apple-health", "myfitnesspal"].map((s) => h("span", { class: s === a.id ? "on" : "" }, SRC[s][0])));
  // the AI-native part: one decision built from all sources, with the reason
  const verdict = h("div", { class: "hl-verdict" }, h("span", { class: "kicker" }, "Today"), h("b", {}, ""), h("p", {}, ""));
  const plan = h("div", { class: "row wrap hl-acts" }, ["Move run to 6 pm", "Zone 2, 40 min", "+45 g protein at lunch"].map((t) => h("button", { type: "button", class: "ap-chip" }, t)));
  plan.addEventListener("click", (e) => { const b = e.target.closest(".ap-chip"); if (b) { b.classList.toggle("on"); if (b.classList.contains("on")) burst(b, "#22c55e", 8); } });
  const top = h("div", { class: "hl-top" }, h("div", { class: "hl-ringwrap" }, rings, h("div", { class: "hl-center" }, big, h("span", {}, label))), h("div", { class: "hl-side" }, h("span", { class: "ap-lbl" }, "HRV · 7 days (ms)"), spark, h("span", { class: "ap-lbl" }, "Sleep stages"), sleep));
  const surface = appSurface(a, [appBar([a.name, "Trends", "Journal"], [sources]), top, mode === "food" ? macros : null, verdict, plan], { cls: "health" });
  const el = shell(a, "health", { verb: "Merged 4 sources", status: "Synced", body: surface, foot: [h("button", { class: "eu-btn primary" }, "Add plan to calendar"), h("button", { class: "eu-btn ghost" }, "Why?")], summary: "Recovery 68%: moved the hard run to tomorrow" });
  return { el, async play(run) {
    rings.querySelectorAll(".hl-arc").forEach((c, i) => { const L = +c.getAttribute("stroke-dasharray"); anim(c, [{ strokeDashoffset: L }, { strokeDashoffset: L * (1 - +c.dataset.v) }], { duration: 1200, delay: i * 140, easing: "cubic-bezier(.16,1,.3,1)" }); });
    const v = +rings.querySelector(".hl-arc").dataset.v;
    countUp(big, mode === "food" ? 1420 : mode === "hearts" ? 34 : Math.round(v * 100), { dur: 1200, fmt: (x) => (mode === "food" ? Math.round(x).toLocaleString() : Math.round(x) + (mode === "hearts" ? "" : "%")) });
    const pl = spark.querySelector("polyline"); anim(pl, [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: 1000, delay: 300 });
    stagger(sleep.children, { gap: 50, delay: 200 });
    await run.wait(1300);
    await typeText(verdict.querySelector("b"), "Go easy until 6 pm.", run, 30);
    await typeText(verdict.querySelector("p"), "HRV is 63 ms (above your 56 ms baseline) but deep sleep was short two nights running, and you're 48 g under on protein. Oura and WHOOP agree; the scale didn't sync.", run, 90);
    stagger(plan.children, { gap: 80, sp: "bouncy" });
  }, spec: { kind: "health", app: a.id, sources: ["oura", "whoop", "apple-health", "myfitnesspal"], metric: mode, decision: "easy until 6 pm", data: "demo" } };
}

export const KINDS_F = {
  twin: { label: "Digital twin + policies", verb: () => "Fleet under policy", make: twinMake, three: true },
  health: { label: "Health brief", verb: () => "Merged health data", make: healthMake },
};
