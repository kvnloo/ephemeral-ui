// Playlists: save any card, order and annotate them, share the whole list as one link.
// No backend: the link *is* the playlist (base64url JSON in the hash). Nothing leaves the browser
// until the owner copies or shares the link, and opening a link never writes your own list.
import { h, anim, Run, quiet } from "./motion.js";

const KEY = "eui.playlist.v1";
const MAX = 24, MAX_TITLE = 80, MAX_BY = 40, MAX_NOTE = 140;
const NOT_SHAREABLE = /^(trace|intent-|intel-)/; // these need fixture input, not just (app, kind)

const clip = (s, n) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n) : "");
const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

/** Turn untrusted input into a playlist: unknown apps/kinds, extra fields and overlong text are dropped. */
export function normalize(raw, { catalog, KINDS, themes = [] }) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) throw Error("Not a playlist.");
  let dropped = 0;
  const seen = new Set(), items = [];
  for (const it of raw.items) {
    const [app, kind, note] = Array.isArray(it) ? it : [];
    const key = `${app}/${kind}`;
    if (typeof app !== "string" || typeof kind !== "string" || !Object.hasOwn(catalog.byId, app) || !Object.hasOwn(KINDS, kind) || NOT_SHAREABLE.test(kind) || seen.has(key) || items.length >= MAX) { dropped++; continue; }
    seen.add(key); items.push([app, kind, clip(note, MAX_NOTE)]);
  }
  const th = themes.some((t) => t.id === raw.th) ? raw.th : null;
  return { v: 1, t: clip(raw.t, MAX_TITLE) || "Untitled playlist", by: clip(raw.by, MAX_BY), th, from: clip(raw.from, MAX_TITLE), items, dropped };
}
export const encode = (pl) => b64(JSON.stringify({ v: 1, t: pl.t, by: pl.by, th: pl.th, from: pl.from || undefined, items: pl.items }));
export const decode = (s, ctx) => normalize(JSON.parse(unb64(s)), ctx);
export const linkFor = (pl, base = location.origin + location.pathname) => `${base}#pl=${encode(pl)}`;

