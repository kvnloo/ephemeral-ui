// Card kinds, part C: 3D. Sculpt with several agents, PCG city blockout, camera flythrough, FPV drone,
// lighting rigs, game triggers, a live globe, image-to-3D, robot sim. All draw through stage3d.js.
import { h, anim, stagger, typeText, pick, Run } from "./motion.js";
import { shell, burst, seg, holdButton, svg } from "./shell.js";
import { stage3d, makeCity, sunRig, clayMatcap, fbm, rand } from "./stage3d.js";
import { appSurface, appBar, uiOf } from "./chrome.js";

const isGame = (a) => ["unreal", "unity", "godot", "roblox", "playcanvas", "gamemaker"].includes(a.ui);
const engineWord = (a) => ({ unreal: "Lumen", unity: "HDRP", godot: "SDFGI", blender: "Cycles", c4d: "Redshift", maya: "Arnold", houdini: "Karma", omni: "RTX", usd: "Storm" })[a.ui] || "Path tracer";

/* ---------------- sculpt: several agents on one mesh, plus the script they run ---------------- */
const BRUSHES = [["Draw", "V", 1, 0.32], ["Clay Strips", "C", 1, 0.26], ["Crease", "⇧C", -1, 0.14], ["Inflate", "I", 1, 0.4], ["Smooth", "⇧", 0, 0.3]];
const AGENTS = [{ n: "Agent A", c: "#ff8f40", brush: 1, plan: "brow ridge" }, { n: "Agent B", c: "#4cc2ff", brush: 2, plan: "eye sockets" }, { n: "Agent C", c: "#9cf26d", brush: 4, plan: "smooth cheeks" }];

function sculptMake(a, r) {
  const ui = uiOf(a) || {};
  const vp = h("div", { class: "vp" });
  const brushes = h("div", { class: "ap-tools" }, BRUSHES.map(([n, k], i) => h("button", { type: "button", class: "ap-tool" + (i === 1 ? " on" : ""), title: `${n} (${k})`, "data-i": i }, h("b", {}, n.split(" ").map((w) => w[0]).join("")), h("kbd", {}, k))));
  const code = h("pre", { class: "ap-code" });
  const tags = AGENTS.map((g) => h("div", { class: "v3-tag", style: { "--c": g.c } }, h("i"), h("span", {}, `${g.n} · ${BRUSHES[g.brush][0]}`)));
  const you = h("div", { class: "v3-tag you", hidden: true, style: { "--c": ui.acc || "#4772b3" } }, h("i"), h("span", {}, "You"));
  const stats = h("span", { class: "ap-stat" }, "Verts 0");
  const mode = a.ui === "zbrush" ? ["Edit", "Draw", "Move", "Scale", "Rotate"] : a.ui === "nomad" ? ["Sculpt", "Paint", "Mask"] : ["Sculpt Mode", "View", "Sculpt", "Mask", "Face Sets"];
  const surface = appSurface(a, [appBar(mode, [stats]), h("div", { class: "ap-split" }, h("div", { class: "ap-vpwrap" }, brushes, vp), code)], { cls: "sculpt" });
  let picked = 1;
  brushes.addEventListener("click", (e) => { const b = e.target.closest(".ap-tool"); if (!b) return; picked = +b.dataset.i; brushes.querySelectorAll(".ap-tool").forEach((x) => x.classList.toggle("on", x === b)); });
  const V = stage3d(vp, (T, v) => {
    v.orbit = { yaw: 0.3, pitch: 0.18, dist: 3.3, target: [0, 0, 0] };
    const geo = new T.IcosahedronGeometry(1, 30);
    const pos = geo.attributes.position, base = pos.array.slice(), n = pos.count;
    const disp = new Float32Array(n);
    const mesh = new T.Mesh(geo, new T.MeshMatcapMaterial({ matcap: clayMatcap(T, a.ui === "zbrush" ? [190, 120, 90] : [196, 190, 182]) }));
    v.scene.add(mesh);
    const grid = new T.GridHelper(8, 16, 0x555555, 0x444444); grid.position.y = -1.25; v.scene.add(grid);
    stats.textContent = `Verts ${(n / 3 * 0.5 | 0).toLocaleString()} · Dyntopo`;
    const dirs = AGENTS.map((_, i) => ({ th: i * 2.1, ph: 0.3 + i * 0.4 }));
    const tmp = new T.Vector3(), hit = { p: null, on: false };
    function stroke(dir, bi, strength) {
      const [, , sign, rad] = BRUSHES[bi];
      const r2 = rad * rad;
      for (let i = 0; i < n; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        const dx = x - dir.x, dy = y - dir.y, dz = z - dir.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        const f = 1 - d2 / r2, w = f * f * (3 - 2 * f);
        if (sign === 0) disp[i] *= 1 - w * 0.12 * strength; else disp[i] = Math.max(-0.18, Math.min(0.3, disp[i] + sign * w * 0.0065 * strength * (bi === 3 ? 1.6 : 1)));
      }
    }
    v.onDown = (e, p) => { hit.on = true; you.hidden = false; };
    v.onDrag = (e, p) => { v.ray.setFromCamera(p, v.camera); const hs = v.ray.intersectObject(mesh); if (hs.length) { hit.p = hs[0].point.clone().normalize(); } };
    v.onUp = () => { hit.on = false; hit.p = null; setTimeout(() => (you.hidden = true), 600); };
    let frame = 0;
    return (dt, t) => {
      if (v.auto) v.orbit.yaw += dt * 0.25;
      v.applyOrbit();
      AGENTS.forEach((g, i) => {
        const d = dirs[i];
        d.th += dt * (0.7 + i * 0.25); d.ph = 0.15 + Math.sin(t * (0.5 + i * 0.2) + i) * 0.55;
        const front = v.orbit.yaw + Math.sin(d.th) * 0.9;
        tmp.set(Math.sin(front) * Math.cos(d.ph), Math.sin(d.ph), Math.cos(front) * Math.cos(d.ph)).normalize();
        stroke(tmp, g.brush, dt * 60);
        const s = v.toScreen(tmp.clone().multiplyScalar(1 + disp[0] * 0 + 0.05));
        tags[i].style.translate = `${s.x}px ${s.y}px`; tags[i].hidden = s.behind;
      });
      if (hit.on && hit.p) { stroke(hit.p, picked, dt * 90); const s = v.toScreen(hit.p.clone().multiplyScalar(1.05)); you.style.translate = `${s.x}px ${s.y}px`; }
      for (let i = 0; i < n; i++) { const k = 1 + disp[i]; pos.array[i * 3] = base[i * 3] * k; pos.array[i * 3 + 1] = base[i * 3 + 1] * k; pos.array[i * 3 + 2] = base[i * 3 + 2] * k; }
      pos.needsUpdate = true;
      if (++frame % 2 === 0) geo.computeVertexNormals();
    };
  }, { bg: parseInt((ui.view || "#393939").slice(1), 16) });
  V.hud.append(...tags, you);
  const script = a.ui === "blender" || a.ui === "blockbench" ? [
    "import bpy",
    "bpy.ops.object.mode_set(mode='SCULPT')",
    "bpy.ops.sculpt.dynamic_topology_toggle()",
    "lib = 'brushes/essentials_brushes-mesh_sculpt.blend/Brush/'",
    "for agent, brush, region in plan:",
    "    bpy.ops.brush.asset_activate(",
    "        asset_library_type='ESSENTIALS',",
    "        relative_asset_identifier=lib + brush)",
    "    agent.stroke(region)  # A: Clay Strips, B: Crease, C: Smooth",
  ] : a.ui === "zbrush" ? ["// ZScript", "[IPress, Tool:SubTool:Duplicate]", "[IPress, Brush:ClayBuildup]", "[ISet, Draw:Z Intensity, 22]", "[IPress, Brush:DamStandard]   // agent B", "[IPress, Brush:Smooth]        // agent C"] : ["// three agents, one mesh", "agentA.brush('clay').along('brow ridge')", "agentB.brush('crease').along('eye sockets')", "agentC.brush('smooth').over('cheeks')", "you.brush(picked).drag()"];
  const el = shell(a, "sculpt", { verb: `3 agents sculpting · ${a.name}`, status: "Live", body: h("div", {}, surface, h("p", { class: "eu-hint" }, "Drag on the mesh to sculpt with the picked brush. Agents keep working around you.")), foot: [holdButton("Hold to apply Remesh", (b, t) => { t.textContent = "Remeshed · 0.02 m voxels"; burst(b); }), h("button", { class: "eu-btn ghost" }, "Export .glb")], summary: `Sculpted a head blockout in ${a.name} with 3 agents` });
  return { el, async play(run) { stagger(brushes.children, { gap: 50 }); for (const line of script) { const s = h("div"); code.append(s); await typeText(s, line, run, 90); } }, spec: { kind: "sculpt", app: a.id, agents: AGENTS.map((g) => ({ name: g.n, brush: BRUSHES[g.brush][0], region: g.plan })), mesh: "icosphere · dyntopo" } };
}

