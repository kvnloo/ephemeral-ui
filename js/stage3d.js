// One WebGL renderer for every 3D card. Browsers cap live WebGL contexts (~16), and a kit page can show
// dozens of 3D cards, so each card gets a plain 2D canvas and the shared renderer draws into it while the
// card is on screen. three.js loads on first use only.
import { h } from "./motion.js";
import { motion, reduced } from "./motion.js";

let THREE = null, R = null, raf = 0, last = 0;
const live = new Set();
export async function loadThree() { if (!THREE) THREE = await import("../vendor/three.min.js"); return THREE; }

/** Load a .glb (meshopt-compressed is fine), path relative to this module; resolves to { scene, animations }. Loaders load on first use. */
export async function loadGLB(path) {
  await loadThree();
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import("../vendor/addons/loaders/GLTFLoader.js"), import("../vendor/addons/libs/meshopt_decoder.module.js")]);
  const l = new GLTFLoader();
  l.setMeshoptDecoder(MeshoptDecoder);
  return l.loadAsync(new URL(path, import.meta.url).href);
}

/** A neutral studio environment map (three's RoomEnvironment), so metals read as metal. Built once. */
let ENV = null;
export function roomEnv() {
  return (ENV ||= (async () => {
    await loadThree();
    const { RoomEnvironment } = await import("../vendor/addons/environments/RoomEnvironment.js");
    const pm = new THREE.PMREMGenerator(renderer());
    const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return tex;
  })());
}

function renderer() {
  if (R) return R;
  R = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  R.setPixelRatio(1);
  R.setSize(640, 400, false);
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.ACESFilmicToneMapping;
  R.shadowMap.enabled = true;
  R.shadowMap.type = THREE.PCFShadowMap;
  R.setScissorTest(true);
  return R;
}

function loop(t) {
  raf = live.size ? requestAnimationFrame(loop) : 0;
  const dt = Math.min(0.05, (t - (last || t)) / 1000) * motion.speed * (reduced.matches ? 0.25 : 1);
  last = t;
  const r = renderer(), c = r.domElement;
  // grow the drawing buffer to the largest visible view
  let mw = 0, mh = 0;
  for (const v of live) { mw = Math.max(mw, v.pw); mh = Math.max(mh, v.ph); }
  if (mw > c.width || mh > c.height) r.setSize(Math.max(mw, c.width), Math.max(mh, c.height), false);
  for (const v of live) {
    if (!v.pw || !v.ph) continue;
    try { v.tick(dt, t / 1000); } catch (e) { console.error(e); live.delete(v); continue; }
    r.setViewport(0, 0, v.pw, v.ph); r.setScissor(0, 0, v.pw, v.ph);
    r.setClearColor(v.bg, 1);
    r.shadowMap.enabled = !!v.shadows;
    r.render(v.scene, v.camera);
    v.ctx.drawImage(c, 0, c.height - v.ph, v.pw, v.ph, 0, 0, v.pw, v.ph);
  }
}

/**
 * Mount a 3D view in `host`. setup(THREE, view) builds view.scene / view.camera and returns tick(dt, t).
 * view.orbit = { yaw, pitch, dist, target } is driven by drag unless setup sets view.onDrag.
 */
