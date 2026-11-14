// Card kinds, part B: money, places, media, health, home, and the developer loop.
import { h, anim, stagger, countUp, typeText, pick, flip, Run } from "./motion.js";
import { shell, icon, avatar, PEOPLE, COMPANIES, holdButton, burst, seg, svg, fmt$ } from "./shell.js";
import { tell, undoable, why, settle, roving, setDisabled } from "./loop.js";

const METRIC = {
  pay: ["Net volume", 48210, "$"], money: ["Cash balance", 182400, "$"], shop: ["Orders today", 1284, ""], analytics: ["Weekly active users", 23810, ""],
  social: ["Impressions (7d)", 412000, ""], media: ["Plays (7d)", 96300, ""], deploy: ["p95 latency", 182, "ms"], data: ["Rows synced", 2400000, ""],
  ai: ["Tokens today", 3100000, ""], email: ["Open rate", 41.2, "%"], health: ["Resting HR", 52, "bpm"], default: ["Active users", 12840, ""],
};

function series(r, n = 24, base = 50) { let v = base; return Array.from({ length: n }, () => (v = Math.max(8, Math.min(92, v + (r() - 0.45) * 18)))); }
function pathOf(pts, W, H) { const step = W / (pts.length - 1); return pts.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${(H - (p / 100) * H).toFixed(1)}`).join(" "); }

/** A tiny stylised street map (grid, park, water) used by route and ride. */
function cityMap(r, W = 320, H = 170) {
  const g = svg("g", { class: "streets" });
  for (let x = -20; x < W + 40; x += 34 + Math.floor(r() * 10)) g.append(svg("line", { x1: x, y1: 0, x2: x + 30, y2: H }));
  for (let y = 12; y < H; y += 28 + Math.floor(r() * 8)) g.append(svg("line", { x1: 0, y1: y, x2: W, y2: y - 14 }));
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "map", preserveAspectRatio: "xMidYMid slice" },
    svg("rect", { width: W, height: H, class: "land" }),
    svg("path", { class: "water", d: `M${W * 0.72} 0 C ${W * 0.8} ${H * 0.4}, ${W * 0.95} ${H * 0.5}, ${W} ${H * 0.62} L ${W} 0 Z` }),
    svg("rect", { class: "park", x: W * 0.18, y: H * 0.52, width: 64, height: 40, rx: 8 }),
    g);
  return s;
}

function pin(s, x, y, cls) { const p = svg("g", { class: "pin " + cls, transform: `translate(${x} ${y})` }, svg("circle", { r: 7 }), svg("circle", { r: 3, class: "in" })); s.append(p); return p; }

export const KINDS_B = {
  receipt: {
    label: "Pay + receipt", verb: () => "Ready to pay",
    make(a, r) {
      const who = pick(r, COMPANIES), amt = 1240;
      const items = [["Retainer · October", 1100], ["Usage overage", 112.5], ["Tax", 27.5]];
      const paper = h("div", { class: "paper" }, h("div", { class: "pm" }, icon(a, 18), h("b", {}, who)), items.map(([n, v]) => h("div", { class: "li" }, h("span", {}, n), h("span", {}, fmt$(v)))), h("div", { class: "li tot" }, h("span", {}, "Total"), h("span", {}, fmt$(amt))), h("div", { class: "barcode" }), h("span", { class: "eu-hint" }, `Paid with ${a.name} · •••• 4242`));
      const slot = h("div", { class: "slot" }, h("div", { class: "mouth" }), h("div", { class: "feed" }, paper));
      // Before money moves, show what it's for: the line items, and the one that looks unusual.
      const lines = h("div", { class: "rc-lines" }, items.map(([n, v]) => h("div", { class: "rc-li" + (n === "Usage overage" ? " odd" : "") }, h("span", {}, n), h("span", {}, fmt$(v)))));
      const head = h("div", { class: "payhead" }, h("span", { class: "eu-hint" }, `To ${who}`), h("b", { class: "big amt" }, fmt$(0)), h("span", { class: "eu-hint" }, "Invoice #4471 · due Nov 14 · •••• 4242"));
      const note = h("div", { class: "rc-note" }, why(`The overage (${fmt$(112.5)}) is new this month: 450 API calls over the 10k plan at $0.25. Last 3 invoices were exactly ${fmt$(1127.5)}.`, { label: "1 line is new this month" }));
      const btn = holdButton(`Hold to pay ${fmt$(amt)}`, (b, t) => { t.textContent = "Paid ✓"; settle(el, "Paid", "ok"); setDisabled(sched, "Invoice paid"); lines.hidden = true; note.hidden = true; printIt(); burst(b); tell(el, { action: "pay", label: `Pay ${who} ${fmt$(amt)}`, entities: { invoice: "4471", company: who }, ack: "Paid. The receipt is filed next to the invoice and Finance is cc'd." }); });
      const sched = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        if (el.querySelector(".lp-chips")) return;
        const box = h("div", { class: "lp-chips", role: "group", "aria-label": "Pay on" }, [["Nov 13", "the day before it's due"], ["Nov 14", "the due date"], ["Next payday", "Nov 15, one day late"]].map(([d, hint]) => h("button", { class: "eu-chip btn", type: "button", title: hint, onclick: () => { box.remove(); settle(el, `Scheduled ${d}`); setDisabled(btn, "Payment scheduled"); sched.textContent = `Scheduled · ${d}`; setDisabled(sched, "Payment scheduled"); tell(el, { action: "schedule", label: `Pay on ${d}`, entities: { invoice: "4471", date: d }, ack: d === "Next payday" ? "Scheduled for Nov 15 — that's a day late; Acme's terms add no fee for 5 days." : `Scheduled for ${d}. I'll confirm here when it clears.` }); undoable(el, `Scheduled for ${d}`, () => { settle(el, "Due"); setDisabled(btn); sched.textContent = "Schedule"; setDisabled(sched); }); } }, d)));
        el.querySelector(".eu-b").append(box); box.querySelector("button").focus();
      } }, "Schedule");
      async function printIt() { slot.classList.add("on"); const f = slot.querySelector(".feed"); const hgt = paper.offsetHeight; await anim(f, [{ height: "0px" }, { height: `${hgt}px` }], { duration: 1500, easing: "steps(18, end)" }).finished; f.style.height = `${hgt}px`; }
      const el = shell(a, "receipt", { verb: this.verb(a), status: "Due", body: h("div", {}, head, lines, note, slot), foot: [btn, sched], summary: `Paid ${who} ${fmt$(amt)}` });
      return { el, async play(run) { countUp(head.querySelector(".amt"), amt, { dur: 900, fmt: fmt$ }); }, spec: { kind: "receipt", app: a.id, payee: who, amount: amt, currency: "USD" } };
    },
  },
  metric: {
    label: "Metric + sparkline", verb: () => "Pulled metrics",
    make(a, r) {
      const [lbl, val, unit] = METRIC[a.cat] || METRIC.default;
      const W = 300, H = 80;
      const sets = [series(r, 24, 45), series(r, 24, 55), series(r, 24, 40)];
      const area = svg("path", { class: "area" }), line = svg("path", { class: "line", pathLength: 1 });
      const dot = svg("circle", { r: 4, class: "hdot" }), cross = svg("line", { class: "cross", y1: 0, y2: H });
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "spark", preserveAspectRatio: "none" }, svg("defs", {}, svg("linearGradient", { id: `g-${a.id}`, x1: 0, y1: 0, x2: 0, y2: 1 }, svg("stop", { offset: "0", "stop-color": "currentColor", "stop-opacity": ".28" }), svg("stop", { offset: "1", "stop-color": "currentColor", "stop-opacity": "0" }))), area, line, cross, dot);
      area.setAttribute("fill", `url(#g-${a.id})`);
      let cur = sets[0];
      const draw = (pts) => { const d = pathOf(pts, W, H); line.setAttribute("d", d); area.setAttribute("d", d + ` L${W} ${H} L0 ${H} Z`); };
      draw(cur);
      const big = h("b", { class: "big" }, "0");
      const fmtV = (v) => unit === "$" ? "$" + Math.round(v).toLocaleString() : unit === "%" ? v.toFixed(1) + "%" : unit ? `${Math.round(v)} ${unit}` : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.round(v).toLocaleString();
      const tip = h("span", { class: "tip" });
      const wrap = h("div", { class: "sparkwrap" }, s, tip);
      wrap.addEventListener("pointermove", (e) => { const b = s.getBoundingClientRect(); const k = Math.max(0, Math.min(cur.length - 1, Math.round(((e.clientX - b.left) / b.width) * (cur.length - 1)))); const x = (k / (cur.length - 1)) * W, y = H - (cur[k] / 100) * H; dot.setAttribute("cx", x); dot.setAttribute("cy", y); cross.setAttribute("x1", x); cross.setAttribute("x2", x); wrap.classList.add("hov"); tip.textContent = fmtV(val * (0.6 + cur[k] / 160)); tip.style.left = `${(x / W) * 100}%`; });
      wrap.addEventListener("pointerleave", () => wrap.classList.remove("hov"));
      const morph = (i) => { const from = cur, to = sets[i]; const t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 520); const e = 1 - Math.pow(1 - k, 3); draw(from.map((v, j) => v + (to[j] - v) * e)); if (k < 1) requestAnimationFrame(step); else cur = to; }; requestAnimationFrame(step); countUp(big, val * [1, 3.7, 10.4][i], { from: val * [1, 3.7, 10.4][[0, 1, 2].find((q) => sets[q] === from) ?? 0], fmt: fmtV, dur: 600 }); };
      const delta = (4 + r() * 12).toFixed(1);
      const body = h("div", { class: "metric" }, h("div", { class: "row between" }, h("div", {}, h("span", { class: "eu-hint" }, lbl), h("div", { class: "row" }, big, h("span", { class: "delta up" }, `▲ ${delta}%`))), seg(["7d", "30d", "90d"], morph, 0)), wrap);
      // Click the chart to ask about a point: the agent gets the exact bucket, not "that dip".
      let hoverK = null;
      wrap.addEventListener("pointermove", (e) => { const b = s.getBoundingClientRect(); hoverK = Math.max(0, Math.min(cur.length - 1, Math.round(((e.clientX - b.left) / b.width) * (cur.length - 1)))); });
      wrap.addEventListener("click", () => { if (hoverK == null) return; const k = hoverK; const prev = cur[Math.max(0, k - 1)]; const dir = cur[k] < prev ? "dip" : "rise"; tell(el, { action: "select", label: `Why the ${dir} at point ${k + 1}?`, entities: { metric: lbl, bucket: k }, ack: dir === "dip" ? `That ${dir} lines up with the Tuesday deploy; it recovered within a day. Want the deploy diff?` : `Mostly organic: the launch post drove it. No campaign that day.` }); });
      wrap.title = "Click a point to ask about it";
      let alert = null;
      const alertBtn = h("button", { class: "eu-btn ghost", type: "button", "aria-pressed": "false", onclick: () => {
        if (alert) { alert = null; alertBtn.setAttribute("aria-pressed", "false"); alertBtn.textContent = "Alert me"; s.querySelector(".thr")?.remove(); tell(el, { action: "unalert", label: "Stop the alert", entities: { metric: lbl }, quiet: true }); return; }
        alert = Math.min(...cur) + 4; const y = H - (alert / 100) * H;
        s.append(svg("line", { class: "thr", x1: 0, x2: W, y1: y, y2: y }));
        alertBtn.setAttribute("aria-pressed", "true"); alertBtn.textContent = `Alert below ${fmtV(val * (0.6 + alert / 160))} ✓`;
        tell(el, { action: "alert", label: `Alert me if ${lbl.toLowerCase()} drops below ${fmtV(val * (0.6 + alert / 160))}`, entities: { metric: lbl }, ack: "Set. I'll message you here, at most once a day." });
      } }, "Alert me");
      const el = shell(a, "metric", { verb: this.verb(a), body, foot: [h("button", { class: "eu-btn", type: "button", onclick: () => tell(el, { action: "open", label: `Open the ${a.name} dashboard`, entities: { metric: lbl }, ack: `Opened ${a.name} on “${lbl}” with the same range.` }) }, "Open dashboard"), alertBtn], summary: `${lbl}: ${fmtV(val)} (▲ ${delta}%)` });
      return { el, async play(run) { countUp(big, val, { fmt: fmtV, dur: 1100 }); anim(line, [{ strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDasharray: 1, strokeDashoffset: 0 }], { duration: 1200, easing: "cubic-bezier(.65,0,.35,1)" }); anim(area, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 700 }); }, spec: { kind: "metric", app: a.id, label: lbl, value: val, delta: +delta } };
    },
  },
  track: {
    label: "Order tracking", verb: () => "Tracking your order",
    make(a, r) {
      const st = ["Ordered", "Packed", "Shipped", "Out for delivery", "Delivered"];
      const at = 3;
      const bar = h("div", { class: "trk" }, h("div", { class: "rail" }, h("i", { class: "fill" }), h("span", { class: "veh" }, a.cat === "ride" ? "🛵" : "🚚")), h("ol", {}, st.map((s, i) => h("li", { class: i <= at ? "ok" : "" }, h("i"), h("span", {}, s)))));
      const eta = h("b", { class: "big" }, "2:40 PM");
      const what = a.cat === "ride" ? ["Pad thai, spring rolls", "Order #DD-8812"] : ["Keychron K2, USB-C hub", `#${Math.floor(r() * 9e8 + 1e8)}`];
      const body = h("div", {}, h("div", { class: "row between" }, h("div", {}, h("span", { class: "eu-hint", style: { display: "block" } }, "Arriving"), eta), h("div", { class: "right" }, h("b", { style: { display: "block" } }, what[0]), h("span", { class: "eu-hint" }, what[1]))), bar);
      const help = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        if (el.querySelector(".lp-chips")) return;
        const box = h("div", { class: "lp-chips", role: "group", "aria-label": "What's wrong?" }, ["Leave at the door", "It's late", "Change address"].map((x) => h("button", { class: "eu-chip btn", type: "button", onclick: () => { box.remove(); tell(el, { action: "help", label: x, entities: { order: what[1] }, ack: x === "Leave at the door" ? "Added a drop-off note for the driver." : x === "It's late" ? "It isn't yet — ETA is still 2:40. If it slips past 3:10 I'll open a claim for you." : "It's already out for delivery, so the address is locked. I can ask the driver to hold it at the depot instead." }); } }, x)));
        el.querySelector(".eu-b").append(box); box.querySelector("button").focus();
      } }, "Get help");
      const live = h("button", { class: "eu-btn", type: "button", onclick: () => { const on = !bar.classList.contains("live"); bar.classList.toggle("live", on); live.textContent = on ? "Stop live ●" : "Live updates"; tell(el, { action: on ? "watch" : "unwatch", label: on ? "Tell me when it's 2 stops away" : "Stop watching", entities: { order: what[1] }, ack: on ? "I'll ping you at 2 stops away and when it's delivered." : null, quiet: !on }); } }, "Live updates");
      const el = shell(a, "track", { verb: this.verb(a), status: "On the way", body, foot: [live, help], summary: `${what[0]} arriving 2:40 PM` });
      return { el, async play(run) { const f = bar.querySelector(".fill"), v = bar.querySelector(".veh"); const p = (at / (st.length - 1)) * 100; anim(f, [{ width: "0%" }, { width: `${p}%` }], { duration: 1600, easing: "cubic-bezier(.65,0,.35,1)" }); anim(v, [{ left: "0%" }, { left: `${p}%` }], { duration: 1600, easing: "cubic-bezier(.65,0,.35,1)" }); bar.querySelectorAll("li.ok i").forEach((x, i) => anim(x, [{ transform: "scale(0)" }, { transform: "scale(1)" }], { spring: "bouncy", delay: 200 + i * 380 })); }, spec: { kind: "track", app: a.id, status: st[at], eta: "14:40" } };
    },
  },
  crm: {
    label: "Deal pipeline", verb: () => "Updated a deal",
    make(a, r) {
      const st = ["Lead", "Qualified", "Proposal", "Negotiation", "Won"];
      let at = 2;
      const co = pick(r, COMPANIES), amt = Math.round(18 + r() * 80) * 1000;
      const pills = st.map((s, i) => h("li", { class: i < at ? "past" : i === at ? "cur" : "" }, s));
      const ind = h("span", { class: "ind" });
      const ol = h("ol", { class: "pipe" }, ind, pills);
      const place = (an) => { const p = pills[at]; const to = { transform: `translateX(${p.offsetLeft}px)`, width: `${p.offsetWidth}px` }; if (an) anim(ind, [{ transform: ind.style.transform, width: ind.style.width }, to], { spring: "bouncy" }); Object.assign(ind.style, to); };
      requestAnimationFrame(() => requestAnimationFrame(() => place(false)));
      const adv = h("button", { class: "eu-btn primary", onclick: (e) => { if (at >= st.length - 1) return; const prev = at; at++; pills.forEach((p, i) => (p.className = i < at ? "past" : i === at ? "cur" : "")); place(true); if (at === st.length - 1) { adv.textContent = "Won 🎉"; burst(adv, "var(--h-success)", 16); } if (e.isTrusted) undoable(el, `${co} → ${st[at]}`, () => { at = prev; pills.forEach((p, i) => (p.className = i < at ? "past" : i === at ? "cur" : "")); place(true); adv.textContent = "Advance stage"; }); } }, "Advance stage");
      const body = h("div", { class: "crm" }, h("div", { class: "row between" }, h("div", {}, h("b", {}, co), h("span", { class: "eu-hint" }, ` · ${pick(r, PEOPLE)}`)), h("b", { class: "big" }, "$" + amt.toLocaleString())), ol, h("div", { class: "row" }, h("span", { class: "eu-hint" }, "Next: send revised proposal · due Thu"), h("span", { class: "eu-avs" }, avatar(PEOPLE[1], 1), avatar(PEOPLE[5], 5))));
      const log = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        if (el.querySelector(".lp-inline")) return;
        const inp = h("input", { type: "text", placeholder: "Notes from the call (the agent fills in the rest)", "aria-label": "Call notes" });
        const save = h("button", { class: "eu-btn sm primary", type: "button", onclick: () => { const v = inp.value.trim() || "Quick check-in"; box.remove(); body.append(h("p", { class: "eu-hint crm-log" }, `☎ Call logged · “${v}” · just now`)); tell(el, { action: "log_call", label: `Log call: ${v}`, entities: { company: co, deal: amt }, text: v, ack: /price|discount|budget/i.test(v) ? "Logged. Pricing came up — I drafted the revised proposal with a 10% multi-year option for you to review." : "Logged, with the next step set to “send revised proposal · Thu”." }); } }, "Save");
        inp.onkeydown = (e) => { if (e.key === "Enter") save.click(); if (e.key === "Escape") box.remove(); };
        const box = h("div", { class: "lp-inline" }, inp, save); body.append(box); inp.focus();
      } }, "Log call");
      adv.type = "button";
      const el = shell(a, "crm", { verb: this.verb(a), body, foot: [adv, log], summary: `${co} moved to Negotiation` });
      return { el, async play(run) { stagger(pills, { gap: 60, y: 4 }); await run.wait(900); adv.click(); }, spec: { kind: "crm", app: a.id, company: co, amount: amt, stage: st[3] } };
    },
  },
  ride: {
    label: "Choose a ride", verb: () => "Priced 3 rides to SFO",
    make(a, r) {
      const opts = [["Standard", 1, 38.12, 4], ["Comfort", 2, 46.9, 6], ["XL", 3, 61.4, 9]];
      const ind = h("span", { class: "rsel" });
      let sel = 0;
      const rows = opts.map(([n, p, $, eta], i) => h("li", { class: i === 0 ? "on" : "", onclick: () => choose(i) }, h("span", { class: "car", style: { "--seats": p } }, "🚗"), h("div", { class: "grow" }, h("b", {}, n), h("span", { class: "eu-hint" }, `${eta} min away · ${p + 3} seats`)), h("b", {}, fmt$($))));
      const ul = h("ul", { class: "rides" }, ind, rows);
      const place = (an) => { const x = rows[sel]; const to = { transform: `translateY(${x.offsetTop}px)`, height: `${x.offsetHeight}px` }; if (an) anim(ind, [{ transform: ind.style.transform, height: ind.style.height }, to], { spring: "snappy" }); Object.assign(ind.style, to); };
      requestAnimationFrame(() => requestAnimationFrame(() => place(false)));
      function choose(i) { sel = i; rows.forEach((x, j) => x.classList.toggle("on", j === i)); place(true); go.querySelector(".lbl").textContent = `Request ${opts[i][0]}`; }
      const go = holdButton("Request Standard", (b, t) => { const o = opts[sel]; t.textContent = "Finding driver…"; settle(el, "Matching"); rows.forEach((x) => (x.style.pointerEvents = "none")); setTimeout(() => { t.textContent = `Driver ${o[3]} min away`; settle(el, "Matched", "ok"); burst(b); el.summary = `${a.name} ${o[0]} to SFO · ${fmt$(o[2])}`; tell(el, { action: "book", label: `Request ${o[0]} · ${fmt$(o[2])}`, entities: { ride: o[0].toLowerCase(), place: ["ferry-building", "sfo-t2"] }, ack: `Marco, grey Prius 7XYZ123, ${o[3]} min. You can cancel free for 2 minutes.` }); undoable(el, "Requested", () => { settle(el, "Cancelled", "denied"); t.textContent = "Cancelled · no fee"; }, { ms: 9000, action: "cancel" }); }, 1200); });
      roving(rows, { onActivate: (li) => choose(rows.indexOf(li)) });
      const el = shell(a, "ride", { verb: this.verb(a), status: "3 options", body: h("div", {}, h("div", { class: "fromto" }, h("span", {}, h("i", { class: "o" }), "Ferry Building"), h("span", {}, h("i", { class: "d" }), "SFO Terminal 2")), ul), foot: [go], summary: `${a.name} Standard to SFO · ${fmt$(38.12)}` });
      return { el, async play(run) { stagger(rows, { gap: 80, delay: 120 }); }, spec: { kind: "ride", app: a.id, from: "Ferry Building", to: "SFO", options: opts.map((o) => ({ name: o[0], price: o[2] })) } };
    },
  },
  route: {
    label: "Route on a map", verb: () => "Routed · 24 min",
    make(a, r) {
      const W = 320, H = 170;
      const m = cityMap(r, W, H);
      const d1 = `M30 140 C 80 130, 90 90, 140 86 S 220 60, 288 32`, d2 = `M30 140 C 60 80, 140 120, 170 70 S 250 40, 288 32`;
      const alt = svg("path", { d: d2, class: "route alt" }), main = svg("path", { d: d1, class: "route", pathLength: 1 });
      const car = svg("circle", { r: 5, class: "carDot" });
      m.append(alt, main, car);
      const A = pin(m, 30, 140, "a"), B = pin(m, 288, 32, "b");
      const eta = h("span", { class: "eta" }, h("b", {}, "24 min"), " · 11.2 mi");
      const pv = seg(["Fastest", "No highways"], (i) => { main.setAttribute("d", i ? d2 : d1); alt.setAttribute("d", i ? d1 : d2); eta.firstChild.textContent = i ? "31 min" : "24 min"; anim(main, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 800, easing: "cubic-bezier(.65,0,.35,1)" }); drive(); }, 0);
      let carA;
      function drive() { carA?.cancel(); car.style.offsetPath = `path("${main.getAttribute("d")}")`; carA = car.animate([{ offsetDistance: "0%" }, { offsetDistance: "100%" }], { duration: 5200, iterations: Infinity, easing: "cubic-bezier(.45,0,.55,1)" }); }
      const body = h("div", { class: "routewrap" }, h("div", { class: "mapbox" }, m, eta), h("div", { class: "row between" }, h("span", { class: "eu-hint" }, "Ferry Building → Oracle Park"), pv));
      const step = h("div", { class: "rt-step", hidden: true }, h("b", {}, "↱ In 400 ft, turn right onto Embarcadero"), h("span", { class: "eu-hint" }, "then 2.1 mi"));
      const start = h("button", { class: "eu-btn primary", type: "button", onclick: () => { const on = step.hidden; step.hidden = !on; start.textContent = on ? "End" : "Start"; settle(el, on ? "Navigating" : "Ready", on ? "ok" : null); if (on) { anim(step, [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { spring: "soft" }); tell(el, { action: "start", label: `Navigate · ${pv.querySelector("[aria-selected=true]")?.textContent || "Fastest"}`, entities: { place: ["ferry-building", "oracle-park"] }, quiet: true }); } } }, "Start");
      const send = h("button", { class: "eu-btn ghost", type: "button", onclick: () => { send.textContent = "Sent ✓"; setDisabled(send, "Route sent"); tell(el, { action: "handoff", label: "Send the route to my phone", entities: { place: ["ferry-building", "oracle-park"] }, ack: "On your phone now — it'll open in Maps with this route, not the default." }); } }, "Send to phone");
      const el = shell(a, "route", { verb: this.verb(a), status: "Ready", body: h("div", {}, body, step), foot: [start, send], summary: "24 min to Oracle Park" });
      return { el, async play(run) { anim(m.querySelector(".streets"), [{ opacity: 0 }, { opacity: 1 }], { duration: 600 }); [A, B].forEach((p, i) => anim(p, [{ transform: p.getAttribute("transform") + " translate(0 -30px) scale(.5)", opacity: 0 }, { transform: p.getAttribute("transform"), opacity: 1 }], { spring: "bouncy", delay: 150 + i * 900 })); anim(main, [{ strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDasharray: 1, strokeDashoffset: 0 }], { duration: 1100, delay: 250, easing: "cubic-bezier(.65,0,.35,1)" }); await run.wait(1300); drive(); }, spec: { kind: "route", app: a.id, from: "Ferry Building", to: "Oracle Park", eta_min: 24 } };
    },
  },
  boarding: {
    label: "Boarding pass", verb: () => "Checked in · seat 14C",
    make(a, r) {
      const fl = `${a.name.slice(0, 2).toUpperCase()} ${1000 + Math.floor(r() * 900)}`;
      const pass = h("div", { class: "pass" }, h("div", { class: "pr1" }, icon(a, 18), h("b", {}, a.name), h("span", { class: "eu-hint" }, "Boarding pass")), h("div", { class: "pr2" }, h("div", {}, h("b", { class: "iata" }, "SFO"), h("span", {}, "San Francisco")), h("span", { class: "plane" }, "✈"), h("div", { class: "right" }, h("b", { class: "iata" }, "JFK"), h("span", {}, "New York"))), h("div", { class: "pr3" }, [["Flight", fl], ["Gate", "B12"], ["Board", "6:35"], ["Seat", "14C"]].map(([k, v]) => h("div", {}, h("span", {}, k), h("b", {}, v)))), h("div", { class: "perf" }), h("div", { class: "barcode" }));
      const slot = h("div", { class: "slot pass-slot" }, h("div", { class: "mouth" }), h("div", { class: "feed" }, pass));
      const add = h("button", { class: "eu-btn primary", onclick: () => { burst(add); add.textContent = "Added to Wallet ✓"; } }, "Add to Wallet");
      const seatB = () => [...pass.querySelectorAll(".pr3 b")][3];
      const change = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        if (el.querySelector(".lp-chips")) return;
        const box = h("div", { class: "lp-chips", role: "group", "aria-label": "Open seats" }, [["12A", "window · free"], ["14C", "aisle · current"], ["21D", "aisle · exit row +$39"]].map(([sId, hint]) => h("button", { class: "eu-chip btn" + (seatB().textContent === sId ? " on" : ""), type: "button", title: hint, onclick: () => { box.remove(); const old = seatB().textContent; if (old === sId) return; seatB().textContent = sId; anim(seatB(), [{ transform: "scale(1.4)" }, { transform: "none" }], { spring: "bouncy" }); el.summary = `${fl} SFO→JFK · seat ${sId}`; tell(el, { action: "change_seat", label: `Seat ${sId} (${hint})`, entities: { flight: fl, seat: sId }, ack: sId === "21D" ? "That's $39 — charged to the card on file once you confirm in the app." : `Moved you to ${sId}. Your Wallet pass updates on its own.` }); undoable(el, `Seat ${old} → ${sId}`, () => (seatB().textContent = old)); } }, `${sId} · ${hint}`)));
        el.querySelector(".eu-b").append(box); box.querySelector("button").focus();
      } }, "Change seat");
      add.type = "button";
      const el = shell(a, "boarding", { verb: this.verb(a), status: "On time", body: slot, foot: [add, change], summary: `${fl} SFO→JFK · seat 14C` });
      return { el, async play(run) { const f = slot.querySelector(".feed"); f.style.height = "0px"; await run.wait(250); const hh = pass.offsetHeight; await anim(f, [{ height: "0px" }, { height: `${hh}px` }], { duration: 1700, easing: "cubic-bezier(.3,.7,.2,1)" }).finished; f.style.height = ""; anim(pass.querySelector(".plane"), [{ transform: "translateX(-20px)", opacity: 0 }, { transform: "none", opacity: 1 }], { spring: "soft" }); }, spec: { kind: "boarding", app: a.id, flight: fl, from: "SFO", to: "JFK", seat: "14C" } };
    },
  },
  player: {
    label: "Now playing", verb: () => "Playing",
    make(a, r) {
      const tracks = [["Midnight City", "M83"], ["Nights", "Frank Ocean"], ["Breathe", "Télépopmusik"], ["Teardrop", "Massive Attack"], ["Intro", "The xx"]];
      const [t, by] = a.cat === "media" && /youtube|twitch|netflix|vimeo|plex|loom/.test(a.id) ? ["How we render UI at 4K", "Launch Films"] : pick(r, tracks);
      const hue = Math.floor(r() * 360);
      const art = h("div", { class: "art", style: { "--hue": hue } });
      const bars = h("div", { class: "bars" }, Array.from({ length: 28 }, (_, i) => h("i", { style: { "--d": `${(i * 0.137) % 1}s`, "--hgt": `${30 + ((i * 53) % 70)}%` } })));
      const sc = h("input", { type: "range", min: 0, max: 100, value: 34, class: "scrub", "aria-label": "Seek" });
      const tm = h("span", { class: "eu-hint" }, "1:12 / 3:41");
      sc.addEventListener("input", () => { const s = Math.round((sc.value / 100) * 221); tm.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} / 3:41`; sc.style.setProperty("--v", sc.value + "%"); });
      sc.style.setProperty("--v", "34%");
      const pp = h("button", { class: "pp on", type: "button", "aria-label": "Pause", onclick: () => { const on = pp.classList.toggle("on"); el.classList.toggle("paused", !on); } }, h("i"), h("i"));
      const body = h("div", { class: "player" }, art, h("div", { class: "grow" }, h("b", {}, t), h("span", { class: "eu-hint" }, by), bars, h("div", { class: "row" }, pp, sc), tm));
      const el = shell(a, "player", { verb: this.verb(a), body, summary: `Played "${t}"` });
      return { el, async play(run) { anim(art, [{ transform: "rotate(-12deg) scale(.7)", opacity: 0 }, { transform: "none", opacity: 1 }], { spring: "bouncy" }); }, spec: { kind: "player", app: a.id, title: t, artist: by } };
    },
  },
  workout: {
    label: "Activity rings", verb: () => "Synced today's activity",
    make(a, r) {
      const rings = [["Move", 0.82, "var(--k1)"], ["Exercise", 0.64, "var(--k3)"], ["Stand", 0.92, "var(--k4)"]];
      const s = svg("svg", { viewBox: "0 0 120 120", class: "rings" }, rings.map(([n, v, c], i) => { const R = 50 - i * 14; return svg("g", { style: `--c:${c}` }, svg("circle", { cx: 60, cy: 60, r: R, class: "bg" }), svg("circle", { cx: 60, cy: 60, r: R, class: "fg", pathLength: 100, "data-v": v * 100 })); }));
      const stats = [["Distance", 8.4, "km"], ["Pace", 5.12, "/km"], ["Avg HR", 148, "bpm"]];
      const st = h("div", { class: "wstats" }, stats.map(([k, v, u]) => h("div", {}, h("span", { class: "eu-hint" }, k), h("b", { "data-v": v, "data-u": u }, "0"))));
      const splits = h("div", { class: "splits" }, Array.from({ length: 8 }, (_, i) => h("i", { style: { "--h": `${50 + ((i * 37 + Math.floor(r() * 30)) % 50)}%` } })));
      const det = h("div", { class: "lp-reveal", hidden: true }, h("pre", { class: "lp-pre" }, [...splits.children].map((x, i) => { const p = 5 + (100 - parseFloat(x.style.getPropertyValue("--h"))) / 100 * 0.9; return `km ${i + 1}  ${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, "0")} /km${i === 5 ? "   ← hill" : ""}`; }).join("\n")));
      [...splits.children].forEach((x, i) => { x.title = `km ${i + 1}`; });
      const details = h("button", { class: "eu-btn ghost", type: "button", "aria-expanded": "false", onclick: () => { det.hidden = !det.hidden; details.setAttribute("aria-expanded", String(!det.hidden)); details.textContent = det.hidden ? "Splits" : "Hide splits"; } }, "Splits");
      const share = h("button", { class: "eu-btn", type: "button", onclick: () => tell(el, { action: "share", label: "Share this run", entities: { activity: "run-8.4k" }, ack: `Drafted a ${a.name} post with the map hidden (it starts at your home). Want the map shown?` }) }, "Share");
      const el = shell(a, "workout", { verb: this.verb(a), body: h("div", {}, h("div", { class: "workout" }, s, h("div", { class: "grow" }, st, splits)), det), foot: [share, details], summary: "8.4 km run · 148 bpm avg" });
      return { el, async play(run) { s.querySelectorAll(".fg").forEach((c, i) => anim(c, [{ strokeDashoffset: 100 }, { strokeDashoffset: 100 - c.dataset.v }], { duration: 1400, delay: i * 180, easing: "cubic-bezier(.16,1,.3,1)" })); st.querySelectorAll("b").forEach((b) => countUp(b, +b.dataset.v, { dur: 1200, fmt: (v) => (b.dataset.v.includes(".") ? v.toFixed(2) : Math.round(v)) + " " + b.dataset.u })); stagger(splits.children, { gap: 50, y: 10, delay: 400 }); }, spec: { kind: "workout", app: a.id, distance_km: 8.4 } };
    },
  },
  home: {
    label: "Device control", verb: () => "Adjusted living room",
    make(a, r) {
      let v = 0.62;
      const knob = h("div", { class: "knob", role: "slider", tabindex: 0, "aria-label": "Brightness", "aria-valuemin": 0, "aria-valuemax": 100 }, h("i", { class: "cap" }, h("i", { class: "tick" })));
      const read = h("b", { class: "big" }, "");
      const isTemp = /nest|ecobee|homeassistant|smartthings|tesla/.test(a.id);
      const show = () => { knob.style.setProperty("--v", v); knob.setAttribute("aria-valuenow", Math.round(v * 100)); read.textContent = isTemp ? `${Math.round(60 + v * 20)}°F` : `${Math.round(v * 100)}%`; el?.style.setProperty("--glow", v); if (el) el.summary = `Living room set to ${read.textContent}`; };
      knob.addEventListener("pointerdown", (e) => { knob.setPointerCapture(e.pointerId); const b = knob.getBoundingClientRect(); const mv = (ev) => { const ang = Math.atan2(ev.clientY - (b.top + b.height / 2), ev.clientX - (b.left + b.width / 2)) + Math.PI / 2; let deg = ((ang * 180) / Math.PI + 360) % 360; if (deg > 180) deg -= 360; v = Math.max(0, Math.min(1, (deg + 135) / 270)); show(); }; mv(e); knob.onpointermove = mv; knob.onpointerup = () => { knob.onpointermove = null; anim(knob.querySelector(".cap"), [{ transform: "scale(.94)" }, { transform: "scale(1)" }], { spring: "bouncy", fill: "none" }); }; });
      knob.addEventListener("keydown", (e) => { if (e.key === "ArrowUp" || e.key === "ArrowRight") v = Math.min(1, v + 0.05); if (e.key === "ArrowDown" || e.key === "ArrowLeft") v = Math.max(0, v - 0.05); show(); });
      const rooms = ["Living room", "Kitchen", "Office"].map((n, i) => { const t = h("button", { class: "eu-switch", role: "switch", "aria-checked": i !== 1 ? "true" : "false", type: "button", onclick: () => t.setAttribute("aria-checked", t.getAttribute("aria-checked") !== "true") }, h("i")); return h("label", { class: "scope" }, h("span", {}, n), t); });
      const scenes = h("div", { class: "eu-chips" }, ["Focus", "Movie", "Away"].map((s) => h("button", { class: "eu-chip btn", type: "button", onclick: (e) => { v = { Focus: 0.85, Movie: 0.2, Away: 0 }[s]; show(); e.currentTarget.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); } }, s)));
      const el = shell(a, "home", { verb: this.verb(a), body: h("div", { class: "home" }, h("div", { class: "kn" }, knob, read), h("div", { class: "grow" }, rooms, scenes)), summary: `Living room set to ${Math.round(v * 100)}%` });
      show();
      return { el, async play(run) { const to = v; v = 0; show(); const t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 900); v = to * (1 - Math.pow(1 - k, 3)); show(); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }, spec: { kind: "home", app: a.id, device: "living room", value: 62 } };
    },
  },
  merge: {
    label: "PR merge (after @pitus_)", verb: () => "Opened PR #128",
    make(a, r, input) {
      if (input) return this.real(a, input);
      const commits = [["Refresh sessions in middleware", "Ivy", "feat"], ["Rotate session keys", "Sam", "feat"], ["Bump deps", "Theo", "main"], ["Fix cookie SameSite", "Priya", "main"]];
      const graph = h("ol", { class: "cgraph" }, commits.map(([m, who, lane], i) => h("li", { class: lane }, h("span", { class: "node" }), h("span", { class: "msg" }, m), h("span", { class: "eu-hint" }, `${who} · ${i + 1}h`))));
      const state = h("span", { class: "prstate open" }, "Open");
      const checks = h("div", { class: "checks" }, [["Tests", "42 passed"], ["Lint", "passed"], ["Types", "passed"], ["Preview", "ready"]].map(([k, v]) => h("span", { class: "chk", title: v }, h("i"), k)));
      const conflict = h("div", { class: "conflict" }, h("b", {}, "main moved · 3 conflicts"), h("span", { class: "eu-hint ctr" }, "src/auth/session.ts"));
      const btn = h("button", { class: "eu-btn primary" }, "Resolve conflicts");
      const body = h("div", { class: "merge" }, h("div", { class: "row between" }, h("div", {}, h("b", {}, "Refresh sessions in the auth middleware"), h("span", { class: "eu-hint" }, " #128 · feat/session → main")), state), graph, conflict, checks);
      const diff = h("div", { class: "lp-reveal", hidden: true }, h("pre", { class: "lp-pre" }, h("span", { class: "dim" }, "src/auth/session.ts  +38 −12\n"), h("span", { class: "del" }, "- if (expired(s)) return null\n"), h("span", { class: "add" }, "+ if (expired(s)) s = await refresh(s, { rotate: true })\n"), h("span", { class: "dim" }, "  …3 more hunks\n"), h("span", { class: "dim" }, "src/middleware.ts  +9 −2")));
      const vd = h("button", { class: "eu-btn ghost", type: "button", "aria-expanded": "false", onclick: () => { diff.hidden = !diff.hidden; vd.setAttribute("aria-expanded", String(!diff.hidden)); vd.textContent = diff.hidden ? "View diff" : "Hide diff"; } }, "View diff");
      body.append(diff);
      const el = shell(a, "merge", { verb: this.verb(a), body, foot: [btn, vd], summary: "Merged #128 into main" });
      let phase = 0;
      const sequence = async (run) => {
        if (phase === 0) {
          phase = 1; setDisabled(btn, "Checks running");
          const ctr = conflict.querySelector(".ctr");
          for (let i = 1; i <= 3; i++) { btn.textContent = `Resolving ${i} of 3…`; setDisabled(btn, "Conflicts resolving"); ctr.textContent = `src/auth/session.ts · hunk ${i}`; anim(conflict, [{ transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "none" }], { duration: 240 }); await run.wait(520); }
          await anim(conflict, [{ opacity: 1, height: `${conflict.offsetHeight}px` }, { opacity: 0, height: "0px", margin: 0, padding: 0 }], { duration: 360, easing: "cubic-bezier(.65,0,.35,1)" }).finished; conflict.remove();
          checks.classList.add("on");
          for (const c of checks.children) { c.classList.add("run"); await run.wait(380); c.classList.remove("run"); c.classList.add("ok"); anim(c, [{ transform: "scale(.85)" }, { transform: "none" }], { spring: "bouncy" }); }
          btn.textContent = "Merge"; setDisabled(btn); phase = 2;
        } else if (phase === 2) {
          phase = 3; btn.textContent = "Merging…"; setDisabled(btn, "Merge in progress");
          const row = h("li", { class: "main merge-row" }, h("span", { class: "node" }), h("span", { class: "msg" }, "Merge #128 into main"), h("span", { class: "eu-hint" }, "you · now"));
          flip([...graph.children], () => graph.prepend(row), { spring: "soft" });
          await run.wait(700);
          graph.classList.add("folded");
          state.className = "prstate merged"; state.textContent = "Merged";
          anim(state, [{ transform: "scale(.6)" }, { transform: "scale(1)" }], { spring: "bouncy" });
          btn.textContent = "Merged into main"; setDisabled(btn, "PR merged"); burst(btn, "#8250df", 16);
        }
      };
      btn.onclick = () => sequence(new Run()).catch(() => {});
      return { el, async play(run) { stagger(graph.children, { gap: 70 }); anim(conflict, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { spring: "soft", delay: 500 }); }, async auto(run) { await run.wait(900); await sequence(run); await run.wait(700); await sequence(run); }, spec: { kind: "merge", app: a.id, pr: 128, base: "main", head: "feat/session", checks: 4 } };
    },
    // Host- or model-supplied PR ($defs.appInput.merge): drawn as is, read-only. No simulated resolve/merge.
    real(a, pr) {
      const LANE = { head: "feat", base: "main", side: "main" }, CHK = { pass: "ok", fail: "fail", running: "run", skip: "skip" };
      const STATE = { open: "Open", conflict: "Conflicts", ready: "Ready", merged: "Merged", closed: "Closed" };
      const graph = h("ol", { class: "cgraph" }, (pr.commits || []).map((c) => h("li", { class: LANE[c.lane] + (c.conflict ? " conflict" : "") }, h("span", { class: "node" }), h("span", { class: "msg" }, c.title), h("span", { class: "eu-hint" }, `${c.author} · ${c.age}`))));
      const checks = h("div", { class: "checks on" }, pr.checks.map((c) => h("span", { class: "chk " + CHK[c.status], title: c.detail }, h("i"), c.name)));
      const conflict = pr.conflicts ? h("div", { class: "conflict" }, h("b", {}, `${pr.base} moved · ${pr.conflicts} conflict${pr.conflicts === 1 ? "" : "s"}`)) : null;
      const head = h("div", { class: "row between" }, h("div", {}, h("b", {}, pr.title), h("span", { class: "eu-hint" }, ` #${pr.number} · ${pr.head} → ${pr.base}`)), h("span", { class: "prstate " + pr.state }, STATE[pr.state]));
      const passed = pr.checks.filter((c) => c.status === "pass").length;
      const foot = pr.url ? [h("a", { class: "eu-btn ghost", href: pr.url, target: "_blank", rel: "noopener" }, "Open on GitHub")] : [];
      const el = shell(a, "merge", { verb: `PR #${pr.number} · ${STATE[pr.state].toLowerCase()}`, body: h("div", { class: "merge" }, head, pr.commits?.length ? graph : null, conflict, checks), foot, summary: `#${pr.number} ${STATE[pr.state].toLowerCase()} · ${passed}/${pr.checks.length} checks passed` });
      return { el, async play() { stagger(graph.children, { gap: 70 }); }, spec: { kind: "merge", app: a.id, input: pr } };
    },
  },
  ci: {
    label: "CI checks timeline", verb: () => "Ran 6 checks",
    make(a, r) {
      const jobs = [["install", 0, 14], ["typecheck", 14, 22], ["lint", 14, 12], ["unit", 14, 46], ["e2e · chrome", 20, 64], ["build", 36, 28]];
      const fail = 4;
      const rows = jobs.map(([n, s, d], i) => h("li", {}, h("span", { class: "jn" }, n), h("div", { class: "lane" }, h("i", { class: "bar" + (i === fail ? " bad" : ""), style: { left: `${s}%`, width: `${d}%` } })), h("span", { class: "eu-hint dur" }, `${Math.round(d * 1.4)}s`)));
      const ul = h("ul", { class: "gantt" }, rows);
      const diff = h("pre", { class: "fdiff" }, h("span", { class: "del" }, "- expect(btn).toBeVisible()"), "\n", h("span", { class: "add" }, "+ expect(btn).toBeEnabled()"));
      const fix = h("button", { class: "eu-btn primary", onclick: async () => { fix.textContent = "Re-running…"; setDisabled(fix, "Checks running"); const b = rows[fail].querySelector(".bar"); b.classList.remove("bad"); b.classList.add("rerun"); await anim(b, [{ width: "0%" }, { width: `${jobs[fail][2]}%` }], { duration: 1600, easing: "linear" }).finished; b.classList.remove("rerun"); fix.textContent = "All green ✓"; setDisabled(fix, "Checks passed"); el.querySelector(".eu-status").textContent = "Passed"; el.classList.add("ok"); burst(fix, "var(--h-success)"); } }, "Fix & re-run");
      const logs = h("div", { class: "lp-reveal", hidden: true }, h("pre", { class: "lp-pre" }, h("span", { class: "dim" }, "e2e · chrome  checkout.spec.ts:42\n"), "  ✕ pay button is visible after coupon\n", h("span", { class: "del" }, "    Expected: visible\n    Received: hidden (opacity 0 while loading)\n"), h("span", { class: "dim" }, "  41 passed · 1 failed · 1m 29s")));
      const lb = h("button", { class: "eu-btn ghost", type: "button", "aria-expanded": "false", onclick: () => { logs.hidden = !logs.hidden; lb.setAttribute("aria-expanded", String(!logs.hidden)); lb.textContent = logs.hidden ? "Logs" : "Hide logs"; } }, "Logs");
      rows.forEach((x, i) => { x.tabIndex = 0; x.title = `${jobs[i][0]} · click to ask about it`; x.onclick = () => tell(el, { action: "select", label: `Why is ${jobs[i][0]} ${i === fail ? "failing" : "slow"}?`, entities: { job: jobs[i][0] }, ack: i === fail ? "The button is hidden while the coupon request is in flight, so toBeVisible races it. Asserting enabled is the real intent — that's the fix shown." : `${jobs[i][0]} takes ${Math.round(jobs[i][2] * 1.4)}s; ${jobs[i][2] > 40 ? "it's the critical path. Sharding it in two would save ~30s." : "it isn't on the critical path."}` }); x.onkeydown = (e) => { if (e.key === "Enter") x.onclick(); }; });
      const el = shell(a, "ci", { verb: this.verb(a), status: "1 failing", body: h("div", {}, ul, diff, logs), foot: [fix, lb], summary: "6 checks passed after 1 fix" });
      return { el, async play(run) { rows.forEach((x, i) => { const b = x.querySelector(".bar"); anim(b, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 300 + jobs[i][2] * 14, delay: jobs[i][1] * 14, easing: "cubic-bezier(.65,0,.35,1)" }); }); anim(diff, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { spring: "soft", delay: 1400 }); }, spec: { kind: "ci", app: a.id, jobs: jobs.length, failing: [jobs[fail][0]] } };
    },
  },
  deploy: {
    label: "Deploy", verb: () => "Deploying preview",
    make(a, r) {
      const logs = ["Cloning kvnloo/app (main@3f2c1a9)", "Installing dependencies…", "Building 214 modules", "Optimising images (38)", "Uploading 1.2 MB", "Assigning domain"];
      const pre = h("pre", { class: "log" });
      const prog = h("div", { class: "prog" }, h("i"));
      const stages = h("ol", { class: "stg" }, ["Build", "Upload", "Ready"].map((s) => h("li", {}, s)));
      const url = h("a", { class: "url", href: "#", onclick: (e) => e.preventDefault() }, `app-git-main-${a.id.slice(0, 6)}.example.app`);
      const promote = holdButton("Hold to promote", (b, t) => { t.textContent = "Live in production"; burst(b); settle(el, "Production", "ok"); tell(el, { action: "promote", label: "Promote to production", entities: { commit: "3f2c1a9" }, ack: "Live. I'm watching errors for 10 minutes and will roll back on my own if the rate doubles." }); });
      setDisabled(promote, "Preview building");
      const rb = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        if (el.dataset.state === "building") { settle(el, "Cancelled", "denied"); setDisabled(rb, "Deploy cancelled"); setDisabled(promote, "Deploy cancelled"); tell(el, { action: "cancel", label: "Cancel this deploy", entities: { commit: "3f2c1a9" }, ack: "Cancelled. Production is untouched." }); return; }
        settle(el, "Rolled back", "denied"); setDisabled(promote, "Preview rolled back"); setDisabled(rb, "Preview rolled back"); url.classList.remove("on");
        tell(el, { action: "rollback", label: "Roll the preview back", entities: { commit: "3f2c1a9" }, ack: "The preview URL now serves the previous build (a81c0de). Production was never touched." });
        undoable(el, "Rolled back the preview", () => { settle(el, "Ready", "ok"); setDisabled(promote); setDisabled(rb); url.classList.add("on"); });
      } }, "Cancel");
      const el = shell(a, "deploy", { verb: this.verb(a), status: "Building", body: h("div", {}, stages, prog, pre, url), foot: [promote, rb], summary: `Deployed to ${a.name} in 38s` });
      el.dataset.state = "building";
      return { el, async play(run) { const st = stages.children; st[0].classList.add("cur"); for (let i = 0; i < logs.length; i++) { if (el.dataset.state === "cancelled") return; const ln = h("span", {}, `${String(i * 6).padStart(2, "0")}s  ${logs[i]}\n`); pre.append(ln); anim(ln, [{ opacity: 0, transform: "translateX(-6px)" }, { opacity: 1, transform: "none" }], { duration: 220 }); pre.scrollTop = pre.scrollHeight; prog.firstChild.style.width = `${((i + 1) / logs.length) * 100}%`; if (i === 4) { st[0].className = "ok"; st[1].classList.add("cur"); } await run.wait(380); } if (el.dataset.state === "cancelled") return; st[1].className = "ok"; st[2].className = "ok"; settle(el, "Ready", "ok"); rb.textContent = "Roll back"; url.classList.add("on"); anim(url, [{ transform: "scale(.9)", opacity: 0 }, { transform: "none", opacity: 1 }], { spring: "bouncy" }); setDisabled(promote); }, spec: { kind: "deploy", app: a.id, ref: "main@3f2c1a9", target: "preview" } };
    },
  },
  incident: {
    label: "Incident", verb: () => "Paged on-call",
    make(a, r) {
      const W = 300, H = 60;
      const pts = Array.from({ length: 40 }, (_, i) => (i > 26 && i < 34 ? 70 + r() * 25 : 14 + r() * 10));
      const p = svg("path", { d: pathOf(pts, W, H), class: "line bad", pathLength: 1 });
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "spark", preserveAspectRatio: "none" }, svg("rect", { x: W * 0.66, y: 0, width: W * 0.2, height: H, class: "zone" }), p);
      const tl = h("ol", { class: "tl" }, [["14:02", "Error rate 12% on /api/checkout"], ["14:03", `Paged ${PEOPLE[2].split(" ")[0]} (primary)`], ["14:05", "Linked deploy 3f2c1a9"]].map(([t, x]) => h("li", {}, h("time", {}, t), h("span", {}, x))));
      const addTl = (t, x) => { const li = h("li", {}, h("time", {}, t), h("span", {}, x)); tl.append(li); anim(li, [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { spring: "soft" }); };
      const ack = holdButton("Hold to acknowledge", (b, t) => { t.textContent = "Acknowledged"; settle(el, "Ack'd", "hot"); burst(b); addTl("14:07", "You acknowledged"); tell(el, { action: "ack", label: "I'm on it", entities: { incident: "sev2-checkout" }, ack: "Paging stopped. The spike started 2 min after 3f2c1a9 — rolling it back is the fastest fix." }); });
      const rb = holdButton("Hold to roll back 3f2c1a9", (b, t) => { t.textContent = "Rolled back"; settle(el, "Mitigated", "ok"); burst(b, "var(--h-success)"); addTl("14:08", "Rolled back 3f2c1a9 → a81c0de"); tell(el, { action: "rollback", label: "Roll back 3f2c1a9", entities: { incident: "sev2-checkout", commit: "3f2c1a9" }, ack: "Rolled back. Error rate is falling (12% → 3%); I'll keep the incident open until it's under 0.5% for 10 min." }); }, { cls: "ghosty" });
      const el = shell(a, "incident", { verb: this.verb(a), status: "SEV-2", cls: "hot", body: h("div", {}, h("div", { class: "alert" }, h("span", { class: "pulse" }), h("b", {}, "Checkout errors spiking"), h("span", { class: "eu-hint" }, " · 4 min")), s, tl), foot: [ack, rb], summary: "SEV-2 acknowledged" });
      return { el, async play(run) { anim(p, [{ strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDasharray: 1, strokeDashoffset: 0 }], { duration: 1200, easing: "cubic-bezier(.65,0,.35,1)" }); stagger(tl.children, { gap: 160, delay: 600 }); }, spec: { kind: "incident", app: a.id, severity: 2, service: "checkout" } };
    },
  },
  migrate: {
    label: "Data migration", verb: () => "Migrating 4 tables",
    make(a, r) {
      const tables = [["users", 48210], ["orders", 182044], ["invoices", 30982], ["events", 1204400]];
      const rows = tables.map(([n, c]) => h("li", {}, h("span", { class: "tn" }, n), h("div", { class: "prog" }, h("i")), h("b", { class: "cnt" }, "0"), h("span", { class: "eu-hint of" }, `/ ${c.toLocaleString()}`)));
      const timer = h("span", { class: "timer" }, "00:00");
      let paused = false, resume = null;
      const gate = () => (paused ? new Promise((r) => (resume = r)) : null);
      const pause = h("button", { class: "eu-btn", type: "button", onclick: () => {
        if (el.classList.contains("ok")) return;
        paused = !paused; pause.textContent = paused ? "Resume" : "Pause";
        el.getAnimations({ subtree: true }).forEach((x) => (paused ? x.pause() : x.play()));
        settle(el, paused ? "Paused" : "Running", paused ? "paused" : null);
        if (!paused) { resume?.(); resume = null; }
        tell(el, { action: paused ? "pause" : "resume", label: paused ? "Pause the migration" : "Resume", entities: { migration: "0012_split_billing" }, ack: paused ? "Paused between batches — nothing half-written. Safe to leave it like this." : null, quiet: !paused });
      } }, "Pause");
      const sql = h("div", { class: "lp-reveal", hidden: true }, h("pre", { class: "lp-pre" }, h("span", { class: "add" }, "+ CREATE TABLE billing_accounts (…)\n"), h("span", { class: "add" }, "+ ALTER TABLE invoices ADD COLUMN account_id uuid\n"), h("span", { class: "dim" }, "  UPDATE invoices SET account_id = … -- 30,982 rows\n"), h("span", { class: "del" }, "- ALTER TABLE users DROP COLUMN stripe_customer -- after backfill\n"), h("span", { class: "dim" }, "  reversible: yes · locks: none over 200 ms")));
      const dry = h("button", { class: "eu-btn ghost", type: "button", "aria-expanded": "false", onclick: () => { sql.hidden = !sql.hidden; dry.setAttribute("aria-expanded", String(!sql.hidden)); dry.textContent = sql.hidden ? "Show SQL" : "Hide SQL"; } }, "Show SQL");
      const el = shell(a, "migrate", { verb: this.verb(a), status: "Running", body: h("div", {}, h("div", { class: "row between" }, h("span", { class: "eu-hint" }, `${a.name} · 0012_split_billing`), timer), h("ul", { class: "mig" }, rows), sql), foot: [pause, dry], summary: "Migrated 4 tables, 1.47M rows" });
      return { el, async play(run) { const t0 = performance.now(); const tick = () => { if (paused) { requestAnimationFrame(tick); return; } const s = Math.floor((performance.now() - t0) / 1000 * 7); timer.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; if (!el.classList.contains("ok") && el.isConnected) requestAnimationFrame(tick); }; requestAnimationFrame(tick); for (let i = 0; i < rows.length; i++) { const li = rows[i]; li.classList.add("cur"); const d = 700 + i * 260; anim(li.querySelector(".prog i"), [{ width: "0%" }, { width: "100%" }], { duration: d, easing: "cubic-bezier(.4,0,.2,1)" }); countUp(li.querySelector(".cnt"), tables[i][1], { dur: d }); await run.wait(d); await gate(); li.classList.remove("cur"); li.classList.add("ok"); } settle(el, "Done", "ok"); setDisabled(pause, "Migration complete"); }, spec: { kind: "migrate", app: a.id, migration: "0012_split_billing", tables: tables.map((t) => t[0]) } };
    },
  },
};