/* ---------------- city: PCG blockout ---------------- */
function cityMake(a, r) {
  const ui = uiOf(a) || {};
  const vp = h("div", { class: "vp" });
  const ue = a.ui === "unreal" || a.ui === "omni";
  const steps = ue ? ["Get Landscape Data", "Surface Sampler", "Density Filter", "Transform Points", "Static Mesh Spawner"] : a.ui === "houdini" ? ["grid1", "attribnoise1", "scatter1", "copytopoints1", "output0"] : a.ui === "tiny" ? ["Terrain", "Roads", "Homes", "Props", "Animals"] : a.ui === "godot" ? ["GridMap", "MeshLibrary", "set_cell_item()", "bake_navigation", "Done"] : ["Lot grid", "Zoning", "Density", "Massing", "Instancing"];
  const graph = h("div", { class: "pcg" }, steps.map((s, i) => h("span", { class: "pcg-n", "data-i": i }, h("i"), s)));
  const count = h("b", {}, "0");
  const dens = h("input", { type: "range", min: 0.2, max: 0.95, step: 0.01, value: 0.62, "aria-label": "Density" });
  let city;
  const V = stage3d(vp, (T, v) => {
    v.shadows = true;
    v.orbit = { yaw: 0.8, pitch: 0.62, dist: 30, target: [0, 0, 0] };
    v.scene.fog = new T.Fog(ui.view ? parseInt(ui.view.slice(1), 16) : 0x1c1c1c, 30, 70);
    sunRig(T, v.scene, { pos: [14, 22, 8] });
    city = makeCity(T, { seed: 3 + Math.floor(r() * 50) });
    v.scene.add(city.group);
    return (dt, t) => { if (v.auto) v.orbit.yaw += dt * 0.12; v.applyOrbit(); city.step(dt); count.textContent = city.count(); };
  }, { bg: parseInt((ui.view || "#1c1c1c").slice(1), 16), aspect: 16 / 10 });
  dens.addEventListener("input", () => { city?.plan(+dens.value); });
  const regen = h("button", { class: "eu-btn ghost sm", type: "button", onclick: () => { city?.restart(); runGraph(new Run()); } }, "↻ Regenerate");
  async function runGraph(run) { const ns = [...graph.children]; ns.forEach((n) => n.classList.remove("done", "on")); for (const n of ns) { n.classList.add("on"); await run.wait(380); n.classList.remove("on"); n.classList.add("done"); } }
  const surface = appSurface(a, [appBar(ue ? ["PCG Graph", "Level", "Lumen"] : [a.name, "Scene", "Generate"], [h("span", { class: "ap-stat" }, count, " buildings")]), h("div", { class: "ap-vpwrap" }, vp), graph, h("label", { class: "ap-slider" }, h("span", {}, ue ? "Density Filter · lower bound" : "Density"), dens)], { cls: "city" });
  const el = shell(a, "city", { verb: ue ? "Generated a city with PCG" : `Blocked out a city · ${a.name}`, status: "Building", body: surface, foot: [regen, h("button", { class: "eu-btn ghost sm" }, ue ? "Convert to Level Instance" : "Bake")], summary: `Blocked out a ${steps.length}-step city in ${a.name}` });
  return { el, async play(run) { await runGraph(run); }, spec: { kind: "city", app: a.id, pipeline: steps, seed: "deterministic", density: 0.62 } };
}

/* ---------------- fly: camera flythrough on a spline + sequencer ---------------- */
function flyMake(a, r) {
  const ui = uiOf(a) || {};
  const vp = h("div", { class: "vp cine" });
  const keys = h("div", { class: "seq-keys" });
  const head = h("i", { class: "seq-head" });
  const track = h("div", { class: "seq" }, h("span", { class: "seq-l" }, a.ui === "unreal" ? "CineCameraActor" : a.ui === "blender" ? "Camera · Follow Path" : "Camera"), h("div", { class: "seq-t" }, keys, head));
  const tc = h("span", { class: "ap-stat" }, "00:00:00");
  const lens = seg(["Drone", "Crane", "Rail"], (i) => (mode = i), 0);
  let mode = 0, scrub = null, T0 = 0;
  const V = stage3d(vp, (T, v) => {
    v.shadows = true;
    v.scene.fog = new T.Fog(0xc9d6e3, 25, 80);
    sunRig(T, v.scene, { sun: 0xffe2b8, intensity: 3, pos: [-12, 18, 10] });
    const city = makeCity(T, { seed: 11, density: 0.7 }); city.roadsK = 1; city.t0 = -99;
    v.scene.add(city.group);
    const pts = [[-16, 9, 16], [-6, 5, 6], [2, 3, -2], [8, 6, -10], [14, 12, 4], [0, 16, 14]].map((p) => new T.Vector3(...p));
    const curve = new T.CatmullRomCurve3(pts, true, "centripetal");
    const line = new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(200)), new T.LineBasicMaterial({ color: ui.hot ? parseInt(ui.hot.slice(1), 16) : 0xffb300 }));
    v.scene.add(line);
    pts.forEach((p) => { const k = new T.Mesh(new T.OctahedronGeometry(0.35), new T.MeshBasicMaterial({ color: 0xffffff })); k.position.copy(p); v.scene.add(k); });
    pts.forEach((_, i) => keys.append(h("i", { style: { left: `${(i / pts.length) * 100}%` } })));
    const look = new T.Vector3();
    let u = 0;
    return (dt, t) => {
      u = scrub != null ? scrub : (u + dt * 0.045) % 1;
      const p = curve.getPointAt(u), q = curve.getPointAt((u + [0.02, 0.006, 0.03][mode]) % 1);
      if (mode === 1) p.y += 4 + Math.sin(t) * 2;
      if (mode === 2) p.y = 2.2;
      v.camera.position.copy(p);
      look.lerp(mode === 1 ? new T.Vector3(0, 2, 0) : q, 0.12);
      v.camera.lookAt(look);
      if (mode === 0) v.camera.rotateZ(Math.sin(t * 0.6) * 0.04);
      line.visible = false;
      city.step(dt);
      head.style.left = `${u * 100}%`;
      const s = u * 24; tc.textContent = `00:00:${String(Math.floor(s)).padStart(2, "0")}:${String(Math.floor((s % 1) * 24)).padStart(2, "0")}`;
    };
  }, { bg: 0xc9d6e3, orbit: false, aspect: 2.1 });
  const tt = track.querySelector(".seq-t");
  const at = (e) => { const b = tt.getBoundingClientRect(); return Math.max(0, Math.min(0.999, (e.clientX - b.left) / b.width)); };
  tt.addEventListener("pointerdown", (e) => { tt.setPointerCapture(e.pointerId); scrub = at(e); });
  tt.addEventListener("pointermove", (e) => { if (scrub != null) scrub = at(e); });
  tt.addEventListener("pointerup", () => (scrub = null));
  const surface = appSurface(a, [appBar(a.ui === "unreal" ? ["Sequencer", "Cine Camera", "Movie Render Queue"] : a.ui === "gev" ? ["Cockpit", "Orbit", "Chase"] : ["Camera", "Path", "Render"], [tc]), h("div", { class: "ap-vpwrap" }, vp), track, h("div", { class: "row between" }, lens, h("span", { class: "eu-hint" }, "Drag the timeline to scrub"))], { cls: "fly" });
  const el = shell(a, "fly", { verb: "Directed a flythrough", status: "24 fps", body: surface, foot: [h("button", { class: "eu-btn primary" }, a.ui === "unreal" ? "Render (MRQ)" : "Render shot"), h("button", { class: "eu-btn ghost" }, "Send to edit")], summary: `Rendered a 24 s flythrough in ${a.name}` });
  return { el, async play() { stagger(keys.children, { gap: 70, delay: 300, sp: "bouncy" }); }, spec: { kind: "fly", app: a.id, path: "catmull-rom · 6 keys", duration: "24s", rig: "drone" } };
}

