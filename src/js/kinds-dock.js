import { h } from './motion.js';
import { shell, holdButton } from './shell.js';
import { tell } from './loop.js';

// Work dock: what is blocked, what is next, and what is running (bots and their subagents), in one card
// that pins to the input bar as a bubble. Feed shape (v0) is what the private prototype's /api/work
// serves: { at, approvals:[{id, source, owner, title, why, options[], rec}], lanes:[{lane, asOf, blockers[], todos[]}],
// bots:[{profile, title, lastActivityAt}], subagents:[{profile, id, state, startedAt, endedAt, goal}], errors:{…} }.
// Approvals come ranked by leverage (the feed's order); the card shows at most 5. A decision is an
// eui:intent (approve | pick | defer) and, when the host passes opts.onDecide(item, action, choice),
// a write-back whose result ({ ok, ref }) is shown on the row. The public site only ever
// renders the synthetic fixture below.
const T0 = Date.UTC(2026, 10, 5, 10, 0);
export const DOCK_FIXTURE = {
  v: 0, at: T0, synthetic: true,
  approvals: [
    { id: 'A02', source: 'board', owner: 'alpha', title: 'Public push needs owner sign-off', why: 'The leak scan found 3 internal hostnames in docs. Options: scrub then land (recommended), or land as-is.', options: ['Scrub, then land', 'Land as-is'], rec: 'Scrub, then land' },
    { id: 'G07', source: 'board', owner: 'gamma', title: 'Free disk on the build host', why: 'Stages are held at 91% full. Deleting the unused 40 GB model cache gets it under 85%.', options: ['Delete the model cache'], rec: 'Delete the model cache' }
  ],
  lanes: [
    { lane: 'alpha', asOf: '04:00 CST', blockers: ['A02: blocked on owner sign-off for the public push'], todos: ['A05: not started, needs the A02 decision'] },
    { lane: 'beta', asOf: '03:40 CST', blockers: [], todos: ['B11: queued after B10'] },
    { lane: 'gamma', asOf: '03:55 CST', blockers: ['Disk pressure on build host; stages held'], todos: [] }
  ],
  bots: [
    { profile: 'alpha', title: 'Bot Chat', lastActivityAt: T0 - 60e3 },
    { profile: 'beta', title: 'Bot Chat', lastActivityAt: T0 - 4 * 60e3 },
    { profile: 'gamma', title: 'Bot Chat', lastActivityAt: T0 - 50 * 60e3 }
  ],
  subagents: [
    { profile: 'alpha', id: 'deleg_a1', state: 'running', startedAt: T0 - 9 * 60e3, goal: 'Review the staged diff and report findings' },
    { profile: 'alpha', id: 'deleg_a2', state: 'completed', startedAt: T0 - 50 * 60e3, endedAt: T0 - 20 * 60e3, goal: 'Collect test receipts' }
  ],
  errors: {}
};