export function stage3d(host, setup, { bg = 0x1d1d1d, aspect = 16 / 10, shadows = false, orbit = true } = {}) {
  const cv = h("canvas", { class: "v3-cv" });
  const hud = h("div", { class: "v3-hud" });
  host.classList.add("v3");
  host.style.setProperty("--ar", aspect);
  host.append(cv, hud);
  const v = { host, cv, hud, ctx: cv.getContext("2d"), bg, shadows, pw: 0, ph: 0, ready: null, scene: null, camera: null, tick: () => {}, orbit: { yaw: 0.6, pitch: 0.42, dist: 6, target: [0, 0.6, 0] }, auto: true, w: 0, h: 0 };
  v.ready = (async () => {
    await loadThree();
    v.T = THREE;
    v.scene = new THREE.Scene();
    v.camera = new THREE.PerspectiveCamera(42, aspect, 0.05, 400);
    v.ray = new THREE.Raycaster();
    v.tick = setup(THREE, v) || (() => {});
    return v;
  })();
  const size = () => {
    const b = host.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    v.w = b.width; v.h = b.height;
    v.pw = Math.max(1, Math.round(b.width * dpr)); v.ph = Math.max(1, Math.round(b.height * dpr));
    cv.width = v.pw; cv.height = v.ph;
    if (v.camera) { v.camera.aspect = b.width / Math.max(1, b.height); v.camera.updateProjectionMatrix(); }
  };
  new ResizeObserver(size).observe(host);
  new IntersectionObserver(async ([en]) => {
    if (en.isIntersecting && host.isConnected) { await v.ready; size(); live.add(v); if (!raf) { last = 0; raf = requestAnimationFrame(loop); } }
    else live.delete(v);
  }, { rootMargin: "80px" }).observe(host);
  // orbit / custom drag
  let drag = null;
  cv.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: v.orbit.yaw, pitch: v.orbit.pitch };
    cv.setPointerCapture(e.pointerId); v.auto = false; host.classList.add("grab");
    v.onDown?.(e, ndc(e));
  });
  cv.addEventListener("pointermove", (e) => {
    v.onHover?.(e, ndc(e));
    if (!drag) return;
    if (v.onDrag) return v.onDrag(e, ndc(e));
    if (!orbit) return;
    v.orbit.yaw = drag.yaw - (e.clientX - drag.x) * 0.008;
    v.orbit.pitch = Math.max(-0.2, Math.min(1.35, drag.pitch + (e.clientY - drag.y) * 0.006));
  });
  const up = (e) => { if (!drag) return; drag = null; host.classList.remove("grab"); v.onUp?.(e); clearTimeout(v._resume); v._resume = setTimeout(() => (v.auto = true), 2600); };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); v.orbit.dist = Math.max(1.5, Math.min(60, v.orbit.dist * (1 + e.deltaY * 0.001))); }, { passive: false });
  function ndc(e) { const b = cv.getBoundingClientRect(); return { x: ((e.clientX - b.left) / b.width) * 2 - 1, y: -((e.clientY - b.top) / b.height) * 2 + 1 }; }
  v.applyOrbit = () => {
    const o = v.orbit, [tx, ty, tz] = o.target;
    v.camera.position.set(tx + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, ty + Math.sin(o.pitch) * o.dist, tz + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
    v.camera.lookAt(tx, ty, tz);
  };
  /** Screen position (CSS px inside host) of a world point, for HTML labels over the canvas. */
  v.toScreen = (p) => { const q = p.clone().project(v.camera); return { x: (q.x * 0.5 + 0.5) * v.w, y: (-q.y * 0.5 + 0.5) * v.h, behind: q.z > 1 }; };
  return v;
}

/* ---------- shared scene bits ---------- */
export function rand(seed = 1) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909) ^ (s += 0x6d2b79f5)) >>> 0) / 4294967296; }
export function noise2(x, y) { // cheap value noise, deterministic
  const f = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
  return (f(xi, yi) * (1 - u) + f(xi + 1, yi) * u) * (1 - w) + (f(xi, yi + 1) * (1 - u) + f(xi + 1, yi + 1) * u) * w;
}
export const fbm = (x, y) => noise2(x, y) * 0.55 + noise2(x * 2.1, y * 2.1) * 0.28 + noise2(x * 4.3, y * 4.3) * 0.17;

/** Grey clay matcap like Blender's default sculpt matcap. */
export function clayMatcap(T, tint = [196, 190, 182]) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(96, 84, 10, 128, 128, 140);
  const [r, gg, b] = tint;
  grd.addColorStop(0, `rgb(${Math.min(255, r + 50)},${Math.min(255, gg + 50)},${Math.min(255, b + 50)})`);
  grd.addColorStop(0.45, `rgb(${r},${gg},${b})`);
  grd.addColorStop(0.85, `rgb(${r * 0.42 | 0},${gg * 0.4 | 0},${b * 0.4 | 0})`);
  grd.addColorStop(1, `rgb(${r * 0.7 | 0},${gg * 0.66 | 0},${b * 0.62 | 0})`);
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

