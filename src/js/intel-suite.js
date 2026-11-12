// intel-suite renders validated intel.v0 snapshots. Only demo:true uses the fixture.
import { h } from './motion.js';
import { shell, svg } from './shell.js';
import { updated } from './kinds-fleet.js';
import { INTEL_DEMO } from './intel-data.js';
import { validateIntel, INTEL_ACTIONS } from './intel-schema.js';
export { INTEL_ACTIONS };
export const INTEL_APPS = { 'intel-suite': 'glide' };
const TABS = ['Hill climbs', 'Skill router', 'Memory', 'Failures', 'Trace'];
const SOURCES = ['climbs', 'routes', 'memory', 'failures', 'trace'];
const NOTE_MATCH = [/climb|hill/i, /route|routing|skill|correction/i, /memory|\bL[0-5]\b/i, /failure|recurring|ledger|law/i, /trace|\bomp\b|event|timestamp/i];
const text = (tag, value, cls = '') => h(tag, { class: cls, title: String(value) }, String(value));
const fmt = value => Number(value.toPrecision(4)).toLocaleString();
const stat = (label, value) => h('div', { class: 'is-stat' }, text('span', label, 'is-k'), text('b', value, 'is-value'));

function make(a, _r, input, opts = {}) {
  const isDoc = input && (Object.hasOwn(input, 'data') || Object.hasOwn(input, 'demo') || Object.hasOwn(input, 'kind'));
  const demo = (isDoc ? input.demo : opts.demo) === true;
  let data = isDoc ? input.data : input;
  if (data === undefined && demo) data = { ...structuredClone(INTEL_DEMO), at: new Date().toISOString(), tab: opts.tab ?? INTEL_DEMO.tab };
  const result = validateIntel(data);
  const wrap = (body, status) => {
    const el = shell(a, 'intel-suite', { verb: 'Intelligence', status, body, summary: 'Glide · intelligence suite' });
    el.querySelector('.eu-ttl')?.remove();
    return el;
  };
  if (!result.ok) {
    const reason = data === undefined ? 'No data supplied.' : result.errors.join('; ');
    const body = h('div', { class: 'fl-root is-root is-unavailable', role: 'status' }, h('h3', {}, 'Intel data unavailable'), h('p', {}, reason), h('p', {}, 'Run /intel in glide.'));
    return { el: wrap(body, 'Unavailable'), spec: { kind: 'intel-suite', app: a.id, actions: INTEL_ACTIONS, unavailable: reason }, async play() {} };
  }

  let tab = data.tab ?? 0;
  const receipt = h('p', { class: 'is-receipt', role: 'status', 'aria-live': 'polite' });
  const emit = (action, label, entities) => {
    receipt.textContent = `${label} requested.`;
    el.dispatchEvent(new CustomEvent('eui:intent', { bubbles: true, detail: { v: 0, kind: 'intel-suite', app: a.id, action, label, ids: ['card:intel-suite'], entities, at: Date.now() } }));
  };
  const button = (label, action, entities, cls = '') => h('button', { type: 'button', class: `is-act ${cls}`, title: label, onclick: () => emit(action, label, entities) }, label);
  const hero = (label, ...kids) => h('div', { class: 'is-hero' }, text('h4', label, 'is-q'), ...kids);
  const side = (...kids) => h('aside', { class: 'is-side' }, ...kids);
  const big = (value, label) => h('div', { class: 'is-big' }, text('b', value), text('small', label));
  const pane = (source, ...kids) => h('div', { class: `is-pane is-${source}` }, ...kids);

  function climbs() {
    const first = data.climbs[0], points = first.points;
    const chart = points.length ? climbChart(first) : h('p', {}, 'No iteration points reported.');
    const delta = points.length ? first.best - points[0] : null;
    return pane('climbs', hero(first.label, chart, text('p', first.metric + (first.unit ? ` · ${first.unit}` : ''), 'is-detail'),
      h('p', { class: 'is-legend' }, text('span', 'kept', 'is-lk'), text('span', 'reverted', 'is-lr'))),
    side(big(fmt(first.best), `best${first.unit ? ` · ${first.unit}` : ''}`), h('div', { class: 'is-stats' }, stat('Iterations', points.length), stat('Since baseline', delta === null ? 'Unknown' : `${delta >= 0 ? '+' : ''}${fmt(delta)}`)),
      ...data.climbs.map(c => button(`Open ${c.label}`, 'open-climb', { id: c.id }))));
  }

  function climbChart(c) {
    const W = 640, H = 250, P = 36;
    const min = Math.min(...c.points), max = Math.max(...c.points), pad = (max - min || Math.abs(max) || 1) * 0.15;
    const lo = min - pad, hi = max + pad;
    const x = i => P + i * (W - P * 2) / Math.max(1, c.points.length - 1);
    const y = v => H - P - (v - lo) / (hi - lo) * (H - P * 2);
    let best = -Infinity, d = '';
    const dots = c.points.map((v, i) => {
      const kept = v > best;
      if (kept) { d += `${d ? `L${x(i)},${y(best)} L` : 'M'}${x(i)},${y(v)} `; best = v; }
      return svg('circle', { cx: x(i), cy: y(v), r: kept ? 5 : 4, class: kept ? 'is-kept' : 'is-rev' }, svg('title', {}, `Iteration ${i + 1}: ${fmt(v)}`));
    });
    d += `L${x(c.points.length - 1)},${y(best)}`;
    const grid = Array.from({ length: 4 }, (_, i) => {
      const v = min + (max - min) * i / 3;
      return svg('g', {}, svg('line', { x1: P, x2: W - P, y1: y(v), y2: y(v), class: 'is-grid' }), svg('text', { x: 0, y: y(v) - 5, class: 'is-ax' }, fmt(v)));
    });
    return svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'is-chart', role: 'img', 'aria-label': `${c.label}: ${c.metric}, best ${c.best}` },
      svg('title', {}, `${c.label}: ${c.metric}`), ...grid,
      svg('path', { d: `${d} L${x(c.points.length - 1)},${H - P} L${x(0)},${H - P} Z`, class: 'is-area' }),
      svg('path', { d, class: 'is-step' }), ...dots);
  }

  function routes() {
    const total = data.routes.reduce((n, r) => n + r.hits, 0), corrections = data.routes.reduce((n, r) => n + r.corrected, 0);
    const max = Math.max(1, ...data.routes.map(r => r.hits));
    return pane('routes', hero('Which skills handled the asks?', h('div', { class: 'is-routes-list' }, ...data.routes.map(r => h('div', { class: 'is-route' },
      button(r.skill, 'open-skill', { skill: r.skill }, 'is-skill'),
      text('span', `${r.hits} hits · ${r.corrected} corrected`, 'is-route-count'),
      h('div', { class: 'is-bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${r.hits / max * 100}%` } })))))),
    side(big(fmt(total), 'skill loads'), h('div', { class: 'is-stats' }, stat('Skills', data.routes.length), stat('Owner corrections', corrections)),
      h('p', { class: 'is-detail' }, 'Corrections count owner feedback after loading a skill, not a measured routing accuracy.')));
  }

  function memory() {
    const stale = data.memory.filter(l => l.stale).length;
    return pane('memory', hero('What does it know, and how fresh is it?', h('div', { class: 'is-stack' }, ...data.memory.map((l, i) => h('div', {
      class: `is-layer ${l.stale ? 'is-stale' : ''}`, style: { '--layer-width': `${Math.min(100, 65 + i * 7)}%` }
    }, text('b', l.level), text('span', l.name, 'is-ln'), text('span', l.size, 'is-lc'), text('span', l.fresh, 'is-fresh')))),
    h('p', { class: 'is-detail' }, 'Memory supplies evidence, never authority.')),
    side(big(data.memory.length, 'memory layers'), h('div', { class: 'is-stats' }, stat('Fresh', data.memory.length - stale), stat('Stale', stale)),
      h('p', { class: 'is-tag' }, 'evidence ≠ claim ≠ state')));
  }

  function failures() {
    return pane('failures', hero('What keeps breaking?', h('div', { class: 'is-flist' }, ...data.failures.map(f => h('div', { class: 'is-frow' },
      h('div', { class: 'is-fw' }, text('b', f.sig), text('small', f.source)),
      h('div', { class: 'is-strip', title: `${f.spark.length} observations: ${f.spark}`, 'aria-label': `${f.spark.length} observations: ${f.spark}` }, ...[...f.spark].map(c => h('i', { class: c === '1' ? 'on' : '' }))),
      text('span', `${f.count}×`, 'is-fn'), text('span', f.status, `is-badge is-${f.status}`),
      button('Open failure', 'open-failure', { sig: f.sig }))))),
    side(big(data.failures.length, 'recurring signatures'), h('div', { class: 'is-stats' }, ...['open', 'fixed', 'law'].map(s => stat(s, data.failures.filter(f => f.status === s).length)))));
  }

  function trace() {
    const end = data.trace.reduce((max, t) => t.spans.reduce((m, s) => Math.max(m, s[1]), max), 0);
    const spans = data.trace.flatMap(t => t.spans);
    const labels = { m: 'model', t: 'tool', e: 'error' };
    return pane('trace', hero('Where did the time go?', h('div', { class: 'is-tracks' }, ...data.trace.map(t => h('div', { class: 'is-track' },
      text('span', t.lane, 'is-track-label'), h('div', { class: 'is-timeline' }, ...t.spans.map(([s, e, k]) => h('span', {
        class: `is-span is-${k}`, style: { left: `${s / (end || 1) * 100}%`, width: `${(e - s) / (end || 1) * 100}%` },
        title: `${t.lane}: ${labels[k]} · ${fmt(s)}–${fmt(e)} min`, 'aria-label': `${labels[k]} from ${s} to ${e} minutes`
      }))))), h('div', { class: 'is-axis' }, text('span', '0 min'), text('span', `${fmt(end)} min`))),
      h('p', { class: 'is-legend' }, ...Object.entries(labels).map(([k, label]) => text('span', label, `is-l${k}`)))),
    side(big(`${fmt(end)} min`, 'since first event'), h('div', { class: 'is-stats' }, stat('Tracks', data.trace.length), stat('Spans', spans.length), stat('Tool spans', spans.filter(s => s[2] === 't').length), stat('Error spans', spans.filter(s => s[2] === 'e').length))));
  }

  const panes = [climbs, routes, memory, failures, trace];
  const seg = h('div', { class: 'is-seg', role: 'tablist', 'aria-label': 'Intelligence views' }, ...TABS.map((label, i) => h('button', {
    type: 'button', role: 'tab', class: 'is-segb', title: label, 'aria-selected': String(i === tab), onclick: () => setTab(i, true)
  }, label)));
  const stage = h('div', { class: 'is-stage', role: 'tabpanel', 'aria-label': TABS[tab] });
  const body = h('div', { class: 'fl-root is-root' },
    h('div', { class: 'is-head' }, h('div', { class: 'is-heading' }, text('span', `Glide · personal intelligence${demo ? ' · example data' : ''}`, 'is-eyebrow'), h('h3', { class: 'is-title' }, 'It already knows you.')),
      button('Refresh', 'refresh', {})),
    h('time', { class: 'fl-updated', datetime: data.at, title: data.at }, `${demo ? 'Example · ' : ''}${updated(data.at)}`), seg, stage,
    data.notes.length ? h('details', { class: 'is-notes' }, h('summary', {}, 'Source notes'), h('ul', {}, ...data.notes.map(n => h('li', {}, n)))) : null,
    receipt);
  function setTab(i, user = false) {
    if (!Number.isInteger(i) || i < 0 || i > 4) return;
    tab = i;
    seg.querySelectorAll('.is-segb').forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    stage.setAttribute('aria-label', TABS[i]);
    if (!data[SOURCES[i]].length) {
      const notes = data.notes.filter(n => NOTE_MATCH[i].test(n));
      stage.replaceChildren(h('div', { class: 'is-hero is-tab-unavailable', role: 'status' }, h('h4', {}, `${TABS[i]} unavailable`),
        ...notes.map(n => h('p', {}, n)), h('p', {}, `No ${SOURCES[i]} data. Run /intel in glide.`)));
    } else stage.replaceChildren(panes[i]());
    receipt.textContent = '';
    if (user) emit('tab', `Open ${TABS[i]}`, { tab: i });
  }
  setTab(tab);
  const el = wrap(body, demo ? 'Example' : 'Snapshot');
  return { el, spec: { kind: 'intel-suite', app: a.id, provenance: demo ? 'authored-example' : 'card-data', actions: INTEL_ACTIONS, tabs: TABS }, setTab, async play() {} };
}
export const KINDS_INTEL = { 'intel-suite': { label: 'Intelligence', make } };