export function buildSocial({ catalog, KINDS, makeCard, setTheme, T, setSpec }) {
  const ctx = { catalog, KINDS, themes: T.themes };
  const empty = () => ({ v: 1, t: "My favourite cards", by: "", th: null, from: "", items: [] });
  let mine;
  try { mine = normalize(JSON.parse(localStorage.getItem(KEY) || "null"), ctx); } catch { mine = empty(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch {} refresh(); };
  const has = (app, kind) => mine.items.some(([a, k]) => a === app && k === kind);
  const label = (kind) => KINDS[kind]?.label || kind;

  /* ---- a save button on every shareable card, wherever it renders ---- */
  function decorate(card) {
    if (card.querySelector(":scope > .eu-h > .pl-save")) return;
    const { app, kind } = card.dataset;
    if (!app || !kind || !catalog.byId[app] || !KINDS[kind] || NOT_SHAREABLE.test(kind)) return;
    const b = h("button", { type: "button", class: "pl-save", "aria-label": "Save to playlist", title: "Save to playlist", onclick: (e) => { e.stopPropagation(); toggle(app, kind, b); } }, "♡");
    card.querySelector(":scope > .eu-h")?.insertBefore(b, card.querySelector(":scope > .eu-h > .eu-ttl"));
    mark(b, app, kind);
  }
  const mark = (b, app, kind) => { const on = has(app, kind); b.textContent = on ? "♥" : "♡"; b.setAttribute("aria-pressed", String(on)); b.title = on ? "In your playlist · click to remove" : "Save to playlist"; };
  function toggle(app, kind, b) {
    if (has(app, kind)) mine.items = mine.items.filter(([a, k]) => !(a === app && k === kind));
    else if (mine.items.length >= MAX) { toast(`A playlist holds ${MAX} cards.`); return; }
    else { mine.items.push([app, kind, ""]); toast(`Saved ${catalog.byId[app].name} · ${label(kind)}`); if (b) anim(b, [{ transform: "scale(1.5)" }, { transform: "scale(1)" }], { spring: "bouncy" }); }
    save();
  }
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches(".eu-card")) decorate(n); n.querySelectorAll?.(".eu-card").forEach(decorate); } }).observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll(".eu-card").forEach(decorate);

  /* ---- the dock: your playlist, editable, with one share link ---- */
  const count = h("b", {}, "0");
  const pill = h("button", { type: "button", class: "pl-pill", "aria-expanded": "false", onclick: () => open(panel.hidden) }, "♥ Playlist ", count);
  const title = h("input", { class: "pl-in", "aria-label": "Playlist title", maxlength: MAX_TITLE, oninput: () => { mine.t = clip(title.value, MAX_TITLE) || "Untitled playlist"; save(); } });
  const by = h("input", { class: "pl-in", "aria-label": "Your name (optional)", placeholder: "Your name (optional)", maxlength: MAX_BY, oninput: () => { mine.by = clip(by.value, MAX_BY); save(); } });
  const keepTheme = h("input", { type: "checkbox", onchange: () => { mine.th = keepTheme.checked ? T.base.id : null; save(); } });
  const list = h("ol", { class: "pl-list" });
  const link = h("input", { class: "pl-in pl-link", readonly: true, "aria-label": "Share link", onfocus: () => link.select() });
  const status = h("p", { class: "pl-hint", role: "status" });
  const panel = h("div", { class: "pl-panel", role: "dialog", "aria-label": "Your playlist", hidden: true },
    h("div", { class: "pl-ph" }, h("b", {}, "Your playlist"), h("button", { type: "button", class: "pl-x", "aria-label": "Close", onclick: () => open(false) }, "×")),
    title, by, h("label", { class: "pl-check" }, keepTheme, " Share it in my current theme"), list, link,
    h("div", { class: "pl-row" },
      h("button", { type: "button", class: "eu-btn primary sm", onclick: () => share() }, "Copy link"),
      h("button", { type: "button", class: "eu-btn sm", onclick: () => mine.items.length && show(structuredClone(mine), { own: true }) }, "▶ Play"),
      h("button", { type: "button", class: "eu-btn ghost sm", onclick: () => { if (mine.items.length && confirm("Clear your playlist?")) { mine.items = []; save(); } } }, "Clear")),
    status);
  const dock = h("div", { class: "pl-dock" }, panel, pill);
  document.body.append(dock);
  function open(on) { panel.hidden = !on; pill.setAttribute("aria-expanded", String(on)); if (on) { refresh(); title.focus(); } }

  function refresh() {
    count.textContent = mine.items.length;
    pill.classList.toggle("has", mine.items.length > 0);
    if (document.activeElement !== title) title.value = mine.t;
    if (document.activeElement !== by) by.value = mine.by;
    keepTheme.checked = !!mine.th;
    link.value = mine.items.length ? linkFor(mine) : "";
    if (!list.contains(document.activeElement)) list.replaceChildren(...(mine.items.length ? mine.items.map(([app, kind, note], i) => {
      const a = catalog.byId[app];
      const move = (d) => { const j = i + d; if (j < 0 || j >= mine.items.length) return; [mine.items[i], mine.items[j]] = [mine.items[j], mine.items[i]]; save(); };
      return h("li", {}, h("div", { class: "pl-it" }, h("span", { class: "pl-n" }, String(i + 1)), h("span", { class: "pl-name" }, h("b", {}, a.name), ` · ${label(kind)}`),
        h("button", { type: "button", "aria-label": `Move ${a.name} up`, disabled: i === 0, onclick: () => move(-1) }, "↑"),
        h("button", { type: "button", "aria-label": `Move ${a.name} down`, disabled: i === mine.items.length - 1, onclick: () => move(1) }, "↓"),
        h("button", { type: "button", "aria-label": `Remove ${a.name}`, onclick: () => { mine.items.splice(i, 1); save(); } }, "×")),
        h("input", { class: "pl-in pl-note", value: note, placeholder: "Why this one? (optional)", maxlength: MAX_NOTE, "aria-label": `Note for ${a.name}`, oninput: (e) => { mine.items[i][2] = clip(e.target.value, MAX_NOTE); save(); } }));
    }) : [h("li", { class: "pl-hint" }, "Tap ♡ on any card to save it here, then copy one link for the whole list.")]));
    document.querySelectorAll(".pl-save").forEach((b) => { const c = b.closest(".eu-card"); mark(b, c.dataset.app, c.dataset.kind); });
  }
  async function share() {
    if (!mine.items.length) { status.textContent = "Save a card first."; return; }
    const url = linkFor(mine);
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { try { await navigator.share({ title: mine.t, text: `${mine.t}: ${mine.items.length} ephemeral-ui cards`, url }); status.textContent = "Shared."; return; } catch {} }
    try { await navigator.clipboard.writeText(url); status.textContent = `Link copied: ${mine.items.length} cards, ${url.length} characters. The link holds the list; no account or server.`; }
    catch { link.focus(); status.textContent = "Select the link above and copy it."; }
  }

  /* ---- the listening room: a shared playlist rendered as live cards ---- */
  const sec = document.getElementById("playlist");
  let run = null;
  function show(pl, { own = false } = {}) {
    run?.stop(); run = null;
    const cards = pl.items.map(([app, kind, note], i) => {
      const c = makeCard(app, kind);
      const cell = h("figure", { class: "pl-cell", "data-kind": kind }, h("figcaption", {}, h("span", { class: "pl-n" }, String(i + 1)), h("span", {}, note || `${catalog.byId[app].name} · ${label(kind)}`)), c.el);
      return { c, cell };
    });
    const playBtn = h("button", { type: "button", class: "eu-btn primary", onclick: () => (run ? stop() : play()) }, "▶ Play all");
    const stop = () => { run?.stop(); run = null; playBtn.textContent = "▶ Play all"; sec.querySelectorAll(".pl-cell.on").forEach((e) => e.classList.remove("on")); };
    async function play() {
      run = new Run(); playBtn.textContent = "■ Stop"; const r = run;
      try { for (const { c, cell } of cards) { r.check(); sec.querySelectorAll(".pl-cell.on").forEach((e) => e.classList.remove("on")); cell.classList.add("on"); cell.scrollIntoView({ block: "center", behavior: "smooth" }); await c.play(r); await r.wait(2200); } }
      catch (e) { if (e !== Run.CANCEL) console.error(e); }
      if (run === r) stop();
    }
    const by = pl.by ? ` · curated by ${pl.by}` : "";
    const remix = h("button", { type: "button", class: "eu-btn", onclick: () => {
      const add = pl.items.filter(([a, k]) => !has(a, k)).slice(0, MAX - mine.items.length);
      mine.items.push(...add.map((x) => [...x])); if (!mine.from) mine.from = pl.t; save(); open(true);
      status.textContent = `Added ${add.length} card${add.length === 1 ? "" : "s"} to your playlist. Reorder, add notes, then share your remix.`;
    } }, "Remix into my playlist");
    const copy = h("button", { type: "button", class: "eu-btn ghost", onclick: async () => { try { await navigator.clipboard.writeText(linkFor(pl)); copy.textContent = "Copied ✓"; } catch { copy.textContent = "Copy failed"; } } }, "Copy link");
    const close = h("button", { type: "button", class: "eu-btn ghost", onclick: () => { stop(); sec.hidden = true; sec.replaceChildren(); if (location.hash.startsWith("#pl=")) history.replaceState(null, "", location.pathname); } }, "Close");
    sec.replaceChildren(
      h("div", { class: "sechead" }, h("div", {}, h("span", { class: "kicker" }, own ? "Your playlist · preview" : "Shared playlist"), h("h2", {}, pl.t), h("p", { class: "dim" }, `${pl.items.length} card${pl.items.length === 1 ? "" : "s"}${by}${pl.from ? ` · remixed from “${pl.from}”` : ""}${pl.dropped ? ` · ${pl.dropped} unknown card${pl.dropped === 1 ? "" : "s"} skipped` : ""}. Every card is live: play it, hold it, drag it.`))),
      h("div", { class: "pl-row" }, playBtn, ...(own ? [] : [remix]), copy, close),
      pl.items.length ? h("div", { class: "pl-grid" }, ...cards.map((x) => x.cell)) : h("p", { class: "dim" }, "This playlist is empty."));
    sec.hidden = false;
    cards.forEach(({ c }) => { c.el.addEventListener("click", () => setSpec?.(c.spec), { capture: true }); quiet(c.play(new Run())); });
    requestAnimationFrame(() => sec.scrollIntoView({ behavior: "smooth", block: "start" }));
    window.__playlist.shown = { pl, cards: cards.map((x) => x.c) };
  }

  function fromHash() {
    const raw = new URLSearchParams(location.hash.slice(1)).get("pl");
    if (!raw) return;
    try { const pl = decode(raw, ctx); if (pl.th && pl.th !== T.base.id) setTheme(pl.th); show(pl); }
    catch { toast("That playlist link is damaged. Nothing was loaded."); }
  }
  let toastEl = null, toastT = 0;
  function toast(msg) { toastEl?.remove(); toastEl = h("div", { class: "pl-toast", role: "status" }, msg); document.body.append(toastEl); clearTimeout(toastT); toastT = setTimeout(() => toastEl?.remove(), 2600); }

  window.addEventListener("hashchange", fromHash);
  window.__playlist = { get mine() { return mine; }, toggle, show, open, encode, decode: (s) => decode(s, ctx), linkFor, shown: null };
  refresh(); fromHash();
}