/** A procedural city: returns { group, buildings: [{mesh index, x, z, h}], spawn(k) } built from an InstancedMesh. */
export function makeCity(T, { size = 14, seed = 7, density = 0.62, road = 4 } = {}) {
  const r = rand(seed);
  const group = new T.Group();
  const ground = new T.Mesh(new T.PlaneGeometry(size * 2 + 6, size * 2 + 6), new T.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);
  const roads = new T.Group(); group.add(roads);
  const roadMat = new T.MeshStandardMaterial({ color: 0x17181b, roughness: 0.8 });
  const lineMat = new T.MeshBasicMaterial({ color: 0xf2c94c });
  for (let i = -size; i <= size; i += road) {
    for (const rot of [0, 1]) {
      const m = new T.Mesh(new T.PlaneGeometry(rot ? 0.9 : size * 2, rot ? size * 2 : 0.9), roadMat);
      m.rotation.x = -Math.PI / 2; m.position.set(rot ? i : 0, 0.01, rot ? 0 : i); m.scale.set(rot ? 1 : 0.001, 1, 1); m.userData.rot = rot; roads.add(m);
      const l = new T.Mesh(new T.PlaneGeometry(rot ? 0.05 : size * 2, rot ? size * 2 : 0.05), lineMat);
      l.rotation.x = -Math.PI / 2; l.position.set(rot ? i : 0, 0.02, rot ? 0 : i); l.scale.copy(m.scale); l.userData.rot = rot; roads.add(l);
    }
  }
  const cells = [];
  for (let x = -size + 1; x < size; x++) for (let z = -size + 1; z < size; z++) {
    if (((x + size) % road) === 0 || ((z + size) % road) === 0) continue;
    const dCenter = Math.hypot(x, z) / size;
    const n = fbm(x * 0.18 + seed, z * 0.18);
    const dens = n * 0.7 + (1 - dCenter) * 0.6;
    cells.push({ x, z, dens, hgt: 0.4 + Math.pow(Math.max(0, 1 - dCenter), 2.2) * 7 * (0.4 + r()) + n * 1.5, tint: r() });
  }
  const max = cells.length;
  const geo = new T.BoxGeometry(0.82, 1, 0.82); geo.translate(0, 0.5, 0);
  const mat = new T.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 });
  const inst = new T.InstancedMesh(geo, mat, max);
  inst.castShadow = true; inst.receiveShadow = true;
  const col = new T.Color(), m4 = new T.Matrix4(), palette = [0x8a8f98, 0x6f7783, 0x9aa3ad, 0x5d6b7a, 0xb4b9bf, 0x46566a, 0xc9b79c];
  cells.forEach((c, i) => { col.setHex(palette[Math.floor(c.tint * palette.length)]); inst.setColorAt(i, col); m4.makeScale(1, 0.0001, 1).setPosition(c.x, 0, c.z); inst.setMatrixAt(i, m4); });
  inst.count = max;
  group.add(inst);
  const grown = new Float32Array(max);
  const target = new Float32Array(max);
  const city = {
    group, inst, cells, roads,
    density,
    /** keep cells whose density passes the filter, like PCG's Density Filter */
    plan(d = city.density) { city.density = d; cells.forEach((c, i) => (target[i] = c.dens > 1 - d ? c.hgt : 0)); },
    roadsK: 0,
    step(dt, speed = 1) {
      city.roadsK = Math.min(1, city.roadsK + dt * 0.7 * speed);
      roads.children.forEach((m) => { const k = Math.max(0.001, city.roadsK); m.scale.set(m.userData.rot ? 1 : k, m.userData.rot ? k : 1, 1); });
      if (city.roadsK < 0.6) return;
      let changed = false;
      for (let i = 0; i < max; i++) {
        const g = grown[i], t = target[i];
        if (Math.abs(g - t) < 0.001) continue;
        const delay = (Math.hypot(cells[i].x, cells[i].z) / 22);
        if (city.t0 != null && performance.now() / 1000 - city.t0 < delay) continue;
        grown[i] = g + (t - g) * Math.min(1, dt * 3.2 * speed) + Math.sign(t - g) * 0.002;
        m4.makeScale(1, Math.max(0.0001, grown[i]), 1).setPosition(cells[i].x, 0, cells[i].z);
        inst.setMatrixAt(i, m4); changed = true;
      }
      if (changed) inst.instanceMatrix.needsUpdate = true;
    },
    count() { let n = 0; for (let i = 0; i < max; i++) n += target[i] > 0; return n; },
    restart() { city.t0 = performance.now() / 1000; city.roadsK = 0; grown.fill(0); },
  };
  city.plan(density); city.restart();
  return city;
}

export function sunRig(T, scene, { sun = 0xffd8a8, sky = 0x9fb8d8, ground = 0x2a2420, intensity = 2.6, pos = [8, 12, 6], shadow = 18 } = {}) {
  const hemi = new T.HemisphereLight(sky, ground, 0.9); scene.add(hemi);
  const d = new T.DirectionalLight(sun, intensity); d.position.set(...pos); d.castShadow = true;
  d.shadow.mapSize.set(1024, 1024); const s = d.shadow.camera; s.left = s.bottom = -shadow; s.right = s.top = shadow; s.near = 1; s.far = 60; d.shadow.bias = -0.0008;
  scene.add(d);
  return { hemi, sun: d };
}