const ago = (now, t) => { if (!t) return ''; const m = Math.max(0, Math.round((now - t) / 60e3)); return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
const RUNNING = (s) => !['completed', 'error', 'unknown', 'cancelled'].includes(s.state);
const ACTIVE_MS = 30 * 60e3;

/** Pure: turn a feed into the three groups the card renders. */
export function digest(feed) {
  const now = feed.at || Date.now();
  const blockers = [], todos = [];
  for (const l of feed.lanes || []) {
    for (const t of l.blockers || []) blockers.push({ owner: l.lane, text: t, asOf: l.asOf });
    for (const t of l.todos || []) todos.push({ owner: l.lane, text: t, asOf: l.asOf });
  }
  const subs = (feed.subagents || []).filter((s) => RUNNING(s) || (s.endedAt && now - s.endedAt < ACTIVE_MS));
  const byProfile = new Map();
  for (const b of feed.bots || []) {
    const cur = byProfile.get(b.profile);
    if (!cur || (b.lastActivityAt || 0) > (cur.lastActivityAt || 0)) byProfile.set(b.profile, { ...b, subagents: [] });
  }
  for (const s of subs) { if (!byProfile.has(s.profile)) byProfile.set(s.profile, { profile: s.profile, title: null, lastActivityAt: s.startedAt, subagents: [] }); byProfile.get(s.profile).subagents.push(s); }
  const running = [...byProfile.values()]
    .map((b) => ({ ...b, live: now - (b.lastActivityAt || 0) < ACTIVE_MS || b.subagents.some(RUNNING) }))
    .sort((a, b) => (b.live - a.live) || ((b.lastActivityAt || 0) - (a.lastActivityAt || 0)));
  return { now, approvals: (feed.approvals || []).slice(0, 5), blockers, todos, running, live: running.filter((r) => r.live).length, subRunning: subs.filter(RUNNING).length };
}

export function workDockMake(app, rng, opts = {}) {
  let feed = opts.feed && typeof opts.feed === 'object' ? opts.feed : DOCK_FIXTURE, d = digest(feed), pinned = false, open = false, err = null;
  const src = typeof opts.feed === 'string' ? opts.feed : null;
  const spec = { kind: 'work-dock', app: app.id, provenance: src ? 'live-feed' : 'synthetic-fixture', actions: 'intent-only' };
  const disc = h('p', { class: 'wd-disc' });
  const counts = h('div', { class: 'wd-counts', role: 'group', 'aria-label': 'Jump to group' });
  const groups = h('div', { class: 'wd-groups' });
  const pinBtn = h('button', { type: 'button', class: 'eu-btn primary wd-pinbtn', 'aria-pressed': 'false' }, 'Pin to input bar');
  const body = h('div', { class: 'wd-root' }, disc, counts, groups);
  const card = shell(app, 'work-dock', { verb: 'What is blocked, next and running', status: src ? 'Live' : 'Example', body, foot: [pinBtn], summary: 'Work dock' });
  const bubble = h('button', { type: 'button', class: 'wd-bubble', 'aria-expanded': 'false', 'aria-label': 'Work dock' });
  const slot = document.createComment('work-dock');
  let bar = null;

  const pill = (cls, n, label, target) => h('button', { type: 'button', class: `wd-pill ${cls}`, onclick: () => { const g = groups.querySelector(`[data-g=${target}]`); if (g) { g.open = true; g.scrollIntoView?.({ block: 'nearest' }); } } }, h('b', {}, String(n)), ` ${label}`);
  const hhmm = (a) => (a || '').match(/\d{1,2}:\d{2}/)?.[0] || '';
  function row(item, cls) {
    const li = h('li', { class: `wd-row ${cls}`, tabindex: '0', role: 'button', 'aria-expanded': 'false' }, h('span', { class: 'wd-txt' }, item.text));
    li.onclick = () => { const v = li.classList.toggle('wd-full'); li.setAttribute('aria-expanded', String(v)); };
    return li;
  }
  // One block per lane (newest status file first): lane + as-of time, its first 2 items, then "+N more".
  function byLane(items, cls) {
    const m = new Map();
    for (const x of items) (m.get(x.owner) || m.set(x.owner, []).get(x.owner)).push(x);
    return [...m.entries()].sort((a, b) => hhmm(b[1][0].asOf).localeCompare(hhmm(a[1][0].asOf))).map(([lane, xs]) => {
      const list = h('ul', { class: 'wd-items' }, ...xs.slice(0, 2).map((x) => row(x, cls)));
      const lb = h('li', { class: 'wd-lane' }, h('div', { class: 'wd-lh' }, h('b', { class: 'wd-own' }, lane), h('span', { class: 'wd-n' }, String(xs.length)), h('span', { class: 'wd-age' }, hhmm(xs[0].asOf) ? `as of ${hhmm(xs[0].asOf)}` : '')), list);
      if (xs.length > 2) { const more = h('button', { type: 'button', class: 'wd-more' }, `+${xs.length - 2} more`); more.onclick = () => { list.append(...xs.slice(2).map((x) => row(x, cls))); more.remove(); }; lb.append(more); }
      return lb;
    });
  }
  function botRow(b) {
    const subs = b.subagents.map((s) => h('li', { class: `wd-sub ${RUNNING(s) ? 'run' : 'done'}` }, h('span', { class: 'wd-dot', 'aria-hidden': 'true' }), h('span', { class: 'wd-txt' }, `${RUNNING(s) ? 'subagent' : 'subagent finished'} · ${s.goal || s.id}`), h('span', { class: 'wd-age' }, RUNNING(s) ? ago(d.now, s.startedAt) : `${ago(d.now, s.endedAt)} ago`)));
    return h('li', { class: `wd-bot ${b.live ? 'live' : 'idle'}` },
      h('div', { class: 'wd-bh' }, h('span', { class: 'wd-dot', 'aria-hidden': 'true' }), h('b', {}, b.profile), h('span', { class: 'wd-txt' }, b.title && b.title !== 'Bot Chat' ? b.title : b.live ? 'working' : 'idle'), h('span', { class: 'wd-age' }, ago(d.now, b.lastActivityAt))),
      subs.length ? h('ul', { class: 'wd-subs', 'aria-label': `${b.profile} subagents` }, ...subs) : '');
  }
  // id -> { state: 'sending' | 'ok' | 'bad', text } so a re-render keeps the outcome until the source drops the item.
  const sent = new Map();
  async function decide(item, action, choice, row) {
    const label = action === 'defer' ? `Defer ${item.id}` : `${item.id}: ${choice}`;
    tell(card, { action, label, entities: { task: item.id, source: item.source, choice: choice || null }, text: label, quiet: true });
    sent.set(item.id, { state: 'sending', text: 'Sending…' }); render();
    try { const r = opts.onDecide ? await opts.onDecide(item, action, choice) : { ok: true, ref: 'intent only' }; sent.set(item.id, r && r.ok ? { state: 'ok', text: `${action === 'defer' ? 'Deferred' : 'Sent'} ✓ ${r.ref || ''}`.trim() } : { state: 'bad', text: `Failed: ${(r && r.error) || 'no answer'}` }); }
    catch (e) { sent.set(item.id, { state: 'bad', text: `Failed: ${String(e.message || e).slice(0, 60)}` }); }
    render();
  }
  function apRow(item) {
    const s = sent.get(item.id), opts2 = (item.options || []).filter((o) => o !== item.rec);
    const li = h('li', { class: `wd-ap${s ? ` s-${s.state}` : ''}`, 'data-id': item.id },
      h('div', { class: 'wd-lh' }, h('b', { class: 'wd-own' }, item.id), h('span', { class: 'wd-txt wd-apt' }, item.title || ''), h('span', { class: 'wd-age' }, item.owner || '')),
      item.why ? h('p', { class: 'wd-why', tabindex: '0', onclick: (e) => e.currentTarget.classList.toggle('wd-full') }, item.why) : '',
      h('p', { class: 'wd-rec' }, h('span', {}, 'Recommended'), ` ${item.rec || 'approve'}`));
    if (s && s.state !== 'bad') { li.append(h('p', { class: `wd-res ${s.state}`, role: 'status' }, s.text)); return li; }
    const go = holdButton(item.rec && item.rec !== 'Approve' ? `Hold: ${item.rec}` : 'Hold to approve', () => decide(item, 'approve', item.rec || 'approve'), { cls: 'sm' });
    const picks = opts2.map((o) => h('button', { type: 'button', class: 'eu-btn sm wd-pick', onclick: () => decide(item, 'pick', o) }, o));
    li.append(h('div', { class: 'wd-acts' }, go, ...picks, h('button', { type: 'button', class: 'eu-btn sm ghost', onclick: () => decide(item, 'defer') }, 'Defer')));
    if (s) li.append(h('p', { class: 'wd-res bad', role: 'status' }, s.text));
    return li;
  }
  let was = {};
  const group = (id, title, n, items, empty, openByDefault) => h('details', { class: `wd-g g-${id}`, 'data-g': id, open: (was[id] ?? openByDefault) || null },
    h('summary', {}, h('span', {}, title), h('b', {}, String(n))), items.length ? h('ul', {}, ...items) : h('p', { class: 'wd-none' }, empty));

  function render() {
    d = digest(feed);
    disc.textContent = err ? `FEED UNAVAILABLE · ${err} · showing last data` : src ? `LIVE · lane status + z0bridge sessions + subagents · ${new Date(d.now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'SYNTHETIC EXAMPLE · no feed connected';
    disc.className = `wd-disc${err ? ' bad' : src ? ' live' : ''}`;
    counts.replaceChildren(pill('a', d.approvals.length, 'need you', 'approvals'), pill('b', d.blockers.length, 'blocked', 'blockers'), pill('t', d.todos.length, 'to do', 'todos'), pill('r', d.live, `running${d.subRunning ? ` · ${d.subRunning} sub` : ''}`, 'running'));
    was = Object.fromEntries([...groups.querySelectorAll('details')].map((g) => [g.dataset.g, g.open]));
    const missing = Object.entries(feed.errors || {}).filter(([, v]) => v).map(([k]) => k);
    groups.replaceChildren(
      group('approvals', 'Needs you', d.approvals.length, [...d.approvals.map(apRow), ...(d.approvals.length && opts.onDecide ? [h('li', { class: 'wd-gap' }, opts.decideNote || 'Your answer is written back to its source.')] : [])], 'Nothing waiting on you.', true),
      group('blockers', 'Blockers', d.blockers.length, byLane(d.blockers, 'b'), 'Nothing blocked.', true),
      group('todos', 'To do', d.todos.length, byLane(d.todos, 't'), 'No queued items.', true),
      group('running', 'In progress', `${d.live} live`, d.running.map(botRow), 'No bots or subagents active.', true),
      missing.length ? h('p', { class: 'wd-gap' }, `Not available: ${missing.join(', ')}`) : '');
    bubble.replaceChildren(h('span', { class: 'wd-bb a' }, String(d.approvals.length)), h('span', { class: 'wd-bb b' }, String(d.blockers.length)), h('span', { class: 'wd-bb t' }, String(d.todos.length)), h('span', { class: 'wd-bb r' }, String(d.live)));
    bubble.setAttribute('aria-label', `Work dock: ${d.approvals.length} need you, ${d.blockers.length} blocked, ${d.todos.length} to do, ${d.live} running. ${open ? 'Collapse' : 'Expand'}`);
    card.summary = `Work dock · ${d.approvals.length} need you · ${d.blockers.length} blocked · ${d.todos.length} to do · ${d.live} running`;
  }
  function setOpen(v) { open = v; card.classList.toggle('wd-open', v); bubble.setAttribute('aria-expanded', String(v)); render(); }
  function pin(v, via = 'button') {
    if (v === pinned) return;
    // Pinning to the bar also keeps the card (shell's TTL ring), so it never dissolves while docked.
    const ring = card.querySelector('.eu-ttl'); if (ring && ring.getAttribute('aria-pressed') !== String(v)) ring.click();
    pinned = v; pinBtn.setAttribute('aria-pressed', String(v)); pinBtn.textContent = v ? 'Unpin' : 'Pin to input bar';
    if (v) {
      bar = (opts.bar && document.querySelector(opts.bar)) || document.body;
      card.replaceWith(slot);
      const dock = h('div', { class: 'wd-dock' }, card, bubble);
      bar.prepend(dock); card.classList.add('wd-pinned'); setOpen(false);
    } else {
      const dock = card.parentElement; slot.replaceWith(card); dock?.remove(); card.classList.remove('wd-pinned', 'wd-open'); open = false;
    }
    tell(card, { action: v ? 'pin_to_bar' : 'unpin_from_bar', label: v ? 'Pin the work dock to the input bar' : 'Unpin the work dock', entities: { via }, text: card.summary, quiet: true });
  }
  pinBtn.onclick = () => pin(!pinned);
  bubble.onclick = () => setOpen(!open);
  // Long-press the header to pin (mobile): 500 ms without moving more than 10 px.
  let lp = null, x0 = 0, y0 = 0;
  const head = card.querySelector('.eu-h');
  head.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; clearTimeout(lp); lp = setTimeout(() => { lp = null; pin(!pinned, 'long-press'); navigator.vibrate?.(12); }, 500); });
  const cancel = (e) => { if (lp && (!e || e.type !== 'pointermove' || Math.hypot(e.clientX - x0, e.clientY - y0) > 10)) { clearTimeout(lp); lp = null; } };
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'pointermove']) head.addEventListener(ev, cancel);
  head.addEventListener('contextmenu', (e) => e.preventDefault());

  // Re-render only on a real change (or once a minute for the ages), and never under a finger that is
  // holding a button: rebuilding the row would cancel the hold.
  let lastKey = '', lastAt = 0;
  async function poll() {
    let key = lastKey;
    try { const r = await fetch(src, { cache: 'no-store' }); if (!r.ok) throw Error(`HTTP ${r.status}`); const f = await r.json(); key = JSON.stringify({ ...f, at: 0 }); feed = f; err = null; }
    catch (e) { err = String(e.message || e).slice(0, 60); key = 'err:' + err; }
    if (card.querySelector('.holding') || (key === lastKey && Date.now() - lastAt < 60e3)) return;
    lastKey = key; lastAt = Date.now(); render();
  }
  render();
  let timer = null;
  if (src) { poll(); timer = setInterval(poll, opts.everyMs || 20000); }
  return { el: card, spec, play: async () => {}, pin, setFeed(f) { feed = f; err = null; render(); }, stop() { clearInterval(timer); } };
}
export const KINDS_DOCK = { 'work-dock': { label: 'Work dock', verb: () => 'What is blocked, next and running', make: workDockMake } };
