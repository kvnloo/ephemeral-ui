// Card kinds, part A: messages, work, knowledge, approvals.
import { h, anim, stagger, countUp, typeText, pick, flip, Run } from "./motion.js";
import { shell, icon, avatar, PEOPLE, COMPANIES, holdButton, burst, seg, svg } from "./shell.js";
import { tell, undoable, why, settle, roving, setDisabled } from "./loop.js";

const SUBJECTS = {
  email: [["Invoice #4471 is due Nov 14", "Hi — attaching the October invoice for the Acme retainer. Net 30, total $1,240.00."], ["Offer letter: please sign by Friday", "Congrats again! The DocuSign link is below; let me know if anything looks off."], ["Your flight to SFO is confirmed", "UA 1734 · Thu Nov 6 · 7:05 AM → 9:42 AM · Seat 14C"], ["Design review moved to 3pm", "Same room, new time. I'll bring the updated flows for checkout."], ["Re: Q4 roadmap", "Agree on cutting the importer. Can we keep sync in scope?"], ["Weekly metrics are in", "WAU up 8.2%, retention flat. Full deck in the drive folder."]],
};
const CHANNELS = ["launch", "design-review", "eng-oncall", "growth", "general", "ship-it"];
const LINES = ["Pushed the fix, preview is up", "Can someone sanity check the copy?", "LGTM — merging after CI", "Numbers look good on staging 🎉", "I'll take the follow-up", "Moving standup to 10:15 today"];

