// intel-suite: Glide's personal-intelligence pane. Five questions, one hero each:
// hill climbs (is it getting better?), skill router (did my asks land on the right skill?),
// unified memory (z0intelligence L0 evidence → L5 State Packet: what's fresh?), recurring failures
// (what keeps breaking, and is it a law yet?), event trace (omp-stats style: where did the time go?).
// Every action emits eui:intent and leaves a visible receipt. SAMPLE data (authored-example).
import { h } from "./motion.js";
import { shell, svg, holdButton } from "./shell.js";

const TABS = ["Hill climbs", "Skill router", "Memory", "Failures", "Trace"];
const CLIMB = [0.63, 0.64, 0.62, 0.67, 0.69, 0.66, 0.71, 0.72, 0.7, 0.75, 0.74, 0.78, 0.77, 0.81];
const ROUTES = [["blender-lookdev", 9, 0], ["ephemeral-ui-kit", 8, 0], ["systematic-debugging", 7, 1], ["github", 6, 0], ["fframes-video", 5, 1], ["other", 5, 0]];
const LAYERS = [
  ["L5", "State Packet", "1 md · 6 KB", "2 m ago", 0], ["L4", "Reconciled state", "2.4k claims", "stale 6 h", 1],
  ["L3", "Relations", "31k edges", "12 m ago", 0], ["L2", "Cracking", "88k facts", "9 m ago", 0],
  ["L1", "Cheap retrieval", "412k chunks", "3 m ago", 0], ["L0", "Raw evidence", "2.1M events", "live", 0]];
const FAILS = [
  ["database is locked", "service-watch", "00101101011011", 34, "open"],
  ["stale ctx index", "ctx import", "00010010010011", 9, "open"],
  ["tmpfs full of render temp dirs", "fframes", "00000001010110", 6, "fixed"],
  ["login keyring locked", "memory lab", "11111111100000", 123, "law"]];
const TRACKS = [
  ["main", [[0, 9, "m"], [9, 14, "t"], [14, 31, "m"], [31, 35, "t"], [52, 66, "m"], [66, 70, "t"], [70, 88, "m"]]],
  ["lane · fast", [[16, 22, "m"], [22, 25, "t"], [25, 29, "e"], [29, 41, "m"], [41, 44, "t"]]],
  ["lane · large", [[18, 33, "m"], [33, 37, "t"], [37, 50, "m"], [50, 53, "t"]]]];

export const INTEL_APPS = { "intel-suite": "glide" };

