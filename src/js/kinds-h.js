// Card kinds, part H: one health card per data family, each drawing one source's own synthetic payload
// (health-data.js) with that source's units, record types and provenance. Activity: Apple Health, Google Fit.
// Recovery: Oura, WHOOP, NOOP. Nutrition: MyFitnessPal, Lifesum. The merged brief stays `health` (kinds-f.js).
import { h, stagger, countUp } from "./motion.js";
import { shell, svg } from "./shell.js";
import { act } from "./loop.js";
import { appSurface, appBar } from "./chrome.js";
import { HEALTH_SOURCES, HEALTH_FAMILIES, fmtValue } from "./health-data.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // 2026-10-26 … 2026-11-01
const unitText = (u) => (u.startsWith("/") ? u : ` ${u}`);
const valueEls = (v, u) => [h("b", { class: "hs-v" }, fmtValue(v)), h("span", { class: "hs-u" }, unitText(u))];
const pct = (v, g) => Math.max(0, Math.min(1, v / g));

function goalsEl(goals) {
  return h("div", { class: "hs-goals" }, goals.map((g) => h("div", { class: "hs-goal", "data-label": g.label },
    h("span", {}, g.label, h("em", {}, `${fmtValue(g.value)} / ${fmtValue(g.goal)} ${g.unit}`)), h("i", { style: { "--p": pct(g.value, g.goal) } }))));
}

function dial(score, max) {
  const r = 40, c = 2 * Math.PI * r;
  return svg("svg", { viewBox: "0 0 100 100", class: "hs-dial" }, svg("circle", { cx: 50, cy: 50, r, class: "hs-trk" }),
    svg("circle", { cx: 50, cy: 50, r, class: "hs-arc", "stroke-dasharray": `${c}`, "stroke-dashoffset": `${c * (1 - pct(score, max))}` }));
}

function makeFamily(family) {
  return function make(a) {
    const own = HEALTH_SOURCES[a.id];
    const s = own?.family === family ? own : HEALTH_SOURCES[HEALTH_FAMILIES[family][0]];
    const H = s.headline;
    const head = h("div", { class: "hs-head" }, h("span", { class: "ap-lbl" }, H.label), h("div", { class: "hs-big", "data-field": H.field }, ...valueEls(H.value, H.unit)),
      H.goal ? h("span", { class: "hs-of" }, `goal ${fmtValue(H.goal)}${unitText(H.unit)}`) : null);
    const top = family === "recovery"
      ? h("div", { class: "hs-top" }, h("div", { class: "hs-dialwrap" }, dial(H.value, H.unit === "%" || H.unit === "/100" ? 100 : H.value), head))
      : h("div", { class: "hs-top" }, head, s.goals ? goalsEl(s.goals) : null);
    const meals = s.meals ? h("div", { class: "hs-meals" }, s.meals.map((m) => h("span", {}, m.label, h("b", {}, `${fmtValue(m.kcal)} kcal`)))) : null;
    // Metrics: each row is the payload's own field; tap one for its record type and the source's raw unit.
    const why = h("div", { class: "hs-why", "aria-live": "polite" }, "Tap a metric for its source record.");
    const rows = h("div", { class: "hs-metrics" }, s.metrics.map((m, i) => h("button", { type: "button", class: "hs-m", "data-i": i, "data-field": m.field, "aria-pressed": "false" },
      h("span", { class: "hs-l" }, m.label), h("span", { class: "hs-val" }, ...valueEls(m.value, m.unit)))));
    rows.addEventListener("click", (e) => {
      const b = e.target.closest(".hs-m"); if (!b) return;
      rows.querySelectorAll(".hs-m").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const m = s.metrics[+b.dataset.i];
      why.replaceChildren(h("code", {}, m.field), ` · ${s.name} · ${fmtValue(m.value)}${unitText(m.unit)}`, m.raw ? ` (source: ${fmtValue(m.raw.value)} ${m.raw.unit})` : "");
    });
    // Seven days of the source's own series; tap a day to read it.
    const pts = s.series.points, lo = Math.min(...pts), hi = Math.max(...pts);
    const read = h("span", { class: "hs-read" }, `${DAYS[6]} · ${fmtValue(pts[6])}${unitText(s.series.unit)}`);
    const days = h("div", { class: "hs-days", role: "group", "aria-label": s.series.label }, pts.map((p, i) => h("button", { type: "button", class: "hs-day" + (i === 6 ? " on" : ""), "data-i": i, "aria-label": `${DAYS[i]} ${fmtValue(p)}${unitText(s.series.unit)}` },
      h("i", { style: { "--p": hi === lo ? 1 : 0.2 + (0.8 * (p - lo)) / (hi - lo) } }), h("span", {}, DAYS[i][0]))));
    days.addEventListener("click", (e) => {
      const b = e.target.closest(".hs-day"); if (!b) return;
      days.querySelectorAll(".hs-day").forEach((x) => x.classList.toggle("on", x === b));
      read.textContent = `${DAYS[+b.dataset.i]} · ${fmtValue(pts[+b.dataset.i])}${unitText(s.series.unit)}`;
    });
    const P = s.provenance;
    const prov = h("div", { class: "hs-prov" }, h("span", { class: "ap-lbl" }, "Provenance"),
      h("div", { class: "hs-via" }, h("b", {}, s.name), ` · ${P.via}`), h("div", { class: "hs-dev" }, `${P.device} · ${s.day}`),
      h("div", { class: "hs-recs" }, P.records.map((r) => h("code", {}, r))), P.note ? h("p", { class: "hs-note" }, P.note) : null,
      h("span", { class: "hs-syn" }, "Synthetic fixture: no real data"));
    const surface = appSurface(a, [appBar([s.name, "Today", "Trends"], [h("span", { class: "ap-stat hs-src" }, s.id === a.id ? `source: ${s.name}` : `sample from ${s.name}`)]),
      top, meals, h("div", { class: "hs-trend" }, h("div", { class: "hs-trh" }, h("span", { class: "ap-lbl" }, s.series.label), read), days), rows, why, prov], { cls: `hs hs-${family}` });
    const el = shell(a, `health-${family}`, { verb: `${H.label} from ${s.name}`, status: "Synthetic", body: surface,
      foot: [act("Explain this number", { cls: "ghost", entities: { source: s.id, field: H.field }, ack: `${H.label} ${fmtValue(H.value)}${unitText(H.unit)} is ${s.name}'s own ${H.field}, read via ${P.via}.` })],
      summary: `${s.name} ${H.label.toLowerCase()} ${fmtValue(H.value)}${unitText(H.unit)}` });
    return { el, async play(run) {
      const big = el.querySelector(".hs-big .hs-v");
      countUp(big, H.value, { dur: 900, fmt: (x) => fmtValue(x === H.value || !Number.isInteger(H.value) ? Math.round(x * 100) / 100 : Math.round(x)) });
      stagger(rows.children, { gap: 50, delay: 150 });
      stagger(days.children, { gap: 30, delay: 250, y: 4 });
      await run.wait(900);
    }, spec: { kind: `health-${family}`, app: a.id, source: s.id, family, day: s.day, headline: H, metrics: s.metrics, series: s.series, provenance: P, data: "synthetic" } };
  };
}

export const KINDS_H = {
  "health-activity": { label: "Health activity (source)", verb: () => "Read activity", make: makeFamily("activity") },
  "health-recovery": { label: "Health recovery (source)", verb: () => "Read recovery", make: makeFamily("recovery") },
  "health-nutrition": { label: "Health nutrition (source)", verb: () => "Read food log", make: makeFamily("nutrition") },
};