/* ---------------- fpv: drone with Betaflight-style OSD ---------------- */
function fpvMake(a, r) {
  const vp = h("div", { class: "vp fpv" });
  const osd = h("div", { class: "osd" },
    h("span", { class: "o-tl" }, h("b", { class: "o-bat" }, "16.4V"), " 4S"), h("span", { class: "o-tr" }, "RSSI ", h("b", { class: "o-rssi" }, "99")),
    h("span", { class: "o-bl" }, "THR ", h("b", { class: "o-thr" }, "54"), "%  ", h("b", { class: "o-mode" }, "ACRO")), h("span", { class: "o-br" }, "FLY ", h("b", { class: "o-time" }, "00:00")),
    h("span", { class: "o-alt" }, "ALT ", h("b", {}, "12"), "m"), h("span", { class: "o-spd" }, h("b", {}, "64"), " km/h"),
    h("span", { class: "o-gate" }, "GATE ", h("b", {}, "1"), "/8"), h("span", { class: "o-rec" }, "● REC"),
    h("i", { class: "o-x" }), h("i", { class: "o-hz" }));
  const sticks = h("div", { class: "sticks" }, h("span", {}, h("i")), h("span", {}, h("i")));
  const mode = seg(["Acro", "Angle", "Horizon"], (i) => { osd.querySelector(".o-mode").textContent = ["ACRO", "ANGL", "HOR"][i]; }, 0);
  const V = stage3d(vp, (T, v) => {
    v.scene.fog = new T.Fog(0x9ab7c9, 20, 90);
    sunRig(T, v.scene, { sun: 0xfff0d0, intensity: 2.4, pos: [20, 30, -10] });
    const N = 120, geo = new T.PlaneGeometry(200, 200, N, N); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, (fbm(x * 0.03, z * 0.03) - 0.5) * 18 + Math.max(0, Math.abs(x) - 18) * 0.12); }
    geo.computeVertexNormals();
    v.scene.add(new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0x5f7d4a, roughness: 1, flatShading: true })));
    const trees = new T.InstancedMesh(new T.ConeGeometry(0.9, 3.4, 6), new T.MeshStandardMaterial({ color: 0x2f4f2a, flatShading: true }), 500);
    const m4 = new T.Matrix4(), rr = rand(4);
    for (let i = 0; i < 500; i++) { const x = (rr() - 0.5) * 180, z = (rr() - 0.5) * 180; if (Math.abs(x) < 8) { i--; continue; } const y = (fbm(x * 0.03, z * 0.03) - 0.5) * 18 + Math.max(0, Math.abs(x) - 18) * 0.12; m4.makeScale(1, 0.7 + rr(), 1).setPosition(x, y + 1.6, z); trees.setMatrixAt(i, m4); }
    v.scene.add(trees);
    const gates = [];
    for (let i = 0; i < 8; i++) { const g = new T.Mesh(new T.TorusGeometry(2.2, 0.18, 8, 32), new T.MeshBasicMaterial({ color: i % 2 ? 0xff3b6b : 0xffbb00 })); g.position.set(Math.sin(i * 0.9) * 5, 4 + Math.sin(i) * 1.5, 80 - i * 22); v.scene.add(g); gates.push(g); }
    let z = 95, time = 0, gi = 0;
    const o = (s) => osd.querySelector(s);
    return (dt, t) => {
      time += dt; z -= dt * 18; if (z < -95) { z = 95; gi = 0; }
      const x = Math.sin((80 - z) / 22 * 0.9) * 5, y = 4.3 + Math.sin(t * 1.3) * 0.6;
      const roll = Math.cos((80 - z) / 22 * 0.9) * 0.5 + Math.sin(t * 3) * 0.04;
      v.camera.position.set(x, y, z); v.camera.rotation.set(-0.08, 0, 0); v.camera.rotation.z = -roll * 0.6; v.camera.fov = 92; v.camera.updateProjectionMatrix();
      if (gates[gi] && z < gates[gi].position.z) { gi++; o(".o-gate b").textContent = Math.min(8, gi + 1); o(".o-gate").animate([{ color: "#ffbb00" }, { color: "#fff" }], 500); }
      o(".o-time").textContent = `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
      o(".o-bat").textContent = (16.4 - time * 0.004).toFixed(1) + "V";
      o(".o-thr").textContent = 50 + Math.round(Math.sin(t * 2) * 12);
      o(".o-hz").style.transform = `rotate(${roll * 34}deg)`;
      const [ls, rs] = sticks.querySelectorAll("i"); ls.style.translate = `${Math.sin(t * 1.7) * 10}px ${-Math.sin(t * 2) * 10 - 4}px`; rs.style.translate = `${-roll * 26}px ${Math.sin(t * 2.3) * 6}px`;
    };
  }, { bg: 0x9ab7c9, orbit: false, aspect: 16 / 9 });
  V.hud.append(osd);
  const surface = appSurface(a, [appBar(a.ui === "dji" ? ["Camera", "Explore", "QuickShots"] : ["OSD", "Blackbox", "Rates"], [h("span", { class: "ap-stat" }, "5.8 GHz · R4")]), h("div", { class: "ap-vpwrap" }, vp), h("div", { class: "row between" }, mode, sticks)], { cls: "fpvwrap" });
  const el = shell(a, "fpv", { verb: a.ui === "dji" ? "Flew a QuickShot" : "FPV run through 8 gates", status: "Armed", body: surface, foot: [h("button", { class: "eu-btn primary" }, "Save DVR clip"), h("button", { class: "eu-btn ghost" }, "Open Blackbox log")], summary: `Flew an 8-gate FPV line in ${a.name}` });
  return { el, async play() {}, spec: { kind: "fpv", app: a.id, osd: ["battery", "rssi", "throttle", "flight time", "horizon"], gates: 8 } };
}

/* ---------------- light: three-point rig with real presets ---------------- */
function lightMake(a, r) {
  const ui = uiOf(a) || {};
  const vp = h("div", { class: "vp" });
  const kelvin = h("input", { type: "range", min: 2000, max: 9000, step: 100, value: 4300, "aria-label": "Key colour temperature" });
  const kv = h("span", { class: "eu-hint" }, "4300 K");
  let L = null;
  const toggles = ["Key", "Fill", "Rim"].map((n, i) => h("button", { type: "button", class: "ap-chip on", onclick: (e) => { e.currentTarget.classList.toggle("on"); if (L) L[i].visible = e.currentTarget.classList.contains("on"); } }, n));
  const presets = { Rembrandt: [0.85, 0.75, 0.25, 0.6], Butterfly: [0, 1.1, 0.35, 0.3], Split: [1.57, 0.2, 0.0, 0.5], Rim: [3.0, 0.4, 0.0, 1.4] };
  let target = presets.Rembrandt.slice();
  const pre = seg(Object.keys(presets), (i) => { target = Object.values(presets)[i].slice(); }, 0);
  const V = stage3d(vp, (T, v) => {
    v.shadows = true;
    v.orbit = { yaw: 0.2, pitch: 0.12, dist: 5.2, target: [0, 0.9, 0] };
    const floor = new T.Mesh(new T.PlaneGeometry(30, 30), new T.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; v.scene.add(floor);
    const bust = new T.Group();
    const head = new T.Mesh(new T.SphereGeometry(0.62, 64, 48), new T.MeshStandardMaterial({ color: 0xd9c2ad, roughness: 0.45 })); head.scale.set(0.9, 1.1, 0.95); head.position.y = 1.55; head.castShadow = true;
    const nose = new T.Mesh(new T.ConeGeometry(0.11, 0.3, 24), head.material); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.52, 0.6); nose.castShadow = true;
    const neck = new T.Mesh(new T.CylinderGeometry(0.25, 0.32, 0.6, 32), head.material); neck.position.y = 0.9; neck.castShadow = true;
    const torso = new T.Mesh(new T.CapsuleGeometry(0.6, 0.5, 8, 24), new T.MeshStandardMaterial({ color: 0x30343c, roughness: 0.8 })); torso.scale.set(1.25, 0.8, 0.7); torso.position.y = 0.25; torso.castShadow = true;
    bust.add(head, nose, neck, torso); v.scene.add(bust);
    const key = new T.SpotLight(0xffe0bd, 60, 20, 0.5, 0.4, 1.6), fill = new T.PointLight(0x9ec5ff, 6, 20), rim = new T.SpotLight(0xffffff, 50, 20, 0.6, 0.5, 1.6);
    [key, rim].forEach((l) => { l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.target = head; });
    v.scene.add(key, fill, rim, new T.AmbientLight(0xffffff, 0.06));
    const gizmo = (c) => { const g = new T.Mesh(new T.SphereGeometry(0.09, 12, 8), new T.MeshBasicMaterial({ color: c })); v.scene.add(g); return g; };
    const gk = gizmo(0xffd27a), gf = gizmo(0x9ec5ff), gr = gizmo(0xffffff);
    L = [key, fill, rim];
    const cur = target.slice();
    const kcol = new T.Color();
    return (dt, t) => {
      if (v.auto) v.orbit.yaw = 0.2 + Math.sin(t * 0.3) * 0.5;
      v.applyOrbit();
      for (let i = 0; i < 4; i++) cur[i] += (target[i] - cur[i]) * Math.min(1, dt * 4);
      const [az, el, fillK, rimK] = cur;
      key.position.set(Math.sin(az) * 3, 1.6 + el * 2.2, Math.cos(az) * 3); gk.position.copy(key.position);
      fill.position.set(-Math.sin(az) * 3, 1.4, Math.cos(az) * 2.6); fill.intensity = fillK * 18; gf.position.copy(fill.position); gf.visible = fill.visible;
      rim.position.set(-Math.sin(az) * 1.5, 2.6, -2.8); rim.intensity = rimK * 70; gr.position.copy(rim.position); gr.visible = rim.visible; gk.visible = key.visible;
      kcol.setRGB(...kelvinRGB(+kelvin.value)); key.color.copy(kcol); gk.material.color.copy(kcol);
    };
  }, { bg: parseInt((ui.view || "#202020").slice(1), 16), shadows: true });
  kelvin.addEventListener("input", () => (kv.textContent = `${kelvin.value} K`));
  const surface = appSurface(a, [appBar([engineWord(a), "Lights", "World"], [h("span", { class: "ap-stat" }, "f/2.8 · 85 mm")]), h("div", { class: "ap-vpwrap" }, vp), h("div", { class: "row wrap" }, ...toggles, h("label", { class: "ap-slider grow" }, h("span", {}, "Key ", kv), kelvin)), pre], { cls: "lightwrap" });
  const el = shell(a, "light", { verb: `Lit a portrait · ${engineWord(a)}`, status: "Rendering", body: surface, foot: [h("button", { class: "eu-btn primary" }, "Render still"), h("button", { class: "eu-btn ghost" }, "Save rig")], summary: `Set a Rembrandt three-point rig in ${a.name}` });
  return { el, async play() {}, spec: { kind: "light", app: a.id, rig: ["key spot 4300K", "fill point", "rim spot"], preset: "Rembrandt", engine: engineWord(a) } };
}
function kelvinRGB(k) { // Tanner Helland's fit
  const t = k / 100; let r, g, b;
  r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [r, g, b].map((x) => Math.max(0, Math.min(255, x)) / 255);
}

/* ---------------- trigger: a trigger volume opens a door, with the engine's own event API ---------------- */
function triggerMake(a, r) {
  const ui = uiOf(a) || {};
  const vp = h("div", { class: "vp" });
  const api = {
    unreal: ["OnComponentBeginOverlap (TriggerBox)", "Play from Start (Timeline: DoorOpen)", "Set Relative Location (Door)"],
    unity: ["void OnTriggerEnter(Collider other)", "if (other.CompareTag(\"Player\"))", "door.SetTrigger(\"Open\");"],
    godot: ["func _on_area_3d_body_entered(body):", "\tif body.is_in_group(\"player\"):", "\t\t$AnimationPlayer.play(\"open\")"],
    roblox: ["part.Touched:Connect(function(hit)", "  local h = hit.Parent:FindFirstChild(\"Humanoid\")", "  if h then TweenService:Create(door, info, goal):Play() end"],
  }[a.ui] || ["on enter(trigger, player)", "  play(door, 'open')", "  log('door opened')"];
  const bp = h("div", { class: "bp" + (a.ui === "unreal" ? " ue" : "") }, api.map((l, i) => h("div", { class: "bp-n" }, h("i", { class: "bp-pin" }), h("code", {}, l))));
  const log = h("div", { class: "trlog" });
  let fired = 0;
  const V = stage3d(vp, (T, v) => {
    v.shadows = true;
    v.orbit = { yaw: 0.7, pitch: 0.75, dist: 15, target: [0, 0, 0] };
    sunRig(T, v.scene, { pos: [6, 14, 8], shadow: 12, intensity: 2 });
    const mat = new T.MeshStandardMaterial({ color: 0x8c8f96, roughness: 0.8 });
    const floor = new T.Mesh(new T.BoxGeometry(14, 0.2, 10), new T.MeshStandardMaterial({ color: 0x6b6f76, roughness: 0.9 })); floor.position.y = -0.1; floor.receiveShadow = true; v.scene.add(floor);
    const grid = new T.GridHelper(14, 14, 0x888888, 0x777777); grid.position.y = 0.01; v.scene.add(grid);
    const wall = (x, z, w, d) => { const m = new T.Mesh(new T.BoxGeometry(w, 2.4, d), mat); m.position.set(x, 1.2, z); m.castShadow = m.receiveShadow = true; v.scene.add(m); };
    wall(0, -5, 14, 0.3); wall(-7, 0, 0.3, 10); wall(7, 0, 0.3, 10); wall(-4.5, 1, 5, 0.3); wall(4.5, 1, 5, 0.3);
    const door = new T.Mesh(new T.BoxGeometry(4, 2.4, 0.2), new T.MeshStandardMaterial({ color: 0xb07a3b, roughness: 0.6 })); door.position.set(0, 1.2, 1); door.castShadow = true; v.scene.add(door);
    const box = new T.Mesh(new T.BoxGeometry(3, 2, 2.2), new T.MeshBasicMaterial({ color: 0x3cff6e, wireframe: true, transparent: true, opacity: 0.9 })); box.position.set(0, 1, 3); v.scene.add(box);
    const player = new T.Mesh(new T.CapsuleGeometry(0.35, 0.9, 6, 16), new T.MeshStandardMaterial({ color: parseInt((ui.acc || "#0070e0").slice(1), 16), roughness: 0.4 })); player.castShadow = true; v.scene.add(player);
    const path = [[-5, 4.2], [0, 4], [0, 3], [0, -0.5], [0, -3.5], [4.5, -3.5], [4.5, 3.8], [-5, 4.2]].map(([x, z]) => new T.Vector3(x, 0.8, z));
    let seg = 0, k = 0, open = 0, inside = false, goal = null;
    v.onDown = (e, p) => { v.ray.setFromCamera(p, v.camera); const hs = v.ray.intersectObject(floor); if (hs.length) goal = hs[0].point.clone().setY(0.8); };
    return (dt, t) => {
      if (v.auto) v.orbit.yaw += dt * 0.08;
      v.applyOrbit();
      if (goal) { const d = goal.clone().sub(player.position); const L = d.length(); if (L < 0.05) goal = null; else player.position.add(d.multiplyScalar(Math.min(1, (dt * 3.2) / L))); }
      else { const a0 = path[seg], b0 = path[(seg + 1) % path.length]; k += (dt * 2.6) / a0.distanceTo(b0); if (k >= 1) { k = 0; seg = (seg + 1) % (path.length - 1); } player.position.lerpVectors(a0, b0, Math.min(1, k)); }
      const now = Math.abs(player.position.x - box.position.x) < 1.5 && Math.abs(player.position.z - box.position.z) < 1.1;
      if (now && !inside) { fired++; fire(); }
      inside = now;
      box.material.color.setHex(inside ? 0xffa53c : 0x3cff6e);
      open += ((inside || player.position.z < 1.4 ? 1 : 0) - open) * Math.min(1, dt * 3);
      door.position.y = 1.2 + open * 2.35;
    };
  }, { bg: 0x9aa3ad, shadows: true });
  function fire() {
    const nodes = bp.querySelectorAll(".bp-n");
    nodes.forEach((n, i) => setTimeout(() => { n.classList.add("hot"); setTimeout(() => n.classList.remove("hot"), 700); }, i * 160));
    const row = h("div", {}, h("time", {}, new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })), ` ${a.ui === "unreal" ? "LogBlueprint" : "event"}: BeginOverlap → door open (#${fired})`);
    log.prepend(row); anim(row, [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { spring: "soft" });
    while (log.children.length > 3) log.lastChild.remove();
  }
  const surface = appSurface(a, [appBar(a.ui === "unreal" ? ["Viewport", "Blueprint", "▶ PIE"] : a.ui === "godot" ? ["3D", "Script", "▶"] : [a.name, "Scene", "▶ Play"], [h("span", { class: "ap-stat" }, "Tap the floor to walk")]), h("div", { class: "ap-split tr" }, h("div", { class: "ap-vpwrap" }, vp), h("div", {}, bp, log))], { cls: "trigger" });
  const el = shell(a, "trigger", { verb: "Wired a trigger volume", status: "Playing", body: surface, foot: [h("button", { class: "eu-btn primary" }, "Add to level"), h("button", { class: "eu-btn ghost" }, "Open graph")], summary: `Wired a door trigger in ${a.name}` });
  return { el, async play(run) { stagger(bp.children, { gap: 90 }); }, spec: { kind: "trigger", app: a.id, event: api[0], action: api[api.length - 1] } };
}

/* ---------------- globe: God's Eye View style live layers ---------------- */
const CITIES = [["SFO", 37.62, -122.38], ["LAX", 33.94, -118.4], ["JFK", 40.64, -73.78], ["ORD", 41.98, -87.9], ["LHR", 51.47, -0.45], ["CDG", 49.01, 2.55], ["DXB", 25.25, 55.36], ["HND", 35.55, 139.78], ["SIN", 1.36, 103.99], ["SYD", -33.94, 151.18], ["GRU", -23.43, -46.47], ["JNB", -26.14, 28.24], ["DEL", 28.56, 77.1], ["MEX", 19.44, -99.07], ["SEA", 47.45, -122.31], ["DFW", 32.9, -97.04], ["FRA", 50.04, 8.56], ["ICN", 37.46, 126.44], ["DAL", 32.85, -96.85], ["AUS", 30.19, -97.67]];
const ROUTES = [["SFO", "HND"], ["JFK", "LHR"], ["LAX", "SYD"], ["DXB", "SIN"], ["ORD", "FRA"], ["GRU", "JNB"], ["SEA", "ICN"], ["DEL", "CDG"], ["DFW", "MEX"], ["DAL", "AUS"]];
function globeMake(a, r) {
  const ui = uiOf(a) || {};
  const vp = h("div", { class: "vp gev" });
  const layers = ["Flights", "Satellites", "Quakes", "Cameras"].map((n, i) => h("button", { type: "button", class: "ap-chip" + (i < 3 ? " on" : ""), "data-l": n }, n));
  const trk = h("div", { class: "gev-trk" }, h("b", {}, "TRK —"), h("span", {}, "tap a flight"));
  const voice = h("div", { class: "gev-voice" }, h("i"), h("span", {}, ""));
  let G = null, follow = -1;
  const V = stage3d(vp, (T, v) => {
    v.orbit = { yaw: 2.2, pitch: 0.45, dist: 3.4, target: [0, 0, 0] };
    const R0 = 1;
    const ll = (lat, lon, rr = R0) => { const p = (90 - lat) * Math.PI / 180, t = (lon + 180) * Math.PI / 180; return new T.Vector3(-rr * Math.sin(p) * Math.cos(t), rr * Math.cos(p), rr * Math.sin(p) * Math.sin(t)); };
    const earth = new T.Mesh(new T.SphereGeometry(R0, 96, 64), new T.MeshStandardMaterial({ color: 0x06140d, roughness: 0.9, emissive: 0x021007 }));
    v.scene.add(earth);
    // graticule
    const gm = new T.LineBasicMaterial({ color: 0x1f5c3a, transparent: true, opacity: 0.55 });
    for (let lat = -60; lat <= 60; lat += 30) { const pts = []; for (let lo = -180; lo <= 180; lo += 4) pts.push(ll(lat, lo, 1.001)); v.scene.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), gm)); }
    for (let lo = -180; lo < 180; lo += 30) { const pts = []; for (let la = -90; la <= 90; la += 4) pts.push(ll(la, lo, 1.001)); v.scene.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), gm)); }
    // land-ish dot field from noise (no basemap shipped): dense where the noise says land
    const dots = [];
    for (let la = -80; la <= 80; la += 1.6) for (let lo = -180; lo < 180; lo += 1.6 / Math.max(0.25, Math.cos(la * Math.PI / 180))) if (fbm(lo * 0.035 + 3, la * 0.05 + 7) > 0.52) dots.push(ll(la, lo, 1.002));
    v.scene.add(new T.Points(new T.BufferGeometry().setFromPoints(dots), new T.PointsMaterial({ color: 0x2fae6a, size: 0.012 })));
    const cityPts = new T.Points(new T.BufferGeometry().setFromPoints(CITIES.map(([, la, lo]) => ll(la, lo, 1.004))), new T.PointsMaterial({ color: 0xffb000, size: 0.022 }));
    v.scene.add(cityPts);
    const byCode = Object.fromEntries(CITIES.map(([c, la, lo]) => [c, ll(la, lo)]));
    const flights = ROUTES.map(([f, t], i) => {
      const A = byCode[f], B = byCode[t];
      const mid = A.clone().add(B).normalize().multiplyScalar(1 + A.distanceTo(B) * 0.28);
      const curve = new T.QuadraticBezierCurve3(A.clone().multiplyScalar(1.004), mid, B.clone().multiplyScalar(1.004));
      const line = new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(64)), new T.LineBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.35 }));
      const plane = new T.Mesh(new T.ConeGeometry(0.007, 0.024, 6), new T.MeshBasicMaterial({ color: 0xffffff })); v.scene.add(line, plane);
      return { curve, line, plane, u: (i * 0.137) % 1, call: ["UAL837", "BAW178", "QFA12", "SIA495", "DLH431", "SAA223", "KAL20", "AIC143", "AAL1392", "SWA1734"][i], fl: 310 + (i % 5) * 20, gs: 440 + (i * 13) % 80, from: f, to: t };
    });
    const sats = Array.from({ length: 18 }, (_, i) => { const m = new T.Mesh(new T.SphereGeometry(0.008, 6, 6), new T.MeshBasicMaterial({ color: 0x9dffbf })); v.scene.add(m); return { m, inc: 0.3 + (i % 6) * 0.22, raan: i * 0.7, r: 1.12 + (i % 3) * 0.08, u: i * 0.9 }; });
    const quakes = [[35.7, 139.7], [-33.4, -70.6], [37.8, -122.4], [38.3, 142.4], [-6.2, 106.8]].map(([la, lo]) => { const m = new T.Mesh(new T.RingGeometry(0.006, 0.009, 32), new T.MeshBasicMaterial({ color: 0xff4d4d, side: T.DoubleSide, transparent: true })); const p = ll(la, lo, 1.003); m.position.copy(p); m.lookAt(p.clone().multiplyScalar(2)); v.scene.add(m); return m; });
    v.scene.add(new T.AmbientLight(0x88ffbb, 0.6)); const d = new T.DirectionalLight(0xffffff, 1.2); d.position.set(5, 3, 5); v.scene.add(d);
    G = { flights, sats, quakes };
    v.onDown = (e, p) => { v.ray.setFromCamera(p, v.camera); v.ray.params.Line = { threshold: 0.03 }; const hs = v.ray.intersectObjects(flights.map((f) => f.line)); if (hs.length) { follow = flights.findIndex((f) => f.line === hs[0].object); showTrk(); } };
    const tmp = new T.Vector3();
    return (dt, t) => {
      const on = (n) => layers.find((b) => b.dataset.l === n).classList.contains("on");
      flights.forEach((f, i) => { f.u = (f.u + dt * 0.04) % 1; const p = f.curve.getPointAt(f.u), q = f.curve.getPointAt(Math.min(1, f.u + 0.01)); f.plane.position.copy(p); f.plane.lookAt(q); f.plane.rotateX(Math.PI / 2); f.plane.visible = f.line.visible = on("Flights"); f.line.material.opacity = i === follow ? 0.95 : 0.3; });
      sats.forEach((s) => { s.u += dt * 0.4 / s.r; tmp.set(Math.cos(s.u) * s.r, 0, Math.sin(s.u) * s.r).applyAxisAngle(new T.Vector3(1, 0, 0), s.inc).applyAxisAngle(new T.Vector3(0, 1, 0), s.raan); s.m.position.copy(tmp); s.m.visible = on("Satellites"); });
      quakes.forEach((q, i) => { const k = ((t * 0.6 + i * 0.3) % 1); q.scale.setScalar(1 + k * 5); q.material.opacity = 1 - k; q.visible = on("Quakes"); });
      if (follow >= 0) {
        const f = flights[follow], p = f.curve.getPointAt(f.u);
        const want = p.clone().normalize().multiplyScalar(2.3).add(new T.Vector3(0, 0.25, 0));
        v.camera.position.lerp(want, Math.min(1, dt * 2)); v.camera.lookAt(p);
        if (Math.random() < 0.05) showTrk();
      } else { if (v.auto) v.orbit.yaw += dt * 0.08; v.applyOrbit(); }
    };
  }, { bg: 0x000000, aspect: 16 / 10 });
  function showTrk() { if (!G || follow < 0) return; const f = G.flights[follow]; trk.replaceChildren(h("b", {}, `TRK ${f.call}`), h("span", {}, `${f.from}→${f.to} · FL${f.fl} · GS ${f.gs + Math.round(Math.random() * 4)} kt`)); }
  layers.forEach((b) => b.addEventListener("click", () => b.classList.toggle("on")));
  V.hud.append(h("div", { class: "gev-hud" }, h("span", {}, "ORBITAL HUD"), h("span", { class: "gev-utc" }, "UTC 14:22:07"), h("span", {}, "LIVE · ADS-B · TLE · USGS")), trk, voice);
  const surface = appSurface(a, [h("div", { class: "ap-vpwrap" }, vp), h("div", { class: "row wrap" }, ...layers, h("button", { type: "button", class: "ap-chip hot", onclick: () => { follow = (follow + 1) % 10; showTrk(); } }, "Cockpit ▶"))], { cls: "globe" });
  const el = shell(a, "globe", { verb: "Following live traffic", status: "Live", body: surface, foot: [h("button", { class: "eu-btn primary" }, "Send track to fframestudio"), h("button", { class: "eu-btn ghost" }, "Export CZML")], summary: `Tracked ${ROUTES.length} flights on ${a.name}` });
  return { el, async play(run) { const s = voice.querySelector("span"); voice.classList.add("on"); await typeText(s, "“follow the flight into Tokyo”", run, 30); await run.wait(500); follow = 0; showTrk(); await run.wait(2400); voice.classList.remove("on"); }, spec: { kind: "globe", app: a.id, layers: ["flights", "satellites", "quakes"], follow: "UAL837 SFO→HND", sources: "ADS-B, TLE, USGS (demo data here)" } };
}