export const KINDS_A = {
  inbox: {
    label: "Inbox search", verb: (a) => `Searched ${a.name} · "invoice"`,
    make(a, r) {
      const rows = SUBJECTS.email.slice().sort(() => r() - 0.5).slice(0, 4);
      rows.sort((x) => (x[0].includes("Invoice") ? -1 : 1));
      const ids = rows.map((x, i) => `m${4471 - i * 13}`);
      let picked = 0;
      const status = () => el.querySelector(".eu-status");
      const list = h("ul", { class: "eu-list inbox", "aria-label": "Results" }, rows.map(([s, sn], i) => {
        const who = PEOPLE[Math.floor(r() * PEOPLE.length)];
        const li = h("li", { class: i === 0 ? "unread hit" : i === 1 ? "unread" : "", role: "option", "aria-selected": i === 0 ? "true" : "false", "data-id": ids[i], "data-subj": s }, avatar(who, i), h("div", { class: "grow" }, h("div", { class: "row1" }, h("b", {}, who), h("time", {}, ["9:41", "8:12", "Yesterday", "Mon"][i])), h("div", { class: "subj" }, s.includes("Invoice") ? [s.split("Invoice")[0], h("mark", {}, "Invoice"), s.split("Invoice")[1]] : s), h("div", { class: "snip" }, sn)));
        swipeAway(li, null, () => true, () => archive(li));
        li.addEventListener("click", () => { if (!li.classList.contains("swiping")) choose(li); });
        return li;
      }));
      // Pick the message the agent should act on: the first hit is its guess; a click corrects it.
      function choose(li) {
        list.querySelectorAll("li").forEach((x) => { x.setAttribute("aria-selected", String(x === li)); x.classList.toggle("lp-sel", x === li && x !== list.firstElementChild); });
        li.classList.remove("unread");
        if (li === list.querySelectorAll("li")[picked]) return;
        picked = [...list.children].indexOf(li);
        tell(el, { action: "select", label: `Use “${li.dataset.subj}”`, entities: { message: li.dataset.id }, ack: `Got it — working from “${li.dataset.subj}” instead.` });
      }
      function archive(li) {
        const at = [...list.children].indexOf(li);
        const n = () => (status().textContent = `${list.children.length} results`);
        n();
        undoable(el, `Archived “${li.dataset.subj}”`, () => { list.insertBefore(li, list.children[at] || null); li.style.translate = ""; li.style.opacity = ""; n(); }, { entities: { message: li.dataset.id } });
        tell(el, { action: "archive", label: "archive", entities: { message: li.dataset.id }, quiet: true });
      }
      roving(list.children, { onActivate: (li) => choose(li), onKey: (li, e) => { if (e.key === "Delete" || e.key === "Backspace" || e.key === "e") { e.preventDefault(); const nx = li.nextElementSibling || li.previousElementSibling; li.remove(); archive(li); nx?.focus(); } } });
      const markAll = h("button", { class: "eu-btn ghost", type: "button", onclick: () => { const was = [...list.querySelectorAll("li.unread")]; if (!was.length) return; was.forEach((x) => x.classList.remove("unread")); undoable(el, `Marked ${was.length} read`, () => was.forEach((x) => x.classList.add("unread"))); } }, "Mark all read");
      const open = h("button", { class: "eu-btn", type: "button", onclick: () => tell(el, { action: "open", label: `Open this search in ${a.name}`, entities: { query: "invoice" }, ack: `Opened ${a.name} at “invoice” in a new tab — the card stays here.` }) }, "Open in " + a.name);
      const body = h("div", {}, list, h("p", { class: "eu-hint" }, "Click to pick the right one · swipe or press E to archive"));
      const el = shell(a, "inbox", { verb: this.verb(a), status: "4 results", body, foot: [open, markAll], summary: `Found invoice #4471 in ${a.name}` });
      return { el, async play(run) { stagger(list.children, { gap: 70 }); await run.wait(700); const m = list.querySelector("mark"); m && anim(m, [{ backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%" }], { duration: 600, easing: "cubic-bezier(.65,0,.35,1)" }); }, spec: { kind: "inbox", app: a.id, query: "invoice", results: rows.map((x, i) => ({ id: ids[i], subject: x[0] })) } };
    },
  },
  thread: {
    label: "Message + summary", verb: () => "Opened a message",
    make(a, r) {
      const [s, sn] = SUBJECTS.email[0];
      const who = pick(r, PEOPLE);
      const ENT = [["Due Nov 14", "date", "2026-11-14"], ["$1,240.00", "amount", "1240.00"], ["Net 30", "terms", "net30"], ["Acme Corp", "company", "acme"]];
      const chips = h("div", { class: "eu-chips" }, ENT.map(([c, type, id], i) => h("button", { type: "button", class: "eu-chip btn" + (i === 1 ? " strong" : ""), title: "Add to the agent's context", "aria-pressed": "false", onclick: (e) => { const b = e.currentTarget; const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on); tell(el, { action: on ? "pin" : "unpin", label: on ? `Keep ${c} in mind` : `Forget ${c}`, entities: { [type]: id }, ack: on ? `Pinned ${c} — I'll use it in the reply and the payment.` : null, quiet: !on }); } }, c)));
      const reply = h("div", { class: "eu-reply" }, h("span", { class: "caret" }));
      const body = h("div", { class: "thread" }, h("div", { class: "subj big" }, s), h("div", { class: "from" }, avatar(who, 2), h("span", {}, h("b", {}, who), " · to me · 9:41 AM")), h("div", { class: "sum" }, h("span", { class: "spark-ico" }, "✦"), h("div", {}, h("b", {}, "Summary"), h("p", {}, "Acme's October retainer invoice. Pay by Nov 14 to stay inside Net 30."))), chips, h("p", { class: "bodytxt" }, sn), reply);
      const draft = h("button", { class: "eu-btn primary", type: "button" }, "Draft reply");
      const fwd = h("button", { class: "eu-btn ghost", type: "button", onclick: () => { fwd.textContent = "Forwarded ✓"; setDisabled(fwd, "Already forwarded"); tell(el, { action: "forward", label: "Forward to Finance", entities: { message: "m4471", team: "finance" }, ack: "Forwarded to finance@ with the summary on top. Ana usually pays within a day." }); undoable(el, "Forwarded to Finance", () => { setDisabled(fwd); fwd.textContent = "Forward to Finance"; }); } }, "Forward to Finance");
      const el = shell(a, "thread", { verb: this.verb(a), body, foot: [draft, fwd], summary: `Read "${s}"` });
      let busy = false;
      draft.onclick = async () => {
        if (busy) return; busy = true; const run = new Run(); reply.classList.add("on"); const t = h("span", { contenteditable: "true", spellcheck: "true", "aria-label": "Reply draft" }); reply.prepend(t);
        await typeText(t, "Thanks! Paying today — receipt to follow.", run, 48).catch(() => {});
        reply.classList.add("editable"); t.focus();
        draft.textContent = "Send"; busy = false;
        draft.onclick = () => { const txt = t.textContent.trim(); burst(draft); draft.textContent = "Sent ✓"; setDisabled(draft, "Reply sent"); t.contentEditable = "false"; tell(el, { action: "send", label: `Send: “${txt}”`, entities: { message: "m4471" }, text: txt, quiet: true }); undoable(el, "Sent reply", () => { draft.textContent = "Send"; setDisabled(draft); t.contentEditable = "true"; }, { ms: 8000 }); };
      };
      return { el, async play(run) { stagger(chips.children, { gap: 90, delay: 450, sp: "bouncy" }); }, spec: { kind: "thread", app: a.id, subject: s, summary: "Pay by Nov 14", entities: ["$1,240.00", "Acme Corp"] } };
    },
  },
  approve: {
    label: "Just-in-time permission", verb: () => "Needs your OK",
    make(a, r) {
      const scopes = { email: [["Send one email as you", "Without this I can only save a draft."], ["Read the thread it replies to", "Without this the reply won't quote or reference the thread."]], chat: [["Post in #launch as you", "Without this I'll draft the message for you to paste."], ["Read the last 50 messages", "Without this I won't know what's already been said."]], files: [["Share one file with view access", "Without this I'll give you the link to share yourself."], ["Read file names in /Q4", "Without this you'll need to tell me which file."]], pay: [["Charge $1,240.00 once", "Without this nothing is paid — I'll stop at a ready-to-pay draft."], ["Save the receipt to Drive", "Without this the receipt stays in Stripe only."]], home: [["Unlock the front door once", "Without this the door stays locked."], ["Read door sensor history", "Without this I can't confirm it locked again."]], security: [["Approve one sign-in from Chrome", "Without this the sign-in is blocked."], ["See device and location", "Without this I can't tell you where it came from."]], design: [["Leave comments on 3 frames", "Without this I'll list the comments here instead."], ["Read the Checkout page", "Without this I can't review it."]], docs: [["Edit this one page", "Without this I'll suggest edits instead of making them."], ["Read pages it links to", "Without this I'll only see this page."]], default: [["Act once on your behalf", "Without this I'll prepare it and stop."], ["Read what it needs for this task", "Without this I'll ask you for each piece."]] };
      const sc = scopes[a.cat] || scopes.default;
      const on = sc.map(() => true);
      const effect = h("p", { class: "eu-hint ap-effect" });
      const showEffect = () => { const off = sc.filter((_, i) => !on[i]); effect.textContent = off.length ? off.map(([, w]) => w).join(" ") : `Allows only these ${sc.length} things, then expires.`; btn.querySelector(".lbl").textContent = on.every((x) => !x) ? "Nothing to allow" : on.every(Boolean) ? "Hold to allow" : `Hold to allow ${on.filter(Boolean).length} of ${sc.length}`; setDisabled(btn, on.every((x) => !x) ? "No permissions selected" : ""); };
      const toggles = sc.map(([s], i) => { const t = h("button", { class: "eu-switch", role: "switch", "aria-checked": "true", "aria-label": s, type: "button", onclick: () => { on[i] = !on[i]; t.setAttribute("aria-checked", String(on[i])); showEffect(); } }, h("i")); return h("label", { class: "scope" }, h("span", {}, s), t); });
      const span = ["Once", "10 min", "Always"];
      let dur = 0;
      const timer = seg(span, (i) => { dur = i; showEffect(); if (i === 2) effect.textContent = `“Always” means I won't ask again for ${a.name}. You can revoke it in Settings → Connections.`; }, 0);
      const btn = holdButton("Hold to allow", (b, t) => { t.textContent = "Allowed"; burst(b); settle(el, "Granted", "ok"); deny.textContent = "Revoke"; tell(el, { action: "approve", label: `Allow ${on.filter(Boolean).length} of ${sc.length} · ${span[dur].toLowerCase()}`, entities: { app: a.id, scope: sc.filter((_, i) => on[i]).map((x, j) => `s${j}`) }, ack: `Thanks — continuing. ${dur === 0 ? "This permission ends when the task does." : dur === 1 ? "It expires in 10 minutes." : "I won't ask again for this."}` }); });
      const deny = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        if (el.dataset.state === "granted") { settle(el, "Revoked", "denied"); setDisabled(deny, "Access revoked"); tell(el, { action: "revoke", label: `Revoke ${a.name} access`, entities: { app: a.id }, ack: "Revoked. Anything already done stays done; I won't do more." }); return; }
        settle(el, "Denied", "denied"); setDisabled(btn, "Request denied"); setDisabled(deny, "Request denied");
        tell(el, { action: "deny", label: `Don't use ${a.name}`, entities: { app: a.id }, ack: `Okay — I won't touch ${a.name}. ${sc[0][1]}` });
        undoable(el, "Denied", () => { settle(el, "Waiting"); setDisabled(btn); setDisabled(deny); }, { ms: 5000 });
      } }, "Deny");
      const body = h("div", { class: "approve" }, h("div", { class: "who" }, h("span", { class: "agent-dot" }), h("span", {}, h("b", {}, "Your agent"), ` wants to use ${a.name}`), why(`You asked me to ${({ email: "reply to the invoice thread", chat: "post the launch note", files: "share the Q4 deck", pay: "pay the Acme invoice", home: "let the cleaner in", security: "finish signing in", design: "review the checkout frames", docs: "fix the onboarding page" })[a.cat] || "finish this task"}. This is the smallest access that does it.`)), h("div", { class: "scopes" }, toggles), effect, h("div", { class: "row" }, h("span", { class: "eu-hint" }, "For"), timer));
      const el = shell(a, "approve", { verb: this.verb(a), status: "Waiting", body, foot: [btn, deny], summary: `Allowed ${a.name} once` });
      showEffect();
      return { el, async play(run) { stagger(body.querySelectorAll(".scope"), { gap: 90, delay: 200 }); anim(body.querySelector(".agent-dot"), [{ boxShadow: "0 0 0 0 var(--a)" }, { boxShadow: "0 0 0 8px transparent" }], { duration: 1400, iterations: Infinity, fill: "none" }); }, spec: { kind: "approve", app: a.id, scopes: sc.map((x) => x[0]), expires: "once" }, async auto(run) { await run.wait(900); } };
    },
  },
  chat: {
    label: "Channel catch-up", verb: (a) => `Read #${CHANNELS[a.name.length % CHANNELS.length]}`,
    make(a, r) {
      const ch = CHANNELS[a.name.length % CHANNELS.length];
      const msgs = [0, 1, 2].map((i) => ({ who: PEOPLE[(i * 3 + Math.floor(r() * 5)) % PEOPLE.length], text: LINES[(i + Math.floor(r() * 6)) % LINES.length] }));
      const log = h("div", { class: "chatlog" }, msgs.map((m, i) => h("div", { class: "msg" }, avatar(m.who, i + 1), h("div", {}, h("div", { class: "row1" }, h("b", {}, m.who), h("time", {}, `10:${12 + i * 7}`)), h("p", {}, m.text)))));
      const typing = h("div", { class: "msg typing" }, avatar("Agent", 7), h("div", { class: "dots" }, h("i"), h("i"), h("i")));
      const sugg = h("div", { class: "eu-chips" }, ["On it 👍", "Ship it", "Can you share the link?"].map((s) => h("button", { class: "eu-chip btn", type: "button", onclick: (e) => send(e.currentTarget, s) }, s)));
      function send(chip, s) {
        const r0 = chip.getBoundingClientRect();
        const m = h("div", { class: "msg mine" }, h("p", {}, s));
        log.append(m);
        tell(el, { action: "send", label: `Post “${s}” in #${ch}`, entities: { channel: ch }, text: s, quiet: true });
        undoable(el, `Posted in #${ch}`, () => m.remove(), { ms: 5000, action: "unsend" });
        const r1 = m.querySelector("p").getBoundingClientRect();
        anim(m.querySelector("p"), [{ transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px) scale(.9)`, opacity: 0.6 }, { transform: "none", opacity: 1 }], { spring: "snappy" });
        log.scrollTop = log.scrollHeight;
      }
      const input = h("input", { type: "text", placeholder: `Reply in #${ch}…`, "aria-label": `Reply in #${ch}`, onkeydown: (e) => { if (e.key === "Enter" && input.value.trim()) { send(input, input.value.trim()); input.value = ""; } } });
      const ask = h("button", { class: "eu-btn ghost sm", type: "button", onclick: () => tell(el, { action: "ask", label: `What do they need from me in #${ch}?`, entities: { channel: ch }, ack: `${msgs[1].who.split(" ")[0]} wants a sanity check on the copy; nobody has picked up the follow-up yet. Want me to take it?` }) }, "What do they need from me?");
      const body = h("div", {}, h("div", { class: "chan" }, "# " + ch, h("span", { class: "eu-hint" }, "3 new since you left")), log, sugg, h("div", { class: "lp-inline" }, input, ask));
      const el = shell(a, "chat", { verb: this.verb(a), body, summary: `Caught up on #${ch}` });
      return { el, async play(run) { const kids = [...log.children]; kids.forEach((k) => (k.style.opacity = 0)); for (const k of kids) { log.append(typing); await run.wait(420); typing.remove(); k.style.opacity = ""; anim(k, [{ opacity: 0, transform: "translateY(8px) scale(.98)" }, { opacity: 1, transform: "none" }], { spring: "soft" }); await run.wait(260); } stagger(sugg.children, { gap: 60 }); }, spec: { kind: "chat", app: a.id, channel: ch, messages: msgs } };
    },
  },
  notify: {
    label: "Notification stack", verb: () => "3 updates",
    make(a, r) {
      const items = [["Deploy succeeded", "main · 2m ago"], ["New comment from " + pick(r, PEOPLE).split(" ")[0], "\"Looks great, one nit\""], ["Reminder: standup", "in 10 minutes"], [`${a.name} digest`, "5 things you missed"]].sort(() => r() - 0.5).slice(0, 3);
      const stack = h("div", { class: "nstack", tabindex: 0, role: "button", "aria-label": "Fan out notifications", onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stack.click(); } } }, items.map(([t, s], i) => { const n = h("div", { class: "note", style: { "--i": i }, "data-t": t }, icon(a, 22), h("div", { class: "grow" }, h("b", {}, t), h("span", {}, s)), h("time", {}, ["now", "2m", "9m"][i])); swipeAway(n, null, () => n.closest(".nstack")?.classList.contains("open"), () => undoable(el, `Cleared “${t}”`, () => stack.insertBefore(n, stack.children[i] || null), { ms: 5000 })); n.addEventListener("click", (e) => { if (!stack.classList.contains("open") || n.classList.contains("swiping")) return; e.stopPropagation(); tell(el, { action: "open", label: `Open “${t}”`, entities: { notification: t }, ack: t.startsWith("New comment") ? "It's on the Checkout frame: “Looks great, one nit” — the nit is the button weight. Want me to reply?" : t.startsWith("Deploy") ? "main is live. No new errors in the first 2 minutes." : "Opened. I'll fold the rest into tonight's digest." }); }); return n; }));
      stack.addEventListener("click", () => { if (stack.classList.contains("open")) return; flip(stack.children, () => stack.classList.add("open"), { spring: "soft" }); });
      const body = h("div", {}, stack, h("p", { class: "eu-hint" }, "Tap to fan out · swipe to clear"));
      const collapse = h("button", { class: "eu-btn ghost", onclick: () => flip(stack.children, () => stack.classList.remove("open"), { spring: "soft" }) }, "Stack");
      const clear = h("button", { class: "eu-btn", type: "button", onclick: () => { const kids = [...stack.children]; if (!kids.length) return; kids.forEach((k) => k.remove()); undoable(el, `Cleared ${kids.length}`, () => stack.append(...kids)); } }, "Clear all");
      collapse.type = "button";
      const el = shell(a, "notify", { verb: this.verb(a), body, foot: [collapse, clear], summary: `3 ${a.name} updates` });
      return { el, async play(run) { [...stack.children].forEach((n, i) => anim(n, [{ opacity: 0, transform: "translateY(-30px) scale(.9)" }, { opacity: 1, transform: "" }], { spring: "bouncy", delay: i * 110, fill: "backwards" })); }, spec: { kind: "notify", app: a.id, items } };
    },
  },
  slots: {
    label: "Find a time", verb: () => "Found 3 open times",
    make(a, r) {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri"], hours = 7;
      const busy = new Set(); for (let i = 0; i < 16; i++) busy.add(`${Math.floor(r() * 5)}-${Math.floor(r() * hours * 2)}`);
      const grid = h("div", { class: "slotgrid", style: { "--rows": hours * 2 } });
      const cells = [];
      days.forEach((d, di) => { const col = h("div", { class: "col" }, h("span", { class: "dh" }, d)); for (let s = 0; s < hours * 2; s++) { const c = h("i", { class: busy.has(`${di}-${s}`) ? "busy" : "", "data-d": di, "data-s": s }); cells.push(c); col.append(c); } grid.append(col); });
      const label = h("b", { class: "pick" }, "Drag across free time");
      let sel = null, d0 = null;
      const paint = () => cells.forEach((c) => c.classList.toggle("sel", !!sel && +c.dataset.d === sel.d && +c.dataset.s >= sel.a && +c.dataset.s <= sel.b));
      const fmtT = (s) => { const m = 9 * 60 + s * 30; const hh = Math.floor(m / 60), mm = m % 60; return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")}${hh < 12 ? "a" : "p"}`; };
      grid.addEventListener("pointerdown", (e) => { const c = e.target.closest("i"); if (!c || c.classList.contains("busy")) return; d0 = { d: +c.dataset.d, s: +c.dataset.s }; sel = { d: d0.d, a: d0.s, b: d0.s }; paint(); grid.setPointerCapture(e.pointerId); });
      grid.addEventListener("pointermove", (e) => { if (!d0) return; const c = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".slotgrid i"); if (!c || +c.dataset.d !== d0.d) return; const s = +c.dataset.s; const a1 = Math.min(s, d0.s), b1 = Math.max(s, d0.s); for (let k = a1; k <= b1; k++) if (busy.has(`${d0.d}-${k}`)) return; sel = { d: d0.d, a: a1, b: b1 }; paint(); });
      const said = () => `${days[sel.d]} ${fmtT(sel.a)}–${fmtT(sel.b + 1)}`;
      const commit = () => { label.textContent = said(); anim(label, [{ transform: "scale(1.08)" }, { transform: "none" }], { spring: "bouncy" }); book.querySelector(".lbl").textContent = `Hold to book ${days[sel.d]} ${fmtT(sel.a)}`; };
      grid.addEventListener("pointerup", () => { if (!d0) return; d0 = null; commit(); });
      // Keyboard: ←/→ day, ↑/↓ move, Shift+↑/↓ resize. Busy cells block, same as dragging.
      grid.tabIndex = 0; grid.setAttribute("role", "grid"); grid.setAttribute("aria-label", "Free time this week. Arrow keys move, Shift+arrows resize.");
      grid.addEventListener("keydown", (e) => {
        if (!sel) sel = { d: 0, a: 6, b: 6 };
        const free = (d, a1, b1) => a1 >= 0 && b1 < hours * 2 && [...Array(b1 - a1 + 1)].every((_, k) => !busy.has(`${d}-${a1 + k}`));
        let n = { ...sel };
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") { const dir = e.key === "ArrowRight" ? 1 : -1; for (let d = sel.d + dir; d >= 0 && d < 5; d += dir) if (free(d, sel.a, sel.b)) { n.d = d; break; } }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") { const dir = e.key === "ArrowDown" ? 1 : -1; n = e.shiftKey ? { ...sel, b: Math.max(sel.a, sel.b + dir) } : { ...sel, a: sel.a + dir, b: sel.b + dir }; if (!free(n.d, n.a, n.b)) n = sel; }
        else return;
        e.preventDefault(); sel = n; paint(); commit();
      });
      const people = h("div", { class: "eu-avs" }, [0, 1, 2].map((i) => avatar(PEOPLE[(i + 2) % PEOPLE.length], i)));
      const book = holdButton("Hold to book", (b, t) => { if (!sel) return; t.textContent = `Booked ${said()} ✓`; burst(b); settle(el, "Booked", "ok"); el.summary = `Booked ${said()} with Priya, Sam and Mina`; tell(el, { action: "book", label: `Book ${said()}`, entities: { slot: `${days[sel.d]}-${sel.a}-${sel.b}`, person: ["priya", "sam", "mina"] }, ack: "Sent. Invites include a Meet link; I'll tell you if anyone declines." }); });
      let round = 0;
      const more = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        round++; const cand = cells.filter((c) => !c.classList.contains("busy") && +c.dataset.s < hours * 2 - 1 && !busy.has(`${c.dataset.d}-${+c.dataset.s + 1}`));
        const c = cand[(round * 7) % cand.length]; if (!c) return; sel = { d: +c.dataset.d, a: +c.dataset.s, b: +c.dataset.s + 1 }; paint(); commit();
        tell(el, { action: "suggest", label: "Suggest another time", entities: { slot: `${days[sel.d]}-${sel.a}-${sel.b}` }, ack: `How about ${said()}? Everyone is free and nobody is back-to-back.` });
      } }, "Suggest another");
      const body = h("div", {}, h("div", { class: "row between" }, people, label), grid);
      const el = shell(a, "slots", { verb: this.verb(a), body, foot: [book, more], summary: "Booked 30 min with Priya, Sam and Mina" });
      return { el, async play(run) { cells.forEach((c, i) => c.classList.contains("busy") && anim(c, [{ transform: "scaleY(0)" }, { transform: "none" }], { spring: "soft", delay: (i % (hours * 2)) * 18 + Math.floor(i / (hours * 2)) * 40 })); await run.wait(700); const free = cells.filter((c) => !c.classList.contains("busy") && +c.dataset.s > 5 && +c.dataset.s < 12); const c = free[Math.floor(free.length / 3)]; if (c) { sel = { d: +c.dataset.d, a: +c.dataset.s, b: +c.dataset.s }; if (!busy.has(`${sel.d}-${sel.b + 1}`)) sel.b++; paint(); commit(); } }, spec: { kind: "slots", app: a.id, attendees: 3, duration: 30 } };
    },
  },
  kanban: {
    label: "Board move", verb: () => "Moved 1 card",
    make(a, r) {
      const tasks = ["Fix login loop on Safari", "Ship onboarding v2", "Write release notes", "Audit API rate limits", "Migrate billing tables", "Polish empty states"].sort(() => r() - 0.5);
      const cols = [["Todo", tasks.slice(0, 2)], ["In progress", tasks.slice(2, 4)], ["Done", tasks.slice(4, 5)]].map(([n, ts]) => h("div", { class: "kcol", "data-col": n }, h("span", { class: "kh" }, n, h("em", {}, ts.length)), ts.map((t, i) => kcard(t, i))));
      function kcard(t, i) { const id = `${a.name.slice(0, 3).toUpperCase()}-${100 + Math.floor(r() * 400)}`; const c = h("div", { class: "kcard", tabindex: 0, role: "button", "aria-label": `${id} ${t}. Arrow left or right to move.`, "data-id": id, "data-t": t }, h("span", { class: "kid" }, id), h("span", {}, t), avatar(PEOPLE[(i + t.length) % PEOPLE.length], i)); dragCard(c); c.addEventListener("click", () => { if (c.dataset.moved) { delete c.dataset.moved; return; } board.querySelectorAll(".kcard").forEach((x) => x.classList.toggle("lp-sel", x === c)); tell(el, { action: "select", label: `${id}: ${t}`, entities: { issue: id }, ack: `${id} is in ${c.parentElement.dataset.col}. Want me to pick it up, or move it?` }); }); c.addEventListener("keydown", (e) => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); const cs = [...board.querySelectorAll(".kcol")]; const j = cs.indexOf(c.parentElement) + (e.key === "ArrowRight" ? 1 : -1); if (cs[j]) { move(c, cs[j]); c.focus(); } }); return c; }
      function move(c, col, { silent = false } = {}) {
        const from = c.parentElement; const all = [...board.querySelectorAll(".kcard")];
        flip(all, () => { col.append(c); counts(); });
        if (col.dataset.col === "Done") burst(c, "var(--h-success)");
        if (silent) return;
        tell(el, { action: "move", label: `${c.dataset.id} → ${col.dataset.col}`, entities: { issue: c.dataset.id, column: col.dataset.col }, quiet: true });
        undoable(el, `Moved ${c.dataset.id} to ${col.dataset.col}`, () => { flip([...board.querySelectorAll(".kcard")], () => { from.append(c); counts(); }); });
      }
      function counts() { board.querySelectorAll(".kcol").forEach((c) => (c.querySelector("em").textContent = c.querySelectorAll(".kcard").length)); }
      function dragCard(c) {
        c.addEventListener("pointerdown", (e) => {
          const st = c.getBoundingClientRect(); const ox = e.clientX - st.left, oy = e.clientY - st.top;
          c.setPointerCapture(e.pointerId); c.classList.add("drag");
          const mv = (ev) => { c.style.translate = `${ev.clientX - ox - st.left}px ${ev.clientY - oy - st.top}px`; c.style.rotate = `${Math.max(-6, Math.min(6, (ev.movementX || 0) * 0.6))}deg`; };
          const up = (ev) => { c.removeEventListener("pointermove", mv); c.removeEventListener("pointerup", up); c.classList.remove("drag"); c.style.translate = ""; c.style.rotate = ""; c.hidden = true; const col = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".kcol"); c.hidden = false; if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 4) c.dataset.moved = "1"; if (col && col !== c.parentElement && board.contains(col)) move(c, col); };
          c.addEventListener("pointermove", mv); c.addEventListener("pointerup", up);
        });
      }
      const board = h("div", { class: "kanban" }, cols);
      const el = shell(a, "kanban", { verb: this.verb(a), body: h("div", {}, board, h("p", { class: "eu-hint" }, "Drag cards between columns · or focus one and press ← →")), summary: `Moved "${tasks[2]}" to Done` });
      return { el, async play(run) { stagger(board.querySelectorAll(".kcard"), { gap: 50 }); await run.wait(1100); const c = board.querySelectorAll(".kcol")[1].querySelector(".kcard"); if (c) { flip([...board.querySelectorAll(".kcard")], () => { board.querySelectorAll(".kcol")[2].append(c); counts(); }, { spring: "soft" }); await run.wait(350); burst(c, "var(--h-success)"); } }, spec: { kind: "kanban", app: a.id, moved: tasks[2], to: "Done" } };
    },
  },
  triage: {
    label: "Issue triage", verb: () => "Triaged 1 issue",
    make(a, r) {
      const n = 400 + Math.floor(r() * 600);
      const titles = ["Login loop on Safari 18", "Export drops the last row", "Webhook retries never stop", "Dark mode flashes on load", "Search ignores accents"];
      const t = pick(r, titles);
      const labels = h("div", { class: "eu-chips labels" });
      const L = [["bug", "#d73a4a"], ["p1", "#e99695"], ["auth", "#0e8a16"]];
      const pr = seg(["P0", "P1", "P2", "P3"], (i) => { labels.querySelector(".lp")?.replaceChildren(`p${i}`); }, 1);
      const who = PEOPLE[n % PEOPLE.length];
      const asg = h("div", { class: "asg" }, h("span", { class: "eu-hint" }, "Assignee"), h("span", { class: "slot" }));
      const body = h("div", { class: "triage" }, h("div", { class: "issue" }, h("span", { class: "dot open" }), h("div", {}, h("b", {}, t), h("span", { class: "eu-hint" }, ` #${n} · opened 2h ago by ${pick(r, PEOPLE).split(" ")[0]}`))), labels, h("div", { class: "row between" }, asg, pr), h("p", { class: "why" }, h("span", { class: "spark-ico" }, "✦"), " Same stack trace as #", String(n - 37), " — likely the cookie SameSite change."));
      const prio = () => labels.querySelector(".lp")?.textContent || "p1";
      const apply = h("button", { class: "eu-btn primary", type: "button", onclick: () => {
        apply.textContent = "Applied ✓"; setDisabled(apply, "Issue triaged"); setDisabled(dup, "Issue triaged"); settle(el, "Triaged", "ok"); el.summary = `Labelled #${n} bug · ${prio()}, assigned ${who.split(" ")[0]}`;
        tell(el, { action: "apply", label: `Apply bug · ${prio()} · ${who.split(" ")[0]}`, entities: { issue: n, label: ["bug", prio(), "auth"], person: who }, ack: `Done. ${who.split(" ")[0]} is notified; I linked #${n - 37} as related.` });
        undoable(el, `Triaged #${n}`, () => { setDisabled(apply); setDisabled(dup); apply.textContent = "Apply"; settle(el, "Draft"); });
      } }, "Apply");
      const dup = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        dup.textContent = `Duplicate of #${n - 37}`; setDisabled(apply, "Issue closed"); setDisabled(dup, "Issue closed"); settle(el, "Closed", "denied"); el.summary = `Closed #${n} as a duplicate of #${n - 37}`;
        tell(el, { action: "duplicate", label: `Close as duplicate of #${n - 37}`, entities: { issue: [n, n - 37] }, ack: `Closed and cross-linked. I copied the new repro steps onto #${n - 37}.` });
        undoable(el, `Closed #${n}`, () => { setDisabled(apply); setDisabled(dup); dup.textContent = "Mark duplicate"; settle(el, "Draft"); });
      } }, "Mark duplicate");
      const el = shell(a, "triage", { verb: this.verb(a), status: "Draft", body, foot: [apply, dup], summary: `Labelled #${n} bug · p1, assigned ${who.split(" ")[0]}` });
      return { el, async play(run) { for (const [l, c] of L) { const chip = h("span", { class: "eu-chip lab" + (l === "p1" ? " lp" : ""), style: { "--lc": c } }, l); labels.append(chip); anim(chip, [{ opacity: 0, transform: "translateY(-18px) scale(.6) rotate(-8deg)" }, { opacity: 1, transform: "none" }], { spring: "bouncy" }); await run.wait(260); } const av = avatar(who, 3); asg.querySelector(".slot").replaceChildren(av, h("span", {}, who)); anim(av, [{ transform: "translateY(-20px) scale(.4)", opacity: 0 }, { transform: "none", opacity: 1 }], { spring: "bouncy" }); }, spec: { kind: "triage", app: a.id, issue: n, labels: L.map((x) => x[0]), assignee: who } };
    },
  },
  file: {
    label: "File preview", verb: () => "Found a file",
    make(a, r) {
      const names = ["Q4 Board Deck.pdf", "Acme MSA (signed).pdf", "Launch plan v3.docx", "Brand guidelines.pdf", "Research notes.md"];
      const fname = pick(r, names);
      const page = h("div", { class: "page" }, h("i", { class: "ttl" }), ...Array.from({ length: 9 }, (_, i) => h("i", { class: "ln" + (i === 4 || i === 5 ? " hit" : ""), style: { width: `${62 + ((i * 37) % 34)}%` } })));
      const bullets = h("ul", { class: "bul" });
      const sum = h("button", { class: "eu-btn primary", type: "button", onclick: async () => { setDisabled(sum, "Summarizing"); const run = new Run(); for (const [b, p] of [["Revenue +18% QoQ, driven by enterprise", 3], ["Hiring plan holds at 6 roles", 7], ["Decision needed: EU data region", 11]]) { const li = h("li", { tabindex: 0, title: `p. ${p} · click to ask about it` }); li.onclick = () => tell(el, { action: "ask", label: `More on “${b}”`, entities: { file: fname, page: p }, ack: p === 11 ? "Two options on p. 11: Frankfurt (ready in Q1) or Dublin (cheaper, Q2). Legal prefers Frankfurt." : p === 3 ? "Enterprise is 62% of new ARR; mid-market was flat. Chart on p. 3." : "Six roles, two already in final rounds. Nothing new to approve." }); li.onkeydown = (e) => { if (e.key === "Enter") li.onclick(); }; bullets.append(li); await typeText(li, b, run, 70).catch(() => {}); } sum.textContent = "Summarized"; setDisabled(sum, "Summary ready"); } }, "Summarize");
      const body = h("div", { class: "file" }, h("div", { class: "pv" }, page, h("span", { class: "pg" }, "p. 3 / 12")), h("div", { class: "meta" }, h("b", {}, fname), h("span", {}, `Owner ${pick(r, PEOPLE).split(" ")[0]} · 2.4 MB`), h("span", {}, "Edited 3 days ago"), bullets));
      const el = shell(a, "file", { verb: this.verb(a), body, foot: [sum, h("button", { class: "eu-btn ghost", type: "button", onclick: () => tell(el, { action: "open", label: `Open ${fname} at p. 3`, entities: { file: fname, page: 3 }, ack: `Opened in ${a.name} at p. 3.` }) }, "Open at p. 3")], summary: `Opened ${fname}` });
      return { el, async play(run) { anim(page, [{ transform: "perspective(600px) rotateX(18deg) translateY(16px)", opacity: 0 }, { transform: "none", opacity: 1 }], { spring: "soft" }); await run.wait(500); page.querySelectorAll(".hit").forEach((x, i) => anim(x, [{ boxShadow: "inset 0 0 0 0 var(--a)" }, { boxShadow: "inset 200px 0 0 0 color-mix(in srgb, var(--a) 30%, transparent)" }], { duration: 700, delay: i * 120, easing: "cubic-bezier(.65,0,.35,1)" })); }, spec: { kind: "file", app: a.id, name: fname, page: 3 } };
    },
  },
  graph: {
    label: "Linked notes graph", verb: () => "Mapped 9 linked notes",
    make(a, r) {
      const W = 300, H = 170;
      const names = ["Roadmap", "Pricing", "Onboarding", "Interviews", "Churn", "Retention", "Ideas", "Launch", "Metrics"];
      const nodes = names.map((n, i) => ({ n, x: W / 2 + Math.cos(i * 0.7) * (40 + r() * 90), y: H / 2 + Math.sin(i * 1.3) * (20 + r() * 50), vx: 0, vy: 0 }));
      const links = [[0, 1], [0, 2], [0, 7], [2, 3], [3, 4], [4, 5], [5, 8], [7, 8], [6, 0], [1, 8], [6, 3]];
      const lg = svg("g", { class: "links" }), ng = svg("g", { class: "nodes" });
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "graph" }, lg, ng);
      const lines = links.map(([p, q]) => { const l = svg("line", { pathLength: 1 }); lg.append(l); return l; });
      const dots = nodes.map((nd, i) => { const g = svg("g", { class: "nd" + (i === 0 ? " root" : "") }, svg("circle", { r: i === 0 ? 7 : 4.5 }), svg("text", { y: -9 }, document.createTextNode(nd.n))); ng.append(g); return g; });
      let drag = null, raf, calm = 0;
      const tick = () => {
        for (const nd of nodes) { nd.vx += (W / 2 - nd.x) * 0.004; nd.vy += (H / 2 - nd.y) * 0.012; }
        for (const [p, q] of links) { const A = nodes[p], B = nodes[q]; const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, f = (d - 58) * 0.01; A.vx += (dx / d) * f; A.vy += (dy / d) * f; B.vx -= (dx / d) * f; B.vy -= (dy / d) * f; }
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const A = nodes[i], B = nodes[j]; const dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy + 1, f = Math.min(0.5, 14 / d2); A.vx -= dx * f; A.vy -= dy * f; B.vx += dx * f; B.vy += dy * f; }
        nodes.forEach((nd, i) => { if (drag === i) return; nd.vx = Math.max(-3, Math.min(3, nd.vx * 0.82)); nd.vy = Math.max(-3, Math.min(3, nd.vy * 0.82)); nd.x = Math.max(16, Math.min(W - 16, nd.x + nd.vx)); nd.y = Math.max(18, Math.min(H - 10, nd.y + nd.vy)); });
        lines.forEach((l, k) => { const [p, q] = links[k]; l.setAttribute("x1", nodes[p].x); l.setAttribute("y1", nodes[p].y); l.setAttribute("x2", nodes[q].x); l.setAttribute("y2", nodes[q].y); });
        dots.forEach((d, i) => d.setAttribute("transform", `translate(${nodes[i].x} ${nodes[i].y})`));
        const en = nodes.reduce((t, n) => t + Math.abs(n.vx) + Math.abs(n.vy), 0); calm = en < 0.08 && drag == null ? calm + 1 : 0;
        if (s.isConnected && calm < 45) raf = requestAnimationFrame(tick); else { raf = null; calm = 0; }
      };
      const toLocal = (e) => { const b = s.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * W, ((e.clientY - b.top) / b.height) * H]; };
      dots.forEach((d, i) => {
        let downAt = null;
        d.addEventListener("pointerdown", (e) => { drag = i; downAt = [e.clientX, e.clientY]; s.setPointerCapture(e.pointerId); start(); });
        d.addEventListener("pointerup", (e) => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 4) pickNote(i); downAt = null; });
        d.addEventListener("pointerenter", () => { s.classList.add("hl"); links.forEach(([p, q], k) => lines[k].classList.toggle("on", p === i || q === i)); dots.forEach((x, j) => x.classList.toggle("on", j === i || links.some(([p, q]) => (p === i && q === j) || (q === i && p === j)))); });
        d.addEventListener("pointerleave", () => s.classList.remove("hl"));
      });
      s.addEventListener("pointermove", (e) => { if (drag == null) return; const [x, y] = toLocal(e); nodes[drag].x = x; nodes[drag].y = y; nodes[drag].vx = nodes[drag].vy = 0; });
      s.addEventListener("pointerup", () => (drag = null));
      let focus = 0;
      const openBtn = h("button", { class: "eu-btn", type: "button", onclick: () => tell(el, { action: "open", label: `Open ${names[focus]}`, entities: { note: names[focus] }, ack: `Opened “${names[focus]}” in ${a.name}.` }) }, "Open Roadmap");
      function pickNote(i) { focus = i; dots.forEach((x, j) => x.classList.toggle("pick", j === i)); openBtn.textContent = `Open ${names[i]}`; const nb = links.filter(([p, q]) => p === i || q === i).map(([p, q]) => names[p === i ? q : p]); tell(el, { action: "select", label: `Focus on ${names[i]}`, entities: { note: names[i] }, ack: nb.length ? `${names[i]} links to ${nb.join(", ")}. ${nb.length < 2 ? "It's thinly connected — want me to suggest links?" : ""}` : `${names[i]} has no links yet.` }); }
      const orphans = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        // A note is weakly linked when it has one link; there are no true orphans in this map, say so.
        const deg = names.map((_, i) => links.filter(([p, q]) => p === i || q === i).length);
        const weak = names.filter((_, i) => deg[i] <= 1);
        dots.forEach((x, i) => x.classList.toggle("pick", deg[i] <= 1));
        tell(el, { action: "orphans", label: "Find orphans", entities: { note: weak }, ack: weak.length ? `No true orphans. ${weak.join(", ")} ${weak.length === 1 ? "has" : "have"} a single link — highlighted.` : "No orphans: every note has at least two links." });
      } }, "Find orphans");
      dots.forEach((d, i) => { d.setAttribute("tabindex", "0"); d.setAttribute("role", "button"); d.setAttribute("aria-label", names[i]); d.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickNote(i); } }); });
      const el = shell(a, "graph", { verb: this.verb(a), body: h("div", {}, s, h("p", { class: "eu-hint" }, "Click a note to focus the agent on it · drag to untangle")), foot: [openBtn, orphans], summary: "Mapped 9 notes around Roadmap" });
      const start = () => { if (!raf) raf = requestAnimationFrame(tick); };
      s.addEventListener("pointerenter", start);
      return { el, async play(run) { start(); lines.forEach((l, k) => anim(l, [{ strokeDashoffset: 1, strokeDasharray: 1 }, { strokeDashoffset: 0, strokeDasharray: 1 }], { duration: 700, delay: 200 + k * 60, easing: "cubic-bezier(.65,0,.35,1)" })); dots.forEach((d, i) => anim(d.querySelector("circle"), [{ r: 0 }, { r: i === 0 ? 7 : 4.5 }], { spring: "bouncy", delay: i * 60 })); }, spec: { kind: "graph", app: a.id, root: "Roadmap", nodes: names.length } };
    },
  },
  search: {
    label: "Search results", verb: (a) => `Searched ${a.name}`,
    make(a, r) {
      const qs = { maps: "coffee near Ferry Building", data: "users where plan = 'pro'", analytics: "signup funnel drop-off", social: "ephemeral ui", code: "useSession", default: "Q4 planning" };
      const q = qs[a.cat] || qs.default;
      const res = [["Q4 planning — goals and owners", "…the **Q4 planning** doc lists 6 goals with one owner each…"], ["Planning offsite notes", "…we agreed **Q4** focus is retention over new surface…"], ["Roadmap (draft)", "…moved importer out of **planning** for **Q4**…"], ["Budget sheet", "…headcount line for **Q4** is pending finance…"], ["Q4 hiring plan", "…six roles, two in final rounds for **Q4**…"], ["Q3 retro", "…carry-overs into **Q4 planning**: importer, sync…"]];
      const custom = { maps: [["Blue Bottle Coffee", "4.6 ★ · 3 min walk · Open until 6 PM"], ["Sightglass", "4.5 ★ · 9 min walk · Open until 7 PM"], ["Ritual Coffee", "4.4 ★ · 12 min walk · Closes soon"], ["Andytown", "4.7 ★ · 6 min by car"], ["Saint Frank", "4.6 ★ · 14 min by car"], ["Réveille", "4.3 ★ · 7 min walk"]], code: [["src/auth/useSession.ts", "export function **useSession**(opts) {"], ["src/app/layout.tsx", "const s = **useSession**({ required: true })"], ["tests/session.test.ts", "it('refreshes **useSession** on focus')"], ["docs/auth.md", "Call **useSession** in client components"], ["src/api/me.ts", "const { user } = **useSession**()"], ["src/hooks/index.ts", "export { **useSession** } from '../auth/useSession'"]] };
      const all = custom[a.cat] || res;
      const row = ([t, sn]) => { const li = h("li", { tabindex: 0, role: "option", "aria-selected": "false", "data-t": t }, h("b", {}, t), h("span", { html: sn.replace(/\*\*(.+?)\*\*/g, "<mark>$1</mark>") })); li.onclick = () => pickRow(li); return li; };
      const list = all.slice(0, 4).map(row);
      const ul = h("ul", { class: "eu-list results", role: "listbox", "aria-label": "Results" }, list);
      roving(list, { onActivate: (li) => pickRow(li) });
      function pickRow(li) { ul.querySelectorAll("li").forEach((x) => { x.setAttribute("aria-selected", String(x === li)); x.classList.toggle("lp-sel", x === li); }); tell(el, { action: "select", label: `Use “${li.dataset.t}”`, entities: { result: li.dataset.t }, ack: a.cat === "maps" ? `${li.dataset.t} it is — want directions or should I add it to your 3 pm?` : `Reading “${li.dataset.t}” now; I'll answer from it and cite the section.` }); }
      const field = h("div", { class: "qfield" }, h("span", { class: "mg" }, "⌕"), h("span", { class: "q" }), h("span", { class: "caret" }));
      const showAll = h("button", { class: "eu-btn", type: "button", onclick: () => { const more = all.slice(ul.children.length).map(row); if (!more.length) return; ul.append(...more); roving([...ul.children], { onActivate: (li) => pickRow(li) }); stagger(more, { gap: 60 }); showAll.textContent = `All ${all.length} shown`; setDisabled(showAll, "No more results"); } }, `Show ${all.length - 4} more`);
      const refine = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        if (field.querySelector("input")) return;
        const inp = h("input", { type: "text", value: q, "aria-label": "Refine the search", class: "q-in" });
        field.querySelector(".q").replaceWith(inp); field.querySelector(".caret")?.remove(); inp.focus(); inp.select();
        inp.onkeydown = (e) => { if (e.key !== "Enter" || !inp.value.trim()) return; const v = inp.value.trim(); const hits = all.filter(([t, sn]) => v.toLowerCase().split(/\s+/).some((w) => (t + sn).toLowerCase().includes(w))); ul.replaceChildren(...(hits.length ? hits : []).map(row)); if (!hits.length) ul.append(h("li", { class: "empty" }, h("b", {}, "No results"), h("span", {}, "Try fewer words, or ask the agent to search elsewhere."))); stagger(ul.children, { gap: 50 }); el.querySelector(".eu-status").textContent = `${hits.length} hits`; showAll.textContent = `${hits.length} of ${all.length} match`; setDisabled(showAll, "Search filter active"); tell(el, { action: "refine", label: `Search for “${v}”`, entities: { query: v }, quiet: true }); };
      } }, "Refine");
      const el = shell(a, "search", { verb: this.verb(a), status: `${all.length} hits`, body: h("div", {}, field, ul), foot: [showAll, refine], summary: `Searched ${a.name} for "${q}"` });
      return { el, async play(run) { list.forEach((l) => (l.style.opacity = 0)); await typeText(field.querySelector(".q"), q, run, 30); list.forEach((l) => (l.style.opacity = "")); stagger(list, { gap: 70 }); }, spec: { kind: "search", app: a.id, query: q } };
    },
  },
  feed: {
    label: "Post composer", verb: () => "Drafted a post",
    make(a, r) {
      const txt = a.cat === "media" ? "New episode is up: how we render UI frame by frame at 4K." : "Shipped ephemeral UI cards: one spec, every agent host. They show up when the agent touches an app, then get out of the way.";
      const t = h("p", { class: "ptxt" });
      const likes = h("b", {}, "0");
      const heart = h("button", { class: "heart", type: "button", "aria-label": "Like", onclick: () => { heart.classList.toggle("on"); likes.textContent = String(+likes.textContent + (heart.classList.contains("on") ? 1 : -1)); burst(heart, "#f43f5e", 10); anim(heart, [{ transform: "scale(.6)" }, { transform: "scale(1)" }], { spring: "bouncy" }); } }, "♥");
      const media = h("div", { class: "pmedia" });
      const count = h("span", { class: "eu-hint" });
      const limit = 300;
      const recount = () => { const n = t.textContent.length; count.textContent = `${n} / ${limit}`; count.style.color = n > limit ? "var(--h-danger)" : ""; setDisabled(post, el?.classList.contains("posted") ? "Already posted" : n === 0 ? "Draft is empty" : n > limit ? "Character limit exceeded" : ""); };
      t.addEventListener("input", recount);
      const post = h("button", { class: "eu-btn primary", type: "button", onclick: () => {
        post.textContent = "Posted"; setDisabled(post, "Already posted"); setDisabled(edit, "Already posted"); t.contentEditable = "false"; el.classList.add("posted"); settle(el, "Posted", "ok");
        tell(el, { action: "post", label: "Post it", entities: { account: "you" }, text: t.textContent, quiet: true });
        let timer = setTimeout(() => countUp(likes, 128, { dur: 1600 }), 1200);
        undoable(el, `Posted to ${a.name}`, () => { clearTimeout(timer); post.textContent = "Post"; setDisabled(edit); el.classList.remove("posted"); settle(el, "Draft"); likes.textContent = "0"; recount(); }, { ms: 7000, action: "unpost" });
      } }, "Post");
      const edit = h("button", { class: "eu-btn ghost", type: "button", onclick: () => { const on = t.contentEditable !== "true"; t.contentEditable = String(on); t.classList.toggle("editing", on); edit.textContent = on ? "Done" : "Edit"; if (on) { t.focus(); getSelection()?.selectAllChildren(t); getSelection()?.collapseToEnd(); } else if (t.textContent !== txt) tell(el, { action: "edit", label: "I rewrote the post", text: t.textContent, ack: "Noted — I'll write the next one closer to your version." }); } }, "Edit");
      const body = h("div", { class: "feed" }, h("div", { class: "row" }, avatar("Kevin R", 4), h("div", {}, h("b", {}, "You"), h("span", { class: "eu-hint" }, ` @you · ${a.name}`))), t, media, h("div", { class: "row stats" }, heart, likes, h("span", { class: "eu-hint" }, "· 2 reposts · 14 replies")));
      const el = shell(a, "feed", { verb: this.verb(a), status: "Draft", body, foot: [post, edit, h("span", { class: "grow" }), count], summary: `Posted to ${a.name}` });
      recount();
      return { el, async play(run) { await typeText(t, txt, run, 60); recount(); anim(media, [{ clipPath: "inset(0 100% 0 0 round 10px)" }, { clipPath: "inset(0 0 0 0 round 10px)" }], { duration: 700, easing: "cubic-bezier(.65,0,.35,1)" }); }, spec: { kind: "feed", app: a.id, text: txt } };
    },
  },
  frames: {
    label: "Design review", verb: () => "Reviewed 3 frames",
    make(a, r) {
      const fr = ["Cart", "Checkout", "Success"].map((n, i) => h("div", { class: "frame", style: { "--i": i } }, h("span", { class: "fn" }, n), h("i", { class: "b1" }), h("i", { class: "b2" }), h("i", { class: "b3" })));
      const canvas = h("div", { class: "canvas" }, fr);
      const cursors = [0, 1].map((i) => { const c = h("div", { class: "fcur", style: { "--hue": [210, 330][i] } }, h("span", { class: "ptr", html: '<svg viewBox="0 0 16 16"><path d="M1 1l5 14 2-6 6-2z"/></svg>' }), h("span", {}, PEOPLE[i + 4].split(" ")[0])); canvas.append(c); return c; });
      const pin = h("button", { class: "cpin", type: "button" }, "2", h("span", { class: "bub" }, "Button feels heavy — try ghost?"));
      canvas.append(pin);
      const approve = holdButton("Hold to approve", (b, t) => { t.textContent = "Approved"; burst(b); settle(el, "Approved", "ok"); setDisabled(req, "Review completed"); tell(el, { action: "approve", label: "Approve the checkout flow", entities: { frame: ["cart", "checkout", "success"] }, ack: "Approved. I marked the frames ready for dev and kept your comment as a follow-up." }); });
      const req = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        if (el.querySelector(".lp-inline")) return;
        const inp = h("input", { type: "text", placeholder: "What should change?", "aria-label": "Requested change", value: "Make the pay button lighter (ghost)" });
        const send = h("button", { class: "eu-btn sm primary", type: "button", onclick: () => { const v = inp.value.trim(); if (!v) return; box.remove(); settle(el, "Changes requested", "hot"); setDisabled(approve, "Changes requested"); setDisabled(req, "Review completed"); tell(el, { action: "request_changes", label: v, entities: { frame: "checkout" }, text: v, ack: "Sent to Mina with your note pinned on Checkout. I'll bring the revision back here." }); } }, "Send");
        inp.onkeydown = (e) => { if (e.key === "Enter") send.click(); if (e.key === "Escape") box.remove(); };
        const box = h("div", { class: "lp-inline" }, inp, send); el.querySelector(".eu-b").append(box); inp.focus(); inp.select();
      } }, "Request changes");
      pin.onclick = () => tell(el, { action: "select", label: "Comment 2 on Checkout", entities: { frame: "checkout", comment: 2 }, ack: "Mina thinks the pay button is too heavy. A ghost button would drop contrast below AA — I'd darken the border instead." });
      const el = shell(a, "frames", { verb: this.verb(a), status: "2 comments", body: canvas, foot: [approve, req], summary: "Approved Checkout flow, 2 comments" });
      return { el, async play(run) { stagger(fr, { gap: 120, y: 14 }); const path = [[20, 30], [60, 70], [55, 40], [80, 50]]; cursors.forEach((c, i) => anim(c, path.map(([x, y]) => ({ left: `${(x + i * 13) % 90}%`, top: `${(y + i * 21) % 80}%` })), { duration: 3200, iterations: Infinity, direction: "alternate", easing: "ease-in-out", fill: "none" })); await run.wait(1100); pin.classList.add("on"); anim(pin, [{ transform: "scale(0)" }, { transform: "scale(1)" }], { spring: "bouncy" }); }, spec: { kind: "frames", app: a.id, frames: 3, comments: 2 } };
    },
  },
  sign: {
    label: "Sign a document", verb: () => "Ready for your signature",
    make(a, r) {
      const doc = h("div", { class: "doc" }, ...Array.from({ length: 7 }, (_, i) => h("i", { class: "ln", style: { width: `${55 + ((i * 29) % 40)}%` } })), h("div", { class: "sigbox" }, h("span", { class: "sigsvg", html: '<svg viewBox="0 0 200 50"><path class="sig" pathLength="1" d="M6 34c10-22 18-26 22-10s-6 18 2 4 14-22 18-6-4 16 4 6 10-14 14-2 6 10 14-4 10-2 16 0 30-6 48-4"/></svg>' }), h("span", {}, "Sign here")));
      const steps = ["Legal name", "Start date", "Signature"].map((s, i) => h("li", { class: i === 0 ? "cur" : "" }, h("i", {}, i + 1), s));
      const ol = h("ol", { class: "steps" }, steps);
      let at = 0;
      const next = h("button", { class: "eu-btn primary", onclick: () => step() }, "Next");
      function step() {
        steps[at].classList.remove("cur"); steps[at].classList.add("ok"); at++;
        if (at < steps.length) { el.querySelector(".eu-status").textContent = `Step ${at + 1} of 3`; steps[at].classList.add("cur"); doc.style.setProperty("--z", at === 2 ? 1.6 : 1.25); doc.classList.toggle("zsig", at === 2); if (at === 2) next.textContent = "Sign"; }
        else { const p = doc.querySelector(".sig"); anim(p, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1200, easing: "cubic-bezier(.65,0,.35,1)" }); next.textContent = "Signed ✓"; setDisabled(next, "Document signed"); setDisabled(decline, "Document signed"); settle(el, "Signed", "ok"); setTimeout(() => burst(next), 900); tell(el, { action: "sign", label: "Sign the offer letter", entities: { document: "offer-letter" }, ack: "Signed. A copy is in your Drive and HR has it — they'll send the start-date packet." }); }
      }
      const decline = h("button", { class: "eu-btn ghost", type: "button", onclick: () => {
        if (el.querySelector(".lp-chips")) return;
        const reasons = ["Start date doesn't work", "Want to discuss terms", "Not taking the offer"];
        const box = h("div", { class: "lp-chips", role: "group", "aria-label": "Why decline?" }, reasons.map((x) => h("button", { class: "eu-chip btn", type: "button", onclick: () => { box.remove(); setDisabled(next, "Document declined"); setDisabled(decline, "Document declined"); settle(el, "Declined", "denied"); tell(el, { action: "decline", label: `Decline: ${x}`, entities: { document: "offer-letter" }, text: x, ack: x === "Not taking the offer" ? "Declined. Want me to draft a warm note to the recruiter?" : "I didn't decline in DocuSign — I'll ask HR about it and keep the envelope open." }); } }, x)));
        el.querySelector(".eu-b").append(box); box.querySelector("button").focus();
      } }, "Decline");
      next.type = "button";
      const el = shell(a, "sign", { verb: this.verb(a), status: `Step 1 of 3`, body: h("div", { class: "signwrap" }, h("div", { class: "docv" }, doc), ol), foot: [next, decline], summary: "Signed offer letter" });
      return { el, async play(run) { stagger(steps, { gap: 80, delay: 200 }); }, spec: { kind: "sign", app: a.id, fields: 3 } };
    },
  },
  context: {
    label: "Context window", verb: () => "Context window · 168k",
    make(a, r) {
      const parts = [["System prompt", 4, "var(--k1)"], ["Tools", 12, "var(--k2)"], ["Files", 38, "var(--k3)"], ["Conversation", 46, "var(--k4)"], ["Memory", 6, "var(--k5)"]];
      const N = 120, used = 84;
      const cells = []; let k = 0;
      parts.forEach(([n, pct, c], pi) => { const cnt = Math.round((pct / 100) * used); for (let i = 0; i < cnt && k < used; i++, k++) cells.push(h("i", { style: { "--c": c }, "data-p": pi })); });
      while (cells.length < N) cells.push(h("i", { class: "free" }));
      const grid = h("div", { class: "cgrid" }, cells);
      const total = h("b", { class: "big" }, "0");
      const legend = h("ul", { class: "legend" }, parts.map(([n, pct, c], pi) => h("li", { style: { "--c": c }, onpointerenter: () => grid.classList.add("f", "f" + pi), onpointerleave: () => grid.classList.remove("f", "f" + pi) }, h("i"), n, h("em", {}, `${Math.round(pct * 1.68)}k`))));
      const pctChip = h("span", { class: "eu-chip" }, "84% used");
      const setUsed = (k) => { total.textContent = `${k}k`; pctChip.textContent = `${Math.round(k / 2)}% used`; };
      let pinned = false;
      const compact = h("button", { class: "eu-btn", type: "button", onclick: () => {
        // Compaction summarizes the conversation (and unpinned files) — show what it would cost before it happens.
        const conv = cells.filter((c) => c.dataset.p === "3"), files = cells.filter((c) => c.dataset.p === "2");
        const drop = [...conv.slice(0, Math.round(conv.length * 0.75)), ...(pinned ? [] : files.slice(0, Math.round(files.length * 0.5)))];
        drop.forEach((c, i) => anim(c, [{ transform: "none", opacity: 1 }, { transform: "scale(.2)", opacity: 0.15 }], { duration: 280, delay: i * 6, fill: "forwards" }));
        drop.forEach((c) => c.classList.add("freed"));
        const freed = Math.round((drop.length / N) * 200);
        setUsed(168 - freed); setDisabled(compact, "Context compacted");
        tell(el, { action: "compact", label: pinned ? "Compact, keep files" : "Compact", entities: { context: "session" }, ack: `Freed ${freed}k. I kept the last 6 turns verbatim${pinned ? " and every file" : ""}; the rest is a summary you can expand.` });
        undoable(el, `Compacted · freed ${freed}k`, () => { drop.forEach((c) => { c.classList.remove("freed"); c.getAnimations().forEach((x) => x.cancel()); }); setUsed(168); setDisabled(compact); }, { ms: 8000, action: "uncompact" });
      } }, "Compact");
      const pinF = h("button", { class: "eu-btn ghost", type: "button", "aria-pressed": "false", onclick: () => { pinned = !pinned; pinF.setAttribute("aria-pressed", String(pinned)); pinF.textContent = pinned ? "Files pinned ✓" : "Pin files"; grid.classList.toggle("pinf", pinned); legend.children[2].classList.toggle("pinned", pinned); tell(el, { action: pinned ? "pin" : "unpin", label: pinned ? "Keep files through compaction" : "Let files be summarized", entities: { context: "files" }, quiet: true }); } }, "Pin files");
      [...legend.children].forEach((li, pi) => { li.tabIndex = 0; li.setAttribute("role", "button"); const go = () => tell(el, { action: "inspect", label: `What's in ${parts[pi][0]}?`, entities: { context: parts[pi][0].toLowerCase() }, ack: ["The system prompt and your profile rules — 7k, fixed.", "18 tool schemas. 6 haven't been used this session; I can unload them (−9k).", "4 files, mostly kinds-a.js (31k). Pin them to keep them through compaction.", "41 turns. The first 30 are mostly a solved bug — that's what Compact would summarize.", "3 memories about how you like reports written."][pi] }); li.onclick = go; li.onkeydown = (e) => { if (e.key === "Enter") go(); }; });
      const el = shell(a, "context", { verb: this.verb(a), body: h("div", { class: "ctx" }, h("div", { class: "row between" }, h("div", {}, total, h("span", { class: "eu-hint" }, " / 200k tokens")), pctChip), grid, legend), foot: [compact, pinF], summary: "168k / 200k tokens" });
      return { el, async play(run) { countUp(total, 168, { dur: 1400, fmt: (v) => `${Math.round(v)}k` }); cells.forEach((c, i) => !c.classList.contains("free") && anim(c, [{ transform: "scale(0)", opacity: 0 }, { transform: "none", opacity: 1 }], { spring: "bouncy", delay: i * 11 })); }, spec: { kind: "context", app: a.id, used: 168000, limit: 200000 } };
    },
  },
};

