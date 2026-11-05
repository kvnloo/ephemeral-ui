import { h } from './motion.js';
import { shell } from './shell.js';
import { tell } from './loop.js';
import { CUA_SOURCE, CUA_EXAMPLE, RESULT_EXAMPLES, toolsFor, callFor, violations } from './cua-data.js';

// Cua Driver: pick a window, pick an element token from its state, choose the tool, hand the exact call to the agent.
// The card never dispatches. A driver ActionResult can be shown, and only after it passes the contract's invariants.
export function cuaActionMake(app, rng, opts = {}) {
  const fx = opts.fixture || CUA_EXAMPLE;
  let win = fx.windows[0], el = null, tool = null, shown = 'confirmed', live = null;
  const spec = { kind: 'cua-action', app: app.id, source: CUA_SOURCE, provenance: opts.fixture ? 'caller-supplied' : 'synthetic-example', actions: 'intent-only' };
  const wins = h('div', { class: 'cd-wins', role: 'group', 'aria-label': 'Windows (list_windows)' });
  const els = h('div', { class: 'cd-els', 'aria-label': 'Elements (get_window_state)' });
  const tools = h('div', { class: 'cd-tools', role: 'group', 'aria-label': 'Tool' });
  const text = h('input', { type: 'text', class: 'cd-text', placeholder: 'Text to type', 'aria-label': 'Text', hidden: true });
  const call = h('pre', { class: 'cd-call', 'aria-label': 'MCP call' });
  const result = h('section', { class: 'cd-result', 'aria-live': 'polite' });
  const tabs = h('div', { class: 'cd-tabs', role: 'group', 'aria-label': 'Example results' });
  const send = h('button', { type: 'button', class: 'eu-btn primary', disabled: true }, 'Ask agent to run');
  const step = (n, t) => h('p', { class: 'cd-step' }, h('b', {}, n), ' ', t);
  const body = h('div', { class: 'cd-root' },
    h('div', { class: 'cd-hud' }, h('span', { class: 'cd-tag' }, 'CUA DRIVER'), h('span', { class: 'cd-pill' }, `mode ${fx.permission_mode}`), h('span', { class: 'cd-pill' }, 'background')),
    h('p', { class: 'cd-disc' }, opts.fixture ? 'CALLER-SUPPLIED WINDOWS · no driver connected' : 'SYNTHETIC WINDOWS · no driver connected'),
    step('1', 'Window · list_windows'), wins, step('2', 'Element · get_window_state'), els, step('3', 'Tool'), tools, text, call,
    step('4', 'Result · ActionResult contract'), tabs, result);
  const el0 = shell(app, 'cua-action', { verb: 'Drive a window in the background', status: opts.fixture ? 'Snapshot' : 'Example', body, foot: [send], summary: 'No action chosen' });
  const emit = (action, label, extra = {}) => tell(el0, { action, label, entities: { window: String(win.window_id), ...(el ? { element: el.token } : {}) }, text: JSON.stringify({ window: win, element: el, ...extra }), quiet: true });
  function current() { return el && tool ? callFor(win, el, tool, text.value) : null; }
  function renderResult() {
    const r = live || RESULT_EXAMPLES[shown], bad = violations(r);
    result.replaceChildren();
    if (bad.length) { result.className = 'cd-result bad'; result.append(h('p', { class: 'cd-eff' }, 'Rejected · not shown as success'), h('ul', {}, ...bad.map(b => h('li', {}, b)))); return; }
    result.className = `cd-result e-${r.effect}`;
    result.append(h('p', { class: 'cd-eff' }, h('b', {}, r.effect), ` · route ${r.route}${r.delivery ? ` · ${r.delivery.mode}` : ''}`, live ? '' : h('span', { class: 'cd-ex' }, 'EXAMPLE')));
    if (r.summary) result.append(h('p', {}, r.summary));
    for (const e of r.evidence || []) result.append(h('p', { class: 'cd-ev' }, `${e.kind}: ${e.detail || ''}`));
    if (r.error) result.append(h('p', { class: 'cd-err' }, `${r.error.code}${r.error.hint ? ` — ${r.error.hint}` : ''}`));
    if (r.escalation) result.append(h('p', { class: 'cd-esc' }, `escalate → ${r.escalation.target} (${r.escalation.reason})`));
  }
  function render() {
    wins.replaceChildren(...fx.windows.map(w => h('button', { type: 'button', class: 'cd-win', 'aria-pressed': String(w === win), onclick: () => { win = w; el = null; tool = null; emit('select_window', `Window ${w.app} · ${w.title}`); render(); } },
      h('b', {}, w.app), h('span', {}, w.title), h('code', {}, `pid ${w.pid} · wid ${w.window_id}${w.on_screen ? '' : ' · off-screen'}`))));
    const st = fx.state[win.window_id];
    els.replaceChildren(...(st ? st.map(e => h('button', { type: 'button', class: 'cd-el', 'aria-pressed': String(e === el), disabled: !toolsFor(e.role).length, onclick: () => { el = e; tool = toolsFor(e.role)[0]; emit('select_element', `Element ${e.label}`); render(); } },
      h('span', { class: 'r' }, e.role), h('b', {}, e.label), e.value != null ? h('span', { class: 'v' }, `= ${e.value || '""'}`) : '', h('code', {}, e.token))) : [h('p', { class: 'cd-none' }, 'No window state in this example. The agent would call get_window_state first.')]));
    tools.replaceChildren(...(el ? toolsFor(el.role) : []).map(t => h('button', { type: 'button', class: 'cd-tool', 'aria-pressed': String(t === tool), onclick: () => { tool = t; render(); } }, t)));
    text.hidden = !(tool === 'type_text' || tool === 'set_value');
    const c = current();
    call.textContent = c ? JSON.stringify(c, null, 1) : 'Pick a window, then an element.';
    send.disabled = !c; send.textContent = 'Ask agent to run';
    el0.summary = c ? `${c.tool} on ${el.label} in ${win.app}; not dispatched` : 'No action chosen';
    renderResult();
  }
  tabs.append(...Object.keys(RESULT_EXAMPLES).map(k => h('button', { type: 'button', class: 'cd-tab', 'aria-pressed': String(k === shown), onclick: (e) => { shown = k; live = null; for (const b of tabs.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); renderResult(); } }, k)));
  text.addEventListener('input', () => { call.textContent = JSON.stringify(current(), null, 1); });
  send.onclick = () => { const c = current(); if (!c) return; emit('request_cua_action', `Run ${c.tool} via Cua Driver`, { call: c }); send.textContent = 'Request emitted · driver result pending'; };
  render();
  return { el: el0, spec, play: async () => {}, setResult(r) { live = r; tabs.hidden = true; renderResult(); return violations(r); } };
}
export const KINDS_CUA = { 'cua-action': { label: 'Cua Driver action', verb: () => 'Drive a window in the background', make: cuaActionMake } };