/* ---------------- gen3d: image/text to 3D (Meshy, TRELLIS) ---------------- */
function gen3dMake(a, r) {
  const ui = uiOf(a) || {};
  const vp = h("div", { class: "vp" });
  const trellis = /trellis|hunyuan|open3d/i.test(a.name);
  const stages = trellis ? ["Image → DINOv2 features", "Sparse structure (64³)", "Structured latent (SLat)", "Decode → Gaussians + mesh", "GLB · 1.2 MB"] : a.name === "StableGen" ? ["Depth + normal passes", "SDXL + ControlNet per view", "Project to UVs", "Bake texture", "Done"] : ["Preview mesh", "Remesh · 30k tris", "Refine", "Texture · PBR", "Ready"];
  const list = h("ol", { class: "g3-st" }, stages.map((s) => h("li", {}, h("i"), s)));
  const prompt = h("div", { class: "g3-p" }, h("span", { class: "g3-img" }), h("span", { class: "g3-t" }, ""));
  const variants = h("div", { class: "g3-var" }, [0, 1, 2, 3].map((i) => h("button", { type: "button", class: "g3-v" + (i === 0 ? " on" : ""), "data-i": i, style: { "--h": i * 70 + 20 } }, h("i"))));
  let phase = 0, P = 0, pick = 0;
  const V = stage3d(vp, (T, v) => {
    v.orbit = { yaw: 0.4, pitch: 0.2, dist: 3.4, target: [0, 0.1, 0] };
    const merge = (...gs) => { const parts = gs.map((g) => g.toNonIndexed()); const n = parts.reduce((s, g) => s + g.attributes.position.count, 0); const pos = new Float32Array(n * 3); let o = 0; for (const g of parts) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; } const m = new T.BufferGeometry(); m.setAttribute("position", new T.BufferAttribute(pos, 3)); m.computeVertexNormals(); return m; };
    // low-poly treasure chest (what the Meshy plugin task asks for): body, barrel lid, two bands, lock
    const chest = (k = 0) => { const body = new T.BoxGeometry(1.5, 0.8, 0.95); body.translate(0, -0.2, 0); const lid = new T.CylinderGeometry(0.475, 0.475, 1.5, 7 + k, 1, false, 0, Math.PI); lid.rotateZ(Math.PI / 2); lid.translate(0, 0.2, 0); const bands = [-0.5, 0.5].map((x) => { const b = new T.BoxGeometry(0.1, 0.84, 1.0); b.translate(x, -0.2, 0); return b; }); const lock = new T.BoxGeometry(0.22, 0.28, 0.08); lock.translate(0, 0.12, 0.5); return merge(body, lid, ...bands, lock); };
    const shapes = /meshy|tripo|rodin/i.test(a.name) ? [chest(0), chest(2), chest(4), chest(1)] : [new T.TorusKnotGeometry(0.62, 0.22, 220, 32), new T.DodecahedronGeometry(0.9, 2), new T.CapsuleGeometry(0.5, 0.8, 12, 32), new T.TorusGeometry(0.7, 0.3, 48, 96)];
    const mats = (/meshy|tripo|rodin/i.test(a.name) ? [0x9a6b3c, 0x7a4f2c, 0x5f6b7a, 0xb08d57] : [0xb08d57, 0x8fa3b8, 0xc06b4a, 0x6aa36f]).map((c) => new T.MeshStandardMaterial({ color: c, roughness: /meshy|tripo|rodin/i.test(a.name) ? 0.7 : 0.38, metalness: /meshy|tripo|rodin/i.test(a.name) ? 0.1 : 0.65, flatShading: /meshy|tripo|rodin/i.test(a.name) }));
    let mesh = new T.Mesh(shapes[0], mats[0]);
    const wire = new T.Mesh(shapes[0], new T.MeshBasicMaterial({ color: parseInt((ui.acc || "#c4f042").slice(1), 16), wireframe: true, transparent: true, opacity: 0 }));
    v.scene.add(mesh, wire);
    const N = 2400, ptsGeo = new T.BufferGeometry(), src = new Float32Array(N * 3), dst = new Float32Array(N * 3), cur = new Float32Array(N * 3);
    const sampleTarget = (g) => { const p = g.attributes.position; for (let i = 0; i < N; i++) { const j = Math.floor(Math.random() * p.count); dst[i * 3] = p.getX(j); dst[i * 3 + 1] = p.getY(j); dst[i * 3 + 2] = p.getZ(j); } };
    for (let i = 0; i < N * 3; i++) src[i] = cur[i] = (Math.random() - 0.5) * 4;
    sampleTarget(shapes[0]);
    ptsGeo.setAttribute("position", new T.BufferAttribute(cur, 3));
    const pts = new T.Points(ptsGeo, new T.PointsMaterial({ color: parseInt((ui.acc || "#c4f042").slice(1), 16), size: 0.025 }));
    v.scene.add(pts);
    v.scene.add(new T.HemisphereLight(0xffffff, 0x222233, 1.4)); const d = new T.DirectionalLight(0xffffff, 2.5); d.position.set(2, 4, 3); v.scene.add(d);
    G3.swap = (i) => { pick = i; mesh.geometry = wire.geometry = shapes[i]; mesh.material = mats[i]; sampleTarget(shapes[i]); P = 0; for (let k = 0; k < N * 3; k++) src[k] = cur[k]; };
    return (dt, t) => {
      if (v.auto) v.orbit.yaw += dt * 0.4;
      v.applyOrbit();
      P = Math.min(1, P + dt * 0.35);
      const e = 1 - Math.pow(1 - Math.min(1, P / 0.55), 3);
      for (let i = 0; i < N * 3; i++) cur[i] = src[i] + (dst[i] - src[i]) * e;
      ptsGeo.attributes.position.needsUpdate = true;
      const w = Math.max(0, Math.min(1, (P - 0.45) / 0.2)), s = Math.max(0, Math.min(1, (P - 0.65) / 0.3));
      pts.material.opacity = 1 - s; pts.material.transparent = true;
      wire.material.opacity = w * (1 - s * 0.85);
      mesh.material.transparent = true; mesh.material.opacity = s; mesh.visible = s > 0.01;
      const idx = Math.min(stages.length - 1, Math.floor(P * stages.length));
      [...list.children].forEach((li, i) => { li.classList.toggle("done", i < idx || P >= 1); li.classList.toggle("on", i === idx && P < 1); });
    };
  }, { bg: parseInt((ui.view || "#1b1b22").slice(1), 16) });
  const G3 = {};
  variants.addEventListener("click", (e) => { const b = e.target.closest(".g3-v"); if (!b) return; variants.querySelectorAll(".g3-v").forEach((x) => x.classList.toggle("on", x === b)); G3.swap?.(+b.dataset.i); });
  const surface = appSurface(a, [prompt, h("div", { class: "ap-split g3" }, h("div", { class: "ap-vpwrap" }, vp), list), variants], { cls: "gen3d" });
  const el = shell(a, "gen3d", { verb: trellis ? "Image → 3D (structured latents)" : "Text → 3D", status: "Generating", body: surface, foot: [h("button", { class: "eu-btn primary" }, "Send to Blender"), h("button", { class: "eu-btn ghost" }, "Download .glb")], summary: `Generated a 3D asset with ${a.name}` });
  return { el, async play(run) { await typeText(prompt.querySelector(".g3-t"), trellis ? "photo of a brass robot toy → 3D" : /meshy|tripo|rodin/i.test(a.name) ? "low-poly treasure chest, hand-painted" : "weathered bronze knot sculpture, PBR", run, 40); stagger(variants.children, { gap: 70, sp: "bouncy" }); }, spec: { kind: "gen3d", app: a.id, stages, variants: 4, output: "glb" } };
}

