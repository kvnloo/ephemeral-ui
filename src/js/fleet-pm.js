import { h } from './motion.js';
import { shell } from './shell.js';
const STATUS = { done: 'Done', active: 'Working', next: 'Next', blocked: 'Blocked' };
const HZ = { now: 'Now', next: 'Next', later: 'Later' };
const HUES = ['var(--fl-gold)', 'var(--fl-ok)', 'var(--h-primary)', 'var(--fl-warn)'];
export function model(key, portfolios) {
  const pf = portfolios[key];
  const products = pf.products.map((p, i) => ({ ...p, hue: HUES[i % HUES.length] }));
  const features = products.flatMap(product => product.features.map(f => ({ ...f, product })));
  const tasks = features.flatMap(feature => feature.tasks.map(t => ({ ...t, feature, product: feature.product })));
  return { key, pf, products, features, tasks, queue: tasks.filter(t => t.status === 'next') };
}
function make(a, r, data) {
  const kind = 'fleet-portfolio', portfolios = data.portfolios;
  let key = Object.keys(portfolios)[0], view = 'tree';
  const root = h('div', { class: 'fl-root fp-root' }), head = h('div', { class: 'fp-head' }), stage = h('div', { class: 'fp-stage' });
  const next = h('div', { class: 'fp-next' });
  const receipt = h('p', { class: 'fp-receipt', role: 'status', 'aria-live': 'polite' });
  const action = (id, label, t, reason = '') => h('button', {
    class: 'fp-btn', type: 'button', title: reason || `${label}: ${t.label}`, disabled: reason ? true : null,
    onclick: () => {
      const entities = { product: t.product.id, feature: t.feature.id, task: t.id, ...(id === 'open-task' && t.url ? { url: t.url } : {}) };
      root.dispatchEvent(new CustomEvent('eui:intent', { bubbles: true, detail: { v: 0, kind, app: a.id, action: id, entities, at: Date.now() } }));
      receipt.textContent = `${label} requested for ${t.label}. Awaiting glide.`;
    }
  }, reason ? `${label} unavailable: ${reason}` : label);
  const task = t => h('div', { class: 'fp-task', 'data-task': t.id }, h('span', { class: `fp-dot ${t.status}` }),
    h('span', { class: 'fp-task-l', title: t.label }, t.label, t.defect ? ' · defect' : ''), h('span', { class: `fp-st ${t.status}` }, STATUS[t.status]),
    h('div', { class: 'fp-d-acts' }, action('open-task', 'Open task', t), action('set-next', 'Set next', t, t.status === 'done' ? 'Task done' : t.status === 'blocked' ? 'Task blocked' : '')));
  const select = h('select', { 'aria-label': 'Portfolio', onchange: e => { key = e.target.value; render(); } },
    ...Object.entries(portfolios).map(([id, p]) => h('option', { value: id }, p.label)));
  const views = h('select', { 'aria-label': 'Portfolio view', onchange: e => show(e.target.value) },
    ...[['tree', 'Tree'], ['roadmap', 'Now · Next · Later'], ['links', 'Shared links']].map(([id, label]) => h('option', { value: id }, label)));
  root.append(head, h('div', { class: 'fl-controls' }, select, views), next, stage, receipt);
  function render() {
    if (!key) { head.replaceChildren(h('p', {}, 'No portfolios in this snapshot.')); next.hidden = true; stage.replaceChildren(); return; }
    const m = model(key, portfolios);
    head.replaceChildren(h('div', { class: 'fp-title' }, h('h3', { title: m.pf.label }, m.pf.label), h('p', { title: m.pf.lead }, m.pf.lead)),
      h('div', { class: 'fp-stats' }, `${m.products.length} products · ${m.features.length} features · ${m.tasks.length} tasks · ${m.tasks.filter(t => t.status === 'blocked').length} blocked`));
    next.replaceChildren(h('span', { class: 'fp-next-k' }, 'Next step'), m.queue.length ? task(m.queue[0]) : h('span', {}, 'No unblocked next task'));
    const feature = (f, p) => h('section', { class: 'fp-feat' }, h('div', { class: 'fp-frow' },
      h('span', { class: 'fp-rt' }, h('b', { title: f.label }, f.label)), h('span', { class: `fp-hz ${f.horizon}` }, HZ[f.horizon])),
      h('div', { class: 'fp-ftags' }, ...['owns', 'uses'].flatMap(rel => (f[rel] || []).map(id => h('span', { class: `fp-tag ${rel}`, title: id }, `${rel} ${m.pf.shared.find(s => s.id === id)?.label || id}`)))),
      h('div', { class: 'fp-tasks' }, ...m.tasks.filter(t => t.product.id === p.id && t.feature.id === f.id).map(task)));
    if (view === 'tree') stage.replaceChildren(h('div', { class: 'fp-tree' }, ...m.products.map(p => h('details', { class: 'fp-group open', open: true, style: { '--pc': p.hue } },
      h('summary', { class: 'fp-prow' }, h('span', { class: 'fp-rt' }, h('b', { title: p.label }, p.label), h('small', {}, `${p.features.length} features`)), h('span', { class: `fp-hz ${p.horizon}` }, HZ[p.horizon])),
      h('div', { class: 'fp-kids' }, ...p.features.map(f => feature(f, p)))))));
    else if (view === 'roadmap') stage.replaceChildren(h('div', { class: 'fp-lanes' }, ...Object.entries(HZ).map(([hz, label]) => h('section', { class: `fp-lane ${hz}` }, h('header', {}, h('b', {}, label)),
      ...m.features.filter(f => f.horizon === hz).map(f => h('article', { class: 'fp-fcard', style: { '--pc': f.product.hue } }, h('span', { class: 'fp-fc-p' }, f.product.label), feature(f, f.product)))))));
    else stage.replaceChildren(h('div', { class: 'fp-links' }, ...m.pf.shared.map(s => {
      const owner = m.products.find(p => p.id === s.owner);
      return h('article', { class: 'fp-readout' }, h('b', { title: s.label }, s.label), h('span', {}, `Owned by ${owner?.label || s.owner}`),
        ...m.features.filter(f => f.uses?.includes(s.id) || f.owns?.includes(s.id)).map(f => h('p', {}, `${f.product.label} › ${f.label} · ${f.owns?.includes(s.id) ? 'owns' : 'uses'}`)));
    }), m.pf.shared.length ? null : h('p', {}, 'No shared components in this snapshot.')));
  }
  function show(nextView) { view = nextView; views.querySelectorAll('option').forEach(o => o.toggleAttribute('selected', o.value === view)); render(); }
  render();
  return { el: shell(a, kind, { verb: 'Product portfolio', status: 'Snapshot', body: root }), spec: { kind, app: a.id, input: data }, show, async play() {} };
}
export const KINDS_FLEET_PM = { 'fleet-portfolio': { label: 'Product portfolio', make } };