/** Pointer swipe to dismiss with velocity; collapses the row and FLIPs its siblings. */
export function swipeAway(el, list, gate = () => true, onGone = null) {
  let x0 = null, dx = 0, t0 = 0;
  el.addEventListener("pointerdown", (e) => { if (!gate()) return; x0 = e.clientX; t0 = performance.now(); el.setPointerCapture(e.pointerId); el.style.transition = "none"; });
  el.addEventListener("pointermove", (e) => { if (x0 == null) return; dx = e.clientX - x0; if (Math.abs(dx) > 4) { el.style.translate = `${dx}px 0`; el.style.opacity = 1 - Math.min(0.7, Math.abs(dx) / 260); el.classList.add("swiping"); } });
  el.addEventListener("pointerup", () => {
    if (x0 == null) return;
    const v = dx / Math.max(1, performance.now() - t0);
    x0 = null; setTimeout(() => el.classList.remove("swiping"), 0);
    if (Math.abs(dx) > 110 || Math.abs(v) > 0.7) {
      const dir = Math.sign(dx) || 1;
      anim(el, [{ translate: `${dx}px 0`, opacity: el.style.opacity }, { translate: `${dir * 420}px 0`, opacity: 0 }], { duration: 240, easing: "ease-in" }).onfinish = () => {
        const sib = [...el.parentElement.children].filter((s) => s !== el);
        flip(sib, () => { el.remove(); onGone?.(el); }, { spring: "soft" });
      };
    } else { anim(el, [{ translate: `${dx}px 0` }, { translate: "0 0" }], { spring: "bouncy", fill: "none" }); el.style.translate = ""; el.style.opacity = ""; }
    dx = 0;
  });
}