/* ---------------- sim: robot arm pick-and-place with parallel envs ---------------- */
function simMake(a, r) {
  const ui = uiOf(a) || {};
  const vp = h("div", { class: "vp" });
  const reward = svg("svg", { class: "spark", viewBox: "0 0 120 32", preserveAspectRatio: "none" });
  const stat = h("span", { class: "ap-stat" }, "step 0");
  const pts = [];
  const V = stage3d(vp, (T, v) => {
    v.shadows = true;
    v.orbit = { yaw: 0.75, pitch: 0.55, dist: 10, target: [1.6, 0.6, -0.4] };
    sunRig(T, v.scene, { pos: [4, 9, 6], shadow: 8, intensity: 2.2 });
    const floor = new T.Mesh(new T.PlaneGeometry(30, 30), new T.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; v.scene.add(floor);
    v.scene.add(new T.GridHelper(30, 30, 0x55595e, 0x4a4e52));
    const white = new T.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.35, metalness: 0.1 }), dark = new T.MeshStandardMaterial({ color: 0x222428, roughness: 0.4 });
    const arm = (scale = 1) => {
      const root = new T.Group(); const base = new T.Mesh(new T.CylinderGeometry(0.3, 0.38, 0.3, 32), dark); base.position.y = 0.15; root.add(base);
      const j1 = new T.Group(); j1.position.y = 0.3; root.add(j1);
      const l1 = new T.Mesh(new T.CapsuleGeometry(0.12, 1.0, 6, 16), white); l1.position.y = 0.55; j1.add(l1);
      const j2 = new T.Group(); j2.position.y = 1.1; j1.add(j2);
      const l2 = new T.Mesh(new T.CapsuleGeometry(0.1, 0.9, 6, 16), white); l2.position.y = 0.5; j2.add(l2);
      const j3 = new T.Group(); j3.position.y = 1.0; j2.add(j3);
      const hand = new T.Mesh(new T.BoxGeometry(0.22, 0.12, 0.12), dark); j3.add(hand);
      root.traverse((o) => (o.castShadow = true)); root.scale.setScalar(scale);
      return { root, j1, j2, j3 };
    };
    const main = arm(1); v.scene.add(main.root);
    const belt = new T.Mesh(new T.BoxGeometry(5, 0.2, 0.8), dark); belt.position.set(0, 0.1, 1.5); belt.receiveShadow = true; v.scene.add(belt);
    const box = new T.Mesh(new T.BoxGeometry(0.3, 0.3, 0.3), new T.MeshStandardMaterial({ color: parseInt((ui.acc || "#76b900").slice(1), 16) })); box.castShadow = true; v.scene.add(box);
    const bin = new T.Mesh(new T.BoxGeometry(0.9, 0.35, 0.9), new T.MeshStandardMaterial({ color: 0x555a60 })); bin.position.set(-1.6, 0.18, -0.6); v.scene.add(bin);
    const envs = [];
    for (let i = 0; i < 16; i++) { const e = arm(0.35); e.root.position.set(3.5 + (i % 4) * 0.9, 0, -2.5 + Math.floor(i / 4) * 0.9); e.ph = Math.random() * 6; v.scene.add(e.root); envs.push(e); }
    let tt = 0, step = 0, rw = 0;
    return (dt, t) => {
      if (v.auto) v.orbit.yaw += dt * 0.1;
      v.applyOrbit();
      tt += dt; step += Math.round(dt * 60 * 16);
      const cyc = (tt % 4) / 4;
      // box rides the belt, gets picked at 0.35, dropped in bin at 0.8
      if (cyc < 0.35) box.position.set(-2 + cyc / 0.35 * 2.2, 0.35, 1.5);
      const reach = cyc < 0.35 ? 0 : cyc < 0.8 ? (cyc - 0.35) / 0.45 : 1 - (cyc - 0.8) / 0.2;
      main.j1.rotation.y = cyc < 0.35 ? -0.3 : -0.3 - Math.min(1, (cyc - 0.35) / 0.45) * 2.4 * (cyc < 0.8 ? 1 : 1 - (cyc - 0.8) / 0.2);
      main.j1.rotation.z = -0.5 - Math.sin(Math.min(1, reach) * Math.PI) * 0.25; main.j2.rotation.z = -1.4 + Math.sin(reach * Math.PI) * 0.4;
      if (cyc >= 0.35 && cyc < 0.8) { main.j3.updateWorldMatrix(true, false); main.j3.getWorldPosition(box.position); box.position.y -= 0.16; }
      if (cyc >= 0.8) box.position.set(-1.6, 0.5 + Math.max(0, 0.9 - cyc) * 3, -0.6);
      envs.forEach((e, i) => { const c = Math.sin(tt * 1.6 + e.ph); e.j1.rotation.y = c * 1.4; e.j1.rotation.z = -0.5 + Math.sin(tt * 2 + i) * 0.3; e.j2.rotation.z = -1.3 + Math.cos(tt * 2.2 + i) * 0.4; });
      stat.textContent = `step ${step.toLocaleString()} · 16 envs · dt 1/60`;
      rw = Math.min(1, 0.08 + (1 - Math.exp(-tt / 14)) * 0.9 + Math.sin(tt * 3) * 0.02);
      if (Math.floor(tt * 4) !== pts.length && pts.length < 120) { pts.push(rw); reward.innerHTML = `<polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${pts.map((y, i) => `${i},${32 - y * 30}`).join(" ")}"/>`; }
    };
  }, { bg: parseInt((ui.view || "#3a3d40").slice(1), 16), shadows: true });
  const surface = appSurface(a, [appBar(a.ui === "omni" ? ["Isaac Lab", "Stage", "Physics"] : [a.name, "Envs", "Physics"], [stat]), h("div", { class: "ap-vpwrap" }, vp), h("div", { class: "row between" }, h("span", { class: "eu-hint" }, "Reward · PPO"), reward)], { cls: "sim" });
  const el = shell(a, "sim", { verb: "Training pick-and-place", status: "Running", body: surface, foot: [h("button", { class: "eu-btn primary" }, "Export policy (.pt)"), h("button", { class: "eu-btn ghost" }, "Record rollout")], summary: `Trained a pick-and-place policy in ${a.name}` });
  return { el, async play() {}, spec: { kind: "sim", app: a.id, task: "pick-and-place", envs: 16, algo: "PPO", physics: a.name === "Newton" ? "Newton (Warp)" : "PhysX" } };
}

export const KINDS_3D = {
  sculpt: { label: "Multi-agent sculpt", verb: () => "3 agents sculpting", make: sculptMake, three: true },
  city: { label: "City blockout (PCG)", verb: () => "Generated a city", make: cityMake, three: true },
  fly: { label: "Camera flythrough", verb: () => "Directed a flythrough", make: flyMake, three: true },
  fpv: { label: "FPV drone run", verb: () => "FPV run", make: fpvMake, three: true },
  light: { label: "Lighting rig", verb: () => "Lit a scene", make: lightMake, three: true },
  trigger: { label: "Game trigger", verb: () => "Wired a trigger", make: triggerMake, three: true },
  globe: { label: "Live globe", verb: () => "Following live traffic", make: globeMake, three: true },
  gen3d: { label: "Image / text → 3D", verb: () => "Generated a 3D asset", make: gen3dMake, three: true },
  sim: { label: "Robot sim", verb: () => "Training a policy", make: simMake, three: true },
};
