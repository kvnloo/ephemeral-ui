import { h } from './motion.js';
import { shell } from './shell.js';
const STATES = { working: 'Working', blocked: 'Needs you', idle: 'Idle', offline: 'Offline' };
const dot = state => h('span', { class: `fh-dot fh-${state}`, title: STATES[state] });
const text = (cls, value) => h('span', { class: cls, title: value }, value);
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const agentsOf = host => host.harnesses.flatMap(h => h.agents);
function make(a, r, data) {
  const kind = 'fleet-hosts', hosts = data.hosts;
  let tab = 'agents';
  const view = h('div', { class: 'fh-view' });
  const receipt = h('p', { class: 'fh-toast', role: 'status', 'aria-live': 'polite' });
  const root = h('div', { class: 'fl-root fh-root' });
  const action = (id, label, entities, reason = '') => h('button', {
    type: 'button', class: 'fh-btn', disabled: reason ? true : null, title: reason || label,
    onclick: () => {
      root.dispatchEvent(new CustomEvent('eui:intent', { bubbles: true, detail: { v: 0, kind, app: a.id, action: id, entities, at: Date.now() } }));
      receipt.textContent = `${label} requested. Awaiting glide.`;
    }
  }, reason ? `${label} unavailable: ${reason}` : label);
  const select = h('select', { 'aria-label': 'Hosts view', onchange: e => show(e.target.value) }, ...['agents', 'machines', 'k3s'].map(t => h('option', { value: t }, t === 'k3s' ? 'k3s pods' : t[0].toUpperCase() + t.slice(1))));
  const needs = h('input', { type: 'checkbox', onchange: () => show('agents'), 'aria-label': 'Needs you only' });
  root.append(h('div', { class: 'fh-head' }, h('h3', { class: 'fh-title' }, 'Hosts'), h('span', { class: 'fh-count' }, `${hosts.filter(h => h.online).length}/${hosts.length} online`)),
    h('div', { class: 'fl-controls' }, select, h('label', {}, needs, ' Needs you only')), view, receipt);
  function agents() {
    return h('div', { class: 'fh-tree' }, ...hosts.map(host => {
      const all = agentsOf(host), blocked = all.some(a => a.state === 'blocked');
      if (needs.checked && !blocked) return null;
      return h('details', { open: host.online ? true : null, class: 'fh-host-group' },
        h('summary', { class: 'fh-row fh-l0' }, dot(!host.online ? 'offline' : blocked ? 'blocked' : all.some(a => a.state === 'working') ? 'working' : 'idle'),
          h('div', { class: 'fh-txt' }, text('fh-name fh-host', host.label), text('fh-sub', `${host.role}${host.online ? '' : ' · offline'}`)), h('span', { class: 'fh-mm' }, plural(all.length, 'agent'))),
        ...host.harnesses.map(harness => h('section', { class: 'fh-kids' }, h('h4', { class: 'fh-harness', title: harness.kind }, harness.kind),
          ...harness.agents.filter(ag => !needs.checked || ag.state === 'blocked').map(ag => {
            const reason = !host.online ? 'Host offline' : ag.state === 'offline' ? 'Agent offline' : '';
            return h('details', { class: 'fh-agentwrap' }, h('summary', { class: 'fh-row fh-agent' }, dot(ag.state),
              h('div', { class: 'fh-txt' }, text('fh-name', ag.name), text('fh-line', ag.line)), text('fh-age', ag.age)),
              h('div', { class: 'fh-detail' }, h('p', { title: `${ag.model} · ${ag.state}` }, `${ag.model} · ${STATES[ag.state]}`),
                h('div', { class: 'fh-acts' }, action('open-chat', 'Open chat', { host: host.id, agent: ag.id }, reason), action('nudge', ag.state === 'blocked' ? 'Answer' : 'Nudge', { host: host.id, agent: ag.id }, reason))));
          }))));
    }));
  }
  function machines() {
    return h('div', { class: 'fh-machines' }, ...hosts.map(host => h('article', { class: 'fh-mach' },
      h('div', { class: 'fh-txt' }, text('fh-name fh-host', host.label), text('fh-sub', `${host.role} · ${host.online ? 'online' : 'offline'}`)),
      h('div', { class: 'fh-gauges' }, ...Object.entries(host.gauges).map(([key, n]) => h('div', { class: `fh-g ${n >= 85 ? 'hot' : n >= 70 ? 'warm' : 'ok'}` },
        h('span', { class: 'fh-gk' }, key), h('span', { class: 'fh-bar' }, h('i', { style: { width: `${n ?? 0}%` } })), h('span', { class: 'fh-gv' }, n === null ? '—' : `${n}%`)))))));
  }
  function pods() {
    const cluster = hosts.filter(h => h.k3s);
    return h('div', { class: 'fh-k3s' }, ...cluster.map(host => h('section', { class: 'fh-node' }, h('div', { class: 'fh-nh' }, text('fh-name fh-host', host.label), text('fh-ver', `${host.k3s.node} · ${host.k3s.version}`)),
      ...host.k3s.pods.map(([ns, name, phase, restarts, note]) => h('div', { class: 'fh-podwrap' },
        h('p', { class: 'fh-pod' }, text('fh-pn', `${ns}/${name}`), text('fh-chip', `${phase} · ↻${restarts}`)),
        note ? h('p', { class: 'fh-sub', title: note }, note) : null,
        action('open-pod', `Open ${ns}/${name}`, { host: host.id, ns, name }, host.online ? '' : 'Host offline'))))),
      h('p', { class: 'fh-outside' }, cluster.length ? `Not in cluster: ${hosts.filter(h => !h.k3s).map(h => h.label).join(', ') || 'none'}` : 'No k3s nodes in this snapshot.'));
  }
  function show(next) {
    tab = next;
    select.querySelectorAll('option').forEach(o => o.toggleAttribute('selected', o.value === tab));
    view.replaceChildren(tab === 'machines' ? machines() : tab === 'k3s' ? pods() : agents());
    if (!hosts.length) view.append(h('p', {}, 'No hosts in this snapshot.'));
    view.dataset.tab = tab;
  }
  show(tab);
  const el = shell(a, kind, { verb: 'Hosts & k3s', status: plural(agentsOfCount(hosts), 'agent'), body: root });
  return { el, spec: { kind, app: a.id, input: data }, show, async play() {} };
}
const agentsOfCount = hosts => hosts.reduce((n, h) => n + agentsOf(h).length, 0);
export const KINDS_FLEET_HOSTS = { 'fleet-hosts': { label: 'Hosts & k3s', make } };