function make(a, _r, _data, opts = {}) {
  let tab = Math.max(0, Math.min(4, opts.tab ?? 0));
  const emit = (action, label, ids = ["card:intel-suite"], extra = {}) => el.dispatchEvent(new CustomEvent("eui:intent", { bubbles: true,
    detail: { v: 0, kind: "intel-suite", app: a.id, action, label, ids, at: Date.now(), ...extra } }));
  const receipt = h("p", { class: "is-receipt", role: "status" });
  const say = (t) => { receipt.textContent = t; receipt.classList.remove("on"); void receipt.offsetWidth; receipt.classList.add("on"); };
  const btn = (label, fn, cls = "") => h("button", { type: "button", class: `is-act ${cls}`, onclick: (e) => fn(e.currentTarget) }, label);
  const hold = (label, fn) => holdButton(label, (b, txt) => fn(b, txt), { cls: "is-hold" });
  const stat = (k, v, u = "", cls = "") => h("div", { class: `is-stat ${cls}` }, h("span", { class: "is-k" }, k), h("div", { class: "is-v" }, h("b", {}, v), u ? h("small", {}, u) : null));

  // ---------- 1 hill climbs ----------
  function climb() {
    const W = 640, H = 230, P = 28, n = CLIMB.length, lo = 0.6, hi = 0.84;
    const x = (i) => P + (i * (W - P * 2)) / (n - 1), y = (v) => H - P - ((v - lo) / (hi - lo)) * (H - P * 2);
    let best = -1, d = "";
    const dots = [];
    CLIMB.forEach((v, i) => {
      const kept = v > best; if (kept) best = v;
      dots.push(svg("circle", { cx: x(i), cy: y(v), r: kept ? 5 : 4, class: kept ? "is-kept" : "is-rev" }));
    });
    best = -1;
    CLIMB.forEach((v, i) => { if (v > best) { d += `${d ? "L" : "M"}${x(i)},${d ? y(best) : y(v)} L${x(i)},${y(v)} `; best = v; } });
    d += `L${x(n - 1)},${y(best)}`;
    const grid = [0.65, 0.7, 0.75, 0.8].map((v) => svg("g", {}, svg("line", { x1: P, x2: W - P, y1: y(v), y2: y(v), class: "is-grid" }), svg("text", { x: 2, y: y(v) + 4, class: "is-ax" }, v.toFixed(2))));
    const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "is-chart" }, ...grid,
      svg("path", { d: `${d} L${x(n - 1)},${H - P} L${x(0)},${H - P} Z`, class: "is-area" }), svg("path", { d, class: "is-step" }), ...dots,
      svg("text", { x: x(n - 1) - 4, y: y(0.81) - 12, class: "is-peak", "text-anchor": "end" }, "0.81 recall@3"));
    const runs = h("b", {}, "14");
    return h("div", { class: "is-pane is-climb" },
      h("div", { class: "is-hero" }, h("p", { class: "is-q" }, "Is memory recall getting better?"), chart,
        h("p", { class: "is-legend" }, h("span", { class: "is-lk" }, "kept"), h("span", { class: "is-lr" }, "reverted"), "fitness: corrections recall@3 on the newest 30% of incidents")),
      h("aside", { class: "is-side" }, h("div", { class: "is-big" }, h("b", {}, "+0.18"), h("small", {}, "since baseline")),
        h("div", { class: "is-stats" }, h("div", { class: "is-stat" }, h("span", { class: "is-k" }, "Runs"), h("div", { class: "is-v" }, runs)), stat("Kept", "6"), stat("Plateau", "no", "", "is-ok")),
        hold("Hold to promote best", (b, t) => { t.textContent = "Promoted ✓"; emit("promote", "Promote best candidate", ["climb:recall3", "candidate:14"]); say("Promoted candidate 14 to the live seam · receipt pending its next real turn"); }),
        btn("Run 5 more", (b) => { runs.textContent = String(+runs.textContent + 5); b.textContent = "Queued ✓"; emit("run", "Run 5 more candidates", ["climb:recall3"]); say("5 candidates queued on the free lane"); })));
  }

  // ---------- 2 skill router ----------
  function router() {
    const total = ROUTES.reduce((s, r) => s + r[1], 0), W = 640, H = 250, L = 110, R = 420;
    let yy = 10; const flows = [], labels = [];
    ROUTES.forEach(([name, n, miss], i) => {
      const hgt = (n / total) * (H - 20 - ROUTES.length * 6), y0 = 10 + (H - 20) * 0.5 - (H - 20) * 0.25 + (i - 2.5) * 0, cy = yy + hgt / 2;
      const sy = 40 + (yy - 10) * 0.66, sh = hgt * 0.66;
      flows.push(svg("path", { d: `M${L},${sy} C${(L + R) / 2},${sy} ${(L + R) / 2},${yy} ${R},${yy} L${R},${yy + hgt} C${(L + R) / 2},${yy + hgt} ${(L + R) / 2},${sy + sh} ${L},${sy + sh} Z`, class: `is-flow ${miss ? "is-miss" : ""}`, style: `--i:${i}` }));
      flows.push(svg("rect", { x: R, y: yy, width: 8, height: hgt, rx: 2, class: `is-node ${miss ? "is-miss" : ""}` }));
      labels.push(svg("text", { x: R + 16, y: cy + 4, class: "is-lab" }, `${name}`), svg("text", { x: W - 6, y: cy + 4, class: "is-num", "text-anchor": "end" }, `${n}${miss ? " · 1 miss" : ""}`));
      void y0; yy += hgt + 6;
    });
    const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "is-chart" },
      svg("rect", { x: L - 8, y: 40, width: 8, height: (yy - 16) * 0.66, rx: 2, class: "is-src" }),
      svg("text", { x: L - 16, y: 40 + ((yy - 16) * 0.66) / 2, class: "is-lab", "text-anchor": "end" }, "40 asks"), ...flows, ...labels);
    const rows = [["“why is the moss flat?”", "fframes-video", "blender-lookdev"], ["“tests hang on 304”", "systematic-debugging", "dash-army-roster-304"]].map(([ask, got, want]) => {
      const row = h("div", { class: "is-mrow" }, h("q", {}, ask), h("span", { class: "is-got" }, got), h("span", { class: "is-arrow" }, "→"), h("span", { class: "is-want" }, want));
      row.append(btn("Fix route", (b) => { b.textContent = "Fixed ✓"; row.classList.add("is-done"); emit("fix-route", `Route “${ask}” to ${want}`, [`skill:${want}`]); say(`Router rule added: ${want} wins for this phrasing`); }));
      return row;
    });
    return h("div", { class: "is-pane is-router" },
      h("div", { class: "is-hero" }, h("p", { class: "is-q" }, "Did my last 40 asks land on the right skill?"), chart),
      h("aside", { class: "is-side" }, h("div", { class: "is-big" }, h("b", {}, "87%"), h("small", {}, "first-hop hit rate")),
        h("p", { class: "is-k" }, "2 misroutes"), ...rows));
  }

  // ---------- 3 unified memory ----------
  function memory() {
    const detail = h("p", { class: "is-detail" }, "Tap a layer. Memory supplies evidence, never authority.");
    const stack = h("div", { class: "is-stack" }, ...LAYERS.map(([id, name, n, fresh, stale], i) => {
      const w = 46 + i * 10.8;
      const row = h("button", { type: "button", class: `is-layer ${stale ? "is-stale" : ""}`, style: { width: `${w}%`, "--i": i },
        onclick: () => { stack.querySelectorAll(".is-layer").forEach((x) => x.classList.remove("is-sel")); row.classList.add("is-sel");
          detail.textContent = `${id} ${name}: ${n} · ${fresh}${stale ? " · reconcile job missed 2 ticks" : ""}`; emit("inspect", `Inspect ${id} ${name}`, [`memory:${id}`]); } },
        h("b", {}, id), h("span", { class: "is-ln" }, name), h("span", { class: "is-lc" }, n), h("i", {}, fresh));
      return row;
    }));
    return h("div", { class: "is-pane is-memory" },
      h("div", { class: "is-hero" }, h("p", { class: "is-q" }, "What does it know, and how fresh is it?"), stack, detail),
      h("aside", { class: "is-side" }, h("div", { class: "is-big" }, h("b", {}, "6"), h("small", {}, "layers · z0intelligence")),
        h("p", { class: "is-tag" }, "evidence ≠ claim ≠ state"),
        h("div", { class: "is-stats" }, stat("Recall@3", "0.81"), stat("Stale", "1", "layer", "is-warn")),
        btn("Refresh L4", (b) => { const s = stack.querySelector(".is-stale"); s?.classList.remove("is-stale"); if (s) s.querySelector("i").textContent = "just now"; b.textContent = "Refreshed ✓"; emit("refresh", "Reconcile L4 state", ["memory:L4"]); say("L4 reconciled · 2.4k claims re-checked against L3"); }, "is-primary")));
  }

  // ---------- 4 recurring failures ----------
  function failures() {
    const rows = FAILS.map(([what, where, strip, n, st]) => {
      const badge = h("span", { class: `is-badge is-${st}` }, st === "law" ? "law ✓" : st);
      const row = h("div", { class: "is-frow" },
        h("div", { class: "is-fw" }, h("b", {}, what), h("small", {}, where)),
        h("div", { class: "is-strip" }, ...[...strip].map((c) => h("i", { class: c === "1" ? "on" : "" }))),
        h("span", { class: "is-fn" }, `${n}×`), badge,
        st === "open" ? hold("Hold: make it a law", (b, t) => { t.textContent = "Law ✓"; badge.className = "is-badge is-law"; badge.textContent = "law ✓"; emit("law", `Make “${what}” a law`, [`failure:${what}`]); say(`Law drafted: “${what}” now fails the gate before it can recur`); }) : h("span", { class: "is-spacer" }));
      return row;
    });
    return h("div", { class: "is-pane is-fails" },
      h("div", { class: "is-hero is-wide" }, h("p", { class: "is-q" }, "What keeps breaking? Last 14 days."), h("div", { class: "is-flist" }, ...rows)),
      h("aside", { class: "is-side is-row" }, h("div", { class: "is-big" }, h("b", {}, "4"), h("small", {}, "recurring · 2 open")), stat("Fixed at root", "1"), stat("Enforced as law", "1", "", "is-ok")));
  }

  // ---------- 5 event trace (omp-stats style) ----------
  function trace() {
    const W = 660, top = 22, rowH = 46, X = (s) => 96 + (s / 90) * (W - 110);
    const marks = [];
    let errSpan = null;
    TRACKS.forEach(([label, spans], r) => {
      const y = top + r * rowH;
      marks.push(svg("text", { x: 0, y: y + 20, class: "is-lab" }, label), svg("line", { x1: 96, x2: W - 14, y1: y + 16, y2: y + 16, class: "is-grid" }));
      for (const [s, e, k] of spans) {
        const rect = svg("rect", { x: X(s), y: y + 4, width: Math.max(3, X(e) - X(s) - 1.5), height: 24, rx: 4, class: `is-span is-${k}`, style: `--d:${s / 90}` });
        if (k === "e") errSpan = rect;
        marks.push(rect);
      }
    });
    for (let s = 0; s <= 90; s += 15) marks.push(svg("text", { x: X(s), y: top + 3 * rowH + 14, class: "is-ax", "text-anchor": "middle" }, `${s}s`));
    const chart = svg("svg", { viewBox: `0 0 ${W} ${top + 3 * rowH + 22}`, class: "is-chart" }, ...marks);
    return h("div", { class: "is-pane is-trace" },
      h("div", { class: "is-hero" }, h("p", { class: "is-q" }, "Where did the 90 seconds go?"), chart,
        h("p", { class: "is-legend" }, h("span", { class: "is-lm" }, "model"), h("span", { class: "is-lt" }, "tool"), h("span", { class: "is-le" }, "error"), "after omp /stats")),
      h("aside", { class: "is-side" }, h("div", { class: "is-big" }, h("b", {}, "88s"), h("small", {}, "3 tracks · 2 lanes")),
        h("div", { class: "is-stats" }, stat("Tokens", "182k"), stat("Cost", "$0.41"), stat("Tools", "11"), stat("Errors", "1", "", "is-bad")),
        btn("Jump to failure", (b) => { errSpan?.classList.add("is-flash"); b.textContent = "fast lane · 25s ✓"; emit("jump", "Jump to failed span", ["span:fast-25"], { entities: [{ type: "span", id: "fast-25", track: "lane · fast" }] }); say("Opened span: tool timeout in lane · fast at +00:25"); }, "is-primary")));
  }

  const panes = [climb, router, memory, failures, trace];
  const seg = h("div", { class: "is-seg", role: "tablist" }, ...TABS.map((t, i) => h("button", { type: "button", role: "tab", class: "is-segb", "aria-selected": String(i === tab), onclick: () => setTab(i, true) }, t)));
  const stage = h("div", { class: "is-stage" });
  const body = h("div", { class: "fl-root is-root" },
    h("div", { class: "is-head" }, h("div", {}, h("span", { class: "is-eyebrow" }, "Glide · personal intelligence · example data"), h("h3", { class: "is-title" }, "It already knows you.")), seg),
    stage, receipt);
  function setTab(i, user = false) {
    tab = i; seg.querySelectorAll(".is-segb").forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
    stage.replaceChildren(panes[i]()); receipt.textContent = "";
    if (user) emit("tab", `Open ${TABS[i]}`, [`tab:${TABS[i]}`]);
  }
  setTab(tab);
  const el = shell(a, "intel-suite", { verb: "Intelligence", status: "Example", body, summary: "Glide · intelligence suite" });
  el.querySelector(".eu-ttl")?.remove();
  return { el, spec: { kind: "intel-suite", app: a.id, provenance: "authored-example", tabs: TABS }, setTab, async play() {} };
}

export const KINDS_INTEL = { "intel-suite": { label: "Intelligence", make } };
